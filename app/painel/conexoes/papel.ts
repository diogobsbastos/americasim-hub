"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../../lib/db";
import { auditar, usuarioDaSessao } from "../../../lib/painel/sessao";
import type { EstadoPapel } from "./papel-tipos";

// Quem e vendedor e quem e comprador entre os usuarios de teste.
//
// Os apelidos sao TESTUSER + 19 digitos. Sem etiqueta ninguem decora qual e
// qual, e errar aqui significa autorizar o hub na conta errada — falha que so
// aparece la na frente, quando a compra de teste nao funciona e ninguem sabe
// por que.
const PODE = ["admin"];
const VALIDOS = ["", "vendedor", "comprador"];

export async function definirPapelTeste(_a: EstadoPapel, form: FormData): Promise<EstadoPapel> {
  const u = await usuarioDaSessao();
  if (!u) return { erro: "Sessao expirada. Entre de novo.", ok: "" };
  if (!PODE.includes(u.papel)) return { erro: "So um admin mexe nos usuarios de teste.", ok: "" };

  const id = String(form.get("id") ?? "").trim();
  const papel = String(form.get("papel") ?? "").trim();
  if (!id) return { erro: "Usuario nao informado.", ok: "" };
  if (!VALIDOS.includes(papel)) return { erro: "Papel invalido.", ok: "" };

  try {
    // Reescreve o array inteiro trocando SO o item do id pedido. `jsonb_set`
    // direto num indice exigiria saber a posicao, e posicao muda quando alguem
    // cria outro usuario.
    const r = await db.query(
      `update canal
          set config = jsonb_set(
                config, '{usuarios_teste}',
                coalesce((
                  select jsonb_agg(
                           case when x->>'id' = $1
                                then x || jsonb_build_object('papel', $2::text)
                                else x end)
                    from jsonb_array_elements(config->'usuarios_teste') x
                ), '[]'::jsonb))
        where tipo = 'mercadolivre'::tipo_canal
          and jsonb_typeof(config->'usuarios_teste') = 'array'`,
      [id, papel],
    );
    if (r.rowCount === 0) return { erro: "Nao encontrei a lista de usuarios de teste.", ok: "" };
  } catch (e) {
    console.error("definirPapelTeste:", e);
    return { erro: "Falha ao gravar. Nada foi alterado.", ok: "" };
  }

  await auditar("conexao.teste.papel", {
    usuarioId: u.id,
    entidade: "canal",
    entidadeId: null,
    antes: null,
    depois: { usuario_teste: id, papel: papel || null },
  });

  revalidatePath("/painel/conexoes");
  return { erro: "", ok: papel ? `Marcado como ${papel}.` : "Papel removido." };
}
