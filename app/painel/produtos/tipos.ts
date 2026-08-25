// Tipos e constantes do popup de ajuste de saldo. FORA do acoes.ts de
// proposito: modulo "use server" so exporta funcao async (18/08 e 25/08).

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
