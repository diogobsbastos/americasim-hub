import { marcaAtual } from "../../lib/marcas";

export const dynamic = "force-dynamic";

// GET /manifest.webmanifest — o manifesto do "app" (PWA), montado pela MARCA do
// dominio (SPEC/07: uma base, N vitrines). Quem compra na ViagemSim adiciona um
// app chamado ViagemSim na tela inicial; na AmericaSim, AmericaSim. E o mesmo
// codigo — como todo o resto da vitrine.
const CORES: Record<string, { tema: string; fundo: string }> = {
  americasim: { tema: "#12141a", fundo: "#12141a" },
  viagemsim: { tema: "#f5f2ec", fundo: "#f5f2ec" },
};

export async function GET() {
  const m = await marcaAtual();
  const cor = CORES[m.codigo] ?? CORES.americasim;

  return Response.json(
    {
      name: m.nome,
      short_name: m.nome,
      description: `Seus eSIMs ${m.nome}: instalacao, status e validade.`,
      start_url: "/",
      scope: "/",
      display: "standalone",
      theme_color: cor.tema,
      background_color: cor.fundo,
      icons: [
        { src: "/icone.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icone.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
