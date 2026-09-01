"use server";

// ATENCAO: so exporta FUNCOES ASSINCRONAS. Estados iniciais moram em ./tipos.

import { revalidatePath } from "next/cache";
import { salvarSegredoApp } from "../../../lib/segredo-app";
import {
  SEG_GMAIL_SENHA, SEG_GMAIL_USUARIO, SEG_GOOGLE_ID, SEG_GOOGLE_SECRET,
  testarCredencialGoogle, testarSmtpGmail,
} from "../../../lib/google";
import { auditar, usuarioDaSessao } from "../../../lib/painel/sessao";
import type { EstadoGoogle } from "./tipos";

const CAMINHO = "/painel/google";

async function autorizar(): Promise<{ id: string } | { erro: string }> {
  const u = await usuarioDaSessao();
  if (!u) return { erro: "Sessão expirada. Entre de novo." };
  if (u.papel !== "admin") return { erro: "Só admin mexe em credenciais." };
  return { id: u.id };
}

// Colagem tolerante: tira rotulo, espacos e quebras — senha de app do Google
// vem exibida como "abcd efgh ijkl mnop" e TEM que ser colavel do jeito que veio.
function limpar(v: unknown): string {
  return String(v ?? "")
    .replace(/^\s*(client\s*id|client\s*secret|senha|usuario|user)\s*[:：=]\s*/i, "")
    .replace(/[\s​ 　]+/g, "")
    .trim();
}

export async function salvarLoginGoogle(_a: EstadoGoogle, form: FormData): Promise<EstadoGoogle> {
  const u = await autorizar();
  if ("erro" in u) return { erro: u.erro, ok: "", previa: "" };

  const clientId = limpar(form.get("client_id"));
  const clientSecret = limpar(form.get("client_secret"));
  if (clientId && !/\.apps\.googleusercontent\.com$/.test(clientId)) {
    return { erro: "Client ID estranho: deveria terminar em .apps.googleusercontent.com.", ok: "", previa: "" };
  }
  if (!clientId && !clientSecret) return { erro: "Cole pelo menos um dos dois campos.", ok: "", previa: "" };

  if (clientId) await salvarSegredoApp(SEG_GOOGLE_ID, clientId, u.id);
  if (clientSecret) await salvarSegredoApp(SEG_GOOGLE_SECRET, clientSecret, u.id);
  await auditar("google.login.chaves", {
    usuarioId: u.id, entidade: "parametro",
    depois: { clientId: clientId ? "gravado" : "mantido", clientSecret: clientSecret ? "gravado" : "mantido" },
  });
  revalidatePath(CAMINHO);
  return { erro: "", ok: "Guardado no cofre. Clique em Testar credencial.", previa: "" };
}

export async function salvarGmail(_a: EstadoGoogle, form: FormData): Promise<EstadoGoogle> {
  const u = await autorizar();
  if ("erro" in u) return { erro: u.erro, ok: "", previa: "" };

  const usuario = limpar(form.get("usuario")).toLowerCase();
  const senha = limpar(form.get("senha_app"));
  if (usuario && !usuario.includes("@")) return { erro: "Usuário deve ser o e-mail completo (ex.: americasimti@gmail.com).", ok: "", previa: "" };
  if (senha && senha.length !== 16) {
    return { erro: `Senha de app tem 16 caracteres — chegaram ${senha.length}. Cole exatamente o que o Google mostrou.`, ok: "", previa: "" };
  }
  if (!usuario && !senha) return { erro: "Cole pelo menos um dos dois campos.", ok: "", previa: "" };

  if (usuario) await salvarSegredoApp(SEG_GMAIL_USUARIO, usuario, u.id);
  if (senha) await salvarSegredoApp(SEG_GMAIL_SENHA, senha, u.id);
  await auditar("google.gmail.chaves", {
    usuarioId: u.id, entidade: "parametro",
    depois: { usuario: usuario || "mantido", senhaApp: senha ? "gravada" : "mantida" },
  });
  revalidatePath(CAMINHO);
  return { erro: "", ok: "Guardado no cofre. Clique em Testar Gmail.", previa: "" };
}

export async function testarLoginGoogleAcao(_a: EstadoGoogle): Promise<EstadoGoogle> {
  const u = await autorizar();
  if ("erro" in u) return { erro: u.erro, ok: "", previa: "" };
  const r = await testarCredencialGoogle();
  return r.ok ? { erro: "", ok: r.resumo, previa: r.corpo } : { erro: r.resumo, ok: "", previa: r.corpo };
}

export async function testarGmailAcao(_a: EstadoGoogle): Promise<EstadoGoogle> {
  const u = await autorizar();
  if ("erro" in u) return { erro: u.erro, ok: "", previa: "" };
  const r = await testarSmtpGmail();
  return r.ok ? { erro: "", ok: r.resumo, previa: r.dialogo } : { erro: r.resumo, ok: "", previa: r.dialogo };
}
