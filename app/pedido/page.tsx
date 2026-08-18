import Link from "next/link";
import { apiGet, chaveConfigurada } from "../../lib/vitrine";
import FormAtivacao from "./FormAtivacao";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Seu pedido — AmericaSim",
  robots: { index: false, follow: false },
};

interface Ativacao {
  id: string;
  status: string;
}

export default async function Pedido({
  searchParams,
}: {
  searchParams: Promise<{ pedido?: string; t?: string }>;
}) {
  const sp = await searchParams;
  const numero = sp.pedido ?? "";
  const token = sp.t ?? "";

  if (!chaveConfigurada()) {
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
  const ativacoes: Ativacao[] = p.ativacoes ?? [];

  return (
    <main className="wrap">
      <header className="topo">
        <div className="marca">
          <span className="ponto" aria-hidden="true" />
          AmericaSim
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

        {p.entregue && ativacoes.length > 0 ? (
          ativacoes.map((a) => <FormAtivacao key={a.id} ativacaoId={a.id} />)
        ) : (
          <p className="nota">
            Estamos separando o seu eSIM. Esta pagina se atualiza a cada recarga — guarde o
            link, ele e a sua chave de acesso ao pedido.
          </p>
        )}

        <p className="nota">
          <Link href="/">Voltar para a loja</Link>
        </p>
      </section>
    </main>
  );
}
