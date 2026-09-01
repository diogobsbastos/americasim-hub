"use server";

// ATENCAO: so exporta FUNCOES ASSINCRONAS. Estados iniciais moram em ./tipos.

import { revalidatePath } from "next/cache";
import { db } from "../../../lib/db";
import { enviarEmailGmail } from "../../../lib/email";
import { parsearCsv } from "../../../lib/caixa-imap";
import { cifrarCodigo, impressaoCodigo } from "../../../lib/cripto-esim";
import { auditar, usuarioDaSessao } from "../../../lib/painel/sessao";
import type { EstadoReq } from "./tipos";

const CAMINHO = "/painel/requisicoes";
const ADMIN = ["admin"];
const OPERACAO = ["admin", "operacao"];

async function autorizar(papeis: string[]): Promise<{ id: string } | { erro: string }> {
  const u = await usuarioDaSessao();
  if (!u) return { erro: "Sessão expirada. Entre de novo." };
  if (!papeis.includes(u.papel)) return { erro: "Seu papel não permite esta ação." };
  return { id: u.id };
}

async function lerParametro(chave: string, padrao = ""): Promise<string> {
  const r = await db.query("select valor from parametro where chave = $1", [chave]);
  return String(r.rows[0]?.valor ?? "").trim() || padrao;
}

async function gravarParametro(chave: string, valor: string, descricao: string, usuarioId: string) {
  await db.query(
    `insert into parametro (chave, valor, tipo, descricao, atualizado_em, atualizado_por)
     values ($1, $2, 'texto', $3, now(), $4)
     on conflict (chave) do update
       set valor = excluded.valor, atualizado_em = now(), atualizado_por = excluded.atualizado_por`,
    [chave, valor, descricao, usuarioId],
  );
}

// Push no Zap: adaptador minimo — um webhook configuravel (Evolution, Cloud
// API ou qualquer ponte). Sem webhook configurado, silencio; falha NUNCA
// derruba o fluxo principal (aviso e cortesia, estoque e a verdade).
async function avisarZap(texto: string): Promise<void> {
  try {
    const url = await lerParametro("zap.webhook");
    if (!url) return;
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ texto }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (e) {
    console.error("zap:", String(e).slice(0, 200));
  }
}

// ---------------------------------------------------------------- config

export async function salvarConfigReqAcao(_a: EstadoReq, form: FormData): Promise<EstadoReq> {
  const u = await autorizar(ADMIN);
  if ("erro" in u) return { erro: u.erro, ok: "" };

  const destino = String(form.get("destino") ?? "").trim().toLowerCase();
  const remetentes = String(form.get("remetentes") ?? "").trim().toLowerCase();
  const zap = String(form.get("zap") ?? "").trim();
  if (destino && !destino.includes("@")) return { erro: "Destino deve ser um e-mail.", ok: "" };

  if (destino) await gravarParametro("requisicao.destino", destino, "Para onde vai a requisicao de ICCIDs", u.id);
  if (remetentes) await gravarParametro("caixa.remetentes", remetentes, "Remetentes autorizados a mandar CSV (separados por virgula; @dominio.com autoriza o dominio)", u.id);
  await gravarParametro("zap.webhook", zap, "Webhook de push no WhatsApp (vazio = desligado)", u.id);

  await auditar("requisicoes.config", { usuarioId: u.id, entidade: "parametro", depois: { destino, remetentes, zap: zap ? "configurado" : "desligado" } });
  revalidatePath(CAMINHO);
  return { erro: "", ok: "Configuração guardada." };
}

// ---------------------------------------------------------------- requisicao

export async function enviarRequisicaoAcao(_a: EstadoReq, form: FormData): Promise<EstadoReq> {
  const u = await autorizar(OPERACAO);
  if ("erro" in u) return { erro: u.erro, ok: "" };

  const quantidade = Number(String(form.get("quantidade") ?? "").trim());
  const observacao = String(form.get("observacao") ?? "").trim();
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 10000) {
    return { erro: "Quantidade inválida (1 a 10000).", ok: "" };
  }

  const destino = await lerParametro("requisicao.destino", "admin@easysim4u.com");
  const assunto = `Requisição de ICCIDs — AmericaSim (${quantidade} unidades)`;
  const html =
    `<div style="font-family:Arial,sans-serif;max-width:560px">` +
    `<h2 style="color:#0f2a4a">Requisição de ICCIDs — AmericaSim</h2>` +
    `<table style="border-collapse:collapse;width:100%">` +
    `<tr><td style="padding:6px 0;color:#555">Quantidade</td><td style="padding:6px 0"><b>${quantidade}</b></td></tr>` +
    (observacao ? `<tr><td style="padding:6px 0;color:#555">Observação</td><td style="padding:6px 0">${observacao.replace(/</g, "&lt;")}</td></tr>` : "") +
    `<tr><td style="padding:6px 0;color:#555">Data</td><td style="padding:6px 0">${new Date().toLocaleString("pt-BR")}</td></tr>` +
    `</table>` +
    `<p style="font-size:13px;color:#555">Por favor respondam ESTE e-mail com o arquivo CSV dos ICCIDs. O robô da AmericaSim confirma o recebimento automaticamente.</p>` +
    `</div>`;

  const r = await enviarEmailGmail({ para: destino, assunto, html, deNome: "AmericaSim" });
  if (!r.ok) return { erro: `E-mail não saiu: ${r.detalhe}`, ok: "" };

  await db.query(
    `insert into requisicao_iccid (para, assunto, corpo, quantidade, criado_por) values ($1,$2,$3,$4,$5)`,
    [destino, assunto, observacao, quantidade, u.id],
  );
  await auditar("requisicoes.enviar", { usuarioId: u.id, entidade: "requisicao_iccid", depois: { destino, quantidade } });
  await avisarZap(`📤 Requisição de ${quantidade} ICCIDs enviada para ${destino}.`);
  revalidatePath(CAMINHO);
  return { erro: "", ok: `Requisição de ${quantidade} ICCIDs enviada para ${destino}.` };
}

// ---------------------------------------------------------------- lotes

export async function aprovarLoteAcao(_a: EstadoReq, form: FormData): Promise<EstadoReq> {
  const u = await autorizar(ADMIN);
  if ("erro" in u) return { erro: u.erro, ok: "" };

  const loteId = String(form.get("lote_id") ?? "").trim();
  const varianteId = String(form.get("variante_id") ?? "").trim();
  if (!loteId || !varianteId) return { erro: "Escolha o SKU de destino.", ok: "" };

  // Reivindicacao atomica: dois cliques simultaneos nao aprovam duas vezes.
  const l = await db.query(
    `update email_lote set status = 'aprovando' where id = $1 and status = 'pendente'
     returning csv_texto, remetente, assunto, arquivo_nome`,
    [loteId],
  );
  if (l.rows.length === 0) return { erro: "Lote não está mais pendente (já tratado?).", ok: "" };
  const lote = l.rows[0];

  try {
    const v = await db.query("select sku, modo_entrega::text as modo from variante where id = $1", [varianteId]);
    if (v.rows.length === 0) throw new Error("SKU não encontrado.");

    const { iccids } = parsearCsv(String(lote.csv_texto));
    if (iccids.length === 0) throw new Error("O parser não achou nenhum ICCID neste arquivo.");
    const comLpa = iccids.filter((x) => x.lpa);
    if (comLpa.length === 0 && v.rows[0].modo !== "operadora_fixo") {
      throw new Error(`CSV sem código LPA só pode virar POOL, e pool exige SKU em modo operadora_fixo (${v.rows[0].sku} está em ${v.rows[0].modo}).`);
    }

    const nomeLote = `easysim-${new Date().toISOString().slice(0, 10)}`;
    let inseridos = 0, comCodigo = 0, repetidos = 0;
    for (const linha of iccids) {
      let r;
      if (linha.lpa) {
        r = await db.query(
          `insert into estoque_esim (variante_id, codigo_lpa, codigo_hash, iccid, operadora, status, cifrado, lote, custo_moeda)
           select $1, $2, $3, $4, 'easysim4u', 'disponivel', true, $5, 'USD'
            where not exists (select 1 from estoque_esim where iccid = $4)
           returning id`,
          [varianteId, cifrarCodigo(linha.lpa), impressaoCodigo(linha.lpa), linha.iccid, nomeLote],
        );
        if (r.rows.length > 0) comCodigo += 1;
      } else {
        r = await db.query(
          `insert into estoque_esim (variante_id, codigo_lpa, iccid, operadora, status, cifrado, lote, custo_moeda)
           select $1, ''::bytea, $2, 'cmlink', 'disponivel', false, $3, 'USD'
            where not exists (select 1 from estoque_esim where iccid = $2)
           returning id`,
          [varianteId, linha.iccid, nomeLote],
        );
      }
      if (r.rows.length > 0) inseridos += 1; else repetidos += 1;
    }

    // Confirmacao ao remetente — o elo 3 do fluxo combinado na reuniao. Falha
    // de e-mail nao desfaz a carga: o estoque e a verdade, o aviso e cortesia.
    let emailConfirmacao = "enviado";
    const resp = await enviarEmailGmail({
      para: String(lote.remetente),
      assunto: `Re: ${String(lote.assunto || "Requisição de ICCIDs")} — recebido e carregado`,
      deNome: "AmericaSim",
      html:
        `<div style="font-family:Arial,sans-serif;max-width:560px">` +
        `<h2 style="color:#0f2a4a">Confirmação — AmericaSim</h2>` +
        `<p>Recebemos o arquivo <b>${String(lote.arquivo_nome ?? "CSV")}</b> e ele foi processado:</p>` +
        `<ul><li><b>${iccids.length}</b> ICCID(s) no arquivo</li>` +
        `<li><b>${inseridos}</b> carregado(s) no estoque</li>` +
        `<li><b>${repetidos}</b> já constavam (ignorados)</li></ul>` +
        `<p style="font-size:13px;color:#555">Mensagem automática do robô da AmericaSim.</p></div>`,
    });
    if (!resp.ok) emailConfirmacao = `falhou: ${resp.detalhe}`;

    await db.query(
      `update email_lote
          set status = 'aprovado', variante_id = $2, aprovado_por = $3, aprovado_em = now(),
              resultado = $4::jsonb
        where id = $1`,
      [loteId, varianteId, u.id, JSON.stringify({ inseridos, com_codigo: comCodigo, repetidos, email_confirmacao: emailConfirmacao })],
    );
    await auditar("requisicoes.aprovar", { usuarioId: u.id, entidade: "email_lote", depois: { loteId, varianteId, inseridos, repetidos } });
    await avisarZap(`📥 Lote de ICCIDs aprovado: ${inseridos} carregado(s) no estoque (${repetidos} repetidos). Confirmação por e-mail: ${emailConfirmacao}.`);
    revalidatePath(CAMINHO);
    return { erro: "", ok: `Lote aprovado: ${inseridos} no estoque (${comCodigo} com QR pronto, ${repetidos} repetidos). E-mail de confirmação: ${emailConfirmacao}.` };
  } catch (e: any) {
    await db.query(`update email_lote set status = 'pendente' where id = $1 and status = 'aprovando'`, [loteId]);
    return { erro: String(e?.message ?? e), ok: "" };
  }
}

export async function rejeitarLoteAcao(_a: EstadoReq, form: FormData): Promise<EstadoReq> {
  const u = await autorizar(ADMIN);
  if ("erro" in u) return { erro: u.erro, ok: "" };
  const loteId = String(form.get("lote_id") ?? "").trim();
  const r = await db.query(
    `update email_lote set status = 'rejeitado', aprovado_por = $2, aprovado_em = now()
      where id = $1 and status = 'pendente' returning id`,
    [loteId, u.id],
  );
  if (r.rows.length === 0) return { erro: "Lote não está mais pendente.", ok: "" };
  await auditar("requisicoes.rejeitar", { usuarioId: u.id, entidade: "email_lote", depois: { loteId } });
  revalidatePath(CAMINHO);
  return { erro: "", ok: "Lote rejeitado — nada entrou no estoque." };
}
