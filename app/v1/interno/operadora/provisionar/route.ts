import { ErroRetentavel, provisionarPedido } from "../../../../../lib/provisionar";
import { conferirSegredo } from "../../segredo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /v1/interno/operadora/provisionar  { pedido_id, item_pedido_id }
//
// A ponte entre a fila e a operadora. Quem chama e o worker, e so o worker
// (mesmo porteiro das rotas do Mercado Livre). A regra mora em
// lib/provisionar.ts; aqui so se traduz o resultado em codigo HTTP:
//
//   200 ok                → evento publicado
//   200 definitivo:false  → nao acontece: falha definitiva e 200 com ok:false,
//                           para a fila NAO insistir; o pedido fica no alerta
//                           "pago sem entrega" do painel
//   500                   → retentavel (rede, 5xx da operadora, QR ainda nao
//                           existe): o worker espera e repete
export async function POST(req: Request) {
  const porta = await conferirSegredo(req);
  if (!porta.ok) return Response.json({ erro: porta.motivo }, { status: porta.status });

  let corpo: any = null;
  try {
    corpo = await req.json();
  } catch {
    return Response.json({ erro: "corpo invalido" }, { status: 400 });
  }
  const pedidoId = String(corpo?.pedido_id ?? "").trim();
  const itemId = String(corpo?.item_pedido_id ?? "").trim();
  if (!pedidoId || !itemId) return Response.json({ erro: "pedido_id e item_pedido_id sao obrigatorios" }, { status: 400 });

  try {
    const r = await provisionarPedido(pedidoId, itemId);
    return Response.json(r);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (e instanceof ErroRetentavel) {
      return Response.json({ ok: false, retentar: true, erro: msg }, { status: 500 });
    }
    console.error(`interno/operadora/provisionar pedido=${pedidoId}:`, e);
    return Response.json({ ok: false, retentar: true, erro: msg }, { status: 500 });
  }
}
