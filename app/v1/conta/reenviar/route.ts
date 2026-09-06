import { autenticar, erro } from "../../../../lib/api";
import { db } from "../../../../lib/db";
import { verificarSessao } from "../../../../lib/conta";
import { enfileirarVerificacao } from "../../../../lib/verificacao";
import { bater, ipDaRequisicao, respostaFreio } from "../../../../lib/limite";

export const dynamic = "force-dynamic";

// Freio apertado: cada chamada bem-sucedida vira um E-MAIL de verdade na caixa
// de alguem. 3 por conta a cada 15 min e o bastante para quem nao achou o
// primeiro; mais que isso e abuso (ou nos virando ferramenta de spam).
const JANELA_MS = 15 * 60 * 1000;
const MAX_POR_CONTA = 3;
const MAX_POR_IP = 10;

// POST /v1/conta/reenviar {sessao} — reenvia o e-mail de confirmacao.
// Exige SESSAO, e nao e-mail solto: assim ninguem usa esta rota para descobrir
// quais e-mails tem conta aqui, nem para bombardear a caixa de terceiros.
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

  const freio = bater(`reenviar:conta:${contaId}`, MAX_POR_CONTA, JANELA_MS);
  if (!freio.ok) return respostaFreio(freio.esperaSegundos);
  const freioIp = bater(`reenviar:ip:${ipDaRequisicao(req)}`, MAX_POR_IP, JANELA_MS);
  if (!freioIp.ok) return respostaFreio(freioIp.esperaSegundos);

  const r = await db.query(`select verificado from conta_cliente where id = $1`, [contaId]);
  if (r.rows.length === 0) return erro(401, "sessao_invalida", "Entre de novo na sua conta.");
  if (r.rows[0].verificado === true) {
    return Response.json({ ok: true, ja_verificado: true });
  }

  const enfileirou = await enfileirarVerificacao(contaId, canal.id);
  return Response.json({ ok: true, ja_verificado: false, enfileirou });
}
