import Link from "next/link";
import { db } from "../../../../../lib/db";
import { canalMl } from "../../../../../lib/mercadolivre";
import { regrasDaCategoria } from "../../../../../lib/ml-publicar";
import { usuarioDaSessao } from "../../../../../lib/painel/sessao";
import Abas from "../Abas";
import { FormAnuncio, FormCategoria } from "./FormPublicar";
import type { CampoMl, LinhaPublicar } from "./tipos";

export const dynamic = "force-dynamic";

export const metadata = { title: "Mercado Livre — AmericaSim", robots: { index: false, follow: false } };

function rotuloVariante(a: any): string {
  const partes: string[] = [];
  if (a?.gb != null) partes.push(`${a.gb} GB`);
  if (a?.dias != null) partes.push(`${a.dias} dias`);
  return partes.length ? partes.join(" · ") : "—";
}

export default async function PublicarNoMl({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const u = await usuarioDaSessao();
  const podeMexer = u?.papel === "admin" || u?.papel === "operacao";

  const p = await db.query("select id, handle, nome from produto where handle = $1", [handle]);
  if (p.rows.length === 0) {
    return (
      <div className="aviso">
        <h1>Produto não encontrado</h1>
        <p className="nota"><Link href="/painel/produtos">← voltar para Produtos</Link></p>
      </div>
    );
  }
  const prod = p.rows[0];
  const canal = await canalMl();

  const vars = await db.query(
    `select v.id, v.sku, v.atributos, v.publicavel_marketplace, v.modo_entrega::text as modo,
            l.livre,
            (select pr.valor::text from preco pr
              where pr.variante_id = v.id and pr.vigencia_fim is null
              order by pr.valor desc limit 1) as preco,
            ci.id_externo, ci.categoria_externa, ci.atributos_externos,
            ci.status::text as sync, ci.quantidade_publicada, ci.ultimo_erro
       from variante v
       join estoque_livre l on l.variante_id = v.id
       left join canal_item ci on ci.variante_id = v.id and ci.canal_id = $2
      where v.produto_id = $1
      order by v.sku`,
    [prod.id, canal?.id ?? null],
  );

  // As regras vem da API do ML, uma consulta por categoria em uso. Cache nao
  // vale a pena aqui: sao poucos SKUs e a tela e de uso ocasional — e regra
  // desatualizada e pior que consulta repetida.
  const cache = new Map<string, Awaited<ReturnType<typeof regrasDaCategoria>>>();
  const linhas: LinhaPublicar[] = [];

  for (const v of vars.rows) {
    const rascunho = (v.atributos_externos ?? {}) as any;
    const guardados = (rascunho?.atributos ?? {}) as Record<string, string>;
    const categoria = String(v.categoria_externa ?? "");

    let campos: CampoMl[] = [];
    let bloqueados: { id: string; nome: string }[] = [];
    let erroRegras = "";

    if (canal && categoria && !v.id_externo) {
      try {
        if (!cache.has(categoria)) cache.set(categoria, await regrasDaCategoria(canal.id, categoria));
        const regras = cache.get(categoria)!;
        campos = regras
          .filter((r) => !r.criaVariacao && (r.obrigatorio || guardados[r.id]))
          .map((r) => ({
            id: r.id,
            nome: r.nome,
            obrigatorio: r.obrigatorio,
            valores: r.valores,
            valorAtual: guardados[r.id] ?? "",
            dica: r.dica,
          }));
        bloqueados = regras.filter((r) => r.criaVariacao).map((r) => ({ id: r.id, nome: r.nome }));
      } catch (e: any) {
        // A API deles fora do ar nao pode derrubar a pagina de produto.
        erroRegras = String(e?.message ?? e).slice(0, 200);
      }
    }

    linhas.push({
      varianteId: v.id,
      sku: v.sku,
      rotulo: rotuloVariante(v.atributos),
      livre: Number(v.livre ?? 0),
      publicavel: !!v.publicavel_marketplace,
      modo: v.modo,
      anuncio: v.id_externo ?? null,
      categoria,
      titulo: String(rascunho?.titulo ?? `${prod.nome} ${rotuloVariante(v.atributos)}`).slice(0, 60),
      preco: String(rascunho?.preco ?? v.preco ?? "").replace(".", ","),
      campos,
      bloqueados,
      erroRegras,
      sync: String(v.sync ?? ""),
      quantidadePublicada: v.quantidade_publicada === null || v.quantidade_publicada === undefined
        ? null
        : Number(v.quantidade_publicada),
      ultimoErro: String(v.ultimo_erro ?? ""),
    });
  }

  return (
    <>
      <div className="pn-cabeca">
        <h1>{prod.nome}</h1>
        <p><code>{prod.handle}</code> · <Link href="/painel/produtos">voltar para a lista</Link></p>
      </div>

      <Abas handle={prod.handle} atual="publicar" />

      {!canal ? (
        <div className="cartao perigo" style={{ marginBottom: 18 }}>
          <p style={{ margin: 0 }}>
            O Mercado Livre não está conectado. <Link href="/painel/conexoes">Conectar →</Link>
          </p>
        </div>
      ) : null}

      <p style={{ color: "var(--texto-fraco)", fontSize: "0.9rem", margin: "0 0 20px" }}>
        Cada SKU vira <b>um anúncio</b>. Os campos marcados com <b style={{ color: "var(--alerta)" }}>*</b> são
        exigidos pela categoria escolhida no Mercado Livre — sem eles a publicação é recusada por lá.
      </p>

      {!podeMexer ? (
        <p className="nota" style={{ marginBottom: 14 }}>Seu papel permite ver, mas não publicar.</p>
      ) : null}

      {linhas.map((l) => (
        <div key={l.varianteId} className="cartao" style={{ marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <div>
              <b style={{ fontSize: "1.05rem" }}>{l.rotulo}</b>
              <br />
              <code style={{ fontSize: "0.78rem", color: "var(--texto-fraco)" }}>{l.sku}</code>
            </div>
            <div style={{ textAlign: "right", fontSize: "0.85rem" }}>
              <span style={{ color: l.livre > 0 ? "var(--ok)" : "var(--erro)" }}>
                {l.livre > 0 ? `${l.livre} em estoque` : "sem estoque"}
              </span>
            </div>
          </div>

          {!l.publicavel ? (
            <p style={{ color: "var(--texto-fraco)", margin: 0 }}>
              Este SKU está marcado como <b>{l.modo}</b> e não vai para marketplace.
            </p>
          ) : l.anuncio ? (
            <div>
              <p style={{ margin: "0 0 8px" }}>
                Publicado em{" "}
                <a href={`https://www.mercadolivre.com.br/anuncio/${l.anuncio}`} target="_blank" rel="noreferrer">
                  <code>{l.anuncio}</code>
                </a>
              </p>
              <p style={{ margin: 0, fontSize: "0.86rem", color: "var(--texto-fraco)" }}>
                estoque no anúncio: <b>{l.quantidadePublicada ?? "—"}</b> · aqui: <b>{l.livre}</b> · sincronia:{" "}
                <b style={{ color: l.sync === "publicado" ? "var(--ok)" : "var(--erro)" }}>{l.sync || "—"}</b>
              </p>
              {l.ultimoErro ? (
                <p style={{ margin: "6px 0 0", fontSize: "0.8rem", color: "var(--erro)" }}>{l.ultimoErro}</p>
              ) : null}
              <p style={{ margin: "8px 0 0", fontSize: "0.84rem" }}>
                Para trocar o anúncio deste SKU, desvincule em{" "}
                <Link href={`/painel/produtos/${handle}/canais`}>Canais e preços</Link>.
              </p>
            </div>
          ) : l.erroRegras ? (
            <p style={{ color: "var(--erro)", margin: 0 }}>
              Não consegui ler as exigências da categoria {l.categoria}: {l.erroRegras}
            </p>
          ) : !l.categoria ? (
            <FormCategoria handle={handle} linha={l} />
          ) : (
            <>
              <p style={{ fontSize: "0.84rem", color: "var(--texto-fraco)", margin: "0 0 14px" }}>
                categoria <code>{l.categoria}</code> · {l.campos.filter((c) => c.obrigatorio).length} campos obrigatórios
              </p>
              {podeMexer ? <FormAnuncio handle={handle} linha={l} /> : null}
            </>
          )}
        </div>
      ))}
    </>
  );
}
