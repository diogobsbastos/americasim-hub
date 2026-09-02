"use client";

import { useActionState } from "react";
import { criarFornecedor, alternarFornecedor, salvarEmailFornecedor, vincularSkus } from "./acoes";
import { ESTADO_FORN_INICIAL, type LinhaFornecedor, type LinhaSku } from "./tipos";

const ROTULO_MODO: Record<string, string> = {
  estoque: "estoque",
  operadora_fixo: "operadora",
  operadora_sob_medida: "sob medida",
};

function Recado({ erro, ok }: { erro: string; ok: string }) {
  if (!erro && !ok) return null;
  return (
    <p style={{ margin: "10px 0 0", fontSize: "0.86rem", color: erro ? "var(--erro)" : "var(--ok)" }}>
      {erro || ok}
    </p>
  );
}

export default function PainelFornecedores({
  fornecedores,
  skus,
  podeMexer,
}: {
  fornecedores: LinhaFornecedor[];
  skus: LinhaSku[];
  podeMexer: boolean;
}) {
  const [eNovo, aNovo, pNovo] = useActionState(criarFornecedor, ESTADO_FORN_INICIAL);
  const [eAlt, aAlt, pAlt] = useActionState(alternarFornecedor, ESTADO_FORN_INICIAL);
  const [eVinc, aVinc, pVinc] = useActionState(vincularSkus, ESTADO_FORN_INICIAL);
  const [eMail, aMail, pMail] = useActionState(salvarEmailFornecedor, ESTADO_FORN_INICIAL);

  const ativos = fornecedores.filter((f) => f.ativo);
  const semFornecedor = skus.filter((s) => !s.fornecedorId).length;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {semFornecedor > 0 ? (
        <div className="cartao perigo">
          <div className="rot">SKUs sem fornecedor</div>
          <div className="val">{semFornecedor}</div>
          <div className="pe">
            Sem fornecedor o custo e numero declarado, nao apurado — e a margem da tela
            carrega esse aviso.
          </div>
        </div>
      ) : null}

      <div className="cartao">
        <h2 style={{ margin: "0 0 4px", fontSize: "1rem" }}>Quem fornece</h2>
        <p style={{ margin: "0 0 14px", color: "var(--texto-fraco)", fontSize: "0.85rem" }}>
          A operadora ou o intermediario de quem a gente compra o eSIM. O <b>e-mail de
          requisição</b> é para onde a tela Requisições manda o pedido de ICCIDs — e é por
          ele que o robô reconhece de quem veio o CSV de resposta.
        </p>

        {fornecedores.length === 0 ? (
          <p className="nota">Nenhum fornecedor cadastrado ainda.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <tbody>
                {fornecedores.map((f) => (
                  <tr key={f.id} style={{ borderTop: "1px solid var(--borda)" }}>
                    <td style={{ padding: "10px 4px" }}>
                      <b>{f.nome}</b>
                      {f.ativo ? null : (
                        <span style={{ color: "var(--texto-fraco)", fontSize: "0.78rem" }}> · inativo</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 4px" }}>
                      {podeMexer ? (
                        <form action={aMail} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <input type="hidden" name="id" value={f.id} />
                          <input
                            name="email"
                            defaultValue={f.email}
                            placeholder="e-mail de requisição"
                            style={{ width: 220, fontSize: "0.82rem" }}
                            disabled={pMail}
                          />
                          <button type="submit" className="botao secundario" disabled={pMail}>ok</button>
                        </form>
                      ) : (
                        <span style={{ color: "var(--texto-fraco)", fontSize: "0.84rem" }}>{f.email || "—"}</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 4px", color: "var(--texto-fraco)", fontSize: "0.84rem" }}>
                      {f.skus} SKU{f.skus === 1 ? "" : "s"}
                    </td>
                    <td style={{ padding: "10px 4px", textAlign: "right" }}>
                      {podeMexer ? (
                        <form action={aAlt} style={{ display: "inline" }}>
                          <input type="hidden" name="id" value={f.id} />
                          <button type="submit" className="botao secundario" disabled={pAlt}>
                            {f.ativo ? "Desativar" : "Reativar"}
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Recado erro={eAlt?.erro ?? ""} ok={eAlt?.ok ?? ""} />
        <Recado erro={eMail?.erro ?? ""} ok={eMail?.ok ?? ""} />

        {podeMexer ? (
          <form action={aNovo} style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
            <input name="nome" placeholder="T-Mobile" style={{ flex: "1 1 180px", width: "auto" }} />
            <input name="email" type="email" placeholder="e-mail de requisicao (opcional)" style={{ flex: "1 1 200px", width: "auto" }} />
            <input name="contato" placeholder="contato ou observacao (opcional)" style={{ flex: "2 1 220px", width: "auto" }} />
            <button type="submit" disabled={pNovo}>{pNovo ? "Cadastrando…" : "Cadastrar"}</button>
          </form>
        ) : (
          <p className="nota" style={{ marginTop: 12 }}>Seu papel permite ver, mas nao cadastrar.</p>
        )}
        <Recado erro={eNovo?.erro ?? ""} ok={eNovo?.ok ?? ""} />
      </div>

      <div className="cartao">
        <h2 style={{ margin: "0 0 4px", fontSize: "1rem" }}>De quem vem cada produto</h2>
        <p style={{ margin: "0 0 14px", color: "var(--texto-fraco)", fontSize: "0.85rem" }}>
          Tudo numa tela so. Abrir produto por produto para dizer de quem se compra e o tipo
          de tarefa que ninguem faz — ate o dia em que o dado falta.
        </p>

        {ativos.length === 0 ? (
          <p className="nota">Cadastre um fornecedor acima antes de amarrar os SKUs.</p>
        ) : (
          <form action={aVinc}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <tbody>
                  {skus.map((s) => (
                    <tr key={s.varianteId} style={{ borderTop: "1px solid var(--borda)" }}>
                      <td style={{ padding: "10px 4px" }}>
                        <b>{s.familia}</b>
                        <br />
                        <code style={{ fontSize: "0.75rem", color: "var(--texto-fraco)" }}>{s.sku}</code>
                      </td>
                      <td style={{ padding: "10px 4px", color: "var(--texto-fraco)", fontSize: "0.8rem" }}>
                        {ROTULO_MODO[s.modo] ?? s.modo}
                      </td>
                      <td style={{ padding: "10px 4px", minWidth: 180 }}>
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
              <button type="submit" disabled={pVinc} style={{ marginTop: 14 }}>
                {pVinc ? "Salvando…" : "Salvar vinculos"}
              </button>
            ) : null}
            <Recado erro={eVinc?.erro ?? ""} ok={eVinc?.ok ?? ""} />
          </form>
        )}
      </div>
    </div>
  );
}
