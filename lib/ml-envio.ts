import { tokenDoCanal } from "./mercadolivre";

// Como o produto chega ao comprador, do ponto de vista do Mercado Livre.
//
// A primeira versao do publicador cravava `{ mode: "me2" }` porque foi o que o
// formulario deles ofereceu quando o anuncio foi criado na mao. Assumir que o
// formulario mostra todas as opcoes foi o mesmo erro de sempre: o `settings` da
// categoria dizia
//
//   simple_shipping  = optional          <- Mercado Envios NAO e obrigatorio
//   shipping_options = ["carrier", "custom"]
//
// "custom" e frete por conta do vendedor. Com custo zero, equivale a vender sem
// frete — que e o que um eSIM precisa, porque nada viaja.

export type TipoEnvio = "sem_frete" | "mercado_envios";

export const TIPOS_ENVIO: { id: TipoEnvio; nome: string; explicacao: string }[] = [
  {
    id: "sem_frete",
    nome: "Sem frete — entrega digital",
    explicacao:
      "Nada viaja: o código do eSIM vai pela conversa do Mercado Livre assim que o pagamento é aprovado.",
  },
  {
    id: "mercado_envios",
    nome: "Mercado Envios",
    explicacao:
      "Gera etiqueta e cobra frete. Só faz sentido para chip físico, que viaja numa caixa.",
  },
];

export function corpoDoEnvio(tipo: TipoEnvio): any {
  if (tipo === "mercado_envios") {
    return { mode: "me2", local_pick_up: true, free_shipping: false };
  }
  // A primeira versao mandava `costs: 0` e o ML recusou em 25/08:
  //
  //   body.invalid_field_types · invalid property type: [shipping.costs]
  //   expected List but was Integer value: 0
  //
  // No contrato de envio personalizado, `costs` e uma LISTA de
  // { description, cost }, com o valor em string, e `methods` vai vazio
  // (developers.mercadolibre.com.ar/en_us/custom-shipping). Um item com custo
  // "0" e o que faz o comprador nao pagar nada. `local_pick_up: true` porque,
  // formalmente, ele "retira" — e o mais perto de "nao ha entrega" que esta
  // categoria permite dizer.
  return {
    mode: "custom",
    local_pick_up: true,
    free_shipping: false,
    methods: [],
    costs: [{ description: "Entrega digital pela conversa do Mercado Livre", cost: "0" }],
  };
}

// Consertar o envio de um anuncio JA publicado, sem republicar.
//
// Republicar custa: perde o historico do anuncio, perde as visitas, e deixa um
// anuncio orfao no ar para alguem comprar por engano. Se o ML aceitar a
// alteracao, e sempre melhor alterar.
export async function atualizarEnvio(
  canalId: string,
  mlb: string,
  tipo: TipoEnvio,
): Promise<{ ok: boolean; erro: string }> {
  const token = await tokenDoCanal(canalId);
  const r = await fetch(`https://api.mercadolibre.com/items/${mlb}`, {
    method: "PUT",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ shipping: corpoDoEnvio(tipo) }),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });

  const bruto = await r.text();
  if (r.ok) return { ok: true, erro: "" };

  let dados: any = null;
  try {
    dados = JSON.parse(bruto);
  } catch {
    /* fica o texto cru */
  }
  const causas: string[] = [];
  for (const c of dados?.cause ?? []) {
    const partes = [c?.code, c?.message].filter((x: any) => typeof x === "string" && x.trim());
    if (partes.length) causas.push(partes.join(" · "));
  }
  const titulo = String(dados?.message ?? `HTTP ${r.status}`);
  const detalhe = causas.length ? causas.join(" | ") : String(dados?.error ?? bruto.slice(0, 500));
  return { ok: false, erro: `${titulo} — ${detalhe}` };
}
