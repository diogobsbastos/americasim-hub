import "./globals.css";
import { marcaAtual, cssDaMarca } from "../lib/marcas";

// O titulo e as marcas de PWA saem da marca do dominio — por isso metadata
// virou funcao. O manifesto (/manifest.webmanifest) e o icone (/icone.png)
// tambem sao servidos por marca; e o que faz a pagina do pedido virar "app"
// na tela inicial do cliente com o nome certo de cada vitrine.
export async function generateMetadata() {
  const m = await marcaAtual();
  return {
    title: m.nome,
    manifest: "/manifest.webmanifest",
    icons: { icon: "/icone.png", apple: "/icone.png" },
    appleWebApp: { capable: true, statusBarStyle: "default", title: m.nome },
  };
}

// A marca sai do dominio (SPEC/07: uma base, N vitrines). O atributo no <html>
// e o que permite a sobrescrita de tokens ganhar do :root do globals.css —
// inclusive do :root dentro do @media de modo claro.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const m = await marcaAtual();
  const css = cssDaMarca(m);

  return (
    <html lang="pt-BR" data-marca={m.codigo}>
      <head>
        {/* Fontes da identidade oficial (05/09): Poppins (titulos) + Public
            Sans (texto). Por <link>, e nao next/font: o build no VPS nao passa
            a depender de rede, e o fallback do sistema segura a pagina se o
            CDN falhar no cliente. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Public+Sans:wght@400;500;600;700&display=swap"
        />
        {/* O conteudo vem de lib/marcas.ts, que e uma constante do proprio
            codigo — nada aqui vem de requisicao, cabecalho ou banco. */}
        {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      </head>
      <body>{children}</body>
    </html>
  );
}
