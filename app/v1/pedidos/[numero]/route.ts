import { autenticar, erro } from "../../../../lib/api";
import { db } from "../../../../lib/db";
import { verificarAcompanhamento } from "../../../../lib/token";

export const dynamic = "force-dynamic";

// GET /v1/pedidos/{numero}?t=<token> — rede de seguranca do webhook (SPEC/03).
// Exige a chave do canal E o token assinado; sem token valido, 404 indistinguivel
// de pedido inexistente. A vitrine para de consultar quando `entregue` vira true.
//
// Cada ativacao sai com o retrato do eSIM (portal do cliente): status da esteira
// (pendente -> provisionando -> entregue -> instalado), nome do produto, final do
// ICCID, validade e datas. NADA sensivel vai aqui: o codigo LPA continua saindo
// so pelo POST /v1/ativacoes/{id}, que exige o e-mail da compra no corpo.
export async function GET(req: Request, ctx: { params: Promise<{ numero: string }> }) {
  const canal = await autenticar(req, "pedidos");
  if (canal instanceof Response) return canal;

  const { numero } = await ctx.params;
  const t = new URL(req.url).searchParams.get("t");
  if (!verificarAcompanhamento(numero, t)) {
    return erro(404, "nao_encontrado", "Pedido nao encontrado.");
  }

  const r = await db.query(
    `select p.numero, p.status, p.entregue, p.criado_em, p.entregue_em,
            coalesce(json_agg(json_build_object(
                       'id', a.id,
                       'status', a.status,
                       'produto', pr.nome,
                       'iccid_final', right(e.iccid, 5),
                       'validade', e.validade,
                       'entregue_em', a.entregue_em,
                       'instalado_em', a.confirmado_em
                     ) order by a.criado_em)
                     filter (where a.id is not null), '[]'::json) as ativacoes
       from pedido p
       left join ativacao a on a.pedido_id = p.id
       left join item_pedido i on i.id = a.item_pedido_id
       left join variante v on v.id = i.variante_id
       left join produto pr on pr.id = v.produto_id
       left join estoque_esim e on e.id = a.estoque_id
      where p.numero = $1 and p.canal_id = $2
      group by p.id`,
    [numero, canal.id],
  );
  if (r.rows.length === 0) return erro(404, "nao_encontrado", "Pedido nao encontrado.");

  const p = r.rows[0];
  return Response.json({
    numero: p.numero,
    status: p.status,
    entregue: p.entregue,
    criado_em: p.criado_em,
    entregue_em: p.entregue_em,
    ativacoes: p.ativacoes,
  });
}
