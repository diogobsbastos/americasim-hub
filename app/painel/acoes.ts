"use server";

import { redirect } from "next/navigation";
import { db } from "../../lib/db";
import {
  auditar,
  conferirSenha,
  criarSessao,
  encerrarSessao,
  excedeuTentativas,
  usuarioDaSessao,
} from "../../lib/painel/sessao";
import type { EstadoEntrar } from "./tipos";

// A mesma mensagem para e-mail inexistente e senha errada, de proposito: mensagem
// diferente vira ferramenta para descobrir quais e-mails existem.
const GENERICA = "E-mail ou senha incorretos.";

export async function entrar(_anterior: EstadoEntrar, form: FormData): Promise<EstadoEntrar> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const senha = String(form.get("senha") ?? "");

  if (!email || !senha) return { erro: "Preencha e-mail e senha." };

  if (await excedeuTentativas()) {
    await auditar("painel.login.bloqueado", { depois: { email } });
    return { erro: "Muitas tentativas deste endereco. Espere 15 minutos." };
  }

  const r = await db.query(
    "select id, senha_hash, ativo from usuario where lower(email::text) = $1",
    [email],
  );

  const linha = r.rows[0];
  const senhaOk = linha ? conferirSenha(senha, linha.senha_hash) : false;

  if (!linha || !linha.ativo || !senhaOk) {
    await auditar("painel.login.falha", { depois: { email } });
    return { erro: GENERICA };
  }

  await criarSessao(linha.id);
  await auditar("painel.login.sucesso", { usuarioId: linha.id });
  redirect("/painel");
}

export async function sair(): Promise<void> {
  const u = await usuarioDaSessao();
  if (u) await auditar("painel.logout", { usuarioId: u.id });
  await encerrarSessao();
  redirect("/entrar");
}
