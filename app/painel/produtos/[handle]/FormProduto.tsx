"use client";

import { useActionState } from "react";
import { salvarProduto } from "./acoes";
import { ESTADO_PRODUTO_INICIAL } from "./tipos";

export default function FormProduto({
  handle,
  nome,
  descricao,
  ativo,
  podeEditar,
}: {
  handle: string;
  nome: string;
  descricao: string;
  ativo: boolean;
  podeEditar: boolean;
}) {
  const [estado, acao, pendente] = useActionState(salvarProduto, ESTADO_PRODUTO_INICIAL);

  return (
    <form action={acao} className="cartao" style={{ marginBottom: 26 }}>
      <input type="hidden" name="handle" value={handle} />
      <h2 style={{ fontSize: "1.1rem", margin: "0 0 4px" }}>Dados do produto</h2>
      <p style={{ color: "var(--texto-fraco)", margin: "0 0 16px", fontSize: "0.88rem" }}>
        A descrição é o texto que vai para a vitrine e, depois, para o anúncio no Mercado Livre.
      </p>

      <label style={{ display: "block", marginBottom: 12 }}>
        <span className="rotulo">Nome</span>
        <input name="nome" defaultValue={nome} required maxLength={200} disabled={!podeEditar || pendente} style={{ width: "100%" }} />
      </label>

      <label style={{ display: "block" }}>
        <span className="rotulo">Descrição</span>
        <textarea
          name="descricao"
          defaultValue={descricao}
          rows={6}
          maxLength={8000}
          disabled={!podeEditar || pendente}
          placeholder="O que o cliente precisa saber antes de comprar: cobertura, como instalar, o que não está incluso."
          style={{
            width: "100%",
            background: "var(--superficie-2)",
            border: "1px solid var(--borda)",
            color: "var(--texto)",
            borderRadius: 10,
            padding: 11,
            font: "inherit",
            fontSize: "0.9rem",
            resize: "vertical",
          }}
        />
      </label>

      <label style={{ display: "inline-flex", gap: 7, alignItems: "center", marginTop: 12, color: "var(--texto-fraco)", fontSize: "0.88rem" }}>
        <input
          type="checkbox"
          name="ativo"
          defaultChecked={ativo}
          disabled={!podeEditar || pendente}
          style={{ width: 15, height: 15, padding: 0, accentColor: "var(--marca)" }}
        />
        produto ativo
      </label>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 16, flexWrap: "wrap" }}>
        <button type="submit" disabled={!podeEditar || pendente}>
          {pendente ? "Salvando…" : "Salvar dados do produto"}
        </button>
        {estado.erro ? <span style={{ color: "var(--erro)" }}>{estado.erro}</span> : null}
        {estado.ok ? <span style={{ color: "var(--ok)" }}>{estado.ok}</span> : null}
      </div>
    </form>
  );
}
