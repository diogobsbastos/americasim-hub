"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiPost } from "../../../lib/vitrine";
import { COOKIE_SESSAO } from "../../../lib/conta";
import type { EstadoPerfil } from "../tipos";

// Acoes do "Meu perfil": como todas as acoes da vitrine, falam com /v1/conta/*
// pela API (nunca com o banco) usando a sessao do cookie httpOnly.

async function sessaoAtual(): Promise<string> {
  const c = await cookies();
  return c.get(COOKIE_SESSAO)?.value ?? "";
}

export async function salvarPerfil(_anterior: EstadoPerfil, form: FormData): Promise<EstadoPerfil> {
  const sessao = await sessaoAtual();
  if (!sessao) redirect("/conta/entrar");

  const nome = String(form.get("nome") ?? "").trim();
  const telefone = String(form.get("telefone") ?? "").trim();

  const r = await apiPost("/v1/conta/atualizar", { sessao, nome, telefone });
  if (!r.ok) {
    if (r.erro_codigo === "sessao_invalida") redirect("/conta/entrar");
    return { erro: r.erro_mensagem, ok: "" };
  }
  return { erro: "", ok: "Dados salvos." };
}

export async function trocarSenha(_anterior: EstadoPerfil, form: FormData): Promise<EstadoPerfil> {
  const sessao = await sessaoAtual();
  if (!sessao) redirect("/conta/entrar");

  const senhaAtual = String(form.get("senha_atual") ?? "");
  const senhaNova = String(form.get("senha_nova") ?? "");
  const senhaNova2 = String(form.get("senha_nova2") ?? "");
  if (senhaNova.length < 8) return { erro: "A nova senha precisa de pelo menos 8 caracteres.", ok: "" };
  if (senhaNova !== senhaNova2) return { erro: "As senhas novas nao conferem.", ok: "" };

  const r = await apiPost("/v1/conta/senha", { sessao, senha_atual: senhaAtual, senha_nova: senhaNova });
  if (!r.ok) {
    if (r.erro_codigo === "sessao_invalida") redirect("/conta/entrar");
    return { erro: r.erro_mensagem, ok: "" };
  }
  return {
    erro: "",
    ok: r.dados?.criou ? "Senha criada! Agora você também entra com e-mail e senha." : "Senha alterada.",
  };
}
