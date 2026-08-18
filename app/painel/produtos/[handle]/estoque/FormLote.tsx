"use client";

import { useActionState, useState } from "react";
import { importarLote, ESTADO_LOTE_INICIAL } from "./acoes";

// Importacao de lote. O contador de codigos e a divisao do custo aparecem
// enquanto se digita, porque conferir "quantos entraram" DEPOIS de gravar e
// tarde demais quando o que entrou e o produto que o cliente comprou.

function contarCodigos(texto: string): number {
  return String(texto)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#")).length;
}

function numero(v: string): number {
  let s = String(v).trim().replace(/\s/g, "").replace(/R\$/gi, "");
  if (!s) return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export default function FormLote({
  handle,
  variantes,
}: {
  handle: string;
  variantes: { id: string; sku: string }[];
}) {
  const [estado, acao, pendente] = useActionState(importarLote, ESTADO_LOTE_INICIAL);
  const [codigos, setCodigos] = useState("");
  const [custo, setCusto] = useState("");

  const n = contarCodigos(codigos);
  const total = numero(custo);
  const unitario = n > 0 && !Number.isNaN(total) && total > 0 ? total / n : NaN;

  return (
    <form action={acao} className="cartao">
      <input type="hidden" name="handle" value={handle} />
      <h2 style={{ fontSize: "1.1rem", margin: "0 0 4px" }}>Importar lote</h2>
      <p style={{ color: "var(--texto-fraco)", margin: "0 0 16px", fontSize: "0.88rem" }}>
        Cole os códigos de ativação, um por linha. O custo em BRL entra aqui porque é o único
        momento em que se sabe quanto foi pago de verdade.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 14 }}>
        <label style={{ display: "block" }}>
          <span className="rotulo">Variante</span>
          <select name="variante_id" required disabled={pendente} style={{ width: "100%" }}>
            <option value="">escolha…</option>
            {variantes.map((v) => (
              <option key={v.id} value={v.id}>
                {v.sku}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "block" }}>
          <span className="rotulo">Nome do lote</span>
          <input name="lote" required disabled={pendente} placeholder="ex.: NF-1042" style={{ width: "100%" }} />
        </label>

        <label style={{ display: "block" }}>
          <span className="rotulo">Custo total do lote (BRL)</span>
          <input
            name="custo_total"
            value={custo}
            onChange={(e) => setCusto(e.target.value)}
            disabled={pendente}
            inputMode="decimal"
            placeholder="ex.: 1.234,56"
            style={{ width: "100%", textAlign: "right", fontFamily: "var(--fonte-mono)" }}
          />
        </label>

        <label style={{ display: "block" }}>
          <span className="rotulo">Câmbio da compra (opcional)</span>
          <input
            name="cambio"
            disabled={pendente}
            inputMode="decimal"
            placeholder="ex.: 5,42"
            style={{ width: "100%", textAlign: "right", fontFamily: "var(--fonte-mono)" }}
          />
        </label>

        <label style={{ display: "block" }}>
          <span className="rotulo">Operadora (opcional)</span>
          <input name="operadora" disabled={pendente} style={{ width: "100%" }} />
        </label>

        <label style={{ display: "block" }}>
          <span className="rotulo">Validade (opcional)</span>
          <input name="validade" type="date" disabled={pendente} style={{ width: "100%" }} />
        </label>
      </div>

      <label style={{ display: "block" }}>
        <span className="rotulo">
          Códigos — um por linha. Aceita <code>LPA:1$servidor$codigo</code> ou{" "}
          <code>ICCID;LPA:1$servidor$codigo</code>
        </span>
        <textarea
          name="codigos"
          required
          rows={10}
          value={codigos}
          onChange={(e) => setCodigos(e.target.value)}
          disabled={pendente}
          spellCheck={false}
          placeholder={"LPA:1$smdp.operadora.com$ABC123\n8955101234567890123;LPA:1$smdp.operadora.com$DEF456"}
          style={{
            width: "100%",
            fontFamily: "var(--fonte-mono)",
            fontSize: "0.82rem",
            background: "var(--superficie-2)",
            border: "1px solid var(--borda)",
            color: "var(--texto)",
            borderRadius: 10,
            padding: 11,
            resize: "vertical",
          }}
        />
      </label>

      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap", margin: "12px 0 0", fontSize: "0.86rem", color: "var(--texto-fraco)" }}>
        <span>
          <b style={{ color: "var(--texto)" }}>{n}</b> linha{n === 1 ? "" : "s"} para importar
        </span>
        {!Number.isNaN(unitario) ? (
          <span>
            custo unitário ≈{" "}
            <b style={{ color: "var(--texto)" }}>
              R$ {unitario.toFixed(2).replace(".", ",")}
            </b>
          </span>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
        <button type="submit" disabled={pendente || n === 0}>
          {pendente ? "Importando…" : `Importar ${n || ""} código${n === 1 ? "" : "s"}`}
        </button>
        {estado.erro ? <span style={{ color: "var(--erro)" }}>{estado.erro}</span> : null}
        {estado.ok ? <span style={{ color: "var(--ok)" }}>{estado.ok}</span> : null}
      </div>

      {estado.detalhes.length > 0 ? (
        <ul style={{ margin: "12px 0 0", paddingLeft: 20, color: "var(--erro)", fontSize: "0.84rem" }}>
          {estado.detalhes.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      ) : null}

      <p style={{ color: "var(--texto-fraco)", fontSize: "0.8rem", marginTop: 14 }}>
        Se qualquer linha estiver com problema, <b>nada é importado</b> — lote pela metade,
        importado em silêncio, vira cliente pagando e não recebendo semanas depois.
      </p>
    </form>
  );
}
