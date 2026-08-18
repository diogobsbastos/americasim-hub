#!/usr/bin/env node
// Cria (ou atualiza a senha de) um usuario do painel.
// A senha e digitada no terminal, escondida, e NUNCA vira argumento de linha de
// comando: argumento aparece no `ps` e fica no historico do shell.
//
//   node scripts/criar-usuario.mjs "diogo@exemplo.com" "Diogo Bastos" admin
//
// Sem terminal (pipe/automacao) le a senha da primeira linha do stdin:
//   printf '%s\n' "$SENHA" | node scripts/criar-usuario.mjs "email" "Nome" admin
//
// O formato do hash e o mesmo de lib/painel/sessao.ts. Esta duplicacao e
// consciente: este script roda em Node puro, fora do Next, e importar o modulo
// arrastaria `next/headers` junto. Por isso o script CONFERE no final (bloco 5):
// duplicacao sem verificacao foi o que deixou passar o defeito anterior.

import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import pg from "pg";

// Minimo definido pelo Contratante em 18/08. O que segura a porta aqui nao e o
// tamanho da senha: e o Basic Auth do Nginx na frente, o limite de 8 tentativas
// por IP em 15 min e o scrypt no hash.
const MINIMO = 8;
const PAPEIS = ["admin", "operacao", "atendimento", "leitura"];

// Teclas de controle por nome. Escape textual, nunca o byte cru: byte invisivel
// no fonte nao sobrevive a copiar-colar nem a editor que normaliza, e deixa a
// comparacao ilegivel no diff.
const ESC = "";        // inicio de sequencia de seta/Home/Delete
const CTRL_C = "";
const CTRL_D = "";
const CTRL_U = "";     // limpa a linha
const BACKSPACE = "";  // o terminal manda DEL, nao \b

// ---------------------------------------------------------------- 1. senha

function hashSenha(senha) {
  const N = 16384, r = 8, p = 1;
  const salt = randomBytes(16);
  const dk = scryptSync(senha, salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${dk.toString("hex")}`;
}

// Copia fiel de lib/painel/sessao.ts. Serve para o bloco 5 provar que o que
// ficou gravado e exatamente o que o login vai aceitar.
function conferirSenha(senha, guardado) {
  try {
    const partes = String(guardado).split("$");
    if (partes.length !== 6 || partes[0] !== "scrypt") return false;
    const N = Number(partes[1]), r = Number(partes[2]), p = Number(partes[3]);
    const salt = Buffer.from(partes[4], "hex");
    const esperado = Buffer.from(partes[5], "hex");
    const dk = scryptSync(senha, salt, esperado.length, { N, r, p, maxmem: 64 * 1024 * 1024 });
    return dk.length === esperado.length && timingSafeEqual(dk, esperado);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- 2. leitura

// Le uma senha do terminal em RAW MODE, sem readline.
//
// A versao anterior criava um readline e trocava `rl.output` por um objeto falso
// para engolir o eco. Isso deixava o estado da linha (cursor, edicao, wrap) sob
// controle de um stream que nao existe — funcionava as vezes e falhava calado.
// Aqui nao ha intermediario: cada tecla chega crua, e nos decidimos o que fazer
// com ela e o que desenhar na tela.
function lerSenhaDoTerminal(rotulo) {
  return new Promise((resolve, reject) => {
    const entrada = process.stdin;
    const saida = process.stdout;

    let buffer = "";
    let emEscape = false; // engolindo uma sequencia de seta/Home/Delete
    const eraRaw = entrada.isRaw;

    function encerrar() {
      entrada.setRawMode(false);
      entrada.pause();
      entrada.removeListener("data", aoReceber);
      if (eraRaw) entrada.setRawMode(true);
    }

    function aoReceber(pedaco) {
      for (const ch of pedaco) {
        // Sequencia de escape (setas, F1..): consumir ate a letra final e ignorar.
        if (emEscape) {
          if (/[A-Za-z~]/.test(ch)) emEscape = false;
          continue;
        }
        if (ch === ESC) { emEscape = true; continue; }

        if (ch === "\r" || ch === "\n") {          // Enter: terminou
          saida.write("\n");
          encerrar();
          resolve(buffer);
          return;
        }
        if (ch === CTRL_C) {
          saida.write("\n");
          encerrar();
          reject(new Error("cancelado"));
          return;
        }
        if (ch === CTRL_D) {
          if (buffer.length === 0) {
            saida.write("\n");
            encerrar();
            reject(new Error("cancelado"));
            return;
          }
          continue;
        }
        if (ch === BACKSPACE || ch === "\b") {
          if (buffer.length > 0) {
            // Apagar por PONTO DE CODIGO, nao por unidade UTF-16: senha com
            // acento ou emoji perderia meio caractere e o hash sairia de outra
            // string — exatamente o tipo de erro silencioso que estamos matando.
            const pontos = [...buffer];
            pontos.pop();
            buffer = pontos.join("");
            saida.write("\b \b");
          }
          continue;
        }
        if (ch === CTRL_U) {
          saida.write("\b \b".repeat([...buffer].length));
          buffer = "";
          continue;
        }
        if (ch < " ") continue;                     // outros controles: ignorar

        buffer += ch;
        saida.write("*");
      }
    }

    saida.write(rotulo);
    entrada.setRawMode(true);
    entrada.resume();
    entrada.setEncoding("utf8"); // o StringDecoder junta UTF-8 partido entre pedacos
    entrada.on("data", aoReceber);
  });
}

// Sem TTY (pipe, cron, ansible): le a primeira linha do stdin. Nao ha o que
// esconder num pipe, e travar esperando teclado seria pior.
function lerSenhaDoPipe() {
  return new Promise((resolve) => {
    let dados = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => { dados += d; });
    process.stdin.on("end", () => resolve(dados.split("\n")[0].replace(/\r$/, "")));
  });
}

// ---------------------------------------------------------------- 3. argumentos

const [emailBruto, nome, papel = "admin"] = process.argv.slice(2);

function morrer(msg) {
  console.error(msg);
  process.exit(1);
}

if (!emailBruto || !nome) {
  morrer('uso: node scripts/criar-usuario.mjs "email" "Nome Completo" [admin|operacao|atendimento|leitura]');
}
// O login faz `trim().toLowerCase()` antes de procurar. Gravar sem normalizar
// deixa um usuario que existe no banco e nao existe no login.
const email = emailBruto.trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) morrer(`e-mail invalido: [${emailBruto}]`);
if (!PAPEIS.includes(papel)) morrer(`papel invalido: ${papel} (use ${PAPEIS.join(", ")})`);
if (!process.env.DATABASE_URL) {
  morrer("DATABASE_URL nao esta no ambiente. Rode com o env do servico:\n" +
         "  set -a; . ~/.americasim-hub.env; set +a");
}

// ---------------------------------------------------------------- 4. gravacao

let senha;
if (process.stdin.isTTY) {
  try {
    senha = await lerSenhaDoTerminal(`senha para ${email} (aparece como *): `);
    const conferencia = await lerSenhaDoTerminal(`digite de novo:${" ".repeat(Math.max(1, email.length + 18))}`);
    if (senha !== conferencia) morrer("as senhas nao batem. Nada foi gravado.");
  } catch {
    console.error("\ncancelado. Nada foi gravado.");
    process.exit(130);
  }
} else {
  senha = await lerSenhaDoPipe();
  console.log("(stdin nao e terminal: senha lida do pipe, sem confirmacao)");
}

if ([...senha].length < MINIMO) {
  morrer(`senha curta demais (${[...senha].length}). Minimo ${MINIMO}. Nada foi gravado.`);
}

const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
await cliente.connect();

let saidaFinal = 0;
try {
  const r = await cliente.query(
    `insert into usuario (email, nome, papel, senha_hash, ativo)
     values ($1, $2, $3::papel_usuario, $4, true)
     on conflict (email) do update
       set nome = excluded.nome, papel = excluded.papel,
           senha_hash = excluded.senha_hash, ativo = true
     returning id, (xmax = 0) as criado`,
    [email, nome, papel, hashSenha(senha)],
  );
  const { id, criado } = r.rows[0];

  // ------------------------------------------------------------ 5. conferencia
  // Reler do banco e conferir com a MESMA funcao que o login usa. Sem isto o
  // script pode terminar "com sucesso" enquanto o login recusa a senha certa —
  // foi o defeito de 18/08. Sintaxe nao prova runtime.
  const v = await cliente.query(
    "select senha_hash from usuario where lower(email::text) = $1 and ativo",
    [email],
  );
  if (v.rows.length !== 1 || !conferirSenha(senha, v.rows[0].senha_hash)) {
    console.error("FALHOU A CONFERENCIA: o hash gravado nao aceita a senha digitada.");
    console.error("O login recusaria esta senha. Investigue antes de usar.");
    saidaFinal = 2;
  } else {
    // Trocar a senha derruba as sessoes abertas: se a troca foi por suspeita de
    // invasao, deixar sessao viva anula o motivo da troca.
    const s = await cliente.query(
      "update sessao_painel set revogada_em = now() where usuario_id = $1 and revogada_em is null",
      [id],
    );
    console.log(criado ? `usuario CRIADO: ${email} (${papel})` : `senha ATUALIZADA: ${email} (${papel})`);
    console.log(`conferido: o hash gravado aceita a senha digitada.`);
    console.log(`sessoes anteriores revogadas: ${s.rowCount}.`);
  }
} finally {
  await cliente.end();
}
process.exit(saidaFinal);
