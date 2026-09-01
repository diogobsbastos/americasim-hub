import { connect } from "node:tls";
import { configGmail } from "./google";

// Envio de e-mail SEM dependencia: SMTP do Gmail na porta 465 (SSL direto),
// falado na unha sobre node:tls — o mesmo caminho ja provado pelo botao
// "Testar Gmail" da tela /painel/google. Anexo entra como parte MIME em base64
// (a licao do queroconsertar: QR de eSIM PRECISA ir anexado — cliente de
// e-mail bloqueia imagem remota por padrao, e QR bloqueado e produto nao
// entregue). Credencial vem do cofre; NUNCA aparece no dialogo devolvido.

export interface AnexoEmail {
  nome: string;
  tipo: string; // ex.: image/png
  base64: string;
}

export interface MensagemEmail {
  para: string;
  assunto: string;
  html: string;
  deNome?: string; // nome de exibicao do remetente (a marca)
  anexos?: AnexoEmail[];
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const dobrar = (base64: string) => base64.replace(/(.{76})/g, "$1\r\n");
const codificarTitulo = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

function montarMime(usuario: string, m: MensagemEmail): string {
  const limite = "=_americasim_" + Date.now().toString(36);
  const cab = [
    `From: ${m.deNome ? codificarTitulo(m.deNome) + " " : ""}<${usuario}>`,
    `To: <${m.para}>`,
    `Subject: ${codificarTitulo(m.assunto)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${limite}"`,
  ];
  const partes = [
    `--${limite}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${dobrar(b64(m.html))}`,
    ...(m.anexos ?? []).map(
      (a) =>
        `--${limite}\r\nContent-Type: ${a.tipo}; name="${a.nome}"\r\nContent-Disposition: attachment; filename="${a.nome}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${dobrar(a.base64)}`,
    ),
    `--${limite}--`,
  ];
  return cab.join("\r\n") + "\r\n\r\n" + partes.join("\r\n") + "\r\n";
}

// Dialogo SMTP como roteiro: cada passo espera um codigo e manda a proxima
// linha. Resposta 4xx/5xx em qualquer ponto = falha com a linha do servidor
// (que e exatamente o que se quer ler ao depurar).
export async function enviarEmailGmail(m: MensagemEmail): Promise<{ ok: boolean; detalhe: string }> {
  const { usuario, senhaApp } = await configGmail();
  if (!usuario || !senhaApp) {
    return { ok: false, detalhe: "Gmail do robô não configurado (tela Sistema → Google & E-mail)." };
  }
  if (!m.para.includes("@")) return { ok: false, detalhe: `destinatário inválido: ${m.para}` };

  const dados = montarMime(usuario, m);
  const roteiro: { espera: RegExp; multi?: boolean; manda: string }[] = [
    { espera: /^220/, manda: "EHLO americasim.com.br" },
    { espera: /^250/, multi: true, manda: "AUTH LOGIN" },
    { espera: /^334/, manda: b64(usuario) },
    { espera: /^334/, manda: b64(senhaApp) },
    { espera: /^235/, manda: `MAIL FROM:<${usuario}>` },
    { espera: /^250/, manda: `RCPT TO:<${m.para}>` },
    { espera: /^250/, manda: "DATA" },
    { espera: /^354/, manda: dados + "." },
    { espera: /^250/, manda: "QUIT" },
  ];

  return await new Promise((resolve) => {
    let passo = 0;
    let buffer = "";
    let terminado = false;
    const socket = connect({ host: "smtp.gmail.com", port: 465, servername: "smtp.gmail.com" });
    const fim = (ok: boolean, detalhe: string) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(timer);
      try { socket.end(); } catch {}
      resolve({ ok, detalhe });
    };
    const timer = setTimeout(() => fim(false, "tempo esgotado falando com smtp.gmail.com"), 45000);

    socket.on("error", (e) => fim(false, `erro de rede: ${e.message}`));
    socket.on("data", (d) => {
      buffer += d.toString("utf8");
      if (!/\r?\n$/.test(buffer)) return;
      const ultima = buffer.trimEnd().split(/\r?\n/).pop() ?? "";
      buffer = "";

      if (/^[45]\d\d[ -]/.test(ultima)) return fim(false, `Gmail recusou: ${ultima.slice(0, 300)}`);
      const atual = roteiro[passo];
      if (!atual) return; // depois do QUIT o servidor ainda responde 221; ignora
      if (!atual.espera.test(ultima)) return; // linha intermediaria; espera a certa
      if (atual.multi && !/^250 /.test(ultima)) return; // EHLO multi-linha: so a final "250 "

      passo += 1;
      socket.write(atual.manda + "\r\n");
      if (passo >= roteiro.length) fim(true, "enviado");
    });
  });
}
