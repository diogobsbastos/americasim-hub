import { autenticar, erro } from "../../../../lib/api";
import { db } from "../../../../lib/db";
import { conferirSenha, hashSenha, verificarSessao } from "../../../../lib/conta";

export const dynamic = "force-dynamic";

// POST /v1/conta/senha {sessao, senha_atual, senha_nova} — troca (ou CRIA) a
// senha do cliente. Conta que nasceu pelo Google nao tem senha_hash: nesse
// caso nao existe "senha atual" para conferir e o formulario vira "criar uma
// senha" — o cliente ganha um segundo caminho de entrada, nao perde nada.
//
// As sessoes do cliente sao tokens HMAC stateless (id.exp.mac), entao trocar a
// senha NAO derruba sessoes abertas em outros aparelhos — elas expiram no
// prazo. E uma limitacao conhecida do desenho; revogacao exigiria sessao em
// tabela como a do painel.
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

  const senhaNova = String(corpo?.senha_nova ?? "");
  if (senhaNova.length < 8) {
    return erro(400, "senha_curta", "A nova senha precisa ter pelo menos 8 caracteres.");
  }
  if (senhaNova.length > 200) {
    return erro(400, "senha_longa", "A senha pode ter no maximo 200 caracteres.");
  }

  const r = await db.query(
    `select senha_hash from conta_cliente where id = $1`,
    [contaId],
  );
  if (r.rows.length === 0) return erro(401, "sessao_invalida", "Entre de novo na sua conta.");
  const hashAtual: string | null = r.rows[0].senha_hash ?? null;

  if (hashAtual !== null) {
    // Ja tem senha: exigir a atual. Erro GENERICO de proposito — esta rota nao
    // confirma para ninguem qual senha esta certa ou errada.
    const senhaAtual = String(corpo?.senha_atual ?? "");
    if (!conferirSenha(senhaAtual, hashAtual)) {
      return erro(400, "senha_atual_errada", "A senha atual nao confere.");
    }
  }

  await db.query(
    `update conta_cliente set senha_hash = $2 where id = $1`,
    [contaId, hashSenha(senhaNova)],
  );

  return Response.json({ ok: true, criou: hashAtual === null });
}
