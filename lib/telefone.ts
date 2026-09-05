// Normaliza o WhatsApp digitado para +55DDDNUMERO. Aceita com ou sem +55, com
// ou sem mascara. Devolve null quando nao da para aproveitar: a validacao
// conversa com o cliente na tela — lixo nao entra no banco, porque este numero
// e o canal do SAC em viagem.
//
// Morava dentro de app/acoes.ts; virou lib quando o perfil do cliente passou a
// precisar da MESMA regra — modulo "use server" so exporta funcao async, entao
// a funcao pura tinha que sair de la.
export function normalizarZap(bruto: string): string | null {
  const digitos = bruto.replace(/\D/g, "");
  const semPais =
    digitos.startsWith("55") && digitos.length >= 12 ? digitos.slice(2) : digitos;
  // DDD (2 digitos) + numero (8 fixo ou 9 celular).
  if (semPais.length !== 10 && semPais.length !== 11) return null;
  return `+55${semPais}`;
}
