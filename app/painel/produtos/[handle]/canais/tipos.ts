// Fora do acoes.ts: modulo "use server" so exporta funcao assincrona.

export interface EstadoVinculo {
  erro: string;
  ok: string;
}

export const ESTADO_VINCULO_INICIAL: EstadoVinculo = { erro: "", ok: "" };

export interface CanalMarketplace {
  id: string;
  codigo: string;
  nome: string;
  tipo: string;
}

export interface ItemVinculo {
  canalId: string;
  varianteId: string;
  idExterno: string;
  categoria: string;
  status: string;
  ultimoSync: string | null;
  ultimoErro: string | null;
}

export interface SkuVinculo {
  varianteId: string;
  sku: string;
  rotulo: string;
  publicavel: boolean;
  modo: string;
}

// Os estados do enum `status_sync`, em portugues de quem opera.
export const ROTULO_SYNC: Record<string, string> = {
  nao_publicado: "não publicado",
  publicando: "publicando",
  publicado: "publicado",
  divergente: "divergente",
  erro: "erro",
  pausado: "pausado",
};
