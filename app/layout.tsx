import "./globals.css";
import { marcaAtual, cssDaMarca } from "../lib/marcas";

export const metadata = { title: "AmericaSim Hub" };

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
