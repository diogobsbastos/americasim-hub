"use client";

import { useActionState } from "react";
import { salvarGmail, salvarLoginGoogle, testarGmailAcao, testarLoginGoogleAcao } from "./acoes";
import { ESTADO_GOOGLE_INICIAL } from "./tipos";

function Resultado({ erro, ok, previa }: { erro: string; ok: string; previa: string }) {
  return (
    <>
      {erro ? <p style={{ color: "var(--erro)", margin: "8px 0 0", fontSize: "0.84rem" }}>{erro}</p> : null}
      {ok ? <p style={{ color: "var(--ok)", margin: "8px 0 0", fontSize: "0.84rem" }}>{ok}</p> : null}
      {previa ? (
        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: "pointer", fontSize: "0.8rem" }}>diálogo completo</summary>
          <pre style={{ margin: "6px 0 0", fontSize: "0.72rem", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 260, overflow: "auto" }}>{previa}</pre>
        </details>
      ) : null}
    </>
  );
}

const rotulo = { display: "block", fontSize: "0.78rem", color: "var(--texto-fraco)", margin: "10px 0 4px" } as const;
const campo = { width: "100%", maxWidth: 520 } as const;

// Dois cofres na mesma tela: o LOGIN das lojas (OAuth) e o GMAIL do robo
// (senha de app). O que NAO e segredo (Client ID, usuario) aparece gravado no
// campo; Secret e senha de app sao write-only — so o status de onde estao.
// Formularios com autofill desligado: o navegador enchia os campos com o login
// PESSOAL do operador e um Guardar descuidado sobrescreveria o valor certo.
export default function CartaoGoogle({
  ondeId, ondeSecret, ondeUsuario, ondeSenha, valorId, valorUsuario, podeAdmin,
}: {
  ondeId: string; ondeSecret: string; ondeUsuario: string; ondeSenha: string;
  valorId: string; valorUsuario: string; podeAdmin: boolean;
}) {
  const [eL, aL, pL] = useActionState(salvarLoginGoogle, ESTADO_GOOGLE_INICIAL);
  const [eTL, aTL, pTL] = useActionState(testarLoginGoogleAcao, ESTADO_GOOGLE_INICIAL);
  const [eG, aG, pG] = useActionState(salvarGmail, ESTADO_GOOGLE_INICIAL);
  const [eTG, aTG, pTG] = useActionState(testarGmailAcao, ESTADO_GOOGLE_INICIAL);

  const st = (v: string) =>
    v === "banco" ? "✅ no cofre" : v === "ambiente" ? "✅ no .env (prioridade)" : v === "ilegivel" ? "⚠️ gravado mas ilegível" : "— vazio";

  return (
    <>
      <div className="cartao" style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: "0.95rem", textTransform: "uppercase", margin: "0 0 6px" }}>
          Entrar com Google (login das lojas)
        </h2>
        <p className="nota" style={{ marginTop: 0 }}>
          Do Google Cloud Console → Credentials → cliente OAuth. Client ID: <b>{st(ondeId)}</b> ·
          Client Secret: <b>{st(ondeSecret)}</b>. O botão aparece nas lojas quando os dois existem.
        </p>
        {podeAdmin ? (
          <form action={aL} autoComplete="off">
            <label style={rotulo} htmlFor="gid">Client ID (termina em .apps.googleusercontent.com)</label>
            <input id="gid" name="client_id" style={campo} defaultValue={valorId} autoComplete="off" disabled={pL} />
            <label style={rotulo} htmlFor="gsec">Client Secret (começa com GOCSPX- · guardado, não reaparece por segurança)</label>
            <input id="gsec" name="client_secret" type="password" style={campo} autoComplete="new-password" data-lpignore="true" disabled={pL} />
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button type="submit" disabled={pL}>{pL ? "Guardando…" : "Guardar no cofre"}</button>
            </div>
          </form>
        ) : null}
        <form action={aTL} style={{ marginTop: 10 }}>
          <button type="submit" className="secundario" disabled={pTL}>{pTL ? "Testando…" : "Testar credencial"}</button>
        </form>
        <Resultado {...eL} />
        <Resultado {...eTL} />
      </div>

      <div className="cartao" style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: "0.95rem", textTransform: "uppercase", margin: "0 0 6px" }}>
          Gmail do robô (requisições e respostas por e-mail)
        </h2>
        <p className="nota" style={{ marginTop: 0 }}>
          Conta que envia as requisições de ICCID e vigia as respostas com CSV. Usuário: <b>{st(ondeUsuario)}</b> ·
          Senha de app: <b>{st(ondeSenha)}</b>. Senha de app se gera em myaccount.google.com/apppasswords
          (verificação em 2 etapas ligada) — pode colar com espaços, a tela limpa.
        </p>
        {podeAdmin ? (
          <form action={aG} autoComplete="off">
            <label style={rotulo} htmlFor="gu">Usuário (e-mail completo)</label>
            <input id="gu" name="usuario" style={campo} defaultValue={valorUsuario} autoComplete="off" disabled={pG} />
            <label style={rotulo} htmlFor="gs">Senha de app (16 caracteres · guardada, não reaparece por segurança)</label>
            <input id="gs" name="senha_app" type="password" style={campo} autoComplete="new-password" data-lpignore="true" disabled={pG} />
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button type="submit" disabled={pG}>{pG ? "Guardando…" : "Guardar no cofre"}</button>
            </div>
          </form>
        ) : null}
        <form action={aTG} style={{ marginTop: 10 }}>
          <button type="submit" className="secundario" disabled={pTG}>{pTG ? "Testando…" : "Testar Gmail (login SMTP de verdade)"}</button>
        </form>
        <Resultado {...eG} />
        <Resultado {...eTG} />
      </div>
    </>
  );
}
