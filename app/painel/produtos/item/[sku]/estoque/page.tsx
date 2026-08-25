import Link from "next/link";
import { db } from "../../../../../../lib/db";
import { usuarioDaSessao } from "../../../../../../lib/painel/sessao";
import FormLote from "../../../[handle]/estoque/FormLote";
import ListaCodigos, { type LinhaEstoque } from "../../../[handle]/estoque/ListaCodigos";
import Cabeca from "../Cabeca";
import { carregarSku } from "../dados";

export const dynamic = "force-dynamic";
export const metadata = { title: "Estoque — AmericaSim", robots: { index: false, follow: false } };

// Teto da lista: um lote de 5 mil codigos monta uma tabela que trava o
// navegador. Com teto, a tela AVISA quantos ficaram de fora — agir sobre o que
// nao se esta vendo e como isso da errado.
const TETO = 200;

const SITUACOES = ["disponivel", "reservado", "entregue", "defeito", "expirado", "devolvido", "interno"];

export default async function EstoqueDoSku({
  params,
  searchParams,
}: {
  params: Promise<{ sku: string }>;
  searchParams: Promise<{ s?: string; l?: string }>;
}) {
  const { sku } = await params;
  const f = await searchParams;
  const fStatus = (f.s ?? "").trim();
  const fLote = (f.l ?? "").trim();

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
  const podeImportar = u?.papel === "admin" || u?.papel === "operacao";
  const podeCusto = u?.papel === "admin";

  // Filtros como parametro, nunca concatenados: `$2 = '' or ...` deixa o mesmo
  // SQL servir com e sem filtro, sem montar consulta com texto vindo da URL.
  const onde = `e.variante_id = $1
       and ($2 = '' or e.status::text = $2)
       and ($3 = '' or e.lote ilike '%' || $3 || '%')`;
  const args = [d.varianteId, fStatus, fLote];

  const [resumo, lotes, codigos, quantos] = await Promise.all([
    db.query(
      `select count(*) filter (where status = 'disponivel')::int as disponivel,
              count(*) filter (where status = 'reservado')::int  as reservado,
              count(*) filter (where status = 'entregue')::int   as entregue,
              count(*) filter (where status not in ('disponivel','reservado','entregue'))::int as fora,
              count(*) filter (where status = 'disponivel' and custo_brl is null)::int as sem_custo,
              min(validade) filter (where status = 'disponivel') as vence_primeiro
         from estoque_esim where variante_id = $1`,
      [d.varianteId],
    ),
    db.query(
      `select lote, count(*)::int as total,
              count(*) filter (where status = 'disponivel')::int as disponivel,
              sum(custo_brl)::text as custo_lote, min(criado_em) as importado_em
         from estoque_esim where variante_id = $1 and lote is not null
        group by lote order by min(criado_em) desc limit 20`,
      [d.varianteId],
    ),
    db.query(
      `select e.id, $4::text as sku, e.iccid, e.status::text as status, e.lote, e.operadora,
              e.validade::text as validade, e.custo_brl::text as custo_brl,
              e.criado_em::text as criado_em
         from estoque_esim e
        where ${onde}
        order by (e.status = 'disponivel') desc, e.criado_em desc
        limit ${TETO}`,
      [...args, d.resumo.sku],
    ),
    db.query(`select count(*)::int as n from estoque_esim e where ${onde}`, args),
  ]);

  const s = resumo.rows[0] ?? {};
  const total = quantos.rows[0]?.n ?? 0;
  const linhas: LinhaEstoque[] = codigos.rows as any;

  return (
    <>
      <Cabeca r={d.resumo} aba="estoque" />

      <p style={{ color: "var(--texto-fraco)", margin: "0 0 18px", fontSize: "0.9rem" }}>
        Cada código é uma linha própria no banco, nunca um contador. É isso que impede dois
        clientes receberem o mesmo eSIM — e por isso retirar do estoque é escolher <b>qual</b>,
        não digitar quantos.
      </p>

      <div className="cartao" style={{ marginBottom: 20 }}>
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }}>
          <div><span className="rot">DISPONÍVEL</span><b style={{ color: "var(--ok)", fontSize: "1.2rem" }}>{s.disponivel ?? 0}</b></div>
          <div><span className="rot">RESERVADO</span><b>{s.reservado ?? 0}</b></div>
          <div><span className="rot">ENTREGUE</span><b>{s.entregue ?? 0}</b></div>
          <div><span className="rot">FORA DO ESTOQUE</span><b>{s.fora ?? 0}</b></div>
          <div>
            <span className="rot">SEM CUSTO EM BRL</span>
            <b style={{ color: (s.sem_custo ?? 0) > 0 ? "var(--alerta)" : "var(--ok)" }}>
              {(s.sem_custo ?? 0) > 0 ? `${s.sem_custo} — margem aproximada` : "nenhum"}
            </b>
          </div>
          <div>
            <span className="rot">VENCE PRIMEIRO</span>
            <b>{s.vence_primeiro ? new Date(s.vence_primeiro).toLocaleDateString("pt-BR") : "—"}</b>
          </div>
        </div>
        <p style={{ margin: "14px 0 0", fontSize: "0.84rem" }}>
          <Link href="/painel/estoque/alertas">configurar alerta de mínimo →</Link>
        </p>
      </div>

      {podeImportar ? (
        <div style={{ marginBottom: 22 }}>
          {/* Uma variante só na lista: não há seletor porque não há o que escolher. */}
          <FormLote handle={d.handle} variantes={[{ id: d.varianteId, sku: d.resumo.sku }]} />
        </div>
      ) : null}

      {lotes.rows.length > 0 ? (
        <div className="cartao" style={{ padding: 0, overflowX: "auto", marginBottom: 22 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--texto-fraco)", fontSize: "0.72rem" }}>
                <th style={{ padding: "10px 14px", fontWeight: 600 }}>LOTE</th>
                <th style={{ padding: "10px 14px", fontWeight: 600, textAlign: "right" }}>TOTAL</th>
                <th style={{ padding: "10px 14px", fontWeight: 600, textAlign: "right" }}>DISPONÍVEL</th>
                <th style={{ padding: "10px 14px", fontWeight: 600, textAlign: "right" }}>CUSTO DO LOTE</th>
                <th style={{ padding: "10px 14px", fontWeight: 600 }}>IMPORTADO</th>
              </tr>
            </thead>
            <tbody>
              {lotes.rows.map((l: any) => (
                <tr key={l.lote} style={{ borderTop: "1px solid var(--borda)" }}>
                  <td style={{ padding: "10px 14px" }}><code>{l.lote}</code></td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>{l.total}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right", color: "var(--ok)" }}>{l.disponivel}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right" }}>
                    {l.custo_lote ? `R$ ${Number(l.custo_lote).toFixed(2)}` : "—"}
                  </td>
                  <td style={{ padding: "10px 14px", color: "var(--texto-fraco)" }}>
                    {new Date(l.importado_em).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <h2 style={{ fontSize: "1.05rem", margin: "0 0 4px" }}>Códigos</h2>
      <p style={{ color: "var(--texto-fraco)", margin: "0 0 12px", fontSize: "0.86rem" }}>
        O código de ativação não aparece aqui. Quem identifica a linha é o ICCID.
      </p>

      <form method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <select name="s" defaultValue={fStatus} style={{ flex: "1 1 160px", width: "auto" }}>
          <option value="">todas as situações</option>
          {SITUACOES.map((x) => (<option key={x} value={x}>{x}</option>))}
        </select>
        <input name="l" defaultValue={fLote} placeholder="lote contém" style={{ flex: "1 1 160px", width: "auto" }} />
        <button type="submit">Filtrar</button>
      </form>

      <ListaCodigos
        handle={d.handle}
        linhas={linhas}
        podeMover={!!podeImportar}
        podeCusto={!!podeCusto}
        truncado={Math.max(0, total - linhas.length)}
      />
    </>
  );
}
