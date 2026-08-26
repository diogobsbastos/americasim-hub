import type Stripe from "stripe";
import { db } from "../../../../lib/db";
import { entregarItem } from "../../../../lib/provisionar";
import { clienteStripe, CHAVE_WEBHOOK, deCentavos } from "../../../../lib/stripe";
import { lerSegredoApp } from "../../../../lib/segredo-app";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /v1/webhooks/stripe
//
// Esta rota NAO usa Bearer: quem chama e a Stripe, nao um canal nosso. A
// autenticacao e a ASSINATURA do cabecalho `stripe-signature`, conferida contra
// o segredo do endpoint. Sem essa conferencia, qualquer um na internet marca
// pedido como pago mandando um JSON — e leva o eSIM de graca.
//
// Duas regras que a Stripe impoe e que moldam este arquivo:
// 1. A assinatura e calculada sobre o corpo CRU. Ler com req.json() e
//    re-serializar quebra a conferencia em qualquer payload com acento.
// 2. Eventos sao REENTREGUES. Todo tratamento e idempotente, e a chave e o
//    `event.id` — nao o pedido, porque o mesmo pedido gera varios eventos.

function ok(detalhe: string) {
  // 200 sempre que o evento foi entendido, mesmo quando nao ha o que fazer:
  // devolver erro faz a Stripe reentregar para sempre um evento que nunca vai
  // dar certo, e afoga a fila dos que importam.
  return Response.json({ recebido: true, detalhe });
}

// Taxa do provedor e liquido so existem depois da liquidacao. Buscamos uma vez,
// no momento em que o pagamento e confirmado — e nunca derrubamos a entrega por
// causa disto: eSIM entregue com margem desconhecida e recuperavel; cliente
// pagante sem eSIM, nao.
async function gravarCustoDoPagamento(
  cli: Stripe,
  pedidoId: string,
  refExterna: string,
  paymentIntentId: string | null,
): Promise<void> {
  if (!paymentIntentId) return;
  try {
    const pi = await cli.paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge.balance_transaction"],
    });
    const cobranca = pi.latest_charge as Stripe.Charge | null;
    const bt = cobranca?.balance_transaction as Stripe.BalanceTransaction | null;
    if (!bt) return;

    await db.query(
      `update pagamento
          set taxa_provedor = $2, liquido = $3,
              metodo = coalesce($4, metodo),
              payload_bruto = coalesce(payload_bruto, '{}'::jsonb) || $5::jsonb
        where pedido_id = $1 and ref_externa = $6`,
      [
        pedidoId,
        deCentavos(bt.fee ?? 0),
        deCentavos(bt.net ?? 0),
        cobranca?.payment_method_details?.type ?? null,
        JSON.stringify({ balance_transaction: bt.id, payment_intent: pi.id }),
        refExterna,
      ],
    );
  } catch (e: any) {
    console.error("stripe.custo:", e?.message ?? e);
  }
}

// Confirma o dinheiro e entrega. Idempotente por natureza: `entregarPedido` ja
// trata "ja entregue" como sucesso.
async function confirmarEEntregar(
  cli: Stripe,
  sessao: { id: string; metadata: Record<string, string> | null; payment_intent: unknown },
): Promise<Response> {
  const m = sessao.metadata ?? {};
  const pedidoId = m.pedido_id;
  const varianteId = m.variante_id;
  const itemId = m.item_pedido_id;
  if (!pedidoId || !varianteId || !itemId) {
    // Cobranca criada fora do nosso checkout (teste manual no painel da Stripe,
    // por exemplo). Nao ha pedido para entregar — e isso nao e erro.
    return ok("evento sem metadata de pedido; ignorado");
  }

  await db.query(
    `update pedido set status = 'pago' where id = $1 and status = 'aguardando_pagamento'`,
    [pedidoId],
  );
  await db.query(
    `update pagamento set status = 'aprovado', aprovado_em = coalesce(aprovado_em, now())
      where pedido_id = $1 and ref_externa = $2`,
    [pedidoId, sessao.id],
  );

  const piId =
    typeof sessao.payment_intent === "string"
      ? sessao.payment_intent
      : (sessao.payment_intent as { id?: string } | null)?.id ?? null;

  // Uma porta so: lib/provisionar decide pelo modo de entrega da variante —
  // estoque entrega na hora (lib/entrega), operadora_fixo inicia o
  // provisionamento e a fila termina (compra do pacote + QR).
  const ent = await entregarItem(pedidoId, varianteId, itemId);

  // O custo vem DEPOIS da entrega, de proposito: e informacao de margem, nao
  // condicao de entrega.
  await gravarCustoDoPagamento(cli, pedidoId, sessao.id, piId);

  if (!ent.ok) {
    // Dinheiro recebido e eSIM indisponivel: o unico caso que exige gente.
    //
    // NAO se cria evento novo aqui. `evento_saida` e consumido pelo worker, que
    // LANCA ERRO em tipo desconhecido e reentrega para sempre — um tipo
    // 'entrega.falhou' viraria um evento em retentativa eterna, barulho sem
    // efeito. O pedido ja fica no estado que o painel procura: status 'pago'
    // com entregue = false. E esse o alerta "pagou e nao recebeu", e ele nao
    // depende de mais nenhuma peca funcionar.
    console.error(`stripe.entrega FALHOU pedido=${pedidoId} motivo=${ent.motivo}`);
    return ok(`pago, mas a entrega falhou (${ent.motivo}) — pedido fica no alerta do painel`);
  }
  if (ent.provisionando) return ok("pago; provisionamento na operadora iniciado (a fila entrega)");
  return ok(ent.jaEntregue ? "ja estava entregue" : "pago e entregue");
}

// Cobranca que nao vai acontecer: devolve o eSIM ao estoque na hora, em vez de
// esperar a reserva expirar. Estoque parado nao vende.
async function soltarReserva(pedidoId: string, motivo: string): Promise<void> {
  // ICCID do pool da operadora (codigo vazio) volta a `disponivel` como
  // qualquer outro: ele continua vendavel — o pacote so e comprado na entrega.
  await db.query(
    `update estoque_esim set status = 'disponivel', pedido_id = null, reservado_ate = null
      where pedido_id = $1 and status = 'reservado'`,
    [pedidoId],
  );
  await db.query(
    `update pedido set status = 'cancelado'
      where id = $1 and status = 'aguardando_pagamento'`,
    [pedidoId],
  );
  console.warn(`stripe: reserva devolvida pedido=${pedidoId} motivo=${motivo}`);
}

export async function POST(req: Request) {
  const gw = await clienteStripe();
  const segredo = await lerSegredoApp(CHAVE_WEBHOOK);
  if (!gw || !segredo) {
    // 503 e o codigo certo: a Stripe reentrega, e quando a configuracao chegar
    // os eventos perdidos entram sozinhos.
    return new Response("gateway nao configurado", { status: 503 });
  }

  const assinatura = req.headers.get("stripe-signature");
  if (!assinatura) return new Response("sem assinatura", { status: 400 });

  // CRU. Nao trocar por req.json().
  const cru = await req.text();

  let evento: Stripe.Event;
  try {
    evento = gw.cli.webhooks.constructEvent(cru, assinatura, segredo);
  } catch (e: any) {
    console.error("stripe.assinatura:", e?.message ?? e);
    return new Response("assinatura invalida", { status: 400 });
  }

  // Reentrega: a mesma chave devolve a mesma resposta sem repetir o efeito.
  const chave = `webhook:stripe:${evento.id}`;
  const ja = await db.query("select resposta from requisicao_idempotente where chave = $1", [chave]);
  if (ja.rows.length > 0) return Response.json(ja.rows[0].resposta);

  let resposta: Response;
  try {
    switch (evento.type) {
      case "checkout.session.completed": {
        const s = evento.data.object as Stripe.Checkout.Session;
        if (s.payment_status === "paid") {
          resposta = await confirmarEEntregar(gw.cli, s as any);
        } else {
          // Pix e boleto: o cliente terminou o formulario, o dinheiro ainda nao
          // chegou. Entregar aqui seria entregar de graca para quem so gerou o
          // codigo e nunca pagou. A entrega espera o async_payment_succeeded.
          await db.query(
            `update pagamento set status = 'aguardando' where pedido_id = $1 and ref_externa = $2`,
            [s.metadata?.pedido_id ?? null, s.id],
          ).catch(() => {});
          resposta = ok("sessao concluida, pagamento ainda pendente");
        }
        break;
      }

      case "checkout.session.async_payment_succeeded": {
        const s = evento.data.object as Stripe.Checkout.Session;
        resposta = await confirmarEEntregar(gw.cli, s as any);
        break;
      }

      case "checkout.session.async_payment_failed": {
        const s = evento.data.object as Stripe.Checkout.Session;
        const pid = s.metadata?.pedido_id;
        if (pid) {
          await db.query(
            `update pagamento set status = 'recusado' where pedido_id = $1 and ref_externa = $2`,
            [pid, s.id],
          );
          await soltarReserva(pid, "pagamento assincrono falhou");
        }
        resposta = ok("pagamento recusado; reserva devolvida");
        break;
      }

      case "checkout.session.expired": {
        const s = evento.data.object as Stripe.Checkout.Session;
        const pid = s.metadata?.pedido_id;
        if (pid) await soltarReserva(pid, "sessao expirada");
        resposta = ok("sessao expirada; reserva devolvida");
        break;
      }

      case "charge.refunded": {
        const c = evento.data.object as Stripe.Charge;
        const pid = c.metadata?.pedido_id;
        if (pid) {
          // Reembolso NAO devolve o eSIM ao estoque: o codigo ja foi visto pelo
          // cliente e nao pode ser vendido de novo. Vira prejuizo registrado,
          // que e a verdade.
          await db.query("update pedido set status = 'reembolsado' where id = $1", [pid]);
          await db.query(
            "update pagamento set status = 'estornado' where pedido_id = $1",
            [pid],
          );
        }
        resposta = ok("reembolso registrado");
        break;
      }

      case "charge.dispute.created": {
        const d = evento.data.object as Stripe.Dispute;
        const pid = (d.metadata as Record<string, string> | null)?.pedido_id;
        if (pid) {
          await db.query("update pedido set status = 'chargeback' where id = $1", [pid]);
          await db.query("update pagamento set status = 'contestado' where pedido_id = $1", [pid]);
        }
        resposta = ok("contestacao registrada");
        break;
      }

      default:
        resposta = ok(`evento ${evento.type} sem tratamento`);
    }
  } catch (e: any) {
    // Falha nossa, nao da Stripe: 500 faz ela reentregar, e a idempotencia
    // garante que a reentrega nao duplique nada.
    console.error(`stripe.webhook ${evento.type}:`, e?.message ?? e);
    return new Response("falha ao processar", { status: 500 });
  }

  const corpo = await resposta.clone().json().catch(() => ({ recebido: true }));
  await db.query(
    `insert into requisicao_idempotente (chave, escopo, resposta)
     values ($1, 'webhook_stripe', $2::jsonb) on conflict (chave) do nothing`,
    [chave, JSON.stringify(corpo)],
  ).catch((e) => console.error("idempotencia webhook:", e));

  return resposta;
}
