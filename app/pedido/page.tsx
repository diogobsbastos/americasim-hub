import Link from "next/link";
import { cookies } from "next/headers";
import { apiGet, apiPost, chaveConfigurada } from "../../lib/vitrine";
import { COOKIE_SESSAO } from "../../lib/conta";
import { marcaAtual } from "../../lib/marcas";
import CartaoEsim, { type AtivacaoTela } from "./CartaoEsim";
import AtualizaSozinho from "./AtualizaSozinho";
import ShellCliente from "../ShellCliente";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const m = await marcaAtual();
  return {
    title: `Seu pedido — ${m.nome}`,
    robots: { index: false, follow: false },
  };
}

// A pagina do pedido vive DENTRO do shell do painel (sidebar + topo), como
// /conta — e o mesmo app, nao uma pagina solta. Quem chega pelo LINK DO E-MAIL
// sem sessao ve o mesmo shell com "Entrar na conta" no lugar de "Sair".

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

  // Sessao (se houver): decide Sair × Entrar na sidebar e o item Backend do
  // admin. Nada AQUI depende dela — o acesso ao pedido e pelo link assinado.
  const sessao = (await cookies()).get(COOKIE_SESSAO)?.value ?? "";
  let temBackend = false;
  if (sessao) {
    const perfil = await apiPost("/v1/conta/perfil", { sessao });
    temBackend = perfil.ok && perfil.dados?.backend === true;
  }
  const logado = Boolean(sessao);

  if (!numero || !token) {
    return (
      <ShellCliente codigo={marca.codigo} nome={marca.nome} temBackend={temBackend} logado={logado} ativo="nenhum">
        <div className="aviso">
          <h1>Link incompleto</h1>
          <p>
            Este endereço precisa do número do pedido e do código de acompanhamento. Use o
            link que você recebeu por e-mail após a compra — ou entre em{" "}
            <Link href="/conta">Meus eSIMs</Link>.
          </p>
        </div>
      </ShellCliente>
    );
  }

  const r = await apiGet(
    `/v1/pedidos/${encodeURIComponent(numero)}?t=${encodeURIComponent(token)}`,
  );

  // Sem token valido a API devolve 404 indistinguivel de pedido inexistente — de
  // proposito (SPEC/03). A vitrine repete a mesma mensagem para nao vazar a diferenca.
  if (!r.ok) {
    return (
      <ShellCliente codigo={marca.codigo} nome={marca.nome} temBackend={temBackend} logado={logado} ativo="nenhum">
        <div className="aviso">
          <h1>Pedido não encontrado</h1>
          <p>Confira se o link está completo, incluindo o código depois de {"&t="}.</p>
          <p>
            <Link href="/conta">Ver meus eSIMs</Link>
          </p>
        </div>
      </ShellCliente>
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
    <ShellCliente codigo={marca.codigo} nome={marca.nome} temBackend={temBackend} logado={logado} ativo="esims">
      <p className="ct-migalha">
        <Link href="/conta">Meus eSIMs</Link> <span>/</span> Pedido {p.numero}
      </p>

      <div className="ped-topo">
        <div>
          <h1 className="ct-ola">
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
        <Link className="botao secundario" href="/duvidas#instalar">Ajuda para instalar</Link>
      </div>
    </ShellCliente>
  );
}
