import { db } from "./db";
import { entregarPedido, type ResultadoEntrega } from "./entrega";
import { cifrarCodigo, impressaoCodigo } from "./cripto-esim";
import {
  CMLINK, ativarPacote, comprarPacote, configCmlink, infoEsim, lpaDaResposta, resumoResposta, retentavel,
} from "./cmlink";

// O MOTOR SOB DEMANDA (modo de entrega `operadora_fixo`).
//
// A venda de estoque (modo `estoque`) continua em lib/entrega.ts, intocada.
// Aqui mora o outro caminho: o eSIM nao esta pronto no estoque — existe um
// ICCID virgem no pool da operadora, e o pacote de dados e comprado na hora.
//
// Duas metades, separadas de proposito (SPEC/01 §4: trigger e transacao nunca
// chamam rede):
//
//   iniciarProvisionamento  — SO BANCO. Roda no webhook do pagamento. Trava o
//                             pedido em `em_provisionamento`, segura um ICCID
//                             do pool, cria a `ativacao` em `provisionando` e
//                             poe o evento `operadora.provisionar` no outbox.
//   provisionarPedido       — REDE. Roda na rota interna, chamada pelo worker.
//                             Compra o pacote (idempotente por chave), busca o
//                             QR, cifra, e SO ENTAO marca pedido/ativacao/estoque
//                             como entregues — numa transacao curta, sem rede.
//
// O POOL: linhas de `estoque_esim` com `operadora = 'cmlink'`, `iccid`
// preenchido e `codigo_lpa` VAZIO (''::bytea). Ficam `disponivel` como
// qualquer codigo — a vitrine conta, o checkout reserva, o carrinho abandonado
// devolve — porque, para o cliente, elas SAO vendaveis. O que as distingue e o
// codigo vazio, e por isso lib/entrega.ts recusa entregar linha sem codigo:
// um SKU que mude de modo por engano nao entrega um QR em branco.

export type ResultadoItem = ResultadoEntrega & { provisionando?: boolean };

export async function modoEntregaDaVariante(varianteId: string): Promise<string> {
  const r = await db.query("select modo_entrega::text as modo from variante where id = $1", [varianteId]);
  return String(r.rows[0]?.modo ?? "estoque");
}

// A porta unica: quem confirma pagamento chama isto e nao precisa saber o modo.
export async function entregarItem(pedidoId: string, varianteId: string, itemPedidoId: string): Promise<ResultadoItem> {
  const modo = await modoEntregaDaVariante(varianteId);
  if (modo === "operadora_fixo") return iniciarProvisionamento(pedidoId, varianteId, itemPedidoId);
  if (modo === "operadora_sob_medida") {
    // Nao existe ainda (memoria: modelo de produtos, modo C). Falhar alto e
    // deixar o pedido no alerta "pago sem entrega" e o comportamento certo.
    console.error(`entregarItem: pedido ${pedidoId} em modo ${modo}, sem motor`);
    return { ok: false, motivo: "status_incompativel", status: `modo_${modo}_sem_motor` };
  }
  return entregarPedido(pedidoId, varianteId, itemPedidoId);
}

// ------------------------------------------------------------ metade 1: banco

export async function iniciarProvisionamento(
  pedidoId: string,
  varianteId: string,
  itemPedidoId: string,
): Promise<ResultadoItem> {
  const c = await db.connect();
  try {
    await c.query("begin");

    const trava = await c.query(
      `update pedido set status = 'em_provisionamento'
        where id = $1 and status in ('pago','em_provisionamento') and entregue = false
        returning id`,
      [pedidoId],
    );
    if (trava.rows.length === 0) {
      await c.query("rollback");
      const p = await db.query("select status, entregue from pedido where id = $1", [pedidoId]);
      if (p.rows[0]?.entregue) return { ok: true, jaEntregue: true };
      return { ok: false, motivo: "status_incompativel", status: p.rows[0]?.status };
    }

    // O ICCID: o ja reservado para este pedido no checkout vem primeiro; senao
    // um livre; senao uma reserva vencida de outro pedido. Mesma preferencia de
    // lib/entrega.ts — mas aqui ele fica RESERVADO (sem prazo), nao entregue:
    // entregue e so quando o QR chegar.
    const chip = await c.query(
      `update estoque_esim
          set status = 'reservado', pedido_id = $1, reservado_ate = null
        where id = (select id from estoque_esim
                     where variante_id = $2
                       and operadora = $3
                       and (status = 'disponivel'
                            or (status = 'reservado' and pedido_id = $1)
                            or (status = 'reservado' and reservado_ate is not null
                                and reservado_ate < now()))
                     order by (case when status = 'reservado' and pedido_id = $1 then 0 else 1 end),
                              criado_em
                     for update skip locked limit 1)
        returning id, iccid`,
      [pedidoId, varianteId, CMLINK.codigo],
    );
    if (chip.rows.length === 0) {
      await c.query("rollback");
      return { ok: false, motivo: "sem_estoque" };
    }

    // Uma ativacao por item. Reentrada (webhook reentregue) reencontra a linha.
    const ja = await c.query("select id from ativacao where item_pedido_id = $1 order by criado_em limit 1", [itemPedidoId]);
    let ativacaoId: string;
    if (ja.rows.length > 0) {
      ativacaoId = ja.rows[0].id;
      await c.query(
        `update ativacao set estoque_id = $2, status = 'provisionando'
          where id = $1 and status in ('pendente','provisionando','falhou')`,
        [ativacaoId, chip.rows[0].id],
      );
    } else {
      const atv = await c.query(
        `insert into ativacao (pedido_id, item_pedido_id, estoque_id, status)
         values ($1, $2, $3, 'provisionando') returning id`,
        [pedidoId, itemPedidoId, chip.rows[0].id],
      );
      ativacaoId = atv.rows[0].id;
    }

    // Um evento pendente por pedido basta: a rota e idempotente, mas a fila nao
    // precisa bater duas vezes na operadora por causa de um webhook repetido.
    const pendente = await c.query(
      `select 1 from evento_saida
        where agregado = 'pedido' and agregado_id = $1 and tipo = 'operadora.provisionar'
          and publicado_em is null limit 1`,
      [pedidoId],
    );
    if (pendente.rows.length === 0) {
      await c.query(
        `insert into evento_saida (agregado, agregado_id, tipo, payload)
         values ('pedido', $1, 'operadora.provisionar', $2::jsonb)`,
        [pedidoId, JSON.stringify({ pedido_id: pedidoId, item_pedido_id: itemPedidoId, ativacao_id: ativacaoId })],
      );
    }

    await c.query("commit");
    await c.query("select pg_notify('evento_saida','novo')").catch(() => {});
    return { ok: true, jaEntregue: false, ativacaoId, provisionando: true };
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

// ------------------------------------------------------------ metade 2: rede

export interface ResultadoProvisionamento {
  ok: boolean;
  jaEntregue?: boolean;
  // true = nao adianta a fila insistir (sem plano, operadora recusou de vez).
  // O pedido fica em `em_provisionamento` sem entrega = alerta no painel.
  definitivo?: boolean;
  erro?: string;
  orderId?: string;
  ativacaoId?: string;
}

// Erro que a fila DEVE retentar (rede, 5xx, "em processamento", QR ainda nao
// disponivel). Quem chama a rota transforma em HTTP 500 → o worker espera e repete.
export class ErroRetentavel extends Error {}

async function anotarFalha(ativacaoId: string, erro: string, definitivo: boolean): Promise<void> {
  await db.query(
    `update ativacao
        set tentativas = tentativas + 1, ultimo_erro = $2,
            status = case when $3 then 'falhou'::status_ativacao else status end
      where id = $1`,
    [ativacaoId, erro.slice(0, 900), definitivo],
  ).catch((e) => console.error("anotarFalha:", e));
}

export async function provisionarPedido(pedidoId: string, itemPedidoId: string): Promise<ResultadoProvisionamento> {
  const r = await db.query(
    `select a.id as ativacao_id, a.status::text as ativacao_status, a.estoque_id,
            e.iccid, e.status::text as estoque_status,
            p.numero, p.entregue, p.status::text as pedido_status, p.moeda,
            i.variante_id,
            op.plano_externo, op.custo::text as plano_custo, op.custo_moeda as plano_moeda, op.cobertura
       from ativacao a
       join pedido p on p.id = a.pedido_id
       join item_pedido i on i.id = a.item_pedido_id
       left join estoque_esim e on e.id = a.estoque_id
       left join operadora o on o.codigo = $3
       left join operadora_plano op on op.operadora_id = o.id and op.variante_id = i.variante_id and op.ativo
      where a.pedido_id = $1 and a.item_pedido_id = $2
      order by a.criado_em limit 1`,
    [pedidoId, itemPedidoId, CMLINK.codigo],
  );
  const l = r.rows[0];
  if (!l) return { ok: false, definitivo: true, erro: "pedido/item sem ativacao — iniciarProvisionamento nao rodou" };
  if (l.entregue) return { ok: true, jaEntregue: true, ativacaoId: l.ativacao_id };
  if (!l.iccid) {
    await anotarFalha(l.ativacao_id, "ativacao sem ICCID (estoque_id vazio)", true);
    return { ok: false, definitivo: true, erro: "ativacao sem ICCID", ativacaoId: l.ativacao_id };
  }
  if (!l.plano_externo) {
    const msg = `variante ${l.variante_id} sem plano CMLink (operadora_plano). Vincule em Operadoras > Planos.`;
    await anotarFalha(l.ativacao_id, msg, true);
    return { ok: false, definitivo: true, erro: msg, ativacaoId: l.ativacao_id };
  }

  const cfg = await configCmlink();
  if (!cfg.ativa) {
    // Configuracao, nao defeito: quando alguem ligar a operadora, a fila entrega.
    await anotarFalha(l.ativacao_id, "operadora cmlink inativa na tela Operadoras", false);
    throw new ErroRetentavel("operadora cmlink inativa");
  }

  // 1. COMPRA — idempotente pela chave (numero do pedido + item). Reentrega da
  //    fila com a mesma chave reaproveita o orderID em vez de comprar de novo.
  const chave = `${l.numero}:${String(itemPedidoId).slice(0, 8)}`;
  const compra = await comprarPacote({
    iccid: l.iccid, dataBundleId: l.plano_externo, chaveIdem: chave, pedidoId, itemId: itemPedidoId,
  });
  if (!compra.ok) {
    const msg = `createOrder recusado: ${resumoResposta(compra.resposta)}`;
    const tentarDeNovo = compra.resposta ? retentavel(compra.resposta) : true;
    await anotarFalha(l.ativacao_id, msg, !tentarDeNovo);
    if (tentarDeNovo) throw new ErroRetentavel(msg);
    return { ok: false, definitivo: true, erro: msg, ativacaoId: l.ativacao_id };
  }

  // 2. ATIVACAO explicita — so se a configuracao mandar (chip em modo manual).
  //    Falha aqui NAO derruba a entrega: fica anotada, o operador ve na venda.
  const cfgBruta = await db.query("select config from operadora where codigo = $1", [CMLINK.codigo]);
  if (cfgBruta.rows[0]?.config?.ativar_apos_compra === true) {
    const mcc = cfg.mccPadrao || String((l.cobertura ?? [])[0] ?? "");
    const atv = await ativarPacote({ iccid: l.iccid, dataBundleId: l.plano_externo, mcc, pedidoId, itemId: itemPedidoId });
    if (!atv.ok) {
      await db.query("update ativacao set ultimo_erro = $2 where id = $1", [l.ativacao_id, `activeDataBundle: ${resumoResposta(atv)}`.slice(0, 900)]).catch(() => {});
    }
  }

  // 3. O QR. Se ainda nao existe, a fila volta com espera crescente.
  const esim = await infoEsim(l.iccid);
  const q = lpaDaResposta(esim);
  if (!q.lpa) {
    const msg = `QR ainda nao disponivel: ${resumoResposta(esim)}`;
    await anotarFalha(l.ativacao_id, msg, false);
    throw new ErroRetentavel(msg);
  }

  // 4. ENTREGA — transacao curta, so banco. O codigo entra CIFRADO, com a
  //    impressao digital que garante unicidade (lib/cripto-esim).
  const c = await db.connect();
  try {
    await c.query("begin");
    const cifrado = cifrarCodigo(q.lpa);
    const hash = impressaoCodigo(q.lpa);
    await c.query(
      `update estoque_esim
          set codigo_lpa = $2, codigo_hash = $3, cifrado = true,
              status = 'entregue', pedido_id = $4, reservado_ate = null
        where id = $1`,
      [l.estoque_id, cifrado, hash, pedidoId],
    );
    await c.query(
      `update ativacao
          set status = 'entregue', entregue_em = now(), ultimo_erro = null,
              observacao = coalesce(observacao, '') || $2
        where id = $1`,
      [l.ativacao_id, `cmlink orderID ${compra.orderId || "?"}; `],
    );
    await c.query(
      `update pedido set entregue = true, entregue_em = now(), status = 'entregue' where id = $1`,
      [pedidoId],
    );
    // Custo real: o do plano, quando a moeda bate com a do pedido. Moeda
    // diferente fica nulo — nulo e "nao sei", que e diferente de zero.
    if (l.plano_custo !== null && l.plano_moeda && String(l.plano_moeda).trim() === String(l.moeda ?? "").trim()) {
      await c.query("update item_pedido set custo_unit = $1 where id = $2 and custo_unit is null", [l.plano_custo, itemPedidoId]);
      await c.query(
        `update pedido set custo_total = (select sum(custo_unit * quantidade) from item_pedido where pedido_id = $1) where id = $1`,
        [pedidoId],
      );
    }
    const payload = JSON.stringify({ pedido_id: pedidoId, ativacao_id: l.ativacao_id });
    await c.query(
      `insert into evento_saida (agregado, agregado_id, tipo, payload) values
         ('pedido', $1, 'entrega.notificar', $2::jsonb),
         ('pedido', $1, 'estoque.replicar',  $2::jsonb),
         ('pedido', $1, 'conversao.enviar',  $2::jsonb)`,
      [pedidoId, payload],
    );
    await c.query("commit");
    await c.query("select pg_notify('evento_saida','novo')").catch(() => {});
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }

  return { ok: true, orderId: compra.orderId, ativacaoId: l.ativacao_id };
}
