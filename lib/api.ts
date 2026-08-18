import { createHash, randomUUID } from "node:crypto";
import { db } from "./db";

// Contrato SPEC/03: erro estruturado, canal derivado da chave, escopos.

export type Canal = { id: string; codigo: string; nome: string; moeda: string };

export function requisicaoId(): string {
  return "req_" + randomUUID().replace(/-/g, "").slice(0, 24);
}

export function erro(
  status: number,
  codigo: string,
  mensagem: string,
  detalhe?: unknown,
): Response {
  return Response.json(
    { erro: { codigo, mensagem, detalhe: detalhe ?? null, requisicao_id: requisicaoId() } },
    { status },
  );
}

// Bearer ask_... -> SHA-256 -> chave_api -> canal.
// A vitrine NUNCA escolhe o canal: ele e derivado da chave (SPEC/03 par.1).
export async function autenticar(req: Request, escopo: string): Promise<Canal | Response> {
  const auth = req.headers.get("authorization") ?? "";
  const m = auth.match(/^Bearer\s+(ask_[A-Za-z0-9_-]{10,})$/);
  if (!m) return erro(401, "nao_autenticado", "Chave ausente ou mal formada.");

  const hash = createHash("sha256").update(m[1]).digest("hex");
  const r = await db.query(
    `select c.id, c.codigo, c.nome, c.moeda, k.escopos, k.id as chave_id
       from chave_api k
       join canal c on c.id = k.canal_id
      where k.chave_hash = $1 and k.revogada_em is null and c.ativo`,
    [hash],
  );
  if (r.rows.length === 0) return erro(401, "nao_autenticado", "Chave invalida ou revogada.");

  const row = r.rows[0];
  if (!row.escopos.includes(escopo)) {
    return erro(403, "escopo_insuficiente", `Escopo '${escopo}' necessario.`);
  }

  // ultimo_uso e assincrono, nunca no caminho critico (SPEC/03 par.2).
  db.query("update chave_api set ultimo_uso = now() where id = $1", [row.chave_id]).catch(() => {});

  return { id: row.id, codigo: row.codigo, nome: row.nome, moeda: row.moeda };
}
