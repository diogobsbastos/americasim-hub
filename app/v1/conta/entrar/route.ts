import { autenticar, erro } from "../../../../lib/api";
import { db } from "../../../../lib/db";
import { assinarSessao, conferirSenha } from "../../../../lib/conta";

export const dynamic = "force-dynamic";

// POST /v1/conta/entrar {email, senha}. Erro unico e generico de proposito:
// distinguir "email nao existe" de "senha errada" e presente para atacante.
export async function POST(req: Request) {
  const canal = await autenticar(req, "pedidos");
  if (canal instanceof Response) return canal;

  let corpo: any;
  try {
    corpo = await req.json();
  } catch {
    return erro(400, "corpo_invalido", "JSON invalido.");
  }
  const email = String(corpo?.email ?? "").trim().toLowerCase();
  const senha = String(corpo?.senha ?? "");
  if (!email.includes("@") || !senha) {
    return erro(401, "credenciais_invalidas", "E-mail ou senha incorretos.");
  }

  const r = await db.query(
    `select id, senha_hash, verificado from conta_cliente where email = $1`,
    [email],
  );
  const c = r.rows[0];
  if (!c || !conferirSenha(senha, c.senha_hash)) {
    return erro(401, "credenciais_invalidas", "E-mail ou senha incorretos.");
  }

  await db.query(`update conta_cliente set ultimo_login_em = now() where id = $1`, [c.id]);
  return Response.json({ sessao: assinarSessao(c.id), verificado: c.verificado === true });
}
