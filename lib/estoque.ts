import { db } from "./db";

// Movimentacao de estoque — a parte de "retirar" e "atualizar" (migracao 006).
//
// Regra que manda em tudo aqui: **so sai do estoque o que ainda esta parado
// nele**. Codigo `entregue` esta com o cliente; codigo `reservado` tem pedido em
// voo. Deixar o painel dar baixa nesses dois seria o operador conseguir, com um
// clique, apagar do sistema um eSIM que a pessoa ja tem no celular.
//
// Este arquivo nao importa nada do Next de proposito: da para exercitar contra
// um Postgres de verdade sem subir a aplicacao.

export const STATUS_BAIXA = ["defeito", "expirado", "devolvido", "interno"] as const;
export type StatusBaixa = (typeof STATUS_BAIXA)[number];

export const ROTULO_BAIXA: Record<StatusBaixa, string> = {
  defeito: "Defeito — não ativa",
  expirado: "Venceu antes de vender",
  devolvido: "Devolvido ao fornecedor",
  interno: "Uso interno / teste",
};

export interface Recusado {
  id: string;
  status: string;
  porque: string;
}

export interface ResultadoMovimento {
  movidos: number;
  recusados: Recusado[];
}

const MOTIVO_MAX = 400;

function limparMotivo(motivo: string): string {
  return String(motivo ?? "").trim().slice(0, MOTIVO_MAX);
}

// Explica em portugues por que aquela linha nao pode sair. A tela mostra isso ao
// lado do codigo recusado — "falhou" sem motivo faz o operador tentar de novo.
function porqueNaoSai(status: string): string {
  if (status === "entregue") return "já foi entregue ao cliente";
  if (status === "reservado") return "está reservado para um pedido em andamento";
  if (status === "disponivel") return "mudou de estado durante a operação";
  return `já está fora do estoque (${status})`;
}

// ---------------------------------------------------------------- baixa

export async function darBaixa(
  ids: string[],
  status: StatusBaixa,
  motivo: string,
  usuarioId: string,
): Promise<ResultadoMovimento> {
  if (!STATUS_BAIXA.includes(status)) throw new Error(`status de baixa invalido: ${status}`);
  const alvos = [...new Set(ids.filter(Boolean))];
  if (alvos.length === 0) return { movidos: 0, recusados: [] };

  const c = await db.connect();
  try {
    await c.query("begin");

    // O `and status = 'disponivel'` DENTRO do update e a trava. Conferir antes e
    // atualizar depois abriria uma janela entre as duas consultas em que a venda
    // acontece — e o codigo sairia do estoque ja tendo sido vendido.
    const r = await c.query(
      `update estoque_esim
          set status = $2::status_esim
        where id = any($1::uuid[]) and status = 'disponivel'
        returning id`,
      [alvos, status],
    );
    const movidos: string[] = r.rows.map((x: any) => x.id);

    for (const id of movidos) {
      await c.query(
        `insert into movimento_estoque
           (estoque_id, tipo, status_antes, status_depois, motivo, usuario_id)
         values ($1, 'baixa', 'disponivel', $2::status_esim, $3, $4)`,
        [id, status, limparMotivo(motivo) || null, usuarioId],
      );
    }

    // Quem sobrou: dizer POR QUE, em vez de sumir com a linha.
    const recusados: Recusado[] = [];
    const faltando = alvos.filter((id) => !movidos.includes(id));
    if (faltando.length > 0) {
      const q = await c.query(
        "select id, status::text as status from estoque_esim where id = any($1::uuid[])",
        [faltando],
      );
      const vistos = new Set<string>();
      for (const row of q.rows) {
        vistos.add(row.id);
        recusados.push({ id: row.id, status: row.status, porque: porqueNaoSai(row.status) });
      }
      for (const id of faltando) {
        if (!vistos.has(id)) recusados.push({ id, status: "?", porque: "não existe mais" });
      }
    }

    await c.query("commit");
    return { movidos: movidos.length, recusados };
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

// ---------------------------------------------------------------- retorno

// Desfazer uma baixa errada. So volta o que esta num status de baixa: `entregue`
// nunca volta para o estoque, porque o cliente continua com o codigo — e
// devolve-lo ao estoque significaria vender o mesmo eSIM duas vezes.
export async function retornarAoEstoque(
  ids: string[],
  motivo: string,
  usuarioId: string,
): Promise<ResultadoMovimento> {
  const alvos = [...new Set(ids.filter(Boolean))];
  if (alvos.length === 0) return { movidos: 0, recusados: [] };

  const c = await db.connect();
  try {
    await c.query("begin");

    const antes = await c.query(
      "select id, status::text as status from estoque_esim where id = any($1::uuid[])",
      [alvos],
    );
    const statusPorId = new Map<string, string>(antes.rows.map((x: any) => [x.id, x.status]));

    const r = await c.query(
      `update estoque_esim
          set status = 'disponivel'
        where id = any($1::uuid[]) and status::text = any($2::text[])
        returning id`,
      [alvos, [...STATUS_BAIXA]],
    );
    const movidos: string[] = r.rows.map((x: any) => x.id);

    for (const id of movidos) {
      await c.query(
        `insert into movimento_estoque
           (estoque_id, tipo, status_antes, status_depois, motivo, usuario_id)
         values ($1, 'retorno', $2::status_esim, 'disponivel', $3, $4)`,
        [id, statusPorId.get(id) ?? null, limparMotivo(motivo) || null, usuarioId],
      );
    }

    const recusados: Recusado[] = [];
    for (const id of alvos) {
      if (movidos.includes(id)) continue;
      const s = statusPorId.get(id);
      recusados.push({
        id,
        status: s ?? "?",
        porque: s === undefined ? "não existe mais" : porqueNaoSai(s),
      });
    }

    await c.query("commit");
    return { movidos: movidos.length, recusados };
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

// ---------------------------------------------------------------- correcao

export interface CamposCorrigiveis {
  operadora?: string | null;
  validade?: string | null; // AAAA-MM-DD
  lote?: string | null;
  custo_brl?: string | null; // decimal em string; nunca number (float soma errado)
}

// A lista e branca de proposito. `codigo_lpa`, `codigo_hash`, `cifrado`,
// `status`, `pedido_id` e `variante_id` NAO se corrigem por aqui: os tres
// primeiros sao o produto e a cifra, e os tres ultimos so mudam por venda ou
// por baixa, que tem caminho proprio e deixam rastro proprio.
const CORRIGIVEIS: (keyof CamposCorrigiveis)[] = ["operadora", "validade", "lote", "custo_brl"];

export interface ResultadoCorrecao {
  alterados: number;
  mudancas: Record<string, { antes: unknown; depois: unknown }>;
}

function normalizar(campo: keyof CamposCorrigiveis, bruto: unknown): string | null {
  const s = String(bruto ?? "").trim();
  if (s === "") return null;

  if (campo === "validade") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`Validade inválida: "${s}". Use AAAA-MM-DD.`);
    return s;
  }
  if (campo === "custo_brl") {
    // Aceita 12,34 e 1.234,56 — e o que sai da planilha do fornecedor.
    const n = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(n)) throw new Error(`Custo inválido: "${s}".`);
    return n;
  }
  return s.slice(0, 120);
}

export async function corrigir(
  ids: string[],
  campos: CamposCorrigiveis,
  motivo: string,
  usuarioId: string,
  podeMexerEmCusto: boolean,
): Promise<ResultadoCorrecao> {
  const alvos = [...new Set(ids.filter(Boolean))];
  if (alvos.length === 0) return { alterados: 0, mudancas: {} };

  if (campos.custo_brl !== undefined && !podeMexerEmCusto) {
    throw new Error("Seu papel não permite mexer em custo.");
  }

  const sets: string[] = [];
  const valores: unknown[] = [alvos];
  const pedidos: Record<string, string | null> = {};

  for (const campo of CORRIGIVEIS) {
    if (campos[campo] === undefined) continue; // nao mandado = nao mexe
    const v = normalizar(campo, campos[campo]);
    pedidos[campo] = v;
    valores.push(v);
    const i = valores.length;
    sets.push(campo === "validade" ? `validade = $${i}::date`
           : campo === "custo_brl" ? `custo_brl = $${i}::numeric`
           : `${campo} = $${i}`);
  }
  if (sets.length === 0) return { alterados: 0, mudancas: {} };

  const c = await db.connect();
  try {
    await c.query("begin");

    const antes = await c.query(
      `select id, operadora, validade::text as validade, lote, custo_brl::text as custo_brl
         from estoque_esim where id = any($1::uuid[])`,
      [alvos],
    );

    const r = await c.query(
      `update estoque_esim set ${sets.join(", ")} where id = any($1::uuid[]) returning id`,
      valores,
    );

    for (const linha of antes.rows) {
      const mudou: Record<string, { antes: unknown; depois: unknown }> = {};
      for (const campo of Object.keys(pedidos)) {
        const de = (linha as any)[campo] ?? null;
        const para = pedidos[campo];
        // Gravar movimento de campo que nao mudou enche o historico de ruido e
        // faz o operador parar de ler.
        if (String(de ?? "") !== String(para ?? "")) mudou[campo] = { antes: de, depois: para };
      }
      if (Object.keys(mudou).length === 0) continue;
      await c.query(
        `insert into movimento_estoque
           (estoque_id, tipo, status_antes, status_depois, motivo, campos, usuario_id)
         values ($1, 'correcao', null, null, $2, $3::jsonb, $4)`,
        [linha.id, limparMotivo(motivo) || null, JSON.stringify(mudou), usuarioId],
      );
    }

    await c.query("commit");

    const resumo: Record<string, { antes: unknown; depois: unknown }> = {};
    for (const campo of Object.keys(pedidos)) resumo[campo] = { antes: "(vários)", depois: pedidos[campo] };
    return { alterados: r.rows.length, mudancas: resumo };
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
