"use client";

import { useActionState, useState } from "react";
import { salvarMatriz, ESTADO_MATRIZ_INICIAL } from "../acoes";

// Matriz variante x canal — SPEC/08 §3. "É aqui que se resolve 'esta vitrine
// vende só estes planos, por este preço'."
//
// Este e o unico componente de cliente da tela, e faz uma coisa so: recalcular
// a margem enquanto voce digita. O resto (filtro, validacao, gravacao) e
// servidor, como manda a SPEC/08 §1.

export interface Canal {
  id: string;
  codigo: string;
  nome: string;
  tipo: string;
  moeda: string;
}

export interface Celula {
  visivel: boolean;
  destaque: boolean;
  preco: string;
}

export interface Linha {
  varianteId: string;
  sku: string;
  rotulo: string;
  custo: string;
  custoMoeda: string;
  custoBrl: string | null;
  fonteCusto: string;
  disponivel: number;
  celulas: Record<string, Celula>;
}

function numero(v: string): number {
  let s = String(v).trim().replace(/\s/g, "").replace(/R\$/gi, "");
  if (!s) return NaN;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function brl(n: number): string {
  return "R$ " + n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d),)/g, ".");
}

export default function Matriz({
  handle,
  canais,
  linhas,
  cambio,
  podeDinheiro,
  podeVitrine,
}: {
  handle: string;
  canais: Canal[];
  linhas: Linha[];
  cambio: number;
  podeDinheiro: boolean;
  podeVitrine: boolean;
}) {
  const [estado, acao, pendente] = useActionState(salvarMatriz, ESTADO_MATRIZ_INICIAL);

  // Estado local so do que o usuario esta digitando, para a margem acompanhar.
  const [custos, setCustos] = useState<Record<string, string>>(
    Object.fromEntries(linhas.map((l) => [l.varianteId, l.custo])),
  );
  const [precos, setPrecos] = useState<Record<string, string>>(
    Object.fromEntries(
      linhas.flatMap((l) =>
        canais.map((c) => [`${c.id}|${l.varianteId}`, l.celulas[c.id]?.preco ?? ""]),
      ),
    ),
  );

  // Custo efetivo em BRL da linha, respeitando de onde ele vem:
  // - 'lote': o custo real ja pago manda, e digitar no campo de custo (que e a
  //   referencia em USD) nao muda a margem. Mostrar como se mudasse seria mentir.
  // - 'parametro': o campo em USD passa pelo cambio de reserva, entao a margem
  //   acompanha a digitacao.
  function custoBrlDe(l: Linha): number {
    if (l.fonteCusto === "lote") return l.custoBrl ? Number(l.custoBrl) : NaN;
    const c = numero(custos[l.varianteId] ?? "");
    if (Number.isNaN(c)) return NaN;
    if (l.custoMoeda === "BRL") return c;
    return cambio > 0 ? c * cambio : NaN;
  }

  return (
    <form action={acao}>
      <input type="hidden" name="handle" value={handle} />

      {/* ---------------- custo por variante ---------------- */}
      <div className="cartao" style={{ padding: 0, overflowX: "auto", marginBottom: 26 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--texto-fraco)", fontSize: "0.72rem" }}>
              <th style={{ padding: "12px 16px", fontWeight: 600 }}>VARIANTE</th>
              <th style={{ padding: "12px 16px", fontWeight: 600 }}>CUSTO DE REFERÊNCIA</th>
              <th style={{ padding: "12px 16px", fontWeight: 600 }}>CUSTO USADO NA MARGEM</th>
              <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "right" }}>DISPONÍVEL</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const cb = custoBrlDe(l);
              return (
                <tr key={l.varianteId} style={{ borderTop: "1px solid var(--borda)" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <b>{l.rotulo}</b>
                    <br />
                    <code style={{ fontSize: "0.75rem", color: "var(--texto-fraco)" }}>{l.sku}</code>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <input
                      name={`custo__${l.varianteId}`}
                      value={custos[l.varianteId] ?? ""}
                      onChange={(e) => setCustos({ ...custos, [l.varianteId]: e.target.value })}
                      disabled={!podeDinheiro || pendente}
                      inputMode="decimal"
                      style={{ width: 110, textAlign: "right", fontFamily: "var(--fonte-mono)" }}
                    />{" "}
                    <span style={{ color: "var(--texto-fraco)", fontSize: "0.8rem" }}>{l.custoMoeda}</span>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {Number.isNaN(cb) ? (
                      <span style={{ color: "var(--erro)" }}>sem custo — margem cega</span>
                    ) : (
                      <>
                        <b>{brl(cb)}</b>{" "}
                        <span style={{ color: "var(--texto-fraco)", fontSize: "0.78rem" }}>
                          {l.fonteCusto === "lote"
                            ? "· apurado no lote comprado"
                            : l.fonteCusto === "variante_brl"
                              ? "· já está em BRL"
                              : `· aproximado pelo câmbio ${cambio.toFixed(2).replace(".", ",")}`}
                        </span>
                      </>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <span style={{ color: l.disponivel > 0 ? "var(--ok)" : "var(--erro)" }}>
                      {l.disponivel > 0 ? l.disponivel : "esgotado"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---------------- matriz ---------------- */}
      <h2 style={{ fontSize: "1.15rem", margin: "0 0 4px" }}>Matriz variante × canal</h2>
      <p style={{ color: "var(--texto-fraco)", margin: "0 0 14px", fontSize: "0.9rem" }}>
        Cada célula é uma decisão: vende neste canal? por quanto?
      </p>

      <div className="cartao" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ minWidth: 640, width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--texto-fraco)", fontSize: "0.72rem" }}>
              <th style={{ padding: "12px 16px", fontWeight: 600, minWidth: 190 }}>VARIANTE</th>
              {canais.map((c) => (
                <th
                  key={c.id}
                  style={{
                    padding: "12px 16px",
                    fontWeight: 600,
                    textAlign: "center",
                    borderLeft: "1px solid var(--borda)",
                    minWidth: 170,
                  }}
                >
                  {c.codigo}
                  <span style={{ display: "block", fontWeight: 400, textTransform: "none", marginTop: 2 }}>
                    {c.tipo} · {c.moeda}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const cb = custoBrlDe(l);
              return (
                <tr key={l.varianteId} style={{ borderTop: "1px solid var(--borda)" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <b>{l.rotulo}</b>
                    <br />
                    <code style={{ fontSize: "0.75rem", color: "var(--texto-fraco)" }}>{l.sku}</code>
                  </td>
                  {canais.map((c) => {
                    const pref = `cel__${c.id}__${l.varianteId}__`;
                    const cel = l.celulas[c.id];
                    const chave = `${c.id}|${l.varianteId}`;
                    const p = numero(precos[chave] ?? "");
                    const temMargem = !Number.isNaN(p) && !Number.isNaN(cb) && p > 0;
                    const margem = temMargem ? p - cb : 0;
                    const pct = temMargem ? (margem / p) * 100 : 0;
                    const cor = pct >= 55 ? "var(--ok)" : pct >= 35 ? "var(--alerta)" : "var(--erro)";
                    const visivelAgora = cel?.visivel ?? false;

                    return (
                      <td
                        key={c.id}
                        style={{ padding: "12px 16px", borderLeft: "1px solid var(--borda)", verticalAlign: "top" }}
                      >
                        {/* Prova de que a celula veio no formulario: caixa
                            desmarcada nao e enviada pelo navegador. */}
                        <input type="hidden" name={`${pref}presente`} value="1" />
                        <div style={{ display: "flex", gap: 12, marginBottom: 8, fontSize: "0.78rem" }}>
                          <label style={{ display: "inline-flex", gap: 5, alignItems: "center", color: "var(--texto-fraco)" }}>
                            <input
                              type="checkbox"
                              name={`${pref}visivel`}
                              defaultChecked={visivelAgora}
                              disabled={!podeVitrine || pendente}
                              style={{ width: 15, height: 15, padding: 0, accentColor: "var(--marca)" }}
                            />
                            visível
                          </label>
                          <label style={{ display: "inline-flex", gap: 5, alignItems: "center", color: "var(--texto-fraco)" }}>
                            <input
                              type="checkbox"
                              name={`${pref}destaque`}
                              defaultChecked={cel?.destaque ?? false}
                              disabled={!podeVitrine || pendente}
                              style={{ width: 15, height: 15, padding: 0, accentColor: "var(--marca)" }}
                            />
                            destaque
                          </label>
                        </div>
                        <input
                          name={`${pref}preco`}
                          value={precos[chave] ?? ""}
                          onChange={(e) => setPrecos({ ...precos, [chave]: e.target.value })}
                          disabled={!podeDinheiro || pendente}
                          inputMode="decimal"
                          placeholder="sem preço"
                          style={{ width: "100%", textAlign: "right", fontFamily: "var(--fonte-mono)" }}
                        />
                        <div style={{ fontSize: "0.74rem", color: "var(--texto-fraco)", marginTop: 6 }}>
                          {temMargem ? (
                            <>
                              margem <b style={{ color: cor }}>{brl(margem)} · {pct.toFixed(0)}%</b>
                            </>
                          ) : (
                            "margem —"
                          )}
                        </div>
                        {visivelAgora && l.disponivel === 0 ? (
                          <div style={{ marginTop: 6, color: "var(--erro)", fontSize: "0.74rem", fontWeight: 600 }}>
                            visível e sem estoque
                          </div>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 18, flexWrap: "wrap" }}>
        <button type="submit" disabled={pendente || (!podeDinheiro && !podeVitrine)}>
          {pendente ? "Salvando…" : "Salvar alterações"}
        </button>
        {estado.erro ? <span style={{ color: "var(--erro)" }}>{estado.erro}</span> : null}
        {estado.ok ? <span style={{ color: "var(--ok)" }}>{estado.ok}</span> : null}
        {!podeDinheiro ? (
          <span style={{ color: "var(--texto-fraco)", fontSize: "0.85rem" }}>
            Seu papel não permite alterar preço nem custo.
          </span>
        ) : null}
      </div>

      <p style={{ color: "var(--texto-fraco)", fontSize: "0.82rem", marginTop: 14, borderLeft: "3px solid var(--borda)", paddingLeft: 12 }}>
        Trocar preço <b>não sobrescreve</b>: o preço atual é fechado com data de fim e um
        novo é aberto, então o histórico fica. Toda alteração vai para a auditoria com
        antes e depois.
      </p>
    </form>
  );
}
