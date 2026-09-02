// Zap (WhatsApp) — motor compartilhado da Evolution API, que roda NESTE servidor
// (porta interna 8080). Usado pelas telas (Configurações → Zap) e pelos fluxos
// que avisam (Requisições). Config: zap.instancia (padrão "americasim") e
// zap.destino em `parametro`; zap.url só muda se a Evolution sair desta máquina.
//
// API key: o cofre (ZAP_APIKEY) manda; sem cofre, o hub lê sozinho o arquivo
// /home/ubuntu/.evolution_api_key desta MESMA máquina — zero passo manual,
// zero segredo em chat. O campo da tela vira override.
//
// AUDITORIA (02/09): TODO aviso de Zap é registrado em `notificacao`
// (canal 'whatsapp'), sucesso ou falha — a tela Registros lê de lá.

import { readFile } from "fs/promises";
import QRCode from "qrcode";
import { db } from "./db";
import { lerSegredoApp } from "./segredo-app";

async function lerParametro(chave: string, padrao = ""): Promise<string> {
  const r = await db.query("select valor from parametro where chave = $1", [chave]);
  return String(r.rows[0]?.valor ?? "").trim() || padrao;
}

export async function instanciaZap(): Promise<string> {
  return lerParametro("zap.instancia", "americasim");
}

export async function apikeyEvolution(): Promise<string> {
  const doCofre = await lerSegredoApp("ZAP_APIKEY");
  if (doCofre) return doCofre;
  try {
    return (await readFile("/home/ubuntu/.evolution_api_key", "utf8")).trim();
  } catch {
    return "";
  }
}

export async function evolution(caminho: string, metodo: "GET" | "POST" | "DELETE", corpo?: unknown): Promise<{ ok: boolean; status: number; dados: any; erro: string }> {
  const apikey = await apikeyEvolution();
  if (!apikey) return { ok: false, status: 0, dados: null, erro: "API key da Evolution não encontrada (nem no cofre, nem no arquivo dela no servidor)." };
  const base = (await lerParametro("zap.url", "http://127.0.0.1:8080")).replace(/\/+$/, "");
  try {
    const r = await fetch(base + caminho, {
      method: metodo,
      headers: { "content-type": "application/json", apikey },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(25000),
      cache: "no-store",
    });
    const texto = await r.text();
    let dados: any = texto;
    try { dados = JSON.parse(texto); } catch { /* fica o texto mesmo */ }
    return { ok: r.ok, status: r.status, dados, erro: r.ok ? "" : `Evolution respondeu ${r.status}: ${texto.slice(0, 250)}` };
  } catch (e) {
    return { ok: false, status: 0, dados: null, erro: `Evolution fora do ar? ${String(e).slice(0, 180)}` };
  }
}

// A Evolution mudou de forma entre versões — aceitar as duas.
function extrairQr(d: any): { base64: string; codigo: string } {
  return {
    base64: String(d?.base64 ?? d?.qrcode?.base64 ?? ""),
    codigo: String(d?.code ?? d?.qrcode?.code ?? ""),
  };
}

export async function qrParaTela(d: any): Promise<string> {
  const { base64, codigo } = extrairQr(d);
  if (base64) return base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
  if (codigo) return QRCode.toDataURL(codigo, { width: 280, margin: 1 });
  return "";
}

// Instancia inexistente: versoes da Evolution respondem 404, mas a instalada
// aqui responde 400 com "TypeError: Cannot read properties of undefined
// (reading 'state')" — os dois significam a mesma coisa: ainda nao foi criada.
export function pareceInexistente(r: { status: number; dados: any }): boolean {
  if (r.status === 404) return true;
  return r.status === 400 && JSON.stringify(r.dados ?? "").includes("Cannot read properties of undefined");
}

export async function estadoDaInstancia(instancia: string): Promise<{ estado: string; numero: string; erro: string }> {
  const r = await evolution(`/instance/connectionState/${encodeURIComponent(instancia)}`, "GET");
  if (pareceInexistente(r)) return { estado: "sem-instancia", numero: "", erro: "" };
  if (!r.ok) return { estado: "", numero: "", erro: r.erro };
  const estado = String(r.dados?.instance?.state ?? r.dados?.state ?? "");
  let numero = "";
  if (estado === "open") {
    const li = await evolution(`/instance/fetchInstances?instanceName=${encodeURIComponent(instancia)}`, "GET");
    if (li.ok) {
      const lista = Array.isArray(li.dados) ? li.dados : [li.dados];
      for (const item of lista) {
        const inst = item?.instance ?? item;
        const nome = String(inst?.instanceName ?? inst?.name ?? "");
        if (nome === instancia) {
          numero = String(inst?.ownerJid ?? inst?.owner ?? "").replace(/@.*$/, "");
          break;
        }
      }
    }
  }
  return { estado, numero, erro: "" };
}

// Registro de auditoria: cada aviso vira uma linha em `notificacao`.
// Sucesso = status 'enviada'; falha = 'esgotada' (não há retry no aviso inline).
// O despachante de e-mail só pega canal 'email' + 'pendente' — não encosta aqui.
async function registrarZap(destino: string, texto: string, ok: boolean, detalhe: string) {
  try {
    await db.query(
      `insert into notificacao (destino, canal, referencia, modelo, payload, status, tentativas, ultimo_erro, enviada_em)
       values ($1, 'whatsapp', 'zap.aviso', 'aviso', $2::jsonb, $3::status_notificacao, 1, $4,
               case when $3 = 'enviada' then now() end)`,
      [
        destino || "-",
        JSON.stringify({ texto: texto.slice(0, 600), detalhe: detalhe.slice(0, 300) }),
        ok ? "enviada" : "esgotada",
        ok ? null : detalhe.slice(0, 300),
      ],
    );
  } catch (e) {
    console.error("registro zap:", String(e).slice(0, 150));
  }
}

// Push no Zap. Falha NUNCA derruba o fluxo principal — aviso é cortesia,
// estoque é a verdade. zap.webhook genérico continua como alternativa
// (qualquer ponte que aceite POST {texto}).
export async function avisarZap(texto: string): Promise<{ ok: boolean; detalhe: string }> {
  try {
    const instancia = await instanciaZap();
    const destino = (await lerParametro("zap.destino")).replace(/\D/g, "");
    const apikey = await apikeyEvolution();
    if (instancia && destino && apikey) {
      const base = (await lerParametro("zap.url", "http://127.0.0.1:8080")).replace(/\/+$/, "");
      const r = await fetch(`${base}/message/sendText/${encodeURIComponent(instancia)}`, {
        method: "POST",
        headers: { "content-type": "application/json", apikey },
        body: JSON.stringify({ number: destino, text: texto }),
        signal: AbortSignal.timeout(15000),
      });
      const corpo = await r.text();
      const ok = r.ok;
      const detalhe = ok ? `enviado para ${destino} via instância ${instancia}` : `Evolution respondeu ${r.status}: ${corpo.slice(0, 250)}`;
      await registrarZap(destino, texto, ok, detalhe);
      return { ok, detalhe };
    }
    const webhook = await lerParametro("zap.webhook");
    if (webhook) {
      await fetch(webhook, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texto }),
        signal: AbortSignal.timeout(10000),
      });
      await registrarZap("webhook", texto, true, "enviado ao webhook genérico");
      return { ok: true, detalhe: "enviado ao webhook genérico" };
    }
    const detalhe = "Zap não configurado (Configurações → Zap: conexão + número destino).";
    await registrarZap("", texto, false, detalhe);
    return { ok: false, detalhe };
  } catch (e) {
    const msg = String(e).slice(0, 200);
    console.error("zap:", msg);
    await registrarZap("", texto, false, msg);
    return { ok: false, detalhe: msg };
  }
}
