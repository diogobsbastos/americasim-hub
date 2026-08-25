"use client";

import { useActionState } from "react";
import { reenviarCodigoMl } from "./acoes";
import { ESTADO_PUBLICAR_INICIAL } from "../../produtos/[handle]/publicar/tipos";

// So aparece em venda do Mercado Livre: e a conversa de la que leva o codigo.
export default function ReenviarCodigo({ numero, pedidoId }: { numero: string; pedidoId: string }) {
  const [estado, acao, pendente] = useActionState(reenviarCodigoMl, ESTADO_PUBLICAR_INICIAL);
  return (
    <form action={acao} style={{ marginTop: 12, borderTop: "1px solid var(--borda)", paddingTop: 12 }}>
      <input type="hidden" name="numero" value={numero} />
      <input type="hidden" name="pedido_id" value={pedidoId} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button type="submit" className="secundario" disabled={pendente}>
          {pendente ? "Enviando…" : "Reenviar código pela conversa do ML"}
        </button>
        <span style={{ fontSize: "0.78rem", color: "var(--texto-fraco)" }}>
          manda o código de ativação de novo na conversa do comprador
        </span>
      </div>
      {estado.erro ? (
        <pre style={{ color: "var(--erro)", margin: "8px 0 0", fontSize: "0.8rem", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {estado.erro}
        </pre>
      ) : null}
      {estado.ok ? <p style={{ color: "var(--ok)", margin: "8px 0 0", fontSize: "0.84rem" }}>{estado.ok}</p> : null}
    </form>
  );
}
