import { headers } from "next/headers";

// A vitrine consome a API /v1 por HTTP, com a chave do canal, exatamente como um
// cliente externo faria. Ela NUNCA fala com o banco direto (SPEC/07): se o contrato
// da API quebrar, a loja quebra junto — e e assim que a gente fica sabendo.
// O canal nao e escolhido aqui: ele e derivado da chave pelo lib/api.ts (SPEC/03 par.1).

const BASE = process.env.HUB_BASE_URL || "http://127.0.0.1:3002";
const CHAVE = process.env.CHAVE_VITRINE || "";

// Interface unica com campos sempre presentes, nunca uniao discriminada:
// o type-check do Next 16 rejeitou narrowing por `!x.ok` no bloco anterior.
export interface RespostaApi {
  ok: boolean;
  status: number;
  dados: any;
  erro_codigo: string;
  erro_mensagem: string;
}

export function chaveConfigurada(): boolean {
  return CHAVE.startsWith("ask_");
}

export function modoDemonstracao(): boolean {
  return !process.env.STRIPE_SECRET_KEY;
}

async function chamar(
  metodo: string,
  caminho: string,
  corpo?: unknown,
  cabecalhos?: Record<string, string>,
): Promise<RespostaApi> {
  if (!chaveConfigurada()) {
    return {
      ok: false,
      status: 0,
      dados: null,
      erro_codigo: "chave_ausente",
      erro_mensagem: "CHAVE_VITRINE nao esta no ambiente do servico.",
    };
  }

  let r: Response;
  try {
    r = await fetch(`${BASE}${caminho}`, {
      method: metodo,
      headers: {
        authorization: `Bearer ${CHAVE}`,
        "content-type": "application/json",
        ...(cabecalhos ?? {}),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      status: 0,
      dados: null,
      erro_codigo: "api_inacessivel",
      erro_mensagem: "A API /v1 nao respondeu.",
    };
  }

  let j: any = null;
  try {
    j = await r.json();
  } catch {
    j = null;
  }

  if (!r.ok) {
    return {
      ok: false,
      status: r.status,
      dados: null,
      erro_codigo: j?.erro?.codigo ?? "erro_desconhecido",
      erro_mensagem: j?.erro?.mensagem ?? `HTTP ${r.status}`,
    };
  }
  return { ok: true, status: r.status, dados: j, erro_codigo: "", erro_mensagem: "" };
}

export function apiGet(caminho: string): Promise<RespostaApi> {
  return chamar("GET", caminho);
}

export function apiPost(
  caminho: string,
  corpo: unknown,
  cabecalhos?: Record<string, string>,
): Promise<RespostaApi> {
  return chamar("POST", caminho, corpo, cabecalhos);
}

// Base publica real (dominio que o cliente digitou), lida do proxy. Precisa ser a
// externa porque vira `url_sucesso` do checkout — o cliente e devolvido para la.
export async function basePublica(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "127.0.0.1:3002";
  return `${proto}://${host}`;
}

// Dinheiro chega e permanece STRING decimal (SPEC/03 rev. 18/08). Aqui so trocamos
// o ponto pela virgula para exibir. Nada de parseFloat: float soma errado.
export function formatarDinheiro(valor: string, moeda: string): string {
  const partes = String(valor).split(".");
  const inteiro = partes[0] || "0";
  const centavos = (partes[1] ?? "00").padEnd(2, "0").slice(0, 2);
  const milhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const simbolo = moeda === "BRL" ? "R$" : moeda + " ";
  return `${simbolo} ${milhar},${centavos}`.replace("  ", " ");
}
