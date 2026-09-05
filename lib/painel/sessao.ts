import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { db } from "../db";

// Autenticacao do backoffice — SPEC/08 §10.
// Sessao OPACA em tabela, nunca token autocontido: num hub que guarda codigo de
// eSIM, revogar tem que cortar o acesso no mesmo segundo. Apagar a linha basta.

const COOKIE = "painel_sessao";
const HORAS_VALIDADE = 12;
const MAX_FALHAS = 8; // por IP, na janela abaixo
const JANELA_FALHAS = "15 minutes";

export interface UsuarioSessao {
  id: string;
  nome: string;
  email: string;
  papel: string;
}

// ---------------------------------------------------------------- senha

// Formato guardado: scrypt$N$r$p$<salt-hex>$<hash-hex>. O custo fica gravado
// junto para poder aumentar depois sem invalidar as senhas antigas.
export function hashSenha(senha: string): string {
  const N = 16384, r = 8, p = 1;
  const salt = randomBytes(16);
  const dk = scryptSync(senha, salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${dk.toString("hex")}`;
}

export function conferirSenha(senha: string, guardado: string): boolean {
  try {
    const partes = guardado.split("$");
    if (partes.length !== 6 || partes[0] !== "scrypt") return false;
    const N = Number(partes[1]), r = Number(partes[2]), p = Number(partes[3]);
    const salt = Buffer.from(partes[4], "hex");
    const esperado = Buffer.from(partes[5], "hex");
    const dk = scryptSync(senha, salt, esperado.length, { N, r, p, maxmem: 64 * 1024 * 1024 });
    // Comparacao de tempo constante: comparacao normal vaza o tamanho do prefixo certo.
    return dk.length === esperado.length && timingSafeEqual(dk, esperado);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- pedido

function sha(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export async function ipDaRequisicao(): Promise<string> {
  const h = await headers();
  const ff = h.get("x-forwarded-for") ?? "";
  const primeiro = ff.split(",")[0].trim();
  return primeiro || h.get("x-real-ip") || "0.0.0.0";
}

async function userAgent(): Promise<string> {
  const h = await headers();
  return (h.get("user-agent") ?? "").slice(0, 300);
}

// ---------------------------------------------------------------- auditoria

export async function auditar(
  acao: string,
  opcoes: { usuarioId?: string | null; entidade?: string | null; entidadeId?: string | null; antes?: unknown; depois?: unknown } = {},
): Promise<void> {
  try {
    const ip = await ipDaRequisicao();
    await db.query(
      `insert into log_auditoria (usuario_id, acao, entidade, entidade_id, antes, depois, ip)
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::inet)`,
      [
        opcoes.usuarioId ?? null,
        acao,
        opcoes.entidade ?? null,
        opcoes.entidadeId ?? null,
        opcoes.antes === undefined ? null : JSON.stringify(opcoes.antes),
        opcoes.depois === undefined ? null : JSON.stringify(opcoes.depois),
        ip,
      ],
    );
  } catch (e) {
    // Auditoria nunca derruba a acao principal, mas o erro precisa aparecer.
    console.error("auditoria:", e);
  }
}

// Limite de tentativas: o padrao herdado nao tinha, e sem isso a tela de login e
// forca bruta livre (SPEC/08 §10, correcao obrigatoria 1). Conta no proprio
// log_auditoria, que ja guarda o IP — nao precisa de tabela nova.
export async function excedeuTentativas(): Promise<boolean> {
  try {
    const ip = await ipDaRequisicao();
    const r = await db.query(
      `select count(*)::int as n from log_auditoria
        where acao = 'painel.login.falha' and ip = $1::inet
          and quando > now() - interval '${JANELA_FALHAS}'`,
      [ip],
    );
    return (r.rows[0]?.n ?? 0) >= MAX_FALHAS;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- sessao

// Cria a linha da sessao e devolve o TOKEN CRU, sem tocar em cookie. Existe
// separada porque o login pelo Google acontece em DOIS processos de requisicao:
// a API (/v1/conta/google) cria a sessao, mas quem responde ao NAVEGADOR e a
// rota da vitrine (/conta/google/volta) — o cookie tem que ser gravado la.
export async function novaSessaoToken(usuarioId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const ip = await ipDaRequisicao();
  await db.query(
    `insert into sessao_painel (usuario_id, token_hash, expira_em, ip_hash, user_agent)
     values ($1, $2, now() + interval '${HORAS_VALIDADE} hours', $3, $4)`,
    [usuarioId, sha(token), sha(ip), await userAgent()],
  );
  return token;
}

// Quantas horas a sessao vale — exportado para quem grava o cookie fora daqui
// (o Max-Age do cookie tem que casar com o expira_em da linha).
export const HORAS_SESSAO_PAINEL = HORAS_VALIDADE;

export async function criarSessao(usuarioId: string): Promise<void> {
  const token = await novaSessaoToken(usuarioId);

  // `secure` vem do protocolo real visto pelo proxy. Em producao o Nginx manda
  // X-Forwarded-Proto: https e o cookie sai marcado; no loopback (teste) sai sem
  // a marca, senao o navegador simplesmente nao guarda e o login "nao funciona"
  // sem dar erro nenhum.
  const h = await headers();
  const seguro = (h.get("x-forwarded-proto") ?? "http") === "https";

  const c = await cookies();
  c.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: seguro,
    path: "/painel",
    maxAge: HORAS_VALIDADE * 3600,
  });
}

export async function usuarioDaSessao(): Promise<UsuarioSessao | null> {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (!token) return null;

  const r = await db.query(
    `select u.id, u.nome, u.email::text as email, u.papel::text as papel
       from sessao_painel s
       join usuario u on u.id = s.usuario_id and u.ativo
      where s.token_hash = $1 and s.revogada_em is null and s.expira_em > now()`,
    [sha(token)],
  );
  if (r.rows.length === 0) return null;
  const u = r.rows[0];
  return { id: u.id, nome: u.nome, email: u.email, papel: u.papel };
}

export async function encerrarSessao(): Promise<void> {
  const c = await cookies();
  const token = c.get(COOKIE)?.value;
  if (token) {
    await db.query(
      "update sessao_painel set revogada_em = now() where token_hash = $1 and revogada_em is null",
      [sha(token)],
    );
  }
  c.delete({ name: COOKIE, path: "/painel" });
}
