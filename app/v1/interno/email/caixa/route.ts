import { conferirSegredo } from "../../segredo";
import { garantirCaixa } from "../../../../../lib/caixa-imap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /v1/interno/email/caixa — o toque do worker: garante que a conexao IMAP
// IDLE com o Gmail esta viva e devolve o estado dela. Nao processa nada aqui —
// quem processa e o aviso do proprio Google ('exists') dentro de lib/caixa-imap.
export async function POST(req: Request) {
  const porta = await conferirSegredo(req);
  if (!porta.ok) return Response.json({ erro: porta.motivo }, { status: porta.status });

  const estado = await garantirCaixa();
  return Response.json({ ok: true, ...estado });
}
