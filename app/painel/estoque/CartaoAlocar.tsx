"use client";

import { useActionState } from "react";
import { alocarFornecedorAcao } from "./acoes";
import { ESTADO_MOVIMENTO_INICIAL } from "./tipos";

export interface PoolFornecedor {
  fornecedorId: string; // "" = sem fornecedor marcado
  nome: string;
  semProduto: number;
}

export interface SkuAlocavel {
  id: string;
  sku: string;
}

// Alocacao do estoque do fornecedor (02/09): "chega do fornecedor primeiro,
// vira produto quando voce decidir". Escolhe fornecedor (+lote opcional),
// quantidade e o SKU que recebe.
export default function CartaoAlocar({ pools, skus, podeMexer }: {
  pools: PoolFornecedor[];
  skus: SkuAlocavel[];
  podeMexer: boolean;
}) {
  const [e, agir, pendente] = useActionState(alocarFornecedorAcao, ESTADO_MOVIMENTO_INICIAL);

  const total = pools.reduce((soma, p) => soma + p.semProduto, 0);
  if (total === 0 && !e.ok && !e.erro) return null;

  return (
    <div className="cartao" style={{ marginBottom: 22 }}>
      <h2 style={{ fontSize: "0.95rem", textTransform: "uppercase", margin: "0 0 6px" }}>
        Estoque do fornecedor — {total} código(s) sem produto
      </h2>
      <p className="nota" style={{ marginTop: 0 }}>
        Códigos recebidos e guardados, mas fora de venda até você alocá-los a um produto.
        A alocação pega os mais antigos do fornecedor/lote escolhido.
      </p>
      {podeMexer ? (
        <form action={agir} style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
          <label style={{ fontSize: "0.78rem", color: "var(--texto-fraco)" }}>
            Fornecedor
            <select name="fornecedor_id" defaultValue="" style={{ display: "block", marginTop: 4 }} disabled={pendente}>
              <option value="">qualquer</option>
              {pools.filter((p) => p.fornecedorId !== "").map((p) => (
                <option key={p.fornecedorId} value={p.fornecedorId}>{p.nome} ({p.semProduto})</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: "0.78rem", color: "var(--texto-fraco)" }}>
            Lote (opcional)
            <input name="lote" placeholder="easysim-2026-09-02" style={{ display: "block", marginTop: 4, width: 180 }} disabled={pendente} />
          </label>
          <label style={{ fontSize: "0.78rem", color: "var(--texto-fraco)" }}>
            Quantidade
            <input name="quantidade" type="number" min={1} max={10000} required style={{ display: "block", marginTop: 4, width: 110 }} disabled={pendente} />
          </label>
          <label style={{ fontSize: "0.78rem", color: "var(--texto-fraco)" }}>
            SKU que recebe
            <select name="variante_id" required defaultValue="" style={{ display: "block", marginTop: 4 }} disabled={pendente}>
              <option value="" disabled>escolha…</option>
              {skus.map((s) => (
                <option key={s.id} value={s.id}>{s.sku}</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={pendente}>{pendente ? "Alocando…" : "Alocar"}</button>
        </form>
      ) : null}
      {e.erro ? <p style={{ color: "var(--erro)", margin: "8px 0 0", fontSize: "0.84rem" }}>{e.erro}</p> : null}
      {e.ok ? <p style={{ color: "var(--ok)", margin: "8px 0 0", fontSize: "0.84rem" }}>{e.ok}</p> : null}
    </div>
  );
}
