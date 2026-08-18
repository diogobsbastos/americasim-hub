import { createHash } from "node:crypto";
import { autenticar, erro } from "../../../lib/api";
import { db } from "../../../lib/db";
import { novoNumeroPedido } from "../../../lib/numero";
import { assinarAcompanhamento } from "../../../lib/token";
import { entregarPedido } from "../../../lib/entrega";

export const dynamic = "force-dynamic";

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
// - COM STRIPE_SECRET_KEY no ambiente: cria sessao Stripe (proximo bloco).
// - SEM a chave (modo dev): considera pago e executa a entrega na hora, para o
//   fluxo completo ser testavel antes de a conta Stripe existir.
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
      `select v.id as variante_id, pr.valor, pr.moeda
         from canal_variante cv
         join variante v on v.id = cv.variante_id and v.ativo
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
    const item = await db.query(
      `insert into item_pedido (pedido_id, variante_id, quantidade, preco_unit, moeda)
       values ($1, $2, 1, $3, $4) returning id`,
      [ped.rows[0].id, va.variante_id, va.valor, va.moeda],
    );

    const t = assinarAcompanhamento(numero);
    const sep = urlSucesso.includes("?") ? "&" : "?";
    const urlRetorno = `${urlSucesso}${sep}pedido=${numero}&t=${t}`;

    let resposta: unknown;
    if (process.env.STRIPE_SECRET_KEY) {
      // Proximo bloco (quando a conta chegar): criar a sessao Stripe aqui, com
      // metadata.canal_id e statement_descriptor_suffix da marca.
      return erro(500, "erro_interno", "Gateway Stripe ainda nao configurado neste build.");
    }

    // ===== MODO DEV (sem gateway): paga e entrega na hora =====
    await db.query("update pedido set status = 'pago' where id = $1", [ped.rows[0].id]);
    const ent = await entregarPedido(ped.rows[0].id, va.variante_id, item.rows[0].id);
    if (!ent.ok) {
      if (ent.motivo === "sem_estoque") {
        return erro(422, "estoque_indisponivel", "Nao ha eSIM disponivel para esta variante no momento.", {
          variante: itens[0].sku,
        });
      }
      return erro(500, "erro_interno", "Falha na entrega do pedido.");
    }
    resposta = {
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
