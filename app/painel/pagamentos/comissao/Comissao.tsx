"use client";

import { useActionState } from "react";
import { salvarComissao } from "../acoes";
import { ESTADO_PAGAMENTO_INICIAL } from "../tipos";

export default function Comissao({
  fixa,
  pct,
  podeMexer,
}: {
  fixa: string;
  pct: string;
  podeMexer: boolean;
}) {
  const [e, a, p] = useActionState(salvarComissao, ESTADO_PAGAMENTO_INICIAL);

  return (
    <div className="cartao" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Comissão por venda</h2>

      <p style={{ margin: 0, color: "var(--texto-fraco)", fontSize: "0.88rem" }}>
        Quanto de cada venda é comissão. Hoje o valor é <b>apurado e congelado</b> em cada
        pedido — o dinheiro entra todo na conta configurada e a comissão é acertada por fora.
      </p>
      <p style={{ margin: 0, color: "var(--texto-fraco)", fontSize: "0.88rem" }}>
        Quando existir uma conta conectada (Stripe Connect), este mesmo número passa a ser
        descontado automaticamente pela Stripe, sem mudar mais nada no sistema.
      </p>
      <p style={{ margin: 0, color: "var(--texto-fraco)", fontSize: "0.84rem" }}>
        Os dois campos <b>somam</b>. Deixe em zero o que não usar. A comissão nunca passa do
        valor da própria venda.
      </p>

      {podeMexer ? (
        <form action={a} style={{ borderTop: "1px solid var(--borda)", paddingTop: 10 }}>
          <label className="rotulo">Parte fixa, em centavos (ex.: 50 = R$ 0,50)</label>
          <input type="text" name="fixa" defaultValue={fixa} inputMode="numeric" disabled={p} />
          <label className="rotulo" style={{ marginTop: 8 }}>Percentual sobre o total (ex.: 2,5)</label>
          <input type="text" name="pct" defaultValue={pct} inputMode="decimal" disabled={p} />
          <button type="submit" disabled={p} style={{ marginTop: 8 }}>
            {p ? "Guardando…" : "Guardar comissão"}
          </button>
          {e.erro || e.ok ? (
            <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: e.erro ? "var(--erro)" : "var(--ok)" }}>
              {e.erro || e.ok}
            </p>
          ) : null}
        </form>
      ) : (
        <p style={{ margin: 0, fontSize: "0.88rem", borderTop: "1px solid var(--borda)", paddingTop: 10 }}>
          Fixa: {fixa} centavos · Percentual: {pct}%
        </p>
      )}
    </div>
  );
}
