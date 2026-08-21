// Estados iniciais da area Pagamentos.
//
// Ficam FORA do "use server": modulo de acao so pode exportar funcao assincrona,
// e constante exportada de la chega `undefined` no cliente, derrubando a pagina.
// Foi assim que a tela de estoque caiu em 18/08/2026.

export interface EstadoPagamento {
  erro: string;
  ok: string;
}

export const ESTADO_PAGAMENTO_INICIAL: EstadoPagamento = { erro: "", ok: "" };

// O resultado de FALAR com a Stripe. "A chave existe" e "a chave funciona" sao
// fatos diferentes: so este teste prova o segundo.
export interface EstadoContaStripe {
  erro: string;
  ok: string;
  conta: {
    id: string;
    nome: string;
    pais: string;
    moeda: string;
    podeCobrar: boolean;
  } | null;
}

export const ESTADO_CONTA_STRIPE_INICIAL: EstadoContaStripe = { erro: "", ok: "", conta: null };
