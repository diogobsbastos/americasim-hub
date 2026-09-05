"use client";

import Link from "next/link";
import { useActionState } from "react";
import { entrar } from "./acoes";
import { ESTADO_CONTA_INICIAL } from "./tipos";

export default function FormEntrar({ temGoogle, avisoInicial }: { temGoogle: boolean; avisoInicial: string }) {
  const [estado, acao, pendente] = useActionState(entrar, ESTADO_CONTA_INICIAL);

  return (
    <div className="compra">
      <form action={acao} className="pilha">
        <div>
          <label className="rotulo" htmlFor="ce">E-mail</label>
          <input id="ce" type="email" name="email" required autoComplete="email" disabled={pendente} />
        </div>
        <div>
          <label className="rotulo" htmlFor="cs">Senha</label>
          <input id="cs" type="password" name="senha" required autoComplete="current-password" disabled={pendente} />
        </div>
        <button type="submit" disabled={pendente}>{pendente ? "Entrando…" : "Entrar"}</button>
        {estado.erro || avisoInicial ? <p className="erro">{estado.erro || avisoInicial}</p> : null}
      </form>

      {temGoogle ? (
        <>
          <p className="separa"><span>ou</span></p>
          {/* Rota de servidor: comeca o OAuth. E um <a>, nao <Link> — precisa
              sair do roteamento do Next e bater no route handler. Botao
              SECUNDARIO de proposito: um unico CTA crimson por tela. */}
          <a className="botao secundario goog" href="/conta/google">
            Entrar com Google
          </a>
        </>
      ) : null}

      <p className="nota" style={{ textAlign: "center" }}>
        Primeira vez aqui? <Link href="/conta/criar">Criar conta</Link>
      </p>
    </div>
  );
}
