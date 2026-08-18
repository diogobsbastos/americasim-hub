import { headers } from "next/headers";

// Uma base, N vitrines — SPEC/07 e decisão 5 de 17/08.
//
// A decisão original previa "N processos systemd, mesmo build, .env diferente".
// A própria SPEC diz que a partir de ~10 vitrines isso vira um processo só que
// escolhe o tema pelo Host. Com duas lojas, começar já assim custa menos: uma
// unit a menos, um .env a menos, uma porta a menos, e uma peça a menos para
// cair de madrugada. Separar depois continua possível — o que muda é o
// roteamento no Nginx, não o código.
//
// O que NÃO muda entre as vitrines: o estoque. `estoque_esim` não tem canal.
// Vender numa loja derruba o número na outra no mesmo segundo, e isso não é
// recurso construído: é consequência do desenho.

export interface Marca {
  codigo: string;
  nome: string;
  chamada: string;
  rotuloBotao: string;
  // Sobrescreve os tokens do globals.css. Trocar a identidade de uma vitrine é
  // trocar este bloco — não as telas.
  tokens: Record<string, string>;
  // Regras extras, para o que um token sozinho não resolve.
  extra?: string;
}

export const MARCA_PADRAO: Marca = {
  codigo: "americasim",
  nome: "AmericaSim",
  // Direção 2 "Embarque" (IDENTIDADE_VISUAL_AMERICASIM.html), escolhida em 18/08.
  // A aposta dela: a compra é por impulso, nas vésperas da viagem. Ganha quem
  // for mais rápido e mais óbvio. Os tokens já são o padrão do globals.css.
  chamada: "Pousou. Conectou.",
  rotuloBotao: "Quero agora",
  tokens: {},
};

const MARCAS: Record<string, Marca> = {
  "viagemsim.duckdns.org": {
    codigo: "viagemsim",
    nome: "ViagemSim",
    // Direção 1 "Passaporte". A aposta é o OPOSTO da Embarque: o medo pesa mais
    // que o preço — quem compra chip de viagem está com medo de chegar num país
    // estrangeiro sem internet. Vende-se garantia, não tecnologia.
    // Duas vitrines com a mesma cara não provam nada para ninguém; duas apostas
    // diferentes sobre o MESMO estoque, sim.
    chamada: "Você desembarca conectado. Garantido.",
    rotuloBotao: "Garantir meu eSIM",
    tokens: {
      // Cobre TAMBÉM o modo escuro do sistema: a identidade de uma vitrine não
      // pode depender de como está configurado o aparelho de quem visita.
      "color-scheme": "light",
      "--fundo": "#f5f2ec",
      "--superficie": "#ffffff",
      "--superficie-2": "#efebe2",
      "--borda": "#ddd6c8",
      "--texto": "#1a1d21",
      "--texto-fraco": "#5c6470",
      "--marca": "#1e5aab",
      "--marca-forte": "#0f2a4a",
      "--marca-contraste": "#ffffff",
      // Ouro selo fica para o SELO, não para texto: sobre papel ele dá algo em
      // torno de 2,3:1 e a palavra some. O preço vai de azul passaporte.
      "--realce": "#0f2a4a",
      "--ok": "#14724a",
      "--alerta": "#8a6d12",
      "--erro": "#b3261e",
      "--sombra": "0 1px 2px rgba(26,29,33,0.06), 0 8px 24px rgba(26,29,33,0.08)",
    },
    extra: [
      `html[data-marca="viagemsim"] .selo { background: #c9a227; color: #1a1d21; }`,
      `html[data-marca="viagemsim"] .plano.destaque { border-color: #c9a227; outline-color: #c9a227; }`,
      `html[data-marca="viagemsim"] .ponto { background: #0f2a4a; }`,
    ].join("\n"),
  },
};

export async function hostAtual(): Promise<string> {
  const h = await headers();
  const bruto = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  return bruto.split(":")[0].trim().toLowerCase();
}

export async function marcaAtual(): Promise<Marca> {
  return MARCAS[await hostAtual()] ?? MARCA_PADRAO;
}

// CSS de sobrescrita. Sai como `html[data-marca="x"]`, que tem especificidade
// maior que o `:root` do globals.css — inclusive maior que o `:root` dentro do
// @media de modo claro.
export function cssDaMarca(m: Marca): string {
  const linhas = Object.entries(m.tokens).map(([k, v]) => `  ${k}: ${v};`);
  const bloco = linhas.length ? `html[data-marca="${m.codigo}"] {\n${linhas.join("\n")}\n}` : "";
  return [bloco, m.extra ?? ""].filter(Boolean).join("\n");
}
