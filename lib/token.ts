import { createHmac, timingSafeEqual } from "node:crypto";

// Token de acompanhamento (SPEC/03 rev. 18/08): o hub anexa ?pedido=<numero>&t=<token>
// a url_sucesso. Sem token valido, o GET /v1/pedidos responde 404 — indistinguivel
// de pedido inexistente. E o que impede enumeracao pela pagina publica da vitrine.

const SEGREDO = process.env.TOKEN_SECRET ?? "";

export function assinarAcompanhamento(numero: string, validadeHoras = 24): string {
  const exp = Math.floor(Date.now() / 1000) + validadeHoras * 3600;
  const mac = createHmac("sha256", SEGREDO).update(`${numero}|${exp}`).digest("base64url");
  return `${exp}.${mac}`;
}

export function verificarAcompanhamento(numero: string, t: string | null): boolean {
  if (!SEGREDO || !t) return false;
  const [expStr, mac] = t.split(".");
  const exp = Number(expStr);
  if (!exp || !mac || exp < Math.floor(Date.now() / 1000)) return false;
  const esperado = createHmac("sha256", SEGREDO).update(`${numero}|${exp}`).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---------------------------------------------------------- verificacao de e-mail
//
// A conta criada com e-mail+senha nasce NAO verificada e, ate 06/09, nao havia
// como verifica-la: so o Google marcava `verificado`. Resultado: quem criava
// conta por senha nunca via os proprios pedidos. Este token e o que fecha esse
// buraco.
//
// Stateless por desenho, como o de acompanhamento: sem tabela, sem estado para
// expirar sozinho. O token carrega a conta e o vencimento, e o HMAC prova que
// saiu daqui. Usar duas vezes e inofensivo — a segunda vez encontra a conta ja
// verificada e nao muda nada.
const VALIDADE_VERIFICACAO_HORAS = 72;

export function assinarVerificacaoEmail(contaId: string): string {
  const exp = Math.floor(Date.now() / 1000) + VALIDADE_VERIFICACAO_HORAS * 3600;
  const mac = createHmac("sha256", SEGREDO).update(`verificar-email|${contaId}|${exp}`).digest("base64url");
  return `${contaId}.${exp}.${mac}`;
}

// Devolve o id da conta, ou null se o token e invalido/vencido/adulterado.
export function contaDoTokenVerificacao(t: string | null | undefined): string | null {
  if (!SEGREDO || !t) return null;
  const partes = String(t).split(".");
  if (partes.length !== 3) return null;
  const [contaId, expStr, mac] = partes;
  const exp = Number(expStr);
  if (!contaId || !exp || !mac) return null;
  if (exp < Math.floor(Date.now() / 1000)) return null;
  const esperado = createHmac("sha256", SEGREDO).update(`verificar-email|${contaId}|${exp}`).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return contaId;
}
