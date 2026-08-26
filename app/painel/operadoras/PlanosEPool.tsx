"use client";

import { useActionState } from "react";
import { importarPoolAcao, vincularPlanoAcao } from "./acoes";
import { ESTADO_SIMPLES_INICIAL } from "./tipos";
import type { PacoteTela } from "./CartaoCmlink";

export interface VarianteTela {
  id: string;
  sku: string;
  produto: string;
  planoExterno: string | null;
  planoCusto: string | null;
  planoMoeda: string | null;
  pool: number;       // ICCIDs livres no pool desta variante
  reservados: number; // ICCIDs presos a pedidos em andamento
}

function Recado({ e }: { e: { erro: string; ok: string } }) {
  if (!e?.erro && !e?.ok) return null;
  return (
    <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: e?.erro ? "var(--erro)" : "var(--ok)", whiteSpace: "pre-wrap" }}>
      {e?.erro || e?.ok}
    </p>
  );
}

// O que liga a operadora ao catalogo NOSSO: cada SKU de modo `operadora_fixo`
// aponta para UM pacote da CMLink (operadora_plano) e tem um pool de ICCIDs
// virgens (estoque_esim sem codigo). Sem as duas coisas, a venda desse SKU cai
// no alerta "pago sem entrega" — e o motivo aparece na venda.
export default function PlanosEPool({
  variantes, catalogo, podeAdmin,
}: {
  variantes: VarianteTela[]; catalogo: PacoteTela[]; podeAdmin: boolean;
}) {
  const [ePl, aPl, pPl] = useActionState(vincularPlanoAcao, ESTADO_SIMPLES_INICIAL);
  const [ePo, aPo, pPo] = useActionState(importarPoolAcao, ESTADO_SIMPLES_INICIAL);

  return (
    <div className="cartao" style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 14 }}>
      <h2 style={{ fontSize: "0.95rem", textTransform: "uppercase", margin: 0 }}>
        Produtos sob demanda (modo operadora_fixo)
      </h2>

      {variantes.length === 0 ? (
        <p className="nota" style={{ margin: 0 }}>
          Nenhum SKU com modo de entrega <code>operadora_fixo</code>. Crie um em Produtos → Incluir,
          escolhendo esse modo — depois volte aqui para vincular o pacote e carregar ICCIDs.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", fontSize: "0.82rem", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--texto-fraco)" }}>
                <th style={{ padding: "4px 6px" }}>SKU</th>
                <th style={{ padding: "4px 6px" }}>família</th>
                <th style={{ padding: "4px 6px" }}>pacote CMLink</th>
                <th style={{ padding: "4px 6px" }}>custo</th>
                <th style={{ padding: "4px 6px" }}>ICCIDs livres</th>
                <th style={{ padding: "4px 6px" }}>em pedido</th>
              </tr>
            </thead>
            <tbody>
              {variantes.map((v) => (
                <tr key={v.id} style={{ borderTop: "1px solid var(--borda)" }}>
                  <td style={{ padding: "4px 6px" }}><code>{v.sku}</code></td>
                  <td style={{ padding: "4px 6px" }}>{v.produto}</td>
                  <td style={{ padding: "4px 6px" }}>{v.planoExterno ? <code>{v.planoExterno}</code> : <span style={{ color: "var(--erro)" }}>sem plano</span>}</td>
                  <td style={{ padding: "4px 6px" }}>{v.planoCusto ? `${v.planoCusto} ${v.planoMoeda ?? ""}` : "—"}</td>
                  <td style={{ padding: "4px 6px", color: v.pool > 0 ? "var(--ok)" : "var(--erro)", fontWeight: 700 }}>{v.pool}</td>
                  <td style={{ padding: "4px 6px" }}>{v.reservados}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {podeAdmin && variantes.length > 0 ? (
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
          <form action={aPl} style={{ borderTop: "1px solid var(--borda)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            <p style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0 }}>Vincular SKU a um pacote da CMLink</p>
            <label className="rotulo">SKU</label>
            <select name="variante_id" disabled={pPl} defaultValue="">
              <option value="">— escolha —</option>
              {variantes.map((v) => <option key={v.id} value={v.id}>{v.sku}</option>)}
            </select>
            <label className="rotulo">Pacote (dataBundleId)</label>
            {catalogo.length > 0 ? (
              <select name="plano_externo" disabled={pPl} defaultValue="">
                <option value="">— escolha —</option>
                {catalogo.map((p) => (
                  <option key={p.id} value={p.id}>{p.id} · {p.nome} · {p.precos.map((x) => `${x.valor} ${x.moeda}`).join("/")}</option>
                ))}
              </select>
            ) : (
              <input type="text" name="plano_externo" placeholder="sincronize o catálogo, ou digite o id" disabled={pPl} />
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <label className="rotulo">Custo (por pacote)</label>
                <input type="text" name="custo" placeholder="ex. 3.50" inputMode="decimal" disabled={pPl} />
              </div>
              <div style={{ width: 90 }}>
                <label className="rotulo">Moeda</label>
                <input type="text" name="custo_moeda" defaultValue="USD" maxLength={3} disabled={pPl} />
              </div>
            </div>
            <button type="submit" disabled={pPl} style={{ marginTop: 6 }}>{pPl ? "Guardando…" : "Vincular"}</button>
            <Recado e={ePl} />
          </form>

          <form action={aPo} style={{ borderTop: "1px solid var(--borda)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            <p style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0 }}>Carregar ICCIDs no pool</p>
            <p style={{ color: "var(--texto-fraco)", fontSize: "0.82rem", margin: 0 }}>
              Um ICCID por linha (18 a 20 dígitos). Entram como códigos vendáveis SEM QR — o pacote é comprado
              e o QR buscado na hora da venda. Repetidos são ignorados.
            </p>
            <label className="rotulo">SKU</label>
            <select name="variante_id" disabled={pPo} defaultValue="">
              <option value="">— escolha —</option>
              {variantes.map((v) => <option key={v.id} value={v.id}>{v.sku}</option>)}
            </select>
            <label className="rotulo">ICCIDs</label>
            <textarea name="iccids" rows={5} placeholder={"89852342022449473379\n89852342022449473387"} disabled={pPo} style={{ fontFamily: "var(--fonte-mono)", fontSize: "0.82rem" }} />
            <button type="submit" disabled={pPo} style={{ marginTop: 6 }}>{pPo ? "Carregando…" : "Carregar no pool"}</button>
            <Recado e={ePo} />
          </form>
        </div>
      ) : null}
    </div>
  );
}
