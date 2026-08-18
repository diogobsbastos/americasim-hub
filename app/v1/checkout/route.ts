import { autenticar, erro } from "../../../lib/api";
import { db } from "../../../lib/db";
import { novoNumeroPedido } from "../../../lib/numero";
import { assinarAcompanhamento } from "../../../lib/token";
import { entregarPedido } from "../../../lib/entrega";

export const dynamic = "force-dynamic";

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

    const cli = await db.query(
      `insert into cliente (email, nome, telefone) values ($1, $2, $3)
       on conflict (email) where email is not null
       do update set nome = coalesce(excluded.nome, cliente.nome)
       returning id`,
      [email, corpo?.cliente?.nome ?? null, corpo?.cliente?.telefone ?? null],
    );

    const numero = novoNumeroPedido();
    const ped = await db.query(
      `insert into pedido (numero, canal_id, cliente_id, status, total, moeda)
       values ($1, $2, $3, 'aguardando_pagamento', $4, $5) returning id`,
      [numero, canal.id, cli.rows[0].id, va.valor, va.moeda],
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
