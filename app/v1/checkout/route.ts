import { createHash } from "node:crypto";
import { autenticar, erro } from "../../../lib/api";
import { db } from "../../../lib/db";
import { novoNumeroPedido } from "../../../lib/numero";
import { assinarAcompanhamento } from "../../../lib/token";
import { entregarItem } from "../../../lib/provisionar";
import { clienteStripe, comissaoDaVenda, paraCentavos, deCentavos } from "../../../lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Quanto tempo o eSIM fica preso ao pedido enquanto o cliente paga. Curto o
// bastante para carrinho abandonado nao comer o estoque; longo o bastante para
// caber um Pix conferido com calma. Reserva vencida volta sozinha na proxima
// alocacao — nao existe rotina de faxina para dar errado de madrugada.
const MINUTOS_RESERVA = 40;

// Campos de atribuicao aceitos no corpo (migracao 004). Lista fechada de
// proposito: campo desconhecido vindo do cliente nao entra no banco.
const CAMPOS_ATRIBUICAO = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "gclid", "fbclid", "msclkid", "ttclid", "referer", "pagina_entrada",
] as const;

function texto(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

function ipHash(req: Request): string | null {
  const ff = req.headers.get("x-forwarded-for") ?? "";
  const ip = ff.split(",")[0].trim() || req.headers.get("x-real-ip") || "";
  if (!ip) return null;
  // Hash, nunca o IP cru: IP e dado pessoal (LGPD, SPEC/11). O sal impede
  // reconstruir o IP por forca bruta — a faixa de IPv4 e pequena o bastante
  // para um hash sem sal ser reversivel em minutos.
  return createHash("sha256").update(ip + (process.env.SAL_ATRIBUICAO ?? "")).digest("hex");
}

// Grava UM toque e devolve o id. Devolve null quando nao ha nada que valha
// gravar — linha de atribuicao vazia so polui o relatorio.
async function gravarToque(
  toque: unknown,
  visitaId: string | null,
  canalId: string,
  req: Request,
): Promise<string | null> {
  if (!toque || typeof toque !== "object") return null;
  const t = toque as Record<string, unknown>;

  const valores: Record<string, string | null> = {};
  let temAlgo = false;
  for (const c of CAMPOS_ATRIBUICAO) {
    const v = texto(t[c], c === "referer" || c === "pagina_entrada" ? 500 : 200);
    valores[c] = v;
    if (v && c !== "pagina_entrada") temAlgo = true;
  }
  // `pagina_entrada` sozinha nao e origem: toda visita tem uma.
  if (!temAlgo) return null;

  let tocadoEm: string | null = null;
  if (typeof t.tocado_em === "string") {
    const d = new Date(t.tocado_em);
    // Data do cliente nao merece confianca cega: futuro ou pre-historia viram
    // nulo e o banco usa o now() do default.
    const agora = Date.now();
    if (!Number.isNaN(d.getTime()) && d.getTime() <= agora + 60_000 &&
        d.getTime() > agora - 400 * 86400_000) {
      tocadoEm = d.toISOString();
    }
  }

  const r = await db.query(
    `insert into atribuicao
       (visita_id, canal_id, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
        gclid, fbclid, msclkid, ttclid, referer, pagina_entrada, user_agent, ip_hash, tocado_em)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15, coalesce($16::timestamptz, now()))
     returning id`,
    [
      texto(visitaId, 100) ?? "desconhecida",
      canalId,
      valores.utm_source, valores.utm_medium, valores.utm_campaign,
      valores.utm_content, valores.utm_term,
      valores.gclid, valores.fbclid, valores.msclkid, valores.ttclid,
      valores.referer, valores.pagina_entrada,
      texto(req.headers.get("user-agent"), 300),
      ipHash(req),
      tocadoEm,
    ],
  );
  return r.rows[0].id as string;
}

// POST /v1/checkout — SPEC/03. Gateway plugavel:
// - COM chave secreta da Stripe (ambiente ou cofre cifrado): reserva o eSIM,
//   cria a sessao de pagamento e devolve a URL da Stripe. A entrega so acontece
//   quando o webhook confirmar o dinheiro.
// - SEM a chave (modo dev): considera pago e executa a entrega na hora, para o
//   fluxo completo ser testavel sem conta de pagamento.
// O modo e derivado da credencial presente — nunca de flag separada (SPEC/04 §3.6).
export async function POST(req: Request) {
  const canal = await autenticar(req, "pedidos");
  if (canal instanceof Response) return canal;

  const idem = req.headers.get("idempotency-key");
  if (!idem) return erro(400, "idempotency_key_ausente", "Cabecalho Idempotency-Key e obrigatorio.");

  let corpo: any;
  try {
    corpo = await req.json();
  } catch {
    return erro(400, "corpo_invalido", "JSON invalido.");
  }

  const itens = corpo?.itens;
  if (!Array.isArray(itens) || itens.length !== 1 || itens[0]?.quantidade !== 1) {
    // V1: exatamente 1 item, quantidade 1 (SPEC/00 3.13). A transacao aloca LIMIT 1.
    return erro(422, "carrinho_nao_suportado", "O V1 aceita exatamente 1 item com quantidade 1.");
  }
  const email = corpo?.cliente?.email;
  if (!email || typeof email !== "string" || !email.includes("@")) {
    return erro(400, "corpo_invalido", "cliente.email e obrigatorio.");
  }
  const urlSucesso = corpo?.url_sucesso;
  if (!urlSucesso || typeof urlSucesso !== "string") {
    return erro(400, "corpo_invalido", "url_sucesso e obrigatoria.");
  }

  // Idempotencia: replay da mesma chave devolve a resposta original (SPEC/03 §1).
  const chaveIdem = `checkout:${canal.id}:${idem}`;
  const ja = await db.query("select resposta from requisicao_idempotente where chave = $1", [chaveIdem]);
  if (ja.rows.length > 0) return Response.json(ja.rows[0].resposta);

  try {
    const v = await db.query(
      `select v.id as variante_id, pr.valor, pr.moeda, p.nome as produto_nome, v.sku
         from canal_variante cv
         join variante v on v.id = cv.variante_id and v.ativo
         join produto p on p.id = v.produto_id
         join preco pr on pr.variante_id = v.id and pr.canal_id = cv.canal_id
                      and pr.vigencia_fim is null
        where cv.canal_id = $1 and cv.visivel and v.sku = $2`,
      [canal.id, itens[0].sku],
    );
    if (v.rows.length === 0) return erro(404, "nao_encontrado", "SKU inexistente neste canal.");
    const va = v.rows[0];

    // ---- atribuicao (migracao 004) -----------------------------------------
    // Nunca derruba a compra: origem perdida e ruim, venda perdida e pior.
    const atrib = corpo?.atribuicao ?? {};
    const visitaId = typeof atrib?.visita_id === "string" ? atrib.visita_id : null;
    let idPrimeiro: string | null = null;
    let idUltimo: string | null = null;
    try {
      idPrimeiro = await gravarToque(atrib?.primeiro ?? atrib?.ultimo, visitaId, canal.id, req);
      idUltimo = await gravarToque(atrib?.ultimo, visitaId, canal.id, req);
      // So um toque conhecido: ele e primeiro e ultimo ao mesmo tempo.
      if (!idUltimo) idUltimo = idPrimeiro;
      if (!idPrimeiro) idPrimeiro = idUltimo;
    } catch (e) {
      console.error("atribuicao:", e);
    }

    const cli = await db.query(
      `insert into cliente (email, nome, telefone, atribuicao_primeira_id)
       values ($1, $2, $3, $4)
       on conflict (email) where email is not null
       do update set nome = coalesce(excluded.nome, cliente.nome),
                     -- WhatsApp NOVO vence o antigo: e o canal do SAC e a
                     -- pessoa acabou de digitar o numero atual dela.
                     telefone = coalesce(excluded.telefone, cliente.telefone),
                     atribuicao_primeira_id = coalesce(cliente.atribuicao_primeira_id,
                                                       excluded.atribuicao_primeira_id)
       returning id`,
      [email, corpo?.cliente?.nome ?? null, corpo?.cliente?.telefone ?? null, idPrimeiro],
    );

    const numero = novoNumeroPedido();
    const ped = await db.query(
      `insert into pedido (numero, canal_id, cliente_id, status, total, moeda, atribuicao_id)
       values ($1, $2, $3, 'aguardando_pagamento', $4, $5, $6) returning id`,
      [numero, canal.id, cli.rows[0].id, va.valor, va.moeda, idUltimo],
    );
    const pedidoId: string = ped.rows[0].id;
    const item = await db.query(
      `insert into item_pedido (pedido_id, variante_id, quantidade, preco_unit, moeda)
       values ($1, $2, 1, $3, $4) returning id`,
      [pedidoId, va.variante_id, va.valor, va.moeda],
    );
    const itemId: string = item.rows[0].id;

    const t = assinarAcompanhamento(numero);
    const sep = urlSucesso.includes("?") ? "&" : "?";
    const urlRetorno = `${urlSucesso}${sep}pedido=${numero}&t=${t}`;

    const gw = await clienteStripe();

    // ===================================================== COM GATEWAY =======
    if (gw) {
      // 1. RESERVAR ANTES DE COBRAR. Sem isto, dois clientes pagam pelo mesmo
      //    ultimo eSIM e um deles fica com dinheiro tomado e nada entregue —
      //    o pior defeito possivel neste modelo de negocio.
      const res = await db.query(
        `update estoque_esim
            set status = 'reservado', pedido_id = $1,
                reservado_ate = now() + ($3 || ' minutes')::interval
          where id = (select id from estoque_esim
                       where variante_id = $2
                         and (status = 'disponivel'
                              or (status = 'reservado' and reservado_ate is not null
                                  and reservado_ate < now()))
                       order by criado_em
                       for update skip locked limit 1)
          returning id`,
        [pedidoId, va.variante_id, String(MINUTOS_RESERVA)],
      );
      if (res.rows.length === 0) {
        // Sem estoque: o pedido morre aqui em vez de virar cobranca impagavel.
        await db.query("update pedido set status = 'cancelado' where id = $1", [pedidoId]);
        return erro(422, "estoque_indisponivel", "Nao ha eSIM disponivel para esta variante no momento.", {
          variante: itens[0].sku,
        });
      }

      const totalCentavos = paraCentavos(va.valor);
      const com = await comissaoDaVenda(totalCentavos);

      // 2. Congelar a comissao no pedido. Regra que mudar amanha nao reescreve
      //    o que foi vendido hoje.
      await db.query(
        `update pedido
            set comissao_valor = $2, comissao_moeda = $3, comissao_regra = $4,
                comissao_congelada_em = now()
          where id = $1`,
        [pedidoId, deCentavos(com.centavos), va.moeda, com.regra],
      );

      // Metadata vai na sessao E no PaymentIntent: eventos de pagamento assincrono
      // (Pix, boleto) chegam pelo PI, e sem metadata la o webhook nao sabe de
      // qual pedido se trata.
      const meta = {
        pedido_id: pedidoId,
        pedido_numero: numero,
        item_pedido_id: itemId,
        variante_id: va.variante_id,
        canal_id: canal.id,
        comissao_centavos: String(com.centavos),
      };

      let sessao;
      try {
        sessao = await gw.cli.checkout.sessions.create(
          {
            mode: "payment",
            line_items: [
              {
                quantity: 1,
                price_data: {
                  currency: String(va.moeda).toLowerCase(),
                  unit_amount: totalCentavos,
                  product_data: {
                    name: String(va.produto_nome ?? va.sku),
                    description: String(va.sku),
                  },
                },
              },
            ],
            customer_email: email,
            client_reference_id: numero,
            metadata: meta,
            payment_intent_data: { metadata: meta },
            success_url: urlRetorno,
            // Cancelar volta para a loja. A reserva do eSIM nao e devolvida na
            // hora de proposito: o cliente que desiste costuma voltar, e a
            // reserva expira sozinha em MINUTOS_RESERVA.
            cancel_url: urlSucesso,
          },
          // Mesma chave de idempotencia do nosso checkout: se a rede cair entre
          // criar a sessao e gravar a resposta, o retry devolve A MESMA sessao
          // em vez de abrir uma segunda cobranca.
          { idempotencyKey: chaveIdem },
        );
      } catch (e: any) {
        // Cobranca nao criada: devolver a reserva na hora, senao o eSIM fica
        // preso 40 minutos por um erro que ja se sabe que aconteceu.
        await db.query(
          `update estoque_esim set status = 'disponivel', pedido_id = null, reservado_ate = null
            where pedido_id = $1 and status = 'reservado'`,
          [pedidoId],
        );
        await db.query("update pedido set status = 'cancelado' where id = $1", [pedidoId]);
        console.error("stripe.checkout:", e?.message ?? e);
        return erro(502, "gateway_recusou", "O provedor de pagamento nao aceitou criar a cobranca.");
      }

      await db.query(
        `insert into pagamento (pedido_id, provedor, ref_externa, status, valor, moeda)
         values ($1, 'stripe', $2, 'iniciado', $3, $4)`,
        [pedidoId, sessao.id, va.valor, va.moeda],
      );
      await db.query("update pedido set pagamento_ref = $2 where id = $1", [pedidoId, sessao.id]);

      const resposta = {
        pedido: { numero, total: String(va.valor), moeda: va.moeda },
        pagamento: { url: sessao.url, modo: `stripe_${gw.modo}` },
      };
      await db.query(
        `insert into requisicao_idempotente (chave, escopo, resposta)
         values ($1, 'checkout', $2::jsonb) on conflict (chave) do nothing`,
        [chaveIdem, JSON.stringify(resposta)],
      );
      return Response.json(resposta);
    }

    // ===== MODO DEV (sem gateway): paga e entrega na hora =====
    await db.query("update pedido set status = 'pago' where id = $1", [pedidoId]);
    // Porta unica (lib/provisionar): estoque entrega agora; operadora_fixo
    // inicia o provisionamento e a fila termina. A pagina do pedido mostra
    // "separando o seu eSIM" ate o QR chegar.
    const ent = await entregarItem(pedidoId, va.variante_id, itemId);
    if (!ent.ok) {
      if (ent.motivo === "sem_estoque") {
        return erro(422, "estoque_indisponivel", "Nao ha eSIM disponivel para esta variante no momento.", {
          variante: itens[0].sku,
        });
      }
      return erro(500, "erro_interno", "Falha na entrega do pedido.");
    }
    const resposta = {
      pedido: { numero, total: String(va.valor), moeda: va.moeda },
      pagamento: { url: urlRetorno, modo: "dev_sem_gateway" },
    };

    await db.query(
      `insert into requisicao_idempotente (chave, escopo, resposta)
       values ($1, 'checkout', $2::jsonb) on conflict (chave) do nothing`,
      [chaveIdem, JSON.stringify(resposta)],
    );
    return Response.json(resposta);
  } catch (e) {
    console.error("checkout:", e);
    return erro(500, "erro_interno", "Falha ao processar o checkout.");
  }
}
