"use server";

// ATENCAO: so exporta FUNCOES ASSINCRONAS. Estados iniciais moram em ./tipos.

import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import {
  CMLINK, ativarPacote, comprarPacote, consumoDoChip, estadoDoChip, infoEsim, jsonBonito,
  lpaDaResposta, pacotesDoChip, resumoResposta, salvarConfigCmlink, sincronizarCatalogo,
  testarConexao, type RespostaCmlink,
} from "../../../lib/cmlink";
import { apagarSegredoApp, salvarSegredoApp } from "../../../lib/segredo-app";
import { auditar, usuarioDaSessao } from "../../../lib/painel/sessao";
import type { Chamada, EstadoChamadas, EstadoSimples } from "./tipos";

const ADMIN = ["admin"];
const OPERACAO = ["admin", "operacao"];
const CAMINHO = "/painel/operadoras";

async function autorizar(papeis: string[]): Promise<{ id: string } | { erro: string }> {
  const u = await usuarioDaSessao();
  if (!u) return { erro: "Sessão expirada. Entre de novo." };
  if (!papeis.includes(u.papel)) return { erro: "Seu papel não permite esta ação." };
  return { id: u.id };
}

function chamada(titulo: string, r: RespostaCmlink | null): Chamada {
  return {
    titulo,
    resumo: resumoResposta(r),
    ok: !!r?.ok,
    corpo: r ? jsonBonito(r.json ?? { texto: r.texto, erro_rede: r.erroRede }) : "",
  };
}

const VAZIO: EstadoChamadas = { erro: "", ok: "", chamadas: [], lpa: "", qrPng: "" };

// ---------------------------------------------------------------- config

export async function salvarConfigAcao(_a: EstadoSimples, form: FormData): Promise<EstadoSimples> {
  const u = await autorizar(ADMIN);
  if ("erro" in u) return { erro: u.erro, ok: "" };

  const host = String(form.get("host") ?? "").trim().replace(/\/+$/, "");
  if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(host)) {
    return { erro: "Host inválido. Formato: https://servidor:porta (só HTTPS).", ok: "" };
  }
  const ambiente = String(form.get("ambiente")) === "producao" ? "producao" : "sandbox";
  const digest = String(form.get("digest")) === "B" ? "B" : "A";
  const cooperationMode = String(form.get("cooperation_mode")) === "2" ? "2" : "1";
  const mccPadrao = String(form.get("mcc_padrao") ?? "").trim().slice(0, 20);
  const sendLang = String(form.get("send_lang") ?? "2").trim().slice(0, 1) || "2";
  const ativa = String(form.get("ativa")) === "on";

  await salvarConfigCmlink({ host, ambiente, ativa, digest, cooperationMode, mccPadrao, sendLang });
  await auditar("operadora.config", {
    usuarioId: u.id, entidade: "operadora",
    depois: { operadora: CMLINK.codigo, host, ambiente, digest, cooperationMode, mccPadrao, sendLang, ativa },
  });
  revalidatePath(CAMINHO);
  return { erro: "", ok: "Configuração guardada." };
}

export async function salvarChaveAcao(_a: EstadoSimples, form: FormData): Promise<EstadoSimples> {
  const u = await autorizar(ADMIN);
  if ("erro" in u) return { erro: u.erro, ok: "" };
  const appkey = String(form.get("appkey") ?? "").trim();
  if (appkey.length < 4 || /\s/.test(appkey)) return { erro: "AppKey inválida.", ok: "" };
  try {
    await salvarSegredoApp(CMLINK.envKey, appkey, u.id);
  } catch (e: any) {
    console.error("salvarChaveAcao:", e);
    return { erro: "Não consegui guardar com segurança: o servidor está sem a chave de cifra (ESIM_CHAVE).", ok: "" };
  }
  await auditar("operadora.appkey", { usuarioId: u.id, entidade: "parametro", depois: { variavel: CMLINK.envKey } });
  revalidatePath(CAMINHO);
  return { erro: "", ok: "AppKey guardada (cifrada)." };
}

export async function salvarSegredoAcao(_a: EstadoSimples, form: FormData): Promise<EstadoSimples> {
  const u = await autorizar(ADMIN);
  if ("erro" in u) return { erro: u.erro, ok: "" };
  const s = String(form.get("appsecret") ?? "").trim();
  if (s.length < 8) return { erro: "AppSecret muito curta. Cole inteira.", ok: "" };
  try {
    await salvarSegredoApp(CMLINK.envSecret, s, u.id);
  } catch (e: any) {
    console.error("salvarSegredoAcao:", e);
    return { erro: "Não consegui guardar com segurança: o servidor está sem a chave de cifra (ESIM_CHAVE).", ok: "" };
  }
  await auditar("operadora.appsecret", { usuarioId: u.id, entidade: "parametro", depois: { variavel: CMLINK.envSecret } });
  revalidatePath(CAMINHO);
  return { erro: "", ok: "AppSecret guardada (cifrada). Ela não volta para a tela." };
}

export async function apagarChavesAcao(_a: EstadoSimples, _form: FormData): Promise<EstadoSimples> {
  const u = await autorizar(ADMIN);
  if ("erro" in u) return { erro: u.erro, ok: "" };
  await apagarSegredoApp(CMLINK.envKey);
  await apagarSegredoApp(CMLINK.envSecret);
  await auditar("operadora.chaves.apagar", { usuarioId: u.id, entidade: "parametro", depois: { operadora: CMLINK.codigo } });
  revalidatePath(CAMINHO);
  return { erro: "", ok: "Chaves guardadas no banco apagadas (as do ambiente do serviço, se existirem, continuam valendo)." };
}

// ---------------------------------------------------------------- leitura

export async function testarConexaoAcao(_a: EstadoChamadas, _form: FormData): Promise<EstadoChamadas> {
  const u = await autorizar(OPERACAO);
  if ("erro" in u) return { ...VAZIO, erro: u.erro };
  const t = await testarConexao();
  const chamadas = t.respostas.map((r, i) => chamada(`getAccessToken (digest ${i === 0 ? "1ª tentativa" : "2ª tentativa"})`, r));
  await auditar("operadora.testar", { usuarioId: u.id, entidade: "operadora", depois: { operadora: CMLINK.codigo, ok: t.ok, digest: t.digest } });
  revalidatePath(CAMINHO);
  if (!t.ok) return { ...VAZIO, erro: "Não autenticou. Leia a resposta deles abaixo (code 1000000–1000004 = header/digest/nonce/created; 1000006 = AppKey não existe; HTTP 401 = auth).", chamadas };
  return {
    ...VAZIO,
    ok: `Autenticou. Variante do digest que funcionou: ${t.digest}${t.digest ? " — guarde essa variante na configuração." : ""}`,
    chamadas,
  };
}

export async function sincronizarCatalogoAcao(_a: EstadoChamadas, _form: FormData): Promise<EstadoChamadas> {
  const u = await autorizar(OPERACAO);
  if ("erro" in u) return { ...VAZIO, erro: u.erro };
  const s = await sincronizarCatalogo();
  await auditar("operadora.catalogo", { usuarioId: u.id, entidade: "operadora", depois: { operadora: CMLINK.codigo, ok: s.ok, total: s.total, modo: s.modo } });
  revalidatePath(CAMINHO);
  const c = [chamada(`getDataBundle (cooperationMode ${s.modo})`, s.resposta)];
  if (!s.ok) return { ...VAZIO, erro: "O catálogo não veio. Resposta deles abaixo.", chamadas: c };
  return { ...VAZIO, ok: `${s.total} pacote(s) no catálogo (cooperationMode ${s.modo}). Lista atualizada abaixo.`, chamadas: c };
}

export async function consultarIccidAcao(_a: EstadoChamadas, form: FormData): Promise<EstadoChamadas> {
  const u = await autorizar(OPERACAO);
  if ("erro" in u) return { ...VAZIO, erro: u.erro };
  const iccid = String(form.get("iccid") ?? "").replace(/\D/g, "");
  if (iccid.length < 18 || iccid.length > 20) return { ...VAZIO, erro: "ICCID inválido (18 a 20 dígitos)." };

  const [estado, esim, pacotes, consumo] = [
    await estadoDoChip([iccid]),
    await infoEsim(iccid),
    await pacotesDoChip(iccid),
    await consumoDoChip(iccid),
  ];
  const chamadas = [
    chamada("SBO_query_SIMInfo (estado do chip)", estado),
    chamada("SBO_queryEsimCardInfo (eSIM / QR)", esim),
    chamada("APP_getSubedUserDataBundle (pacotes do chip)", pacotes),
    chamada("APP_getSubscriberAllQuota (consumo)", consumo),
  ];
  const q = lpaDaResposta(esim);
  let qrPng = "";
  if (q.lpa) {
    try {
      qrPng = (await QRCode.toDataURL(q.lpa, { margin: 1, width: 240 })).split(",")[1] ?? "";
    } catch (e) {
      console.error("operadoras: QR:", e);
    }
  }
  await auditar("operadora.consultar_iccid", { usuarioId: u.id, entidade: "operadora", depois: { operadora: CMLINK.codigo, iccid, esim_ok: esim.ok } });
  revalidatePath(CAMINHO);
  const okN = chamadas.filter((c) => c.ok).length;
  return {
    ...VAZIO,
    ok: `${okN} de ${chamadas.length} consultas responderam com sucesso.${q.lpa ? ` eSIM com QR (estado ${q.estado || "?"}, instalações ${q.instalacoes ?? "?"}).` : ""}`,
    chamadas, lpa: q.lpa, qrPng,
  };
}

// ---------------------------------------------------------------- escrita (gasta deposito)

export async function comprarPacoteAcao(_a: EstadoChamadas, form: FormData): Promise<EstadoChamadas> {
  const u = await autorizar(ADMIN);
  if ("erro" in u) return { ...VAZIO, erro: u.erro };
  const iccid = String(form.get("iccid") ?? "").replace(/\D/g, "");
  const dataBundleId = String(form.get("data_bundle_id") ?? "").trim();
  const confirmo = String(form.get("confirmo")) === "on";
  if (iccid.length < 18 || iccid.length > 20) return { ...VAZIO, erro: "ICCID inválido." };
  if (!dataBundleId) return { ...VAZIO, erro: "Escolha o pacote (dataBundleId)." };
  if (!confirmo) return { ...VAZIO, erro: "Marque a confirmação: esta compra gasta o depósito na operadora." };

  // Chave de idempotencia MANUAL: uma por (iccid, pacote, dia). Repetir o botao
  // no mesmo dia reaproveita a compra em vez de comprar duas vezes.
  const dia = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const chaveIdem = `MANUAL-${iccid}-${dataBundleId}-${dia}`;

  const c = await comprarPacote({ iccid, dataBundleId, chaveIdem });
  const chamadas: Chamada[] = [];
  if (c.resposta) chamadas.push(chamada("APP_createOrder_SBO (compra)", c.resposta));
  await auditar("operadora.comprar_pacote", {
    usuarioId: u.id, entidade: "operadora",
    depois: { operadora: CMLINK.codigo, iccid, dataBundleId, chave: chaveIdem, ok: c.ok, reaproveitado: c.reaproveitado, orderId: c.orderId },
  });
  revalidatePath(CAMINHO);
  if (!c.ok) return { ...VAZIO, erro: "A compra NÃO foi aceita. Resposta deles abaixo.", chamadas };

  // Depois da compra, o estado do chip e o QR — para o operador ver o que mudou.
  const pacotes = await pacotesDoChip(iccid);
  const esim = await infoEsim(iccid);
  chamadas.push(chamada("APP_getSubedUserDataBundle (depois da compra)", pacotes));
  chamadas.push(chamada("SBO_queryEsimCardInfo (depois da compra)", esim));
  const q = lpaDaResposta(esim);
  let qrPng = "";
  if (q.lpa) {
    try { qrPng = (await QRCode.toDataURL(q.lpa, { margin: 1, width: 240 })).split(",")[1] ?? ""; } catch {}
  }
  return {
    ...VAZIO,
    ok: c.reaproveitado
      ? `Já havia compra hoje para este ICCID/pacote (orderID ${c.orderId}); nada foi comprado de novo.`
      : `Compra aceita. orderID ${c.orderId || "?"}.`,
    chamadas, lpa: q.lpa, qrPng,
  };
}

export async function ativarPacoteAcao(_a: EstadoChamadas, form: FormData): Promise<EstadoChamadas> {
  const u = await autorizar(ADMIN);
  if ("erro" in u) return { ...VAZIO, erro: u.erro };
  const iccid = String(form.get("iccid") ?? "").replace(/\D/g, "");
  const dataBundleId = String(form.get("data_bundle_id") ?? "").trim();
  const mcc = String(form.get("mcc") ?? "").trim();
  if (iccid.length < 18 || iccid.length > 20) return { ...VAZIO, erro: "ICCID inválido." };
  if (!dataBundleId || !mcc) return { ...VAZIO, erro: "Pacote e MCC são obrigatórios para ativar." };
  const r = await ativarPacote({ iccid, dataBundleId, mcc });
  await auditar("operadora.ativar_pacote", { usuarioId: u.id, entidade: "operadora", depois: { operadora: CMLINK.codigo, iccid, dataBundleId, mcc, ok: r.ok } });
  revalidatePath(CAMINHO);
  const chamadas = [chamada("APP_activeDataBundle_SBO (ativação)", r)];
  if (!r.ok) return { ...VAZIO, erro: "A ativação NÃO foi aceita. Resposta deles abaixo.", chamadas };
  return { ...VAZIO, ok: "Ativação aceita.", chamadas };
}
