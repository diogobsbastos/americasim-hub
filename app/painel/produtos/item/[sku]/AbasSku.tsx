import Link from "next/link";

// Abas do PRODUTO, nao da familia.
//
// A versao anterior destas abas vivia em /painel/produtos/<handle>/... e cada
// uma abria a familia inteira: o estoque dos tres irmaos, a matriz de preco dos
// tres, o fornecedor dos tres. Para quem opera, isso e ruido — ninguem repoe
// estoque de "eSIM Europa", repoe de "eSIM Europa 5GB 15 dias".
//
// Server component: aba e link, nao estado.

const ABAS = [
  { chave: "resumo", rotulo: "Resumo", sufixo: "" },
  { chave: "estoque", rotulo: "Estoque", sufixo: "/estoque" },
  { chave: "precos", rotulo: "Preço e vitrines", sufixo: "/precos" },
  { chave: "ml", rotulo: "Mercado Livre", sufixo: "/mercado-livre" },
  { chave: "fornecedor", rotulo: "Fornecedor", sufixo: "/fornecedor" },
];

export default function AbasSku({ sku, atual }: { sku: string; atual: string }) {
  const base = `/painel/produtos/item/${encodeURIComponent(sku)}`;
  return (
    <nav style={{ display: "flex", gap: 4, flexWrap: "wrap", borderBottom: "1px solid var(--borda)", margin: "0 0 22px" }}>
      {ABAS.map((a) => {
        const ativa = a.chave === atual;
        return (
          <Link
            key={a.chave}
            href={`${base}${a.sufixo}`}
            aria-current={ativa ? "page" : undefined}
            style={{
              padding: "9px 14px",
              fontSize: "0.9rem",
              fontWeight: ativa ? 700 : 500,
              color: ativa ? "var(--marca)" : "var(--texto-fraco)",
              textDecoration: "none",
              borderBottom: ativa ? "2px solid var(--marca)" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {a.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
