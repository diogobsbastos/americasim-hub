// O guarda da chave do master (lib/guarda-cmlink.ts). Testes das partes PURAS —
// as que decidem se a chamada pode sair antes de qualquer consulta ao banco.
// A regra que mais importa: o que nao foi classificado NAO passa.
import { test } from "node:test";
import assert from "node:assert/strict";

import { classificarOperacao, iccidDoCorpo, pedidoDoCorpo } from "../lib/guarda-regras.ts";

test("leituras conhecidas sao leitura", () => {
  for (const op of [
    "getAccessToken", "getDataBundle", "getSubedUserDataBundle",
    "getSubscriberAllQuota", "himsiTermState", "queryEsimCardInfo", "querySIMInfo",
  ]) {
    assert.equal(classificarOperacao(op), "leitura", `${op} deveria ser leitura`);
  }
});

test("as tres que mexem sao escrita", () => {
  for (const op of ["createOrder", "activeDataBundle", "channelUnsubscribe"]) {
    assert.equal(classificarOperacao(op), "escrita", `${op} deveria ser escrita`);
  }
});

test("operacao nova cai em 'desconhecida' — e desconhecida NAO passa", () => {
  // Esta e a razao de ser da lista branca: quem esquecer de declarar uma
  // chamada nova descobre com um bloqueio, nao com uma escrita no chip alheio.
  assert.equal(classificarOperacao("APP_algumaCoisaNova"), "desconhecida");
  assert.equal(classificarOperacao(""), "desconhecida");
  assert.equal(classificarOperacao("createorder"), "desconhecida", "sem tolerancia a caixa diferente");
});

test("ICCID e lido nas duas grafias que a API usa", () => {
  assert.equal(iccidDoCorpo({ ICCID: "8955123" }), "8955123");
  assert.equal(iccidDoCorpo({ iccid: "8955999" }), "8955999");
  assert.equal(iccidDoCorpo({ ICCID: "  8955777  " }), "8955777");
  assert.equal(iccidDoCorpo({}), "");
  assert.equal(iccidDoCorpo(null), "");
  assert.equal(iccidDoCorpo("nao e objeto"), "");
});

test("identificadores de pedido do cancelamento", () => {
  assert.deepEqual(pedidoDoCorpo({ orderId: "123" }), { orderId: "123", thirdOrderId: "" });
  assert.deepEqual(pedidoDoCorpo({ orderID: "456" }), { orderId: "456", thirdOrderId: "" });
  assert.deepEqual(pedidoDoCorpo({ thirdOrderId: "nosso-1" }), { orderId: "", thirdOrderId: "nosso-1" });
  assert.deepEqual(pedidoDoCorpo(null), { orderId: "", thirdOrderId: "" });
});
