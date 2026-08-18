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

export interface EstadoUsuarioTeste {
  erro: string;
  ok: string;
  // A senha aparece UMA vez, logo depois de criar. Depois so pelo botao "ver
  // senha" — que e outra acao, no servidor, e nao um campo escondido no HTML.
  criado: { id: string; apelido: string; email: string; senha: string } | null;
  // Qual usuario teve a senha revelada agora, e qual e.
  senhaDe: string;
  senha: string;
}

export const ESTADO_USUARIO_TESTE_INICIAL: EstadoUsuarioTeste = {
  erro: "", ok: "", criado: null, senhaDe: "", senha: "",
};
