// Estados da tela Requisicoes. FORA do "use server" de proposito.

export interface EstadoReq {
  erro: string;
  ok: string;
}

export const ESTADO_REQ_INICIAL: EstadoReq = { erro: "", ok: "" };
