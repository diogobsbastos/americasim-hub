import { autenticar, erro } from "../../../../lib/api";
import { db } from "../../../../lib/db";
import { assinarSessao, conferirSenha } from "../../../../lib/conta";
import { bater, ipDaRequisicao, perdoar, respostaFreio } from "../../../../lib/limite";

// Freio de forca bruta (auditoria 06/09). Dois limites, de proposito:
// por E-MAIL (protege a conta especifica) e por IP (protege contra varredura de
// muitas contas de uma vez). O do IP e mais folgado porque um escritorio ou uma
// operadora movel poe muita gente atras do mesmo endereco.
const JANELA_MS = 10 * 60 * 1000;
const MAX_POR_EMAIL = 10;
const MAX_POR_IP = 30;

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
  // `> 200`: nenhuma senha legitima passa disso (criar impoe o mesmo teto) e
  // corta o custo de scrypt sobre entradas gigantes. Erro generico, como tudo aqui.
  if (!email.includes("@") || !senha || senha.length > 200) {
    return erro(401, "credenciais_invalidas", "E-mail ou senha incorretos.");
  }

  // O freio vem ANTES do scrypt: negar cedo e o que impede o ataque de custar
  // CPU nossa. As chaves incluem o escopo para nao colidir com outras rotas.
  const chaveEmail = `entrar:email:${email}`;
  const chaveIp = `entrar:ip:${ipDaRequisicao(req)}`;
  const porEmail = bater(chaveEmail, MAX_POR_EMAIL, JANELA_MS);
  if (!porEmail.ok) return respostaFreio(porEmail.esperaSegundos);
  const porIp = bater(chaveIp, MAX_POR_IP, JANELA_MS);
  if (!porIp.ok) return respostaFreio(porIp.esperaSegundos);

  const r = await db.query(
    `select id, senha_hash, verificado from conta_cliente where email = $1`,
    [email],
  );
  const c = r.rows[0];
  if (!c || !conferirSenha(senha, c.senha_hash)) {
    return erro(401, "credenciais_invalidas", "E-mail ou senha incorretos.");
  }

  // Acertou: zera o contador do e-mail. O do IP fica — ele mede varredura, e
  // um acerto no meio de uma varredura nao a torna legitima.
  perdoar(chaveEmail);
  await db.query(`update conta_cliente set ultimo_login_em = now() where id = $1`, [c.id]);
  return Response.json({ sessao: assinarSessao(c.id), verificado: c.verificado === true });
}
