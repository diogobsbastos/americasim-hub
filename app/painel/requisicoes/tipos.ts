// Estados da tela Requisicoes. FORA do "use server" de proposito.

export interface EstadoReq {
  erro: string;
  ok: string;
}

export const ESTADO_REQ_INICIAL: EstadoReq = { erro: "", ok: "" };

// Conexao do WhatsApp (Evolution) — ativacao pela tela: QR, status e troca de numero.
export interface EstadoZap {
  erro: string;
  ok: string;
  estado: string; // "" | sem-instancia | close | connecting | open
  numero: string; // numero conectado (quando open)
  qr: string; // data URI do QR (quando aguardando leitura)
}

export const ESTADO_ZAP_INICIAL: EstadoZap = { erro: "", ok: "", estado: "", numero: "", qr: "" };
