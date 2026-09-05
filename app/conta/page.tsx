import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiPost } from "../../lib/vitrine";
import { COOKIE_SESSAO } from "../../lib/conta";
import { marcaAtual } from "../../lib/marcas";
import Logotipo from "../Logotipo";
import { IcoCelular, IcoChat, IcoFerramenta, IcoIlimitado, IcoQr } from "../Icones";
import FiltroEsims, { type PedidoLista } from "./FiltroEsims";
import { sair } from "./acoes";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const m = await marcaAtual();
  return { title: `Meus eSIMs — ${m.nome}`, robots: { index: false, follow: false } };
}

// AREA DO CLIENTE no padrao de painel (referencia estrutural: painel do
// QueroConsertar): sidebar fixa com menu, topo com a acao principal, saudacao,
// e os pedidos numa GRADE de cartoes com botoes — nada de lista solta com
// link sublinhado. O site inteiro fica amarrado: daqui se vai para a loja,
// para as duvidas e (admin) para o backend.

function Shell({
  codigo,
  nome,
  temBackend,
  children,
}: {
  codigo: string;
  nome: string;
  temBackend: boolean;
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
          <Link className="ct-item ativo" href="/conta"><IcoQr /> <span>Meus eSIMs</span></Link>
          <Link className="ct-item" href="/#planos"><IcoIlimitado /> <span>Comprar eSIM</span></Link>
          <Link className="ct-item" href="/duvidas"><IcoChat /> <span>Central de dúvidas</span></Link>
          <Link className="ct-item" href="/duvidas#instalar"><IcoCelular /> <span>Como instalar</span></Link>
          {temBackend ? (
            <a className="ct-item" href="/painel"><IcoFerramenta /> <span>Backend</span></a>
          ) : null}
        </nav>
        <form action={sair} className="ct-sair">
          <button type="submit">⏻ <span>Sair</span></button>
        </form>
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
            <form action={sair} className="ct-so-celular" style={{ display: "inline-flex" }}>
              <button type="submit" className="botao secundario" style={{ border: "1px solid var(--borda)" }}>Sair</button>
            </form>
          </div>
        </header>
        <div className="ct-main">{children}</div>
      </div>
    </main>
  );
}

export default async function MeusPedidos() {
  const marca = await marcaAtual();
  const c = await cookies();
  const sessao = c.get(COOKIE_SESSAO)?.value ?? "";
  if (!sessao) redirect("/conta/entrar");

  const r = await apiPost("/v1/conta/pedidos", { sessao });
  if (!r.ok && r.erro_codigo === "sessao_invalida") redirect("/conta/entrar");

  // Admin (e-mail que tambem e usuario ativo do painel) ganha o item "Backend"
  // no menu. So o MENU depende disto — a porta do painel confere a propria
  // sessao (cookie painel_sessao, criado no login com Google).
  const perfil = await apiPost("/v1/conta/perfil", { sessao });
  const temBackend = perfil.ok && perfil.dados?.backend === true;
  const email = String(perfil.dados?.email ?? r.dados?.email ?? "");
  const nomeCliente = String(perfil.dados?.nome ?? "").trim();
  const ola = nomeCliente ? nomeCliente.split(" ")[0] : "";

  if (!r.ok && r.erro_codigo === "conta_nao_verificada") {
    return (
      <Shell codigo={marca.codigo} nome={marca.nome} temBackend={temBackend}>
        <h1 className="ct-ola">Falta confirmar seu e-mail</h1>
        <p className="nota" style={{ maxWidth: "52ch" }}>
          Por segurança, os pedidos só aparecem depois que você confirmar que este e-mail é seu.
          O e-mail de confirmação chega em breve — ou entre com o Google, que confirma na hora.
        </p>
        <p style={{ marginTop: 16 }}>
          <a className="botao secundario" href="/conta/entrar">Entrar com o Google →</a>
        </p>
      </Shell>
    );
  }

  if (!r.ok) {
    return (
      <Shell codigo={marca.codigo} nome={marca.nome} temBackend={temBackend}>
        <h1 className="ct-ola">Não deu para carregar seus pedidos</h1>
        <p className="nota">{r.erro_mensagem}</p>
        <p style={{ marginTop: 16 }}>
          <a className="botao secundario" href="/conta">Tentar de novo</a>
        </p>
      </Shell>
    );
  }

  const pedidos: PedidoLista[] = r.dados?.pedidos ?? [];

  return (
    <Shell codigo={marca.codigo} nome={marca.nome} temBackend={temBackend}>
      <h1 className="ct-ola">Olá{ola ? `, ${ola}` : ""}! 👋</h1>
      {email ? <p className="ct-quem">{email}</p> : null}

      <h2 className="ct-rotulo">Meus eSIMs</h2>

      {pedidos.length === 0 ? (
        <div className="ct-vazio">
          <span className="ct-vazio-ico" aria-hidden="true"><IcoQr /></span>
          <b>Nenhum eSIM ainda</b>
          <p>Escolha um plano e receba o QR no seu e-mail na hora.</p>
          <Link className="botao" href="/#planos">Ver planos →</Link>
        </div>
      ) : (
        <FiltroEsims pedidos={pedidos} />
      )}
    </Shell>
  );
}
