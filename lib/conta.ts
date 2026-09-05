import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Conta do cliente final (migracao 012): senha com scrypt e sessao assinada.
// O mesmo TOKEN_SECRET do acompanhamento assina a sessao — um segredo, um dono.
// A sessao e um token portavel "id.exp.mac": a vitrine guarda em cookie httpOnly
// e a API /v1/conta/* verifica sem consultar banco.

const SEGREDO = process.env.TOKEN_SECRET ?? "";

export const COOKIE_SESSAO = "sessao_conta";
export const DIAS_SESSAO = 30;

// Destino de retorno pos-login (?voltar=...): so caminho RELATIVO do nosso
// proprio site. "//" e "\\" barrados — virariam redirect aberto para outro
// dominio, o classico open redirect de phishing.
export function voltarValido(v: string): boolean {
  return v.startsWith("/") && !v.startsWith("//") && !v.includes("\\") && v.length <= 200;
}

// scrypt com sal proprio, formato versionado "s2$<sal>$<hash>" — da para trocar
// de algoritmo no futuro sem invalidar as senhas antigas.
export function hashSenha(senha: string): string {
  const sal = randomBytes(16);
  const hash = scryptSync(senha, sal, 32);
  return `s2$${sal.toString("base64url")}$${hash.toString("base64url")}`;
}

export function conferirSenha(senha: string, guardado: string | null): boolean {
  if (!guardado) return false;
  const partes = guardado.split("$");
  if (partes.length !== 3 || partes[0] !== "s2") return false;
  const sal = Buffer.from(partes[1], "base64url");
  const esperado = Buffer.from(partes[2], "base64url");
  const hash = scryptSync(senha, sal, esperado.length);
  return hash.length === esperado.length && timingSafeEqual(hash, esperado);
}

export function assinarSessao(contaId: string, dias = DIAS_SESSAO): string {
  const exp = Math.floor(Date.now() / 1000) + dias * 86400;
  const mac = createHmac("sha256", SEGREDO).update(`conta|${contaId}|${exp}`).digest("base64url");
  return `${contaId}.${exp}.${mac}`;
}

// Devolve o id da conta, ou null. Nunca lanca: sessao invalida e fluxo normal
// (cookie velho, segredo trocado), nao excecao.
export function verificarSessao(token: string | null | undefined): string | null {
  if (!SEGREDO || !token) return null;
  const [id, expStr, mac] = token.split(".");
  const exp = Number(expStr);
  if (!id || !exp || !mac || exp < Math.floor(Date.now() / 1000)) return null;
  const esperado = createHmac("sha256", SEGREDO).update(`conta|${id}|${exp}`).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return id;
}
