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
