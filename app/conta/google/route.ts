import { createHmac } from "node:crypto";
import { basePublica } from "../../../lib/vitrine";
import { configGoogle } from "../../../lib/google";
import { voltarValido } from "../../../lib/conta";

export const dynamic = "force-dynamic";

// GET /conta/google — comeco do "Entrar com Google" (OAuth 2 / OpenID Connect).
// A vitrine e quem fala com o Google porque e ela que tem o dominio publico; a
// identidade validada segue depois para a API em /v1/conta/google.
//
// O `state` e anti-CSRF: assinado (ninguem forja) e tambem guardado em cookie
// (o retorno tem que vir do MESMO navegador que comecou).

function assinarEstado(): string {
  const exp = Math.floor(Date.now() / 1000) + 600; // 10 minutos
  const mac = createHmac("sha256", process.env.TOKEN_SECRET ?? "")
    .update(`gstate|${exp}`)
    .digest("base64url");
  return `${exp}.${mac}`;
}

export async function GET(req: Request) {
  const { clientId, clientSecret } = await configGoogle();
  if (!clientId || !clientSecret) {
    return Response.redirect(`${await basePublica()}/conta/entrar?erro=google`, 302);
  }

  // ?voltar=/finalizar?sku=... — quem comecou o login no checkout volta para o
  // checkout, nao para /conta. Guardado em cookie (nao no state) para o state
  // continuar sendo so anti-CSRF.
  const voltar = new URL(req.url).searchParams.get("voltar") ?? "";

  const estado = assinarEstado();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${await basePublica()}/conta/google/volta`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email");
  url.searchParams.set("state", estado);
  url.searchParams.set("prompt", "select_account");

  const h = new Headers();
  h.set("Location", url.toString());
  h.append(
    "Set-Cookie",
    `g_state=${estado}; Path=/conta/google; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
  );
  if (voltarValido(voltar)) {
    h.append(
      "Set-Cookie",
      `g_voltar=${encodeURIComponent(voltar)}; Path=/conta/google; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    );
  }
  return new Response(null, { status: 302, headers: h });
}
