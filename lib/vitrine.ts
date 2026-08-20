import { headers } from "next/headers";
import { lerSegredoApp } from "./segredo-app";
import { CHAVE_SECRETA, modoDaChave } from "./stripe";

// A vitrine consome a API /v1 por HTTP, com a chave do canal, exatamente como um
// cliente externo faria. Ela NUNCA fala com o banco direto (SPEC/07): se o contrato
// da API quebrar, a loja quebra junto — e e assim que a gente fica sabendo.
// O canal nao e escolhido aqui: ele e derivado da chave pelo lib/api.ts (SPEC/03 par.1).

const BASE = process.env.HUB_BASE_URL || "http://127.0.0.1:3002";

// Com mais de uma vitrine no mesmo processo, a chave deixa de ser uma variavel
// e vira um mapa por dominio:
//   CHAVES_VITRINE={"viagemsim.duckdns.org":"ask_...","outra.com":"ask_..."}
// CHAVE_VITRINE continua valendo como padrao para o dominio principal, entao
// nada quebra em quem ja estava configurado.
function mapaChaves(): Record<string, string> {
  const bruto = process.env.CHAVES_VITRINE ?? "";
  if (!bruto.trim()) return {};
  try {
    const o = JSON.parse(bruto);
    return o && typeof o === "object" ? (o as Record<string, string>) : {};
  } catch {
    // Nao derrubar a loja por causa de um JSON torto no .env — mas gritar no
    // log, senao a vitrine cai para a chave padrao e ninguem entende por que a
    // segunda loja mostra o catalogo da primeira.
    console.error("CHAVES_VITRINE nao e um JSON valido; usando CHAVE_VITRINE.");
    return {};
  }
}

async function hostDaRequisicao(): Promise<string> {
  const h = await headers();
  const bruto = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return bruto.split(":")[0].trim().toLowerCase();
}

export async function chaveDoCanal(): Promise<string> {
  const m = mapaChaves();
  const host = await hostDaRequisicao();
  return m[host] || process.env.CHAVE_VITRINE || "";
}

// Interface unica com campos sempre presentes, nunca uniao discriminada:
// o type-check do Next 16 rejeitou narrowing por `!x.ok` no bloco anterior.
export interface RespostaApi {
  ok: boolean;
  status: number;
  dados: any;
  erro_codigo: string;
  erro_mensagem: string;
}

export async function chaveConfigurada(): Promise<boolean> {
  return (await chaveDoCanal()).startsWith("ask_");
}

// O que a LOJA promete ao cliente sobre cobranca. Substituiu o antigo
// `modoDemonstracao()` booleano em 20/08/2026, por dois motivos:
//
// 1. a chave agora pode vir do cofre cifrado (tela), nao so do `.env` — e este
//    texto PRECISA enxergar a chave pelo mesmo caminho que o checkout, senao
//    existe o estado em que a loja cobra de verdade continuando a anunciar que
//    ninguem sera cobrado;
// 2. "tem gateway" nao basta: gateway em modo de TESTE tambem nao cobra, e
//    quem estiver testando precisa ver isso escrito na tela.
//
// Derivado do prefixo da chave, nunca de flag — flag e chave podem discordar.
export type ModoPagamentoLoja = "demonstracao" | "teste" | "producao";

export async function modoPagamento(): Promise<ModoPagamentoLoja> {
  const chave = await lerSegredoApp(CHAVE_SECRETA);
  const m = modoDaChave(chave);
  if (m === "teste") return "teste";
  if (m === "producao") return "producao";
  // `invalida` cai aqui junto com `nenhum`: chave que nao serve nao cobra nada,
  // e o checkout tambem a trata como ausente. Dizer "demonstracao" e a verdade.
  return "demonstracao";
}

async function chamar(
  metodo: string,
  caminho: string,
  corpo?: unknown,
  cabecalhos?: Record<string, string>,
): Promise<RespostaApi> {
  const chave = await chaveDoCanal();
  if (!chave.startsWith("ask_")) {
    return {
      ok: false,
      status: 0,
      dados: null,
      erro_codigo: "chave_ausente",
      erro_mensagem: `Nao ha chave de canal para o dominio ${await hostDaRequisicao()}.`,
    };
  }

  let r: Response;
  try {
    r = await fetch(`${BASE}${caminho}`, {
      method: metodo,
      headers: {
        authorization: `Bearer ${chave}`,
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
// externa porque vira `url_sucesso` do checkout — o cliente e devolvido para la,
// e com duas vitrines ele PRECISA voltar para a loja onde comprou.
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
