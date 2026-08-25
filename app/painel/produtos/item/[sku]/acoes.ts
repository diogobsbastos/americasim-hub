"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../../../../lib/db";
import { canalMl } from "../../../../../lib/mercadolivre";
import { atualizarEnvio, type TipoEnvio } from "../../../../../lib/ml-envio";
import { auditar, usuarioDaSessao } from "../../../../../lib/painel/sessao";
import type { EstadoPublicar } from "../../[handle]/publicar/tipos";

const PODE = ["admin", "operacao"];

// Soltar o anuncio deste SKU.
//
// Mora aqui, na ficha do proprio SKU, porque era a unica coisa do fluxo que
// obrigava a sair para a tela da familia. O anuncio NAO e apagado no Mercado
// Livre: ele continua la, so deixa de ser o anuncio deste SKU.
//
// 25/08: "onde vende" tem DUAS tabelas — canal_item (o anuncio) e
// canal_variante.visivel (a vitrine). Soltar limpava so a primeira e a lista
// de produtos seguia mostrando o selo ML pela segunda. Agora limpa as duas.
export async function desvincularAnuncio(_a: EstadoPublicar, form: FormData): Promise<EstadoPublicar> {
  const u = await usuarioDaSessao();
  if (!u) return { erro: "Sessão expirada. Entre de novo.", ok: "", previa: "" };
  if (!PODE.includes(u.papel)) return { erro: "Seu papel não permite mexer em anúncios.", ok: "", previa: "" };

  const sku = String(form.get("sku") ?? "").trim();
  const varianteId = String(form.get("variante_id") ?? "").trim();
  if (!varianteId) return { erro: "SKU não informado.", ok: "", previa: "" };

  const canal = await canalMl();
  if (!canal) return { erro: "O canal Mercado Livre não está conectado.", ok: "", previa: "" };

  const r = await db.query(
    `update canal_item
        set id_externo = null, status = 'nao_publicado'::status_sync,
            quantidade_publicada = null, ultimo_erro = null
      where canal_id = $1 and variante_id = $2 and id_externo is not null
      returning id_externo`,
    [canal.id, varianteId],
  );
  if (r.rows.length === 0) return { erro: "Este SKU já estava sem anúncio.", ok: "", previa: "" };

  await db.query(
    `update canal_variante set visivel = false
      where canal_id = $1 and variante_id = $2 and visivel`,
    [canal.id, varianteId],
  );

  await auditar("canal.vinculo.soltar", {
    usuarioId: u.id, entidade: "canal_item", entidadeId: varianteId,
    antes: { id_externo: r.rows[0].id_externo }, depois: null,
  });

  revalidatePath(`/painel/produtos/item/${encodeURIComponent(sku)}/mercado-livre`);
  revalidatePath(`/painel/produtos/item/${encodeURIComponent(sku)}`);
  revalidatePath("/painel/produtos");
  return {
    erro: "",
    ok: `Solto de ${r.rows[0].id_externo}. O anúncio continua no Mercado Livre — pause lá se não for mais usá-lo.`,
    previa: "",
  };
}

// Trocar o envio de um anuncio ja publicado.
export async function corrigirEnvio(_a: EstadoPublicar, form: FormData): Promise<EstadoPublicar> {
  const u = await usuarioDaSessao();
  if (!u) return { erro: "Sessão expirada. Entre de novo.", ok: "", previa: "" };
  if (!PODE.includes(u.papel)) return { erro: "Seu papel não permite mexer em anúncios.", ok: "", previa: "" };

  const sku = String(form.get("sku") ?? "").trim();
  const anuncio = String(form.get("anuncio") ?? "").trim().toUpperCase();
  const envio = String(form.get("envio") ?? "sem_frete") as TipoEnvio;
  if (!/^MLB\d{6,}$/.test(anuncio)) return { erro: "Anúncio inválido.", ok: "", previa: "" };

  const canal = await canalMl();
  if (!canal) return { erro: "O canal Mercado Livre não está conectado.", ok: "", previa: "" };

  let r;
  try {
    r = await atualizarEnvio(canal.id, anuncio, envio);
  } catch (e) {
    console.error("corrigirEnvio:", e);
    return { erro: "Não consegui falar com o Mercado Livre. Nada foi alterado.", ok: "", previa: "" };
  }

  if (!r.ok) {
    // A recusa dele vem inteira: se nao der para alterar, republicar vira
    // decisao com motivo, nao tentativa no escuro.
    return { erro: `O Mercado Livre recusou: ${r.erro}`, ok: "", previa: "" };
  }

  await auditar("canal.anuncio.envio", {
    usuarioId: u.id, entidade: "canal_item", entidadeId: null,
    antes: null, depois: { anuncio, envio },
  });

  revalidatePath(`/painel/produtos/item/${encodeURIComponent(sku)}/mercado-livre`);
  return {
    erro: "",
    ok: envio === "sem_frete"
      ? "Envio alterado: o anúncio não cobra mais frete. Confira na página dele."
      : "Envio alterado para Mercado Envios.",
    previa: "",
  };
}
