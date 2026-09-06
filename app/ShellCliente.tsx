import Link from "next/link";
import Logotipo from "./Logotipo";
import { IcoCelular, IcoChat, IcoFerramenta, IcoIlimitado, IcoPessoa, IcoQr } from "./Icones";
import { sair } from "./conta/acoes";

// O SHELL da area do cliente (padrao: painel do QueroConsertar) — sidebar com
// menu, topo sticky com a acao principal. COMPARTILHADO entre /conta e
// /pedido: e ele que faz o site parecer UM app, e nao paginas soltas.
//
// `logado`: quem chega em /pedido pelo link do e-mail pode nao ter sessao —
// nesse caso o rodape da sidebar oferece "Entrar" em vez de "Sair".
// `ativo`: qual item do menu acende.
export default function ShellCliente({
  codigo,
  nome,
  temBackend,
  logado,
  ativo,
  children,
}: {
  codigo: string;
  nome: string;
  temBackend: boolean;
  logado: boolean;
  ativo: "esims" | "perfil" | "nenhum";
  children: React.ReactNode;
}) {
  return (
    <main className="wrap ct-shell">
      {/* SIDEBAR (some no celular; la o menu vive no topo) */}
      <aside className="ct-lado" aria-label="menu da conta">
        <Link href="/" aria-label="Voltar para a loja" className="ct-logo">
          <Logotipo codigo={codigo} nome={nome} />
        </Link>
        <nav className="ct-nav">
          <Link className={ativo === "esims" ? "ct-item ativo" : "ct-item"} href="/conta">
            <IcoQr /> <span>Meus eSIMs</span>
          </Link>
          <Link className={ativo === "perfil" ? "ct-item ativo" : "ct-item"} href="/conta/perfil">
            <IcoPessoa /> <span>Meu perfil</span>
          </Link>
          <Link className="ct-item" href="/#planos"><IcoIlimitado /> <span>Comprar eSIM</span></Link>
          <Link className="ct-item" href="/duvidas"><IcoChat /> <span>Central de dúvidas</span></Link>
          <Link className="ct-item" href="/duvidas#instalar"><IcoCelular /> <span>Como instalar</span></Link>
          {temBackend ? (
            <a className="ct-item" href="/painel"><IcoFerramenta /> <span>Backend</span></a>
          ) : null}
        </nav>
        {logado ? (
          <form action={sair} className="ct-sair">
            <button type="submit">⏻ <span>Sair</span></button>
          </form>
        ) : (
          <div className="ct-sair">
            <Link className="ct-item" href="/conta/entrar">→ <span>Entrar na conta</span></Link>
          </div>
        )}
      </aside>

      {/* COLUNA PRINCIPAL */}
      <div className="ct-corpo">
        <header className="ct-topo">
          <Link href="/" aria-label="Voltar para a loja" className="ct-topo-logo">
            <Logotipo codigo={codigo} nome={nome} />
          </Link>
          <div className="ct-topo-acoes">
            {temBackend ? <a className="botao secundario ct-so-celular" href="/painel">Backend</a> : null}
            <Link className="botao" href="/#planos">+ Novo eSIM</Link>
            {logado ? (
              <form action={sair} className="ct-so-celular" style={{ display: "inline-flex" }}>
                <button type="submit" className="botao secundario" style={{ border: "1px solid var(--borda)" }}>Sair</button>
              </form>
            ) : (
              <Link className="botao secundario ct-so-celular" href="/conta/entrar">Entrar</Link>
            )}
          </div>
        </header>
        <div className="ct-main">{children}</div>
      </div>
    </main>
  );
}
