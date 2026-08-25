import Link from "next/link";
import { sugerirCategorias, type CategoriaSugerida } from "../../../../../../lib/ml-categoria";
import { regrasDaCategoria } from "../../../../../../lib/ml-publicar";
import { usuarioDaSessao } from "../../../../../../lib/painel/sessao";
import { FormAnuncio, FormCategoria } from "../../../[handle]/publicar/FormPublicar";
import type { CampoMl, LinhaPublicar } from "../../../[handle]/publicar/tipos";
import AjustarEnvio from "../AjustarEnvio";
import Cabeca from "../Cabeca";
import Desvincular from "../Desvincular";
import { carregarSku, pacote } from "../dados";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mercado Livre — AmericaSim", robots: { index: false, follow: false } };

// Endereco publico de um item: produto.mercadolivre.com.br/MLB-<digitos>.
// `www.mercadolivre.com.br/anuncio/MLB...` NAO existe — abria pagina vazia e
// parecia que o anuncio tinha sumido (25/08).
function urlDoAnuncio(mlb: string): string {
  const digitos = String(mlb).replace(/^MLB-?/i, "");
  return `https://produto.mercadolivre.com.br/MLB-${digitos}`;
}

export default async function MlDoSku({
  params,
  searchParams,
}: {
  params: Promise<{ sku: string }>;
  searchParams: Promise<{ buscar?: string; cat?: string; trocar?: string }>;
}) {
  const { sku } = await params;
  const sp = await searchParams;
  const buscar = (sp.buscar ?? "").trim();
  const catEscolhida = (sp.cat ?? "").trim().toUpperCase();
  const trocando = sp.trocar === "1" || !!catEscolhida;

  const d = await carregarSku(sku);
  if (!d) {
    return (
      <div className="aviso">
        <h1>SKU não encontrado</h1>
        <p className="nota"><Link href="/painel/produtos">← voltar para Produtos</Link></p>
      </div>
    );
  }
  const u = await usuarioDaSessao();
  const podeMexer = u?.papel === "admin" || u?.papel === "operacao";
  const base = `/painel/produtos/item/${encodeURIComponent(d.resumo.sku)}/mercado-livre`;

  const guardados = (d.rascunho?.atributos ?? {}) as Record<string, string>;
  const categoriaEmUso = catEscolhida || d.categoria;
  const mostrarFormCategoria = !d.categoria || trocando;

  let sugestoes: CategoriaSugerida[] = [];
  if (d.canalMlId && buscar) {
    sugestoes = await sugerirCategorias(d.canalMlId, buscar);
  }

  let campos: CampoMl[] = [];
  let bloqueados: { id: string; nome: string }[] = [];
  let erroRegras = "";

  if (d.canalMlId && categoriaEmUso && !d.resumo.anuncio) {
    try {
      const regras = await regrasDaCategoria(d.canalMlId, categoriaEmUso);
      campos = regras
        .filter((x) => !x.criaVariacao && (x.obrigatorio || guardados[x.id]))
        .map((x) => ({
          id: x.id, nome: x.nome, obrigatorio: x.obrigatorio,
          valores: x.valores, valorAtual: guardados[x.id] ?? "", dica: x.dica,
        }));
      bloqueados = regras.filter((x) => x.criaVariacao).map((x) => ({ id: x.id, nome: x.nome }));
    } catch (e: any) {
      erroRegras = String(e?.message ?? e).slice(0, 200);
    }
  }

  const linha: LinhaPublicar = {
    varianteId: d.varianteId,
    sku: d.resumo.sku,
    rotulo: pacote(d.atributos),
    livre: d.resumo.livre,
    publicavel: d.publicavel,
    modo: d.resumo.modo,
    anuncio: d.resumo.anuncio,
    categoria: categoriaEmUso,
    titulo: String(d.rascunho?.titulo ?? `${d.resumo.familia} ${pacote(d.atributos)}`).slice(0, 60),
    preco: String(d.rascunho?.preco ?? d.resumo.preco ?? "").replace(".", ","),
    baseMlb: String(d.rascunho?.base_mlb ?? ""),
    envio: String(d.rascunho?.envio ?? "sem_frete"),
    campos,
    bloqueados,
    erroRegras,
    sync: d.sync,
    quantidadePublicada: d.quantidadePublicada,
    ultimoErro: d.ultimoErro,
  };

  return (
    <>
      <Cabeca r={d.resumo} aba="ml" />

      <p style={{ color: "var(--texto-fraco)", fontSize: "0.9rem", margin: "0 0 16px" }}>
        Este SKU vira <b>um anúncio</b>, e só um. Campos com{" "}
        <b style={{ color: "var(--alerta)" }}>*</b> são exigidos pela categoria escolhida lá —
        sem eles o Mercado Livre recusa a publicação.
      </p>

      <div className="cartao">
        {!d.canalMlId ? (
          <p style={{ margin: 0 }}>
            O Mercado Livre não está conectado. <Link href="/painel/conexoes">Conectar →</Link>
          </p>
        ) : !linha.publicavel ? (
          <p style={{ margin: 0, color: "var(--texto-fraco)" }}>
            Este SKU está marcado como <b>{linha.modo}</b> e não vai para marketplace.
          </p>
        ) : linha.anuncio ? (
          <div>
            <p style={{ margin: "0 0 8px" }}>
              Publicado em{" "}
              <a href={urlDoAnuncio(linha.anuncio)} target="_blank" rel="noreferrer">
                <code>{linha.anuncio}</code>
              </a>
              <span style={{ fontSize: "0.78rem", color: "var(--texto-fraco)" }}> · abre a página pública do anúncio</span>
            </p>
            <p style={{ margin: 0, fontSize: "0.86rem", color: "var(--texto-fraco)" }}>
              estoque no anúncio: <b>{linha.quantidadePublicada ?? "—"}</b> · aqui: <b>{linha.livre}</b> · sincronia:{" "}
              <b style={{ color: linha.sync === "publicado" ? "var(--ok)" : "var(--erro)" }}>{linha.sync || "—"}</b>
            </p>
            {linha.ultimoErro ? (
              <p style={{ margin: "6px 0 0", fontSize: "0.8rem", color: "var(--erro)" }}>{linha.ultimoErro}</p>
            ) : null}
            {podeMexer ? (
              <>
                <AjustarEnvio sku={linha.sku} anuncio={linha.anuncio} />
                <Desvincular sku={linha.sku} varianteId={d.varianteId} />
              </>
            ) : null}
          </div>
        ) : (
          <>
            {mostrarFormCategoria ? (
              <div style={{ marginBottom: campos.length ? 22 : 0 }}>
                <h2 style={{ fontSize: "1rem", margin: "0 0 4px" }}>Categoria no Mercado Livre</h2>
                <p style={{ color: "var(--texto-fraco)", fontSize: "0.84rem", margin: "0 0 12px" }}>
                  É ela que determina o que o anúncio exige. Errar aqui não dá erro na hora —
                  dá anúncio no lugar errado, sem visitas, descoberto semanas depois.
                </p>

                <form method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
                  <input
                    type="search"
                    name="buscar"
                    defaultValue={buscar || linha.titulo}
                    placeholder="descreva o produto: eSIM internacional para viagem"
                    style={{ flex: "2 1 260px", width: "auto" }}
                  />
                  <input type="hidden" name="trocar" value="1" />
                  <button type="submit" className="secundario">Onde o ML encaixa isto?</button>
                </form>

                {buscar && sugestoes.length === 0 ? (
                  <p style={{ color: "var(--texto-fraco)", fontSize: "0.84rem" }}>
                    O classificador não devolveu nada para <b>{buscar}</b>. Tente outras palavras,
                    ou informe o código direto abaixo.
                  </p>
                ) : null}

                {sugestoes.length > 0 ? (
                  <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
                    {sugestoes.map((s) => {
                      const atual = s.id === categoriaEmUso;
                      return (
                        <Link
                          key={s.id}
                          href={`${base}?cat=${s.id}&buscar=${encodeURIComponent(buscar)}`}
                          style={{
                            display: "block",
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: `1px solid ${atual ? "var(--marca)" : "var(--borda)"}`,
                            textDecoration: "none",
                            color: "inherit",
                          }}
                        >
                          <b>{s.nome}</b>{" "}
                          <code style={{ fontSize: "0.75rem", color: "var(--texto-fraco)" }}>{s.id}</code>
                          {atual ? <span style={{ color: "var(--marca)", fontSize: "0.78rem" }}> · selecionada</span> : null}
                          <div style={{ fontSize: "0.78rem", color: "var(--texto-fraco)", marginTop: 2 }}>
                            {s.caminho || s.dominio}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}

                {podeMexer ? <FormCategoria handle={d.handle} linha={linha} /> : null}
              </div>
            ) : null}

            {erroRegras ? (
              <p style={{ color: "var(--erro)", margin: 0 }}>
                Não consegui ler as exigências da categoria {categoriaEmUso}: {erroRegras}
              </p>
            ) : !d.categoria ? null : podeMexer ? (
              <>
                <p style={{ fontSize: "0.84rem", color: "var(--texto-fraco)", margin: "0 0 14px" }}>
                  categoria <code>{categoriaEmUso}</code> · {campos.filter((c) => c.obrigatorio).length} campos obrigatórios
                  {!trocando ? (
                    <> · <Link href={`${base}?trocar=1`}>trocar categoria</Link></>
                  ) : null}
                </p>
                <FormAnuncio handle={d.handle} linha={linha} />
              </>
            ) : (
              <p className="nota" style={{ margin: 0 }}>Seu papel permite ver, mas não publicar.</p>
            )}
          </>
        )}
      </div>
    </>
  );
}
