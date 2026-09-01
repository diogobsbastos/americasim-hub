// Tipos das telas de conta — fora do "use server" (que so exporta funcoes).

export interface EstadoConta {
  erro: string;
}

export const ESTADO_CONTA_INICIAL: EstadoConta = { erro: "" };
