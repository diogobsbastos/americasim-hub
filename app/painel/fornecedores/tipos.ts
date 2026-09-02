// Estados iniciais e tipos da tela de Fornecedores.
//
// Ficam FORA do acoes.ts porque modulo "use server" so pode exportar funcao
// assincrona: constante exportada de la chega undefined no cliente e derruba a
// pagina inteira, sem o build reclamar. Custou a tela de estoque em 18/08/2026.

export interface EstadoForn {
  erro: string;
  ok: string;
}

export const ESTADO_FORN_INICIAL: EstadoForn = { erro: "", ok: "" };

export interface LinhaFornecedor {
  id: string;
  nome: string;
  email: string; // e-mail de requisicao de ICCIDs (contato->>'email')
  ativo: boolean;
  skus: number;
}

export interface LinhaSku {
  varianteId: string;
  sku: string;
  familia: string;
  modo: string;
  fornecedorId: string | null;
}
