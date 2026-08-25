import Link from "next/link";
import { db } from "../../../../../lib/db";
import { canalMl } from "../../../../../lib/mercadolivre";
import { regrasDaCategoria } from "../../../../../lib/ml-publicar";
import { usuarioDaSessao } from "../../../../../lib/painel/sessao";
import { FormAnuncio, FormCategoria } from "../../[handle]/publicar/FormPublicar";
import type { CampoMl, LinhaPublicar } from "../../[handle]/publicar/tipos";
import Desvincular from "./Desvincular";

export const dynamic = "force-dynamic";

export const metadata = { title: "Produto — AmericaSim", robots: { index: false, follow: false } };

// A ficha de UM produto vendavel.
//
// Ate aqui, abrir um produto abria a FAMILIA e empilhava os SKUs dela numa
// tela, sob o titulo "Variacoes". Para quem opera, isso responde a pergunta
// errada: ninguem trabalha sobre "eSIM Europa", trabalha sobre "eSIM Europa
// 5GB 15 dias" — que tem preco proprio, estoque proprio, fornecedor proprio e
// UM anuncio proprio no Mercado Livre.
//
// O banco continua com produto -> variante. A familia sobrevive como rotulo de
// agrupamento na lista e como uma linha no rodape desta pagina. A unidade de
// trabalho passa a ser o SKU, e e isso que a URL diz.

function pacote(a: any): string {
  const partes: string[] = [];
  if (a?.gb != null) partes.push(`${a.gb} GB`);
  if (a?.dias != null) partes.push(`${a.dias} dias`);
  return partes.length ? partes.join(" · ") : "—";
}

const rot: React.CSSProperties = {
  display: "block", fontSize: "0.7rem", letterSpacing: "0.07em",
  textTransform: "uppercase", color: "var(--texto-fraco)", marginBottom: 3,
};

export default async function FichaDoSku({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const alvo = decodeURIComponent(sku).toUpperCase();
  const u = await usuarioDaSessao();
  const podeMexer = u?.papel === "admin" || u?.papel === "operacao";
  const canal = await canalMl();

  const r = await db.query(
    `select v.id, v.sku, v.atributos, v.ativo, v.modo_entrega::text as modo,
            v.publicavel_marketplace, v.custo::text as custo, v.custo_moeda,
            p.handle, p.nome as familia, p.descricao,
            f.nome as fornecedor, f.ativo as fornecedor_ativo,
            l.livre,
            cv.fonte_custo, cv.custo_brl_efetivo::text as custo_brl,
            (select pr.valor::text from preco pr
              where pr.variante_id = v.id and pr.vigencia_fim is null
              order by pr.valor desc limit 1) as preco,
            ci.id_externo, ci.categoria_externa, ci.atributos_externos,
            ci.status::text as sync, ci.quantidade_publicada, ci.ultimo_erro
       from variante v
       join produto p on p.id = v.produto_id
       join estoque_livre l on l.variante_id = v.id
       left join custo_variante cv on cv.variante_id = v.id
       left join fornecedor f on f.id = v.fornecedor_id
       left join canal_item ci on ci.variante_id = v.id and ci.canal_id = $2
      where upper(v.sku) = $1`,
    [alvo, canal?.id ?? null],
  );

  if (r.rows.length === 0) {
    return (
      <div className="aviso">
        <h1>SKU não encontrado</h1>
        <p className="nota">
          Nenhum produto com o código <code>{alvo}</code>.{" "}
          <Link href="/painel/produtos">← voltar para Produtos</Link>
        </p>
      </div>
    );
  }
  const v = r.rows[0];
  const rascunho = (v.atributos_externos ?? {}) as any;
  const guardados = (rascunho?.atributos ?? {}) as Record<string, string>;
  const categoria = String(v.categoria_externa ?? "");

  let campos: CampoMl[] = [];
  let bloqueados: { id: string; nome: string }[] = [];
  let erroRegras = "";
  if (canal && categoria && !v.id_externo) {
    try {
      const regras = await regrasDaCategoria(canal.id, categoria);
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
    varianteId: v.id,
    sku: v.sku,
    rotulo: pacote(v.atributos),
    livre: Number(v.livre ?? 0),
    publicavel: !!v.publicavel_marketplace,
    modo: v.modo,
    anuncio: v.id_externo ?? null,
    categoria,
    titulo: String(rascunho?.titulo ?? `${v.familia} ${pacote(v.atributos)}`).slice(0, 60),
    preco: String(rascunho?.preco ?? v.preco ?? "").replace(".", ","),
    campos,
    bloqueados,
    erroRegras,
    sync: String(v.sync ?? ""),
    quantidadePublicada: v.quantidade_publicada == null ? null : Number(v.quantidade_publicada),
    ultimoErro: String(v.ultimo_erro ?? ""),
  };

  return (
    <>
      <div className="pn-cabeca">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ marginBottom: 4 }}>{v.familia} {pacote(v.atributos)}</h1>
            <code style={{ color: "var(--texto-fraco)" }}>{v.sku}</code>
            {v.ativo ? null : <span style={{ color: "var(--erro)" }}> · inativo</span>}
          </div>
          <Link href="/painel/produtos" className="botao secundario">← Produtos</Link>
        </div>
      </div>

      {/* ------------------------------------------------ o que este item e */}
      <div className="cartao" style={{ marginBottom: 18 }}>
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          <div>
            <span style={rot}>Saldo</span>
            <b style={{ fontSize: "1.3rem", color: linha.livre > 0 ? "var(--ok)" : "var(--erro)" }}>
              {linha.livre > 0 ? linha.livre : "esgotado"}
            </b>
          </div>
          <div>
            <span style={rot}>Custo</span>
            <b>{v.custo ? `${v.custo_moeda} ${Number(v.custo).toFixed(2)}` : "—"}</b>
            {v.custo_brl ? (
              <div style={{ fontSize: "0.76rem", color: "var(--texto-fraco)" }}>
                R$ {Number(v.custo_brl).toFixed(2)} · {v.fonte_custo}
              </div>
            ) : null}
          </div>
          <div>
            <span style={rot}>Preço</span>
            <b>{v.preco ? `R$ ${Number(v.preco).toFixed(2)}` : <span style={{ color: "var(--alerta)" }}>sem preço</span>}</b>
          </div>
          <div>
            <span style={rot}>Fornecedor</span>
            <b>{v.fornecedor ?? <Link href="/painel/fornecedores" style={{ color: "var(--alerta)" }}>sem fornecedor</Link>}</b>
          </div>
          <div>
            <span style={rot}>Entrega</span>
            <b>{v.modo}</b>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap", fontSize: "0.88rem" }}>
          <Link href={`/painel/produtos/${v.handle}/estoque`}>Estoque deste SKU →</Link>
          <Link href={`/painel/produtos/${v.handle}/canais`}>Preço e vitrines →</Link>
          <Link href={`/painel/produtos/${v.handle}/fornecedor`}>Fornecedor →</Link>
        </div>
      </div>

      {/* ---------------------------------------------------- mercado livre */}
      <h2 style={{ fontSize: "1.15rem", margin: "0 0 4px" }}>Mercado Livre</h2>
      <p style={{ color: "var(--texto-fraco)", fontSize: "0.88rem", margin: "0 0 14px" }}>
        Este SKU vira <b>um anúncio</b>, e só um. Campos com{" "}
        <b style={{ color: "var(--alerta)" }}>*</b> são exigidos pela categoria escolhida lá.
      </p>

      <div className="cartao">
        {!canal ? (
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
            {podeMexer ? <Desvincular sku={v.sku} varianteId={v.id} /> : null}
          </div>
        ) : erroRegras ? (
          <p style={{ color: "var(--erro)", margin: 0 }}>
            Não consegui ler as exigências da categoria {categoria}: {erroRegras}
          </p>
        ) : !categoria ? (
          <FormCategoria handle={v.handle} linha={linha} />
        ) : podeMexer ? (
          <>
            <p style={{ fontSize: "0.84rem", color: "var(--texto-fraco)", margin: "0 0 14px" }}>
              categoria <code>{categoria}</code> · {campos.filter((c) => c.obrigatorio).length} campos obrigatórios
            </p>
            <FormAnuncio handle={v.handle} linha={linha} />
          </>
        ) : (
          <p className="nota" style={{ margin: 0 }}>Seu papel permite ver, mas não publicar.</p>
        )}
      </div>

      <p style={{ color: "var(--texto-fraco)", fontSize: "0.8rem", marginTop: 20 }}>
        Agrupado em <Link href={`/painel/produtos?q=${encodeURIComponent(v.familia)}`}>{v.familia}</Link> —
        agrupamento serve para achar na lista, não para editar em conjunto.
      </p>
    </>
  );
}
