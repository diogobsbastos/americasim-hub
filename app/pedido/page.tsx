import Link from "next/link";
import { apiGet, chaveConfigurada } from "../../lib/vitrine";
import { marcaAtual } from "../../lib/marcas";
import CartaoEsim, { type AtivacaoTela } from "./CartaoEsim";
import AtualizaSozinho from "./AtualizaSozinho";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const m = await marcaAtual();
  return {
    title: `Seu pedido — ${m.nome}`,
    robots: { index: false, follow: false },
  };
}

export default async function Pedido({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string; t?: string }>;
}) {
  const sp = await searchParams;
  const numero = sp.pedido ?? "";
  const token = sp.t ?? "";
  const marca = await marcaAtual();

  // O `await` aqui NAO e detalhe de estilo. `chaveConfigurada()` virou async
  // quando a chave passou a ser um mapa por dominio; sem o await, o `if` recebe
  // uma Promise, que e SEMPRE truthy, entao `!promise` e sempre falso e o guarda
  // nunca dispara. O tsc nao reclama disso — e o tipo de defeito que so aparece
  // no dia em que o guarda precisava ter funcionado.
  if (!(await chaveConfigurada())) {
    return (
      <main className="wrap">
        <div className="aviso">
          <h1>Vitrine sem chave de canal</h1>
        </div>
      </main>
    );
  }

  if (!numero || !token) {
    return (
      <main className="wrap">
        <div className="aviso">
          <h1>Link incompleto</h1>
          <p>
            Este endereco precisa do numero do pedido e do token de acompanhamento. Use o link
            que voce recebeu apos a compra.
          </p>
          <p>
            <Link href="/">Voltar para a loja</Link>
          </p>
        </div>
      </main>
    );
  }

  const r = await apiGet(
    `/v1/pedidos/${encodeURIComponent(numero)}?t=${encodeURIComponent(token)}`,
  );

  // Sem token valido a API devolve 404 indistinguivel de pedido inexistente — de
  // proposito (SPEC/03). A vitrine repete a mesma mensagem para nao vazar a diferenca.
  if (!r.ok) {
    return (
      <main className="wrap">
        <div className="aviso">
          <h1>Pedido nao encontrado</h1>
          <p>Confira se o link esta completo, incluindo o codigo depois de {"&t="}.</p>
          <p>
            <Link href="/">Voltar para a loja</Link>
          </p>
        </div>
      </main>
    );
  }

  const p = r.dados ?? {};
  const ativacoes: AtivacaoTela[] = p.ativacoes ?? [];

  // A tela se mantem viva sozinha enquanto ha o que esperar: rapido durante a
  // preparacao, devagar esperando a instalacao, desligada quando tudo instalou.
  const esperandoEntrega = !p.entregue;
  const esperandoInstalacao =
    p.entregue && ativacoes.some((a) => a.status !== "instalado" && a.status !== "falhou");

  return (
    <main className="wrap">
      <header className="topo">
        <div className="marca">
          <span className="ponto" aria-hidden="true" />
          {/* Quem comprou na ViagemSim nao pode cair numa tela escrita
              AmericaSim: seria a primeira coisa a fazer o cliente achar que
              caiu num golpe, justamente na pagina onde ele espera o produto. */}
          {marca.nome}
        </div>
      </header>

      <section className="produto">
        <h1>{p.entregue ? "Seu eSIM esta pronto" : "Pedido recebido"}</h1>

        <div className="pedido-meta">
          <div className="linha">
            <span>Numero do pedido</span>
            <code>{p.numero}</code>
          </div>
          <div className="linha">
            <span>Situacao</span>
            <code>{p.status}</code>
          </div>
          {p.entregue_em ? (
            <div className="linha">
              <span>Entregue em</span>
              <code>{new Date(p.entregue_em).toLocaleString("pt-BR")}</code>
            </div>
          ) : null}
        </div>

        {ativacoes.length > 0 ? (
          ativacoes.map((a) => <CartaoEsim key={a.id} a={a} />)
        ) : (
          <p className="nota">
            Estamos separando o seu eSIM. Esta pagina se atualiza sozinha — e o link e a sua
            chave de acesso ao pedido, guarde-o.
          </p>
        )}

        {esperandoEntrega ? (
          <AtualizaSozinho aCadaMs={20_000} />
        ) : esperandoInstalacao ? (
          <AtualizaSozinho aCadaMs={60_000} />
        ) : null}

        <p className="nota">
          <Link href="/">Voltar para a loja</Link>
        </p>
      </section>
    </main>
  );
}
