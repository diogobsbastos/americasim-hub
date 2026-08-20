import { db } from "./db";

// A transacao de entrega — SPEC/04 §4, na integra:
// 1. trava condicional (aceita 'em_provisionamento': e o reprocesso da fila);
//    rowCount=0 tem DOIS significados — reler a linha antes de decidir.
// 2. aloca UM codigo com FOR UPDATE SKIP LOCKED (zero linhas = ERRO ALTO).
// 3. grava o CUSTO REAL da unidade entregue (migracao 003).
// 4. grava ativacao.
// 5. outbox: UM EVENTO POR EFEITO, na MESMA transacao.
// NUNCA colocar chamada de rede dentro deste bloco.

export type ResultadoEntrega = {
  ok: boolean;
  jaEntregue?: boolean;
  ativacaoId?: string;
  motivo?: "sem_estoque" | "status_incompativel";
  status?: string;
};

export async function entregarPedido(
  pedidoId: string,
  varianteId: string,
  itemPedidoId: string,
): Promise<ResultadoEntrega> {
  const c = await db.connect();
  try {
    await c.query("begin");

    const trava = await c.query(
      `update pedido set entregue = true, entregue_em = now(), status = 'entregue'
        where id = $1 and status in ('pago','em_provisionamento') and entregue = false
        returning id, moeda`,
      [pedidoId],
    );
    if (trava.rows.length === 0) {
      await c.query("rollback");
      const p = await db.query("select status, entregue from pedido where id = $1", [pedidoId]);
      if (p.rows[0]?.entregue) return { ok: true, jaEntregue: true }; // sucesso idempotente
      return { ok: false, motivo: "status_incompativel", status: p.rows[0]?.status }; // ERRO, nunca sucesso
    }

    // Tres origens aceitas, nesta ordem de preferencia (migracao 007):
    //   0. o codigo JA RESERVADO para este pedido no checkout — e o caminho
    //      normal quando existe gateway: o cliente pagou pelo que foi separado
    //      para ele, e nao por um sobrando qualquer;
    //   1. um disponivel — caminho do modo dev, sem reserva;
    //   2. uma reserva de OUTRO pedido que ja venceu — o carrinho abandonado
    //      devolve o estoque sozinho aqui, sem rotina de faxina.
    // A ordenacao pelo `case` garante a preferencia; sem ela, um pedido pago
    // poderia levar um codigo qualquer e deixar o proprio reservado preso.
    const cod = await c.query(
      `update estoque_esim
          set status = 'entregue', pedido_id = $1, reservado_ate = null
        where id = (select id from estoque_esim
                     where variante_id = $2
                       and (status = 'disponivel'
                            or (status = 'reservado' and pedido_id = $1)
                            or (status = 'reservado' and reservado_ate is not null
                                and reservado_ate < now()))
                     order by (case when status = 'reservado' and pedido_id = $1 then 0 else 1 end),
                              criado_em
                     for update skip locked limit 1)
        returning id, custo_brl`,
      [pedidoId, varianteId],
    );
    if (cod.rows.length === 0) {
      await c.query("rollback");
      return { ok: false, motivo: "sem_estoque" };
    }

    // ---- custo REAL da unidade entregue (migracao 003) ----------------------
    // Nao e o custo medio da variante nem uma conversao feita depois: e o que
    // ESTE codigo custou. E a unica margem que nao depende de cotacao do dia da
    // venda. Se o lote nao tiver custo em BRL gravado, fica nulo — nulo e "nao
    // sei", que e diferente de zero, e o relatorio precisa poder distinguir.
    const custoUnit = cod.rows[0].custo_brl;
    const moedaPedido = String(trava.rows[0].moeda ?? "");
    if (custoUnit !== null && custoUnit !== undefined && moedaPedido === "BRL") {
      await c.query(
        "update item_pedido set custo_unit = $1 where id = $2 and custo_unit is null",
        [custoUnit, itemPedidoId],
      );
      await c.query(
        `update pedido
            set custo_total = (select sum(custo_unit * quantidade)
                                 from item_pedido where pedido_id = $1)
          where id = $1`,
        [pedidoId],
      );
      // margem_liquida NAO e calculada aqui de proposito: ela e
      // preco - custo - taxa do provedor - IOF, e taxa e IOF so existem depois
      // da liquidacao (SPEC/04 §7). Escrever margem agora seria inventar numero.
    }

    const atv = await c.query(
      `insert into ativacao (pedido_id, item_pedido_id, estoque_id, status, entregue_em)
       values ($1, $2, $3, 'entregue', now()) returning id`,
      [pedidoId, itemPedidoId, cod.rows[0].id],
    );

    const payload = JSON.stringify({ pedido_id: pedidoId, ativacao_id: atv.rows[0].id });
    await c.query(
      `insert into evento_saida (agregado, agregado_id, tipo, payload) values
         ('pedido', $1, 'entrega.notificar', $2::jsonb),
         ('pedido', $1, 'estoque.replicar',  $2::jsonb),
         ('pedido', $1, 'conversao.enviar',  $2::jsonb)`,
      [pedidoId, payload],
    );

    await c.query("commit");
    // campainha, nunca transporte (SPEC/01 §4) — antes do release, de proposito
    await c.query("select pg_notify('evento_saida','novo')").catch(() => {});
    return { ok: true, jaEntregue: false, ativacaoId: atv.rows[0].id };
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
