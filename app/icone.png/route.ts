import { deflateSync } from "node:zlib";

// GET /icone.png — o icone do "app" (PWA e apple-touch-icon), DESENHADO por
// codigo e codificado em PNG aqui mesmo (zlib do Node + CRC32). A primeira
// versao embutia o PNG em base64 e o arquivo subiu truncado no push — imagem
// corrompida silenciosa. Codigo que desenha nao trunca: ou compila e desenha
// certo, ou nem builda. Gera uma vez e guarda em memoria.

const L = 512;
const NAVY = [15, 42, 74, 255];
const BRANCO = [255, 255, 255, 255];
const AZUL = [30, 90, 171, 255];
const NADA = [0, 0, 0, 0];

function dentroRetArredondado(x: number, y: number, x0: number, y0: number, x1: number, y1: number, r: number): boolean {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  if ((x >= x0 + r && x <= x1 - r) || (y >= y0 + r && y <= y1 - r)) return true;
  const cx = Math.max(x0 + r, Math.min(x, x1 - r));
  const cy = Math.max(y0 + r, Math.min(y, y1 - r));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function corDoPixel(x: number, y: number): number[] {
  if (!dentroRetArredondado(x, y, 0, 0, L - 1, L - 1, 96)) return NADA;
  let cor = NAVY;
  if (dentroRetArredondado(x, y, 136, 116, 376, 396, 36)) {
    cor = BRANCO;
    // entalhe de canto do SIM: triangulo superior direito do cartao branco
    if (x >= 296 && y <= 196 && y - 116 <= x - 296) cor = NAVY;
    // grade de contatos 3x3
    for (const gx of [176, 232, 288]) {
      for (const gy of [196, 256, 316]) {
        if (dentroRetArredondado(x, y, gx, gy, gx + 40, gy + 44, 10)) cor = NAVY;
      }
    }
  }
  // sinal (canto inferior direito): ponto + dois quartos de anel
  const dx = x - 356, dy = y - 380;
  const d2 = dx * dx + dy * dy;
  if (d2 <= 14 * 14) cor = AZUL;
  if (dx >= 0 && dy <= 0) {
    const d = Math.sqrt(d2);
    if ((d >= 30 && d <= 42) || (d >= 54 && d <= 66)) cor = AZUL;
  }
  return cor;
}

function crc32(buf: Buffer): number {
  let c: number, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pedaco(tipo: string, dados: Buffer): Buffer {
  const t = Buffer.from(tipo, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, dados])));
  return Buffer.concat([len, t, dados, crc]);
}

function gerarPng(): Buffer {
  const linhas = Buffer.alloc(L * (1 + L * 4));
  for (let y = 0; y < L; y++) {
    const base = y * (1 + L * 4);
    linhas[base] = 0; // filtro none
    for (let x = 0; x < L; x++) {
      const [r, g, b, a] = corDoPixel(x, y);
      const o = base + 1 + x * 4;
      linhas[o] = r; linhas[o + 1] = g; linhas[o + 2] = b; linhas[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(L, 0); ihdr.writeUInt32BE(L, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bits, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pedaco("IHDR", ihdr),
    pedaco("IDAT", deflateSync(linhas, { level: 9 })),
    pedaco("IEND", Buffer.alloc(0)),
  ]);
}

let cache: Buffer | null = null;

export async function GET() {
  if (!cache) cache = gerarPng();
  return new Response(new Uint8Array(cache), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
