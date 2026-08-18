import type { MetadataRoute } from "next";

// Loja de teste nao entra em buscador. Isto e um PEDIDO, nao uma tranca:
// buscador serio obedece, robo malicioso ignora. A tranca e o Nginx.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
