import type Stripe from "stripe";
import { lerSegredoApp, ondeEstaOSegredo } from "./segredo-app";
import { db } from "./db";

// `import type` + import dinamico de proposito: a VITRINE importa este modulo
// so para saber se esta em modo demonstracao, e nao deve carregar o SDK inteiro
// da Stripe em cada carregamento da home por causa disso. O SDK entra apenas
// quando alguem realmente vai falar com a Stripe.

// Gateway de pagamento — SPEC/03.
//
// As duas credenciais moram no mesmo cofre do Client Secret do Mercado Livre
// (`lib/segredo-app.ts`): cifradas na tabela `parametro`, com a chave-mae fora
// do banco. Assim o operador configura pela TELA, sem SSH — e um backup do
// banco, sozinho, nao abre nada.
//
// O modo (teste x producao) NUNCA e uma flag separada: e derivado do prefixo da
// propria chave. Flag e chave podem discordar, e o dia em que discordarem sera
// o dia em que a loja cobra de verdade achando que esta testando.

export const CHAVE_SECRETA = "STRIPE_SECRET_KEY";
export const CHAVE_WEBHOOK = "STRIPE_WEBHOOK_SECRET";

export type ModoStripe = "nenhum" | "teste" | "producao" | "invalida";

export function modoDaChave(chave: string): ModoStripe {
  const c = (chave ?? "").trim();
  if (!c) return "nenhum";
  if (/^(sk|rk)_test_/.test(c)) return "teste";
  if (/^(sk|rk)_live_/.test(c)) return "producao";
  return "invalida";
}

// Um cliente por chave, guardado no global: instanciar o SDK a cada requisicao
// joga fora o pool de conexoes HTTP e a Stripe passa a ver rajadas de handshake.
const g = globalThis as unknown as { _amStripe?: { chave: string; cli: Stripe } };

export async function clienteStripe(): Promise<{ cli: Stripe; modo: ModoStripe } | null> {
  const chave = await lerSegredoApp(CHAVE_SECRETA);
  const modo = modoDaChave(chave);
  if (modo === "nenhum" || modo === "invalida") return null;

  if (!g._amStripe || g._amStripe.chave !== chave) {
    const { default: SDK } = await import("stripe");
    // `maxNetworkRetries` cobre falha de rede e 429 com espera crescente. Nao
    // cobre erro de negocio — cartao recusado nao se resolve tentando de novo.
    g._amStripe = { chave, cli: new SDK(chave, { maxNetworkRetries: 2, timeout: 20_000 }) };
  }
  return { cli: g._amStripe.cli, modo };
}

// Existe gateway configurado? Nao instancia o SDK — serve para quem so precisa
// saber se ha credencial, sem pagar o custo de decifrar e carregar o SDK.
export async function gatewayConfigurado(): Promise<boolean> {
  const onde = await ondeEstaOSegredo(CHAVE_SECRETA);
  return onde === "ambiente" || onde === "banco";
}

// ---------------------------------------------------------------- comissao
//
// A comissao por venda mora em `parametro`, nao em codigo: mudar quanto se cobra
// nao pode exigir deploy. Ela e CONGELADA no pedido no momento do pagamento —
// se a regra mudar amanha, o pedido de ontem continua valendo o que valia.
//
// Hoje o valor e apenas apurado (o dinheiro entra todo numa conta e a comissao
// e faturada por fora). Quando existir Stripe Connect com conta conectada, este
// mesmo numero vira o `application_fee_amount` da sessao — a conta nao muda,
// muda so quem a cobra.

export const PARAM_COMISSAO_FIXA = "comissao.centavos_por_venda";
export const PARAM_COMISSAO_PCT = "comissao.percentual";

export interface Comissao {
  centavos: number;
  regra: string;
}

export async function comissaoDaVenda(totalCentavos: number): Promise<Comissao> {
  const r = await db.query("select chave, valor from parametro where chave = any($1)", [
    [PARAM_COMISSAO_FIXA, PARAM_COMISSAO_PCT],
  ]);
  const m: Record<string, string> = {};
  for (const linha of r.rows) m[linha.chave] = String(linha.valor ?? "").trim();

  // Inteiro, sempre. Percentual em centavos com arredondamento para baixo: a
  // casa decimal perdida fica com o vendedor, nunca vira centavo cobrado a mais.
  const fixa = Math.max(0, Math.trunc(Number(m[PARAM_COMISSAO_FIXA] ?? "0")) || 0);
  const pct = Math.max(0, Number(m[PARAM_COMISSAO_PCT] ?? "0") || 0);
  const doPct = pct > 0 ? Math.floor((totalCentavos * pct) / 100) : 0;

  // Teto no proprio valor da venda: comissao maior que a venda so pode ser erro
  // de digitacao, e a Stripe recusaria de todo jeito no dia em que isso virar
  // application_fee_amount.
  const bruto = fixa + doPct;
  const centavos = Math.min(bruto, totalCentavos);

  const partes: string[] = [];
  if (fixa > 0) partes.push(`fixa=${fixa}c`);
  if (pct > 0) partes.push(`pct=${pct}%`);
  if (centavos !== bruto) partes.push("limitada ao total da venda");

  return { centavos, regra: partes.length ? partes.join(" + ") : "sem comissao configurada" };
}

// Dinheiro do banco vem STRING decimal ("39.90"). A Stripe fala em centavos
// inteiros. A conversao passa por string de proposito: parseFloat("39.90")*100
// da 3989.9999... e vira 3989 no trunc — um centavo a menos, toda venda.
export function paraCentavos(valorDecimal: string | number): number {
  const s = String(valorDecimal).trim();
  const neg = s.startsWith("-");
  const [inteiro, decimal = ""] = s.replace("-", "").split(".");
  const cent = (decimal + "00").slice(0, 2);
  const n = Number(inteiro || "0") * 100 + Number(cent || "0");
  return neg ? -n : n;
}

export function deCentavos(centavos: number): string {
  const neg = centavos < 0;
  const n = Math.abs(Math.trunc(centavos));
  const s = `${Math.floor(n / 100)}.${String(n % 100).padStart(2, "0")}`;
  return neg ? "-" + s : s;
}

// ------------------------------------------------------------ estado da tela

export interface EstadoStripe {
  modo: ModoStripe;
  ondeSecreta: "ambiente" | "banco" | "ilegivel" | "nenhum";
  ondeWebhook: "ambiente" | "banco" | "ilegivel" | "nenhum";
  temSecreta: boolean;
  temWebhook: boolean;
  erro: string;
  comissaoFixa: string;
  comissaoPct: string;
}

export async function estadoStripe(): Promise<EstadoStripe> {
  const [ondeSecreta, ondeWebhook, params] = await Promise.all([
    ondeEstaOSegredo(CHAVE_SECRETA),
    ondeEstaOSegredo(CHAVE_WEBHOOK),
    db.query("select chave, valor from parametro where chave = any($1)", [
      [PARAM_COMISSAO_FIXA, PARAM_COMISSAO_PCT],
    ]),
  ]);

  const m: Record<string, string> = {};
  for (const linha of params.rows) m[linha.chave] = String(linha.valor ?? "");

  const base: EstadoStripe = {
    modo: "nenhum",
    ondeSecreta,
    ondeWebhook,
    temSecreta: ondeSecreta === "ambiente" || ondeSecreta === "banco",
    temWebhook: ondeWebhook === "ambiente" || ondeWebhook === "banco",
    erro: "",
    comissaoFixa: m[PARAM_COMISSAO_FIXA] ?? "0",
    comissaoPct: m[PARAM_COMISSAO_PCT] ?? "0",
  };

  if (!base.temSecreta) return base;
  const chave = await lerSegredoApp(CHAVE_SECRETA);
  base.modo = modoDaChave(chave);
  return base;
}

// Conversa de verdade com a Stripe. Fica separada do estado porque a tela e
// carregada o tempo todo e uma chamada de rede por render seria desperdicio —
// e porque "a chave existe" e "a chave funciona" sao fatos diferentes.
export async function conferirConta(): Promise<{
  ok: boolean;
  id?: string;
  nome?: string;
  pais?: string;
  moeda?: string;
  podeCobrar?: boolean;
  erro?: string;
}> {
  const s = await clienteStripe();
  if (!s) return { ok: false, erro: "Nao ha chave secreta valida guardada." };
  try {
    const c = await s.cli.accounts.retrieve();
    return {
      ok: true,
      id: c.id,
      nome: c.business_profile?.name ?? c.settings?.dashboard?.display_name ?? c.email ?? c.id,
      pais: c.country ?? "",
      moeda: (c.default_currency ?? "").toUpperCase(),
      podeCobrar: !!c.charges_enabled,
    };
  } catch (e: any) {
    // A mensagem da Stripe e util e nao contem segredo — vale mostrar inteira.
    return { ok: false, erro: String(e?.message ?? e).slice(0, 300) };
  }
}
