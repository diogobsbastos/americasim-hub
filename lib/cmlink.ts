import { createHash, randomBytes, randomUUID } from "node:crypto";
import { db } from "./db";
import { lerSegredoApp, ondeEstaOSegredo } from "./segredo-app";

// Cliente da China Mobile International (CMLink) — Global Data SIM Platform V4.2.
// Contrato completo em docs/SPEC_CMLINK_API.md (secoes 4, 6 e 11).
//
// Regras deste arquivo:
// 1. TODA chamada vira uma linha em `requisicao_operadora` com corpo e resposta
//    COMPLETOS (accessToken mascarado, headers nunca). E por ai que se depura —
//    o painel mostra, o MCP le. Nao existe "deu erro" sem a resposta guardada.
// 2. Credencial vem de lerSegredoApp: ambiente (CMLINK_APPKEY/CMLINK_APPSECRET)
//    tem prioridade; senao, cifrada em `parametro` (tela Operadoras). Nunca no
//    repositorio, nunca em log.
// 3. Compra (createOrder) e a UNICA operacao que gasta dinheiro. Ela exige
//    `chaveIdem` e, se ja houve sucesso com a mesma chave, devolve o resultado
//    guardado em vez de comprar de novo. O `transactionCode` enviado a eles e a
//    propria chave — a plataforma tambem recusa repeticao (1000162).

export const CMLINK = {
  codigo: "cmlink",
  nome: "China Mobile (CMLink)",
  envKey: "CMLINK_APPKEY",
  envSecret: "CMLINK_APPSECRET",
  hostSandbox: "https://gdschannel.cmlink.com:39043",
  iccidsTeste: ["89852342022449473379", "89852342022449473387", "89852342022449473395"],
} as const;

export type DigestVariante = "A" | "B";

export interface ConfigCmlink {
  operadoraId: string | null;
  host: string;
  hostDe: "ambiente" | "banco" | "padrao";
  ambiente: "sandbox" | "producao";
  ativa: boolean;
  digest: DigestVariante;
  cooperationMode: "1" | "2";
  mccPadrao: string;
  sendLang: string;
  catalogo: PacoteCatalogo[];
  catalogoEm: string | null;
}

export interface PacoteCatalogo {
  id: string;
  nome: string;
  descricao: string;
  status: number | string;
  activationMode: string;
  type: number | string;
  periodType: number | string;
  period: number | string;
  precos: { moeda: string; valor: string; unit: string }[];
  mccs: string[];
}

export interface RespostaCmlink {
  ok: boolean;
  http: number;
  ms: number;
  code: string;
  description: string;
  json: any;
  texto: string;
  requisicaoId: string | null;
  erroRede: string;
}

const SUCESSO = new Set(["0000000", "0"]);

// ------------------------------------------------------------------ config

export async function configCmlink(): Promise<ConfigCmlink> {
  const r = await db.query(
    `select id, ambiente::text as ambiente, base_url, ativa, config
       from operadora where codigo = $1`,
    [CMLINK.codigo],
  );
  const row = r.rows[0];
  const cfg = (row?.config ?? {}) as Record<string, any>;
  const hostEnv = (process.env.CMLINK_HOST ?? "").trim().replace(/\/+$/, "");
  const hostBanco = String(row?.base_url ?? "").trim().replace(/\/+$/, "");
  const host = hostEnv || hostBanco || CMLINK.hostSandbox;
  const ambEnv = (process.env.CMLINK_AMBIENTE ?? "").trim();
  return {
    operadoraId: row?.id ?? null,
    host,
    hostDe: hostEnv ? "ambiente" : hostBanco ? "banco" : "padrao",
    ambiente: (ambEnv === "producao" || row?.ambiente === "producao") ? "producao" : "sandbox",
    ativa: !!row?.ativa,
    digest: cfg.digest === "B" ? "B" : "A",
    cooperationMode: cfg.cooperationMode === "2" ? "2" : "1",
    mccPadrao: String(cfg.mcc_padrao ?? ""),
    sendLang: String(cfg.sendLang ?? "2"),
    catalogo: Array.isArray(cfg.catalogo) ? cfg.catalogo : [],
    catalogoEm: cfg.catalogo_em ?? null,
  };
}

// A linha em `operadora` precisa existir antes de qualquer chamada: e a chave
// estrangeira de `requisicao_operadora`. Criada sob demanda, inativa.
export async function garantirOperadora(): Promise<string> {
  const r = await db.query(
    `insert into operadora (codigo, nome, tipo, ambiente, base_url, ativa, prioridade)
     values ($1, $2, 'chinamobile'::tipo_operadora, 'sandbox'::ambiente_op, $3, false, 100)
     on conflict (codigo) do update set nome = excluded.nome
     returning id`,
    [CMLINK.codigo, CMLINK.nome, CMLINK.hostSandbox],
  );
  return r.rows[0].id as string;
}

export async function salvarConfigCmlink(c: {
  host: string; ambiente: "sandbox" | "producao"; ativa: boolean;
  digest: DigestVariante; cooperationMode: "1" | "2"; mccPadrao: string; sendLang: string;
}): Promise<void> {
  await garantirOperadora();
  await db.query(
    `update operadora
        set base_url = $2, ambiente = $3::ambiente_op, ativa = $4,
            config = coalesce(config, '{}'::jsonb) || $5::jsonb
      where codigo = $1`,
    [
      CMLINK.codigo, c.host, c.ambiente, c.ativa,
      JSON.stringify({ digest: c.digest, cooperationMode: c.cooperationMode, mcc_padrao: c.mccPadrao, sendLang: c.sendLang }),
    ],
  );
}

export async function ondeEstaoAsChaves(): Promise<{ appkey: string; appsecret: string }> {
  const [k, s] = await Promise.all([ondeEstaOSegredo(CMLINK.envKey), ondeEstaOSegredo(CMLINK.envSecret)]);
  return { appkey: k, appsecret: s };
}

async function credenciais(): Promise<{ appkey: string; appsecret: string }> {
  const [appkey, appsecret] = await Promise.all([lerSegredoApp(CMLINK.envKey), lerSegredoApp(CMLINK.envSecret)]);
  return { appkey: appkey.trim(), appsecret: appsecret.trim() };
}

// ------------------------------------------------------------------ WSSE

export function digestWsse(nonce: string, created: string, appsecret: string, variante: DigestVariante): string {
  const h = createHash("sha256").update(nonce + created + appsecret, "utf8");
  return variante === "A"
    ? h.digest("base64")
    : Buffer.from(h.digest("hex"), "utf8").toString("base64");
}

function cabecalhosWsse(appkey: string, appsecret: string, variante: DigestVariante): Record<string, string> {
  const nonce = randomBytes(16).toString("hex").toUpperCase();
  const created = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  const digest = digestWsse(nonce, created, appsecret, variante);
  return {
    "content-type": "application/json",
    accept: "application/json",
    Authorization: 'WSSE realm="SDP", profile="UsernameToken", type="Appkey"',
    "X-WSSE": `UsernameToken Username="${appkey}", PasswordDigest="${digest}", Nonce="${nonce}", Created="${created}"`,
  };
}

// ------------------------------------------------------------------ chamada

function mascararCorpo(corpo: unknown): unknown {
  if (Array.isArray(corpo)) return corpo;
  if (!corpo || typeof corpo !== "object") return corpo;
  const c = { ...(corpo as Record<string, unknown>) };
  if (typeof c.accessToken === "string" && c.accessToken) c.accessToken = `…(${c.accessToken.length} car.)`;
  return c;
}

export function retentavel(r: RespostaCmlink): boolean {
  if (r.erroRede) return true;
  if ([429, 500, 502, 503, 504].includes(r.http)) return true;
  if (["1000154", "1000176", "9000001", "9000002", "9000003", "9000004", "9999999"].includes(r.code)) return true;
  if (/^200000[0-6]$/.test(r.code)) return true;
  return false;
}

interface OpcoesChamada {
  operacao: string;
  chaveIdem?: string;
  pedidoId?: string | null;
  itemId?: string | null;
  tentativa?: number;
  digest?: DigestVariante;
}

// A chamada bruta: monta WSSE, bate, guarda em requisicao_operadora, devolve tudo.
export async function chamarCmlink(rota: string, corpo: unknown, op: OpcoesChamada): Promise<RespostaCmlink> {
  const cfg = await configCmlink();
  const operadoraId = cfg.operadoraId ?? (await garantirOperadora());
  const { appkey, appsecret } = await credenciais();
  const vazio: RespostaCmlink = { ok: false, http: 0, ms: 0, code: "", description: "", json: null, texto: "", requisicaoId: null, erroRede: "" };
  if (!appkey || !appsecret) {
    return { ...vazio, erroRede: "sem credencial: guarde AppKey e AppSecret na tela Operadoras (ou no ambiente do servico)" };
  }

  const url = `${cfg.host}/aep/${rota}`;
  const headers = cabecalhosWsse(appkey, appsecret, op.digest ?? cfg.digest);
  const t0 = Date.now();
  let http = 0, texto = "", erroRede = "";
  try {
    const r = await fetch(url, {
      method: "POST", headers, body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(25000), cache: "no-store",
    });
    http = r.status;
    texto = await r.text();
  } catch (e: any) {
    erroRede = String(e?.cause?.message || e?.message || e).slice(0, 500);
  }
  const ms = Date.now() - t0;
  let json: any = null;
  try { json = texto ? JSON.parse(texto) : null; } catch { json = null; }

  const code = String(json?.code ?? "");
  const description = String(json?.description ?? json?.decsription ?? json?.msg ?? "");
  const ok = !erroRede && SUCESSO.has(code);
  const resultado = erroRede ? (/(timeout|abort)/i.test(erroRede) ? "timeout" : "erro") : ok ? "sucesso" : "erro";

  const registro = {
    url,
    corpo: mascararCorpo(corpo),
    digest: op.digest ?? cfg.digest,
    ambiente: cfg.ambiente,
  };
  const resposta = json ?? { texto: texto.slice(0, 20000), erro_rede: erroRede || undefined };

  // (operadora, chave_idem, operacao) e unico no banco. A 2a tentativa da MESMA
  // chave (token renovado, retentativa da fila) ganha sufixo #n para caber; a
  // busca de idempotencia usa split_part(chave_idem, '#', 1).
  const n = op.tentativa ?? 1;
  const chaveRegistro = op.chaveIdem ? (n > 1 ? `${op.chaveIdem}#${n}` : op.chaveIdem) : randomUUID();

  let requisicaoId: string | null = null;
  try {
    const ins = await db.query(
      `insert into requisicao_operadora
         (operadora_id, pedido_id, item_pedido_id, operacao, chave_idem, requisicao, resposta,
          http_status, resultado, duracao_ms, tentativa)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9::resultado_req, $10, $11)
       returning id`,
      [
        operadoraId, op.pedidoId ?? null, op.itemId ?? null, op.operacao,
        chaveRegistro, JSON.stringify(registro), JSON.stringify(resposta),
        http || null, resultado, ms, op.tentativa ?? 1,
      ],
    );
    requisicaoId = ins.rows[0]?.id ?? null;
  } catch (e) {
    console.error("cmlink: falha ao gravar requisicao_operadora:", e);
  }

  return { ok, http, ms, code, description, json, texto, requisicaoId, erroRede };
}

// ------------------------------------------------------------------ token

let tokenCache: { valor: string; expiraEm: number; digest: DigestVariante; host: string } | null = null;

export function esquecerToken(): void {
  tokenCache = null;
}

export async function obterToken(forcar = false): Promise<{ token: string; resposta: RespostaCmlink | null }> {
  const cfg = await configCmlink();
  const agora = Date.now();
  if (!forcar && tokenCache && tokenCache.expiraEm > agora + 60000 &&
      tokenCache.digest === cfg.digest && tokenCache.host === cfg.host) {
    return { token: tokenCache.valor, resposta: null };
  }
  const { appkey } = await credenciais();
  const r = await chamarCmlink("APP_getAccessToken_SBO/v1", { id: appkey, type: "106" }, { operacao: "getAccessToken" });
  if (!r.ok || !r.json?.accessToken) {
    tokenCache = null;
    return { token: "", resposta: r };
  }
  // expireTime e YYYYMMDDHHMMSS em UTC (10 min por padrao). Se vier vazio,
  // assume 9 min — o 1 min de folga ja esta na conferencia acima.
  const exp = String(r.json.expireTime ?? "");
  let expiraEm = agora + 9 * 60000;
  const m = exp.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (m) expiraEm = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  tokenCache = { valor: String(r.json.accessToken), expiraEm, digest: cfg.digest, host: cfg.host };
  return { token: tokenCache.valor, resposta: r };
}

// Chamada autenticada: token no corpo; se a plataforma disser que o token
// venceu (1000008/1000009), renova UMA vez e repete.
export async function chamarComToken(rota: string, corpo: Record<string, unknown>, op: OpcoesChamada): Promise<RespostaCmlink> {
  const t = await obterToken();
  if (!t.token) return t.resposta ?? { ok: false, http: 0, ms: 0, code: "", description: "", json: null, texto: "", requisicaoId: null, erroRede: "sem token" };
  let r = await chamarCmlink(rota, { ...corpo, accessToken: t.token }, op);
  if (!r.ok && ["1000008", "1000009"].includes(r.code)) {
    const t2 = await obterToken(true);
    if (t2.token) r = await chamarCmlink(rota, { ...corpo, accessToken: t2.token }, { ...op, tentativa: (op.tentativa ?? 1) + 1 });
  }
  return r;
}

// ------------------------------------------------------------------ operacoes

// Testa as duas leituras do PasswordDigest e diz qual funcionou. So leitura.
export async function testarConexao(): Promise<{ ok: boolean; digest: DigestVariante | null; respostas: RespostaCmlink[] }> {
  const cfg = await configCmlink();
  const { appkey } = await credenciais();
  const respostas: RespostaCmlink[] = [];
  const ordem: DigestVariante[] = cfg.digest === "B" ? ["B", "A"] : ["A", "B"];
  for (const v of ordem) {
    const r = await chamarCmlink("APP_getAccessToken_SBO/v1", { id: appkey, type: "106" }, { operacao: "getAccessToken", digest: v });
    respostas.push(r);
    if (r.ok && r.json?.accessToken) {
      esquecerToken();
      return { ok: true, digest: v, respostas };
    }
  }
  return { ok: false, digest: null, respostas };
}

function nomeEm(lista: unknown, lingua = "en"): string {
  if (!Array.isArray(lista)) return typeof lista === "string" ? lista : "";
  const pref = lista.find((n: any) => n?.langInfo?.language === lingua) ?? lista[0];
  return String(pref?.value ?? "");
}

export function resumirPacote(b: any): PacoteCatalogo {
  return {
    id: String(b?.id ?? ""),
    nome: nomeEm(b?.name),
    descricao: nomeEm(b?.desc),
    status: b?.status ?? "",
    activationMode: String(b?.activationMode ?? ""),
    type: b?.type ?? "",
    periodType: b?.periodType ?? "",
    period: b?.period ?? "",
    precos: Array.isArray(b?.priceInfo)
      ? b.priceInfo.map((p: any) => ({ moeda: String(p?.currencyCode ?? ""), valor: String(p?.price ?? ""), unit: String(p?.unit ?? "") }))
      : [],
    mccs: mccsDe(b?.cardPools),
  };
}

// cardPools: a doc diz Map<poolId, List<NetCapability>>; o exemplo mostra
// {mcc, mnc} direto. Aceita as duas formas.
function mccsDe(cp: unknown): string[] {
  const out = new Set<string>();
  const pega = (n: any) => { if (n && typeof n === "object" && n.mcc) out.add(String(n.mcc)); };
  if (Array.isArray(cp)) cp.forEach(pega);
  else if (cp && typeof cp === "object") {
    pega(cp);
    for (const v of Object.values(cp as Record<string, unknown>)) {
      if (Array.isArray(v)) v.forEach(pega); else pega(v);
    }
  }
  return [...out];
}

// Catalogo: tenta o cooperationMode configurado; se recusar, tenta o outro e
// avisa. Guarda o resumo em operadora.config.catalogo.
export async function sincronizarCatalogo(): Promise<{ ok: boolean; total: number; modo: string; resposta: RespostaCmlink }> {
  const cfg = await configCmlink();
  const modos = cfg.cooperationMode === "2" ? ["2", "1"] : ["1", "2"];
  let r: RespostaCmlink | null = null;
  let modo = modos[0];
  for (const m of modos) {
    modo = m;
    r = await chamarComToken(
      "app_getDataBundle_SBO/v1",
      { cooperationMode: m, language: "en", beginIndex: 0, count: 200 },
      { operacao: "getDataBundle" },
    );
    if (r.ok) break;
  }
  if (!r || !r.ok) return { ok: false, total: 0, modo, resposta: r! };
  const lista = Array.isArray(r.json?.dataBundles) ? r.json.dataBundles.map(resumirPacote) : [];
  await garantirOperadora();
  await db.query(
    `update operadora
        set config = coalesce(config, '{}'::jsonb) || $2::jsonb
      where codigo = $1`,
    [CMLINK.codigo, JSON.stringify({ catalogo: lista, catalogo_em: new Date().toISOString(), cooperationMode: modo })],
  );
  return { ok: true, total: lista.length, modo, resposta: r };
}

export async function estadoDoChip(iccids: string[]): Promise<RespostaCmlink> {
  // A doc manda um ARRAY sem accessToken (secao 6.9). Se a plataforma exigir
  // token, a resposta guardada vai dizer — e ai a pergunta ao Haoran cai.
  return chamarCmlink("SBO_query_SIMInfo/v1", iccids.map((iccid) => ({ iccid })), { operacao: "querySIMInfo" });
}

export async function infoEsim(iccid: string): Promise<RespostaCmlink> {
  return chamarComToken("SBO_queryEsimCardInfo/v1", { iccid }, { operacao: "queryEsimCardInfo" });
}

export async function pacotesDoChip(iccid: string): Promise<RespostaCmlink> {
  return chamarComToken(
    "APP_getSubedUserDataBundle_SBO/v1",
    { iccid, language: "2", beginIndex: 0, count: 50 },
    { operacao: "getSubedUserDataBundle" },
  );
}

export async function consumoDoChip(iccid: string): Promise<RespostaCmlink> {
  return chamarComToken("APP_getSubscriberAllQuota_SBO/v1", { iccid }, { operacao: "getSubscriberAllQuota" });
}

export async function localizacaoDoChip(iccid: string): Promise<RespostaCmlink> {
  return chamarComToken("APP_HIMSI_TERMSTATE_SBO/v1", { iccid }, { operacao: "himsiTermState" });
}

// O QR: a doc oscila entre `cardInfo` e `data`. Aceita os dois.
export function lpaDaResposta(r: RespostaCmlink): { lpa: string; smdp: string; codigo: string; estado: string; instalacoes: number | null } {
  const info = r.json?.cardInfo ?? r.json?.data ?? null;
  const smdp = String(info?.smdpAddress ?? "").trim();
  const codigo = String(info?.activationCode ?? "").trim();
  return {
    lpa: smdp && codigo ? `LPA:1$${smdp}$${codigo}` : "",
    smdp, codigo,
    estado: String(info?.state ?? ""),
    instalacoes: info?.installCount == null ? null : Number(info.installCount),
  };
}

// COMPRA — gasta deposito. Idempotente pela chave: sucesso anterior com a mesma
// chave e devolvido sem chamar de novo.
export async function comprarPacote(p: {
  iccid: string; dataBundleId: string; chaveIdem: string;
  pedidoId?: string | null; itemId?: string | null; setActiveTime?: string;
}): Promise<{ ok: boolean; reaproveitado: boolean; orderId: string; resposta: RespostaCmlink | null }> {
  const cfg = await configCmlink();
  const operadoraId = cfg.operadoraId ?? (await garantirOperadora());

  const ja = await db.query(
    `select resposta from requisicao_operadora
      where operadora_id = $1 and split_part(chave_idem, '#', 1) = $2 and operacao = 'createOrder' and resultado = 'sucesso'
      order by criado_em desc limit 1`,
    [operadoraId, p.chaveIdem],
  );
  if (ja.rows.length > 0) {
    const j = ja.rows[0].resposta;
    return { ok: true, reaproveitado: true, orderId: String(j?.orderID ?? j?.orderId ?? ""), resposta: null };
  }

  // transactionCode: ate 32 caracteres, unico. A chave pode ser maior; hash curto.
  const transactionCode = createHash("sha256").update(p.chaveIdem).digest("hex").slice(0, 32);

  // A unicidade (operadora, chave_idem, operacao) faz a segunda tentativa
  // concorrente falhar no INSERT do registro — mas o INSERT acontece DEPOIS da
  // chamada. Por isso a tentativa e contada: a chave de idempotencia do lado
  // deles (transactionCode) e a mesma, e a plataforma recusa a repeticao.
  const tent = await db.query(
    `select coalesce(max(tentativa), 0) + 1 as n from requisicao_operadora
      where operadora_id = $1 and split_part(chave_idem, '#', 1) = $2 and operacao = 'createOrder'`,
    [operadoraId, p.chaveIdem],
  );

  const corpo: Record<string, unknown> = {
    thirdOrderId: p.chaveIdem.slice(0, 200),
    includeCard: 0,
    is_Refuel: "1",
    dataBundleId: p.dataBundleId,
    quantity: 1,
    ICCID: p.iccid,
    sendLang: cfg.sendLang || "2",
    transactionCode,
  };
  if (p.setActiveTime) corpo.setActiveTime = p.setActiveTime;

  const r = await chamarComToken("APP_createOrder_SBO/v1", corpo, {
    operacao: "createOrder", chaveIdem: p.chaveIdem, pedidoId: p.pedidoId ?? null, itemId: p.itemId ?? null,
    tentativa: Number(tent.rows[0]?.n ?? 1),
  });
  return { ok: r.ok, reaproveitado: false, orderId: String(r.json?.orderID ?? r.json?.orderId ?? ""), resposta: r };
}

export async function ativarPacote(p: { iccid: string; dataBundleId: string; mcc: string; pedidoId?: string | null; itemId?: string | null }): Promise<RespostaCmlink> {
  return chamarComToken(
    "APP_activeDataBundle_SBO/v1",
    { iccid: p.iccid, dataBundleId: p.dataBundleId, mcc: p.mcc },
    { operacao: "activeDataBundle", pedidoId: p.pedidoId ?? null, itemId: p.itemId ?? null },
  );
}

export async function cancelarPedidoCmlink(p: { orderId?: string; thirdOrderId?: string; pedidoId?: string | null }): Promise<RespostaCmlink> {
  const corpo: Record<string, unknown> = {};
  if (p.orderId) corpo.orderId = p.orderId;
  if (p.thirdOrderId) corpo.thirdOrderId = p.thirdOrderId;
  return chamarComToken("SBO_channel_unsubscribe/v1", corpo, { operacao: "channelUnsubscribe", pedidoId: p.pedidoId ?? null });
}

// Para tela e log: nunca o token, nunca a chave.
export function resumoResposta(r: RespostaCmlink | null | undefined): string {
  if (!r) return "(sem resposta)";
  if (r.erroRede) return `rede/TLS: ${r.erroRede}`;
  return `HTTP ${r.http} · code ${r.code || "?"}${r.description ? " · " + r.description : ""} · ${r.ms} ms`;
}

export function jsonBonito(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
