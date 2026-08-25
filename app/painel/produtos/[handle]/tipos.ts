// Fora do acoes.ts de proposito.
//
// Um modulo com "use server" no topo so pode exportar FUNCAO ASSINCRONA. Se
// exportar um tipo em runtime, uma constante ou um objeto, o Next recusa o
// modulo inteiro com:
//
//   Error: A "use server" file can only export async functions, found object.
//
// E o pior: isso NAO aparece no build. Estoura na avaliacao do modulo, em
// producao, e derruba toda a arvore de rotas que importa o arquivo — foi assim
// que a aba Canais quebrou sem ter relacao nenhuma com o formulario do produto.
//
// Interface some na compilacao (nao vira export em runtime), mas fica aqui
// junto da constante para nao haver duvida de onde procurar.

export interface EstadoProduto {
  erro: string;
  ok: string;
}

export const ESTADO_PRODUTO_INICIAL: EstadoProduto = { erro: "", ok: "" };
