// Fora do modulo "use server": la so pode haver funcao assincrona exportada.

export interface EstadoPapel {
  erro: string;
  ok: string;
}

export const ESTADO_PAPEL_INICIAL: EstadoPapel = { erro: "", ok: "" };

// Nao sao papeis do Mercado Livre — la os dois usuarios de teste sao iguais.
// Quem da papel a eles somos nos, para saber em qual conta autorizar o hub e
// com qual conta comprar.
export const PAPEIS = [
  { v: "", r: "— sem papel" },
  { v: "vendedor", r: "Vendedor" },
  { v: "comprador", r: "Comprador" },
];
