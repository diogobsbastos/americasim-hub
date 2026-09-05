"use client";

import Link from "next/link";
import { useActionState } from "react";
import { criarConta } from "./acoes";
import { ESTADO_CONTA_INICIAL } from "./tipos";

export default function FormCriar({ temGoogle }: { temGoogle: boolean }) {
  const [estado, acao, pendente] = useActionState(criarConta, ESTADO_CONTA_INICIAL);

  return (
    <div className="compra">
      <form action={acao} className="pilha">
        <div>
          <label className="rotulo" htmlFor="ne">E-mail (o mesmo das suas compras)</label>
          <input id="ne" type="email" name="email" required autoComplete="email" disabled={pendente} />
        </div>
        <div>
          <label className="rotulo" htmlFor="ns">Senha (mínimo 8 caracteres)</label>
          <input id="ns" type="password" name="senha" required minLength={8} autoComplete="new-password" disabled={pendente} />
        </div>
        <div>
          <label className="rotulo" htmlFor="ns2">Repita a senha</label>
          <input id="ns2" type="password" name="senha2" required minLength={8} autoComplete="new-password" disabled={pendente} />
        </div>
        <button type="submit" disabled={pendente}>{pendente ? "Criando…" : "Criar conta"}</button>
        {estado.erro ? <p className="erro">{estado.erro}</p> : null}
      </form>

      {temGoogle ? (
        <>
          <p className="separa"><span>ou</span></p>
          <a className="botao secundario goog" href="/conta/google">
            Continuar com Google
          </a>
        </>
      ) : null}

      <p className="nota" style={{ textAlign: "center" }}>
        Já tem conta? <Link href="/conta/entrar">Entrar</Link>
      </p>
    </div>
  );
}
