// AmericaSim Worker — consumidor do outbox (evento_saida).
// Processo Node PURO, sem Next. Regra de negocio vem do banco; aqui so despacho.
// Retentativa com espera crescente por linha; heartbeat em arquivo para a sentinela.
import pg from "pg";
import { writeFileSync } from "node:fs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const HEARTBEAT = process.env.WORKER_HEARTBEAT || "/tmp/americasim-worker.heartbeat";
const INTERVALO_MS = 5000;

// O hub, na propria maquina.
const HUB = process.env.HUB_INTERNO || "http://127.0.0.1:3002";
const TEMPO_LIMITE_MS = 25000;

// A credencial das rotas /v1/interno/*. Vem do BANCO, mesma fonte que a rota
// consulta para conferir — nao ha um terceiro lugar (arquivo, env) para manter
// em dia. Cache curto para nao consultar a cada evento; recarga forcada quando
// o hub recusa, assim trocar o segredo nao exige reiniciar este processo.
let segredoCache = { valor: "", em: 0 };
async function segredoInterno(forcar = false) {
  const agora = Date.now();
  if (!forcar && segredoCache.valor && agora - segredoCache.em < 60000) return segredoCache.valor;
  const r = await pool.query("select valor from parametro where chave = 'interno.segredo'");
  segredoCache = { valor: String(r.rows[0]?.valor ?? ""), em: agora };
  return segredoCache.valor;
}

// Bate no hub e devolve o corpo. Erro HTTP vira excecao de proposito: quem
// chama esta dentro do try do tick, e a fila retenta com espera crescente.
async function chamarHub(caminho, corpo, jaTentou = false) {
  const segredo = await segredoInterno(jaTentou);
  if (!segredo) throw new Error("parametro interno.segredo nao cadastrado no banco");

  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TEMPO_LIMITE_MS);
  try {
    const r = await fetch(`${HUB}${caminho}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-interno": segredo },
      body: JSON.stringify(corpo),
      signal: ctl.signal,
    });
    const txt = await r.text();

    // 404 aqui quase sempre e credencial velha em cache, nao rota inexistente.
    // Vale uma segunda tentativa com o segredo recarregado antes de desistir.
    if (r.status === 404 && !jaTentou) {
      clearTimeout(t);
      return chamarHub(caminho, corpo, true);
    }
    if (!r.ok) throw new Error(`hub respondeu ${r.status}: ${txt.slice(0, 300)}`);
    try {
      return JSON.parse(txt);
    } catch {
      return { ok: true };
    }
  } finally {
    clearTimeout(t);
  }
}

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
  } else if (ev.tipo === "orders_v2" || ev.tipo === "orders") {
    // A venda no Mercado Livre.
    //
    // O worker NAO faz esse trabalho: ele nao tem o token do ML nem a chave que
    // abre o codigo do eSIM, e duplicar a regra de entrega aqui seria manter
    // duas versoes da mesma coisa ate elas divergirem. Ele so aponta.
    //
    // O corpo da notificacao do ML traz o ponteiro em `resource`
    // ("/orders/2000012345678901"). O estado do pedido vem da API, nao daqui:
    // entre a notificacao e este instante o pedido pode ter sido pago,
    // cancelado ou reembolsado.
    const recurso = String(p.resource ?? p.recurso ?? "");
    if (!recurso) throw new Error("notificacao do ML sem `resource`");
    const r = await chamarHub("/v1/interno/ml/pedido", { recurso });
    console.log(`evento ${ev.id} (${ev.tipo}): ${JSON.stringify(r).slice(0, 200)}`);
  } else if (ev.tipo === "estoque.replicar") {
    // Devolver a quantidade ao anuncio do ML entra quando houver publicacao
    // pelo hub — hoje o anuncio e mantido na mao. No-op CONSCIENTE.
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
