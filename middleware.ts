import { NextResponse, type NextRequest } from "next/server";
import {
  COOKIE_VISITA,
  COOKIE_ULTIMO,
  COOKIE_PRIMEIRO,
  DIAS_VISITA,
  DIAS_TOQUE,
  toqueDaRequisicao,
  temSinalDeOrigem,
  codificar,
} from "./lib/atribuicao";

// Captura de origem — migracao 004.
//
// Por que no middleware e nao numa pagina: o middleware roda ANTES de qualquer
// rota. O gclid/fbclid so vem no primeiro clique do anuncio; se a captura
// dependesse de o visitante abrir uma pagina especifica, o dado se perderia
// justamente em quem entra e sai.
//
// Nao grava nada no banco. Loja publica com escrita em toda visita e alvo de
// inundacao: a atribuicao vira linha no banco so na conversao, que e quando ela
// passa a valer alguma coisa.

export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  // `secure` vem do protocolo real visto pelo proxy. No loopback (teste) sai sem
  // a marca, senao o navegador simplesmente nao guarda e a captura "nao funciona"
  // sem dar erro nenhum — o mesmo cuidado do cookie de sessao do painel.
  const seguro = (req.headers.get("x-forwarded-proto") ?? "http") === "https";
  const base = { httpOnly: true, sameSite: "lax" as const, secure: seguro, path: "/" };

  if (!req.cookies.get(COOKIE_VISITA)) {
    res.cookies.set(COOKIE_VISITA, crypto.randomUUID(), {
      ...base,
      maxAge: DIAS_VISITA * 86400,
    });
  }

  const toque = toqueDaRequisicao(req.nextUrl, req.headers.get("referer"), Date.now());

  // So sobrescreve o ultimo toque quando ha sinal DE VERDADE. Sem esta guarda,
  // cada clique interno viraria um toque "direto" e apagaria o credito do
  // anuncio que trouxe a pessoa — o erro classico de atribuicao.
  if (temSinalDeOrigem(toque)) {
    const v = codificar(toque);
    res.cookies.set(COOKIE_ULTIMO, v, { ...base, maxAge: DIAS_TOQUE * 86400 });
    // Primeiro toque e gravado UMA vez e nunca sobrescrito: e ele que responde
    // "quem trouxe este cliente", enquanto o ultimo responde "quem fechou".
    if (!req.cookies.get(COOKIE_PRIMEIRO)) {
      res.cookies.set(COOKIE_PRIMEIRO, v, { ...base, maxAge: DIAS_VISITA * 86400 });
    }
  }

  return res;
}

export const config = {
  // Fora: a API (cliente externo nao tem cookie), o backoffice, o login e os
  // estaticos. Rodar no /v1 so gastaria tempo em toda requisicao de integracao.
  matcher: ["/((?!v1|painel|entrar|_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
