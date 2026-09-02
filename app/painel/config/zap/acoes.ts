"use server";

// ATENCAO: so exporta FUNCOES ASSINCRONAS. Estados iniciais moram em ./tipos.
// O motor (Evolution, QR, registro em notificacao) vive em lib/zap.ts.

import { revalidatePath } from "next/cache";
import { db } from "../../../../lib/db";
import { salvarSegredoApp } from "../../../../lib/segredo-app";
import { auditar, usuarioDaSessao } from "../../../../lib/painel/sessao";
import { avisarZap, estadoDaInstancia, evolution, instanciaZap, qrParaTela } from "../../../../lib/zap";
import type { EstadoZap, EstadoZapCfg } from "./tipos";

const CAMINHO = "/painel/config/zap";
const ADMIN = ["admin"];
const OPERACAO = ["admin", "operacao"];

async function autorizar(papeis: string[]): Promise<{ id: string } | { erro: string }> {
  const u = await usuarioDaSessao();
  if (!u) return { erro: "Sessão expirada. Entre de novo." };
  if (!papeis.includes(u.papel)) return { erro: "Seu papel não permite esta ação." };
  return { id: u.id };
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

// ---------------------------------------------------------------- config

export async function salvarConfigZapAcao(_a: EstadoZapCfg, form: FormData): Promise<EstadoZapCfg> {
  const u = await autorizar(ADMIN);
  if ("erro" in u) return { erro: u.erro, ok: "" };

  const zapInstancia = String(form.get("zap_instancia") ?? "").trim();
  const zapDestino = String(form.get("zap_destino") ?? "").replace(/\D/g, "");
  const zapApikey = String(form.get("zap_apikey") ?? "").replace(/\s+/g, "");

  await gravarParametro("zap.instancia", zapInstancia, "Instancia da Evolution API (vazio = padrao americasim)", u.id);
  await gravarParametro("zap.destino", zapDestino, "Numero/grupo que recebe os avisos (so digitos, com DDI)", u.id);
  if (zapApikey) await salvarSegredoApp("ZAP_APIKEY", zapApikey, u.id);

  await auditar("config.zap", {
    usuarioId: u.id, entidade: "parametro",
    depois: { zapInstancia, zapDestino, zapApikey: zapApikey ? "gravada" : "mantida" },
  });
  revalidatePath(CAMINHO);
  return { erro: "", ok: "Configuração guardada." };
}

export async function testarZapAcao(_a: EstadoZapCfg): Promise<EstadoZapCfg> {
  const u = await autorizar(OPERACAO);
  if ("erro" in u) return { erro: u.erro, ok: "" };
  const r = await avisarZap("🤖 Teste do robô AmericaSim — Zap conectado e funcionando.");
  return r.ok ? { erro: "", ok: `Zap OK: ${r.detalhe}` } : { erro: `Zap falhou: ${r.detalhe}`, ok: "" };
}

// ---------------------------------------------------------------- conexao
// Área de ativação pela TELA: criar a instância, gerar o QR, ver o status e
// trocar de número no futuro — sem SSH, sem manager, sem túnel.

export async function zapStatusAcao(_a: EstadoZap): Promise<EstadoZap> {
  const u = await autorizar(OPERACAO);
  if ("erro" in u) return { erro: u.erro, ok: "", estado: "", numero: "", qr: "" };
  const instancia = await instanciaZap();
  const s = await estadoDaInstancia(instancia);
  if (s.erro) return { erro: s.erro, ok: "", estado: "", numero: "", qr: "" };
  const texto =
    s.estado === "open" ? `Conectado${s.numero ? ` como +${s.numero}` : ""}. Pronto para avisar.` :
    s.estado === "connecting" ? "Aguardando leitura do QR — gere um novo se o último expirou." :
    s.estado === "sem-instancia" ? "Instância ainda não existe — clique Conectar para criar e gerar o QR." :
    `Desconectado (${s.estado || "estado desconhecido"}). Clique Conectar para gerar o QR.`;
  return { erro: "", ok: texto, estado: s.estado, numero: s.numero, qr: "" };
}

export async function zapConectarAcao(_a: EstadoZap): Promise<EstadoZap> {
  const u = await autorizar(ADMIN);
  if ("erro" in u) return { erro: u.erro, ok: "", estado: "", numero: "", qr: "" };
  const instancia = await instanciaZap();

  // Já conectado? Não derrubar sessão viva gerando QR à toa.
  const s0 = await estadoDaInstancia(instancia);
  if (s0.erro) return { erro: s0.erro, ok: "", estado: "", numero: "", qr: "" };
  if (s0.estado === "open") {
    return { erro: "", ok: `Já conectado${s0.numero ? ` como +${s0.numero}` : ""}. Para trocar de número, desconecte primeiro.`, estado: "open", numero: s0.numero, qr: "" };
  }

  let qr = "";
  if (s0.estado === "sem-instancia") {
    const cr = await evolution("/instance/create", "POST", { instanceName: instancia, integration: "WHATSAPP-BAILEYS", qrcode: true });
    if (!cr.ok) return { erro: cr.erro, ok: "", estado: "", numero: "", qr: "" };
    qr = await qrParaTela(cr.dados);
  }
  if (!qr) {
    const cn = await evolution(`/instance/connect/${encodeURIComponent(instancia)}`, "GET");
    if (!cn.ok) return { erro: cn.erro, ok: "", estado: "", numero: "", qr: "" };
    qr = await qrParaTela(cn.dados);
  }
  await auditar("config.zap.conectar", { usuarioId: u.id, entidade: "parametro", depois: { instancia, qr: qr ? "gerado" : "nao veio" } });
  if (!qr) return { erro: "A Evolution não devolveu QR (nem código). Espere alguns segundos e clique de novo.", ok: "", estado: "connecting", numero: "", qr: "" };
  return { erro: "", ok: "QR gerado. No celular do número-robô: WhatsApp → Aparelhos conectados → Conectar aparelho → escanear. Depois clique Ver status.", estado: "connecting", numero: "", qr };
}

export async function zapDesconectarAcao(_a: EstadoZap): Promise<EstadoZap> {
  const u = await autorizar(ADMIN);
  if ("erro" in u) return { erro: u.erro, ok: "", estado: "", numero: "", qr: "" };
  const instancia = await instanciaZap();
  const r = await evolution(`/instance/logout/${encodeURIComponent(instancia)}`, "DELETE");
  if (!r.ok && r.status !== 404) return { erro: r.erro, ok: "", estado: "", numero: "", qr: "" };
  await auditar("config.zap.desconectar", { usuarioId: u.id, entidade: "parametro", depois: { instancia } });
  return { erro: "", ok: "Desconectado. Clique Conectar para gerar um QR novo (pode ser outro número).", estado: "close", numero: "", qr: "" };
}
