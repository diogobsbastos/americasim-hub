// Estados da tela Google & E-mail. FORA do "use server" de proposito.

export interface EstadoGoogle {
  erro: string;
  ok: string;
  previa: string; // dialogo/corpo do teste, para ver o que o provedor disse
}

export const ESTADO_GOOGLE_INICIAL: EstadoGoogle = { erro: "", ok: "", previa: "" };
