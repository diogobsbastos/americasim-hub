"use server";

// ATENCAO: este arquivo so pode exportar FUNCOES ASSINCRONAS (ver ./tipos.ts).

import { revalidatePath } from "next/cache";
import { db } from "../../../lib/db";
import { darBaixa, STATUS_BAIXA, type StatusBaixa } from "../../../lib/estoque";
import { auditar, usuarioDaSessao } from "../../../lib/painel/sessao";
import { importarLote } from "./[handle]/estoque/acoes";
import type { EstadoAjuste } from "./tipos";

const PODE = ["admin", "operacao"];

// INSERIR pelo popup do saldo = importar lote. E a mesma funcao da tela de
// estoque, sem copia: la mora a cifra, a deduplicacao e o extrato de entrada.
export async function inserirPeloSaldo(_a: EstadoAjuste, form: FormData): Promise<EstadoAjuste> {
  // A importacao exige nome de lote. No popup ele e opcional: se vier vazio,
  // vira "ajuste AAAA-MM-DD" para o extrato nao ficar sem origem.
  if (!String(form.get("lote") ?? "").trim()) {
    form.set("lote", `ajuste ${new Date().toISOString().slice(0, 10)}`);
  }
  const r = await importarLote({ erro: "", ok: "", detalhes: [] }, form);
  return { erro: r.erro, ok: r.ok, detalhes: r.detalhes };
}

// RETIRAR pelo popup = quantidade + motivo. O hub escolhe QUAIS codigos saem:
// os disponiveis de validade mais curta primeiro (o que venceria antes e o que
// menos faz falta), depois os mais antigos. Cada um passa por darBaixa, que
// tem a trava `status = 'disponivel'` dentro do UPDATE e grava o extrato.
export async function retirarPeloSaldo(_a: EstadoAjuste, form: FormData): Promise<EstadoAjuste> {
  const u = await usuarioDaSessao();
  if (!u) return { erro: "Sessão expirada. Entre de novo.", ok: "", detalhes: [] };
  if (!PODE.includes(u.papel)) return { erro: "Seu papel não permite mexer no estoque.", ok: "", detalhes: [] };

  const handle = String(form.get("handle") ?? "").trim();
  const varianteId = String(form.get("variante_id") ?? "").trim();
  const quantidade = Number(String(form.get("quantidade") ?? "").trim());
  const status = String(form.get("status") ?? "").trim() as StatusBaixa;
  const motivo = String(form.get("motivo") ?? "").trim();

  if (!varianteId) return { erro: "SKU não informado.", ok: "", detalhes: [] };
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 500) {
    return { erro: "Quantidade tem que ser um número inteiro entre 1 e 500.", ok: "", detalhes: [] };
  }
  if (!STATUS_BAIXA.includes(status)) return { erro: "Escolha o motivo da retirada.", ok: "", detalhes: [] };

  const escolha = await db.query(
    `select id from estoque_esim
      where variante_id = $1 and status = 'disponivel'
      order by validade asc nulls last, criado_em asc
      limit $2`,
    [varianteId, quantidade],
  );
  const ids: string[] = escolha.rows.map((r: any) => r.id);
  if (ids.length === 0) return { erro: "Não há nenhum código disponível para retirar.", ok: "", detalhes: [] };

  const r = await darBaixa(ids, status, motivo || `retirada pelo saldo (${quantidade})`, u.id);

  await auditar("estoque.retirar.saldo", {
    usuarioId: u.id, entidade: "variante", entidadeId: varianteId,
    depois: { pedidos: quantidade, movidos: r.movidos, status, motivo: motivo || null },
  });

  revalidatePath("/painel/produtos");
  revalidatePath("/painel/estoque");
  if (handle) {
    revalidatePath(`/painel/produtos/${handle}/estoque`);
    revalidatePath(`/painel/produtos/${handle}`);
  }

  const detalhes: string[] = [];
  if (ids.length < quantidade) detalhes.push(`só havia ${ids.length} disponível(is); pediu ${quantidade}.`);
  for (const x of r.recusados) detalhes.push(`um código não saiu: ${x.porque}.`);

  if (r.movidos === 0) return { erro: "Nenhum código saiu.", ok: "", detalhes };
  return {
    erro: "",
    ok: `${r.movidos} código(s) retirado(s) como “${status}”.`,
    detalhes,
  };
}
