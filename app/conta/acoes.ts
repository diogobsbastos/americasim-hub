"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiPost } from "../../lib/vitrine";
import { COOKIE_SESSAO, DIAS_SESSAO } from "../../lib/conta";
import type { EstadoConta, EstadoPerfil } from "./tipos";

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

// Reenvia o e-mail de confirmacao. Devolve estado (e nao redirect) para a
// pessoa ver a confirmacao NA MESMA tela onde clicou — sem recarregar e sem
// perder o lugar.
export async function reenviarVerificacao(
  _anterior: EstadoPerfil,
  _form: FormData,
): Promise<EstadoPerfil> {
  const c = await cookies();
  const sessao = c.get(COOKIE_SESSAO)?.value ?? "";
  if (!sessao) redirect("/conta/entrar");

  const r = await apiPost("/v1/conta/reenviar", { sessao });
  if (!r.ok) {
    if (r.erro_codigo === "sessao_invalida") redirect("/conta/entrar");
    return { erro: r.erro_mensagem, ok: "" };
  }
  if (r.dados?.ja_verificado) {
    return { erro: "", ok: "Seu e-mail já está confirmado — recarregue a página." };
  }
  return { erro: "", ok: "E-mail enviado! Confira sua caixa de entrada (e o spam)." };
}
