import { db } from "../../../../../lib/db";
import { canalMl, mlFetch } from "../../../../../lib/mercadolivre";
import { entregarPedido } from "../../../../../lib/entrega";
import { lerCodigo } from "../../../../../lib/cripto-esim";
import { novoNumeroPedido } from "../../../../../lib/numero";
import { conferirSegredo } from "../../segredo";

export const dynamic = "force-dynamic";

// POST /v1/interno/ml/pedido  { "recurso": "/orders/2000012345678901" }
//
// A ponte entre a fila e a entrega. Quem chama e o worker, e so o worker.
//
// POR QUE ESTA ROTA EXISTE em vez de o worker fazer tudo: o worker e Node
// puro com `pg` e mais nada. Quem tem o token do Mercado Livre, a chave que
// abre o codigo do eSIM e a transacao de entrega e o app Next. Duplicar isso
// no worker seria manter duas versoes da mesma regra — e um dia elas divergem.

async function registrar(canalId: string | null, acao: string, sucesso: boolean, detalhe: string) {
  try {
    await db.query(
      `insert into log_sync (canal_id, entidade, acao, sucesso, detalhe)
       values ($1, 'pedido', $2, $3, $4)`,
      [canalId, acao, sucesso, detalhe.slice(0, 900)],
    );
  } catch (e) {
    console.error("registrar:", e);
  }
}

export async function POST(req: Request) {
  const porta = await conferirSegredo(req);
  if (!porta.ok) return Response.json({ erro: porta.motivo }, { status: porta.status });

  let corpo: any = null;
  try {
    corpo = await req.json();
  } catch {
    return Response.json({ erro: "corpo invalido" }, { status: 400 });
  }

  // O ML manda o recurso como "/orders/123". Aceito tambem o numero cru.
  const recurso = String(corpo?.recurso ?? corpo?.resource ?? "").trim();
  const idPedido = (recurso.match(/(\d{6,})/) ?? [])[1] ?? "";
  if (!idPedido) return Response.json({ erro: "sem id de pedido" }, { status: 400 });

  const canal = await canalMl();
  if (!canal) return Response.json({ erro: "canal mercadolivre nao existe" }, { status: 409 });

  // 1. O pedido, na fonte. Nunca confiar no corpo da notificacao: o ML manda
  //    so o ponteiro, e o estado pode ter mudado entre a notificacao e agora.
  let pedidoMl: any;
  try {
    pedidoMl = await mlFetch(canal.id, `/orders/${idPedido}`);
  } catch (e: any) {
    await registrar(canal.id, "ml.pedido.buscar", false, String(e?.message ?? e));
    throw e; // deixa o worker tentar de novo com espera crescente
  }

  const situacao = String(pedidoMl?.status ?? "");

  // 2. So entrega o que esta PAGO. Cancelado nao entrega; pendente tambem nao —
  //    e quando pagar, o ML avisa de novo e cai aqui outra vez.
  if (situacao !== "paid") {
    await registrar(canal.id, "ml.pedido.ignorado", true, `pedido ${idPedido} esta "${situacao}"`);
    return Response.json({ ok: true, ignorado: situacao || "sem_status" });
  }

  const itens: any[] = Array.isArray(pedidoMl?.order_items) ? pedidoMl.order_items : [];
  if (itens.length === 0) {
    await registrar(canal.id, "ml.pedido.vazio", false, `pedido ${idPedido} sem order_items`);
    return Response.json({ ok: true, ignorado: "sem_itens" });
  }

  // 3. O de-para. `canal_item.id_externo` foi preenchido na aba Canais.
  //    Sem vinculo eu NAO chuto: melhor a fila insistir e alguem vincular do
  //    que entregar o eSIM errado e descobrir na reclamacao.
  const mlbs = itens.map((i) => String(i?.item?.id ?? "").toUpperCase()).filter(Boolean);
  const dep = await db.query(
    `select upper(ci.id_externo) as mlb, ci.variante_id, v.sku
       from canal_item ci join variante v on v.id = ci.variante_id
      where ci.canal_id = $1 and upper(ci.id_externo) = any($2::text[])`,
    [canal.id, mlbs],
  );
  const porMlb = new Map<string, { variante_id: string; sku: string }>();
  for (const l of dep.rows) porMlb.set(String(l.mlb), { variante_id: l.variante_id, sku: l.sku });

  const semVinculo = mlbs.filter((m) => !porMlb.has(m));
  if (semVinculo.length > 0) {
    const msg = `anuncio(s) sem vinculo: ${semVinculo.join(", ")}. Vincule em Produtos > Canais e a fila entrega sozinha.`;
    await registrar(canal.id, "ml.pedido.sem_vinculo", false, msg);
    throw new Error(msg);
  }

  // 4. O pedido no hub. A chave e (canal, id_externo): notificacao repetida do
  //    mesmo pedido reencontra a linha em vez de criar outra.
  const jaTem = await db.query(
    "select id, status::text as status, entregue from pedido where canal_id = $1 and id_externo = $2",
    [canal.id, String(pedidoMl.id)],
  );

  let pedidoId: string;
  if (jaTem.rows.length > 0) {
    pedidoId = jaTem.rows[0].id;
  } else {
    const comprador = pedidoMl?.buyer ?? {};
    const pagamento = Array.isArray(pedidoMl?.payments) ? pedidoMl.payments[0] : null;
    const moeda = String(pedidoMl?.currency_id ?? "BRL").slice(0, 3);

    const c = await db.connect();
    try {
      await c.query("begin");

      // Cliente com o apelido do ML e mais nada. O e-mail que a API devolve e
      // mascarado e nao serve para mandar mensagem; o contato de verdade e a
      // conversa do proprio ML. Guardar mascarado seria guardar lixo com cara
      // de dado bom.
      const cli = await c.query(
        "insert into cliente (nome) values ($1) returning id",
        [String(comprador?.nickname ?? "comprador do Mercado Livre").slice(0, 120)],
      );

      const ped = await c.query(
        `insert into pedido (numero, canal_id, id_externo, cliente_id, status, total, moeda, pagamento_ref)
         values ($1, $2, $3, $4, 'pago'::status_pedido, $5::numeric, $6, $7)
         returning id`,
        [
          novoNumeroPedido(),
          canal.id,
          String(pedidoMl.id),
          cli.rows[0].id,
          String(pedidoMl?.total_amount ?? 0),
          moeda,
          pagamento?.id ? String(pagamento.id) : null,
        ],
      );
      pedidoId = ped.rows[0].id;

      for (const it of itens) {
        const mlb = String(it?.item?.id ?? "").toUpperCase();
        const alvo = porMlb.get(mlb)!;
        await c.query(
          `insert into item_pedido (pedido_id, variante_id, quantidade, preco_unit, moeda)
           values ($1, $2, $3, $4::numeric, $5)`,
          [pedidoId, alvo.variante_id, Number(it?.quantity ?? 1), String(it?.unit_price ?? 0), moeda],
        );
      }

      await c.query("commit");
    } catch (e) {
      await c.query("rollback").catch(() => {});
      c.release();
      await registrar(canal.id, "ml.pedido.criar", false, String((e as any)?.message ?? e));
      throw e;
    }
    c.release();
    await registrar(canal.id, "ml.pedido.criar", true, `pedido ${idPedido} virou pedido interno`);
  }

  // 5. A entrega. Toda a regra dificil (reserva, baixa, custo real, fila de
  //    efeitos) ja mora em entregarPedido — aqui so se escolhe o item.
  const linhas = await db.query(
    "select id, variante_id, quantidade from item_pedido where pedido_id = $1 order by id",
    [pedidoId],
  );

  const entregues: string[] = [];
  for (const l of linhas.rows) {
    if (Number(l.quantidade) > 1) {
      // entregarPedido entrega UMA unidade. Enquanto o anuncio for de uma por
      // venda isso nao aparece; se um dia aparecer, tem que gritar, nao
      // entregar menos do que o cliente pagou em silencio.
      await registrar(
        canal.id, "ml.pedido.quantidade", false,
        `pedido ${idPedido}: item com quantidade ${l.quantidade}. Entregue 1 unidade; o resto precisa de acao manual.`,
      );
    }
    const r = await entregarPedido(pedidoId, l.variante_id, l.id);
    if (!r.ok) {
      const msg = r.motivo === "sem_estoque"
        ? `pedido ${idPedido}: SEM ESTOQUE para entregar. O pedido esta pago e nao entregue.`
        : `pedido ${idPedido}: status incompativel (${r.status ?? "?"}).`;
      await registrar(canal.id, "ml.pedido.entregar", false, msg);
      throw new Error(msg);
    }
    if (r.ativacaoId) entregues.push(r.ativacaoId);
  }

  // 6. O QR pela conversa do ML. BEST-EFFORT de proposito: a venda ja esta
  //    fechada e o eSIM ja saiu do estoque. Se a mensagem falhar, isso vira
  //    linha em log_sync e alguem manda a mao — nao se desfaz uma entrega
  //    porque o mensageiro caiu.
  let recado = "nao_enviado";
  try {
    const cods = await db.query(
      `select e.codigo_lpa, e.cifrado
         from ativacao a join estoque_esim e on e.id = a.estoque_id
        where a.pedido_id = $1 order by a.entregue_em`,
      [pedidoId],
    );
    const textos = cods.rows
      .map((l: any) => lerCodigo(l.codigo_lpa, !!l.cifrado))
      .filter(Boolean);

    if (textos.length > 0) {
      const pack = String(pedidoMl?.pack_id ?? pedidoMl?.id);
      const vendedor = String(pedidoMl?.seller?.id ?? canal.config?.usuario_marketplace ?? "");
      const comprador = String(pedidoMl?.buyer?.id ?? "");
      const texto =
        "Obrigado pela compra! Seu eSIM esta pronto.\n\n" +
        textos.map((t: string) => `Codigo de ativacao:\n${t}`).join("\n\n") +
        "\n\nComo instalar: Ajustes > Dados moveis > Adicionar eSIM > Usar codigo QR > Inserir manualmente, e cole o codigo acima.\n" +
        "Ative so quando chegar ao destino: a validade comeca na primeira conexao.";

      await mlFetch(canal.id, `/messages/packs/${pack}/sellers/${vendedor}?tag=post_sale`, {
        method: "POST",
        body: JSON.stringify({
          from: { user_id: vendedor },
          to: { user_id: comprador },
          text: texto,
        }),
      });
      recado = "enviado";
      await registrar(canal.id, "ml.pedido.mensagem", true, `QR enviado no pedido ${idPedido}`);
    }
  } catch (e: any) {
    recado = "falhou";
    await registrar(
      canal.id, "ml.pedido.mensagem", false,
      `pedido ${idPedido}: entrega OK, mensagem falhou -> ${String(e?.message ?? e)}`,
    );
  }

  return Response.json({ ok: true, pedido: pedidoId, entregas: entregues.length, mensagem: recado });
}
