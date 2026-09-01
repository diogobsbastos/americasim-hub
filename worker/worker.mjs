// AmericaSim Worker — consumidor do outbox (evento_saida).
// Processo Node PURO, sem Next. Regra de negocio vem do banco; aqui so despacho.
// Retentativa com espera crescente por linha; heartbeat em arquivo para a sentinela.
//
// POR DEMANDA (01/09/2026): o worker nao vigia mais a cada 5s. Ele fica em
// LISTEN 'evento_novo' — a campainha que a migracao 013 instalou na outbox — e
// acorda em milissegundos quando um evento e gravado. O relogio de 60s que
// resta e REDE DE SEGURANCA (aviso perdido numa reconexao, retentativa de
// e-mail devida), nao ciclo de trabalho.
import pg from "pg";
import { writeFileSync } from "node:fs";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const HEARTBEAT = process.env.WORKER_HEARTBEAT || "/tmp/americasim-worker.heartbeat";
const OCIOSO_MS = 60000;

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
    // gera segundo e-mail (SPEC/04 3.5). O envio real acontece logo depois do
    // drenar: o loop chama /v1/interno/email/despachar, que processa a fila.
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
    // Levar a quantidade real ao anuncio.
    //
    // O payload chega de duas origens e passa adiante como veio: o gatilho do
    // banco manda `variante_id`, a entrega manda `pedido_id`. Quem resolve a
    // diferenca e a rota. Quanto menos regra este processo carrega, menos
    // lugar existe para ele divergir do app.
    const r = await chamarHub("/v1/interno/ml/estoque", {
      variante_id: p.variante_id ?? null,
      pedido_id: p.pedido_id ?? null,
    });
    console.log(`evento ${ev.id} (${ev.tipo}): ${JSON.stringify(r).slice(0, 200)}`);
  } else if (ev.tipo === "operadora.provisionar") {
    // Venda de produto sob demanda (modo operadora_fixo): o pagamento so
    // reservou o ICCID; e a rota interna que compra o pacote na operadora e
    // busca o QR (lib/provisionar). 500 = retentar (rede, "em processamento",
    // QR ainda nao existe); 200 com ok:false = falha definitiva, nao insistir —
    // o pedido fica no alerta "pago sem entrega" do painel.
    const r = await chamarHub("/v1/interno/operadora/provisionar", {
      pedido_id: p.pedido_id ?? null,
      item_pedido_id: p.item_pedido_id ?? null,
    });
    console.log(`evento ${ev.id} (${ev.tipo}): ${JSON.stringify(r).slice(0, 300)}`);
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

// ------------------------------------------------------------- a campainha
// Conexao dedicada em LISTEN. Aviso durante o processamento nao se perde: vira
// `avisoPendente`, e o proximo `esperar()` volta na hora. Conexao caiu?
// Reconecta sozinha — e o relogio de 60s cobre o vao ate ela voltar.
let acordar = null;
let avisoPendente = false;

function tocar() {
  if (acordar) acordar();
  else avisoPendente = true;
}

function esperar(ms) {
  if (avisoPendente) {
    avisoPendente = false;
    return Promise.resolve();
  }
  return new Promise((r) => {
    const t = setTimeout(() => { acordar = null; r(); }, ms);
    acordar = () => { clearTimeout(t); acordar = null; r(); };
  });
}

async function ligarCampainha() {
  for (;;) {
    const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
    try {
      await cliente.connect();
      await cliente.query("listen evento_novo");
      console.log("worker: campainha ligada (LISTEN evento_novo)");
      cliente.on("notification", tocar);
      await new Promise((_, falha) => {
        cliente.on("error", falha);
        cliente.on("end", () => falha(new Error("conexao encerrada")));
      });
    } catch (e) {
      console.error("worker: campainha caiu:", String(e).slice(0, 200));
    }
    try { await cliente.end(); } catch {}
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function main() {
  console.log("americasim-worker: iniciado (por demanda: LISTEN + rede de seguranca 60s)");
  ligarCampainha();
  for (;;) {
    try {
      let houve = true;
      while (houve) houve = await tick();

      // E-mails da fila `notificacao`: logo apos os eventos (o entrega.notificar
      // acabou de inserir) e tambem como retentativa dos que falharam.
      try {
        const r = await chamarHub("/v1/interno/email/despachar", {});
        if (r?.enviadas) console.log(`e-mails: ${r.enviadas} enviado(s)`);
      } catch (e) {
        console.error("e-mails:", String(e).slice(0, 200));
      }

      // Caixa do Gmail (IMAP IDLE mora no hub): este toque so GARANTE que a
      // conexao esta viva — quem avisa da chegada de e-mail e o proprio Google.
      try {
        await chamarHub("/v1/interno/email/caixa", {});
      } catch (e) {
        console.error("caixa:", String(e).slice(0, 200));
      }

      writeFileSync(HEARTBEAT, new Date().toISOString());
    } catch (e) {
      console.error("worker: erro no ciclo:", String(e).slice(0, 300));
    }
    await esperar(OCIOSO_MS);
  }
}

main();
