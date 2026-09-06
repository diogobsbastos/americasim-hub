"use client";

import { useActionState } from "react";
import { trocarSenha } from "./acoes";
import { ESTADO_PERFIL_INICIAL } from "../tipos";

// Senha do cliente. Conta que nasceu pelo Google nao TEM senha — entao o
// mesmo cartao vira "criar uma senha" (sem pedir a atual, porque nao existe).
export default function FormSenha({ temSenha }: { temSenha: boolean }) {
  const [estado, acao, pendente] = useActionState(trocarSenha, ESTADO_PERFIL_INICIAL);

  return (
    <form action={acao} className="pilha">
      {temSenha ? (
        <div>
          <label className="rotulo" htmlFor="sn-atual">Senha atual</label>
          <input
            id="sn-atual"
            type="password"
            name="senha_atual"
            required
            autoComplete="current-password"
            disabled={pendente}
          />
        </div>
      ) : (
        <p className="fin-dica" style={{ marginTop: 0 }}>
          Sua conta entra pelo Google e ainda não tem senha. Crie uma para também
          poder entrar com e-mail e senha.
        </p>
      )}
      <div>
        <label className="rotulo" htmlFor="sn-nova">{temSenha ? "Nova senha" : "Senha"}</label>
        <input
          id="sn-nova"
          type="password"
          name="senha_nova"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Pelo menos 8 caracteres"
          disabled={pendente}
        />
      </div>
      <div>
        <label className="rotulo" htmlFor="sn-nova2">{temSenha ? "Repita a nova senha" : "Repita a senha"}</label>
        <input
          id="sn-nova2"
          type="password"
          name="senha_nova2"
          required
          minLength={8}
          autoComplete="new-password"
          disabled={pendente}
        />
      </div>
      <button type="submit" className="botao secundario" disabled={pendente} style={{ border: "1px solid var(--borda)" }}>
        {pendente ? "Enviando…" : temSenha ? "Trocar senha" : "Criar senha"}
      </button>
      {estado.erro ? <p className="erro">{estado.erro}</p> : null}
      {estado.ok ? <p className="feito">{estado.ok}</p> : null}
    </form>
  );
}
