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

  const cli: any = await db.connect();
  try {
    await cli.query("begin");

    // Reescreve o array inteiro trocando SO o item do id pedido. `jsonb_set`
    // direto num indice exigiria saber a posicao, e posicao muda quando alguem
    // cria outro usuario.
    const r = await cli.query(
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

    // E no cofre tambem. A etiqueta e barata de refazer, mas se ela so existisse
    // no config, a tela passaria a ler do cofre e mostraria "indefinido" para
    // quem ja foi marcado — exatamente o tipo de divergencia silenciosa entre
    // duas copias que faz ninguem confiar em nenhuma das duas.
    const t = await cli.query(
      `update usuario_teste_ml set papel = $2
        where usuario_id = $1
          and canal_id in (select id from canal where tipo = 'mercadolivre'::tipo_canal)`,
      [id, papel || "indefinido"],
    );

    if (r.rowCount === 0 && t.rowCount === 0) {
      await cli.query("rollback");
      return { erro: "Nao encontrei esse usuario de teste.", ok: "" };
    }

    await cli.query("commit");
  } catch (e) {
    await cli.query("rollback").catch(() => {});
    console.error("definirPapelTeste:", e);
    return { erro: "Falha ao gravar. Nada foi alterado.", ok: "" };
  } finally {
    cli.release();
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
