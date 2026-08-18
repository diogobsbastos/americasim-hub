// Uma data escrita em dois lugares com dois fusos vira DUAS datas na cabeca de
// quem le. Foi o que aconteceu no cartao de Conexoes: o servidor roda em UTC e
// o navegador do operador roda em Brasilia, os dois chamaram toLocaleString sem
// dizer o fuso, e a MESMA credencial apareceu vencendo "19/08 02:25" numa linha
// e "18/08 23:25" na linha de baixo.
//
// Entao o fuso e fixado aqui e todo mundo usa isto. Vale tambem para hidratacao:
// server e client passam a render a mesma string.

export const FUSO = "America/Sao_Paulo";

export function quando(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return "—";
  return x.toLocaleString("pt-BR", {
    timeZone: FUSO,
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// "5 h 58 min" / "12 min". Para prazo curto — o token do Mercado Livre vive 6 h —
// isso informa mais do que o horario absoluto.
//
// NAO usar dentro de componente client renderizado no servidor: o valor muda
// entre o SSR e a hidratacao e o React reclama. Calcule no servidor e passe a
// string pronta.
export function duracao(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "0 min";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  if (h < 24) return resto ? `${h} h ${resto} min` : `${h} h`;
  const dias = Math.floor(h / 24);
  return `${dias} dia${dias > 1 ? "s" : ""}`;
}
