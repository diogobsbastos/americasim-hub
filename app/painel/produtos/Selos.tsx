// Selo de canal: um quadradinho com a marca do lugar onde o SKU esta a venda.
//
// Isto substituiu uma lista de texto ("lp-teste, lp-viagemsim"). A troca nao e
// enfeite: a lista de produtos e varrida dezenas de vezes por dia procurando
// uma coisa so — "onde este item esta no ar?". Texto obriga a LER; forma e cor
// se reconhecem de relance. Numa tabela, isso e a diferenca entre percorrer e
// bater o olho.
//
// Cada canal tem cor fixa, derivada do proprio codigo. Fixa importa: se a cor
// mudasse entre telas, o reconhecimento nao se formaria nunca.

export type SeloCanal = {
  codigo: string;
  nome: string;
  tipo: string;
  externo?: string | null; // numero do anuncio, quando e marketplace
  situacao?: string | null; // status_sync do vinculo
};

// Paleta escolhida para funcionar sobre fundo escuro e continuar distinguivel
// por quem nao separa vermelho de verde — os tons variam tambem em luminosidade,
// nao so em matiz.
const PALETA = [
  { fundo: "#1e3a5f", texto: "#8ec5ff" },
  { fundo: "#3d2f5a", texto: "#c4a7ff" },
  { fundo: "#14453d", texto: "#6fd9c0" },
  { fundo: "#4a3520", texto: "#ffc57d" },
  { fundo: "#4a2030", texto: "#ff9db5" },
  { fundo: "#203c4a", texto: "#7fd8f0" },
];

function cor(codigo: string) {
  let n = 0;
  for (let i = 0; i < codigo.length; i++) n = (n + codigo.charCodeAt(i) * (i + 1)) % 9973;
  return PALETA[n % PALETA.length];
}

// A marca dentro do quadrado. "lp-viagemsim" vira VI, "lp-teste" vira TE.
// O prefixo lp- some porque ele e igual em todos — caractere que nao distingue
// nada so ocupa espaco.
function marca(codigo: string): string {
  const limpo = codigo.replace(/^lp[-_]?/i, "").replace(/[^a-z0-9]/gi, "");
  return (limpo.slice(0, 2) || codigo.slice(0, 2)).toUpperCase();
}

const BASE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 30,
  height: 30,
  borderRadius: 8,
  fontSize: "0.7rem",
  fontWeight: 700,
  letterSpacing: "0.02em",
  border: "1px solid transparent",
  flex: "0 0 auto",
};

export default function Selos({ canais }: { canais: SeloCanal[] }) {
  if (!canais || canais.length === 0) {
    return <span style={{ color: "var(--texto-fraco)" }}>—</span>;
  }

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      {canais.map((c) => {
        const eMarketplace = c.tipo !== "landing";
        const comErro = c.situacao === "erro" || c.situacao === "divergente";

        // O amarelo do Mercado Livre e reconhecido antes de qualquer sigla ser
        // lida. Onde a marca do lugar ja e um sinal, usar a marca do lugar.
        const estilo: React.CSSProperties = eMarketplace
          ? { ...BASE, background: "#ffe600", color: "#2d3277" }
          : { ...BASE, background: cor(c.codigo).fundo, color: cor(c.codigo).texto };

        if (comErro) {
          estilo.border = "1px solid var(--erro)";
          estilo.boxShadow = "0 0 0 1px var(--erro)";
        }

        const titulo = [
          c.nome || c.codigo,
          c.externo ? `anúncio ${c.externo}` : null,
          comErro ? `sincronia: ${c.situacao}` : null,
        ].filter(Boolean).join(" · ");

        return (
          <span key={`${c.codigo}-${c.externo ?? ""}`} style={estilo} title={titulo}>
            {eMarketplace ? "ML" : marca(c.codigo)}
          </span>
        );
      })}
    </div>
  );
}
