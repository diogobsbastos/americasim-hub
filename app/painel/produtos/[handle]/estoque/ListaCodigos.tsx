"use client";

import { useActionState, useMemo, useState, type CSSProperties } from "react";
import { corrigirAcao, darBaixaAcao, retornarAcao } from "./acoes";
// O estado inicial vem de ./tipos, NUNCA de ./acoes: modulo "use server" so
// exporta funcao assincrona, e uma constante importada de la chega undefined —
// o useActionState comeca com undefined e a primeira leitura de
// `estado.detalhes.length` derruba a pagina inteira, sem o build reclamar.
import { ESTADO_MOVIMENTO_INICIAL } from "./tipos";

// A lista codigo a codigo. O CODIGO DO eSIM NAO ESTA AQUI e nao pode estar: ele
// e o produto, e esta tela e vista por mais gente do que o cofre. O que
// identifica a linha para um humano e o ICCID (ou o pedaco do id).

export interface LinhaEstoque {
  id: string;
  sku: string;
  iccid: string | null;
  status: string;
  lote: string | null;
  operadora: string | null;
  validade: string | null;
  custo_brl: string | null;
  criado_em: string;
}

const ROTULO_BAIXA: Record<string, string> = {
  defeito: "Defeito — não ativa",
  expirado: "Venceu antes de vender",
  devolvido: "Devolvido ao fornecedor",
  interno: "Uso interno / teste",
};

const STATUS_BAIXA = Object.keys(ROTULO_BAIXA);

const COR: Record<string, string> = {
  disponivel: "var(--ok)",
  entregue: "var(--texto-fraco)",
  reservado: "var(--alerta)",
};

function data(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR");
}

function brl(v: string | null): string {
  if (v === null) return "—";
  const n = String(v).split(".");
  return `R$ ${(n[0] || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${(n[1] ?? "00").padEnd(2, "0").slice(0, 2)}`;
}

function Recado({ e }: { e: { erro: string; ok: string; detalhes: string[] } }) {
  // Tudo com `?.`: se o estado vier torto, a tela mostra menos coisa em vez de
  // derrubar a pagina.
  const detalhes = e?.detalhes ?? [];
  if (!e?.erro && !e?.ok) return null;
  return (
    <div style={{ marginTop: 10, fontSize: "0.86rem" }}>
      {e?.erro ? <p style={{ color: "var(--erro)", margin: 0 }}>{e.erro}</p> : null}
      {e?.ok ? <p style={{ color: "var(--ok)", margin: 0 }}>{e.ok}</p> : null}
      {detalhes.length > 0 ? (
        <ul style={{ color: "var(--texto-fraco)", margin: "6px 0 0", paddingLeft: 18 }}>
          {detalhes.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const td: CSSProperties = { padding: "9px 14px" };
const th: CSSProperties = { padding: "10px 14px", fontWeight: 600 };

export default function ListaCodigos({
  handle,
  linhas,
  podeMover,
  podeCusto,
  truncado,
}: {
  handle: string;
  linhas: LinhaEstoque[];
  podeMover: boolean;
  podeCusto: boolean;
  truncado: number;
}) {
  const linhasSeguras = linhas ?? [];
  const [sel, setSel] = useState<Set<string>>(new Set());

  const [eBaixa, aBaixa, pBaixa] = useActionState(darBaixaAcao, ESTADO_MOVIMENTO_INICIAL);
  const [eVolta, aVolta, pVolta] = useActionState(retornarAcao, ESTADO_MOVIMENTO_INICIAL);
  const [eCorr, aCorr, pCorr] = useActionState(corrigirAcao, ESTADO_MOVIMENTO_INICIAL);

  // Quantos dos selecionados podem, de fato, sair ou voltar. Sem isso o botao
  // fica aceso prometendo uma coisa que o servidor vai recusar — e o operador
  // aprende a ignorar o resultado.
  const conta = useMemo(() => {
    let disponiveis = 0, baixados = 0, travados = 0;
    for (const l of linhasSeguras) {
      if (!sel.has(l.id)) continue;
      if (l.status === "disponivel") disponiveis++;
      else if (STATUS_BAIXA.includes(l.status)) baixados++;
      else travados++;
    }
    return { disponiveis, baixados, travados };
  }, [sel, linhasSeguras]);

  function alternar(id: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const todosMarcados = linhasSeguras.length > 0 && sel.size === linhasSeguras.length;
  function alternarTodos() {
    setSel(todosMarcados ? new Set() : new Set(linhasSeguras.map((l) => l.id)));
  }

  const ocultos = [...sel].map((id) => <input key={id} type="hidden" name="ids" value={id} />);

  return (
    <>
      <div className="cartao" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--texto-fraco)", fontSize: "0.7rem" }}>
              <th style={{ ...th, width: 38 }}>
                <input
                  type="checkbox"
                  checked={todosMarcados}
                  onChange={alternarTodos}
                  aria-label="marcar todos"
                  style={{ width: "auto" }}
                />
              </th>
              <th style={th}>ICCID</th>
              <th style={th}>VARIANTE</th>
              <th style={th}>SITUAÇÃO</th>
              <th style={th}>LOTE</th>
              <th style={th}>OPERADORA</th>
              <th style={th}>VALIDADE</th>
              <th style={{ ...th, textAlign: "right" }}>CUSTO</th>
              <th style={th}>ENTROU</th>
            </tr>
          </thead>
          <tbody>
            {linhasSeguras.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ ...td, color: "var(--texto-fraco)" }}>
                  Nenhum código com esses filtros.
                </td>
              </tr>
            ) : null}
            {linhasSeguras.map((l) => (
              <tr
                key={l.id}
                style={{
                  borderTop: "1px solid var(--borda)",
                  background: sel.has(l.id) ? "var(--superficie-2)" : undefined,
                }}
              >
                <td style={td}>
                  <input
                    type="checkbox"
                    checked={sel.has(l.id)}
                    onChange={() => alternar(l.id)}
                    aria-label={`marcar ${l.iccid ?? l.id}`}
                    style={{ width: "auto" }}
                  />
                </td>
                <td style={td}>
                  <code style={{ fontSize: "0.74rem" }}>{l.iccid ?? `sem ICCID · ${l.id.slice(0, 8)}…`}</code>
                </td>
                <td style={td}>
                  <code style={{ fontSize: "0.72rem" }}>{l.sku}</code>
                </td>
                <td style={{ ...td, color: COR[l.status] ?? "var(--erro)" }}>{l.status}</td>
                <td style={td}>{l.lote ?? "—"}</td>
                <td style={{ ...td, color: "var(--texto-fraco)" }}>{l.operadora ?? "—"}</td>
                <td style={{ ...td, color: "var(--texto-fraco)" }}>{data(l.validade)}</td>
                <td style={{ ...td, textAlign: "right" }}>{brl(l.custo_brl)}</td>
                <td style={{ ...td, color: "var(--texto-fraco)" }}>{data(l.criado_em)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {truncado > 0 ? (
        <p style={{ color: "var(--alerta)", fontSize: "0.82rem", marginTop: 8 }}>
          Mostrando as primeiras {linhasSeguras.length} linhas — há mais {truncado} fora desta lista.
          Refine o filtro: agir sobre o que você não está vendo é como isso dá errado.
        </p>
      ) : null}

      {!podeMover ? (
        <p className="nota">Seu papel permite ver, mas não mexer no estoque.</p>
      ) : (
        <div className="cartao" style={{ marginTop: 18, opacity: sel.size === 0 ? 0.55 : 1 }}>
          <p style={{ margin: "0 0 4px", fontWeight: 700 }}>
            {sel.size === 0 ? "Nenhum código selecionado" : `${sel.size} selecionado(s)`}
          </p>
          <p style={{ margin: "0 0 16px", color: "var(--texto-fraco)", fontSize: "0.84rem" }}>
            {conta.disponiveis} disponível(is) · {conta.baixados} já fora do estoque ·{" "}
            {conta.travados} entregue/reservado (esses não se mexem daqui)
          </p>

          <div style={{ display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
            {/* ---------------------------------------------------- retirar */}
            <form action={aBaixa}>
              <input type="hidden" name="handle" value={handle} />
              {ocultos}
              <h3 style={{ fontSize: "0.95rem", margin: "0 0 8px" }}>Retirar do estoque</h3>
              <label className="rotulo">Motivo (vira a situação da linha)</label>
              <select name="status" defaultValue="" required>
                <option value="" disabled>
                  escolha…
                </option>
                {STATUS_BAIXA.map((s) => (
                  <option key={s} value={s}>
                    {ROTULO_BAIXA[s]}
                  </option>
                ))}
              </select>
              <label className="rotulo" style={{ marginTop: 8, display: "block" }}>
                Observação (fica no histórico)
              </label>
              <input type="text" name="motivo" placeholder="nº da nota, chamado, quem pediu…" />
              <button
                type="submit"
                disabled={pBaixa || conta.disponiveis === 0}
                style={{ marginTop: 10, width: "100%" }}
              >
                {pBaixa ? "Retirando…" : `Retirar ${conta.disponiveis || ""}`.trim()}
              </button>
              <Recado e={eBaixa} />
            </form>

            {/* ---------------------------------------------------- devolver */}
            <form action={aVolta}>
              <input type="hidden" name="handle" value={handle} />
              {ocultos}
              <h3 style={{ fontSize: "0.95rem", margin: "0 0 8px" }}>Devolver ao estoque</h3>
              <p style={{ color: "var(--texto-fraco)", fontSize: "0.8rem", margin: "0 0 8px" }}>
                Desfaz uma retirada errada. Código já entregue ao cliente nunca volta.
              </p>
              <label className="rotulo">Observação</label>
              <input type="text" name="motivo" placeholder="baixa feita por engano" />
              <button
                type="submit"
                disabled={pVolta || conta.baixados === 0}
                style={{ marginTop: 10, width: "100%" }}
              >
                {pVolta ? "Devolvendo…" : `Devolver ${conta.baixados || ""}`.trim()}
              </button>
              <Recado e={eVolta} />
            </form>

            {/* ---------------------------------------------------- corrigir */}
            <form action={aCorr}>
              <input type="hidden" name="handle" value={handle} />
              {ocultos}
              <h3 style={{ fontSize: "0.95rem", margin: "0 0 8px" }}>Corrigir dados</h3>
              <p style={{ color: "var(--texto-fraco)", fontSize: "0.8rem", margin: "0 0 8px" }}>
                Campo em branco não altera nada — só o que você preencher é aplicado.
              </p>
              <label className="rotulo">Validade (AAAA-MM-DD)</label>
              <input type="text" name="validade" placeholder="2027-06-30" />
              <label className="rotulo" style={{ marginTop: 6, display: "block" }}>Operadora</label>
              <input type="text" name="operadora" placeholder="Vodafone" />
              <label className="rotulo" style={{ marginTop: 6, display: "block" }}>Lote</label>
              <input type="text" name="lote" placeholder="NF-1234" />
              {podeCusto ? (
                <>
                  <label className="rotulo" style={{ marginTop: 6, display: "block" }}>
                    Custo em BRL (por unidade)
                  </label>
                  <input type="text" name="custo_brl" placeholder="12,34" />
                </>
              ) : (
                <p style={{ color: "var(--texto-fraco)", fontSize: "0.78rem", marginTop: 6 }}>
                  Custo só pode ser alterado por admin.
                </p>
              )}
              <label className="rotulo" style={{ marginTop: 6, display: "block" }}>Observação</label>
              <input type="text" name="motivo" placeholder="conferência com a nota" />
              <button type="submit" disabled={pCorr || sel.size === 0} style={{ marginTop: 10, width: "100%" }}>
                {pCorr ? "Aplicando…" : "Aplicar aos selecionados"}
              </button>
              <Recado e={eCorr} />
            </form>
          </div>
        </div>
      )}
    </>
  );
}
