import Link from "next/link";
import { db } from "../../../../../../lib/db";
import { usuarioDaSessao } from "../../../../../../lib/painel/sessao";
import FormFornecedorProduto from "../../../[handle]/fornecedor/FormFornecedorProduto";
import type { LinhaFornecedor, LinhaSku } from "../../../../fornecedores/tipos";
import Cabeca from "../Cabeca";
import { carregarSku, pacote } from "../dados";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fornecedor — AmericaSim", robots: { index: false, follow: false } };

export default async function FornecedorDoSku({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const d = await carregarSku(sku);
  if (!d) {
    return (
      <div className="aviso">
        <h1>SKU não encontrado</h1>
        <p className="nota"><Link href="/painel/produtos">← voltar para Produtos</Link></p>
      </div>
    );
  }
  const u = await usuarioDaSessao();
  const podeMexer = u?.papel === "admin" || u?.papel === "operacao";

  const forns = await db.query(
    `select f.id, f.nome, f.ativo, count(v.id)::int as skus
       from fornecedor f left join variante v on v.fornecedor_id = f.id
      group by f.id, f.nome, f.ativo order by f.nome`,
  );

  // O mesmo formulario da tela de familia, com UM item na lista. Duplicar o
  // componente so para trocar o escopo criaria duas portas para o mesmo campo
  // — e uma delas acabaria sem auditoria.
  const skus: LinhaSku[] = [{
    varianteId: d.varianteId,
    sku: d.resumo.sku,
    familia: d.resumo.familia,
    modo: d.resumo.modo,
    fornecedorId: d.fornecedorId,
  }];

  return (
    <>
      <Cabeca r={d.resumo} aba="fornecedor" />
      <p style={{ color: "var(--texto-fraco)", fontSize: "0.9rem", margin: "0 0 16px" }}>
        De quem vem este eSIM. O fornecedor é quem dá dono ao custo — sem ele, a margem não tem
        de onde sair.
      </p>
      <FormFornecedorProduto
        fornecedores={forns.rows as LinhaFornecedor[]}
        skus={skus}
        podeMexer={!!podeMexer}
      />
    </>
  );
}
