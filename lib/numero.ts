import { randomInt } from "node:crypto";

// Numero de pedido NAO sequencial (SPEC/03 rev. 18/08): sequencial vaza volume
// de vendas e convida enumeracao. Alfabeto sem caracteres ambiguos (0/O, 1/I/L).
const ALFA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function bloco(n: number): string {
  let s = "";
  for (let i = 0; i < n; i++) s += ALFA[randomInt(ALFA.length)];
  return s;
}

export function novoNumeroPedido(): string {
  return `AM-${bloco(4)}-${bloco(4)}`;
}
