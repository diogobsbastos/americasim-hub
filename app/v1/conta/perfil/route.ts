import { autenticar, erro } from "../../../../lib/api";
import { db } from "../../../../lib/db";
import { verificarSessao } from "../../../../lib/conta";

export const dynamic = "force-dynamic";

// POST /v1/conta/perfil {sessao} — o minimo sobre a conta logada para
// pre-preencher o checkout: e-mail, nome e WhatsApp. POST porque a sessao vai
// no corpo (em GET ela cairia no access log do Nginx).
//
// Diferente de /v1/conta/pedidos, aqui NAO se exige conta verificada: a pessoa
// so ve os proprios dados de cadastro, nao os pedidos — e travar o checkout de
// quem ainda nao clicou no e-mail de confirmacao seria perder a venda.
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

  const r = await db.query(
    `select cc.email::text as email, c.nome, c.telefone,
            (cc.senha_hash is not null) as tem_senha
       from conta_cliente cc
       left join cliente c on lower(c.email::text) = lower(cc.email::text)
      where cc.id = $1`,
    [contaId],
  );
  if (r.rows.length === 0) return erro(401, "sessao_invalida", "Entre de novo na sua conta.");

  const p = r.rows[0];

  // `backend`: este e-mail tambem e um usuario ATIVO do backoffice? A vitrine
  // usa isso so para MOSTRAR o botao "Abrir o backend" — a entrada de verdade
  // continua guardada pela sessao propria do painel (cookie painel_sessao).
  const adm = await db.query(
    `select 1 from usuario where lower(email::text) = lower($1) and ativo`,
    [p.email],
  );

  return Response.json({
    email: p.email,
    nome: p.nome ?? null,
    telefone: p.telefone ?? null,
    // Conta que entrou so pelo Google nao tem senha: a tela de perfil oferece
    // "criar senha" (sem pedir a atual) em vez de "trocar senha".
    tem_senha: p.tem_senha === true,
    backend: adm.rows.length > 0,
  });
}
