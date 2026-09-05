import { randomUUID } from "node:crypto";
import Link from "next/link";
import { apiGet, chaveConfigurada, formatarDinheiro, modoPagamento } from "../lib/vitrine";
import { marcaAtual } from "../lib/marcas";
import FormCompra from "./FormCompra";
import Logotipo from "./Logotipo";
import { IcoAviao, IcoChat, IcoEscudo, IcoIlimitado, IcoQr, IcoRede } from "./Icones";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const m = await marcaAtual();
  return {
    title: `${m.nome} — eSIM para viagem`,
    robots: { index: false, follow: false },
  };
}

interface Variante {
  sku: string;
  atributos: any;
  preco: string;
  moeda: string;
  disponivel: boolean;
  quantidade: number;
  destaque: boolean;
}

interface Produto {
  handle: string;
  nome: string;
  descricao: string | null;
  variantes: Variante[];
}

function bandeiras(cobertura: unknown): string {
  if (!Array.isArray(cobertura)) return "";
  return cobertura.map((c) => String(c)).join(" · ");
}

// O numero de codigos livres AGORA. As duas vitrines leem o mesmo estoque, entao
// uma venda numa derruba este numero na outra na recarga seguinte — a pagina e
// `force-dynamic` e a chamada da API e `no-store`, sem cache no meio.
function textoEstoque(v: Variante): string {
  const q = Number(v.quantidade ?? 0);
  if (!v.disponivel || q <= 0) return "Esgotado";
  return q === 1 ? "1 disponivel agora" : `${q} disponiveis agora`;
}

export default async function Loja() {
  const marca = await marcaAtual();

  if (!(await chaveConfigurada())) {
    return (
      <main className="wrap">
        <div className="aviso">
          <h1>Vitrine sem chave de canal</h1>
          <p>
            Nao ha chave para este dominio. Com mais de uma vitrine, a chave vem de{" "}
            <code>CHAVES_VITRINE</code> (um mapa por dominio) ou de <code>CHAVE_VITRINE</code>{" "}
            como padrao. Sem ela a loja nao consegue falar com a API <code>/v1</code>.
          </p>
        </div>
      </main>
    );
  }

  const r = await apiGet("/v1/catalogo");
  if (!r.ok) {
    return (
      <main className="wrap">
        <div className="aviso">
          <h1>Catalogo indisponivel</h1>
          <p>
            {r.erro_mensagem} <code>{r.erro_codigo}</code>
          </p>
        </div>
      </main>
    );
  }

  const produtos: Produto[] = r.dados?.produtos ?? [];
  // Calculado aqui, e nao no JSX: `modoPagamento` e assincrona porque a chave
  // da Stripe pode morar no cofre cifrado, nao so no ambiente.
  const modoPg = await modoPagamento();

  return (
    <main className="wrap">
      {/* ===== MENU DO TOPO: logo real + navegacao + conta ===== */}
      <header className="cab">
        <Logotipo codigo={marca.codigo} nome={marca.nome} />
        <nav className="cab-links" aria-label="menu principal">
          <a href="#planos">Planos</a>
          <a href="#como">Como funciona</a>
          <Link href="/duvidas">Dúvidas</Link>
        </nav>
        <div className="cab-conta">
          <Link className="botao secundario" href="/conta/entrar">Entrar</Link>
          <Link className="botao" href="/conta/criar">Criar conta</Link>
        </div>
      </header>

      {/* ===== HERO (estrutura do demo aprovado) ===== */}
      <section className="hero2">
        <div>
          <div className="beira">eSIM de viagem · chip digital</div>
          <p className="chamada">
            {marca.codigo === "americasim" ? (
              <>Pousou. <em>Conectou.</em></>
            ) : (
              marca.chamada
            )}
          </p>
          <p className="sub2">
            Internet de viagem comprada antes de embarcar e ativada quando o avião toca o
            chão. Sem roaming, sem surpresa na fatura, sem trocar seu chip.
          </p>
          <ul className="selos" aria-label="por que comprar aqui">
            <li>QR por e-mail na hora</li>
            <li>Ativa só quando você chega</li>
            <li>Seu WhatsApp continua o mesmo</li>
            <li>Suporte em português</li>
          </ul>
          <a className="botao btn-hero" href="#planos">Ver planos →</a>
        </div>
        <div className="hero-cartao">
          <h3>Por que {marca.nome}?</h3>
          <ul>
            <li>Rede 5G/4G de operadora local — a mesma que o morador usa</li>
            <li>Instale antes de viajar, com Wi-Fi e calma</li>
            <li>O plano só começa a contar na ativação, no destino</li>
            <li>Aparelho incompatível tem reembolso</li>
          </ul>
        </div>
      </section>

      {modoPg === "demonstracao" ? (
        <p className="faixa">
          <strong>Modo demonstracao.</strong> Nenhum pagamento e cobrado: o pedido e
          considerado pago na hora e o eSIM sai do estoque de teste.
        </p>
      ) : null}

      {modoPg === "teste" ? (
        <p className="faixa">
          <strong>Modo de teste.</strong> O pagamento e simulado pelo provedor: nenhum
          dinheiro real e movimentado. Use o cartao <code>4242 4242 4242 4242</code> com
          qualquer validade futura e qualquer CVC.
        </p>
      ) : null}

      {produtos.length === 0 ? (
        <div className="aviso">
          <h1>Nenhum produto neste canal</h1>
          <p>O catalogo respondeu, mas nao ha variante visivel para esta chave.</p>
        </div>
      ) : null}

      {/* ===== PLANOS (produtos reais do banco) ===== */}
      <div id="planos">
        {produtos.map((p) => (
          <section key={p.handle} className="produto">
            <h1>{p.nome}</h1>
            {p.descricao ? <p className="sub">{p.descricao}</p> : null}

            <div className="grade">
              {p.variantes.map((v) => (
                <article key={v.sku} className={v.destaque ? "plano destaque" : "plano"}>
                  {v.destaque ? <span className="selo">Mais escolhido</span> : null}

                  <div className="volume">
                    {v.atributos?.gb ? <strong>{v.atributos.gb} GB</strong> : <strong>{v.sku}</strong>}
                    {v.atributos?.dias ? <span> · {v.atributos.dias} dias</span> : null}
                  </div>

                  {v.atributos?.cobertura ? (
                    <p className="cobertura">{bandeiras(v.atributos.cobertura)}</p>
                  ) : null}

                  <p className="preco">{formatarDinheiro(v.preco, v.moeda)}</p>

                  <p className={v.disponivel ? "estoque sim" : "estoque nao"}>
                    {textoEstoque(v)}
                  </p>

                  {/* O rotulo do botao vem da MARCA: a AmericaSim vende impulso
                      ("Quero agora"), a ViagemSim vende garantia ("Garantir meu
                      eSIM"). E a diferenca de tom que faz duas vitrines serem
                      duas apostas, e nao o mesmo site pintado de outra cor. */}
                  <FormCompra
                    sku={v.sku}
                    tentativa={randomUUID()}
                    disponivel={v.disponivel}
                    rotulo={marca.rotuloBotao}
                  />

                  <p className="sku">{v.sku}</p>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="faixa-conf">
        <span>Garantia de reembolso</span>
        <span>Pagamento seguro via Stripe</span>
        <span>Rede de operadora local</span>
        <span>Suporte 24/7</span>
      </div>

      {/* ===== POR QUE (grade ilustrada, estrutura de referencia) ===== */}
      <section className="beneficios" aria-label="por que escolher">
        <h2>Por que viajar com a {marca.nome}?</h2>
        <div className="ben-grade">
          <div className="ben">
            <span className="ben-ico"><IcoIlimitado /></span>
            <h3>Dados sem susto</h3>
            <p>Plano fechado, pago em reais, antes de embarcar. A fatura da volta não tem surpresa.</p>
          </div>
          <div className="ben">
            <span className="ben-ico"><IcoRede /></span>
            <h3>Rede de operadora local</h3>
            <p>Seu eSIM roda na mesma rede 5G/4G que o morador usa — não em sobra de banda.</p>
          </div>
          <div className="ben">
            <span className="ben-ico"><IcoQr /></span>
            <h3>QR na hora, por e-mail</h3>
            <p>Pagou, chegou. Instala em dois minutos com o guia passo a passo por aparelho.</p>
          </div>
          <div className="ben">
            <span className="ben-ico"><IcoAviao /></span>
            <h3>Só conta quando você chega</h3>
            <p>Instale com calma em casa: a validade começa na ativação, no destino.</p>
          </div>
          <div className="ben">
            <span className="ben-ico"><IcoChat /></span>
            <h3>Seu WhatsApp intacto</h3>
            <p>Número, apps e contatos continuam os mesmos. Só a internet muda de país.</p>
          </div>
          <div className="ben">
            <span className="ben-ico"><IcoEscudo /></span>
            <h3>Garantia de verdade</h3>
            <p>Aparelho incompatível, desistência ou falha nossa: reembolso sem novela.</p>
          </div>
        </div>
      </section>

      {/* ===== COMO FUNCIONA ===== */}
      <section id="como" className="passos3" aria-label="como funciona">
        <h2>Conectado em 3 passos</h2>
        <div className="passos3-grade">
          <div className="passo3">
            <h3>Escolha o plano</h3>
            <p>Pague on-line e receba o QR no seu e-mail na hora.</p>
          </div>
          <div className="passo3">
            <h3>Instale antes de viajar</h3>
            <p>Dois minutos, com Wi-Fi e calma. Nada é cobrado a mais por isso.</p>
          </div>
          <div className="passo3">
            <h3>Ative ao pousar</h3>
            <p>Ligou o eSIM, conectou na melhor rede local do destino.</p>
          </div>
        </div>
      </section>

      {/* ===== COMPARATIVO (estrutura do demo) ===== */}
      <section className="comparativo" aria-label="comparativo com roaming">
        <h2>{marca.nome} × roaming da sua operadora</h2>
        <div className="rolagem">
          <table className="comp2">
            <thead>
              <tr><th></th><th>{marca.nome}</th><th>Roaming tradicional</th></tr>
            </thead>
            <tbody>
              <tr><td>Preço fechado antes de viajar</td><td className="sim">Sim</td><td className="nao">Não</td></tr>
              <tr><td>Velocidade de rede local</td><td className="sim">5G/4G plena</td><td className="nao">Reduzida</td></tr>
              <tr><td>Surpresa na fatura</td><td className="sim">Nunca</td><td className="nao">Frequente</td></tr>
              <tr><td>Trocar chip físico</td><td className="sim">Não precisa</td><td className="sim">Não precisa</td></tr>
              <tr><td>Suporte em português 24/7</td><td className="sim">Sim</td><td className="nao">Depende do plano</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id="duvidas" className="faq" aria-label="perguntas frequentes">
        <h2>Perguntas frequentes</h2>
        <details>
          <summary>Meu celular aceita eSIM?</summary>
          <p>
            A maioria dos aparelhos lançados de 2019 em diante aceita. Na dúvida, fale com a
            gente antes de comprar — aparelho incompatível tem reembolso.
          </p>
        </details>
        <details>
          <summary>Quando o plano começa a contar?</summary>
          <p>
            Só quando você ativa o eSIM no destino. Pode comprar e instalar com antecedência,
            sem gastar nenhum dia de validade.
          </p>
        </details>
        <details>
          <summary>Continuo recebendo WhatsApp no meu número?</summary>
          <p>
            Sim. O eSIM cuida só da internet; seu número e seus aplicativos continuam
            exatamente como estão.
          </p>
        </details>
        <details>
          <summary>Onde vejo meu eSIM depois de comprar?</summary>
          <p>
            No e-mail que chega na hora da compra e em <Link href="/conta">Minha conta</Link>,
            com o QR, o status e o guia de instalação.
          </p>
        </details>
        <p style={{ marginTop: 12 }}>
          <Link className="botao secundario" href="/duvidas">Ver todas as dúvidas →</Link>
        </p>
      </section>

      <footer className="rodape">
        <p style={{ margin: 0 }}>
          <b>{marca.nome}</b> · internet de viagem sem roaming e sem susto · atendimento
          24/7 em português
        </p>
      </footer>
    </main>
  );
}
