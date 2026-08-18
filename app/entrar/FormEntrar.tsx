"use client";

import { useActionState } from "react";
import { entrar } from "../painel/acoes";
import { ESTADO_ENTRAR_INICIAL } from "../painel/tipos";

export default function FormEntrar() {
  const [estado, acao, pendente] = useActionState(entrar, ESTADO_ENTRAR_INICIAL);

  return (
    <form action={acao}>
      <div>
        <label htmlFor="email">E-mail</label>
        <input id="email" type="email" name="email" required autoComplete="username" autoFocus />
      </div>
      <div>
        <label htmlFor="senha">Senha</label>
        <input id="senha" type="password" name="senha" required autoComplete="current-password" />
      </div>
      <button type="submit" disabled={pendente}>
        {pendente ? "Entrando…" : "Entrar"}
      </button>
      {estado.erro ? <p className="erro">{estado.erro}</p> : null}
    </form>
  );
}
