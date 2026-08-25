"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../../../../lib/db";
import { canalMl } from "../../../../../lib/mercadolivre";
import { auditar, usuarioDaSessao } from "../../../../../lib/painel/sessao";
import type { EstadoPublicar } from "../../[handle]/publicar/tipos";

const PODE = ["admin", "operacao"];

// Soltar o anuncio deste SKU.
//
// Mora aqui, na ficha do proprio SKU, porque era a unica coisa do fluxo que
// obrigava a sair para a tela da familia — o vaivem que esta pagina existe para
// acabar. O anuncio NAO e apagado no Mercado Livre: ele continua la, so deixa
// de ser o anuncio deste SKU. Apagar anuncio dos outros e decisao deles, na
// casa deles.
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

  await auditar("canal.vinculo.soltar", {
    usuarioId: u.id, entidade: "canal_item", entidadeId: varianteId,
    antes: { id_externo: r.rows[0].id_externo }, depois: null,
  });

  revalidatePath(`/painel/produtos/item/${sku}`);
  revalidatePath("/painel/produtos");
  return {
    erro: "",
    ok: `Solto de ${r.rows[0].id_externo}. O anúncio continua no Mercado Livre — pause lá se não for mais usá-lo.`,
    previa: "",
  };
}
