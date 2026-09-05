import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiPost } from "../../lib/vitrine";
import { COOKIE_SESSAO } from "../../lib/conta";
import { marcaAtual } from "../../lib/marcas";
import Logotipo from "../Logotipo";
import Rodape from "../Rodape";
import { sair } from "./acoes";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const m = await marcaAtual();
  return { title: `Meus pedidos — ${m.nome}`, robots: { index: false, follow: false } };
}

interface PedidoLista {
  numero: string;
  status: string;
  entregue: boolean;
  criado_em: string;
  esims: number;
  t: string;
}

// Cabecalho da area logada: logo real + acoes da conta. O botao "Abrir o
// backend" fica AQUI, no topo — e o atalho do admin, nao um rodape de lista.
function Cabecalho({
  codigo,
  nome,
  temBackend,
}: {
  codigo: string;
  nome: string;
  temBackend: boolean;
}) {
  return (
    <header className="cab">
      <Link href="/" aria-label="Voltar para a loja" style={{ display: "inline-flex" }}>
        <Logotipo codigo={codigo} nome={nome} />
      </Link>
      <nav className="cab-links" aria-label="menu principal">
        <Link href="/#planos">Planos</Link>
        <Link href="/duvidas">Dúvidas</Link>
      </nav>
      <div className="cab-conta">
        {temBackend ? (
          /* <a>, nao <Link>: /painel confere a sessao no servidor e a navegacao
             de app do Next atrapalharia o redirect para /entrar quando ela
             tiver expirado. */
          <a className="botao" href="/painel">Abrir o backend →</a>
        ) : null}
        <form action={sair} style={{ display: "inline-flex" }}>
          <button type="submit" className="botao secundario" style={{ border: "1px solid var(--borda)" }}>
            Sair
          </button>
        </form>
      </div>
    </header>
  );
}

export default async function MeusPedidos() {
  const marca = await marcaAtual();
  const c = await cookies();
  const sessao = c.get(COOKIE_SESSAO)?.value ?? "";
  if (!sessao) redirect("/conta/entrar");

  const r = await apiPost("/v1/conta/pedidos", { sessao });

  if (!r.ok && r.erro_codigo === "sessao_invalida") redirect("/conta/entrar");

  // Admin logado (e-mail que tambem e usuario ativo do painel) ganha o atalho
  // "Abrir o backend" no cabecalho. So o BOTAO depende disto — a porta do
  // painel confere a propria sessao (cookie painel_sessao, do login Google).
  const perfil = await apiPost("/v1/conta/perfil", { sessao });
  const temBackend = perfil.ok && perfil.dados?.backend === true;
  const email = String(perfil.dados?.email ?? r.dados?.email ?? "");

  // Conta criada com senha e ainda sem e-mail confirmado: nada de pedidos.
  // E a trava anti-espiao (alguem criando conta com e-mail alheio) — a tela
  // diz isso com todas as letras em vez de fingir que nao ha pedidos.
  if (!r.ok && r.erro_codigo === "conta_nao_verificada") {
    return (
      <main className="wrap">
        <Cabecalho codigo={marca.codigo} nome={marca.nome} temBackend={temBackend} />
        <section className="produto">
          <h1>Falta confirmar seu e-mail</h1>
          <p className="nota">
            Por seguranca, os pedidos so aparecem depois que voce confirmar que este e-mail e seu.
            O e-mail de confirmacao chega em breve — ou entre com o Google, que confirma na hora.
          </p>
        </section>
        <Rodape />
      </main>
    );
  }

  if (!r.ok) {
    return (
      <main className="wrap">
        <Cabecalho codigo={marca.codigo} nome={marca.nome} temBackend={temBackend} />
        <div className="aviso">
          <h1>Nao deu para carregar seus pedidos</h1>
          <p>{r.erro_mensagem}</p>
          <p><Link href="/conta/entrar">Tentar entrar de novo</Link></p>
        </div>
        <Rodape />
      </main>
    );
  }

  const pedidos: PedidoLista[] = r.dados?.pedidos ?? [];

  return (
    <main className="wrap">
      <Cabecalho codigo={marca.codigo} nome={marca.nome} temBackend={temBackend} />

      <section className="produto">
        <h1>Meus pedidos</h1>
        {email ? <p className="nota" style={{ marginTop: 4 }}>{email}</p> : null}

        {pedidos.length === 0 ? (
          <p className="nota">
            Nenhum pedido neste e-mail ainda. <Link href="/#planos">Escolher um plano →</Link>
          </p>
        ) : (
          pedidos.map((p) => (
            <div key={p.numero} className="pedido-cartao">
              <div className="linha">
                <span>Pedido <code>{p.numero}</code></span>
                <span className={`pedido-status ${p.entregue ? "ok" : p.status === "cancelado" ? "off" : ""}`}>
                  {p.entregue ? "entregue" : p.status}
                </span>
              </div>
              <div className="linha">
                <span>{new Date(p.criado_em).toLocaleString("pt-BR")}</span>
                <span>{p.esims} eSIM{p.esims === 1 ? "" : "s"}</span>
              </div>
              <p className="nota" style={{ margin: "8px 0 0" }}>
                <Link href={`/pedido?pedido=${encodeURIComponent(p.numero)}&t=${encodeURIComponent(p.t)}`}>
                  Abrir pedido, status e QR →
                </Link>
              </p>
            </div>
          ))
        )}

        <p className="nota" style={{ marginTop: 20 }}>
          <Link className="botao secundario" href="/#planos">Comprar outro eSIM</Link>
        </p>
      </section>

      <Rodape />
    </main>
  );
}
