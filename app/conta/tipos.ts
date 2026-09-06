// Tipos das telas de conta — fora do "use server" (que so exporta funcoes).

export interface EstadoConta {
  erro: string;
}

export const ESTADO_CONTA_INICIAL: EstadoConta = { erro: "" };

// Estado dos formularios do perfil: alem do erro, um "ok" curto de confirmacao
// ("Dados salvos.") — sem ele o cliente clica e nao sabe se aconteceu algo.
export interface EstadoPerfil {
  erro: string;
  ok: string;
}

export const ESTADO_PERFIL_INICIAL: EstadoPerfil = { erro: "", ok: "" };
