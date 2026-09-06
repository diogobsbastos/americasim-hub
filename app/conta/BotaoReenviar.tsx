"use client";

import { useActionState } from "react";
import { reenviarVerificacao } from "./acoes";
import { ESTADO_PERFIL_INICIAL } from "./tipos";

// O botao que faltava: ate 06/09 a tela dizia "o e-mail chega em breve" e nao
// havia e-mail nenhum para chegar. Agora ha — e daqui a pessoa pede outro.
export default function BotaoReenviar({ email }: { email: string }) {
  const [estado, acao, pendente] = useActionState(reenviarVerificacao, ESTADO_PERFIL_INICIAL);

  return (
    <form action={acao}>
      <button type="submit" disabled={pendente}>
        {pendente ? "Enviando…" : "Reenviar e-mail de confirmação"}
      </button>
      {email ? <p className="fin-dica">Enviamos para <b>{email}</b>.</p> : null}
      {estado.erro ? <p className="erro">{estado.erro}</p> : null}
      {estado.ok ? <p className="feito">{estado.ok}</p> : null}
    </form>
  );
}
