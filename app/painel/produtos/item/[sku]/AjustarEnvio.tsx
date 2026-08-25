"use client";

import { useActionState } from "react";
import { corrigirEnvio } from "./acoes";
import { ESTADO_PUBLICAR_INICIAL } from "../../[handle]/publicar/tipos";

// Trocar o envio de um anuncio que ja esta no ar, sem republicar.
//
// Republicar perde o historico e as visitas do anuncio, e deixa um orfao ativo
// que alguem pode comprar por engano. Alterar, quando o ML aceita, e sempre o
// caminho mais barato.
export default function AjustarEnvio({ sku, anuncio }: { sku: string; anuncio: string }) {
  const [estado, acao, pendente] = useActionState(corrigirEnvio, ESTADO_PUBLICAR_INICIAL);
  return (
    <form action={acao} style={{ marginTop: 12, borderTop: "1px solid var(--borda)", paddingTop: 12 }}>
      <input type="hidden" name="sku" value={sku} />
      <input type="hidden" name="anuncio" value={anuncio} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <select name="envio" defaultValue="sem_frete" style={{ flex: "1 1 220px", width: "auto" }}>
          <option value="sem_frete">Sem frete — entrega digital</option>
          <option value="mercado_envios">Mercado Envios</option>
        </select>
        <button type="submit" className="secundario" disabled={pendente}>
          {pendente ? "Alterando…" : "Alterar envio deste anúncio"}
        </button>
      </div>
      <p style={{ fontSize: "0.78rem", color: "var(--texto-fraco)", margin: "6px 0 0" }}>
        Um eSIM não viaja. Sem frete, o comprador não paga entrega e o código vai pela conversa.
      </p>
      {estado.erro ? <p style={{ color: "var(--erro)", margin: "8px 0 0", fontSize: "0.84rem" }}>{estado.erro}</p> : null}
      {estado.ok ? <p style={{ color: "var(--ok)", margin: "8px 0 0", fontSize: "0.84rem" }}>{estado.ok}</p> : null}
    </form>
  );
}
