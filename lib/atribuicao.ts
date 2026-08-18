// Atribuicao de origem — SPEC/09 e migracao 004.
//
// O identificador de clique (gclid / fbclid) SO EXISTE no clique do anuncio.
// Se nao for capturado na chegada e levado ate o pedido, some para sempre:
// nenhuma tela, relatorio ou consulta traz de volta depois. Por isso a captura
// mora no middleware, que roda antes de qualquer pagina, e nao numa pagina
// especifica que o visitante pode nunca abrir.
//
// Nada aqui depende de `next/headers`, `node:crypto` ou do banco: o middleware
// roda em runtime Edge. Funcoes puras, testaveis fora do Next.

export const COOKIE_VISITA = "as_v";    // quem e a visita (1 ano)
export const COOKIE_ULTIMO = "as_t";    // ultimo toque — sobrescrito a cada chegada nova
export const COOKIE_PRIMEIRO = "as_t1"; // primeiro toque — gravado UMA vez, nunca sobrescrito

export const DIAS_VISITA = 365;
export const DIAS_TOQUE = 90; // janela de atribuicao. Alem disso o credito e duvidoso.

// Limites de tamanho: cookie inteiro estoura em ~4 KB e cookie estourado e
// descartado pelo navegador SEM AVISO — a atribuicao sumiria calada, que e
// exatamente o modo de falha que esta captura existe para evitar.
const MAX_CAMPO = 200;
const MAX_URL = 300;

export interface Toque {
  s?: string;  // utm_source
  m?: string;  // utm_medium
  c?: string;  // utm_campaign
  ct?: string; // utm_content
  tm?: string; // utm_term
  g?: string;  // gclid
  f?: string;  // fbclid
  ms?: string; // msclkid
  tt?: string; // ttclid
  r?: string;  // referer
  p?: string;  // pagina de entrada
  t?: number;  // quando (epoch ms)
}

function corta(v: string | null | undefined, max: number): string | undefined {
  if (!v) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  return s.slice(0, max);
}

// Extrai o toque da URL e do cabecalho de referencia.
export function toqueDaRequisicao(url: URL, referer: string | null, agora: number): Toque {
  const q = url.searchParams;
  const t: Toque = {
    s: corta(q.get("utm_source"), MAX_CAMPO),
    m: corta(q.get("utm_medium"), MAX_CAMPO),
    c: corta(q.get("utm_campaign"), MAX_CAMPO),
    ct: corta(q.get("utm_content"), MAX_CAMPO),
    tm: corta(q.get("utm_term"), MAX_CAMPO),
    g: corta(q.get("gclid"), MAX_CAMPO),
    f: corta(q.get("fbclid"), MAX_CAMPO),
    ms: corta(q.get("msclkid"), MAX_CAMPO),
    tt: corta(q.get("ttclid"), MAX_CAMPO),
    p: corta(url.pathname + (url.search || ""), MAX_URL),
    t: agora,
  };
  // Referencia de dentro do proprio site nao e origem: seria a loja se creditando
  // pela venda que ela mesma trouxe da pagina anterior.
  const ref = corta(referer, MAX_URL);
  if (ref) {
    try {
      if (new URL(ref).host !== url.host) t.r = ref;
    } catch {
      t.r = ref;
    }
  }
  for (const k of Object.keys(t) as (keyof Toque)[]) {
    if (t[k] === undefined) delete t[k];
  }
  return t;
}

// Tem sinal de origem de verdade? Sem isto, cada navegacao interna sobrescreveria
// o ultimo toque com "direto" e apagaria o credito do anuncio que trouxe a pessoa.
export function temSinalDeOrigem(t: Toque): boolean {
  return Boolean(t.s || t.g || t.f || t.ms || t.tt || t.r);
}

export function ehCliquePago(t: Toque): boolean {
  return Boolean(t.g || t.f || t.ms || t.tt);
}

// base64url sem depender de Buffer (o middleware roda em Edge).
export function codificar(t: Toque): string {
  const json = JSON.stringify(t);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodificar(v: string | undefined | null): Toque | null {
  if (!v) return null;
  try {
    const b64 = v.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const o = JSON.parse(new TextDecoder().decode(bytes));
    return o && typeof o === "object" ? (o as Toque) : null;
  } catch {
    // Cookie adulterado ou truncado nao pode derrubar a compra. Perder a
    // atribuicao de UMA venda e ruim; perder a venda e pior.
    return null;
  }
}

// Formato que vai no corpo do checkout — nomes por extenso, porque aqui ja nao
// ha limite de cookie e o contrato da API precisa ser legivel (SPEC/03).
export function paraApi(t: Toque | null): Record<string, unknown> | undefined {
  if (!t) return undefined;
  const o: Record<string, unknown> = {};
  if (t.s) o.utm_source = t.s;
  if (t.m) o.utm_medium = t.m;
  if (t.c) o.utm_campaign = t.c;
  if (t.ct) o.utm_content = t.ct;
  if (t.tm) o.utm_term = t.tm;
  if (t.g) o.gclid = t.g;
  if (t.f) o.fbclid = t.f;
  if (t.ms) o.msclkid = t.ms;
  if (t.tt) o.ttclid = t.tt;
  if (t.r) o.referer = t.r;
  if (t.p) o.pagina_entrada = t.p;
  if (t.t) o.tocado_em = new Date(t.t).toISOString();
  return Object.keys(o).length ? o : undefined;
}
