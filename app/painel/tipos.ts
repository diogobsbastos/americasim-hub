// Tipos compartilhados entre as acoes de servidor do painel e os componentes de
// cliente. Ficam fora do arquivo "use server": aquele modulo so pode exportar
// funcoes assincronas.

export interface EstadoEntrar {
  erro: string;
}

export const ESTADO_ENTRAR_INICIAL: EstadoEntrar = { erro: "" };
