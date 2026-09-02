// Estados da aba Zap. FORA do "use server" de proposito.

export interface EstadoZapCfg {
  erro: string;
  ok: string;
}

export const ESTADO_ZAP_CFG_INICIAL: EstadoZapCfg = { erro: "", ok: "" };

// Conexao do WhatsApp (Evolution) — ativacao pela tela: QR, status e troca de numero.
export interface EstadoZap {
  erro: string;
  ok: string;
  estado: string; // "" | sem-instancia | close | connecting | open
  numero: string; // numero conectado (quando open)
  qr: string; // data URI do QR (quando aguardando leitura)
}

export const ESTADO_ZAP_INICIAL: EstadoZap = { erro: "", ok: "", estado: "", numero: "", qr: "" };
