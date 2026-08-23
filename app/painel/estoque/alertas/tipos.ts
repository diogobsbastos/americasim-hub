// Fora do acoes.ts: modulo "use server" so exporta funcao assincrona. Constante
// exportada de la chega undefined no cliente e derruba a pagina inteira sem o
// build reclamar (18/08/2026).

export interface EstadoRegras {
  erro: string;
  ok: string;
}

export const ESTADO_REGRAS_INICIAL: EstadoRegras = { erro: "", ok: "" };

export interface LinhaRegra {
  varianteId: string;
  sku: string;
  familia: string;
  disponivel: number;
  minimo: number;
  critico: number;
  acao: string;
  ativa: boolean;
}

// O que cada acao faz, em portugues de quem opera e nao de quem programou.
export const ACOES = [
  { v: "alertar", r: "Avisar", ajuda: "Marca na tela. A loja continua vendendo." },
  { v: "pausar_venda", r: "Pausar a venda", ajuda: "Tira da vitrine ao chegar no crítico. Ninguém paga por algo que não temos." },
  { v: "pausar_e_alertar", r: "Pausar e avisar", ajuda: "As duas coisas. É o que faz sentido na maioria dos casos." },
  { v: "repor_automatico", r: "Repor sozinho", ajuda: "Depende do motor de compra na operadora, que ainda não existe. Não escolha ainda." },
];
