"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../../../lib/db";
import { auditar, usuarioDaSessao } from "../../../../lib/painel/sessao";
import type { EstadoProduto } from "./tipos";

// Dados do proprio produto: nome, descricao e se esta ativo.
// A descricao ja existia no banco (`produto.descricao`) desde a migracao 001 —
// so nao tinha tela. E ela e o texto que vai para a vitrine e, depois, para o
// anuncio do Mercado Livre.
//
// ATENCAO ao mexer neste arquivo: com "use server" no topo, ele so pode
// exportar funcao assincrona. O tipo e o ESTADO_PRODUTO_INICIAL moram em
// ./tipos.ts justamente por isso — ja quebraram a producao uma vez.

const PODE_EDITAR = ["admin", "operacao"];

export async function salvarProduto(
  _anterior: EstadoProduto,
  form: FormData,
): Promise<EstadoProduto> {
  const u = await usuarioDaSessao();
  if (!u) return { erro: "Sessão expirada. Entre de novo.", ok: "" };
  if (!PODE_EDITAR.includes(u.papel)) {
    return { erro: "Seu papel não permite editar o produto.", ok: "" };
  }

  const handle = String(form.get("handle") ?? "");
  const nome = String(form.get("nome") ?? "").trim();
  const descricao = String(form.get("descricao") ?? "").trim();
  const ativo = form.get("ativo") !== null;

  if (!handle) return { erro: "Produto não informado.", ok: "" };
  if (!nome) return { erro: "O nome não pode ficar vazio.", ok: "" };
  if (nome.length > 200) return { erro: "Nome longo demais (máximo 200).", ok: "" };
  if (descricao.length > 8000) return { erro: "Descrição longa demais (máximo 8000).", ok: "" };

  const atual = await db.query(
    "select id, nome, descricao, ativo from produto where handle = $1",
    [handle],
  );
  if (atual.rows.length === 0) return { erro: "Produto não encontrado.", ok: "" };
  const antes = atual.rows[0];

  const novoDesc = descricao === "" ? null : descricao;
  if (antes.nome === nome && (antes.descricao ?? null) === novoDesc && antes.ativo === ativo) {
    return { erro: "", ok: "Nada mudou." };
  }

  await db.query("update produto set nome = $1, descricao = $2, ativo = $3 where id = $4", [
    nome,
    novoDesc,
    ativo,
    antes.id,
  ]);

  await auditar("produto.editar", {
    usuarioId: u.id,
    entidade: "produto",
    entidadeId: antes.id,
    antes: { nome: antes.nome, descricao: antes.descricao, ativo: antes.ativo },
    depois: { nome, descricao: novoDesc, ativo },
  });

  revalidatePath(`/painel/produtos/${handle}`);
  revalidatePath("/painel/produtos");

  // Tirar do ar um produto que estava vendendo tem efeito na loja, entao
  // aparece no aviso em vez de acontecer calado.
  const aviso = antes.ativo && !ativo ? " O produto saiu do ar em todos os canais." : "";
  return { erro: "", ok: `Salvo e registrado na auditoria.${aviso}` };
}
