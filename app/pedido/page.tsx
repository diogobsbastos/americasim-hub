import Link from "next/link";
import { apiGet, chaveConfigurada } from "../../lib/vitrine";
import { marcaAtual } from "../../lib/marcas";
import CartaoEsim, { type AtivacaoTela } from "./CartaoEsim";
import AtualizaSozinho from "./AtualizaSozinho";
import Logotipo from "../Logotipo";
import Rodape from "../Rodape";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const m = await marcaAtual();
  return {
    title: `Seu pedido — ${m.nome}`,
    robots: { index: false, follow: false },
  };
}

// Cabecalho da pagina do pedido: mesmo padrao do site. Quem chega pelo LINK DO
// E-MAIL pode nao estar logado — por isso ha "Meus eSIMs" (leva ao login se
// preciso) e nada aqui depende de sessao.
function Cabecalho({ codigo, nome }: { codigo: string; nome: string }) {
  return (
    <header className="cab">
      <Link href="/" aria-label="Voltar para a loja" style={{ display: "inline-flex" }}>
        {/* Quem comprou na ViagemSim nao pode cair numa tela escrita
            AmericaSim: seria a primeira coisa a fazer o cliente achar que
            caiu num golpe, justamente na pagina onde ele espera o produto.
            O Logotipo ja resolve por marca. */}
        <Logotipo codigo={codigo} nome={nome} />
      </Link>
      <nav className="cab-links" aria-label="menu principal">
        <Link href="/#planos">Planos</Link>
        <Link href="/duvidas">Dúvidas</Link>
      </nav>
      <div className="cab-conta">
        <Link className="botao secundario" href="/conta">Meus eSIMs</Link>
      </div>
    </header>
  );
}

function chipDoPedido(p: any): { classe: string; texto: string } {
  if (p.entregue) return { classe: "ct-chip ok", texto: "entregue" };
  if (p.status === "cancelado") return { classe: "ct-chip off", texto: "cancelado" };
  if (p.status === "aguardando_pagamento") return { classe: "ct-chip espera", texto: "aguardando pagamento" };
  return { classe: "ct-chip espera", texto: "preparando seu eSIM" };
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
        <Cabecalho codigo={marca.codigo} nome={marca.nome} />
        <div className="aviso">
          <h1>Link incompleto</h1>
          <p>
            Este endereço precisa do número do pedido e do código de acompanhamento. Use o
            link que você recebeu por e-mail após a compra — ou entre em{" "}
            <Link href="/conta">Meus eSIMs</Link>.
          </p>
        </div>
        <Rodape />
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
        <Cabecalho codigo={marca.codigo} nome={marca.nome} />
        <div className="aviso">
          <h1>Pedido não encontrado</h1>
          <p>Confira se o link está completo, incluindo o código depois de {"&t="}.</p>
          <p>
            <Link href="/conta">Ver meus eSIMs</Link>
          </p>
        </div>
        <Rodape />
      </main>
    );
  }

  const p = r.dados ?? {};
  const ativacoes: AtivacaoTela[] = p.ativacoes ?? [];
  const chip = chipDoPedido(p);

  // A tela se mantem viva sozinha enquanto ha o que esperar: rapido durante a
  // preparacao, devagar esperando a instalacao, desligada quando tudo instalou.
  const esperandoEntrega = !p.entregue;
  const esperandoInstalacao =
    p.entregue && ativacoes.some((a) => a.status !== "instalado" && a.status !== "falhou");

  return (
    <main className="wrap">
      <Cabecalho codigo={marca.codigo} nome={marca.nome} />

      <div className="ped-topo">
        <div>
          <h1 className="ped-titulo">
            {p.entregue ? <>Seu eSIM está pronto 🎉</> : <>Pedido recebido</>}
          </h1>
          <p className="ped-sub">
            Pedido <code>{p.numero}</code>
            {p.entregue_em ? <> · entregue em {new Date(p.entregue_em).toLocaleString("pt-BR")}</> : null}
          </p>
        </div>
        <span className={chip.classe}>{chip.texto}</span>
      </div>

      {ativacoes.length > 0 ? (
        ativacoes.map((a) => <CartaoEsim key={a.id} a={a} />)
      ) : (
        <div className="aviso">
          <h1>Separando o seu eSIM…</h1>
          <p className="nota" style={{ marginTop: 6 }}>
            Esta página se atualiza sozinha — e o link dela é a sua chave de acesso ao
            pedido, guarde-o. O QR também chega no seu e-mail.
          </p>
        </div>
      )}

      {esperandoEntrega ? (
        <AtualizaSozinho aCadaMs={20_000} />
      ) : esperandoInstalacao ? (
        <AtualizaSozinho aCadaMs={60_000} />
      ) : null}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 24 }}>
        <Link className="botao secundario" href="/conta">← Meus eSIMs</Link>
        <Link className="botao secundario" href="/#planos">Comprar outro eSIM</Link>
        <Link className="botao secundario" href="/duvidas#instalar">Ajuda para instalar</Link>
      </div>

      <Rodape />
    </main>
  );
}
