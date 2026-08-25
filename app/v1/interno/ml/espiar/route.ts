import { canalMl, mlFetch } from "../../../../../lib/mercadolivre";
import { conferirSegredo } from "../../segredo";

export const dynamic = "force-dynamic";

// POST /v1/interno/ml/espiar  { "caminho": "/items/MLB5126976949" }
//
// Le um recurso do Mercado Livre com o nosso token e devolve o JSON cru.
//
// Existe para diagnostico. Quando o ML recusa uma operacao — e ele recusa com
// mensagens curtas, do tipo "available_quantity is not modifiable" — a causa
// costuma ter tres ou quatro candidatas. Sem enxergar o anuncio, cada palpite
// custa um build, um restart e uma ida ao terminal. Olhar custa um.
//
// LIMITES, e o motivo de cada um:
//   - so GET: e ferramenta de leitura. Escrita passa por rota que sabe o que
//     esta fazendo e registra o que fez.
//   - so caminho relativo: sem isso, um caminho absoluto mandaria o token da
//     nossa loja para um servidor qualquer.
//   - atras do mesmo segredo das outras rotas internas.
export async function POST(req: Request) {
  const porta = await conferirSegredo(req);
  if (!porta.ok) return Response.json({ erro: porta.motivo }, { status: porta.status });

  let corpo: any = null;
  try {
    corpo = await req.json();
  } catch {
    return Response.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const caminho = String(corpo?.caminho ?? "").trim();
  if (!caminho.startsWith("/") || caminho.startsWith("//") || caminho.includes("://")) {
    return Response.json(
      { erro: 'caminho tem que ser relativo, começando com "/" (ex: /items/MLB123)' },
      { status: 400 },
    );
  }

  const canal = await canalMl();
  if (!canal) return Response.json({ erro: "canal mercadolivre nao existe" }, { status: 409 });

  try {
    const dados = await mlFetch(canal.id, caminho);
    return Response.json({ ok: true, caminho, dados });
  } catch (e: any) {
    return Response.json({ ok: false, caminho, erro: String(e?.message ?? e) }, { status: 502 });
  }
}
