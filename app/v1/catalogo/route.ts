import { autenticar, erro } from "../../../lib/api";
import { db } from "../../../lib/db";

export const dynamic = "force-dynamic";

// GET /v1/catalogo — produtos visiveis NO CANAL DA CHAVE, com preco vigente.
// Dinheiro trafega como STRING decimal.
//
// ESGOTADO SOME DA VITRINE (migracao 007). Variante sem codigo livre nao entra
// no catalogo, e volta sozinha quando entra estoque. Antes ela ficava no ar
// como "Esgotado" ate alguem lembrar de desmarcar na mao — e "ate alguem
// lembrar" nao e um mecanismo.
//
// `cv.visivel` NAO e tocado por isso: ele guarda a INTENCAO do operador
// ("quero vender isto nesta loja"). Desliga-lo automaticamente apagaria uma
// decisao humana, e na reposicao ninguem saberia se o item voltou porque o
// operador queria ou porque o sistema mexeu. Intencao e disponibilidade sao
// duas coisas diferentes.
//
// `cv.mostrar_esgotado = true` e a valvula para o caso oposto: continuar
// aparecendo marcado como Esgotado, para nao perder posicao de busca ou para
// medir procura por algo que acabou.
//
// QUANDO ENTRAR O FORNECIMENTO SOB DEMANDA (T-Mobile, China Mobile), esta
// condicao precisa ganhar um `or variante.modo_fornecimento = 'api'`: la o eSIM
// nasce na hora da venda e a contagem de estoque e sempre zero. Hoje nenhuma
// variante e sob demanda, entao nao ha o que quebrar ainda.
//
// `quantidade` (18/08, a pedido do Contratado): contagem de codigos livres. As
// duas vitrines dividem o MESMO estoque, e o unico jeito de mostrar isso de
// fora e o numero caindo nas duas telas ao mesmo tempo. Hoje a loja esta atras
// de Basic Auth, entao o numero nao e publico de fato; quando ela abrir, o
// caminho usual e mostrar a contagem so abaixo de um limite ("ultimas 3
// unidades"). `disponivel` continua no contrato e continua booleano.
export async function GET(req: Request) {
  const canal = await autenticar(req, "catalogo");
  if (canal instanceof Response) return canal;

  try {
    const r = await db.query(
      `select p.handle, p.nome as produto_nome, p.descricao,
              v.sku, v.atributos, pr.valor::text as preco, pr.moeda,
              cv.destaque, q.n::int as quantidade
         from canal_variante cv
         join variante v on v.id = cv.variante_id and v.ativo
         join produto  p on p.id = v.produto_id  and p.ativo
         join preco   pr on pr.variante_id = v.id and pr.canal_id = cv.canal_id
                        and pr.vigencia_fim is null
         cross join lateral (
           select count(*) as n from estoque_esim e
            where e.variante_id = v.id and e.status = 'disponivel'
         ) q
        where cv.canal_id = $1
          and cv.visivel
          and (cv.mostrar_esgotado or q.n > 0)
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
