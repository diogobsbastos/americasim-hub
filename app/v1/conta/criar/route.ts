import { autenticar, erro } from "../../../../lib/api";
import { db } from "../../../../lib/db";
import { assinarSessao, hashSenha } from "../../../../lib/conta";
import { bater, ipDaRequisicao, respostaFreio } from "../../../../lib/limite";

// Freio de criacao em massa (auditoria 06/09): sem isto, um robo enche
// `conta_cliente` de contas e nos custa um scrypt por linha.
const JANELA_CRIAR_MS = 60 * 60 * 1000;
const MAX_CONTAS_POR_IP = 5;

export const dynamic = "force-dynamic";

// POST /v1/conta/criar {email, senha} — cria a conta do cliente (migracao 012).
// A conta nasce NAO verificada: ate o e-mail ser confirmado, ela nao enxerga
// pedido nenhum (ver /v1/conta/pedidos). Sem isso, qualquer um criaria conta
// com o e-mail de outra pessoa e levaria os QRs dela.
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
  if (!email.includes("@")) return erro(400, "email_invalido", "Informe um e-mail valido.");
  if (senha.length < 8) return erro(400, "senha_curta", "A senha precisa de pelo menos 8 caracteres.");
  // Teto: scrypt processa a entrada inteira — senha de megabytes e CPU de
  // graca para atacante (auditoria 06/09). 200 chars cobre qualquer gerenciador.
  if (senha.length > 200) return erro(400, "senha_longa", "A senha pode ter no maximo 200 caracteres.");

  const freio = bater(`criar:ip:${ipDaRequisicao(req)}`, MAX_CONTAS_POR_IP, JANELA_CRIAR_MS);
  if (!freio.ok) return respostaFreio(freio.esperaSegundos);

  const r = await db.query(
    `insert into conta_cliente (email, senha_hash)
          values ($1, $2)
     on conflict (email) do nothing
       returning id`,
    [email, hashSenha(senha)],
  );
  if (r.rows.length === 0) {
    return erro(409, "conta_existente", "Ja existe uma conta com este e-mail. Entre com a sua senha ou com o Google.");
  }

  return Response.json({ sessao: assinarSessao(r.rows[0].id), verificado: false });
}
