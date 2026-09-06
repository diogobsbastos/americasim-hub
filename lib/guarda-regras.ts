// As REGRAS do guarda da chave do master, sem nenhuma dependencia de banco ou
// rede — de proposito: e a parte que decide QUEM pode passar, e ela precisa ser
// testavel sozinha, sem subir infraestrutura. O guarda que consulta o estoque
// vive em lib/guarda-cmlink.ts e importa daqui.

// Operacoes que so LEEM. Conferidas uma a uma contra lib/cmlink.ts em 06/09.
const SO_LEITURA = new Set([
  "getAccessToken",
  "getDataBundle",
  "getSubedUserDataBundle",
  "getSubscriberAllQuota",
  "himsiTermState",
  "queryEsimCardInfo",
  "querySIMInfo",
]);

// Operacoes que MEXEM (gastam deposito, ativam, cancelam).
const ESCRITA = new Set(["createOrder", "activeDataBundle", "channelUnsubscribe"]);

export type Classe = "leitura" | "escrita" | "desconhecida";

// LISTA BRANCA, e nao lista negra: o que nao esta classificado e "desconhecida"
// — e desconhecida NAO passa. Se alguem adicionar uma chamada nova e esquecer
// deste arquivo, ela e bloqueada com um erro que diz o que fazer, em vez de
// sair sem trava com a chave do master.
export function classificarOperacao(operacao: string): Classe {
  if (SO_LEITURA.has(operacao)) return "leitura";
  if (ESCRITA.has(operacao)) return "escrita";
  return "desconhecida";
}

// O ICCID pode chegar como `ICCID` (createOrder) ou `iccid` (activeDataBundle).
export function iccidDoCorpo(corpo: unknown): string {
  if (!corpo || typeof corpo !== "object") return "";
  const c = corpo as Record<string, unknown>;
  const bruto = c.ICCID ?? c.iccid ?? "";
  return String(bruto ?? "").trim();
}

// Identificadores de pedido, para o cancelamento (que nao carrega ICCID).
export function pedidoDoCorpo(corpo: unknown): { orderId: string; thirdOrderId: string } {
  if (!corpo || typeof corpo !== "object") return { orderId: "", thirdOrderId: "" };
  const c = corpo as Record<string, unknown>;
  return {
    orderId: String(c.orderId ?? c.orderID ?? "").trim(),
    thirdOrderId: String(c.thirdOrderId ?? "").trim(),
  };
}
