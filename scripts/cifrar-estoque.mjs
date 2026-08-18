#!/usr/bin/env node
// Cifra os codigos de eSIM que ainda estao em TEXTO CLARO no banco.
//
//   set -a; . ~/.americasim-hub.env; set +a
//   node scripts/cifrar-estoque.mjs             # ENSAIO — nao grava nada
//   node scripts/cifrar-estoque.mjs --aplicar   # grava
//
// ENSAIO e o padrao de proposito. Este script reescreve a coluna que guarda o
// produto; um `--aplicar` esquecido no comando errado nao pode ser o caminho
// mais curto.
//
// Idempotente: so olha linhas com `cifrado = false`. Rodar duas vezes nao faz
// mal — a segunda vez encontra zero.
//
// Exige a migracao 005 aplicada (colunas codigo_hash e cifrado).
//
// A cifra abaixo e copia fiel de lib/cripto-esim.ts. A duplicacao e consciente:
// isto roda em Node puro, fora do Next, e nao da para importar um .ts. E por
// isso o bloco 4 CONFERE relendo do banco e decifrando ANTES do commit —
// duplicar sem verificar foi exatamente o defeito do criar-usuario.mjs.

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "node:crypto";
import pg from "pg";

const VERSAO = 0x01;
const TAM_IV = 12;
const TAM_TAG = 16;
const CABECALHO = 1 + TAM_IV + TAM_TAG;
const ROTULO_IMPRESSAO = "impressao-esim";

const APLICAR = process.argv.includes("--aplicar");

function morrer(msg, codigo = 1) {
  console.error(msg);
  process.exit(codigo);
}

// ---------------------------------------------------------------- 1. chaves

if (!process.env.DATABASE_URL) {
  morrer("DATABASE_URL nao esta no ambiente. Rode com o env do servico:\n  set -a; . ~/.americasim-hub.env; set +a");
}
if (!process.env.ESIM_CHAVE) {
  morrer("ESIM_CHAVE nao esta no ambiente.\n" +
         "Gere com `openssl rand -base64 32` e ponha em ~/.americasim-hub.env antes de rodar isto.");
}

const MESTRA = Buffer.from(process.env.ESIM_CHAVE.trim(), "base64");
if (MESTRA.length !== 32) {
  morrer(`ESIM_CHAVE tem ${MESTRA.length} byte(s) depois do base64; AES-256 exige 32.`);
}
const CHAVE_IMPRESSAO = createHash("sha256")
  .update(Buffer.concat([MESTRA, Buffer.from(ROTULO_IMPRESSAO, "utf8")]))
  .digest();

function cifrar(texto) {
  const iv = randomBytes(TAM_IV);
  const c = createCipheriv("aes-256-gcm", MESTRA, iv);
  const corpo = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return Buffer.concat([Buffer.from([VERSAO]), iv, c.getAuthTag(), corpo]);
}

function decifrar(bruto) {
  if (!Buffer.isBuffer(bruto) || bruto.length < CABECALHO) throw new Error("cifra curta demais");
  if (bruto[0] !== VERSAO) throw new Error(`versao desconhecida: 0x${bruto[0].toString(16)}`);
  const d = createDecipheriv("aes-256-gcm", MESTRA, bruto.subarray(1, 1 + TAM_IV));
  d.setAuthTag(bruto.subarray(1 + TAM_IV, CABECALHO));
  return Buffer.concat([d.update(bruto.subarray(CABECALHO)), d.final()]).toString("utf8");
}

function impressao(texto) {
  return createHmac("sha256", CHAVE_IMPRESSAO).update(texto, "utf8").digest();
}

// O codigo E o produto: nao pode aparecer inteiro no terminal, nem em log, nem
// numa captura de tela compartilhada. Isto mostra so o bastante para conferir
// que estamos falando da linha certa.
function mascarar(texto) {
  const t = String(texto);
  if (t.length <= 12) return `${t.slice(0, 4)}…(${t.length} car.)`;
  return `${t.slice(0, 8)}…${t.slice(-3)} (${t.length} car.)`;
}

// ---------------------------------------------------------------- 2. leitura

const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
await cliente.connect();

let saida = 0;
try {
  const colunas = await cliente.query(
    `select column_name from information_schema.columns
      where table_name = 'estoque_esim' and column_name in ('codigo_hash', 'cifrado')`,
  );
  if (colunas.rows.length !== 2) {
    morrer("A migracao 005 nao esta aplicada (faltam codigo_hash e/ou cifrado). Aplique-a antes.");
  }

  const total = await cliente.query(
    `select count(*) filter (where cifrado) as cifrados,
            count(*) filter (where not cifrado) as claros,
            count(*) as total
       from estoque_esim`,
  );
  const t = total.rows[0];
  console.log(`estoque_esim: ${t.total} linha(s) — ${t.cifrados} cifrada(s), ${t.claros} em texto claro.`);

  const pendentes = await cliente.query(
    `select id, codigo_lpa, lote, status from estoque_esim where cifrado = false order by criado_em`,
  );
  if (pendentes.rows.length === 0) {
    console.log("Nada a fazer: nenhum codigo em texto claro.");
    process.exit(0);
  }

  // ------------------------------------------------------------ 3. preparo
  // Tudo e calculado e conferido ANTES de abrir transacao. Descobrir um
  // impedimento no meio da escrita custa um rollback e uma explicacao; descobrir
  // antes custa uma linha impressa.
  const planos = [];
  const vistos = new Map(); // impressao (hex) -> id, para achar repetido no proprio banco
  const suspeitos = [];

  for (const linha of pendentes.rows) {
    const texto = Buffer.from(linha.codigo_lpa).toString("utf8");
    if (!texto.toUpperCase().startsWith("LPA:")) {
      // Nao pular: pular deixaria o registro em texto claro, que e o problema
      // que viemos resolver. So registrar para alguem olhar depois.
      suspeitos.push(`${linha.id}: nao comeca com "LPA:" — ${mascarar(texto)}`);
    }
    const imp = impressao(texto);
    const hex = imp.toString("hex");
    if (vistos.has(hex)) {
      morrer(
        `PARADO: as linhas ${vistos.get(hex)} e ${linha.id} tem o MESMO codigo.\n` +
        `O indice unico de codigo_hash recusaria a segunda. Decida qual apagar antes de cifrar.\n` +
        `Nada foi gravado.`,
        3,
      );
    }
    vistos.set(hex, linha.id);
    planos.push({ id: linha.id, texto, lote: linha.lote, status: linha.status, imp });
  }

  // Colisao com linha que JA esta cifrada (mesmo eSIM importado duas vezes, uma
  // antes e uma depois da migracao).
  const colisao = await cliente.query(
    `select id, encode(codigo_hash, 'hex') as h from estoque_esim
      where codigo_hash = any($1::bytea[])`,
    [planos.map((p) => p.imp)],
  );
  if (colisao.rows.length > 0) {
    const mapa = new Map(colisao.rows.map((r) => [r.h, r.id]));
    const linhas = planos
      .filter((p) => mapa.has(p.imp.toString("hex")))
      .map((p) => `  ${p.id} (texto claro) = ${mapa.get(p.imp.toString("hex"))} (ja cifrada)`);
    morrer(
      `PARADO: ${linhas.length} codigo(s) ja existem cifrados no estoque:\n${linhas.join("\n")}\n` +
      `Sao o mesmo eSIM em duas linhas. Decida qual fica antes de cifrar. Nada foi gravado.`,
      3,
    );
  }

  for (const s of suspeitos) console.warn(`aviso — ${s}`);
  console.log(`\n${planos.length} linha(s) para cifrar:`);
  for (const p of planos) {
    console.log(`  ${p.id}  lote=${p.lote ?? "-"}  status=${p.status}  ${mascarar(p.texto)}`);
  }

  if (!APLICAR) {
    console.log("\nENSAIO: nada foi gravado. Rode de novo com --aplicar para valer.");
    process.exit(0);
  }

  // ------------------------------------------------------------ 4. gravacao
  await cliente.query("begin");
  try {
    for (const p of planos) {
      const r = await cliente.query(
        `update estoque_esim
            set codigo_lpa = $2, codigo_hash = $3, cifrado = true
          where id = $1 and cifrado = false`,
        [p.id, cifrar(p.texto), p.imp],
      );
      if (r.rowCount !== 1) {
        throw new Error(`linha ${p.id}: update afetou ${r.rowCount} linha(s) — alguem mexeu no meio. Nada sera gravado.`);
      }
    }

    // CONFERENCIA DENTRO DA TRANSACAO. Rele o que acabou de ser gravado e
    // decifra. So depois disso o commit acontece — assim uma cifra que nao volta
    // ao texto original vira rollback, e nao um estoque perdido descoberto na
    // primeira venda.
    const conf = await cliente.query(
      `select id, codigo_lpa, cifrado from estoque_esim where id = any($1::uuid[])`,
      [planos.map((p) => p.id)],
    );
    if (conf.rows.length !== planos.length) {
      throw new Error(`conferencia: esperava ${planos.length} linha(s), vieram ${conf.rows.length}.`);
    }
    const esperado = new Map(planos.map((p) => [p.id, p.texto]));
    for (const linha of conf.rows) {
      if (linha.cifrado !== true) throw new Error(`conferencia: ${linha.id} continua marcada como texto claro.`);
      const volta = decifrar(Buffer.from(linha.codigo_lpa));
      if (volta !== esperado.get(linha.id)) {
        throw new Error(`conferencia: ${linha.id} nao volta ao codigo original. NADA sera gravado.`);
      }
    }

    await cliente.query("commit");
    console.log(`\n${planos.length} codigo(s) cifrado(s) e CONFERIDO(s) — cada um decifrou de volta ao original antes do commit.`);
  } catch (e) {
    await cliente.query("rollback").catch(() => {});
    console.error(`\nFALHOU: ${e?.message ?? e}`);
    console.error("Rollback feito. O banco esta como estava.");
    saida = 2;
  }

  // ------------------------------------------------------------ 5. estado final
  const fim = await cliente.query(
    `select count(*) filter (where cifrado) as cifrados,
            count(*) filter (where not cifrado) as claros,
            count(*) as total
       from estoque_esim`,
  );
  const f = fim.rows[0];
  console.log(`\nestado final: ${f.total} linha(s) — ${f.cifrados} cifrada(s), ${f.claros} em texto claro.`);
  if (Number(f.claros) > 0 && saida === 0) {
    console.warn("Ainda ha codigo em texto claro. Rode de novo ou investigue.");
  }
} finally {
  await cliente.end();
}
process.exit(saida);
