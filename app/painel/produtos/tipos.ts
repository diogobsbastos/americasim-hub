// Constante e tipo do formulario da matriz.
//
// Moram FORA do acoes.ts porque aquele arquivo carrega a diretiva de servidor
// no topo, e um modulo assim so pode exportar funcao assincrona. Exportar uma
// constante de la faz o Next recusar o modulo inteiro em runtime, derrubando
// toda a arvore de rotas que o importa. Ja aconteceu duas vezes neste projeto:
// na tela de estoque (18/08) e na aba Canais (25/08).

export interface EstadoMatriz {
  erro: string;
  ok: string;
}

export const ESTADO_MATRIZ_INICIAL: EstadoMatriz = { erro: "", ok: "" };
