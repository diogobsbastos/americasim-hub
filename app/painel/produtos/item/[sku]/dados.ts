import { db } from "../../../../../lib/db";
import { canalMl } from "../../../../../lib/mercadolivre";
import type { ResumoSku } from "./Cabeca";

// O carregador do SKU, usado por todas as abas.
//
// Modulo comum, sem diretiva de servidor: ele nao e chamado do navegador, e
// so por paginas que ja rodam no servidor. Uma consulta so responde quem e o
// item, quanto tem, quanto custa e onde esta publicado — cada aba repetindo a
// propria consulta seriam cinco versoes da mesma verdade, e um dia duas
// discordam.

export function pacote(a: any): string {
  const partes: string[] = [];
  if (a?.gb != null) partes.push(`${a.gb} GB`);
  if (a?.dias != null) partes.push(`${a.dias} dias`);
  return partes.length ? partes.join(" · ") : "—";
}

export type SkuCompleto = {
  achou: boolean;
  varianteId: string;
  produtoId: string;
  handle: string;
  descricao: string | null;
  atributos: any;
  publicavel: boolean;
  fornecedorId: string | null;
  categoria: string;
  rascunho: any;
  sync: string;
  quantidadePublicada: number | null;
  ultimoErro: string;
  canalMlId: string | null;
  resumo: ResumoSku;
};

export async function carregarSku(skuBruto: string): Promise<SkuCompleto | null> {
  const alvo = decodeURIComponent(skuBruto).toUpperCase();
  const canal = await canalMl();

  const r = await db.query(
    `select v.id, v.sku, v.atributos, v.ativo, v.modo_entrega::text as modo,
            v.publicavel_marketplace, v.custo::text as custo, v.custo_moeda,
            v.fornecedor_id,
            p.id as produto_id, p.handle, p.nome as familia, p.descricao,
            f.nome as fornecedor,
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
  if (r.rows.length === 0) return null;
  const v = r.rows[0];

  return {
    achou: true,
    varianteId: v.id,
    produtoId: v.produto_id,
    handle: v.handle,
    descricao: v.descricao ?? null,
    atributos: v.atributos,
    publicavel: !!v.publicavel_marketplace,
    fornecedorId: v.fornecedor_id ?? null,
    categoria: String(v.categoria_externa ?? ""),
    rascunho: v.atributos_externos ?? {},
    sync: String(v.sync ?? ""),
    quantidadePublicada: v.quantidade_publicada == null ? null : Number(v.quantidade_publicada),
    ultimoErro: String(v.ultimo_erro ?? ""),
    canalMlId: canal?.id ?? null,
    resumo: {
      sku: v.sku,
      familia: v.familia,
      pacote: pacote(v.atributos),
      ativo: !!v.ativo,
      livre: Number(v.livre ?? 0),
      custo: v.custo ?? null,
      custoMoeda: v.custo_moeda,
      custoBrl: v.custo_brl ?? null,
      fonteCusto: v.fonte_custo ?? null,
      preco: v.preco ?? null,
      fornecedor: v.fornecedor ?? null,
      modo: v.modo,
      anuncio: v.id_externo ?? null,
    },
  };
}
