#!/usr/bin/env node
// Cria (ou atualiza a senha de) um usuario do painel.
// A senha e digitada no terminal, escondida, e NUNCA vira argumento de linha de
// comando: argumento aparece no `ps` e fica no historico do shell.
//
//   node scripts/criar-usuario.mjs "diogo@exemplo.com" "Diogo Bastos" admin
//
// O formato do hash e o mesmo de lib/painel/sessao.ts. Esta duplicacao e
// consciente: este script roda em Node puro, fora do Next, e importar o modulo
// arrastaria `next/headers` junto.

import { scryptSync, randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import pg from "pg";

function hashSenha(senha) {
  const N = 16384, r = 8, p = 1;
  const salt = randomBytes(16);
  const dk = scryptSync(senha, salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${dk.toString("hex")}`;
}

function perguntarEscondido(texto) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const saida = process.stdout;
    rl.output = { write: (s) => (/\n/.test(s) ? saida.write(s) : null) };
    saida.write(texto);
    rl.question("", (resposta) => {
      saida.write("\n");
      rl.close();
      resolve(resposta);
    });
  });
}

const [email, nome, papel = "admin"] = process.argv.slice(2);

if (!email || !nome) {
  console.error('uso: node scripts/criar-usuario.mjs "email" "Nome Completo" [admin|operacao|atendimento|leitura]');
  process.exit(1);
}
if (!["admin", "operacao", "atendimento", "leitura"].includes(papel)) {
  console.error(`papel invalido: ${papel}`);
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL nao esta no ambiente. Rode com o env do servico.");
  process.exit(1);
}

const senha = await perguntarEscondido(`senha para ${email} (nao aparece): `);
const senha2 = await perguntarEscondido("digite de novo:                    ");

if (senha !== senha2) {
  console.error("as senhas nao batem.");
  process.exit(1);
}
if (senha.length < 10) {
  console.error(`senha curta demais (${senha.length}). Minimo 10.`);
  process.exit(1);
}

const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
await cliente.connect();

const r = await cliente.query(
  `insert into usuario (email, nome, papel, senha_hash, ativo)
   values ($1, $2, $3::papel_usuario, $4, true)
   on conflict (email) do update
     set nome = excluded.nome, papel = excluded.papel,
         senha_hash = excluded.senha_hash, ativo = true
   returning id, (xmax = 0) as criado`,
  [email, nome, papel, hashSenha(senha)],
);

// Trocar a senha derruba as sessoes abertas: se a troca foi por suspeita de
// invasao, deixar sessao viva anula o motivo da troca.
await cliente.query(
  "update sessao_painel set revogada_em = now() where usuario_id = $1 and revogada_em is null",
  [r.rows[0].id],
);

console.log(r.rows[0].criado ? `usuario CRIADO: ${email} (${papel})` : `senha ATUALIZADA: ${email} (${papel})`);
console.log("sessoes anteriores revogadas.");
await cliente.end();
