"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiPost } from "../../lib/vitrine";
import { COOKIE_SESSAO, DIAS_SESSAO } from "../../lib/conta";
import type { EstadoConta } from "./tipos";

// As acoes de conta da vitrine: falam com /v1/conta/* (nunca com o banco) e
// guardam a sessao em cookie httpOnly — o navegador nunca ve o token via JS.

async function gravarSessao(sessao: string) {
  const c = await cookies();
  c.set(COOKIE_SESSAO, sessao, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: DIAS_SESSAO * 86400,
  });
}

export async function entrar(_anterior: EstadoConta, form: FormData): Promise<EstadoConta> {
  const email = String(form.get("email") ?? "").trim();
  const senha = String(form.get("senha") ?? "");
  if (!email.includes("@") || !senha) return { erro: "Preencha e-mail e senha." };

  const r = await apiPost("/v1/conta/entrar", { email, senha });
  if (!r.ok) return { erro: r.erro_mensagem };

  await gravarSessao(String(r.dados?.sessao ?? ""));
  redirect("/conta");
}

export async function criarConta(_anterior: EstadoConta, form: FormData): Promise<EstadoConta> {
  const email = String(form.get("email") ?? "").trim();
  const senha = String(form.get("senha") ?? "");
  const senha2 = String(form.get("senha2") ?? "");
  if (!email.includes("@")) return { erro: "Informe um e-mail valido." };
  if (senha.length < 8) return { erro: "A senha precisa de pelo menos 8 caracteres." };
  if (senha !== senha2) return { erro: "As senhas nao conferem." };

  const r = await apiPost("/v1/conta/criar", { email, senha });
  if (!r.ok) return { erro: r.erro_mensagem };

  await gravarSessao(String(r.dados?.sessao ?? ""));
  redirect("/conta");
}

export async function sair(): Promise<void> {
  const c = await cookies();
  c.delete(COOKIE_SESSAO);
  redirect("/conta/entrar");
}
