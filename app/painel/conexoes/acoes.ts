"use server";

// ATENCAO: so exporta FUNCOES ASSINCRONAS. Os estados iniciais moram em ./tipos.

import { revalidatePath } from "next/cache";
import { apagarCredencial } from "../../../lib/canal-credencial";
import { conectorPorTipo } from "../../../lib/conectores";
import { db } from "../../../lib/db";
import { auditar, usuarioDaSessao } from "../../../lib/painel/sessao";
import type { EstadoConexao } from "./tipos";

const PODE_MEXER = ["admin"];

async function autorizar(): Promise<{ id: string } | EstadoConexao> {
  const u = await usuarioDaSessao();
  if (!u) return { erro: "Sessão expirada. Entre de novo.", ok: "" };
  // Conectar um marketplace e dar a um sistema o direito de publicar e vender em
  // nome da empresa. Isso e decisao de admin, nao de operacao.
  if (!PODE_MEXER.includes(u.papel)) {
    return { erro: "Só um admin pode mexer nas conexões.", ok: "" };
  }
  return { id: u.id };
}

export async function salvarClientId(
  _anterior: EstadoConexao,
  form: FormData,
): Promise<EstadoConexao> {
  const u = await autorizar();
  if ("erro" in u) return u;

  const tipo = String(form.get("tipo") ?? "");
  const c = conectorPorTipo(tipo);
  if (!c) return { erro: "Conector desconhecido.", ok: "" };
  if (!c.disponivel) return { erro: `${c.nome} ainda não pode ser conectado.`, ok: "" };

  const clientId = String(form.get("client_id") ?? "").trim();
  // O Client ID do ML e numerico e longo. Recusar lixo aqui evita descobrir o
  // erro so no meio do vaivem do OAuth, onde a mensagem do marketplace nao
  // ajuda ninguem.
  if (!/^[A-Za-z0-9._-]{6,120}$/.test(clientId)) {
    return { erro: "Client ID inválido. Copie exatamente o que aparece no painel do desenvolvedor.", ok: "" };
  }
  // Cinto: se alguem colar a SENHA no lugar do ID, nao gravar no banco.
  if (/^APP_USR|^TG-/.test(clientId)) {
    return {
      erro: "Isso parece um token, não o Client ID. Token e senha nunca vão para o banco — a senha vai para o .env pelo SSH.",
      ok: "",
    };
  }

  const cl = await db.connect();
  try {
    await cl.query("begin");
    await cl.query(
      `insert into parametro (chave, valor, tipo, descricao, atualizado_em, atualizado_por)
       values ($1, $2, 'texto', $3, now(), $4)
       on conflict (chave) do update
         set valor = excluded.valor, atualizado_em = now(), atualizado_por = excluded.atualizado_por`,
      [c.paramClientId, clientId, `Client ID publico da aplicacao ${c.nome}`, u.id],
    );
    // O canal e criado junto: sem ele nao ha onde pendurar credencial, anuncio
    // nem pedido. Inativo de proposito — quem liga e a autorizacao.
    await cl.query(
      `insert into canal (codigo, nome, tipo, moeda, ativo)
       values ($1, $2, $3::tipo_canal, 'BRL', false)
       on conflict (codigo) do nothing`,
      [c.tipo, c.nome, c.tipo],
    );
    await cl.query("commit");
  } catch (e: any) {
    await cl.query("rollback").catch(() => {});
    console.error("salvarClientId:", e);
    return { erro: "Falha ao gravar. Nada foi alterado.", ok: "" };
  } finally {
    cl.release();
  }

  await auditar("conexao.client_id", {
    usuarioId: u.id, entidade: "parametro",
    depois: { conector: c.tipo, chave: c.paramClientId },
  });
  revalidatePath("/painel/conexoes");
  return { erro: "", ok: `Client ID do ${c.nome} guardado.` };
}

export async function desconectar(
  _anterior: EstadoConexao,
  form: FormData,
): Promise<EstadoConexao> {
  const u = await autorizar();
  if ("erro" in u) return u;

  const tipo = String(form.get("tipo") ?? "");
  const c = conectorPorTipo(tipo);
  if (!c) return { erro: "Conector desconhecido.", ok: "" };

  const q = await db.query("select id from canal where tipo = $1::tipo_canal limit 1", [c.tipo]);
  const canalId = q.rows[0]?.id;
  if (!canalId) return { erro: "Este canal não existe.", ok: "" };

  // Desconectar apaga a credencial e DESLIGA o canal. Deixar o canal ativo sem
  // credencial faria o hub tentar publicar e falhar em silencio a cada ciclo.
  await apagarCredencial(canalId);
  await db.query("update canal set ativo = false where id = $1", [canalId]);

  await auditar("conexao.desconectar", {
    usuarioId: u.id, entidade: "canal", entidadeId: canalId, depois: { conector: c.tipo },
  });
  revalidatePath("/painel/conexoes");
  return { erro: "", ok: `${c.nome} desconectado. Os anúncios continuam lá, mas o hub para de sincronizar.` };
}
