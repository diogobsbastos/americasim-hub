// Testes dos helpers PUROS — os que nao tocam banco nem rede e que, se
// quebrarem, quebram silenciosamente em producao (um WhatsApp salvo errado, um
// botao de instalacao morto, um open-redirect no login).
// Rodar: npm test  (node --experimental-strip-types --test)
import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizarZap } from "../lib/telefone.ts";
import { linkInstalacaoApple, linkInstalacaoAndroid } from "../lib/instalacao.ts";
import { voltarValido } from "../lib/conta.ts";
import { bater, perdoar } from "../lib/limite.ts";

test("normalizarZap aceita as formas que o cliente digita", () => {
  assert.equal(normalizarZap("(61) 99876-5432"), "+5561998765432");
  assert.equal(normalizarZap("61998765432"), "+5561998765432");
  assert.equal(normalizarZap("+55 61 99876-5432"), "+5561998765432");
  assert.equal(normalizarZap("5561998765432"), "+5561998765432");
  // fixo com 10 digitos continua valido
  assert.equal(normalizarZap("6133334444"), "+556133334444");
});

test("normalizarZap recusa o que nao e telefone brasileiro", () => {
  assert.equal(normalizarZap(""), null);
  assert.equal(normalizarZap("123"), null);
  assert.equal(normalizarZap("619987654321234"), null);
  assert.equal(normalizarZap("abc"), null);
});

test("links de instalacao seguem o formato oficial e somem sem codigo", () => {
  const lpa = "LPA:1$rsp.exemplo.com$AB-123";
  assert.equal(
    linkInstalacaoApple(lpa),
    "https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=LPA%3A1%24rsp.exemplo.com%24AB-123",
  );
  assert.ok(linkInstalacaoAndroid(lpa).startsWith("https://esimsetup.android.com/esim_qrcode_provisioning?carddata="));
  // O FIX de 06/09: sem codigo, sem botao (antes saia link quebrado).
  assert.equal(linkInstalacaoApple(""), "");
  assert.equal(linkInstalacaoAndroid(""), "");
});

test("voltarValido barra open-redirect", () => {
  assert.equal(voltarValido("/conta"), true);
  assert.equal(voltarValido("/finalizar?sku=X"), true);
  assert.equal(voltarValido("//evil.com"), false);
  assert.equal(voltarValido("https://evil.com"), false);
  assert.equal(voltarValido("/\\evil.com"), false);
  assert.equal(voltarValido("/" + "a".repeat(300)), false);
});

test("freio: deixa passar ate o limite e barra depois", () => {
  const chave = "teste:" + Math.random();
  for (let i = 0; i < 3; i++) {
    assert.equal(bater(chave, 3, 60_000).ok, true, `batida ${i + 1} deveria passar`);
  }
  const barrado = bater(chave, 3, 60_000);
  assert.equal(barrado.ok, false);
  assert.ok(barrado.esperaSegundos > 0, "deve dizer quanto esperar");
});

test("freio: perdoar zera o contador (login certo depois de erros)", () => {
  const chave = "teste:" + Math.random();
  bater(chave, 1, 60_000);
  assert.equal(bater(chave, 1, 60_000).ok, false);
  perdoar(chave);
  assert.equal(bater(chave, 1, 60_000).ok, true);
});

test("freio: janela deslizante libera quando o tempo passa", () => {
  const chave = "teste:" + Math.random();
  assert.equal(bater(chave, 1, 1).ok, true);
  const depois = Date.now() + 5;
  while (Date.now() < depois) { /* espera 5ms */ }
  assert.equal(bater(chave, 1, 1).ok, true, "batida antiga saiu da janela");
});

// --- verificacao de e-mail (06/09) ---
import { assinarVerificacaoEmail, contaDoTokenVerificacao } from "../lib/token.ts";

test("token de verificacao: ida e volta devolve a conta", () => {
  const conta = "11111111-2222-3333-4444-555555555555";
  const t = assinarVerificacaoEmail(conta);
  assert.equal(contaDoTokenVerificacao(t), conta);
});

test("token de verificacao: recusa adulteracao e lixo", () => {
  const conta = "11111111-2222-3333-4444-555555555555";
  const t = assinarVerificacaoEmail(conta);
  const [id, exp, mac] = t.split(".");
  // trocar a conta mantendo a assinatura NAO pode funcionar
  assert.equal(contaDoTokenVerificacao(`99999999-2222-3333-4444-555555555555.${exp}.${mac}`), null);
  // esticar a validade mantendo a assinatura tambem nao
  assert.equal(contaDoTokenVerificacao(`${id}.${Number(exp) + 999999}.${mac}`), null);
  assert.equal(contaDoTokenVerificacao(""), null);
  assert.equal(contaDoTokenVerificacao("nao-e-token"), null);
  assert.equal(contaDoTokenVerificacao(null), null);
});
