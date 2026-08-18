"use server";

// ATENCAO: este arquivo so pode exportar FUNCOES ASSINCRONAS.
// Constante exportada daqui chega como `undefined` no componente de cliente, o
// `useActionState` comeca com undefined, e a primeira leitura de
// `estado.detalhes.length` derruba a pagina inteira em producao — sem o build
// reclamar de nada. Os estados iniciais moram em ./tipos.ts.
// (Foi exatamente o que aconteceu em 18/08/2026 com a tela de estoque.)

import { revalidatePath } from "next/cache";
import {
  corrigir,
  darBaixa,
  retornarAoEstoque,
  STATUS_BAIXA,
  type CamposCorrigiveis,
  type StatusBaixa,
} from "../../../lib/estoque";
import { auditar, usuarioDaSessao } from "../../../lib/painel/sessao";
import type { EstadoMovimento } from "./tipos";

const PODE_MOVER = ["admin", "operacao"];

// `handle` vazio = veio da tela geral /painel/estoque, que nao esta dentro de
// nenhum produto. Nesse caso so os caminhos gerais sao revalidados.
function recarregar(handle: string): void {
  revalidatePath("/painel/estoque");
  revalidatePath("/painel/produtos");
  if (handle) {
    revalidatePath(`/painel/produtos/${handle}/estoque`);
    revalidatePath(`/painel/produtos/${handle}`);
  }
}

// ============================================================================
// Movimentacao: retirar, devolver ao estoque e corrigir (migracao 006).
//
// O que o Bling chama de "retirar estoque" nao existe aqui como subtracao de um
// numero. Cada codigo e uma linha, entao a pergunta nao e "quantos tirar" e sim
// "tirar QUAL, e por que". O motivo vira status, e o par (status, motivo) fica
// no extrato da linha.
// ============================================================================

async function autorizar(): Promise<{ id: string; papel: string } | EstadoMovimento> {
  const u = await usuarioDaSessao();
  if (!u) return { erro: "Sessão expirada. Entre de novo.", ok: "", detalhes: [] };
  if (!PODE_MOVER.includes(u.papel)) {
    return { erro: "Seu papel não permite mexer no estoque.", ok: "", detalhes: [] };
  }
  return { id: u.id, papel: u.papel };
}

// Mostra no maximo 10 recusas. Uma lista de 300 linhas vermelhas nao e mais
// informacao, e so ruido que o operador para de ler.
function detalharRecusas(recusados: { id: string; porque: string }[]): string[] {
  const d = recusados.slice(0, 10).map((r) => `${r.id.slice(0, 8)}… — ${r.porque}`);
  if (recusados.length > 10) d.push(`e mais ${recusados.length - 10}…`);
  return d;
}

export async function darBaixaAcao(
  _anterior: EstadoMovimento,
  form: FormData,
): Promise<EstadoMovimento> {
  const u = await autorizar();
  if ("erro" in u) return u;

  const handle = String(form.get("handle") ?? "");
  const ids = form.getAll("ids").map((x) => String(x));
  const status = String(form.get("status") ?? "") as StatusBaixa;
  const motivo = String(form.get("motivo") ?? "");

  if (ids.length === 0) return { erro: "Selecione pelo menos um código.", ok: "", detalhes: [] };
  if (!STATUS_BAIXA.includes(status)) {
    return { erro: "Escolha o motivo da baixa.", ok: "", detalhes: [] };
  }

  try {
    const r = await darBaixa(ids, status, motivo, u.id);
    await auditar("estoque.baixa", {
      usuarioId: u.id,
      entidade: "estoque_esim",
      // entidade_id e UUID: mandar "3 codigos" faria o insert falhar e a
      // auditoria sumir calada. Com varios alvos, a lista vai no `depois`.
      entidadeId: ids.length === 1 ? ids[0] : null,
      depois: { status, motivo, pedidos: ids.length, baixados: r.movidos, recusados: r.recusados.length },
    });
    recarregar(handle);

    if (r.movidos === 0) {
      return { erro: "Nenhum código saiu do estoque.", ok: "", detalhes: detalharRecusas(r.recusados) };
    }
    return {
      erro: "",
      ok:
        `${r.movidos} código(s) retirado(s) como "${status}".` +
        (r.recusados.length ? ` ${r.recusados.length} recusado(s).` : ""),
      detalhes: detalharRecusas(r.recusados),
    };
  } catch (e: any) {
    console.error("darBaixaAcao:", e);
    return { erro: "Falha ao dar baixa. Nada foi alterado.", ok: "", detalhes: [String(e?.message ?? "")] };
  }
}

export async function retornarAcao(
  _anterior: EstadoMovimento,
  form: FormData,
): Promise<EstadoMovimento> {
  const u = await autorizar();
  if ("erro" in u) return u;

  const handle = String(form.get("handle") ?? "");
  const ids = form.getAll("ids").map((x) => String(x));
  const motivo = String(form.get("motivo") ?? "");
  if (ids.length === 0) return { erro: "Selecione pelo menos um código.", ok: "", detalhes: [] };

  try {
    const r = await retornarAoEstoque(ids, motivo, u.id);
    await auditar("estoque.retorno", {
      usuarioId: u.id,
      entidade: "estoque_esim",
      entidadeId: ids.length === 1 ? ids[0] : null,
      depois: { motivo, pedidos: ids.length, devolvidos: r.movidos, recusados: r.recusados.length },
    });
    recarregar(handle);

    if (r.movidos === 0) {
      return { erro: "Nenhum código voltou ao estoque.", ok: "", detalhes: detalharRecusas(r.recusados) };
    }
    return {
      erro: "",
      ok:
        `${r.movidos} código(s) de volta como disponível.` +
        (r.recusados.length ? ` ${r.recusados.length} recusado(s).` : ""),
      detalhes: detalharRecusas(r.recusados),
    };
  } catch (e: any) {
    console.error("retornarAcao:", e);
    return { erro: "Falha ao devolver ao estoque. Nada foi alterado.", ok: "", detalhes: [String(e?.message ?? "")] };
  }
}

export async function corrigirAcao(
  _anterior: EstadoMovimento,
  form: FormData,
): Promise<EstadoMovimento> {
  const u = await autorizar();
  if ("erro" in u) return u;

  const handle = String(form.get("handle") ?? "");
  const ids = form.getAll("ids").map((x) => String(x));
  const motivo = String(form.get("motivo") ?? "");
  if (ids.length === 0) return { erro: "Selecione pelo menos um código.", ok: "", detalhes: [] };

  // Campo em branco significa "nao mexe neste campo", nunca "apaga o valor".
  // Apagar por omissao seria o operador zerar a validade de 200 codigos sem
  // querer, so por ter clicado em Aplicar com o formulario vazio.
  const campos: CamposCorrigiveis = {};
  for (const c of ["operadora", "validade", "lote", "custo_brl"] as const) {
    const v = String(form.get(c) ?? "").trim();
    if (v !== "") campos[c] = v;
  }
  if (Object.keys(campos).length === 0) {
    return {
      erro: "Preencha ao menos um campo para corrigir. Campo em branco não altera nada.",
      ok: "",
      detalhes: [],
    };
  }

  try {
    const r = await corrigir(ids, campos, motivo, u.id, u.papel === "admin");
    await auditar("estoque.corrigir", {
      usuarioId: u.id,
      entidade: "estoque_esim",
      entidadeId: ids.length === 1 ? ids[0] : null,
      depois: { campos: Object.keys(campos), motivo, alvos: ids.length, alterados: r.alterados },
    });
    recarregar(handle);
    return {
      erro: "",
      ok: `${r.alterados} código(s) corrigido(s): ${Object.keys(campos).join(", ")}.`,
      detalhes: [],
    };
  } catch (e: any) {
    console.error("corrigirAcao:", e);
    // Erro de validacao e de papel sao mensagens escritas para o operador ler —
    // engoli-las num "falha generica" faria ele tentar de novo do mesmo jeito.
    return { erro: String(e?.message ?? "Falha ao corrigir. Nada foi alterado."), ok: "", detalhes: [] };
  }
}
