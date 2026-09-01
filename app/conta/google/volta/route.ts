import { createHmac, timingSafeEqual } from "node:crypto";
import { apiPost, basePublica } from "../../../../lib/vitrine";
import { COOKIE_SESSAO, DIAS_SESSAO } from "../../../../lib/conta";

export const dynamic = "force-dynamic";

// GET /conta/google/volta — o retorno do Google. Passos, todos verificados:
// 1. state bate com o cookie E tem assinatura nossa valida (anti-CSRF);
// 2. troca o `code` por tokens direto com o Google (client_secret so no servidor);
// 3. valida o id_token no proprio Google (tokeninfo) e confere que foi emitido
//    para o NOSSO client_id — token de outro app nao entra;
// 4. registra na API (/v1/conta/google) e grava a sessao em cookie httpOnly.
// Qualquer degrau falhando: volta para /conta/entrar?erro=google, sem detalhes
// na URL — os detalhes ficam no log do servidor.

function estadoValido(estado: string): boolean {
  const [expStr, mac] = estado.split(".");
  const exp = Number(expStr);
  if (!exp || !mac || exp < Math.floor(Date.now() / 1000)) return false;
  const esperado = createHmac("sha256", process.env.TOKEN_SECRET ?? "")
    .update(`gstate|${exp}`)
    .digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: Request) {
  const base = await basePublica();
  const falha = (motivo: string) => {
    console.error(`conta/google/volta: ${motivo}`);
    return Response.redirect(`${base}/conta/entrar?erro=google`, 302);
  };

  const u = new URL(req.url);
  const code = u.searchParams.get("code") ?? "";
  const estado = u.searchParams.get("state") ?? "";
  const cookieEstado = (req.headers.get("cookie") ?? "")
    .split(/;\s*/)
    .find((p) => p.startsWith("g_state="))
    ?.slice("g_state=".length) ?? "";

  if (!code || !estado || estado !== cookieEstado || !estadoValido(estado)) {
    return falha("state ausente, divergente ou invalido");
  }

  // 2. code -> tokens
  let idToken = "";
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: `${base}/conta/google/volta`,
        grant_type: "authorization_code",
      }),
    });
    const j: any = await r.json();
    idToken = String(j?.id_token ?? "");
    if (!r.ok || !idToken) return falha(`troca do code falhou: HTTP ${r.status} ${JSON.stringify(j?.error ?? "")}`);
  } catch (e) {
    return falha(`troca do code: ${e}`);
  }

  // 3. valida o id_token no Google e confere o destinatario
  let sub = "", email = "", emailVerificado = false;
  try {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    const j: any = await r.json();
    if (!r.ok) return falha(`tokeninfo falhou: HTTP ${r.status}`);
    if (j?.aud !== process.env.GOOGLE_CLIENT_ID) return falha("id_token de outro client_id");
    sub = String(j?.sub ?? "");
    email = String(j?.email ?? "").toLowerCase();
    emailVerificado = j?.email_verified === "true" || j?.email_verified === true;
    if (!sub || !email) return falha("tokeninfo sem sub/email");
  } catch (e) {
    return falha(`tokeninfo: ${e}`);
  }

  // 4. registra e entra
  const r = await apiPost("/v1/conta/google", { sub, email, email_verificado: emailVerificado });
  const sessao = String(r.dados?.sessao ?? "");
  if (!r.ok || !sessao) return falha(`/v1/conta/google: ${r.erro_codigo}`);

  const h = new Headers();
  h.set("Location", `${base}/conta`);
  h.append(
    "Set-Cookie",
    `${COOKIE_SESSAO}=${sessao}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DIAS_SESSAO * 86400}`,
  );
  h.append("Set-Cookie", "g_state=; Path=/conta/google; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  return new Response(null, { status: 302, headers: h });
}
