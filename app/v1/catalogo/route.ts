import { autenticar, erro } from "../../../lib/api";
import { db } from "../../../lib/db";

export const dynamic = "force-dynamic";

// GET /v1/catalogo — produtos visiveis NO CANAL DA CHAVE, com preco vigente.
// Dinheiro trafega como STRING decimal; `disponivel` e booleano, nunca contagem.
export async function GET(req: Request) {
  const canal = await autenticar(req, "catalogo");
  if (canal instanceof Response) return canal;

  try {
    const r = await db.query(
      `select p.handle, p.nome as produto_nome, p.descricao,
              v.sku, v.atributos, pr.valor::text as preco, pr.moeda,
              cv.destaque,
              exists (select 1 from estoque_esim e
                       where e.variante_id = v.id and e.status = 'disponivel') as disponivel
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
      prod.variantes.push({
        sku: row.sku,
        atributos: row.atributos,
        preco: row.preco,           // string decimal — contrato SPEC/03 (rev. 18/08)
        moeda: row.moeda,
        disponivel: row.disponivel, // booleano, nunca quantidade
        destaque: row.destaque,
      });
    }

    return Response.json({ moeda: canal.moeda, produtos: [...porProduto.values()] });
  } catch (e) {
    console.error("catalogo:", e);
    return erro(500, "erro_interno", "Falha ao consultar o catalogo.");
  }
}
