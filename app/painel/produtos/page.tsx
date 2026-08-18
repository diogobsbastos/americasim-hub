import Link from "next/link";
import { db } from "../../../lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Produtos — AmericaSim", robots: { index: false, follow: false } };

const SITUACOES = [
  { v: "ativo", r: "Ativos" },
  { v: "inativo", r: "Inativos" },
  { v: "sem_custo", r: "Sem custo" },
  { v: "esgotado", r: "Esgotado e visível" },
];

export default async function Produtos({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; canal?: string; situacao?: string }>;
}) {
  // Estado do filtro na URL, nunca em estado de componente (SPEC/08 §1):
  // o link é compartilhável e o botão voltar funciona.
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const canal = (sp.canal ?? "").trim();
  const situacao = (sp.situacao ?? "").trim();

  const cond: string[] = [];
  const args: unknown[] = [];

  if (q) {
    args.push(`%${q}%`);
    cond.push(
      `(p.nome ilike $${args.length} or p.handle ilike $${args.length}
        or exists (select 1 from variante vq where vq.produto_id = p.id and vq.sku ilike $${args.length}))`,
    );
  }
  if (canal) {
    args.push(canal);
    cond.push(
      `exists (select 1 from canal_variante cvq
                 join variante vq on vq.id = cvq.variante_id
                 join canal cq on cq.id = cvq.canal_id
                where vq.produto_id = p.id and cq.codigo = $${args.length} and cvq.visivel)`,
    );
  }
  if (situacao === "ativo") cond.push("p.ativo");
  if (situacao === "inativo") cond.push("not p.ativo");
  if (situacao === "sem_custo") {
    cond.push(
      `exists (select 1 from variante vq join custo_variante cq2 on cq2.variante_id = vq.id
                where vq.produto_id = p.id and cq2.fonte_custo = 'indisponivel')`,
    );
  }
  if (situacao === "esgotado") {
    cond.push(
      `exists (select 1 from variante vq
                 join custo_variante cq3 on cq3.variante_id = vq.id
                where vq.produto_id = p.id and cq3.disponivel = 0
                  and exists (select 1 from canal_variante cvx
                               where cvx.variante_id = vq.id and cvx.visivel))`,
    );
  }
  const onde = cond.length ? `where ${cond.join(" and ")}` : "";

  const r = await db.query(
    `select p.handle, p.nome, p.tipo::text as tipo, p.ativo,
            count(v.id)::int as variantes,
            coalesce(sum(cv.disponivel), 0)::int as estoque,
            count(*) filter (where cv.fonte_custo = 'indisponivel')::int as sem_custo,
            count(*) filter (
              where cv.disponivel = 0
                and exists (select 1 from canal_variante cvx
                             where cvx.variante_id = v.id and cvx.visivel)
            )::int as esgotado_visivel,
            (select string_agg(distinct c2.codigo, ', ' order by c2.codigo)
               from canal_variante cv2
               join canal c2 on c2.id = cv2.canal_id
               join variante v2 on v2.id = cv2.variante_id
              where v2.produto_id = p.id and cv2.visivel) as canais
       from produto p
       left join variante v on v.produto_id = p.id
       left join custo_variante cv on cv.variante_id = v.id
       ${onde}
      group by p.id, p.handle, p.nome, p.tipo, p.ativo
      order by p.nome`,
    args,
  );

  const canais = await db.query("select codigo from canal where ativo order by codigo");

  const totalSemCusto = r.rows.reduce((s: number, x: any) => s + x.sem_custo, 0);
  const totalEsgotado = r.rows.reduce((s: number, x: any) => s + x.esgotado_visivel, 0);

  return (
    <>
      <div className="pn-cabeca">
        <h1>Produtos</h1>
        <p>
          O catálogo canônico. Preço e visibilidade por canal ficam na matriz, dentro de cada
          produto.
        </p>
      </div>

      {totalEsgotado > 0 ? (
        <div className="cartao perigo" style={{ marginBottom: 14 }}>
          <div className="rot">Variantes visíveis na loja e sem estoque</div>
          <div className="val">{totalEsgotado}</div>
          <div className="pe">
            Quem comprar paga e recebe erro. Abra o produto e tire da vitrine ou reponha o
            estoque.
          </div>
        </div>
      ) : null}

      {totalSemCusto > 0 ? (
        <div className="cartao perigo" style={{ marginBottom: 18 }}>
          <div className="rot">Variantes sem custo</div>
          <div className="val">{totalSemCusto}</div>
          <div className="pe">Sem custo não há margem, e a margem é o que orienta o anúncio.</div>
        </div>
      ) : null}

      {/* Formulario GET: o filtro vira URL sozinho, sem JavaScript nenhum. */}
      <form method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="produto ou SKU"
          style={{ flex: "2 1 220px", width: "auto" }}
        />
        <select name="canal" defaultValue={canal} style={{ flex: "1 1 160px", width: "auto" }}>
          <option value="">Todos os canais</option>
          {canais.rows.map((c: any) => (
            <option key={c.codigo} value={c.codigo}>
              {c.codigo}
            </option>
          ))}
        </select>
        <select name="situacao" defaultValue={situacao} style={{ flex: "1 1 180px", width: "auto" }}>
          <option value="">Todas as situações</option>
          {SITUACOES.map((s) => (
            <option key={s.v} value={s.v}>
              {s.r}
            </option>
          ))}
        </select>
        <button type="submit">Filtrar</button>
        {q || canal || situacao ? (
          <Link
            href="/painel/produtos"
            className="botao secundario"
            style={{ display: "inline-flex", alignItems: "center" }}
          >
            Limpar
          </Link>
        ) : null}
      </form>

      {r.rows.length === 0 ? (
        <div className="aviso">
          <h1>Nada encontrado</h1>
          <p className="nota">Nenhum produto bate com esse filtro.</p>
        </div>
      ) : (
        <div className="cartao" style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--texto-fraco)", fontSize: "0.72rem" }}>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>PRODUTO</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>TIPO</th>
                <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "right" }}>VARIANTES</th>
                <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "right" }}>ESTOQUE</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>VISÍVEL EM</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>ATENÇÃO</th>
              </tr>
            </thead>
            <tbody>
              {r.rows.map((p: any) => (
                <tr key={p.handle} style={{ borderTop: "1px solid var(--borda)" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <Link href={`/painel/produtos/${p.handle}`}>
                      <b>{p.nome}</b>
                    </Link>
                    <br />
                    <code style={{ fontSize: "0.75rem", color: "var(--texto-fraco)" }}>{p.handle}</code>
                    {p.ativo ? null : (
                      <span style={{ color: "var(--texto-fraco)", fontSize: "0.78rem" }}> · inativo</span>
                    )}
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--texto-fraco)" }}>{p.tipo}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>{p.variantes}</td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <span style={{ color: p.estoque > 0 ? "var(--ok)" : "var(--erro)" }}>{p.estoque}</span>
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--texto-fraco)" }}>{p.canais ?? "—"}</td>
                  <td style={{ padding: "12px 16px" }}>
                    {p.esgotado_visivel > 0 ? (
                      <span style={{ color: "var(--erro)" }}>
                        {p.esgotado_visivel} esgotada{p.esgotado_visivel === 1 ? "" : "s"} no ar
                      </span>
                    ) : p.sem_custo > 0 ? (
                      <span style={{ color: "var(--alerta)" }}>
                        {p.sem_custo} sem custo
                      </span>
                    ) : (
                      <span style={{ color: "var(--ok)" }}>ok</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
