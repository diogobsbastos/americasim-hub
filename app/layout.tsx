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
        {/* O conteudo vem de lib/marcas.ts, que e uma constante do proprio
            codigo — nada aqui vem de requisicao, cabecalho ou banco. */}
        {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      </head>
      <body>{children}</body>
    </html>
  );
}
