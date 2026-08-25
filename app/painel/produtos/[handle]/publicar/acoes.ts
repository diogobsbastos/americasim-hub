"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../../../../lib/db";
import { canalMl } from "../../../../../lib/mercadolivre";
import { publicarVariante } from "../../../../../lib/ml-publicar";
import { auditar, usuarioDaSessao } from "../../../../../lib/painel/sessao";
import type { EstadoPublicar } from "./tipos";

// Publicar mexe na loja de verdade e custa tarifa por venda: e decisao de
// admin ou operacao, nunca de quem so consulta.
const PODE = ["admin", "operacao"];

// Guarda o rascunho em canal_item: categoria em `categoria_externa`, o resto em
// `atributos_externos`. A linha nasce sem `id_externo` — e o rascunho antes de
// existir anuncio. Assim o trabalho de preencher os campos nao se perde.
async function guardarRascunho(
  canalId: string,
  varianteId: string,
  categoria: string,
  dados: Record<string, unknown>,
): Promise<void> {
  await db.query(
    `insert into canal_item (canal_id, variante_id, categoria_externa, atributos_externos, status)
     values ($1, $2, $3, $4::jsonb, 'nao_publicado'::status_sync)
     on conflict (canal_id, variante_id) do update
        set categoria_externa = excluded.categoria_externa,
            atributos_externos = coalesce(canal_item.atributos_externos, '{}'::jsonb) || excluded.atributos_externos`,
    [canalId, varianteId, categoria, JSON.stringify(dados)],
  );
}

// Onde este formulario vive hoje. O React 19 limpa o formulario quando a acao
// termina, entao o que reaparece na tela e o que vier do SERVIDOR — e o
// servidor so manda de novo se o caminho for revalidado. Revalidar o caminho
// errado (ou nenhum) e o que fazia os campos sumirem depois da previa.
async function avisarTelas(varianteId: string, handle: string): Promise<void> {
  try {
    const r = await db.query("select sku from variante where id = $1", [varianteId]);
    const sku = String(r.rows[0]?.sku ?? "");
    if (sku) {
      const base = `/painel/produtos/item/${encodeURIComponent(sku)}`;
      revalidatePath(`${base}/mercado-livre`);
      revalidatePath(base);
    }
  } catch (e) {
    console.error("avisarTelas:", e);
  }
  if (handle) revalidatePath(`/painel/produtos/${handle}/publicar`);
  revalidatePath("/painel/produtos");
}

export async function prepararMl(_a: EstadoPublicar, form: FormData): Promise<EstadoPublicar> {
  const u = await usuarioDaSessao();
  if (!u) return { erro: "Sessão expirada. Entre de novo.", ok: "", previa: "" };
  if (!PODE.includes(u.papel)) return { erro: "Seu papel não permite publicar.", ok: "", previa: "" };

  const handle = String(form.get("handle") ?? "");
  const varianteId = String(form.get("variante_id") ?? "").trim();
  const categoria = String(form.get("categoria") ?? "").trim().toUpperCase();
  if (!varianteId) return { erro: "SKU não informado.", ok: "", previa: "" };
  if (!/^MLB\d{3,}$/.test(categoria)) {
    return { erro: "Categoria inválida. Use MLB seguido de números (ex: MLB270052).", ok: "", previa: "" };
  }

  const canal = await canalMl();
  if (!canal) return { erro: "O canal Mercado Livre não está conectado.", ok: "", previa: "" };

  try {
    await guardarRascunho(canal.id, varianteId, categoria, {});
  } catch (e) {
    console.error("prepararMl:", e);
    return { erro: "Falha ao guardar. Nada foi alterado.", ok: "", previa: "" };
  }

  await avisarTelas(varianteId, handle);
  return { erro: "", ok: "Categoria escolhida. Os campos exigidos apareceram abaixo.", previa: "" };
}

export async function publicarNoMl(_a: EstadoPublicar, form: FormData): Promise<EstadoPublicar> {
  const u = await usuarioDaSessao();
  if (!u) return { erro: "Sessão expirada. Entre de novo.", ok: "", previa: "" };
  if (!PODE.includes(u.papel)) return { erro: "Seu papel não permite publicar.", ok: "", previa: "" };

  const handle = String(form.get("handle") ?? "");
  const varianteId = String(form.get("variante_id") ?? "").trim();
  const categoria = String(form.get("categoria") ?? "").trim().toUpperCase();
  const titulo = String(form.get("titulo") ?? "").trim();
  const precoBruto = String(form.get("preco") ?? "").trim().replace(",", ".");
  const tipo = String(form.get("tipo_anuncio") ?? "gold_special").trim();
  const baseMlb = String(form.get("base_mlb") ?? "").trim().toUpperCase();
  // Um botao pede a previa, outro publica. O mesmo formulario serve aos dois —
  // ver e fazer com dados diferentes seria ver uma coisa e publicar outra.
  const ensaio = String(form.get("acao") ?? "ensaio") !== "publicar";

  const atributos: Record<string, string> = {};
  for (const chave of Array.from(form.keys())) {
    if (!chave.startsWith("attr__")) continue;
    atributos[chave.slice("attr__".length)] = String(form.get(chave) ?? "");
  }

  const canal = await canalMl();
  if (!canal) return { erro: "O canal Mercado Livre não está conectado.", ok: "", previa: "" };

  // O rascunho e gravado ANTES de qualquer recusa. Se o titulo estiver longo
  // demais ou o preco errado, o que a pessoa ja digitou nos outros campos tem
  // que sobreviver — senao a mensagem de erro vira punicao.
  if (varianteId) {
    try {
      await guardarRascunho(canal.id, varianteId, categoria, {
        titulo, preco: precoBruto, tipo, base_mlb: baseMlb, atributos,
      });
      await avisarTelas(varianteId, handle);
    } catch (e) {
      console.error("guardarRascunho:", e);
    }
  }

  if (!varianteId) return { erro: "SKU não informado.", ok: "", previa: "" };
  if (!titulo) return { erro: "O título é obrigatório.", ok: "", previa: "" };
  if (titulo.length > 60) {
    return { erro: `Título com ${titulo.length} caracteres; o Mercado Livre aceita 60.`, ok: "", previa: "" };
  }
  const preco = Number(precoBruto);
  if (!Number.isFinite(preco) || preco <= 0) return { erro: "Preço inválido.", ok: "", previa: "" };

  let r;
  try {
    r = await publicarVariante({
      canalId: canal.id,
      varianteId,
      categoriaId: categoria,
      titulo,
      preco,
      listingTypeId: tipo,
      baseMlb: baseMlb || undefined,
      atributos,
      ensaio,
    });
  } catch (e) {
    console.error("publicarNoMl:", e);
    return { erro: "Não consegui falar com o Mercado Livre. Nada foi publicado.", ok: "", previa: "" };
  }

  if (!r.ok) {
    const falta = r.faltando?.length ? ` Faltando: ${r.faltando.join(", ")}.` : "";
    return { erro: `${r.erro ?? "Não deu para publicar."}${falta}`, ok: "", previa: "" };
  }

  if (ensaio) {
    return {
      erro: "",
      ok: "Nada foi publicado — isto é o que seria enviado. Os campos continuam preenchidos.",
      previa: JSON.stringify(r.corpo, null, 2),
    };
  }

  await auditar("canal.anuncio.publicar", {
    usuarioId: u.id,
    entidade: "canal_item",
    entidadeId: varianteId,
    antes: null,
    depois: { anuncio: r.anuncio, categoria, preco, variacoes: r.variacoes ?? 0 },
  });

  await avisarTelas(varianteId, handle);

  const aviso = (r.variacoes ?? 0) > 0
    ? " ATENÇÃO: o anúncio nasceu com variação — me avise, isso não deveria acontecer."
    : " Anúncio simples, sem variação.";
  return { erro: "", ok: `Publicado: ${r.anuncio}.${aviso}`, previa: r.permalink ?? "" };
}
