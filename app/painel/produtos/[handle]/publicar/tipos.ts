// Fora do acoes.ts: modulo com diretiva de servidor so exporta funcao async.
// Constante ali dentro derruba a arvore inteira de rotas em producao, sem
// aviso no build. Ja aconteceu duas vezes neste projeto.

export interface EstadoPublicar {
  erro: string;
  ok: string;
  previa: string; // o corpo que seria enviado, quando se pede para ver antes
}

export const ESTADO_PUBLICAR_INICIAL: EstadoPublicar = { erro: "", ok: "", previa: "" };

export interface CampoMl {
  id: string;
  nome: string;
  obrigatorio: boolean;
  valores: { id: string; nome: string }[];
  valorAtual: string;
  dica: string;
}

export interface LinhaPublicar {
  varianteId: string;
  sku: string;
  rotulo: string;
  livre: number;
  publicavel: boolean;
  modo: string;
  anuncio: string | null;
  categoria: string;
  titulo: string;
  preco: string;
  campos: CampoMl[];
  bloqueados: { id: string; nome: string }[];
  erroRegras: string;
  sync: string;
  quantidadePublicada: number | null;
  ultimoErro: string;
  baseMlb?: string;
  // "sem_frete" | "mercado_envios". Opcional porque a tela antiga (da familia)
  // ainda monta esta estrutura e nao guarda o campo.
  envio?: string;
}

// Clássico é o padrão: Premium cobra mais caro por parcelamento sem juros que
// não faz diferença num item de cinquenta reais.
export const TIPOS_ANUNCIO = [
  { id: "gold_special", nome: "Clássico" },
  { id: "gold_pro", nome: "Premium" },
];
