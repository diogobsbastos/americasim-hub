"use client";

import Link from "next/link";
import { useActionState } from "react";
import { criarConta } from "./acoes";
import { ESTADO_CONTA_INICIAL } from "./tipos";

export default function FormCriar({ temGoogle }: { temGoogle: boolean }) {
  const [estado, acao, pendente] = useActionState(criarConta, ESTADO_CONTA_INICIAL);

  return (
    <div className="compra">
      {temGoogle ? (
        <>
          <a className="botao" href="/conta/google" style={{ display: "block", textAlign: "center" }}>
            Continuar com Google
          </a>
          <p className="nota" style={{ textAlign: "center", margin: "10px 0" }}>ou crie com e-mail e senha</p>
        </>
      ) : null}

      <form action={acao}>
        <label className="rotulo" htmlFor="ne">E-mail (o mesmo das suas compras)</label>
        <input id="ne" type="email" name="email" required autoComplete="email" disabled={pendente} />
        <label className="rotulo" htmlFor="ns">Senha (minimo 8 caracteres)</label>
        <input id="ns" type="password" name="senha" required minLength={8} autoComplete="new-password" disabled={pendente} />
        <label className="rotulo" htmlFor="ns2">Repita a senha</label>
        <input id="ns2" type="password" name="senha2" required minLength={8} autoComplete="new-password" disabled={pendente} />
        <button type="submit" disabled={pendente}>{pendente ? "Criando…" : "Criar conta"}</button>
        {estado.erro ? <p className="erro">{estado.erro}</p> : null}
      </form>

      <p className="nota">
        Ja tem conta? <Link href="/conta/entrar">Entrar</Link>
      </p>
    </div>
  );
}
