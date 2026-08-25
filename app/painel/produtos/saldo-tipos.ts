// Tipos e constantes do popup de ajuste de saldo (AjusteSaldo.tsx). FORA do
// saldo-acoes.ts de proposito: modulo "use server" so exporta funcao async.
//
// Arquivo com nome proprio porque ./tipos.ts e ./acoes.ts ja pertencem a
// Matriz variante x canal — em 25/08 um commit sobrescreveu os dois e derrubou
// o build. Pasta compartilhada, nome generico e convite para isso.

export interface EstadoAjuste {
  erro: string;
  ok: string;
  detalhes: string[];
}

export const ESTADO_AJUSTE_INICIAL: EstadoAjuste = { erro: "", ok: "", detalhes: [] };

// Espelho de ROTULO_BAIXA (lib/estoque.ts). Copiado porque lib/estoque importa o
// banco e nao pode entrar num componente de cliente.
export const MOTIVOS_RETIRADA: { id: string; nome: string }[] = [
  { id: "interno", nome: "Uso interno / teste" },
  { id: "devolvido", nome: "Devolvido ao fornecedor" },
  { id: "defeito", nome: "Defeito — não ativa" },
  { id: "expirado", nome: "Venceu antes de vender" },
];
