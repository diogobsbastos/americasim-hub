"use client";

import { useActionState } from "react";
import { desvincularAnuncio } from "./acoes";
import { ESTADO_PUBLICAR_INICIAL } from "../../[handle]/publicar/tipos";

export default function Desvincular({ sku, varianteId }: { sku: string; varianteId: string }) {
  const [estado, acao, pendente] = useActionState(desvincularAnuncio, ESTADO_PUBLICAR_INICIAL);
  return (
    <form action={acao} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
      <input type="hidden" name="sku" value={sku} />
      <input type="hidden" name="variante_id" value={varianteId} />
      <button type="submit" className="secundario" disabled={pendente}>
        {pendente ? "Soltando…" : "Soltar este anúncio"}
      </button>
      <span style={{ fontSize: "0.8rem", color: "var(--texto-fraco)" }}>
        libera o SKU para publicar outro; o anúncio continua existindo lá
      </span>
      {estado.erro ? <span style={{ color: "var(--erro)" }}>{estado.erro}</span> : null}
      {estado.ok ? <span style={{ color: "var(--ok)" }}>{estado.ok}</span> : null}
    </form>
  );
}
