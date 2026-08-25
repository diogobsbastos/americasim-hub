import { db } from "../../../../../lib/db";
import { canalMl, mlFetch } from "../../../../../lib/mercadolivre";
import { conferirSegredo } from "../../segredo";

export const dynamic = "force-dynamic";

// POST /v1/interno/ml/publicar
//   {
//     "variante_id": "...",
//     "categoria_id": "MLB270052",
//     "preco": "50.00",              // opcional: cai no preco da vitrine
//     "titulo": "...",               // opcional: cai no nome do produto
//     "base_mlb": "MLB5126976949",   // opcional: de onde copiar fotos e atributos
//     "listing_type_id": "gold_special",
//     "ensaio": true                 // devolve o corpo sem publicar
//   }
//
// POR QUE PUBLICAR PELA API, E NAO PELO FORMULARIO
//
// O formulario do ML oferece campos opcionais como se fossem parte do fluxo, e
// alguns deles mudam a NATUREZA do anuncio. Foi assim que MLB5126976949 ganhou
// uma variacao: o formulario ofereceu "Tamanho do cartao SIM", o campo foi
// preenchido, e o ML moveu o estoque para dentro de uma variacao — passando a
// recusar qualquer mudanca de quantidade no item.
//
// A categoria nunca exigiu aquilo. Os obrigatorios de MLB270052 sao tres:
// BRAND, MODEL e ISSUING_COMPANY. O resto foi oferecido, nao pedido.
//
// Pela API o corpo e nosso: entra o que mandarmos, e nada alem disso.

type Atributo = { id: string; value_name: string };

async function registrar(canalId: string | null, acao: string, sucesso: boolean, detalhe: string) {
  try {
    await db.query(
      `insert into log_sync (canal_id, entidade, acao, sucesso, detalhe)
       values ($1, 'anuncio', $2, $3, $4)`,
      [canalId, acao, sucesso, detalhe.slice(0, 900)],
    );
  } catch (e) {
    console.error("registrar:", e);
  }
}

export async function POST(req: Request) {
  const porta = await conferirSegredo(req);
  if (!porta.ok) return Response.json({ erro: porta.motivo }, { status: porta.status });

  let c: any = null;
  try {
    c = await req.json();
  } catch {
    return Response.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const varianteId = String(c?.variante_id ?? "").trim();
  const categoriaId = String(c?.categoria_id ?? "").trim().toUpperCase();
  const baseMlb = String(c?.base_mlb ?? "").trim().toUpperCase();
  const tipoAnuncio = String(c?.listing_type_id ?? "gold_special").trim();
  const ensaio = c?.ensaio !== false; // publicar exige dizer ensaio:false. Silencio nao publica.

  if (!varianteId) return Response.json({ erro: "informe variante_id" }, { status: 400 });
  if (!/^MLB\d+$/.test(categoriaId)) return Response.json({ erro: "categoria_id invalido" }, { status: 400 });

  const canal = await canalMl();
  if (!canal) return Response.json({ erro: "canal mercadolivre nao existe" }, { status: 409 });

  // ---------------------------------------------------------------- o SKU
  const v = await db.query(
    `select v.id, v.sku, v.atributos, v.publicavel_marketplace, v.modo_entrega::text as modo,
            p.nome as produto, p.descricao, l.livre,
            (select pr.valor::text from preco pr
              where pr.variante_id = v.id and pr.vigencia_fim is null
              order by pr.valor desc limit 1) as preco_vitrine,
            (select ci.id_externo from canal_item ci
              where ci.variante_id = v.id and ci.canal_id = $2) as ja_publicado
       from variante v
       join produto p on p.id = v.produto_id
       join estoque_livre l on l.variante_id = v.id
      where v.id = $1`,
    [varianteId, canal.id],
  );
  if (v.rows.length === 0) return Response.json({ erro: "variante nao encontrada" }, { status: 404 });
  const sku = v.rows[0];

  if (!sku.publicavel_marketplace) {
    return Response.json(
      { erro: `${sku.sku} esta marcado como "${sku.modo}" e nao vai para marketplace.` },
      { status: 409 },
    );
  }
  if (sku.ja_publicado) {
    return Response.json(
      { erro: `${sku.sku} ja esta vinculado ao anuncio ${sku.ja_publicado}. Desvincule antes de publicar outro — um anuncio, um SKU.` },
      { status: 409 },
    );
  }

  const preco = Number(c?.preco ?? sku.preco_vitrine ?? 0);
  if (!(preco > 0)) {
    return Response.json(
      { erro: "sem preco: informe `preco` ou cadastre um preco vigente para este SKU" },
      { status: 409 },
    );
  }

  // ------------------------------------------------- as regras da categoria
  const defs: any[] = await mlFetch(canal.id, `/categories/${categoriaId}/attributes`);
  const obrigatorios = defs.filter((a) => a?.tags && Object.hasOwn(a.tags, "required"));

  // Atributo que a categoria trata como formador de variacao NAO entra, venha de
  // onde vier. E o que garante "um SKU, um anuncio": sem ele, o ML cria a gaveta
  // e a quantidade sai do nosso alcance.
  const criamVariacao = new Set(
    defs
      .filter((a) => (a?.tags && Object.hasOwn(a.tags, "variation_attribute")) || a?.allow_variations === true)
      .map((a) => String(a.id)),
  );
  // O ML tambem trata este como formador de grade em categorias de chip, mesmo
  // sem a etiqueta. Foi ele que criou a variacao em MLB5126976949.
  criamVariacao.add("SIM_CARD_SIZE");

  // ------------------------------------------------ o que copiar do anuncio
  let fotos: any[] = [];
  const vindos = new Map<string, string>();
  for (const a of (Array.isArray(c?.atributos) ? c.atributos : []) as Atributo[]) {
    if (a?.id && a?.value_name) vindos.set(String(a.id).toUpperCase(), String(a.value_name));
  }

  if (baseMlb) {
    const base: any = await mlFetch(canal.id, `/items/${baseMlb}?attributes=pictures,attributes,title`);
    // Fotos por id: o ML ja as tem hospedadas. Republicar sem isso obrigaria a
    // subir imagem de algum lugar, e nao ha de onde.
    fotos = (base?.pictures ?? []).map((p: any) => ({ id: p.id })).slice(0, 10);
    for (const a of base?.attributes ?? []) {
      const id = String(a?.id ?? "").toUpperCase();
      const valor = String(a?.value_name ?? "").trim();
      if (!id || !valor) continue;
      if (vindos.has(id)) continue; // o que veio no pedido manda
      vindos.set(id, valor);
    }
  }

  // Monta so o que a categoria pede, e nada do que cria variacao. Copiar os 58
  // atributos do anuncio antigo traria de volta justamente o problema.
  const atributos: Atributo[] = [];
  const faltando: string[] = [];
  for (const def of obrigatorios) {
    const id = String(def.id).toUpperCase();
    if (criamVariacao.has(id)) continue;
    const valor = vindos.get(id);
    if (valor) atributos.push({ id, value_name: valor });
    else faltando.push(`${def.name} (${id})`);
  }

  if (faltando.length > 0) {
    return Response.json(
      {
        erro: "faltam atributos obrigatorios desta categoria",
        faltando,
        dica: "passe em `atributos` ou use `base_mlb` para copiar de um anuncio existente",
      },
      { status: 422 },
    );
  }

  const bloqueados = [...vindos.keys()].filter((id) => criamVariacao.has(id));

  const corpo: any = {
    title: String(c?.titulo ?? `${sku.produto} ${sku.sku}`).slice(0, 60),
    category_id: categoriaId,
    price: Number(preco.toFixed(2)),
    currency_id: "BRL",
    available_quantity: Number(sku.livre ?? 0),
    buying_mode: "buy_it_now",
    listing_type_id: tipoAnuncio,
    condition: "new",
    pictures: fotos,
    attributes: atributos,
    // Sem `variations`. E o ponto do exercicio.
    shipping: { mode: "me2", local_pick_up: true, free_shipping: false },
  };
  if (sku.descricao) corpo.description = { plain_text: String(sku.descricao).slice(0, 6000) };

  if (ensaio) {
    return Response.json({
      ok: true,
      ensaio: true,
      corpo,
      bloqueados,
      obrigatorios_da_categoria: obrigatorios.map((a) => `${a.name} (${a.id})`),
      aviso: "nada foi publicado. Para publicar de verdade, mande ensaio:false",
    });
  }

  // ------------------------------------------------------------- publicar
  let novo: any;
  try {
    novo = await mlFetch(canal.id, "/items", { method: "POST", body: JSON.stringify(corpo) });
  } catch (e: any) {
    const msg = String(e?.message ?? e).slice(0, 600);
    await registrar(canal.id, "ml.anuncio.publicar", false, `${sku.sku}: ${msg}`);
    return Response.json({ ok: false, erro: msg, corpo }, { status: 502 });
  }

  // O vinculo entra na MESMA operacao logica: anuncio publicado que ninguem
  // amarrou e um anuncio que vende e nao entrega.
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
    [canal.id, varianteId, String(novo.id), categoriaId, Number(sku.livre ?? 0)],
  );

  await registrar(canal.id, "ml.anuncio.publicar", true, `${sku.sku} -> ${novo.id} (${novo.permalink ?? ""})`);

  return Response.json({
    ok: true,
    anuncio: novo.id,
    permalink: novo.permalink,
    variacoes: (novo.variations ?? []).length,
    quantidade: novo.available_quantity,
    vinculado_a: sku.sku,
  });
}
