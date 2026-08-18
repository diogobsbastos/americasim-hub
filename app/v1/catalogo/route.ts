import { autenticar, erro } from "../../../lib/api";
import { db } from "../../../lib/db";

export const dynamic = "force-dynamic";

// GET /v1/catalogo — produtos visiveis NO CANAL DA CHAVE, com preco vigente.
// Dinheiro trafega como STRING decimal.
//
// `quantidade` (18/08, a pedido do Contratado): a contagem de codigos livres,
// agora exposta junto com `disponivel`. A versao anterior devolvia so o booleano,
// de proposito — contagem publica e informacao de negocio (quanto voce comprou,
// quanto vendeu) e vira alavanca de escassez involuntaria.
//
// O que mudou o calculo: as duas vitrines dividem o MESMO estoque, e o unico
// jeito de mostrar isso a quem esta olhando de fora e o numero caindo nas duas
// telas ao mesmo tempo. Hoje a loja inteira esta atras de Basic Auth, entao o
// numero nao e publico de fato. Quando ela abrir, a decisao volta para a mesa:
// o caminho usual e mostrar a contagem so abaixo de um limite ("ultimas 3
// unidades") e omitir acima dele.
//
// `disponivel` continua no contrato e continua booleano — quem ja consome a API
// nao precisa mudar nada.
export async function GET(req: Request) {
  const canal = await autenticar(req, "catalogo");
  if (canal instanceof Response) return canal;

  try {
    const r = await db.query(
      `select p.handle, p.nome as produto_nome, p.descricao,
              v.sku, v.atributos, pr.valor::text as preco, pr.moeda,
              cv.destaque,
              (select count(*) from estoque_esim e
                where e.variante_id = v.id and e.status = 'disponivel')::int as quantidade
         from canal_variante cv
         join variante v on v.id = cv.variante_id and v.ativo
         join produto  p on p.id = v.produto_id  and p.ativo
         join preco   pr on pr.variante_id = v.id and pr.canal_id = cv.canal_id
                        and pr.vigencia_fim is null
        where cv.canal_id = $1 and cv.visivel
        order by cv.destaque desc, cv.ordem nulls last, p.handle`,
      [canal.id],
    );

    const porProduto = new Map<string, { handle: string; nome: string; descricao: string | null; variantes: unknown[] }>();
    for (const row of r.rows) {
      let prod = porProduto.get(row.handle);
      if (!prod) {
        prod = { handle: row.handle, nome: row.produto_nome, descricao: row.descricao, variantes: [] };
        porProduto.set(row.handle, prod);
      }
      const quantidade = Number(row.quantidade ?? 0);
      prod.variantes.push({
        sku: row.sku,
        atributos: row.atributos,
        preco: row.preco,             // string decimal — contrato SPEC/03 (rev. 18/08)
        moeda: row.moeda,
        disponivel: quantidade > 0,   // booleano, derivado — o contrato antigo continua valendo
        quantidade,                   // contagem de codigos livres AGORA
        destaque: row.destaque,
      });
    }

    return Response.json({ moeda: canal.moeda, produtos: [...porProduto.values()] });
  } catch (e) {
    console.error("catalogo:", e);
    return erro(500, "erro_interno", "Falha ao consultar o catalogo.");
  }
}
