"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../../../../lib/db";
import { auditar, usuarioDaSessao } from "../../../../../lib/painel/sessao";
import type { EstadoVinculo } from "./tipos";

// O de-para entre o nosso SKU e o anuncio do marketplace.
//
// No Bling isso se chama "vinculo pelo ID na Loja", e sem ele nao sincroniza
// preco nem estoque. Aqui e igual: `canal_item.id_externo` guarda o MLB, e o
// par (canal, variante) e a chave.
//
// O MLB NAO vai dentro do SKU. O SKU e nosso e e um so; o MLB e deles e pode
// ser varios — um segundo anuncio do mesmo item, outra conta, a Amazon amanha.
// Colando um no outro, o segundo anuncio nao teria onde morar.
const PODE = ["admin", "operacao"];

// MLB + digitos. Errar o codigo produz um vinculo que parece certo na tela e
// nunca sincroniza nada — o pior tipo de erro, porque nao avisa.
const FORMATO: Record<string, RegExp> = {
  mercadolivre: /^MLB\d{6,}$/,
};

export async function salvarVinculos(_a: EstadoVinculo, form: FormData): Promise<EstadoVinculo> {
  const u = await usuarioDaSessao();
  if (!u) return { erro: "Sessao expirada. Entre de novo.", ok: "" };
  if (!PODE.includes(u.papel)) return { erro: "Seu papel nao permite vincular anuncios.", ok: "" };

  const handle = String(form.get("handle") ?? "");

  const alvos: { canalId: string; varianteId: string }[] = [];
  for (const chave of Array.from(form.keys())) {
    if (!chave.startsWith("vinc__")) continue;
    const [, canalId, varianteId] = chave.split("__");
    if (canalId && varianteId) alvos.push({ canalId, varianteId });
  }
  if (alvos.length === 0) return { erro: "", ok: "Nada para salvar." };

  const c = await db.connect();
  let mudou = 0;
  const registros: { varianteId: string; sku: string; antes: unknown; depois: unknown }[] = [];

  try {
    await c.query("begin");

    for (const a of alvos) {
      const v = await c.query(
        "select sku, publicavel_marketplace, modo_entrega::text as modo from variante where id = $1",
        [a.varianteId],
      );
      if (v.rows.length === 0) continue;
      const sku = v.rows[0].sku;

      const bruto = String(form.get(`ext__${a.canalId}__${a.varianteId}`) ?? "").trim().toUpperCase();
      const categoria = String(form.get(`cat__${a.canalId}__${a.varianteId}`) ?? "").trim().toUpperCase();

      // Mesma regra do CHECK da migracao 008, repetida aqui para o operador ver
      // o motivo na tela em vez de levar um erro de constraint na cara.
      if (bruto && !v.rows[0].publicavel_marketplace) {
        await c.query("rollback");
        return {
          erro: `${sku} esta marcado como "${v.rows[0].modo}" e nao pode ir para marketplace. Tire a marca no cadastro antes.`,
          ok: "",
        };
      }

      const canal = await c.query("select tipo::text as tipo, codigo from canal where id = $1", [a.canalId]);
      if (canal.rows.length === 0) continue;
      const re = FORMATO[canal.rows[0].tipo];
      if (bruto && re && !re.test(bruto)) {
        await c.query("rollback");
        return { erro: `Em ${sku}: "${bruto}" nao parece um codigo do ${canal.rows[0].codigo}. Esperado MLB seguido de numeros.`, ok: "" };
      }

      // Dois SKUs no mesmo anuncio passaria despercebido ate a venda cair no
      // produto errado e o eSIM errado ser entregue.
      if (bruto) {
        const dup = await c.query(
          "select v2.sku from canal_item ci join variante v2 on v2.id = ci.variante_id where ci.canal_id = $1 and upper(ci.id_externo) = $2 and ci.variante_id <> $3",
          [a.canalId, bruto, a.varianteId],
        );
        if (dup.rows.length > 0) {
          await c.query("rollback");
          return { erro: `O anuncio ${bruto} ja esta vinculado a ${dup.rows[0].sku}. Um anuncio, um SKU.`, ok: "" };
        }
      }

      const atual = await c.query(
        "select id_externo, categoria_externa, status::text as status from canal_item where canal_id = $1 and variante_id = $2",
        [a.canalId, a.varianteId],
      );
      const antes = atual.rows[0] ?? null;
      const idNovo = bruto === "" ? null : bruto;
      const catNova = categoria === "" ? null : categoria;

      if (antes && antes.id_externo === idNovo && (antes.categoria_externa ?? null) === catNova) continue;

      // Sem codigo, volta a "nao publicado" em vez de a linha sumir: o
      // `ultimo_erro` da ultima tentativa e justamente o que explica por que
      // alguem desvinculou.
      const statusNovo = idNovo === null ? "nao_publicado" : "publicado";

      if (antes) {
        await c.query(
          "update canal_item set id_externo = $1, categoria_externa = $2, status = $3::status_sync where canal_id = $4 and variante_id = $5",
          [idNovo, catNova, statusNovo, a.canalId, a.varianteId],
        );
      } else {
        if (idNovo === null && catNova === null) continue;
        await c.query(
          "insert into canal_item (canal_id, variante_id, id_externo, categoria_externa, status) values ($1, $2, $3, $4, $5::status_sync)",
          [a.canalId, a.varianteId, idNovo, catNova, statusNovo],
        );
      }
      mudou++;
      registros.push({
        varianteId: a.varianteId, sku,
        antes: antes ? { id_externo: antes.id_externo, categoria: antes.categoria_externa } : null,
        depois: { id_externo: idNovo, categoria: catNova, canal_id: a.canalId },
      });
    }

    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    console.error("salvarVinculos:", e);
    return { erro: "Falha ao salvar. Nada foi alterado.", ok: "" };
  } finally {
    c.release();
  }

  for (const r of registros) {
    await auditar("canal.vinculo.alterar", {
      usuarioId: u.id, entidade: "canal_item", entidadeId: r.varianteId,
      antes: r.antes, depois: { ...(r.depois as object), sku: r.sku },
    });
  }

  revalidatePath(`/painel/produtos/${handle}/canais`);
  revalidatePath("/painel/produtos");

  if (mudou === 0) return { erro: "", ok: "Nada mudou." };
  return { erro: "", ok: `${mudou} vínculo${mudou === 1 ? "" : "s"} salvo${mudou === 1 ? "" : "s"}.` };
}
