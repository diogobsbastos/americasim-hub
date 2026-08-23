"use client";

import { useActionState } from "react";
import { salvarRegras } from "./acoes";
import { ACOES, ESTADO_REGRAS_INICIAL, type LinhaRegra } from "./tipos";

export default function FormRegras({
  linhas,
  podeMexer,
}: {
  linhas: LinhaRegra[];
  podeMexer: boolean;
}) {
  const [estado, acao, enviando] = useActionState(salvarRegras, ESTADO_REGRAS_INICIAL);

  if (linhas.length === 0) {
    return (
      <div className="aviso">
        <h1>Nenhum produto de estoque</h1>
        <p className="nota">
          Alerta de mínimo só faz sentido para item que tem prateleira. Produto de operadora
          não tem saldo por desenho.
        </p>
      </div>
    );
  }

  return (
    <form action={acao}>
      <div className="cartao" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--texto-fraco)", fontSize: "0.72rem" }}>
              <th style={{ padding: "11px 14px", fontWeight: 600 }}>PRODUTO</th>
              <th style={{ padding: "11px 14px", fontWeight: 600, textAlign: "right" }}>TEM HOJE</th>
              <th style={{ padding: "11px 14px", fontWeight: 600 }}>AVISAR EM</th>
              <th style={{ padding: "11px 14px", fontWeight: 600 }}>CRÍTICO EM</th>
              <th style={{ padding: "11px 14px", fontWeight: 600 }}>O QUE FAZER</th>
              <th style={{ padding: "11px 14px", fontWeight: 600 }}>LIGADA</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const abaixo = l.ativa && l.disponivel <= l.critico;
              const atencao = l.ativa && !abaixo && l.disponivel <= l.minimo;
              return (
                <tr key={l.varianteId} style={{ borderTop: "1px solid var(--borda)" }}>
                  <td style={{ padding: "11px 14px" }}>
                    <input type="hidden" name={`linha__${l.varianteId}`} value="1" />
                    <b>{l.familia}</b>
                    <br />
                    <code style={{ fontSize: "0.75rem", color: "var(--texto-fraco)" }}>{l.sku}</code>
                  </td>
                  <td style={{ padding: "11px 14px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ color: abaixo ? "var(--erro)" : atencao ? "var(--alerta)" : "var(--ok)" }}>
                      {l.disponivel}
                    </span>
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <input name={`min__${l.varianteId}`} defaultValue={String(l.minimo)} inputMode="numeric"
                      disabled={!podeMexer} style={{ width: 80 }} aria-label={`Mínimo de ${l.sku}`} />
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <input name={`cri__${l.varianteId}`} defaultValue={String(l.critico)} inputMode="numeric"
                      disabled={!podeMexer} style={{ width: 80 }} aria-label={`Crítico de ${l.sku}`} />
                  </td>
                  <td style={{ padding: "11px 14px", minWidth: 170 }}>
                    <select name={`aca__${l.varianteId}`} defaultValue={l.acao} disabled={!podeMexer}
                      aria-label={`Ação de ${l.sku}`}>
                      {ACOES.map((a) => (<option key={a.v} value={a.v}>{a.r}</option>))}
                    </select>
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <input type="checkbox" name={`ati__${l.varianteId}`} defaultChecked={l.ativa}
                      disabled={!podeMexer} style={{ width: "auto" }} aria-label={`Regra de ${l.sku} ligada`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {podeMexer ? (
        <button type="submit" disabled={enviando} style={{ marginTop: 16 }}>
          {enviando ? "Salvando…" : "Salvar alertas"}
        </button>
      ) : (
        <p className="nota" style={{ marginTop: 12 }}>Seu papel permite ver, mas não alterar.</p>
      )}

      {estado?.erro || estado?.ok ? (
        <p style={{ margin: "12px 0 0", fontSize: "0.88rem", color: estado.erro ? "var(--erro)" : "var(--ok)" }}>
          {estado.erro || estado.ok}
        </p>
      ) : null}

      <div style={{ marginTop: 22, borderLeft: "3px solid var(--borda)", paddingLeft: 14 }}>
        {ACOES.map((a) => (
          <p key={a.v} style={{ margin: "0 0 6px", fontSize: "0.83rem", color: "var(--texto-fraco)" }}>
            <b style={{ color: "var(--texto)" }}>{a.r}</b> — {a.ajuda}
          </p>
        ))}
      </div>
    </form>
  );
}
