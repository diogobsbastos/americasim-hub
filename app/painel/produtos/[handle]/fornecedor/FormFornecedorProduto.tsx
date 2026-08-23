"use client";

import { useActionState } from "react";
import { vincularSkus } from "../../../fornecedores/acoes";
import { ESTADO_FORN_INICIAL, type LinhaFornecedor, type LinhaSku } from "../../../fornecedores/tipos";

// Reaproveita a MESMA acao da tela de Fornecedores de proposito. Duas telas
// escrevendo o mesmo campo por caminhos diferentes e como duas portas para a
// mesma sala: uma delas acaba sem auditoria e ninguem percebe.

export default function FormFornecedorProduto({
  fornecedores,
  skus,
  podeMexer,
}: {
  fornecedores: LinhaFornecedor[];
  skus: LinhaSku[];
  podeMexer: boolean;
}) {
  const [estado, acao, enviando] = useActionState(vincularSkus, ESTADO_FORN_INICIAL);

  if (fornecedores.length === 0) {
    return (
      <div className="cartao">
        <p style={{ margin: 0 }}>
          Nenhum fornecedor cadastrado ainda.{" "}
          <a href="/painel/fornecedores">Cadastrar Vodafone, T-Mobile, China Mobile →</a>
        </p>
      </div>
    );
  }

  return (
    <form action={acao} className="cartao">
      <h2 style={{ margin: "0 0 4px", fontSize: "1rem" }}>De quem vem cada SKU deste produto</h2>
      <p style={{ margin: "0 0 14px", color: "var(--texto-fraco)", fontSize: "0.85rem" }}>
        O mesmo campo aparece na tela geral de Fornecedores — aqui fica o recorte deste produto.
      </p>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <tbody>
            {skus.map((s) => (
              <tr key={s.varianteId} style={{ borderTop: "1px solid var(--borda)" }}>
                <td style={{ padding: "10px 4px" }}>
                  <code style={{ fontSize: "0.8rem" }}>{s.sku}</code>
                </td>
                <td style={{ padding: "10px 4px", minWidth: 200 }}>
                  <select name={`forn__${s.varianteId}`} defaultValue={s.fornecedorId ?? ""} disabled={!podeMexer}>
                    <option value="">— sem fornecedor</option>
                    {fornecedores.map((f) => (
                      <option key={f.id} value={f.id} disabled={!f.ativo && f.id !== s.fornecedorId}>
                        {f.nome}{f.ativo ? "" : " (inativo)"}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {podeMexer ? (
        <button type="submit" disabled={enviando} style={{ marginTop: 14 }}>
          {enviando ? "Salvando…" : "Salvar"}
        </button>
      ) : (
        <p className="nota" style={{ marginTop: 12 }}>Seu papel permite ver, mas não alterar.</p>
      )}

      {estado?.erro || estado?.ok ? (
        <p style={{ margin: "10px 0 0", fontSize: "0.86rem", color: estado.erro ? "var(--erro)" : "var(--ok)" }}>
          {estado.erro || estado.ok}
        </p>
      ) : null}
    </form>
  );
}
