"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../../lib/db";
import { auditar, usuarioDaSessao } from "../../../lib/painel/sessao";
import type { EstadoForn } from "./tipos";

// De quem a gente compra. Nao e burocracia: sem fornecedor o custo na tela e
// numero declarado, nao apurado — e margem sobre custo declarado orienta anuncio
// errado. Cadastrar e vincular sao operacao do dia a dia, entao admin e operacao.
const PODE = ["admin", "operacao"];

export async function criarFornecedor(_a: EstadoForn, form: FormData): Promise<EstadoForn> {
  const u = await usuarioDaSessao();
  if (!u) return { erro: "Sessao expirada. Entre de novo.", ok: "" };
  if (!PODE.includes(u.papel)) return { erro: "Seu papel nao permite cadastrar fornecedor.", ok: "" };

  const nome = String(form.get("nome") ?? "").trim();
  const contato = String(form.get("contato") ?? "").trim();
  if (!nome) return { erro: "O nome do fornecedor e obrigatorio.", ok: "" };
  if (nome.length > 80) return { erro: "Nome longo demais (maximo 80).", ok: "" };

  // Nome repetido nao e erro de digitacao inocente: dois "T-Mobile" fazem o
  // relatorio de custo por fornecedor somar metade em cada um e mentir nos dois.
  const ja = await db.query("select id from fornecedor where lower(nome) = lower($1)", [nome]);
  if (ja.rows.length > 0) return { erro: `Ja existe um fornecedor chamado ${nome}.`, ok: "" };

  let id = "";
  try {
    const r = await db.query(
      "insert into fornecedor (nome, contato, ativo) values ($1, $2::jsonb, true) returning id",
      [nome, JSON.stringify(contato ? { nota: contato } : {})],
    );
    id = r.rows[0].id;
  } catch (e) {
    console.error("criarFornecedor:", e);
    return { erro: "Falha ao gravar. Nada foi criado.", ok: "" };
  }

  await auditar("fornecedor.criar", {
    usuarioId: u.id,
    entidade: "fornecedor",
    entidadeId: id,
    antes: null,
    depois: { nome },
  });

  revalidatePath("/painel/fornecedores");
  revalidatePath("/painel/produtos");
  return { erro: "", ok: `${nome} cadastrado.` };
}

export async function alternarFornecedor(_a: EstadoForn, form: FormData): Promise<EstadoForn> {
  const u = await usuarioDaSessao();
  if (!u) return { erro: "Sessao expirada. Entre de novo.", ok: "" };
  if (!PODE.includes(u.papel)) return { erro: "Seu papel nao permite isso.", ok: "" };

  const id = String(form.get("id") ?? "");
  if (!id) return { erro: "Fornecedor nao informado.", ok: "" };

  // Desativar em vez de apagar: fornecedor apagado levaria junto a resposta de
  // "de quem veio este lote" em toda compra passada.
  const r = await db.query(
    "update fornecedor set ativo = not ativo where id = $1 returning nome, ativo",
    [id],
  );
  if (r.rowCount === 0) return { erro: "Fornecedor nao encontrado.", ok: "" };

  await auditar("fornecedor.alternar", {
    usuarioId: u.id,
    entidade: "fornecedor",
    entidadeId: id,
    antes: { ativo: !r.rows[0].ativo },
    depois: { ativo: r.rows[0].ativo },
  });

  revalidatePath("/painel/fornecedores");
  return { erro: "", ok: `${r.rows[0].nome} agora esta ${r.rows[0].ativo ? "ativo" : "inativo"}.` };
}

// Vincular varios SKUs de uma vez. Um formulario so, um botao so: obrigar a
// abrir produto por produto para dizer de quem se compra e o tipo de tela que
// ninguem preenche ate o dia em que precisa do dado e ele nao esta la.
export async function vincularSkus(_a: EstadoForn, form: FormData): Promise<EstadoForn> {
  const u = await usuarioDaSessao();
  if (!u) return { erro: "Sessao expirada. Entre de novo.", ok: "" };
  if (!PODE.includes(u.papel)) return { erro: "Seu papel nao permite isso.", ok: "" };

  const alvos: { varianteId: string; fornecedorId: string | null }[] = [];
  for (const chave of Array.from(form.keys())) {
    if (!chave.startsWith("forn__")) continue;
    const varianteId = chave.slice("forn__".length);
    const bruto = String(form.get(chave) ?? "");
    alvos.push({ varianteId, fornecedorId: bruto === "" ? null : bruto });
  }
  if (alvos.length === 0) return { erro: "", ok: "Nada para salvar." };

  const c = await db.connect();
  let mudou = 0;
  const registros: { varianteId: string; sku: string; antes: string | null; depois: string | null }[] = [];

  try {
    await c.query("begin");
    for (const a of alvos) {
      const atual = await c.query("select sku, fornecedor_id from variante where id = $1", [a.varianteId]);
      if (atual.rows.length === 0) continue;
      const antes = atual.rows[0].fornecedor_id;
      if (antes === a.fornecedorId) continue;

      await c.query("update variante set fornecedor_id = $1 where id = $2", [a.fornecedorId, a.varianteId]);
      mudou++;
      registros.push({ varianteId: a.varianteId, sku: atual.rows[0].sku, antes, depois: a.fornecedorId });
    }
    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    console.error("vincularSkus:", e);
    return { erro: "Falha ao salvar. Nada foi alterado.", ok: "" };
  } finally {
    c.release();
  }

  for (const reg of registros) {
    await auditar("produto.fornecedor.alterar", {
      usuarioId: u.id,
      entidade: "variante",
      entidadeId: reg.varianteId,
      antes: { fornecedor_id: reg.antes },
      depois: { fornecedor_id: reg.depois, sku: reg.sku },
    });
  }

  revalidatePath("/painel/fornecedores");
  revalidatePath("/painel/produtos");

  // Contagem, nunca frase vazia: "nada mudou" precisa ser dito, senao a tela
  // silenciosa parece que salvou quando nao salvou.
  if (mudou === 0) return { erro: "", ok: "Nada mudou." };
  return { erro: "", ok: `${mudou} SKU${mudou === 1 ? "" : "s"} atualizado${mudou === 1 ? "" : "s"}.` };
}
