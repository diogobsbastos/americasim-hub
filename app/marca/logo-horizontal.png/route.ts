import { LOGO_AMERICASIM } from "../../../lib/logo-americasim";

export const dynamic = "force-dynamic";

// GET /marca/logo-horizontal.png — o logo oficial servido por URL.
//
// Existe porque E-MAIL nao aceita logo embutido: o Gmail bloqueia data: URI em
// <img>, entao o padrao de e-mail (05/09) referencia esta URL hospedada no
// dominio principal. A imagem e a MESMA do site (lib/logo-americasim.ts,
// PNG 360x42, ~4KB) — um logo, uma fonte, zero arquivo solto no servidor.
export async function GET() {
  const b64 = LOGO_AMERICASIM.split(",")[1] ?? "";
  const corpo = Buffer.from(b64, "base64");
  return new Response(new Uint8Array(corpo), {
    headers: {
      "content-type": "image/png",
      // Um dia de cache + uma semana de tolerancia: cliente de e-mail e proxy
      // do Gmail nao ficam batendo aqui, e trocar o logo ainda propaga em 24h.
      "cache-control": "public, max-age=86400, stale-while-revalidate=604800",
      "content-length": String(corpo.length),
    },
  });
}
