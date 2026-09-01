import { connect } from "node:tls";
import { lerSegredoApp } from "./segredo-app";

// Credenciais do Google num lugar so, lidas do cofre (parametro cifrado) com o
// env tendo prioridade — mesmo contrato do lib/segredo-app. Duas familias:
//
//   login das vitrines (botao "Entrar com Google"):
//     GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
//   robo de e-mail (ler a caixa e responder, via IMAP/SMTP com senha de app):
//     GMAIL_USUARIO / GMAIL_SENHA_APP
//
// A tela que grava e /painel/google. NADA aqui devolve valor para tela.

export const SEG_GOOGLE_ID = "GOOGLE_CLIENT_ID";
export const SEG_GOOGLE_SECRET = "GOOGLE_CLIENT_SECRET";
export const SEG_GMAIL_USUARIO = "GMAIL_USUARIO";
export const SEG_GMAIL_SENHA = "GMAIL_SENHA_APP";

export async function configGoogle(): Promise<{ clientId: string; clientSecret: string }> {
  return {
    clientId: await lerSegredoApp(SEG_GOOGLE_ID),
    clientSecret: await lerSegredoApp(SEG_GOOGLE_SECRET),
  };
}

export async function googleConfigurado(): Promise<boolean> {
  const c = await configGoogle();
  return Boolean(c.clientId && c.clientSecret);
}

export async function configGmail(): Promise<{ usuario: string; senhaApp: string }> {
  return {
    usuario: await lerSegredoApp(SEG_GMAIL_USUARIO),
    senhaApp: await lerSegredoApp(SEG_GMAIL_SENHA),
  };
}

// Testa o par Client ID/Secret sem navegador: pede um token com um code falso.
// Google com credencial CERTA responde `invalid_grant` (o code e que nao vale);
// com credencial ERRADA responde `invalid_client`. E deterministico e barato.
export async function testarCredencialGoogle(): Promise<{ ok: boolean; resumo: string; corpo: string }> {
  const { clientId, clientSecret } = await configGoogle();
  if (!clientId || !clientSecret) {
    return { ok: false, resumo: "Faltam Client ID e/ou Client Secret.", corpo: "" };
  }
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: "teste-invalido",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: "https://americasim.com.br/conta/google/volta",
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(15000),
    });
    const j: any = await r.json().catch(() => ({}));
    const erro = String(j?.error ?? "");
    if (erro === "invalid_grant") {
      return { ok: true, resumo: "Credencial válida (o Google reconheceu o Client ID + Secret).", corpo: JSON.stringify(j) };
    }
    if (erro === "invalid_client" || erro === "unauthorized_client") {
      return { ok: false, resumo: "O Google recusou o par Client ID + Secret. Confira se copiou os dois inteiros.", corpo: JSON.stringify(j) };
    }
    return { ok: false, resumo: `Resposta inesperada do Google (${erro || r.status}).`, corpo: JSON.stringify(j) };
  } catch (e: any) {
    return { ok: false, resumo: `Sem resposta do Google: ${e?.message ?? e}`, corpo: "" };
  }
}

// Testa usuario + senha de app fazendo um login SMTP de verdade (porta 465,
// mesma credencial do IMAP). 235 = autenticado; 535 = senha de app recusada.
// A senha NUNCA aparece no dialogo devolvido.
export async function testarSmtpGmail(): Promise<{ ok: boolean; resumo: string; dialogo: string }> {
  const { usuario, senhaApp } = await configGmail();
  if (!usuario || !senhaApp) {
    return { ok: false, resumo: "Faltam usuário e/ou senha de app do Gmail.", dialogo: "" };
  }

  return await new Promise((resolve) => {
    const linhas: string[] = [];
    let etapa = 0;
    let buffer = "";
    let terminado = false;

    const socket = connect({ host: "smtp.gmail.com", port: 465, servername: "smtp.gmail.com" });
    const fim = (ok: boolean, resumo: string) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(timer);
      try { socket.write("QUIT\r\n"); socket.end(); } catch {}
      resolve({ ok, resumo, dialogo: linhas.join("\n") });
    };
    const timer = setTimeout(() => fim(false, "Tempo esgotado falando com smtp.gmail.com (rede/firewall?)."), 15000);
    const mandar = (texto: string, mascarar = false) => {
      linhas.push("> " + (mascarar ? "****" : texto));
      socket.write(texto + "\r\n");
    };

    socket.on("error", (e) => fim(false, `Erro de rede: ${e.message}`));
    socket.on("data", (d) => {
      buffer += d.toString("utf8");
      if (!/\r?\n$/.test(buffer)) return;
      const bloco = buffer.trimEnd();
      buffer = "";
      const ultima = bloco.split(/\r?\n/).pop() ?? "";
      linhas.push("< " + ultima);

      if (etapa === 0 && ultima.startsWith("220")) {
        etapa = 1; mandar("EHLO americasim.com.br");
      } else if (etapa === 1 && /^250[ -]/.test(ultima)) {
        // resposta multi-linha: so avanca quando vier a linha final "250 "
        if (!/^250 /.test(ultima)) return;
        etapa = 2; mandar("AUTH LOGIN");
      } else if (etapa === 2 && ultima.startsWith("334")) {
        etapa = 3; mandar(Buffer.from(usuario).toString("base64"));
      } else if (etapa === 3 && ultima.startsWith("334")) {
        etapa = 4; mandar(Buffer.from(senhaApp).toString("base64"), true);
      } else if (etapa === 4) {
        if (ultima.startsWith("235")) fim(true, `Autenticado no Gmail como ${usuario}. A mesma credencial vale para ler a caixa (IMAP).`);
        else if (ultima.startsWith("535")) fim(false, "O Gmail recusou a senha de app. Gere uma nova em myaccount.google.com/apppasswords e cole os 16 caracteres.");
        else fim(false, `Resposta inesperada do Gmail: ${ultima}`);
      } else if (/^5\d\d[ -]/.test(ultima)) {
        fim(false, `O Gmail respondeu erro: ${ultima}`);
      }
    });
  });
}
