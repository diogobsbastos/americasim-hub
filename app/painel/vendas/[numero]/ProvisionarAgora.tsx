"use client";

import { useActionState } from "react";
import { provisionarAgora, verStatusOperadora } from "./acoes";
import { ESTADO_PUBLICAR_INICIAL } from "../../produtos/[handle]/publicar/tipos";

// So aparece em venda de produto sob demanda (operadora). Dois botoes:
// - Provisionar agora: repete o passo da fila na hora (compra idempotente +
//   QR). Serve para destravar um pedido que ficou em "pago sem entrega" depois
//   de a causa ser resolvida (plano vinculado, operadora ligada, deposito).
// - Ver status na operadora: pacotes e consumo do ICCID, resposta completa.
export default function ProvisionarAgora({
  numero, pedidoId, itemId, iccid,
}: { numero: string; pedidoId: string; itemId: string; iccid: string | null }) {
  const [ePr, aPr, pPr] = useActionState(provisionarAgora, ESTADO_PUBLICAR_INICIAL);
  const [eSt, aSt, pSt] = useActionState(verStatusOperadora, ESTADO_PUBLICAR_INICIAL);

  return (
    <div style={{ marginTop: 12, borderTop: "1px solid var(--borda)", paddingTop: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <form action={aPr}>
          <input type="hidden" name="numero" value={numero} />
          <input type="hidden" name="pedido_id" value={pedidoId} />
          <input type="hidden" name="item_pedido_id" value={itemId} />
          <button type="submit" disabled={pPr}>{pPr ? "Provisionando…" : "Provisionar agora na operadora"}</button>
        </form>
        {iccid ? (
          <form action={aSt}>
            <input type="hidden" name="iccid" value={iccid} />
            <button type="submit" className="secundario" disabled={pSt}>{pSt ? "Consultando…" : "Ver status na operadora"}</button>
          </form>
        ) : null}
        <span style={{ fontSize: "0.78rem", color: "var(--texto-fraco)" }}>
          compra idempotente: repetir não compra duas vezes
        </span>
      </div>
      {[ePr, eSt].map((e, i) => (
        <div key={i}>
          {e.erro ? (
            <pre style={{ color: "var(--erro)", margin: "8px 0 0", fontSize: "0.8rem", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{e.erro}</pre>
          ) : null}
          {e.ok ? <p style={{ color: "var(--ok)", margin: "8px 0 0", fontSize: "0.84rem" }}>{e.ok}</p> : null}
          {e.previa ? (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: "pointer", fontSize: "0.82rem" }}>resposta completa da operadora</summary>
              <pre style={{ margin: "6px 0 0", fontSize: "0.74rem", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 400, overflow: "auto" }}>{e.previa}</pre>
            </details>
          ) : null}
        </div>
      ))}
    </div>
  );
}
