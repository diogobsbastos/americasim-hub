import Link from "next/link";
import { regrasDaCategoria } from "../../../../../../lib/ml-publicar";
import { usuarioDaSessao } from "../../../../../../lib/painel/sessao";
import { FormAnuncio, FormCategoria } from "../../../[handle]/publicar/FormPublicar";
import type { CampoMl, LinhaPublicar } from "../../../[handle]/publicar/tipos";
import Cabeca from "../Cabeca";
import Desvincular from "../Desvincular";
import { carregarSku, pacote } from "../dados";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mercado Livre — AmericaSim", robots: { index: false, follow: false } };

export default async function MlDoSku({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
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

  const guardados = (d.rascunho?.atributos ?? {}) as Record<string, string>;
  let campos: CampoMl[] = [];
  let bloqueados: { id: string; nome: string }[] = [];
  let erroRegras = "";

  if (d.canalMlId && d.categoria && !d.resumo.anuncio) {
    try {
      const regras = await regrasDaCategoria(d.canalMlId, d.categoria);
      campos = regras
        .filter((x) => !x.criaVariacao && (x.obrigatorio || guardados[x.id]))
        .map((x) => ({
          id: x.id, nome: x.nome, obrigatorio: x.obrigatorio,
          valores: x.valores, valorAtual: guardados[x.id] ?? "", dica: x.dica,
        }));
      bloqueados = regras.filter((x) => x.criaVariacao).map((x) => ({ id: x.id, nome: x.nome }));
    } catch (e: any) {
      // A API deles fora do ar nao pode derrubar a pagina do produto.
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
    categoria: d.categoria,
    titulo: String(d.rascunho?.titulo ?? `${d.resumo.familia} ${pacote(d.atributos)}`).slice(0, 60),
    preco: String(d.rascunho?.preco ?? d.resumo.preco ?? "").replace(".", ","),
    // Guardado junto com o resto do rascunho. Sem devolver isto, o campo
    // aparecia vazio a cada volta e dava a impressao de nao ter sido salvo.
    baseMlb: String(d.rascunho?.base_mlb ?? ""),
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
              <a href={`https://www.mercadolivre.com.br/anuncio/${linha.anuncio}`} target="_blank" rel="noreferrer">
                <code>{linha.anuncio}</code>
              </a>
            </p>
            <p style={{ margin: 0, fontSize: "0.86rem", color: "var(--texto-fraco)" }}>
              estoque no anúncio: <b>{linha.quantidadePublicada ?? "—"}</b> · aqui: <b>{linha.livre}</b> · sincronia:{" "}
              <b style={{ color: linha.sync === "publicado" ? "var(--ok)" : "var(--erro)" }}>{linha.sync || "—"}</b>
            </p>
            {linha.ultimoErro ? (
              <p style={{ margin: "6px 0 0", fontSize: "0.8rem", color: "var(--erro)" }}>{linha.ultimoErro}</p>
            ) : null}
            {podeMexer ? <Desvincular sku={linha.sku} varianteId={d.varianteId} /> : null}
          </div>
        ) : erroRegras ? (
          <p style={{ color: "var(--erro)", margin: 0 }}>
            Não consegui ler as exigências da categoria {d.categoria}: {erroRegras}
          </p>
        ) : !d.categoria ? (
          <FormCategoria handle={d.handle} linha={linha} />
        ) : podeMexer ? (
          <>
            <p style={{ fontSize: "0.84rem", color: "var(--texto-fraco)", margin: "0 0 14px" }}>
              categoria <code>{d.categoria}</code> · {campos.filter((c) => c.obrigatorio).length} campos obrigatórios
            </p>
            <FormAnuncio handle={d.handle} linha={linha} />
          </>
        ) : (
          <p className="nota" style={{ margin: 0 }}>Seu papel permite ver, mas não publicar.</p>
        )}
      </div>
    </>
  );
}
