// AmericaSim Worker — consumidor do outbox (evento_saida).
// Processo Node PURO, sem Next. Regra de negocio vem do banco; aqui so despacho.
// Retentativa com espera crescente por linha; heartbeat em arquivo para a sentinela.
import pg from "pg";
import { writeFileSync } from "node:fs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const HEARTBEAT = process.env.WORKER_HEARTBEAT || "/tmp/americasim-worker.heartbeat";
const INTERVALO_MS = 5000;

async function despachar(c, ev) {
  const p = ev.payload || {};
  if (ev.tipo === "entrega.notificar") {
    // Dedup NO BANCO: (destino, canal, referencia). Webhook duplicado nunca
    // gera segundo e-mail (SPEC/04 3.5). O envio real entra quando houver
    // provedor transacional (Resend/SES); ate la a notificacao fica 'pendente'.
    await c.query(
      `insert into notificacao (destino, canal, referencia, modelo, payload)
       select cli.email::text, 'email', 'entrega_qr:' || ped.numero, 'entrega_qr', $2::jsonb
         from pedido ped join cliente cli on cli.id = ped.cliente_id
        where ped.id = $1 and cli.email is not null
       on conflict (destino, canal, referencia) do nothing`,
      [p.pedido_id, JSON.stringify(p)],
    );
  } else if (ev.tipo === "estoque.replicar") {
    // ML/Amazon ainda nao conectados — no-op CONSCIENTE (nao e esquecimento).
  } else if (ev.tipo === "conversao.enviar") {
    // Google/Meta ainda nao conectados — no-op consciente.
  } else {
    throw new Error("tipo de evento desconhecido: " + ev.tipo);
  }
}

async function tick() {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const { rows } = await c.query(
      `select id, tipo, payload from evento_saida
        where publicado_em is null and proxima_em <= now()
        order by id
        for update skip locked
        limit 1`,
    );
    if (rows.length === 0) {
      await c.query("commit");
      return false;
    }
    const ev = rows[0];
    try {
      await despachar(c, ev);
      await c.query("update evento_saida set publicado_em = now() where id = $1", [ev.id]);
      await c.query("commit");
      console.log(`evento ${ev.id} (${ev.tipo}): publicado`);
    } catch (e) {
      await c.query("rollback");
      await pool.query(
        `update evento_saida
            set tentativas = tentativas + 1,
                proxima_em = now() + (interval '30 seconds') * least(power(2, tentativas), 64),
                ultimo_erro = $2
          where id = $1`,
        [ev.id, String(e).slice(0, 500)],
      );
      console.error(`evento ${ev.id} (${ev.tipo}): falhou ->`, String(e).slice(0, 200));
    }
    return true;
  } finally {
    c.release();
  }
}

async function main() {
  console.log("americasim-worker: iniciado");
  for (;;) {
    try {
      let houve = true;
      while (houve) houve = await tick();
      writeFileSync(HEARTBEAT, new Date().toISOString());
    } catch (e) {
      console.error("worker: erro no ciclo:", String(e).slice(0, 300));
    }
    await new Promise((r) => setTimeout(r, INTERVALO_MS));
  }
}

main();
