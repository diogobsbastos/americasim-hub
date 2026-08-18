// Estados iniciais da area Conexoes.
//
// Ficam FORA do "use server": modulo de acao so pode exportar funcao
// assincrona, e constante exportada de la chega `undefined` no cliente,
// derrubando a pagina na primeira leitura de `.detalhes.length`.
// Foi assim que a tela de estoque caiu em 18/08/2026.

export interface EstadoConexao {
  erro: string;
  ok: string;
}

export const ESTADO_CONEXAO_INICIAL: EstadoConexao = { erro: "", ok: "" };
