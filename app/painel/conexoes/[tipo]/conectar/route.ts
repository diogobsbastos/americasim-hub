import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { conectorPorTipo } from "../../../../../lib/conectores";
import { lerSegredoApp } from "../../../../../lib/segredo-app";
import { db } from "../../../../../lib/db";
import { auditar, usuarioDaSessao } from "../../../../../lib/painel/sessao";

export const dynamic = "force-dynamic";

const COOKIE_ESTADO = "conexao_estado";

// GET /painel/conexoes/<tipo>/conectar — comeca o vaivem de autorizacao.
//
// O parametro `state` NAO e enfeite: sem ele, alguem pode fazer o seu navegador
// completar uma autorizacao que quem escolheu foi essa pessoa, e a conta do
// marketplace que fica ligada ao hub e a dela. Geramos um valor aleatorio,
// guardamos num cookie httpOnly e conferimos na volta.
export async function GET(_req: Request, ctx: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await ctx.params;

  const u = await usuarioDaSessao();
  if (!u) return NextResponse.redirect(await destino("/entrar"));
  if (u.papel !== "admin") return NextResponse.redirect(await destino("/painel/conexoes?erro=papel"));

  const c = conectorPorTipo(tipo);
  if (!c || !c.disponivel || !c.autorizacaoBase) {
    return NextResponse.redirect(await destino("/painel/conexoes?erro=conector"));
  }

  const p = await db.query("select valor from parametro where chave = $1", [c.paramClientId]);
  const clientId = (p.rows[0]?.valor ?? "").trim();
  // Ambiente primeiro, banco depois — lerSegredoApp cuida da ordem.
  const segredo = await lerSegredoApp(c.envSecret);
  if (!clientId) return NextResponse.redirect(await destino("/painel/conexoes?erro=sem_aplicacao"));
  if (!segredo) return NextResponse.redirect(await destino("/painel/conexoes?erro=sem_segredo"));

  const estado = randomBytes(24).toString("base64url");
  const ck = await cookies();
  ck.set(COOKIE_ESTADO, `${tipo}:${estado}`, {
    httpOnly: true,
    sameSite: "lax", // "lax" e nao "strict": o cookie precisa sobreviver ao retorno vindo do marketplace
    secure: (await protocolo()) === "https",
    path: "/painel/conexoes",
    maxAge: 600,
  });

  await auditar("conexao.autorizar.inicio", {
    usuarioId: u.id, entidade: "canal", depois: { conector: c.tipo },
  });

  const url = new URL(c.autorizacaoBase);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", await urlDeRetorno(tipo));
  url.searchParams.set("state", estado);
  return NextResponse.redirect(url.toString());
}

async function protocolo(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-proto") ?? "http";
}

async function baseExterna(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "127.0.0.1:3002";
  return `${await protocolo()}://${host}`;
}

async function urlDeRetorno(tipo: string): Promise<string> {
  return `${await baseExterna()}/painel/conexoes/${tipo}/retorno`;
}

async function destino(caminho: string): Promise<string> {
  return `${await baseExterna()}${caminho}`;
}
