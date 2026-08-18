/** @type {import('next').NextConfig} */

// O Next recusa Server Action cuja Origin nao bate com o Host visto atras do proxy.
// Sem isto, o botao "Comprar" falha em producao e funciona no loopback — o pior
// tipo de bug: so aparece depois de publicado.
const origens = (process.env.ORIGENS_PERMITIDAS || "americasim.duckdns.org")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  distDir: process.env.BUILD_DIST || ".next",
  experimental: {
    serverActions: { allowedOrigins: origens },
  },
};

export default nextConfig;
