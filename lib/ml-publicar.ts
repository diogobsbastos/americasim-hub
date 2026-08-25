import { db } from "./db";
import { mlFetch, tokenDoCanal } from "./mercadolivre";

// Publicar no Mercado Livre, e saber as regras antes de tentar.
//
// POR QUE ISTO E BIBLIOTECA E NAO ROTA
//
// A primeira versao morava dentro de uma rota interna, alcancavel so pelo
// worker e por curl no terminal. Publicar produto e trabalho de quem opera a
// loja, e trabalho de quem opera tem que ser botao na tela.
//
// O QUE O ML COBRA, E ONDE ISSO MORDE
//
// Cada categoria tem sua lista de atributos. Tres grupos importam:
//   - OBRIGATORIOS: sem eles o ML recusa;
//   - FORMADORES DE VARIACAO: preenchidos, fazem o ML criar uma grade e mover
//     o estoque para dentro dela. Um SKU nosso e um anuncio la, entao esses
//     NAO entram, venham de onde vierem;
//   - o resto, opcional.
//
// E ha o que nao esta em lista nenhuma: o formato do CORPO muda conforme a
// categoria tenha ficha tecnica ou nao. Ver `montarCorpo` la embaixo.

export type RegraAtributo = {
  id: string;
  nome: string;
  obrigatorio: boolean;
  criaVariacao: boolean;
  tipo: string;
  valores: { id: string; nome: string }[];
  dica: string;
};

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

// Formato unico, com todos os campos sempre presentes. Escrevi isto como uniao
// discriminada e o build parou em TS2339 — a mesma pedra do porteiro das rotas
// internas, horas antes. Duas vezes no mesmo dia vira regra: funcao interna
// aqui devolve UM formato.
type RespostaPublicacao = { ok: boolean; item: any; erro: string };

// O POST do anuncio, feito na mao para guardar a resposta CRUA.
//
// O mlFetch resume o erro em `message` mais os `message`/`code` da lista
// `cause`. Serve para quase tudo e falhou aqui: o ML devolveu
// "body.invalid_fields" com `cause` VAZIO e o motivo dentro de `error`. Numa
// operacao que cria coisa na loja, a recusa inteira vale mais que a bonita.
async function publicarItem(canalId: string, corpo: any): Promise<RespostaPublicacao> {
  const token = await tokenDoCanal(canalId);
  const r = await fetch("https://api.mercadolibre.com/items", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(corpo),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });

  const bruto = await r.text();

  if (r.ok) {
    try {
      return { ok: true, item: JSON.parse(bruto), erro: "" };
    } catch {
      return { ok: false, item: null, erro: `o ML respondeu ${r.status} com algo que nao e JSON: ${bruto.slice(0, 300)}` };
    }
  }

  let dados: any = null;
  try {
    dados = JSON.parse(bruto);
  } catch {
    /* fica com o texto cru mesmo */
  }

  const causas: string[] = [];
  for (const c of dados?.cause ?? []) {
    const partes = [c?.code, c?.message, c?.department, c?.type]
      .filter((x: any) => typeof x === "string" && x.trim());
    if (partes.length) causas.push(partes.join(" · "));
    else if (c && typeof c === "object") causas.push(JSON.stringify(c));
  }

  // `message` e o titulo ("body.invalid_fields"); `error` costuma trazer a
  // frase que explica. Juntar os dois evita a mensagem que nao diz nada.
  const titulo = String(dados?.message ?? `HTTP ${r.status}`);
  const explicacao = String(dados?.error ?? "");
  const detalhe = causas.length ? causas.join(" | ") : explicacao || bruto.slice(0, 900);
  return { ok: false, item: null, erro: `${titulo} — ${detalhe}` };
}

export type PedidoPublicacao = {
  canalId: string;
  varianteId: string;
  categoriaId: string;
  titulo: string;
  preco: number;
  listingTypeId: string;
  baseMlb?: string;
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
  comoFoi?: string;
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
      erro: `${sku.sku} ja esta no anúncio ${sku.ja_publicado}. Solte o vínculo antes — um anúncio, um SKU.`,
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

  for (const regra of regras) {
    const valor = entrada.get(regra.id);
    if (regra.criaVariacao) {
      if (valor) bloqueados.push(`${regra.nome} (${regra.id})`);
      continue;
    }
    if (valor) atributos.push({ id: regra.id, value_name: valor });
    else if (regra.obrigatorio) faltando.push(`${regra.nome} (${regra.id})`);
  }

  if (faltando.length > 0) {
    return { ok: false, erro: "faltam campos que o Mercado Livre exige", faltando, bloqueados };
  }

  let fotos: any[] = [];
  if (p.baseMlb) {
    try {
      const base: any = await mlFetch(p.canalId, `/items/${p.baseMlb}?attributes=pictures`);
      fotos = (base?.pictures ?? []).map((x: any) => ({ id: x.id })).slice(0, 10);
    } catch {
      fotos = [];
    }
  }

  // DOIS FORMATOS DE CORPO, e a categoria decide qual.
  //
  // Categoria comum: manda `title`, o anuncio se chama o que a gente escreveu.
  // Categoria com FICHA TECNICA: quem monta o titulo e o ML, a partir de
  // `family_name` e dos atributos — e mandar `title` junto e recusado com
  // "The fields [title] are invalid for requested call".
  //
  // Nao ha lista publicada de quais categorias sao de cada tipo, e decorar uma
  // seria descobrir por recusa toda vez que o ML mudasse. Entao: tenta do jeito
  // comum e, se a recusa citar family_name, refaz do outro jeito.
  const familia = (entrada.get("MODEL") || p.titulo).slice(0, 60);

  function montarCorpo(comFamilia: boolean): any {
    const c: any = {
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
    if (comFamilia) c.family_name = familia;
    else c.title = p.titulo.slice(0, 60);
    if (sku.descricao) c.description = { plain_text: String(sku.descricao).slice(0, 6000) };
    return c;
  }

  const corpo = montarCorpo(false);
  if (p.ensaio) return { ok: true, corpo, bloqueados, comoFoi: "com titulo" };

  let comoFoi = "com titulo";
  let usado = corpo;
  let resp = await publicarItem(p.canalId, corpo);

  if (!resp.ok && /family_name/i.test(resp.erro)) {
    comoFoi = "com family_name (categoria de ficha tecnica — o titulo quem monta e o ML)";
    usado = montarCorpo(true);
    resp = await publicarItem(p.canalId, usado);
  }

  if (!resp.ok) {
    // A recusa vai para log_sync ANTES de voltar para a tela: a mensagem na
    // tela some no proximo clique, o registro fica.
    await db.query(
      `insert into log_sync (canal_id, entidade, acao, sucesso, detalhe)
       values ($1, 'anuncio', 'ml.anuncio.publicar', false, $2)`,
      [p.canalId, `${sku.sku} [${comoFoi}]: ${resp.erro}`.slice(0, 4000)],
    ).catch(() => {});
    return { ok: false, erro: resp.erro, corpo: usado, bloqueados, comoFoi };
  }

  const novo = resp.item;

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

  // Qual formato funcionou fica registrado: da proxima vez a gente le em vez de
  // deduzir de novo.
  await db.query(
    `insert into log_sync (canal_id, entidade, acao, sucesso, detalhe)
     values ($1, 'anuncio', 'ml.anuncio.publicar', true, $2)`,
    [p.canalId, `${sku.sku} -> ${novo.id} [${comoFoi}]`],
  ).catch(() => {});

  return {
    ok: true,
    anuncio: String(novo.id),
    permalink: String(novo.permalink ?? ""),
    variacoes: (novo.variations ?? []).length,
    corpo: usado,
    bloqueados,
    comoFoi,
  };
}
