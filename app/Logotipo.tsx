import { LOGO_AMERICASIM } from "../lib/logo-americasim";

// Logotipo por marca: AmericaSim tem o logo oficial (globo + wordmark);
// as demais caem no wordmark de texto ate terem logo proprio.
// Componente compartilhado: loja, login do cliente e telas futuras usam o
// MESMO logo — duas versoes do topo foi exatamente o que deixou o login feio.
export default function Logotipo({ codigo, nome }: { codigo: string; nome: string }) {
  if (codigo === "americasim") {
    return <img className="logotipo" src={LOGO_AMERICASIM} alt="AmericaSim" />;
  }
  return (
    <span className="marca" aria-label={nome}>
      <span className="ponto" aria-hidden="true" />
      <span className="wm">
        {nome.endsWith("Sim") ? (
          <>
            <b>{nome.slice(0, -3)}</b>
            <i>Sim</i>
          </>
        ) : (
          nome
        )}
      </span>
    </span>
  );
}
