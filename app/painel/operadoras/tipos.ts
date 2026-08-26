// Estados iniciais da area Operadoras.
//
// FORA do "use server" de proposito: modulo de acao so pode exportar funcao
// assincrona (foi assim que a tela de estoque caiu em 18/08 e a aba Canais em
// 25/08 — o build nao acusa, a producao cai).

export interface EstadoSimples {
  erro: string;
  ok: string;
}

export const ESTADO_SIMPLES_INICIAL: EstadoSimples = { erro: "", ok: "" };

// Resultado de uma chamada a operadora, como a tela mostra: resumo em uma
// linha + a resposta completa (JSON) para quem precisa ler o que eles disseram.
export interface Chamada {
  titulo: string;
  resumo: string;
  ok: boolean;
  corpo: string; // JSON formatado da resposta (ou do erro de rede)
}

export interface EstadoChamadas {
  erro: string;
  ok: string;
  chamadas: Chamada[];
  // Preenchido so pela consulta de ICCID, quando o eSIM ja tem QR.
  lpa: string;
  qrPng: string; // base64, sem o prefixo data:
}

export const ESTADO_CHAMADAS_INICIAL: EstadoChamadas = { erro: "", ok: "", chamadas: [], lpa: "", qrPng: "" };
