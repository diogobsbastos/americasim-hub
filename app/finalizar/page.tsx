import { randomUUID } from "node:crypto";
import Link from "next/link";
import { cookies } from "next/headers";
import { apiGet, apiPost, chaveConfigurada, formatarDinheiro, modoPagamento } from "../../lib/vitrine";
import { marcaAtual } from "../../lib/marcas";
import { COOKIE_SESSAO } from "../../lib/conta";
import { googleConfigurado } from "../../lib/google";
import Logotipo from "../Logotipo";
import Rodape from "../Rodape";
import FormFinalizar from "./FormFinalizar";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const m = await marcaAtual();
  return { title: `Finalizar compra — ${m.nome}`, robots: { index: false, follow: false } };
}

// /finalizar?sku=... — a pagina de checkout (referencia estrutural: "finalizar
// a compra" da Holafly). Resumo do plano de um lado, dados do cliente do outro:
// Google em 1 clique OU e-mail, e o WhatsApp obrigatorio para o SAC. O
// pagamento continua sendo o /v1/checkout de sempre — esta pagina so coleta
// direito o que o cartao do plano coletava de qualquer jeito.

interface Variante {
  sku: string;
  atributos: any;
  preco: string;
  moeda: string;
  disponivel: boolean;
  quantidade: number;
}

function acharVariante(produtos: any[], sku: string): { v: Variante; produto: string } | null {
  for (const p of produtos ?? []) {
    for (const v of p.variantes ?? []) {
      if (v.sku === sku) return { v, produto: String(p.nome ?? "") };
    }
  }
  return null;
}

export default async function Finalizar({
  searchParams,
}: {
  searchParams: Promise<{ sku?: string }>;
}) {
  const marca = await marcaAtual();
  const sp = await searchParams;
  const sku = String(sp.sku ?? "");

  if (!(await chaveConfigurada())) {
    return (
      <main className="wrap">
        <div className="aviso"><h1>Vitrine sem chave de canal</h1></div>
      </main>
    );
  }

  const r = await apiGet("/v1/catalogo");
  const achado = r.ok ? acharVariante(r.dados?.produtos ?? [], sku) : null;

  // Sessao logada? Pre-preenche e-mail e WhatsApp. Falha aqui nunca derruba o
  // checkout: sem perfil, o formulario so vem vazio.
  let emailConta = "";
  let telefoneConta = "";
  let contaPendente = false;
  const sessao = (await cookies()).get(COOKIE_SESSAO)?.value ?? "";
  if (sessao) {
    const perfil = await apiPost("/v1/conta/perfil", { sessao });
    if (perfil.ok) {
      emailConta = String(perfil.dados?.email ?? "");
      telefoneConta = String(perfil.dados?.telefone ?? "");
      // Logado mas com e-mail ainda nao confirmado: a compra funciona igual,
      // so a lista de pedidos na conta e que fica vazia ate confirmar. Avisar
      // AQUI, e nao depois do pagamento — descobrir depois de pagar e a pior
      // hora possivel, e vira chamado no suporte.
      contaPendente = perfil.dados?.verificado === false;
    }
  }

  const temGoogle = await googleConfigurado();
  const modoPg = await modoPagamento();

  return (
    <main className="wrap">
      <header className="cab">
        <Link href="/" aria-label="Voltar para a loja" style={{ display: "inline-flex" }}>
          <Logotipo codigo={marca.codigo} nome={marca.nome} />
        </Link>
        <div className="cab-conta">
          <Link className="botao secundario" href="/#planos">← Voltar aos planos</Link>
        </div>
      </header>

      {!r.ok ? (
        /* O catalogo caiu. Dizer "plano nao encontrado" aqui seria mentir e
           mandar o cliente embora por um problema NOSSO — ele tentaria outro
           plano e veria a mesma tela. */
        <div className="aviso">
          <h1>Não conseguimos carregar os planos agora</h1>
          <p>
            Foi um problema nosso, não com o seu link. Recarregue a página em alguns
            segundos — se continuar, responda o e-mail do seu último pedido ou fale com a
            gente pela <Link href="/duvidas">Central de dúvidas</Link>.
          </p>
          <p className="fin-dica">Detalhe técnico: {r.erro_mensagem} ({r.erro_codigo})</p>
          <p style={{ marginTop: 16 }}>
            <Link className="botao" href={`/finalizar?sku=${encodeURIComponent(sku)}`}>Tentar de novo</Link>
          </p>
        </div>
      ) : !achado ? (
        <div className="aviso">
          <h1>Plano não encontrado</h1>
          <p>
            Este link de compra não aponta para um plano à venda.{" "}
            <Link href="/#planos">Escolher um plano →</Link>
          </p>
        </div>
      ) : !achado.v.disponivel || Number(achado.v.quantidade ?? 0) <= 0 ? (
        <div className="aviso">
          <h1>Este plano acabou de esgotar</h1>
          <p>
            <Link href="/#planos">Ver os planos disponíveis →</Link>
          </p>
        </div>
      ) : (
        <>
          <h1 className="fin-titulo">Finalizar compra</h1>

          {modoPg === "teste" ? (
            <p className="faixa">
              <strong>Modo de teste.</strong> Nenhum dinheiro real é movimentado. Cartão{" "}
              <code>4242 4242 4242 4242</code>, qualquer validade futura, qualquer CVC.
            </p>
          ) : null}
          {modoPg === "demonstracao" ? (
            <p className="faixa">
              <strong>Modo demonstração.</strong> Nenhum pagamento é cobrado: o pedido é
              considerado pago na hora.
            </p>
          ) : null}

          {/* Aviso, nunca bloqueio: quem nao confirmou o e-mail compra do mesmo
              jeito e recebe o QR normalmente. O que muda e so a lista na conta. */}
          {contaPendente ? (
            <p className="faixa">
              <strong>Falta confirmar seu e-mail.</strong> Pode comprar normalmente — o QR
              chega no seu e-mail assim que o pagamento passar. A confirmação serve para os
              pedidos aparecerem em <Link href="/conta">Minha conta</Link>; o link de
              confirmação foi enviado quando você criou a conta.
            </p>
          ) : null}

          <div className="fin-grade">
            <section className="fin-caixa" aria-label="seus dados">
              <h2 className="fin-sub">Seus dados</h2>
              <FormFinalizar
                sku={achado.v.sku}
                tentativa={randomUUID()}
                rotulo={
                  modoPg === "demonstracao" ? "Concluir pedido" : "Ir para o pagamento →"
                }
                emailConta={emailConta}
                telefoneConta={telefoneConta}
                temGoogle={temGoogle}
              />
            </section>

            <aside className="fin-caixa fin-resumo" aria-label="resumo do pedido">
              <h2 className="fin-sub">Resumo do pedido</h2>
              <p className="fin-plano">
                {achado.v.atributos?.gb ? <b>{achado.v.atributos.gb} GB</b> : <b>{achado.v.sku}</b>}
                {achado.v.atributos?.dias ? <span> · {achado.v.atributos.dias} dias</span> : null}
              </p>
              {achado.produto ? <p className="fin-produto">{achado.produto}</p> : null}
              {Array.isArray(achado.v.atributos?.cobertura) ? (
                <p className="cobertura">{achado.v.atributos.cobertura.join(" · ")}</p>
              ) : null}
              <div className="fin-linha fin-total">
                <span>Total</span>
                <span>{formatarDinheiro(achado.v.preco, achado.v.moeda)}</span>
              </div>
              <ul className="fin-selos">
                <li>QR por e-mail na hora</li>
                <li>Validade só conta na ativação, no destino</li>
                <li>Aparelho incompatível tem <Link href="/reembolso">reembolso</Link></li>
                <li>Pagamento seguro processado pela Stripe</li>
              </ul>
            </aside>
          </div>
        </>
      )}

      <Rodape />
    </main>
  );
}
