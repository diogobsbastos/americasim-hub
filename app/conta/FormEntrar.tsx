"use client";

import Link from "next/link";
import { useActionState } from "react";
import { entrar } from "./acoes";
import { ESTADO_CONTA_INICIAL } from "./tipos";

export default function FormEntrar({ temGoogle, avisoInicial }: { temGoogle: boolean; avisoInicial: string }) {
  const [estado, acao, pendente] = useActionState(entrar, ESTADO_CONTA_INICIAL);

  return (
    <div className="compra">
      {temGoogle ? (
        <>
          {/* Rota de servidor: comeca o OAuth. E um <a>, nao <Link> — precisa
              sair do roteamento do Next e bater no route handler. */}
          <a className="botao" href="/conta/google" style={{ display: "block", textAlign: "center" }}>
            Entrar com Google
          </a>
          <p className="nota" style={{ textAlign: "center", margin: "10px 0" }}>ou com e-mail e senha</p>
        </>
      ) : null}

      <form action={acao}>
        <label className="rotulo" htmlFor="ce">E-mail</label>
        <input id="ce" type="email" name="email" required autoComplete="email" disabled={pendente} />
        <label className="rotulo" htmlFor="cs">Senha</label>
        <input id="cs" type="password" name="senha" required autoComplete="current-password" disabled={pendente} />
        <button type="submit" disabled={pendente}>{pendente ? "Entrando…" : "Entrar"}</button>
        {estado.erro || avisoInicial ? <p className="erro">{estado.erro || avisoInicial}</p> : null}
      </form>

      <p className="nota">
        Primeira vez aqui? <Link href="/conta/criar">Criar conta</Link>
      </p>
    </div>
  );
}
