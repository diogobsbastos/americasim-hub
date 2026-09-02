// Estados da tela Requisicoes. FORA do "use server" de proposito.
// Os estados do Zap mudaram para app/painel/config/zap/tipos.ts (02/09).

export interface EstadoReq {
  erro: string;
  ok: string;
}

export const ESTADO_REQ_INICIAL: EstadoReq = { erro: "", ok: "" };
