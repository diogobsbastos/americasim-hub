import Link from "next/link";
import { db } from "../../../../../lib/db";
import { usuarioDaSessao } from "../../../../../lib/painel/sessao";
import Abas from "../Abas";
import FormFornecedorProduto from "./FormFornecedorProduto";
import type { LinhaFornecedor, LinhaSku } from "../../../fornecedores/tipos";

export const dynamic = "force-dynamic";

export const metadata = { title: "Fornecedor do produto — AmericaSim", robots: { index: false, follow: false } };

export default async function FornecedorDoProduto({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const u = await usuarioDaSessao();
  const podeMexer = u?.papel === "admin" || u?.papel === "operacao";

  const p = await db.query("select id, nome, handle from produto where handle = $1", [handle]);
  if (p.rows.length === 0) {
    return (
      <div className="aviso">
        <h1>Produto não encontrado</h1>
        <p className="nota"><Link href="/painel/produtos">← voltar para Produtos</Link></p>
      </div>
    );
  }
  const prod = p.rows[0];

  const [f, s] = await Promise.all([
    db.query(
      `select f.id, f.nome, f.ativo, coalesce(f.contato->>'email', '') as email,
              (select count(*) from variante v where v.fornecedor_id = f.id)::int as skus
         from fornecedor f order by f.ativo desc, f.nome`,
    ),
    db.query(
      `select v.id as variante_id, v.sku, v.modo_entrega::text as modo, v.fornecedor_id
         from variante v where v.produto_id = $1 order by v.sku`,
      [prod.id],
    ),
  ]);

  const fornecedores: LinhaFornecedor[] = f.rows.map((x: any) => ({
    id: x.id, nome: x.nome, email: x.email, ativo: x.ativo, skus: x.skus,
  }));
  const skus: LinhaSku[] = s.rows.map((x: any) => ({
    varianteId: x.variante_id, sku: x.sku, familia: prod.nome,
    modo: x.modo, fornecedorId: x.fornecedor_id,
  }));

  return (
    <>
      <div className="pn-cabeca">
        <h1>{prod.nome}</h1>
        <p><code>{prod.handle}</code> · <Link href="/painel/produtos">voltar para a lista</Link></p>
      </div>

      <Abas handle={prod.handle} atual="fornecedor" />

      <FormFornecedorProduto fornecedores={fornecedores} skus={skus} podeMexer={podeMexer} />
    </>
  );
}
