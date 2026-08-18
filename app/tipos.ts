// Tipos compartilhados entre as acoes de servidor e os componentes de cliente.
// Ficam FORA do arquivo "use server" de proposito: um modulo "use server" so pode
// exportar funcoes assincronas.

export interface EstadoCompra {
  erro: string;
}

export interface EstadoEsim {
  erro: string;
  status: string;
  smdp: string;
  ativacao: string;
  link_apple: string;
  link_android: string;
  qr: string;
}

export const ESTADO_COMPRA_INICIAL: EstadoCompra = { erro: "" };

export const ESTADO_ESIM_INICIAL: EstadoEsim = {
  erro: "",
  status: "",
  smdp: "",
  ativacao: "",
  link_apple: "",
  link_android: "",
  qr: "",
};
