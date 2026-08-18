"use client";

import { useActionState } from "react";
import { comprar } from "./acoes";
import { ESTADO_COMPRA_INICIAL } from "./tipos";

export default function FormCompra({
  sku,
  tentativa,
  disponivel,
  rotulo = "Comprar",
}: {
  sku: string;
  tentativa: string;
  disponivel: boolean;
  rotulo?: string;
}) {
  const [estado, acao, pendente] = useActionState(comprar, ESTADO_COMPRA_INICIAL);

  return (
    <form action={acao} className="compra">
      <input type="hidden" name="sku" value={sku} />
      <input type="hidden" name="tentativa" value={tentativa} />
      <label className="rotulo" htmlFor={`email-${sku}`}>
        E-mail para receber o eSIM
      </label>
      <input
        id={`email-${sku}`}
        type="email"
        name="email"
        required
        autoComplete="email"
        placeholder="voce@exemplo.com"
        disabled={!disponivel || pendente}
      />
      <button type="submit" disabled={!disponivel || pendente}>
        {pendente ? "Processando…" : disponivel ? rotulo : "Esgotado"}
      </button>
      {estado.erro ? <p className="erro">{estado.erro}</p> : null}
    </form>
  );
}
