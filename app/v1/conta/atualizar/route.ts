import { autenticar, erro } from "../../../../lib/api";
import { db } from "../../../../lib/db";
import { verificarSessao } from "../../../../lib/conta";
import { normalizarZap } from "../../../../lib/telefone";

export const dynamic = "force-dynamic";

// POST /v1/conta/atualizar {sessao, nome, telefone} — o cliente edita o
// PROPRIO cadastro (nome e WhatsApp). O e-mail nao muda por aqui de proposito:
// ele e a chave que liga conta, pedidos e links assinados — trocar e-mail e um
// fluxo com confirmacao propria, nao um campo de formulario.
export async function POST(req: Request) {
  const canal = await autenticar(req, "pedidos");
  if (canal instanceof Response) return canal;

  let corpo: any;
  try {
    corpo = await req.json();
  } catch {
    return erro(400, "corpo_invalido", "JSON invalido.");
  }
  const contaId = verificarSessao(String(corpo?.sessao ?? ""));
  if (!contaId) return erro(401, "sessao_invalida", "Entre de novo na sua conta.");

  const nome = String(corpo?.nome ?? "").trim().slice(0, 120) || null;

  // WhatsApp: vazio LIMPA (direito do cliente); preenchido tem que ser valido.
  const brutoTelefone = String(corpo?.telefone ?? "").trim();
  let telefone: string | null = null;
  if (brutoTelefone) {
    telefone = normalizarZap(brutoTelefone);
    if (!telefone) {
      return erro(400, "telefone_invalido", "Informe um WhatsApp valido com DDD — ex.: (11) 91234-5678.");
    }
  }

  const conta = await db.query(
    `select email::text as email from conta_cliente where id = $1`,
    [contaId],
  );
  if (conta.rows.length === 0) return erro(401, "sessao_invalida", "Entre de novo na sua conta.");
  const email = String(conta.rows[0].email).toLowerCase();

  // Upsert: quem criou conta antes de comprar ainda nao tem linha em `cliente`.
  await db.query(
    `insert into cliente (email, nome, telefone)
          values ($1, $2, $3)
     on conflict (email) where email is not null
       do update set nome = excluded.nome,
                     telefone = excluded.telefone`,
    [email, nome, telefone],
  );

  return Response.json({ ok: true, nome, telefone });
}
