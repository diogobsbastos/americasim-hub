import { db } from "./db";
import { mlFetch, tokenDoCanal } from "./mercadolivre";

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
//     mover o estoque para dentro dela;
//   - o resto, opcional.
// Um SKU nosso e um anuncio la. Entao formador de variacao NAO entra.
//
// E ha um quarto grupo que nao esta nessa lista: campos do CORPO do anuncio,
// como `family_name`. Ler metade do contrato e pior que nao ler: da a sensacao
// de ter conferido.

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

// Formato unico, com todos os campos sempre presentes.
//
// Escrevi isto como uniao discriminada e o build parou em TS2339 — a mesma
// pedra em que este projeto ja tinha tropecado horas antes, no porteiro das
// rotas internas. Duas vezes no mesmo dia deixa de ser distracao e vira regra:
// funcao interna aqui devolve UM formato. A elegancia de "quando deu certo nao
// existe erro" custa uma rodada de build cada vez que alguem esquece.
type RespostaPublicacao = { ok: boolean; item: any; erro: string };

// O POST do anuncio, feito na mao para guardar a resposta CRUA.
//
// O mlFetch resume o erro em `message` + os `message`/`code` da lista `cause`.
// Serve para quase tudo e falhou aqui: o ML devolveu "body.invalid_fields" com
// causas sem `message`, e o resumo virou uma frase que nao diz nada. Numa
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

  // Tenta resumir; nao conseguindo, entrega o JSON inteiro. Feio e util vale
  // mais que limpo e mudo.
  const causas: string[] = [];
  for (const c of dados?.cause ?? []) {
    const partes = [c?.code, c?.message, c?.department, c?.type]
      .filter((x: any) => typeof x === "string" && x.trim());
    if (partes.length) causas.push(partes.join(" · "));
    else if (c && typeof c === "object") causas.push(JSON.stringify(c));
  }

  const titulo = String(dados?.message ?? dados?.error ?? `HTTP ${r.status}`);
  const detalhe = causas.length ? causas.join(" | ") : bruto.slice(0, 900);
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

  // `family_name` e o nome da LINHA de produto, nao do anuncio. O modelo ja e
  // exatamente isso; o titulo cobre o caso de nao haver modelo.
  const familia = (entrada.get("MODEL") || p.titulo).slice(0, 60);

  const corpo: any = {
    title: p.titulo.slice(0, 60),
    family_name: familia,
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

  const resp = await publicarItem(p.canalId, corpo);

  if (!resp.ok) {
    // A recusa vai para log_sync ANTES de voltar para a tela: a mensagem na
    // tela some no proximo clique, o registro fica.
    await db.query(
      `insert into log_sync (canal_id, entidade, acao, sucesso, detalhe)
       values ($1, 'anuncio', 'ml.anuncio.publicar', false, $2)`,
      [p.canalId, `${sku.sku}: ${resp.erro}`.slice(0, 4000)],
    ).catch(() => {});
    return { ok: false, erro: resp.erro, corpo, bloqueados };
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
