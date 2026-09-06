import { autenticar, erro } from "../../../../lib/api";
import { db } from "../../../../lib/db";
import { contaDoTokenVerificacao } from "../../../../lib/token";
import { bater, ipDaRequisicao, respostaFreio } from "../../../../lib/limite";

export const dynamic = "force-dynamic";

// Freio: o token e assinado (nao se adivinha), mas sem limite alguem poderia
// martelar a rota so para gastar CPU. 20 por IP a cada 10 min e folgado para
// quem clica no link e apertado para robo.
const JANELA_MS = 10 * 60 * 1000;
const MAX_POR_IP = 20;

// POST /v1/conta/verificar {token} — confirma que o e-mail e mesmo do dono.
// Ate aqui a conta criada por senha nascia e MORRIA nao verificada: /v1/conta/
// pedidos recusa conta nao verificada, entao ela nunca via pedido nenhum.
//
// Idempotente de proposito: clicar duas vezes no link do e-mail responde
// sucesso, e nao um erro — do ponto de vista do cliente, funcionou.
export async function POST(req: Request) {
  const canal = await autenticar(req, "pedidos");
  if (canal instanceof Response) return canal;

  const freio = bater(`verificar:ip:${ipDaRequisicao(req)}`, MAX_POR_IP, JANELA_MS);
  if (!freio.ok) return respostaFreio(freio.esperaSegundos);

  let corpo: any;
  try {
    corpo = await req.json();
  } catch {
    return erro(400, "corpo_invalido", "JSON invalido.");
  }

  const contaId = contaDoTokenVerificacao(String(corpo?.token ?? ""));
  if (!contaId) {
    return erro(400, "token_invalido", "Este link de confirmacao e invalido ou ja venceu. Peca um novo na sua conta.");
  }

  const r = await db.query(
    `update conta_cliente
        set verificado = true
      where id = $1
      returning email::text as email`,
    [contaId],
  );
  if (r.rows.length === 0) {
    return erro(400, "token_invalido", "Conta nao encontrada.");
  }

  return Response.json({ ok: true, email: r.rows[0].email });
}
