import Link from "next/link";

// Dentro do produto, um assunto por aba.
//
// A pagina unica empilhava dados do produto, matriz de canais e historico de
// preco numa rolagem so. Funcionava com um produto e tres variantes; com
// fornecedor, ficha do marketplace e limites de sob medida chegando, viraria
// uma tela que ninguem le ate o fim.
//
// Server component de proposito: aba e link, nao estado. Marcar a atual por
// prop evita mandar `usePathname` e um bundle de cliente para o navegador so
// para pintar uma borda.

const ABAS = [
  { chave: "dados", rotulo: "Dados", sufixo: "" },
  { chave: "canais", rotulo: "Canais e preços", sufixo: "/canais" },
  { chave: "estoque", rotulo: "Estoque", sufixo: "/estoque" },
  { chave: "fornecedor", rotulo: "Fornecedor", sufixo: "/fornecedor" },
];

export default function Abas({ handle, atual }: { handle: string; atual: string }) {
  return (
    <nav
      style={{
        display: "flex",
        gap: 4,
        flexWrap: "wrap",
        borderBottom: "1px solid var(--borda)",
        margin: "0 0 22px",
      }}
    >
      {ABAS.map((a) => {
        const ativa = a.chave === atual;
        return (
          <Link
            key={a.chave}
            href={`/painel/produtos/${handle}${a.sufixo}`}
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
