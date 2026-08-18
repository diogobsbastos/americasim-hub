"use server";

import { revalidatePath } from "next/cache";
import { cifrarCodigo, impressaoCodigo, problemaComAChave } from "../../../../../lib/cripto-esim";
import { db } from "../../../../../lib/db";
import {
  corrigir,
  darBaixa,
  retornarAoEstoque,
  STATUS_BAIXA,
  type CamposCorrigiveis,
  type StatusBaixa,
} from "../../../../../lib/estoque";
import { lerLote, repartirCusto } from "../../../../../lib/lote";
import { auditar, usuarioDaSessao } from "../../../../../lib/painel/sessao";

// Importacao de lote de eSIM — SPEC/02 §3 (estoque) e migracao 003 (custo real).
//
// Cada codigo e uma LINHA, nunca um contador: e isso que impede dois clientes
// receberem o mesmo eSIM. E o custo em BRL entra AQUI, no momento da compra do
// lote, porque e o unico momento em que se sabe quanto foi pago de verdade.
//
// Desde a migracao 005 o codigo entra CIFRADO (AES-256-GCM, lib/cripto-esim).
// O texto claro so existe dentro desta funcao, entre ler o formulario e gravar.

const PODE_IMPORTAR = ["admin", "operacao"];
const PODE_MOVER = ["admin", "operacao"];

export interface EstadoLote {
  erro: string;
  ok: string;
  detalhes: string[];
}

export const ESTADO_LOTE_INICIAL: EstadoLote = { erro: "", ok: "", detalhes: [] };

function recarregar(handle: string): void {
  revalidatePath(`/painel/produtos/${handle}/estoque`);
  revalidatePath(`/painel/produtos/${handle}`);
  revalidatePath("/painel/produtos");
}

export async function importarLote(
  _anterior: EstadoLote,
  form: FormData,
): Promise<EstadoLote> {
  const u = await usuarioDaSessao();
  if (!u) return { erro: "Sessão expirada. Entre de novo.", ok: "", detalhes: [] };
  if (!PODE_IMPORTAR.includes(u.papel)) {
    return { erro: "Seu papel não permite importar estoque.", ok: "", detalhes: [] };
  }

  // Conferir a chave ANTES de qualquer outra coisa. Sem ela nada pode ser
  // gravado — e o operador precisa ver o motivo em portugues, na tela, em vez
  // de um 500 generico depois de ele ter colado 200 códigos no formulário.
  const semChave = problemaComAChave();
  if (semChave) {
    return {
      erro: "O servidor não está com a chave de cifra do eSIM configurada. Nada foi importado.",
      ok: "",
      detalhes: [semChave],
    };
  }

  const handle = String(form.get("handle") ?? "");
  const varianteId = String(form.get("variante_id") ?? "");
  const lote = String(form.get("lote") ?? "").trim();
  const custoTotal = String(form.get("custo_total") ?? "").trim();
  const cambio = String(form.get("cambio") ?? "").trim();
  const operadora = String(form.get("operadora") ?? "").trim();
  const validade = String(form.get("validade") ?? "").trim();
  const texto = String(form.get("codigos") ?? "");

  if (!varianteId) return { erro: "Escolha a variante.", ok: "", detalhes: [] };
  if (!lote) return { erro: "Dê um nome ao lote — é ele que liga isto à nota do fornecedor.", ok: "", detalhes: [] };

  const parse = lerLote(texto);
  if (parse.linhas.length === 0) {
    return { erro: "Nenhum código válido no texto.", ok: "", detalhes: parse.erros.slice(0, 20) };
  }
  // Linha ruim NAO passa despercebida: importar um lote pela metade sem avisar
  // e cliente pagando e nao recebendo, semanas depois, sem ninguem entender.
  if (parse.erros.length > 0) {
    return {
      erro: `${parse.erros.length} linha(s) com problema. Corrija e reenvie — nada foi importado.`,
      ok: "",
      detalhes: parse.erros.slice(0, 20),
    };
  }

  let custos: string[] | null = null;
  if (custoTotal) {
    const s = custoTotal.includes(",") ? custoTotal.replace(/\./g, "").replace(",", ".") : custoTotal;
    custos = repartirCusto(s, parse.linhas.length);
    if (!custos) return { erro: `Custo total inválido: "${custoTotal}".`, ok: "", detalhes: [] };
  }

  let cambioNum: string | null = null;
  if (cambio) {
    const s = cambio.includes(",") ? cambio.replace(/\./g, "").replace(",", ".") : cambio;
    if (!/^\d{1,4}(\.\d{1,6})?$/.test(s) || Number(s) <= 0) {
      return { erro: `Câmbio inválido: "${cambio}".`, ok: "", detalhes: [] };
    }
    cambioNum = s;
  }

  let validadeData: string | null = null;
  if (validade) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(validade)) {
      return { erro: `Validade inválida: "${validade}".`, ok: "", detalhes: [] };
    }
    validadeData = validade;
  }

  const c = await db.connect();
  let inseridos = 0;
  let repetidos = 0;
  const novos: string[] = [];

  try {
    await c.query("begin");

    const v = await c.query("select sku from variante where id = $1", [varianteId]);
    if (v.rows.length === 0) {
      await c.query("rollback");
      return { erro: "Variante não encontrada.", ok: "", detalhes: [] };
    }

    for (let i = 0; i < parse.linhas.length; i++) {
      const l = parse.linhas[i];
      // Duas redes, porque uma so nao cobre. O UNIQUE parcial de iccid barra o
      // mesmo lote importado duas vezes; mas lote de operadora nem sempre vem
      // com ICCID, entao conferimos tambem pelo proprio codigo.
      //
      // A conferencia do codigo e pela IMPRESSAO DIGITAL, nao pelo bytea: com a
      // cifra, o mesmo codigo gera bytea diferente a cada gravacao, e
      // `where codigo_lpa = $1` nunca mais encontraria nada.
      const impressao = impressaoCodigo(l.lpa);

      // A segunda metade do OR e a ponte da transicao para as linhas legadas em
      // texto claro. Ela se apaga sozinha quando nao sobrar nenhuma.
      const jaExiste = await c.query(
        `select 1 from estoque_esim
          where codigo_hash = $1
             or (cifrado = false and codigo_lpa = $2)
          limit 1`,
        [impressao, Buffer.from(l.lpa, "utf8")],
      );
      if (jaExiste.rows.length > 0) {
        repetidos++;
        continue;
      }

      const r = await c.query(
        `insert into estoque_esim
           (variante_id, codigo_lpa, codigo_hash, cifrado, iccid, operadora, validade,
            custo_brl, custo_moeda, cambio_compra, lote)
         values ($1, $2, $3, true, $4, $5, $6::date, $7::numeric, 'BRL', $8::numeric, $9)
         on conflict (iccid) where iccid is not null do nothing
         returning id`,
        [
          varianteId,
          cifrarCodigo(l.lpa),
          impressao,
          l.iccid,
          operadora || null,
          validadeData,
          custos ? custos[i] : null,
          cambioNum,
          lote,
        ],
      );
      if (r.rows.length > 0) {
        inseridos++;
        novos.push(r.rows[0].id);
      } else {
        repetidos++;
      }
    }

    // Entrada tambem e movimento: sem isto o extrato de uma linha comeca no meio
    // da historia, e a primeira pergunta de qualquer conferencia e "de onde este
    // codigo veio?".
    for (const id of novos) {
      await c.query(
        `insert into movimento_estoque
           (estoque_id, tipo, status_antes, status_depois, motivo, usuario_id)
         values ($1, 'entrada', null, 'disponivel', $2, $3)`,
        [id, `importação do lote "${lote}"`, u.id],
      );
    }

    await c.query("commit");
  } catch (e: any) {
    await c.query("rollback").catch(() => {});
    console.error("importarLote:", e);
    if (e?.code === "23505" && String(e?.constraint ?? "").includes("codigo_hash")) {
      return {
        erro: "Um destes códigos já entrou no estoque enquanto esta importação rodava. Nada foi gravado — reenvie.",
        ok: "",
        detalhes: [],
      };
    }
    return { erro: "Falha ao importar. Nada foi gravado.", ok: "", detalhes: [String(e?.message ?? "")] };
  } finally {
    c.release();
  }

  // O codigo LPA NUNCA entra na auditoria: ela e consultavel por mais gente do
  // que o proprio estoque, e o codigo E o produto (SPEC/08 §12).
  await auditar("estoque.lote.importar", {
    usuarioId: u.id,
    entidade: "variante",
    entidadeId: varianteId,
    depois: { lote, inseridos, repetidos, custo_total: custoTotal || null, cambio: cambioNum },
  });

  recarregar(handle);

  const partes = [`${inseridos} código(s) importado(s) no lote "${lote}"`];
  if (repetidos > 0) partes.push(`${repetidos} já existia(m) no estoque e foi(ram) ignorado(s)`);
  if (parse.duplicadosNoTexto > 0) partes.push(`${parse.duplicadosNoTexto} repetido(s) dentro do próprio texto`);
  if (custos) partes.push(`custo unitário ≈ R$ ${custos[0].replace(".", ",")}`);

  return { erro: "", ok: partes.join(" · "), detalhes: [] };
}

// ============================================================================
// Movimentacao: retirar, devolver ao estoque e corrigir (migracao 006).
//
// O que o Bling chama de "retirar estoque" nao existe aqui como subtracao de um
// numero. Cada codigo e uma linha, entao a pergunta nao e "quantos tirar" e sim
// "tirar QUAL, e por que". O motivo vira status, e o par (status, motivo) fica
// no extrato da linha.
// ============================================================================

export interface EstadoMovimento {
  erro: string;
  ok: string;
  detalhes: string[];
}

export const ESTADO_MOVIMENTO_INICIAL: EstadoMovimento = { erro: "", ok: "", detalhes: [] };

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
        `${r.movidos} código(s) baixado(s) como "${status}".` +
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
