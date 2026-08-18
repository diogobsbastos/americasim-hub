import Link from "next/link";
import { db } from "../../../../../lib/db";
import { usuarioDaSessao } from "../../../../../lib/painel/sessao";
import FormLote from "./FormLote";

export const dynamic = "force-dynamic";

export const metadata = { title: "Estoque — AmericaSim", robots: { index: false, follow: false } };

function brl(v: string | number | null): string {
  if (v === null || v === undefined) return "—";
  const n = String(v).split(".");
  return `R$ ${(n[0] || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${(n[1] ?? "00").padEnd(2, "0").slice(0, 2)}`;
}

export default async function Estoque({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const u = await usuarioDaSessao();
  const podeImportar = u?.papel === "admin" || u?.papel === "operacao";

  const p = await db.query("select id, handle, nome from produto where handle = $1", [handle]);
  if (p.rows.length === 0) {
    return (
      <div className="aviso">
        <h1>Produto não encontrado</h1>
        <p className="nota">
          <Link href="/painel/produtos">← voltar para Produtos</Link>
        </p>
      </div>
    );
  }
  const prod = p.rows[0];

  const [vars, porVariante, lotes] = await Promise.all([
    db.query("select id, sku from variante where produto_id = $1 and ativo order by sku", [prod.id]),
    db.query(
      `select v.sku,
              count(*) filter (where e.status = 'disponivel')::int as disponivel,
              count(*) filter (where e.status = 'entregue')::int   as entregue,
              count(*) filter (where e.status not in ('disponivel','entregue'))::int as outros,
              count(*) filter (where e.status = 'disponivel' and e.custo_brl is null)::int as sem_custo,
              min(e.validade) as validade_mais_proxima
         from variante v
         left join estoque_esim e on e.variante_id = v.id
        where v.produto_id = $1
        group by v.sku order by v.sku`,
      [prod.id],
    ),
    db.query(
      `select e.lote, v.sku,
              count(*)::int as total,
              count(*) filter (where e.status = 'disponivel')::int as disponivel,
              sum(e.custo_brl)::text as custo_lote,
              min(e.criado_em) as importado_em,
              max(e.cambio_compra)::text as cambio
         from estoque_esim e
         join variante v on v.id = e.variante_id
        where v.produto_id = $1 and e.lote is not null
        group by e.lote, v.sku
        order by min(e.criado_em) desc limit 30`,
      [prod.id],
    ),
  ]);

  return (
    <>
      <div className="pn-cabeca">
        <h1>Estoque — {prod.nome}</h1>
        <p>
          Cada código é uma linha própria no banco, nunca um contador. É isso que impede dois
          clientes receberem o mesmo eSIM. ·{" "}
          <Link href={`/painel/produtos/${prod.handle}`}>voltar para o produto</Link>
        </p>
      </div>

      <div className="cartao" style={{ padding: 0, overflowX: "auto", marginBottom: 26 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--texto-fraco)", fontSize: "0.72rem" }}>
              <th style={{ padding: "12px 16px", fontWeight: 600 }}>VARIANTE</th>
              <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "right" }}>DISPONÍVEL</th>
              <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "right" }}>ENTREGUE</th>
              <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "right" }}>OUTROS</th>
              <th style={{ padding: "12px 16px", fontWeight: 600 }}>SEM CUSTO EM BRL</th>
              <th style={{ padding: "12px 16px", fontWeight: 600 }}>VALIDADE MAIS PRÓXIMA</th>
            </tr>
          </thead>
          <tbody>
            {porVariante.rows.map((v: any) => (
              <tr key={v.sku} style={{ borderTop: "1px solid var(--borda)" }}>
                <td style={{ padding: "12px 16px" }}>
                  <code>{v.sku}</code>
                </td>
                <td style={{ padding: "12px 16px", textAlign: "right" }}>
                  <span style={{ color: v.disponivel > 0 ? "var(--ok)" : "var(--erro)" }}>
                    {v.disponivel}
                  </span>
                </td>
                <td style={{ padding: "12px 16px", textAlign: "right", color: "var(--texto-fraco)" }}>
                  {v.entregue}
                </td>
                <td style={{ padding: "12px 16px", textAlign: "right", color: "var(--texto-fraco)" }}>
                  {v.outros}
                </td>
                <td style={{ padding: "12px 16px" }}>
                  {v.sem_custo > 0 ? (
                    <span style={{ color: "var(--alerta)" }}>
                      {v.sem_custo} — margem aproximada, não apurada
                    </span>
                  ) : (
                    <span style={{ color: "var(--ok)" }}>nenhum</span>
                  )}
                </td>
                <td style={{ padding: "12px 16px", color: "var(--texto-fraco)" }}>
                  {v.validade_mais_proxima
                    ? new Date(v.validade_mais_proxima).toLocaleDateString("pt-BR")
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {podeImportar ? (
        <FormLote
          handle={prod.handle}
          variantes={vars.rows.map((v: any) => ({ id: v.id, sku: v.sku }))}
        />
      ) : (
        <div className="aviso">
          <h1>Somente leitura</h1>
          <p className="nota">Seu papel não permite importar estoque.</p>
        </div>
      )}

      {lotes.rows.length > 0 ? (
        <>
          <h2 style={{ fontSize: "1.1rem", margin: "30px 0 4px" }}>Lotes importados</h2>
          <p style={{ color: "var(--texto-fraco)", margin: "0 0 12px", fontSize: "0.88rem" }}>
            O nome do lote é o que liga isto à nota do fornecedor na hora de conferir.
          </p>
          <div className="cartao" style={{ padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--texto-fraco)", fontSize: "0.72rem" }}>
                  <th style={{ padding: "10px 16px", fontWeight: 600 }}>LOTE</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600 }}>VARIANTE</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600 }}>IMPORTADO EM</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600, textAlign: "right" }}>TOTAL</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600, textAlign: "right" }}>SOBRAM</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600, textAlign: "right" }}>CUSTO DO LOTE</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600, textAlign: "right" }}>CÂMBIO</th>
                </tr>
              </thead>
              <tbody>
                {lotes.rows.map((l: any, i: number) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--borda)" }}>
                    <td style={{ padding: "10px 16px" }}>
                      <b>{l.lote}</b>
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      <code style={{ fontSize: "0.75rem" }}>{l.sku}</code>
                    </td>
                    <td style={{ padding: "10px 16px", color: "var(--texto-fraco)" }}>
                      {new Date(l.importado_em).toLocaleDateString("pt-BR")}
                    </td>
                    <td style={{ padding: "10px 16px", textAlign: "right" }}>{l.total}</td>
                    <td style={{ padding: "10px 16px", textAlign: "right" }}>{l.disponivel}</td>
                    <td style={{ padding: "10px 16px", textAlign: "right" }}>{brl(l.custo_lote)}</td>
                    <td style={{ padding: "10px 16px", textAlign: "right", color: "var(--texto-fraco)" }}>
                      {l.cambio ? Number(l.cambio).toFixed(2).replace(".", ",") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <p style={{ color: "var(--texto-fraco)", fontSize: "0.82rem", marginTop: 20, borderLeft: "3px solid var(--borda)", paddingLeft: 12 }}>
        <b>O código de ativação não aparece em tela nenhuma do painel</b>, nem aqui, nem na
        auditoria. Ele é o produto: quem vê, tem.
      </p>
    </>
  );
}
