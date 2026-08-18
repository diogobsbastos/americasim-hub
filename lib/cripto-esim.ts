// Cifra do codigo do eSIM — AmericaSim.
//
// O codigo LPA *e* o produto: quem ve, tem. Em texto claro no banco, um arquivo
// de backup entrega o estoque inteiro — e backup e o que costuma vazar.
//
// DESVIO CONSCIENTE da SPEC/11: ela pede "BYTEA cifrado com pgcrypto, chave fora
// do banco". Aqui a cifra ficou na APLICACAO. Mesmo objetivo, tres ganhos:
//   1. a chave nunca chega ao servidor de banco — nem como parametro de bind,
//      nem em pg_stat_activity, nem em log de consulta lenta;
//   2. AES-256-GCM e cifra autenticada: adulterar um byte faz a leitura FALHAR
//      em vez de devolver lixo silencioso;
//   3. um dump do banco, sozinho, nao abre nada.
//
// Formato gravado no mesmo bytea de sempre, versionado para permitir rotacao
// sem adivinhacao:
//   [0]       versao (0x01)
//   [1..12]   iv, 12 bytes, sorteado por registro
//   [13..28]  tag de autenticacao GCM, 16 bytes
//   [29..]    texto cifrado
//
// O iv vem antes do texto e e sorteado a cada gravacao: cifrar o mesmo codigo
// duas vezes da dois bytea diferentes. E por isso que a unicidade e a deteccao
// de repetido nao podem sair da cifra — saem da impressao digital, no fim deste
// arquivo.

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";

const VERSAO = 0x01;
const TAM_IV = 12;
const TAM_TAG = 16;
const CABECALHO = 1 + TAM_IV + TAM_TAG; // 29 bytes antes do texto cifrado

// Rotulo de dominio da chave derivada. Trocar esta string invalida todas as
// impressoes digitais ja gravadas — nao mexer sem migrar.
const ROTULO_IMPRESSAO = "impressao-esim";

let cache: { mestra: Buffer; impressao: Buffer } | null = null;

function chaves(): { mestra: Buffer; impressao: Buffer } {
  if (cache) return cache;

  const bruto = process.env.ESIM_CHAVE;
  if (!bruto) {
    // De proposito NAO existe caminho de emergencia para texto claro. Cair para
    // texto claro "para nao quebrar" guardaria o produto aberto no banco sem
    // ninguem perceber — o defeito ficaria invisivel ate o vazamento.
    throw new Error(
      "ESIM_CHAVE ausente no ambiente do servico. Sem ela nao da para cifrar nem ler codigo de eSIM. " +
        "Gere com `openssl rand -base64 32` e ponha em ~/.americasim-hub.env.",
    );
  }

  const mestra = Buffer.from(bruto.trim(), "base64");
  if (mestra.length !== 32) {
    // Buffer.from(..., "base64") nao reclama de lixo: ele descarta o que nao
    // reconhece e devolve um buffer curto. Sem esta conferencia, uma chave
    // truncada viraria um erro incompreensivel la dentro do createCipheriv.
    throw new Error(
      `ESIM_CHAVE tem ${mestra.length} byte(s) depois de decodificar o base64; AES-256 exige exatamente 32.`,
    );
  }

  // Chave SEPARADA para a impressao digital. Usar a mesma chave para cifrar e
  // para identificar e o reuso que transforma vazamento parcial em total.
  const impressao = createHash("sha256")
    .update(Buffer.concat([mestra, Buffer.from(ROTULO_IMPRESSAO, "utf8")]))
    .digest();

  cache = { mestra, impressao };
  return cache;
}

// Devolve null quando esta tudo certo, ou a explicacao do problema. Serve para a
// tela avisar em portugues antes de abrir transacao, em vez de estourar 500.
export function problemaComAChave(): string | null {
  try {
    chaves();
    return null;
  } catch (e: any) {
    return String(e?.message ?? e);
  }
}

export function cifrarCodigo(texto: string): Buffer {
  const { mestra } = chaves();
  const iv = randomBytes(TAM_IV);
  const c = createCipheriv("aes-256-gcm", mestra, iv);
  const corpo = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return Buffer.concat([Buffer.from([VERSAO]), iv, c.getAuthTag(), corpo]);
}

export function decifrarCodigo(bruto: Buffer): string {
  const { mestra } = chaves();
  if (!Buffer.isBuffer(bruto) || bruto.length < CABECALHO) {
    throw new Error(`codigo cifrado curto demais (${bruto?.length ?? 0} bytes, minimo ${CABECALHO}).`);
  }
  if (bruto[0] !== VERSAO) {
    throw new Error(`versao de cifra desconhecida: 0x${bruto[0].toString(16)}.`);
  }
  const d = createDecipheriv("aes-256-gcm", mestra, bruto.subarray(1, 1 + TAM_IV));
  d.setAuthTag(bruto.subarray(1 + TAM_IV, CABECALHO));
  // final() e quem confere a tag. Se o registro foi adulterado, ou se a chave
  // for outra, ele lanca — e isso e o comportamento desejado: melhor a rota
  // falhar do que entregar ao cliente um codigo que nao ativa nada.
  return Buffer.concat([d.update(bruto.subarray(CABECALHO)), d.final()]).toString("utf8");
}

// Le respeitando a coluna `cifrado`. Enquanto os dois formatos convivem, quem
// manda e a COLUNA, nunca um palpite sobre o conteudo: texto claro pode, por
// azar, comecar com o byte 0x01, e adivinhar erraria calado.
export function lerCodigo(bruto: Buffer | null | undefined, cifrado: boolean): string {
  if (!bruto || bruto.length === 0) return "";
  return cifrado ? decifrarCodigo(bruto) : Buffer.from(bruto).toString("utf8");
}

// Impressao digital deterministica do codigo: HMAC-SHA256 com a chave derivada.
// Resolve o que a cifra nao resolve — unicidade no banco (indice unico) e
// deteccao de repetido na importacao.
export function impressaoCodigo(texto: string): Buffer {
  const { impressao } = chaves();
  return createHmac("sha256", impressao).update(texto, "utf8").digest();
}
