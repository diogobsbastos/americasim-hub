"use client";

import { useActionState, useEffect, useState } from "react";
import { inserirPeloSaldo, retirarPeloSaldo } from "./acoes";
import { ESTADO_AJUSTE_INICIAL, MOTIVOS_RETIRADA } from "./tipos";

// O numero do saldo e um botao. Clicou, abre o popup: saldo, Inserir, Retirar.
// Mesmo gesto do Bling — com a diferenca de que aqui cada unidade e um codigo,
// entao "inserir" e colar codigos e "retirar" e o hub escolher quais saem.

export default function AjusteSaldo({
  handle, sku, varianteId, saldo, rotulo,
}: { handle: string; sku: string; varianteId: string; saldo: number; rotulo: string }) {
  const [aberto, setAberto] = useState(false);
  const [aba, setAba] = useState<"inserir" | "retirar">("inserir");
  const [ins, acaoIns, pendIns] = useActionState(inserirPeloSaldo, ESTADO_AJUSTE_INICIAL);
  const [ret, acaoRet, pendRet] = useActionState(retirarPeloSaldo, ESTADO_AJUSTE_INICIAL);

  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberto]);

  const zerado = saldo === 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        title="Ajustar estoque"
        style={{
          background: "transparent", border: "1px dashed var(--borda)", borderRadius: 6,
          padding: "2px 10px", cursor: "pointer", font: "inherit", fontWeight: 600,
          color: zerado ? "var(--erro)" : "var(--ok)",
        }}
      >
        {saldo}
      </button>

      {aberto ? (
        <div
          onClick={() => setAberto(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="cartao"
            style={{ width: "min(560px, 100%)", maxHeight: "90vh", overflowY: "auto" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <div>
                <div style={{ color: "var(--texto-fraco)", fontSize: "0.72rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>Ajustar estoque</div>
                <div style={{ fontWeight: 700 }}>{rotulo}</div>
                <code style={{ fontSize: "0.78rem", color: "var(--texto-fraco)" }}>{sku}</code>
              </div>
              <button type="button" className="secundario" onClick={() => setAberto(false)} aria-label="Fechar">✕</button>
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "14px 0" }}>
              <span style={{ color: "var(--texto-fraco)", fontSize: "0.8rem" }}>Saldo disponível</span>
              <span style={{ fontSize: "1.8rem", fontWeight: 700, color: zerado ? "var(--erro)" : "var(--ok)" }}>{saldo}</span>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <button type="button" className={aba === "inserir" ? "" : "secundario"} onClick={() => setAba("inserir")}>Inserir</button>
              <button type="button" className={aba === "retirar" ? "" : "secundario"} onClick={() => setAba("retirar")}>Retirar</button>
            </div>

            {aba === "inserir" ? (
              <form action={acaoIns}>
                <input type="hidden" name="handle" value={handle} />
                <input type="hidden" name="variante_id" value={varianteId} />
                <label style={{ display: "block", marginBottom: 10 }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--texto-fraco)" }}>Códigos — um por linha (LPA:1$… ou ICCID;LPA:1$…)</span>
                  <textarea name="codigos" required rows={6} style={{ width: "100%", fontFamily: "var(--fonte-mono)", fontSize: "0.8rem" }} placeholder="LPA:1$smdp.exemplo.com$ABC123" />
                </label>
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", marginBottom: 10 }}>
                  <label>
                    <span style={{ fontSize: "0.78rem", color: "var(--texto-fraco)" }}>Lote (opcional)</span>
                    <input name="lote" placeholder="nota do fornecedor" style={{ width: "100%" }} />
                  </label>
                  <label>
                    <span style={{ fontSize: "0.78rem", color: "var(--texto-fraco)" }}>Custo total R$ (opcional)</span>
                    <input name="custo_total" inputMode="decimal" placeholder="0,00" style={{ width: "100%" }} />
                  </label>
                  <label>
                    <span style={{ fontSize: "0.78rem", color: "var(--texto-fraco)" }}>Validade (opcional)</span>
                    <input name="validade" type="date" style={{ width: "100%" }} />
                  </label>
                  <label>
                    <span style={{ fontSize: "0.78rem", color: "var(--texto-fraco)" }}>Operadora (opcional)</span>
                    <input name="operadora" style={{ width: "100%" }} />
                  </label>
                </div>
                <button type="submit" disabled={pendIns}>{pendIns ? "Inserindo…" : "Confirmar entrada"}</button>
                <Retorno estado={ins} />
              </form>
            ) : (
              <form action={acaoRet}>
                <input type="hidden" name="handle" value={handle} />
                <input type="hidden" name="variante_id" value={varianteId} />
                <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", marginBottom: 10 }}>
                  <label>
                    <span style={{ fontSize: "0.78rem", color: "var(--texto-fraco)" }}>Quantidade</span>
                    <input name="quantidade" type="number" min={1} max={Math.max(saldo, 1)} defaultValue={1} required style={{ width: "100%", textAlign: "right", fontFamily: "var(--fonte-mono)" }} />
                  </label>
                  <label>
                    <span style={{ fontSize: "0.78rem", color: "var(--texto-fraco)" }}>Por quê</span>
                    <select name="status" defaultValue="interno" style={{ width: "100%" }}>
                      {MOTIVOS_RETIRADA.map((m) => (<option key={m.id} value={m.id}>{m.nome}</option>))}
                    </select>
                  </label>
                </div>
                <label style={{ display: "block", marginBottom: 10 }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--texto-fraco)" }}>Observação (opcional)</span>
                  <input name="motivo" maxLength={400} style={{ width: "100%" }} />
                </label>
                <p style={{ fontSize: "0.76rem", color: "var(--texto-fraco)", margin: "0 0 10px" }}>
                  Saem os códigos de validade mais curta primeiro. Cada um fica no extrato com este motivo.
                </p>
                <button type="submit" disabled={pendRet || zerado}>{pendRet ? "Retirando…" : "Confirmar retirada"}</button>
                <Retorno estado={ret} />
              </form>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function Retorno({ estado }: { estado: { erro: string; ok: string; detalhes: string[] } }) {
  return (
    <>
      {estado.erro ? <p style={{ color: "var(--erro)", margin: "10px 0 0", fontSize: "0.84rem" }}>{estado.erro}</p> : null}
      {estado.ok ? <p style={{ color: "var(--ok)", margin: "10px 0 0", fontSize: "0.84rem" }}>{estado.ok}</p> : null}
      {estado.detalhes.length > 0 ? (
        <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: "0.78rem", color: "var(--texto-fraco)" }}>
          {estado.detalhes.map((d, i) => (<li key={i}>{d}</li>))}
        </ul>
      ) : null}
    </>
  );
}
