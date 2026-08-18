import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { salvarCredencial } from "../../../../../lib/canal-credencial";
import { conectorPorTipo } from "../../../../../lib/conectores";
import { db } from "../../../../../lib/db";
import { auditar, usuarioDaSessao } from "../../../../../lib/painel/sessao";

export const dynamic = "force-dynamic";

const COOKIE_ESTADO = "conexao_estado";
const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";

// GET /painel/conexoes/<tipo>/retorno?code=...&state=...
//
// A volta do marketplace. Tres coisas acontecem aqui, nesta ordem, e nenhuma
// pode ser pulada:
//   1. conferir o `state` contra o cookie — e o que impede alguem plantar uma
//      autorizacao de OUTRA conta no seu hub;
//   2. trocar o `code` pelo token, no servidor, com o segredo da aplicacao —
//      o segredo nunca vai para o navegador;
//   3. gravar CIFRADO e so entao ligar o canal.
export async function GET(req: Request, ctx: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await ctx.params;
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "";
  const estadoVeio = url.searchParams.get("state") ?? "";
  const erroMl = url.searchParams.get("error") ?? "";

  const u = await usuarioDaSessao();
  if (!u || u.papel !== "admin") return volta("papel");

  const c = conectorPorTipo(tipo);
  if (!c || !c.disponivel) return volta("conector");

  const ck = await cookies();
  const guardado = ck.get(COOKIE_ESTADO)?.value ?? "";
  ck.delete({ name: COOKIE_ESTADO, path: "/painel/conexoes" });

  if (erroMl) {
    await auditar("conexao.autorizar.recusada", {
      usuarioId: u.id, entidade: "canal", depois: { conector: c.tipo, erro: erroMl.slice(0, 200) },
    });
    return volta("recusado");
  }
  // Comparacao simples serve: o valor e aleatorio de 24 bytes e vale 10 min.
  if (!code || !estadoVeio || guardado !== `${tipo}:${estadoVeio}`) return volta("estado");

  const p = await db.query("select valor from parametro where chave = $1", [c.paramClientId]);
  const clientId = (p.rows[0]?.valor ?? "").trim();
  const segredo = (process.env[c.envSecret] ?? "").trim();
  if (!clientId || !segredo) return volta("sem_aplicacao");

  let dados: any;
  try {
    const r = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: segredo,
        code,
        redirect_uri: `${await baseExterna()}/painel/conexoes/${tipo}/retorno`,
      }),
      cache: "no-store",
    });
    dados = await r.json().catch(() => null);
    if (!r.ok || !dados?.access_token) {
      // A mensagem do marketplace vai para o log_sync, nao para a URL: ela pode
      // conter eco de parametro nosso, e URL fica no access log do Nginx.
      await registrarFalha(c.tipo, `HTTP ${r.status} ${JSON.stringify(dados ?? {}).slice(0, 400)}`);
      return volta("troca");
    }
  } catch (e: any) {
    await registrarFalha(c.tipo, `sem resposta: ${String(e?.message ?? e).slice(0, 200)}`);
    return volta("rede");
  }

  // Quem e a conta do outro lado. Vale a viagem: alem de aparecer na tela, e a
  // primeira PROVA de que o token recem-obtido funciona de verdade — melhor
  // descobrir isso agora do que na primeira tentativa de publicar.
  let conta: any = {};
  try {
    const me = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { authorization: `Bearer ${dados.access_token}` },
      cache: "no-store",
    });
    if (me.ok) {
      const j: any = await me.json();
      conta = {
        usuario_marketplace: j?.id ?? dados.user_id ?? null,
        apelido: j?.nickname ?? null,
        site: j?.site_id ?? null,
        // O ML marca a conta de teste no proprio cadastro. Mostrar isso evita a
        // confusao de achar que se esta publicando na loja de verdade.
        teste: String(j?.nickname ?? "").startsWith("TET") || j?.status?.site_status === "test",
      };
    }
  } catch {
    conta = { usuario_marketplace: dados.user_id ?? null };
  }

  const canalQ = await db.query(
    `insert into canal (codigo, nome, tipo, moeda, ativo, config)
     values ($1, $2, $3::tipo_canal, 'BRL', true, $4::jsonb)
     on conflict (codigo) do update set ativo = true, config = excluded.config
     returning id`,
    [c.tipo, c.nome, c.tipo, JSON.stringify(conta)],
  );
  const canalId = canalQ.rows[0].id;

  // `expires_in` vem em segundos (6 h no ML). Guardar o INSTANTE do vencimento,
  // nao a duracao: duracao envelhece sozinha e vira mentira no banco.
  const expiraEm = Number.isFinite(Number(dados.expires_in))
    ? new Date(Date.now() + Number(dados.expires_in) * 1000)
    : null;

  await salvarCredencial(canalId, {
    accessToken: String(dados.access_token),
    refreshToken: String(dados.refresh_token ?? ""),
    expiraEm,
    escopos: String(dados.scope ?? "").split(/\s+/).filter(Boolean),
  });

  // A auditoria guarda que conectou, quem e para qual conta do marketplace —
  // NUNCA o token.
  await auditar("conexao.autorizar.sucesso", {
    usuarioId: u.id, entidade: "canal", entidadeId: canalId,
    depois: {
      conector: c.tipo,
      usuario_marketplace: conta.usuario_marketplace ?? dados.user_id ?? null,
      apelido: conta.apelido ?? null,
      escopos: String(dados.scope ?? ""),
      expira_em: expiraEm?.toISOString() ?? null,
      tem_refresh: !!dados.refresh_token,
    },
  });

  return volta("", true);

  async function volta(erro: string, ok = false): Promise<Response> {
    const base = await baseExterna();
    const q = ok ? "?ok=conectado" : `?erro=${encodeURIComponent(erro)}`;
    return NextResponse.redirect(`${base}/painel/conexoes${q}`);
  }
}

async function registrarFalha(tipo: string, detalhe: string): Promise<void> {
  try {
    await db.query(
      `insert into log_sync (canal_id, entidade, acao, sucesso, detalhe)
       select id, 'credencial', 'autorizar', false, $2 from canal where tipo = $1::tipo_canal`,
      [tipo, detalhe],
    );
  } catch (e) {
    console.error("registrarFalha:", e);
  }
}

async function baseExterna(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "127.0.0.1:3002";
  return `${proto}://${host}`;
}
