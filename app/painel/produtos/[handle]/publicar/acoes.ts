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
// existir anuncio. Assim o trabalho de preencher dez campos nao se perde se a
// pessoa sair da tela, e a proxima republicacao ja vem preenchida.
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

export async function prepararMl(_a: EstadoPublicar, form: FormData): Promise<EstadoPublicar> {
  const u = await usuarioDaSessao();
  if (!u) return { erro: "Sessão expirada. Entre de novo.", ok: "", previa: "" };
  if (!PODE.includes(u.papel)) return { erro: "Seu papel não permite publicar.", ok: "", previa: "" };

  const handle = String(form.get("handle") ?? "");
  const varianteId = String(form.get("variante_id") ?? "").trim();
  const categoria = String(form.get("categoria") ?? "").trim().toUpperCase();
  if (!varianteId) return { erro: "SKU não informado.", ok: "", previa: "" };
  if (!/^MLB\d{3,}$/.test(categoria)) {
    return { erro: 'Categoria inválida. Use o formato MLB seguido de números (ex: MLB270052).', ok: "", previa: "" };
  }

  const canal = await canalMl();
  if (!canal) return { erro: "O canal Mercado Livre não está conectado.", ok: "", previa: "" };

  try {
    await guardarRascunho(canal.id, varianteId, categoria, {});
  } catch (e) {
    console.error("prepararMl:", e);
    return { erro: "Falha ao guardar. Nada foi alterado.", ok: "", previa: "" };
  }

  revalidatePath(`/painel/produtos/${handle}/publicar`);
  return { erro: "", ok: "Categoria escolhida. Os campos que o Mercado Livre exige apareceram abaixo.", previa: "" };
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

  if (!varianteId) return { erro: "SKU não informado.", ok: "", previa: "" };
  if (!titulo) return { erro: "O título é obrigatório.", ok: "", previa: "" };
  if (titulo.length > 60) return { erro: `Título com ${titulo.length} caracteres; o Mercado Livre aceita 60.`, ok: "", previa: "" };
  const preco = Number(precoBruto);
  if (!Number.isFinite(preco) || preco <= 0) return { erro: "Preço inválido.", ok: "", previa: "" };

  const canal = await canalMl();
  if (!canal) return { erro: "O canal Mercado Livre não está conectado.", ok: "", previa: "" };

  const atributos: Record<string, string> = {};
  for (const chave of Array.from(form.keys())) {
    if (!chave.startsWith("attr__")) continue;
    atributos[chave.slice("attr__".length)] = String(form.get(chave) ?? "");
  }

  await guardarRascunho(canal.id, varianteId, categoria, { titulo, preco: precoBruto, tipo, base_mlb: baseMlb, atributos });

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
      ok: "Nada foi publicado — isto é o que seria enviado.",
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

  revalidatePath(`/painel/produtos/${handle}/publicar`);
  revalidatePath(`/painel/produtos/${handle}/canais`);
  revalidatePath("/painel/produtos");

  const aviso = (r.variacoes ?? 0) > 0
    ? " ATENÇÃO: o anúncio nasceu com variação — me avise, isso não deveria acontecer."
    : " Anúncio simples, sem variação.";
  return { erro: "", ok: `Publicado: ${r.anuncio}.${aviso}`, previa: r.permalink ?? "" };
}
