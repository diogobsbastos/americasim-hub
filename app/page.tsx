import { randomUUID } from "node:crypto";
import { apiGet, chaveConfigurada, formatarDinheiro, modoDemonstracao } from "../lib/vitrine";
import { marcaAtual } from "../lib/marcas";
import FormCompra from "./FormCompra";

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

  return (
    <main className="wrap">
      <header className="topo">
        <div className="marca">
          <span className="ponto" aria-hidden="true" />
          {marca.nome}
        </div>
        <p className="chamada">{marca.chamada}</p>
      </header>

      {modoDemonstracao() ? (
        <p className="faixa">
          <strong>Modo demonstracao.</strong> Nenhum pagamento e cobrado: o pedido e
          considerado pago na hora e o eSIM sai do estoque de teste.
        </p>
      ) : null}

      {produtos.length === 0 ? (
        <div className="aviso">
          <h1>Nenhum produto neste canal</h1>
          <p>O catalogo respondeu, mas nao ha variante visivel para esta chave.</p>
        </div>
      ) : null}

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

      <footer className="rodape">
        {marca.nome} · uma marca AmericaSim · vitrine consumindo{" "}
        <code>GET /v1/catalogo</code> e <code>POST /v1/checkout</code>
      </footer>
    </main>
  );
}
