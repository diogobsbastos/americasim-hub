"use client";

import { useActionState } from "react";
import { revelar } from "../acoes";
import { ESTADO_ESIM_INICIAL } from "../tipos";

export default function FormAtivacao({ ativacaoId }: { ativacaoId: string }) {
  const [estado, acao, pendente] = useActionState(revelar, ESTADO_ESIM_INICIAL);
  const revelado = estado.smdp !== "" || estado.ativacao !== "";

  if (revelado) {
    return (
      <div className="esim">
        {estado.qr ? (
          <img
            className="qr"
            src={`data:image/png;base64,${estado.qr}`}
            alt="QR code de instalacao do eSIM"
            width={280}
            height={280}
          />
        ) : (
          <p className="nota">QR ainda nao disponivel — use o codigo manual abaixo.</p>
        )}

        <div className="linha">
          <span>Endereco SM-DP+</span>
          <code>{estado.smdp}</code>
        </div>
        <div className="linha">
          <span>Codigo de ativacao</span>
          <code>{estado.ativacao}</code>
        </div>

        <div className="botoes">
          {estado.link_apple ? (
            <a className="botao" href={estado.link_apple}>
              Instalar no iPhone
            </a>
          ) : null}
          {estado.link_android ? (
            <a className="botao secundario" href={estado.link_android}>
              Instalar no Android
            </a>
          ) : null}
        </div>

        <p className="nota">
          Instale com Wi-Fi e so ative quando chegar ao destino. O plano comeca a contar na
          primeira conexao.
        </p>
      </div>
    );
  }

  return (
    <form action={acao} className="compra">
      <input type="hidden" name="ativacao_id" value={ativacaoId} />
      <label className="rotulo" htmlFor={`conf-${ativacaoId}`}>
        Confirme o e-mail da compra para ver o seu eSIM
      </label>
      <input
        id={`conf-${ativacaoId}`}
        type="email"
        name="email"
        required
        autoComplete="email"
        placeholder="voce@exemplo.com"
        disabled={pendente}
      />
      <button type="submit" disabled={pendente}>
        {pendente ? "Verificando…" : "Ver meu eSIM"}
      </button>
      {estado.erro ? <p className="erro">{estado.erro}</p> : null}
    </form>
  );
}
