"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../../../lib/db";
import { auditar, usuarioDaSessao } from "../../../../lib/painel/sessao";
import type { EstadoRegras } from "./tipos";

const PODE = ["admin", "operacao"];
const ACOES_VALIDAS = ["alertar", "pausar_venda", "repor_automatico", "pausar_e_alertar"];

function inteiro(v: string): number | null {
  const s = String(v ?? "").trim();
  if (s === "") return 0;
  if (!/^\d{1,6}$/.test(s)) return null;
  return Number(s);
}

export async function salvarRegras(_a: EstadoRegras, form: FormData): Promise<EstadoRegras> {
  const u = await usuarioDaSessao();
  if (!u) return { erro: "Sessao expirada. Entre de novo.", ok: "" };
  if (!PODE.includes(u.papel)) return { erro: "Seu papel nao permite mexer nos alertas.", ok: "" };

  // O campo oculto `linha__<id>` prova quais variantes vieram no formulario.
  // Caixa desmarcada nao e enviada pelo navegador: sem essa marca, "desativar"
  // seria indistinguivel de "esta variante nem estava na tela".
  const ids: string[] = [];
  for (const chave of Array.from(form.keys())) {
    if (chave.startsWith("linha__")) ids.push(chave.slice("linha__".length));
  }
  if (ids.length === 0) return { erro: "", ok: "Nada para salvar." };

  const c = await db.connect();
  let mudou = 0;
  const registros: { varianteId: string; sku: string; antes: unknown; depois: unknown }[] = [];

  try {
    await c.query("begin");

    for (const id of ids) {
      const v = await c.query("select sku from variante where id = $1", [id]);
      if (v.rows.length === 0) continue;
      const sku = v.rows[0].sku;

      const minimo = inteiro(String(form.get(`min__${id}`) ?? ""));
      const critico = inteiro(String(form.get(`cri__${id}`) ?? ""));
      const acao = String(form.get(`aca__${id}`) ?? "alertar");
      const ativa = form.get(`ati__${id}`) !== null;

      if (minimo === null || critico === null) {
        await c.query("rollback");
        return { erro: `Numero invalido em ${sku}. Use so digitos.`, ok: "" };
      }
      if (!ACOES_VALIDAS.includes(acao)) {
        await c.query("rollback");
        return { erro: `Acao invalida em ${sku}.`, ok: "" };
      }
      // Critico e o patamar mais grave: tem que ser menor ou igual ao minimo.
      // Invertido, a loja pausaria antes de avisar, e o aviso nunca chegaria.
      if (critico > minimo) {
        await c.query("rollback");
        return { erro: `Em ${sku}: o critico (${critico}) nao pode ser maior que o minimo (${minimo}).`, ok: "" };
      }

      // canal_id NULO = regra para todos os canais. Indice unico trata NULL como
      // distinto, entao ON CONFLICT criaria uma linha nova a cada salvamento.
      const atual = await c.query(
        "select id, minimo, critico, acao::text as acao, ativa from regra_estoque where variante_id = $1 and canal_id is null",
        [id],
      );

      if (atual.rows.length === 0) {
        if (minimo === 0 && critico === 0 && acao === "alertar" && !ativa) continue;
        await c.query(
          `insert into regra_estoque (variante_id, canal_id, minimo, critico, acao, ativa)
           values ($1, null, $2, $3, $4::acao_estoque, $5)`,
          [id, minimo, critico, acao, ativa],
        );
        mudou++;
        registros.push({ varianteId: id, sku, antes: null, depois: { minimo, critico, acao, ativa } });
        continue;
      }

      const a = atual.rows[0];
      if (a.minimo === minimo && a.critico === critico && a.acao === acao && a.ativa === ativa) continue;

      await c.query(
        "update regra_estoque set minimo = $1, critico = $2, acao = $3::acao_estoque, ativa = $4 where id = $5",
        [minimo, critico, acao, ativa, a.id],
      );
      mudou++;
      registros.push({
        varianteId: id, sku,
        antes: { minimo: a.minimo, critico: a.critico, acao: a.acao, ativa: a.ativa },
        depois: { minimo, critico, acao, ativa },
      });
    }

    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    console.error("salvarRegras:", e);
    return { erro: "Falha ao salvar. Nada foi alterado.", ok: "" };
  } finally {
    c.release();
  }

  for (const r of registros) {
    await auditar("estoque.regra.alterar", {
      usuarioId: u.id, entidade: "variante", entidadeId: r.varianteId,
      antes: r.antes, depois: { ...(r.depois as object), sku: r.sku },
    });
  }

  revalidatePath("/painel/estoque/alertas");
  revalidatePath("/painel/estoque");

  // Contagem, nunca frase vazia: tela silenciosa parece que salvou quando nao.
  if (mudou === 0) return { erro: "", ok: "Nada mudou." };
  return { erro: "", ok: `${mudou} regra${mudou === 1 ? "" : "s"} salva${mudou === 1 ? "" : "s"}.` };
}
