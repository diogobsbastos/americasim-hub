import { db } from "../../../lib/db";
import { usuarioDaSessao } from "../../../lib/painel/sessao";
import PainelFornecedores from "./Painel";
import type { LinhaFornecedor, LinhaSku } from "./tipos";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Fornecedores — AmericaSim",
  robots: { index: false, follow: false },
};

export default async function Fornecedores() {
  const u = await usuarioDaSessao();
  const podeMexer = u?.papel === "admin" || u?.papel === "operacao";

  const [f, s] = await Promise.all([
    db.query(
      `select f.id, f.nome, f.ativo,
              (select count(*) from variante v where v.fornecedor_id = f.id)::int as skus
         from fornecedor f
        order by f.ativo desc, f.nome`,
    ),
    db.query(
      `select v.id as variante_id, v.sku, p.nome as familia,
              v.modo_entrega::text as modo, v.fornecedor_id
         from variante v
         join produto p on p.id = v.produto_id
        where v.ativo
        order by p.nome, v.sku`,
    ),
  ]);

  const fornecedores: LinhaFornecedor[] = f.rows.map((x: any) => ({
    id: x.id,
    nome: x.nome,
    ativo: x.ativo,
    skus: x.skus,
  }));
  const skus: LinhaSku[] = s.rows.map((x: any) => ({
    varianteId: x.variante_id,
    sku: x.sku,
    familia: x.familia,
    modo: x.modo,
    fornecedorId: x.fornecedor_id,
  }));

  return (
    <>
      <div className="pn-cabeca">
        <h1>Fornecedores</h1>
        <p>
          De quem a gente compra cada eSIM. E o que transforma o custo da tela de numero
          digitado em numero com dono.
        </p>
      </div>
      <PainelFornecedores fornecedores={fornecedores} skus={skus} podeMexer={podeMexer} />
    </>
  );
}
