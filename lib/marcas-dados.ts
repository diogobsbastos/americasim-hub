// Dados PUROS das vitrines — sem `next/headers`, de proposito.
//
// Separado de lib/marcas.ts em 07/09 pelo mesmo motivo de lib/guarda-regras.ts:
// o que da para testar sem subir o Next fica num modulo que o runner de teste
// consegue importar. `hostAtual`/`marcaAtual` continuam em lib/marcas.ts, que
// re-exporta tudo daqui — nenhum importador precisou mudar.
//
// O teste testes/marcas.test.ts le o bloco @media (prefers-color-scheme: dark)
// do globals.css e exige que TODA vitrine sobrescreva TODOS aqueles tokens.
// Ele existe por causa de um bug real: a ViagemSim sobrescrevia 14 dos 15 e
// esquecia --marca-suave, entao no aparelho em modo escuro ela herdava o
// #3B1526 (vinho da AmericaSim) e o item ativo do menu ficava em 2,35:1.


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
  // IDENTIDADE OFICIAL (05/09): Navy #001B54 + Crimson #F80838, cores medidas
  // dos logos da pasta IDENTIDADE VISUAL — substitui a direção provisória
  // "Embarque" de 18/08. A aposta de tom continua: compra por impulso, nas
  // vésperas da viagem. Os tokens oficiais são o padrão do globals.css.
  chamada: "Pousou. Conectou.",
  rotuloBotao: "Quero agora",
  tokens: {},
};

// Exportado (07/09) para o teste conseguir varrer TODAS as vitrines de uma vez
// — antes era interno, e um objeto que ninguem de fora enxerga e um objeto que
// ninguem de fora confere.
export const MARCAS: Record<string, Marca> = {
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
      // FALTAVA (07/09). Sem esta linha a ViagemSim herdava o --marca-suave da
      // AmericaSim: no aparelho em modo escuro, vinho #3B1526. O item ATIVO do
      // menu do cliente (.ct-item.ativo = fundo --marca-suave + texto --marca)
      // dava 2,35:1 — medido ao vivo, o minimo legivel e 4,5:1. Este azul e o
      // proprio --marca a 10% sobre branco: 5,49:1 com o texto. O teste
      // testes/marcas.test.ts agora impede que um token volte a faltar.
      "--marca-suave": "#e9eff7",
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

// CSS de sobrescrita. Sai como `html[data-marca="x"]`, que tem especificidade
// maior que o `:root` do globals.css — inclusive maior que o `:root` dentro do
// @media de modo claro.
export function cssDaMarca(m: Marca): string {
  const linhas = Object.entries(m.tokens).map(([k, v]) => `  ${k}: ${v};`);
  const bloco = linhas.length ? `html[data-marca="${m.codigo}"] {\n${linhas.join("\n")}\n}` : "";
  return [bloco, m.extra ?? ""].filter(Boolean).join("\n");
}
