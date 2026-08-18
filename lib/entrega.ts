import { db } from "./db";

// A transacao de entrega — SPEC/04 §4, na integra:
// 1. trava condicional (aceita 'em_provisionamento': e o reprocesso da fila);
//    rowCount=0 tem DOIS significados — reler a linha antes de decidir.
// 2. aloca UM codigo com FOR UPDATE SKIP LOCKED (zero linhas = ERRO ALTO).
// 3. grava ativacao.
// 4. outbox: UM EVENTO POR EFEITO, na MESMA transacao.
// NUNCA colocar chamada de rede dentro deste bloco.

export type ResultadoEntrega = {
  ok: boolean;
  jaEntregue?: boolean;
  ativacaoId?: string;
  motivo?: "sem_estoque" | "status_incompativel";
  status?: string;
};

export async function entregarPedido(
  pedidoId: string,
  varianteId: string,
  itemPedidoId: string,
): Promise<ResultadoEntrega> {
  const c = await db.connect();
  try {
    await c.query("begin");

    const trava = await c.query(
      `update pedido set entregue = true, entregue_em = now(), status = 'entregue'
        where id = $1 and status in ('pago','em_provisionamento') and entregue = false
        returning id`,
      [pedidoId],
    );
    if (trava.rows.length === 0) {
      await c.query("rollback");
      const p = await db.query("select status, entregue from pedido where id = $1", [pedidoId]);
      if (p.rows[0]?.entregue) return { ok: true, jaEntregue: true }; // sucesso idempotente
      return { ok: false, motivo: "status_incompativel", status: p.rows[0]?.status }; // ERRO, nunca sucesso
    }

    const cod = await c.query(
      `update estoque_esim set status = 'entregue', pedido_id = $1
        where id = (select id from estoque_esim
                     where variante_id = $2 and status = 'disponivel'
                     order by criado_em for update skip locked limit 1)
        returning id`,
      [pedidoId, varianteId],
    );
    if (cod.rows.length === 0) {
      await c.query("rollback");
      return { ok: false, motivo: "sem_estoque" };
    }

    const atv = await c.query(
      `insert into ativacao (pedido_id, item_pedido_id, estoque_id, status, entregue_em)
       values ($1, $2, $3, 'entregue', now()) returning id`,
      [pedidoId, itemPedidoId, cod.rows[0].id],
    );

    const payload = JSON.stringify({ pedido_id: pedidoId, ativacao_id: atv.rows[0].id });
    await c.query(
      `insert into evento_saida (agregado, agregado_id, tipo, payload) values
         ('pedido', $1, 'entrega.notificar', $2::jsonb),
         ('pedido', $1, 'estoque.replicar',  $2::jsonb),
         ('pedido', $1, 'conversao.enviar',  $2::jsonb)`,
      [pedidoId, payload],
    );

    await c.query("commit");
    // campainha, nunca transporte (SPEC/01 §4) — antes do release, de proposito
    await c.query("select pg_notify('evento_saida','novo')").catch(() => {});
    return { ok: true, jaEntregue: false, ativacaoId: atv.rows[0].id };
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
