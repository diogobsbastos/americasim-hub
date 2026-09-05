import { autenticar, erro } from "../../../../lib/api";
import { db } from "../../../../lib/db";
import { verificarSessao } from "../../../../lib/conta";
import { assinarAcompanhamento } from "../../../../lib/token";

export const dynamic = "force-dynamic";

// POST /v1/conta/pedidos {sessao} — os pedidos da conta logada. POST porque a
// sessao vai no corpo (em GET ela cairia no access log do Nginx).
//
// SO conta VERIFICADA ve pedidos. E a trava central do login: sem ela, criar
// conta com o e-mail de outra pessoa daria acesso aos links de acompanhamento
// dela — e cada link leva ao QR. Google verifica na hora; senha espera o
// e-mail de confirmacao (motor de e-mail).
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

  const conta = await db.query(
    `select email::text as email, verificado from conta_cliente where id = $1`,
    [contaId],
  );
  if (conta.rows.length === 0) return erro(401, "sessao_invalida", "Entre de novo na sua conta.");
  const c = conta.rows[0];
  if (c.verificado !== true) {
    return erro(403, "conta_nao_verificada", "Confirme seu e-mail para ver os pedidos.");
  }

  // Pedidos do MESMO CANAL da vitrine que pergunta (cada loja mostra o que
  // vendeu). O token de acompanhamento sai assinado fresco — mesmo formato do
  // link do checkout, entao a pagina do pedido nao muda nada.
  // `it` (lateral): o PLANO do pedido — nome do produto e atributos (gb/dias)
  // do primeiro item. E o que faz o cartao do painel dizer "eSIM Europa ·
  // 5 GB · 15 dias" em vez de so um numero de pedido.
  const r = await db.query(
    `select p.numero, p.status, p.entregue, p.criado_em,
            count(a.id)::int as esims,
            count(a.id) filter (where a.status = 'instalado')::int as instalados,
            it.produto, it.atributos
       from pedido p
       join cliente c on c.id = p.cliente_id
       left join ativacao a on a.pedido_id = p.id
       left join lateral (
         select pr.nome as produto, v.atributos
           from item_pedido ip
           join variante v on v.id = ip.variante_id
           join produto pr on pr.id = v.produto_id
          where ip.pedido_id = p.id
          order by ip.id
          limit 1
       ) it on true
      where lower(c.email::text) = $1 and p.canal_id = $2
      group by p.id, it.produto, it.atributos
      order by p.criado_em desc
      limit 50`,
    [c.email.toLowerCase(), canal.id],
  );

  return Response.json({
    email: c.email,
    pedidos: r.rows.map((p: any) => ({
      numero: p.numero,
      status: p.status,
      entregue: p.entregue,
      criado_em: p.criado_em,
      esims: p.esims,
      instalados: p.instalados,
      produto: p.produto ?? null,
      gb: p.atributos?.gb ?? null,
      dias: p.atributos?.dias ?? null,
      t: assinarAcompanhamento(p.numero),
    })),
  });
}
