"use server";

import { revalidatePath } from "next/cache";
import { cifrarCodigo, impressaoCodigo, problemaComAChave } from "../../../../../lib/cripto-esim";
import { db } from "../../../../../lib/db";
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

export interface EstadoLote {
  erro: string;
  ok: string;
  detalhes: string[];
}

export const ESTADO_LOTE_INICIAL: EstadoLote = { erro: "", ok: "", detalhes: [] };

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
    return {
      erro: "Nenhum código válido no texto.",
      ok: "",
      detalhes: parse.erros.slice(0, 20),
    };
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
    const s = custoTotal.includes(",")
      ? custoTotal.replace(/\./g, "").replace(",", ".")
      : custoTotal;
    custos = repartirCusto(s, parse.linhas.length);
    if (!custos) {
      return { erro: `Custo total inválido: "${custoTotal}".`, ok: "", detalhes: [] };
    }
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

  try {
    await c.query("begin");

    const v = await c.query("select sku from variante where id = $1", [varianteId]);
    if (v.rows.length === 0) {
      await c.query("rollback");
      return { erro: "Variante não encontrada.", ok: "", detalhes: [] };
    }

    for (let i = 0; i < parse.linhas.length; i++) {
      const l = parse.linhas[i];
      // Duas redes, porque uma so nao cobre.
      // 1) O UNIQUE parcial de iccid barra o mesmo lote importado duas vezes.
      //    Sem ele, dois clientes receberiam o mesmo eSIM pelo caminho da
      //    importacao, e a trava de alocacao nao teria como defender.
      // 2) Mas lote de operadora nem sempre vem com ICCID, e ai o UNIQUE
      //    parcial nao pega nada. Entao conferimos tambem pelo proprio codigo,
      //    que e o que de fato identifica o eSIM.
      //
      // A conferencia do codigo agora e pela IMPRESSAO DIGITAL, nao pelo bytea:
      // com a cifra, o mesmo codigo gera bytea diferente a cada gravacao, e
      // `where codigo_lpa = $1` nunca mais encontraria nada — a checagem
      // passaria calada e o repetido entraria.
      const impressao = impressaoCodigo(l.lpa);

      // A segunda metade do OR e a ponte da transicao: enquanto houver linha
      // legada (cifrado = false, codigo_hash nulo), so a impressao digital nao
      // acha o repetido — a linha antiga nao tem impressao nenhuma. Sem isto,
      // reimportar um lote antes de rodar scripts/cifrar-estoque.mjs criaria
      // uma segunda copia do mesmo eSIM. A condicao se apaga sozinha quando
      // nao sobrar nenhuma linha em texto claro.
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
      if (r.rows.length > 0) inseridos++;
      else repetidos++;
    }

    await c.query("commit");
  } catch (e: any) {
    await c.query("rollback").catch(() => {});
    console.error("importarLote:", e);
    // 23505 no indice da impressao digital significa que o indice unico do banco
    // pegou o que a conferencia acima deixou passar — corrida entre duas
    // importacoes simultaneas. E exatamente para isso que ele existe. Nada foi
    // gravado, entao basta reenviar.
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

  revalidatePath(`/painel/produtos/${handle}/estoque`);
  revalidatePath(`/painel/produtos/${handle}`);
  revalidatePath("/painel/produtos");

  const partes = [`${inseridos} código(s) importado(s) no lote "${lote}"`];
  if (repetidos > 0) partes.push(`${repetidos} já existia(m) no estoque e foi(ram) ignorado(s)`);
  if (parse.duplicadosNoTexto > 0) partes.push(`${parse.duplicadosNoTexto} repetido(s) dentro do próprio texto`);
  if (custos) partes.push(`custo unitário ≈ R$ ${custos[0].replace(".", ",")}`);

  return { erro: "", ok: partes.join(" · "), detalhes: [] };
}
