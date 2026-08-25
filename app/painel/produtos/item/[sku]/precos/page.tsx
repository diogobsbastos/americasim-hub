import Link from "next/link";
import { db } from "../../../../../../lib/db";
import { usuarioDaSessao } from "../../../../../../lib/painel/sessao";
import Matriz, { type Canal, type Linha } from "../../../[handle]/Matriz";
import Cabeca from "../Cabeca";
import { carregarSku, pacote } from "../dados";

export const dynamic = "force-dynamic";
export const metadata = { title: "Preço e vitrines — AmericaSim", robots: { index: false, follow: false } };

// Dinheiro para a TELA: sempre duas casas, sempre com virgula.
//
// A coluna `variante.custo` e numeric de quatro casas, entao o banco devolve
// "3.2000". A primeira versao disto so trocava o ponto pela virgula e mandava
// "3,2000" de volta no formulario — e o validador do servidor recusa mais de
// duas casas, com razao: dinheiro com quatro casas e erro de digitacao quase
// sempre. O formulario levava recusa por um valor que ele mesmo tinha montado,
// e nao havia o que corrigir na tela. Erro de validacao sem conserto possivel e
// o pior tipo.
function paraCampo(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return n.toFixed(2).replace(".", ",");
}

export default async function PrecosDoSku({ params }: { params: Promise<{ sku: string }> }) {
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
  const podeDinheiro = u?.papel === "admin";
  const podeVitrine = u?.papel === "admin" || u?.papel === "operacao";

  const [cans, cels, precos, param, custo] = await Promise.all([
    db.query("select id, codigo, nome, tipo::text as tipo, moeda from canal where ativo order by tipo, codigo"),
    db.query("select canal_id, visivel, destaque from canal_variante where variante_id = $1", [d.varianteId]),
    db.query(
      "select canal_id, valor::text as valor from preco where variante_id = $1 and vigencia_fim is null",
      [d.varianteId],
    ),
    db.query("select valor from parametro where chave = 'cambio.usd_brl'"),
    db.query(
      "select disponivel, fonte_custo, custo_brl_efetivo::text as custo_brl from custo_variante where variante_id = $1",
      [d.varianteId],
    ),
  ]);

  const cambio = Number(param.rows[0]?.valor ?? 0);
  const canais: Canal[] = cans.rows.map((c: any) => ({
    id: c.id, codigo: c.codigo, nome: c.nome, tipo: c.tipo, moeda: c.moeda,
  }));

  // A mesma matriz da tela antiga, com UMA linha. As colunas continuam sendo os
  // canais — e aí que a decisão mora: vende neste canal? por quanto?
  const celulas: Linha["celulas"] = {};
  for (const c of canais) {
    const cel = cels.rows.find((x: any) => x.canal_id === c.id);
    const pr = precos.rows.find((x: any) => x.canal_id === c.id);
    celulas[c.id] = {
      visivel: cel?.visivel ?? false,
      destaque: cel?.destaque ?? false,
      preco: paraCampo(pr?.valor),
    };
  }

  const linha: Linha = {
    varianteId: d.varianteId,
    sku: d.resumo.sku,
    rotulo: pacote(d.atributos),
    custo: paraCampo(d.resumo.custo),
    custoMoeda: d.resumo.custoMoeda,
    custoBrl: custo.rows[0]?.custo_brl ?? null,
    fonteCusto: custo.rows[0]?.fonte_custo ?? "indisponivel",
    disponivel: d.resumo.livre,
    celulas,
  };

  return (
    <>
      <Cabeca r={d.resumo} aba="precos" />
      {canais.length === 0 ? (
        <div className="aviso">
          <h1>Nenhum canal ativo</h1>
          <p className="nota">A matriz precisa de pelo menos um canal para ter colunas.</p>
        </div>
      ) : (
        <Matriz
          handle={d.handle}
          canais={canais}
          linhas={[linha]}
          cambio={cambio}
          podeDinheiro={!!podeDinheiro}
          podeVitrine={!!podeVitrine}
        />
      )}
    </>
  );
}
