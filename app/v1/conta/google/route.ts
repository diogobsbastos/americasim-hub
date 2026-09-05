import { autenticar, erro } from "../../../../lib/api";
import { db } from "../../../../lib/db";
import { assinarSessao } from "../../../../lib/conta";
import { auditar, novaSessaoToken } from "../../../../lib/painel/sessao";

export const dynamic = "force-dynamic";

// POST /v1/conta/google {sub, email, email_verificado} — chamado PELA VITRINE
// depois de ela completar o OAuth com o Google e validar o id_token. A chave de
// canal e o que autoriza: este endpoint confia que quem a possui ja verificou a
// identidade junto ao Google (o codigo do OAuth vive em app/conta/google/).
//
// Ordem de encontro: 1) google_sub (login repetido), 2) email (conta de senha
// que ganha o Google e a verificacao junto), 3) conta nova ja verificada.
export async function POST(req: Request) {
  const canal = await autenticar(req, "pedidos");
  if (canal instanceof Response) return canal;

  let corpo: any;
  try {
    corpo = await req.json();
  } catch {
    return erro(400, "corpo_invalido", "JSON invalido.");
  }
  const sub = String(corpo?.sub ?? "").trim();
  const email = String(corpo?.email ?? "").trim().toLowerCase();
  const emailVerificado = corpo?.email_verificado === true;
  if (!sub || !email.includes("@")) {
    return erro(400, "corpo_invalido", "sub e email sao obrigatorios.");
  }

  const porSub = await db.query(`select id from conta_cliente where google_sub = $1`, [sub]);
  let id: string;
  if (porSub.rows.length > 0) {
    id = porSub.rows[0].id;
    await db.query(`update conta_cliente set ultimo_login_em = now() where id = $1`, [id]);
  } else {
    const porEmail = await db.query(`select id from conta_cliente where email = $1`, [email]);
    if (porEmail.rows.length > 0) {
      id = porEmail.rows[0].id;
      await db.query(
        `update conta_cliente
            set google_sub = $2,
                verificado = verificado or $3,
                ultimo_login_em = now()
          where id = $1`,
        [id, sub, emailVerificado],
      );
    } else {
      const nova = await db.query(
        `insert into conta_cliente (email, google_sub, verificado, ultimo_login_em)
              values ($1, $2, $3, now())
           returning id`,
        [email, sub, emailVerificado],
      );
      id = nova.rows[0].id;
    }
  }

  // ---- SSO do backoffice -------------------------------------------------
  // Se este e-mail do Google (VERIFICADO) pertence a um usuario ATIVO do
  // painel, o mesmo login tambem abre o backend: o Google substitui a SENHA,
  // nunca a autorizacao — quem pode entrar continua sendo definido pela tabela
  // `usuario`, a mesma fonte da tela de login por senha. A sessao criada e a
  // sessao opaca de sempre (12h, revogavel, auditada).
  //
  // Guarda extra: so quando a chamada veio DIRETO do loopback (a vitrine
  // falando com a API dentro da maquina). Requisicao que passou pelo Nginx
  // carrega X-Forwarded-For — essa nao ganha sessao de painel, mesmo com a
  // chave de canal certa: chave de vitrine vazada nao pode virar backoffice.
  let painel: string | undefined;
  const veioDeFora = Boolean(req.headers.get("x-forwarded-for") || req.headers.get("x-forwarded-host"));
  if (emailVerificado && !veioDeFora) {
    const adm = await db.query(
      `select id, nome from usuario where lower(email::text) = $1 and ativo`,
      [email],
    );
    if (adm.rows.length > 0) {
      painel = await novaSessaoToken(adm.rows[0].id);
      await auditar("painel.login.google", { usuarioId: adm.rows[0].id });
    }
  }

  return Response.json({ sessao: assinarSessao(id), ...(painel ? { painel } : {}) });
}
