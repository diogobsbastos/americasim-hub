import { db } from "./db";
import { mlFetch } from "./mercadolivre";

// Publicar no Mercado Livre, e saber as regras antes de tentar.
//
// POR QUE ISTO E BIBLIOTECA E NAO ROTA
//
// A primeira versao morava dentro de uma rota interna, alcancavel so pelo
// worker e por curl no terminal. Publicar produto e trabalho de quem opera a
// loja, e trabalho de quem opera tem que ser botao na tela. As duas portas
// (tela e rota) chamam as funcoes daqui, entao nao ha como uma publicar de um
// jeito e a outra de outro.
//
// O QUE O ML COBRA, E ONDE ISSO MORDE
//
// Cada categoria tem sua lista de atributos. Tres grupos importam:
//   - OBRIGATORIOS: sem eles o ML recusa a publicacao;
//   - FORMADORES DE VARIACAO: preenchidos, fazem o ML criar uma "grade" e
//     mover o estoque para dentro dela. Foi assim que MLB5126976949 ganhou uma
//     variacao por causa de "Tamanho do cartao SIM" — campo que a categoria
//     nem exige;
//   - o resto, opcional.
// Um SKU nosso e um anuncio la. Entao formador de variacao NAO entra, venha de
// onde vier.

export type RegraAtributo = {
  id: string;
  nome: string;
  obrigatorio: boolean;
  criaVariacao: boolean;
  tipo: string;
  // Quando a lista e fechada, a tela mostra um seletor em vez de campo livre —
  // digitar "T-mobile" onde o ML espera "T-Mobile" e recusa na cara.
  valores: { id: string; nome: string }[];
  dica: string;
};

// O ML nao etiqueta este como formador de variacao, mas trata como tal nas
// categorias de chip. Descoberto na marra em 25/08.
const FORMADORES_EXTRA = new Set(["SIM_CARD_SIZE"]);

function temTag(a: any, tag: string): boolean {
  return !!(a?.tags && Object.prototype.hasOwnProperty.call(a.tags, tag));
}

export async function regrasDaCategoria(
  canalId: string,
  categoriaId: string,
): Promise<RegraAtributo[]> {
  const defs: any[] = await mlFetch(canalId, `/categories/${categoriaId}/attributes`);
  return (Array.isArray(defs) ? defs : []).map((a: any) => {
    const id = String(a?.id ?? "").toUpperCase();
    return {
      id,
      nome: String(a?.name ?? id),
      obrigatorio: temTag(a, "required") || temTag(a, "catalog_required"),
      criaVariacao:
        temTag(a, "variation_attribute") || a?.allow_variations === true || FORMADORES_EXTRA.has(id),
      tipo: String(a?.value_type ?? "string"),
      valores: (a?.values ?? []).slice(0, 60).map((v: any) => ({
        id: String(v?.id ?? ""),
        nome: String(v?.name ?? ""),
      })),
      dica: String(a?.hint ?? ""),
    };
  });
}

export type PedidoPublicacao = {
  canalId: string;
  varianteId: string;
  categoriaId: string;
  titulo: string;
  preco: number;
  listingTypeId: string;
  baseMlb?: string; // de onde copiar as fotos
  atributos: Record<string, string>;
  ensaio: boolean;
};

export type ResultadoPublicacao = {
  ok: boolean;
  erro?: string;
  faltando?: string[];
  bloqueados?: string[];
  corpo?: any;
  anuncio?: string;
  permalink?: string;
  variacoes?: number;
};

export async function publicarVariante(p: PedidoPublicacao): Promise<ResultadoPublicacao> {
  const v = await db.query(
    `select v.id, v.sku, v.publicavel_marketplace, v.modo_entrega::text as modo,
            p.nome as produto, p.descricao, l.livre,
            (select ci.id_externo from canal_item ci
              where ci.variante_id = v.id and ci.canal_id = $2) as ja_publicado
       from variante v
       join produto p on p.id = v.produto_id
       join estoque_livre l on l.variante_id = v.id
      where v.id = $1`,
    [p.varianteId, p.canalId],
  );
  if (v.rows.length === 0) return { ok: false, erro: "variante nao encontrada" };
  const sku = v.rows[0];

  if (!sku.publicavel_marketplace) {
    return { ok: false, erro: `${sku.sku} esta marcado como "${sku.modo}" e nao vai para marketplace.` };
  }
  if (sku.ja_publicado) {
    return {
      ok: false,
      erro: `${sku.sku} ja esta no anúncio ${sku.ja_publicado}. Desvincule antes — um anúncio, um SKU.`,
    };
  }
  if (!(p.preco > 0)) return { ok: false, erro: "informe um preço maior que zero" };

  const regras = await regrasDaCategoria(p.canalId, p.categoriaId);

  const entrada = new Map<string, string>();
  for (const [k, val] of Object.entries(p.atributos ?? {})) {
    const limpo = String(val ?? "").trim();
    if (limpo) entrada.set(String(k).toUpperCase(), limpo);
  }

  const atributos: { id: string; value_name: string }[] = [];
  const faltando: string[] = [];
  const bloqueados: string[] = [];

  for (const r of regras) {
    const valor = entrada.get(r.id);
    if (r.criaVariacao) {
      // Barrado mesmo preenchido. E o que impede o anuncio de virar grade sem
      // ninguem ter pedido isso.
      if (valor) bloqueados.push(`${r.nome} (${r.id})`);
      continue;
    }
    if (valor) atributos.push({ id: r.id, value_name: valor });
    else if (r.obrigatorio) faltando.push(`${r.nome} (${r.id})`);
  }

  if (faltando.length > 0) {
    return { ok: false, erro: "faltam campos que o Mercado Livre exige", faltando, bloqueados };
  }

  // Fotos por id: o ML ja as hospeda. Sem isto seria preciso subir imagem de
  // algum lugar, e nao ha de onde ainda.
  let fotos: any[] = [];
  if (p.baseMlb) {
    try {
      const base: any = await mlFetch(p.canalId, `/items/${p.baseMlb}?attributes=pictures`);
      fotos = (base?.pictures ?? []).map((x: any) => ({ id: x.id })).slice(0, 10);
    } catch {
      // Sem foto o ML costuma recusar, mas quem decide e ele: a mensagem de
      // recusa dele diz mais do que um palpite nosso aqui.
      fotos = [];
    }
  }

  const corpo: any = {
    title: p.titulo.slice(0, 60),
    category_id: p.categoriaId,
    price: Number(p.preco.toFixed(2)),
    currency_id: "BRL",
    available_quantity: Number(sku.livre ?? 0),
    buying_mode: "buy_it_now",
    listing_type_id: p.listingTypeId,
    condition: "new",
    pictures: fotos,
    attributes: atributos,
    // Sem `variations`, de proposito e por escrito.
    shipping: { mode: "me2", local_pick_up: true, free_shipping: false },
  };
  if (sku.descricao) corpo.description = { plain_text: String(sku.descricao).slice(0, 6000) };

  if (p.ensaio) return { ok: true, corpo, bloqueados };

  let novo: any;
  try {
    novo = await mlFetch(p.canalId, "/items", { method: "POST", body: JSON.stringify(corpo) });
  } catch (e: any) {
    return { ok: false, erro: String(e?.message ?? e).slice(0, 600), corpo, bloqueados };
  }

  // O vinculo entra junto: anuncio publicado que ninguem amarrou e anuncio que
  // vende e nao entrega.
  await db.query(
    `insert into canal_item (canal_id, variante_id, id_externo, categoria_externa, status, quantidade_publicada, ultimo_sync)
     values ($1, $2, $3, $4, 'publicado'::status_sync, $5, now())
     on conflict (canal_id, variante_id) do update
        set id_externo = excluded.id_externo,
            categoria_externa = excluded.categoria_externa,
            status = 'publicado'::status_sync,
            quantidade_publicada = excluded.quantidade_publicada,
            ultimo_sync = now(),
            ultimo_erro = null`,
    [p.canalId, p.varianteId, String(novo.id), p.categoriaId, Number(sku.livre ?? 0)],
  );

  await db.query(
    `insert into log_sync (canal_id, entidade, acao, sucesso, detalhe)
     values ($1, 'anuncio', 'ml.anuncio.publicar', true, $2)`,
    [p.canalId, `${sku.sku} -> ${novo.id}`],
  ).catch(() => {});

  return {
    ok: true,
    anuncio: String(novo.id),
    permalink: String(novo.permalink ?? ""),
    variacoes: (novo.variations ?? []).length,
    corpo,
    bloqueados,
  };
}
