// Tipos e estado inicial do formulario de criar produto.
//
// POR QUE ESTE ARQUIVO EXISTE em vez de um `export const` no acoes.ts: modulo
// "use server" so pode exportar FUNCOES ASSINCRONAS. Constante exportada de la
// chega `undefined` no cliente, o useActionState comeca undefined, e a primeira
// leitura de um campo derruba a PAGINA INTEIRA — sem o build reclamar. Foi o
// que quebrou a tela de estoque em 18/08/2026.

export interface EstadoNovo {
  erro: string;
  campo: string;
}

export const ESTADO_NOVO_INICIAL: EstadoNovo = { erro: "", campo: "" };

export interface FamiliaOpcao {
  handle: string;
  nome: string;
}

// Os tres modos da migracao 008, com o texto que o operador le.
export const MODOS = [
  {
    v: "estoque",
    r: "De estoque",
    ajuda: "eSIM ja comprado em lote. Entrega na hora, direto da prateleira.",
  },
  {
    v: "operadora_fixo",
    r: "Operadora, plano fixo",
    ajuda: "Nada em estoque. A configuracao ja esta decidida; a operadora gera o QR na hora da compra.",
  },
  {
    v: "operadora_sob_medida",
    r: "Operadora, sob medida",
    ajuda: "O cliente monta o pacote dentro de limites. Nao vai para marketplace.",
  },
];
