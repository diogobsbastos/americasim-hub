import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiPost } from "../../lib/vitrine";
import { COOKIE_SESSAO } from "../../lib/conta";
import { marcaAtual } from "../../lib/marcas";
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

export default async function MeusPedidos() {
  const marca = await marcaAtual();
  const c = await cookies();
  const sessao = c.get(COOKIE_SESSAO)?.value ?? "";
  if (!sessao) redirect("/conta/entrar");

  const r = await apiPost("/v1/conta/pedidos", { sessao });

  if (!r.ok && r.erro_codigo === "sessao_invalida") redirect("/conta/entrar");

  // Conta criada com senha e ainda sem e-mail confirmado: nada de pedidos.
  // E a trava anti-espiao (alguem criando conta com e-mail alheio) — a tela
  // diz isso com todas as letras em vez de fingir que nao ha pedidos.
  if (!r.ok && r.erro_codigo === "conta_nao_verificada") {
    return (
      <main className="wrap">
        <header className="topo">
          <div className="marca"><span className="ponto" aria-hidden="true" />{marca.nome}</div>
        </header>
        <section className="produto">
          <h1>Falta confirmar seu e-mail</h1>
          <p className="nota">
            Por seguranca, os pedidos so aparecem depois que voce confirmar que este e-mail e seu.
            O e-mail de confirmacao chega em breve — ou entre com o Google, que confirma na hora.
          </p>
          <form action={sair}>
            <button type="submit" className="secundario">Sair</button>
          </form>
        </section>
      </main>
    );
  }

  if (!r.ok) {
    return (
      <main className="wrap">
        <div className="aviso">
          <h1>Nao deu para carregar seus pedidos</h1>
          <p>{r.erro_mensagem}</p>
          <p><Link href="/conta/entrar">Tentar entrar de novo</Link></p>
        </div>
      </main>
    );
  }

  const pedidos: PedidoLista[] = r.dados?.pedidos ?? [];

  return (
    <main className="wrap">
      <header className="topo">
        <div className="marca"><span className="ponto" aria-hidden="true" />{marca.nome}</div>
      </header>

      <section className="produto">
        <h1>Meus pedidos</h1>
        <p className="nota">{String(r.dados?.email ?? "")}</p>

        {pedidos.length === 0 ? (
          <p className="nota">
            Nenhum pedido neste e-mail ainda. <Link href="/">Ir para a loja</Link>
          </p>
        ) : (
          pedidos.map((p) => (
            <div key={p.numero} style={{ border: "1px solid var(--borda)", borderRadius: 12, padding: "14px 16px", marginTop: 12 }}>
              <div className="linha">
                <span>Pedido <code>{p.numero}</code></span>
                <span style={{ color: p.entregue ? "var(--ok)" : "var(--texto-fraco)", fontWeight: 700 }}>
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

        <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 16 }}>
          <form action={sair}>
            <button type="submit" className="secundario">Sair</button>
          </form>
          <p className="nota" style={{ margin: 0 }}><Link href="/">Voltar para a loja</Link></p>
        </div>
      </section>
    </main>
  );
}
