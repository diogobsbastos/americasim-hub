"use server";

import { revalidatePath } from "next/cache";
import { db } from "../../../lib/db";
import { auditar, usuarioDaSessao } from "../../../lib/painel/sessao";
import type { EstadoMatriz } from "./tipos";

// Acoes da tela de Produtos — SPEC/08 §3.
//
// Quem pode o que (decisao de 18/08): preco e custo mexem em dinheiro, entao
// so `admin`. Visibilidade e destaque sao operacao do dia a dia, entao `admin`
// e `operacao`. Sem isto, qualquer pessoa logada mudava o preco da loja.
//
// Este arquivo carrega a diretiva de servidor no topo: so pode exportar funcao
// assincrona. A constante ESTADO_MATRIZ_INICIAL mora em ./tipos.ts por isso.
const PODE_DINHEIRO = ["admin"];
const PODE_VITRINE = ["admin", "operacao"];

// Dinheiro entra como texto e sai como texto decimal. NUNCA parseFloat: float
// soma errado, e o valor vai para NUMERIC no banco (SPEC/02 §2).
function paraDecimal(v: string): string | null {
  let s = String(v).trim().replace(/\s/g, "").replace(/R\$/gi, "");
  if (!s) return null;
  // "1.234,56" -> "1234.56". Se nao tem virgula, o ponto ja e o decimal.
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;
  return s;
}

export async function salvarMatriz(
  _anterior: EstadoMatriz,
  form: FormData,
): Promise<EstadoMatriz> {
  const u = await usuarioDaSessao();
  if (!u) return { erro: "Sessão expirada. Entre de novo.", ok: "" };

  const handle = String(form.get("handle") ?? "");
  if (!handle) return { erro: "Produto não informado.", ok: "" };

  // Quais celulas vieram no formulario. O nome carrega canal e variante:
  // cel__<canalId>__<varianteId>__<campo>
  const celulas = new Map<string, { canalId: string; varianteId: string }>();
  for (const chave of Array.from(form.keys())) {
    if (!chave.startsWith("cel__")) continue;
    const [, canalId, varianteId] = chave.split("__");
    if (canalId && varianteId) celulas.set(`${canalId}|${varianteId}`, { canalId, varianteId });
  }

  const c = await db.connect();
  let mudancas = 0;
  const auditorias: { acao: string; entidade: string; entidadeId: string; antes: unknown; depois: unknown }[] = [];

  try {
    await c.query("begin");

    // ---- custo por variante (so admin) ------------------------------------
    for (const chave of Array.from(form.keys())) {
      if (!chave.startsWith("custo__")) continue;
      const varianteId = chave.slice("custo__".length);
      const bruto = String(form.get(chave) ?? "");

      const atual = await c.query(
        "select custo::text as custo, custo_moeda, sku from variante where id = $1",
        [varianteId],
      );
      if (atual.rows.length === 0) continue;
      const antes = atual.rows[0].custo;
      const novo = bruto.trim() === "" ? null : paraDecimal(bruto);

      if (bruto.trim() !== "" && novo === null) {
        await c.query("rollback");
        return { erro: `Custo inválido em ${atual.rows[0].sku}: "${bruto}".`, ok: "" };
      }
      // Comparacao como NUMERO seria float; comparar o texto normalizado evita
      // gravar "mudanca" que so existe na formatacao (79.9 x 79.90).
      const antesNorm = antes === null ? null : String(Number(antes).toFixed(4));
      const novoNorm = novo === null ? null : String(Number(novo).toFixed(4));
      if (antesNorm === novoNorm) continue;

      if (!PODE_DINHEIRO.includes(u.papel)) {
        await c.query("rollback");
        return { erro: "Só um administrador pode alterar custo.", ok: "" };
      }

      await c.query("update variante set custo = $1 where id = $2", [novo, varianteId]);
      mudancas++;
      auditorias.push({
        acao: "produto.custo.alterar",
        entidade: "variante",
        entidadeId: varianteId,
        antes: { custo: antes },
        depois: { custo: novo },
      });
    }

    // ---- celulas da matriz -------------------------------------------------
    for (const { canalId, varianteId } of celulas.values()) {
      const pref = `cel__${canalId}__${varianteId}__`;
      // Caixa desmarcada NAO e enviada pelo navegador: a presenca do campo
      // oculto "presente" e o que prova que a celula veio no formulario.
      if (!form.has(`${pref}presente`)) continue;

      const visivel = form.get(`${pref}visivel`) !== null;
      const destaque = form.get(`${pref}destaque`) !== null;
      const precoBruto = String(form.get(`${pref}preco`) ?? "");

      const cvAtual = await c.query(
        "select visivel, destaque from canal_variante where canal_id = $1 and variante_id = $2",
        [canalId, varianteId],
      );
      const antesCv = cvAtual.rows[0] ?? null;

      if (!antesCv || antesCv.visivel !== visivel || antesCv.destaque !== destaque) {
        if (!PODE_VITRINE.includes(u.papel)) {
          await c.query("rollback");
          return { erro: "Você não tem permissão para alterar a vitrine.", ok: "" };
        }
        await c.query(
          `insert into canal_variante (canal_id, variante_id, visivel, destaque)
           values ($1, $2, $3, $4)
           on conflict (canal_id, variante_id)
           do update set visivel = excluded.visivel, destaque = excluded.destaque`,
          [canalId, varianteId, visivel, destaque],
        );
        mudancas++;
        // entidade_id e UUID no banco: o par canal+variante NAO cabe la. O
        // canal vai no payload. Se fosse texto composto, o insert falharia e a
        // auditoria sumiria calada — `auditar` engole o proprio erro de
        // proposito para nao derrubar a acao principal.
        auditorias.push({
          acao: "produto.vitrine.alterar",
          entidade: "canal_variante",
          entidadeId: varianteId,
          antes: antesCv ? { ...antesCv, canal_id: canalId } : null,
          depois: { visivel, destaque, canal_id: canalId },
        });
      }

      // ---- preco: fecha o vigente e abre outro, nunca sobrescreve ----------
      const precoAtual = await c.query(
        `select id, valor::text as valor, moeda from preco
          where variante_id = $1 and canal_id = $2 and vigencia_fim is null`,
        [varianteId, canalId],
      );
      const antesPreco = precoAtual.rows[0] ?? null;
      const novoPreco = precoBruto.trim() === "" ? null : paraDecimal(precoBruto);

      if (precoBruto.trim() !== "" && novoPreco === null) {
        await c.query("rollback");
        return { erro: `Preço inválido: "${precoBruto}".`, ok: "" };
      }
      const antesNorm = antesPreco ? Number(antesPreco.valor).toFixed(2) : null;
      const novoNorm = novoPreco ? Number(novoPreco).toFixed(2) : null;
      if (antesNorm === novoNorm) continue;

      if (!PODE_DINHEIRO.includes(u.papel)) {
        await c.query("rollback");
        return { erro: "Só um administrador pode alterar preço.", ok: "" };
      }

      // O indice unico parcial `preco_vigente_unico` só admite UM preco vigente
      // por variante e canal. Fechar antes de abrir nao e zelo: sem isso o
      // insert e barrado pelo banco.
      if (antesPreco) {
        await c.query("update preco set vigencia_fim = now() where id = $1", [antesPreco.id]);
      }
      if (novoPreco !== null) {
        const moeda = await c.query("select moeda from canal where id = $1", [canalId]);
        await c.query(
          `insert into preco (variante_id, canal_id, valor, moeda, vigencia_inicio)
           values ($1, $2, $3::numeric, $4, now())`,
          [varianteId, canalId, novoPreco, moeda.rows[0]?.moeda ?? "BRL"],
        );
      }
      mudancas++;
      auditorias.push({
        acao: "produto.preco.alterar",
        entidade: "preco",
        entidadeId: varianteId,
        antes: antesPreco ? { valor: antesPreco.valor, canal_id: canalId } : null,
        depois: novoPreco === null ? null : { valor: novoPreco, canal_id: canalId },
      });
    }

    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    console.error("salvarMatriz:", e);
    return { erro: "Falha ao salvar. Nada foi alterado.", ok: "" };
  } finally {
    c.release();
  }

  // Auditoria fora da transacao de negocio: ela nao pode fazer a alteracao
  // voltar atras, e a funcao ja engole o proprio erro (SPEC/08 §12).
  for (const a of auditorias) {
    await auditar(a.acao, { usuarioId: u.id, entidade: a.entidade, entidadeId: a.entidadeId, antes: a.antes, depois: a.depois });
  }

  revalidatePath(`/painel/produtos/${handle}`);
  revalidatePath("/painel/produtos");

  if (mudancas === 0) return { erro: "", ok: "Nada mudou." };
  return { erro: "", ok: `${mudancas} alteraç${mudancas === 1 ? "ão" : "ões"} salva${mudancas === 1 ? "" : "s"} e registrada${mudancas === 1 ? "" : "s"} na auditoria.` };
}
