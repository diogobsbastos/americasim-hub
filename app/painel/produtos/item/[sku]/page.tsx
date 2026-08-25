import Link from "next/link";
import { db } from "../../../../../lib/db";
import { usuarioDaSessao } from "../../../../../lib/painel/sessao";
import FormProduto from "../../[handle]/FormProduto";
import Cabeca from "./Cabeca";
import { carregarSku } from "./dados";

export const dynamic = "force-dynamic";
export const metadata = { title: "Produto — AmericaSim", robots: { index: false, follow: false } };

export default async function Resumo({ params }: { params: Promise<{ sku: string }> }) {
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
  const podeEditar = u?.papel === "admin" || u?.papel === "operacao";

  const mov = await db.query(
    `select m.tipo, m.status_antes::text as antes, m.status_depois::text as depois,
            m.motivo, m.criado_em, us.nome as quem
       from movimento_estoque m
       join estoque_esim e on e.id = m.estoque_id
       left join usuario us on us.id = m.usuario_id
      where e.variante_id = $1
      order by m.criado_em desc, m.id desc limit 8`,
    [d.varianteId],
  );

  return (
    <>
      <Cabeca r={d.resumo} aba="resumo" />

      {/* A descricao e da FAMILIA no banco, e a tela diz isso em vez de fingir
          que e do SKU — editar aqui muda o texto dos irmaos tambem. */}
      <div className="cartao" style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: "1.05rem", margin: "0 0 4px" }}>Texto de venda</h2>
        <p style={{ color: "var(--texto-fraco)", fontSize: "0.84rem", margin: "0 0 14px" }}>
          Este texto e o nome são de <b>{d.resumo.familia}</b> e valem para todos os pacotes dessa
          família. O que é só deste item — preço, estoque, anúncio — está nas outras abas.
        </p>
        <FormProduto
          handle={d.handle}
          nome={d.resumo.familia}
          descricao={d.descricao ?? ""}
          ativo={d.resumo.ativo}
          podeEditar={!!podeEditar}
        />
      </div>

      <div className="cartao">
        <h2 style={{ fontSize: "1.05rem", margin: "0 0 10px" }}>Últimas movimentações deste item</h2>
        {mov.rows.length === 0 ? (
          <p style={{ color: "var(--texto-fraco)", margin: 0 }}>Nada ainda.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.86rem" }}>
            <tbody>
              {mov.rows.map((m: any, i: number) => (
                <tr key={i} style={{ borderTop: i ? "1px solid var(--borda)" : "none" }}>
                  <td style={{ padding: "8px 0", color: "var(--texto-fraco)", whiteSpace: "nowrap" }}>
                    {new Date(m.criado_em).toLocaleString("pt-BR")}
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    {m.antes && m.depois ? `${m.antes} → ${m.depois}` : m.depois ? `entrou como ${m.depois}` : m.tipo}
                  </td>
                  <td style={{ padding: "8px 0", color: "var(--texto-fraco)" }}>{m.motivo ?? "—"}</td>
                  <td style={{ padding: "8px 0", color: "var(--texto-fraco)", textAlign: "right" }}>{m.quem ?? "sistema"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
