import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";

// Cifra de segredos da aplicacao — token de marketplace, chave de API de
// terceiro, o que mais aparecer. Mesmo motor do codigo do eSIM
// (lib/cripto-esim.ts), com duas diferencas que importam.
//
// 1. CHAVE DERIVADA POR DOMINIO. Cada uso ganha uma chave propria, derivada da
//    mestra: `sha256(mestra || "segredo:" || dominio)`. Vazar a chave de um
//    dominio nao abre os outros, e um registro cifrado num contexto nao pode ser
//    lido noutro.
//
// 2. AAD (dado autenticado, nao cifrado). Amarra o texto cifrado a QUEM ele
//    pertence. Um `access_token` copiado da linha do canal A para a linha do
//    canal B falha ao decifrar, em vez de funcionar. Sem isso, quem tivesse
//    escrita no banco poderia mover credencial de canal e agir como outra loja.
//
// POR QUE O eSIM NAO USA ISTO: os codigos ja gravados foram cifrados com a
// chave MESTRA direta. Passar a derivar por dominio agora tornaria todo o
// estoque existente ilegivel. lib/cripto-esim.ts fica como esta, de proposito.
//
// A chave-mae continua sendo a `ESIM_CHAVE`. O nome ficou estreito demais para
// o que ela guarda hoje — mas renomear a variavel exigiria decifrar e recifrar
// todo o estoque, e nao vale o risco por causa de um nome.

const VERSAO = 0x01;
const TAM_IV = 12;
const TAM_TAG = 16;
const CABECALHO = 1 + TAM_IV + TAM_TAG;

const cache = new Map<string, Buffer>();

function chaveMestra(): Buffer {
  const bruto = process.env.ESIM_CHAVE;
  if (!bruto) {
    throw new Error(
      "ESIM_CHAVE ausente no ambiente do servico. Sem ela nao da para guardar segredo nenhum.",
    );
  }
  const k = Buffer.from(bruto.trim(), "base64");
  if (k.length !== 32) {
    throw new Error(`ESIM_CHAVE tem ${k.length} byte(s) depois do base64; AES-256 exige 32.`);
  }
  return k;
}

function chaveDo(dominio: string): Buffer {
  const d = String(dominio || "").trim();
  if (!d) throw new Error("dominio da cifra nao pode ser vazio");
  const guardada = cache.get(d);
  if (guardada) return guardada;
  const k = createHash("sha256")
    .update(Buffer.concat([chaveMestra(), Buffer.from(`segredo:${d}`, "utf8")]))
    .digest();
  cache.set(d, k);
  return k;
}

export function problemaComAChave(): string | null {
  try {
    chaveMestra();
    return null;
  } catch (e: any) {
    return String(e?.message ?? e);
  }
}

export function cifrarSegredo(texto: string, dominio: string, amarra = ""): Buffer {
  const iv = randomBytes(TAM_IV);
  const c = createCipheriv("aes-256-gcm", chaveDo(dominio), iv);
  if (amarra) c.setAAD(Buffer.from(amarra, "utf8"));
  const corpo = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return Buffer.concat([Buffer.from([VERSAO]), iv, c.getAuthTag(), corpo]);
}

export function decifrarSegredo(bruto: Buffer | null | undefined, dominio: string, amarra = ""): string {
  if (!bruto || bruto.length === 0) return "";
  const b = Buffer.from(bruto);
  if (b.length < CABECALHO) throw new Error(`segredo curto demais (${b.length} bytes).`);
  if (b[0] !== VERSAO) throw new Error(`versao de cifra desconhecida: 0x${b[0].toString(16)}.`);
  const d = createDecipheriv("aes-256-gcm", chaveDo(dominio), b.subarray(1, 1 + TAM_IV));
  d.setAuthTag(b.subarray(1 + TAM_IV, CABECALHO));
  if (amarra) d.setAAD(Buffer.from(amarra, "utf8"));
  // final() confere a tag E a amarra. Dominio errado, amarra errada ou byte
  // adulterado: lanca, nunca devolve lixo.
  return Buffer.concat([d.update(b.subarray(CABECALHO)), d.final()]).toString("utf8");
}

// Impressao digital de um segredo, para poder dizer "a credencial mudou" ou
// "e a mesma de ontem" sem nunca guardar nem imprimir o valor.
export function impressaoSegredo(texto: string, dominio: string): string {
  return createHmac("sha256", chaveDo(`impressao:${dominio}`)).update(texto, "utf8").digest("hex");
}

// Para log e tela. NUNCA imprimir o token inteiro em lugar nenhum.
export function mascarar(texto: string): string {
  const t = String(texto ?? "");
  if (t.length <= 10) return `…(${t.length} car.)`;
  return `${t.slice(0, 4)}…${t.slice(-4)} (${t.length} car.)`;
}
