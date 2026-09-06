"use client";

import { useActionState } from "react";
import { salvarPerfil } from "./acoes";
import { ESTADO_PERFIL_INICIAL } from "../tipos";

// Dados de contato: e-mail TRAVADO (e a chave da conta), nome e WhatsApp
// editaveis. WhatsApp vazio REMOVE o numero — direito do cliente.
export default function FormPerfil({
  email,
  nome,
  telefone,
}: {
  email: string;
  nome: string;
  telefone: string;
}) {
  const [estado, acao, pendente] = useActionState(salvarPerfil, ESTADO_PERFIL_INICIAL);

  return (
    <form action={acao} className="pilha">
      <div>
        <label className="rotulo" htmlFor="pf-email">E-mail da conta</label>
        <input id="pf-email" type="email" value={email} disabled readOnly />
        <p className="fin-dica">O e-mail é a chave da conta e dos seus pedidos — ele não muda por aqui.</p>
      </div>
      <div>
        <label className="rotulo" htmlFor="pf-nome">Nome</label>
        <input
          id="pf-nome"
          type="text"
          name="nome"
          defaultValue={nome}
          maxLength={120}
          autoComplete="name"
          placeholder="Como você quer ser chamado"
          disabled={pendente}
        />
      </div>
      <div>
        <label className="rotulo" htmlFor="pf-zap">WhatsApp</label>
        <input
          id="pf-zap"
          type="tel"
          name="telefone"
          defaultValue={telefone}
          autoComplete="tel"
          inputMode="tel"
          placeholder="(11) 91234-5678"
          disabled={pendente}
        />
        <p className="fin-dica">Usado só pelo nosso suporte. Deixe vazio para remover.</p>
      </div>
      <button type="submit" disabled={pendente}>{pendente ? "Salvando…" : "Salvar dados"}</button>
      {estado.erro ? <p className="erro">{estado.erro}</p> : null}
      {estado.ok ? <p className="feito">{estado.ok}</p> : null}
    </form>
  );
}
