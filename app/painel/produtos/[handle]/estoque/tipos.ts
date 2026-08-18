// Tipos e estados iniciais das telas de estoque.
//
// Ficam AQUI, fora do arquivo "use server", porque um modulo "use server" so
// pode exportar funcoes assincronas. Exportar uma constante de la faz o Next
// entregar `undefined` no lugar dela para o componente de cliente, o
// `useActionState` comeca com undefined, e a primeira leitura de
// `estado.detalhes.length` derruba a pagina inteira em producao.
//
// O build NAO reclama disso. Foi assim que a tela de estoque caiu em
// 18/08/2026: o `ESTADO_LOTE_INICIAL` ja morava no acoes.ts e passava batido;
// quebrou de verdade quando o arquivo ganhou mais acoes.
//
// Mesma regra que `app/tipos.ts` ja documentava para a loja.

export interface EstadoLote {
  erro: string;
  ok: string;
  detalhes: string[];
}

export const ESTADO_LOTE_INICIAL: EstadoLote = { erro: "", ok: "", detalhes: [] };

export interface EstadoMovimento {
  erro: string;
  ok: string;
  detalhes: string[];
}

export const ESTADO_MOVIMENTO_INICIAL: EstadoMovimento = { erro: "", ok: "", detalhes: [] };
