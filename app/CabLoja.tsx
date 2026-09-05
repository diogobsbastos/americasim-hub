import Link from "next/link";
import { cookies } from "next/headers";
import { COOKIE_SESSAO } from "../lib/conta";
import Logotipo from "./Logotipo";

// Cabecalho das paginas ABERTAS da loja (home, duvidas, legais) — e ele que
// sabe se ha sessao. Logado, o canto direito vira "Meus eSIMs"; deslogado,
// Entrar/Criar conta. Sem isto, um cliente logado abria /duvidas e via
// "Entrar" como se o site o tivesse expulsado (bug reportado pelo Diogo
// em 05/09 — o cookie estava la, a tela e que nao olhava).
//
// So a PRESENCA do cookie decide o rotulo: validar de verdade e papel do
// /conta (que redireciona ao login se a sessao venceu). Checar aqui via API
// custaria uma chamada por pageview da home para trocar um botao.
export default async function CabLoja({
  codigo,
  nome,
  atual,
}: {
  codigo: string;
  nome: string;
  atual?: "duvidas";
}) {
  const logado = Boolean((await cookies()).get(COOKIE_SESSAO)?.value);

  return (
    <header className="cab">
      <Link href="/" aria-label="Voltar para a loja" style={{ display: "inline-flex" }}>
        <Logotipo codigo={codigo} nome={nome} />
      </Link>
      <nav className="cab-links" aria-label="menu principal">
        <Link href="/#planos">Planos</Link>
        <Link href="/#como">Como funciona</Link>
        {atual === "duvidas" ? null : <Link href="/duvidas">Dúvidas</Link>}
      </nav>
      <div className="cab-conta">
        {logado ? (
          <Link className="botao" href="/conta">Meus eSIMs</Link>
        ) : (
          <>
            <Link className="botao secundario" href="/conta/entrar">Entrar</Link>
            <Link className="botao" href="/conta/criar">Criar conta</Link>
          </>
        )}
      </div>
    </header>
  );
}
