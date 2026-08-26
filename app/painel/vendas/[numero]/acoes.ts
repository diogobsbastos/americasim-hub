"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../../../lib/db";
import { canalMl } from "../../../../lib/mercadolivre";
import { enviarCodigoPelaConversa } from "../../../../lib/ml-mensagem";
import { auditar, usuarioDaSessao } from "../../../../lib/painel/sessao";
import { ErroRetentavel, provisionarPedido } from "../../../../lib/provisionar";
import { consumoDoChip, jsonBonito, pacotesDoChip, resumoResposta } from "../../../../lib/cmlink";
import type { EstadoPublicar } from "../../produtos/[handle]/publicar/tipos";

const PODE = ["admin", "operacao"];

// Reenviar o codigo do eSIM pela conversa do Mercado Livre.
//
// Existe porque a primeira tentativa (na entrega) e best-effort: se o ML
// recusar a mensagem, a venda fica entregue e o comprador sem o codigo. Antes
// isso era comando no SSH; operacao do dia a dia tem que ser botao.
export async function reenviarCodigoMl(_a: EstadoPublicar, form: FormData): Promise<EstadoPublicar> {
  const u = await usuarioDaSessao();
  if (!u) return { erro: "Sessão expirada. Entre de novo.", ok: "", previa: "" };
  if (!PODE.includes(u.papel)) return { erro: "Seu papel não permite mandar mensagem ao cliente.", ok: "", previa: "" };

  const numero = String(form.get("numero") ?? "").trim();
  const pedidoId = String(form.get("pedido_id") ?? "").trim();
  if (!pedidoId) return { erro: "Pedido não informado.", ok: "", previa: "" };

  const canal = await canalMl();
  if (!canal) return { erro: "O canal Mercado Livre não está conectado.", ok: "", previa: "" };

  const r = await enviarCodigoPelaConversa(canal.id, pedidoId);

  // Registro nos dois lugares: log_sync (cartao de Conexoes, "ultimos erros")
  // e log_auditoria (quem apertou o botao).
  await db.query(
    `insert into log_sync (canal_id, entidade, entidade_id, acao, sucesso, detalhe)
     values ($1, 'pedido', $2, 'ml.pedido.mensagem.reenviar', $3, $4)`,
    [canal.id, pedidoId, r.ok, (r.ok ? `reenviado pelo painel (${r.enviados} codigo/s)` : r.erro).slice(0, 900)],
  ).catch((e) => console.error("log_sync:", e));
  await auditar("pedido.mensagem.reenviar", {
    usuarioId: u.id, entidade: "pedido", entidadeId: pedidoId,
    antes: null, depois: { ok: r.ok, enviados: r.enviados },
  });

  if (numero) revalidatePath(`/painel/vendas/${encodeURIComponent(numero)}`);
  if (!r.ok) return { erro: `O Mercado Livre recusou: ${r.erro}`, ok: "", previa: "" };
  return { erro: "", ok: `Código enviado pela conversa do Mercado Livre (${r.enviados} código/s).`, previa: "" };
}

// ---------------------------------------------------------------- operadora (sob demanda)

// Repete na hora o passo que a fila faz: compra (idempotente) + QR + entrega.
// Existe para destravar um "pago sem entrega" depois de resolver a causa.
export async function provisionarAgora(_a: EstadoPublicar, form: FormData): Promise<EstadoPublicar> {
  const u = await usuarioDaSessao();
  if (!u) return { erro: "Sessão expirada. Entre de novo.", ok: "", previa: "" };
  if (!PODE.includes(u.papel)) return { erro: "Seu papel não permite provisionar.", ok: "", previa: "" };

  const numero = String(form.get("numero") ?? "").trim();
  const pedidoId = String(form.get("pedido_id") ?? "").trim();
  const itemId = String(form.get("item_pedido_id") ?? "").trim();
  if (!pedidoId || !itemId) return { erro: "Pedido/item não informado.", ok: "", previa: "" };

  let resultado: { ok: boolean; erro?: string; jaEntregue?: boolean; definitivo?: boolean; orderId?: string };
  try {
    resultado = await provisionarPedido(pedidoId, itemId);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    await auditar("pedido.provisionar", { usuarioId: u.id, entidade: "pedido", entidadeId: pedidoId, depois: { ok: false, retentavel: e instanceof ErroRetentavel, erro: msg } });
    if (numero) revalidatePath(`/painel/vendas/${encodeURIComponent(numero)}`);
    return { erro: `Não concluiu (a fila vai tentar de novo): ${msg}`, ok: "", previa: "" };
  }
  await auditar("pedido.provisionar", { usuarioId: u.id, entidade: "pedido", entidadeId: pedidoId, depois: resultado });
  if (numero) revalidatePath(`/painel/vendas/${encodeURIComponent(numero)}`);
  if (!resultado.ok) return { erro: `Falha definitiva: ${resultado.erro ?? "?"}`, ok: "", previa: "" };
  if (resultado.jaEntregue) return { erro: "", ok: "Este pedido já estava entregue.", previa: "" };
  return { erro: "", ok: `Entregue. orderID na operadora: ${resultado.orderId || "?"}.`, previa: "" };
}

export async function verStatusOperadora(_a: EstadoPublicar, form: FormData): Promise<EstadoPublicar> {
  const u = await usuarioDaSessao();
  if (!u) return { erro: "Sessão expirada. Entre de novo.", ok: "", previa: "" };
  const iccid = String(form.get("iccid") ?? "").replace(/\D/g, "");
  if (iccid.length < 18) return { erro: "ICCID inválido.", ok: "", previa: "" };
  const pacotes = await pacotesDoChip(iccid);
  const consumo = await consumoDoChip(iccid);
  const previa = `# pacotes — ${resumoResposta(pacotes)}\n${jsonBonito(pacotes.json ?? { erro_rede: pacotes.erroRede, texto: pacotes.texto })}\n\n# consumo — ${resumoResposta(consumo)}\n${jsonBonito(consumo.json ?? { erro_rede: consumo.erroRede, texto: consumo.texto })}`;
  const b = Array.isArray(pacotes.json?.userDataBundles) ? pacotes.json.userDataBundles : [];
  const resumo = b.map((x: any) => `${x.dataBundleId ?? x.dataBundleID ?? "?"}: status ${x.status ?? "?"}${x.remainFlow ? `, restam ${x.remainFlow} MB` : ""}`).join(" · ");
  return { erro: pacotes.ok ? "" : `Operadora recusou: ${resumoResposta(pacotes)}`, ok: pacotes.ok ? (resumo || "sem pacotes neste chip") : "", previa };
}
