import Link from "next/link";
import { db } from "../../../../lib/db";
import { usuarioDaSessao } from "../../../../lib/painel/sessao";
import FormRegras from "./Form";
import type { LinhaRegra } from "./tipos";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Alertas de estoque — AmericaSim",
  robots: { index: false, follow: false },
};

export default async function Alertas() {
  const u = await usuarioDaSessao();
  const podeMexer = u?.papel === "admin" || u?.papel === "operacao";

  // So item de modo `estoque`: produto de operadora nao tem prateleira, e
  // minimo sobre saldo inexistente seria alarme permanente e inutil.
  const r = await db.query(
    `select v.id as variante_id, v.sku, p.nome as familia,
            coalesce(cv.disponivel, 0)::int as disponivel,
            coalesce(re.minimo, 0)::int as minimo,
            coalesce(re.critico, 0)::int as critico,
            coalesce(re.acao::text, 'alertar') as acao,
            coalesce(re.ativa, false) as ativa
       from variante v
       join produto p on p.id = v.produto_id
       left join custo_variante cv on cv.variante_id = v.id
       left join regra_estoque re on re.variante_id = v.id and re.canal_id is null
      where v.ativo and v.modo_entrega = 'estoque'::modo_entrega
      order by p.nome, v.sku`,
  );

  const linhas: LinhaRegra[] = r.rows.map((x: any) => ({
    varianteId: x.variante_id,
    sku: x.sku,
    familia: x.familia,
    disponivel: x.disponivel,
    minimo: x.minimo,
    critico: x.critico,
    acao: x.acao,
    ativa: x.ativa,
  }));

  const semRegra = linhas.filter((l) => !l.ativa).length;

  return (
    <>
      <div className="pn-cabeca">
        <h1>Alertas de estoque</h1>
        <p>
          A partir de quantos códigos livres cada produto deve avisar, e o que fazer quando
          chegar lá. <Link href="/painel/estoque">Ver os códigos →</Link>
        </p>
      </div>

      {semRegra > 0 ? (
        <div className="cartao perigo" style={{ marginBottom: 18 }}>
          <div className="rot">SKUs sem alerta ligado</div>
          <div className="val">{semRegra}</div>
          <div className="pe">
            Sem alerta, o estoque acaba e ninguém fica sabendo até um cliente pagar e receber
            erro. Foi o que aconteceu com o 10GB.
          </div>
        </div>
      ) : null}

      <FormRegras linhas={linhas} podeMexer={podeMexer} />
    </>
  );
}
