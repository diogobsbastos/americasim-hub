import Link from "next/link";
import { db } from "../../../lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Produtos — AmericaSim", robots: { index: false, follow: false } };

// A lista e dos SKUs, nao das familias (22/08/2026).
//
// Antes cada linha era um `produto` e as variantes ficavam escondidas la dentro.
// So que quem tem preco, custo, saldo, fornecedor e anuncio e a VARIANTE — a
// familia nao tem nenhum desses. Uma lista de familias respondia "quantos
// catalogos temos", que ninguem pergunta, em vez de "o que esta a venda e como
// esta", que e a unica pergunta que se faz aqui todo dia. E o mesmo arranjo do
// Bling, onde o produto pai nao tem estoque e a listagem agrupa as filhas.

const SITUACOES = [
  { v: "ativo", r: "Ativos" },
  { v: "inativo", r: "Inativos" },
  { v: "sem_custo", r: "Sem custo" },
  { v: "sem_fornecedor", r: "Sem fornecedor" },
  { v: "esgotado", r: "Esgotado e visivel" },
];

const MODOS_FILTRO = [
  { v: "estoque", r: "De estoque" },
  { v: "operadora_fixo", r: "Operadora, plano fixo" },
  { v: "operadora_sob_medida", r: "Operadora, sob medida" },
];

const ROTULO_MODO: Record<string, string> = {
  estoque: "estoque",
  operadora_fixo: "operadora",
  operadora_sob_medida: "sob medida",
};

// O nome que a operacao reconhece: a familia mais o que o pacote entrega. O SKU
// sozinho e codigo; "eSIM Europa 10GB · 30 dias" e produto.
function rotulo(familia: string, atributos: any): string {
  const gb = atributos?.gb;
  const dias = atributos?.dias;
  const partes: string[] = [];
  if (gb) partes.push(`${gb}GB`);
  if (dias) partes.push(`${dias} dias`);
  return partes.length ? `${familia} ${partes.join(" · ")}` : familia;
}

export default async function Produtos({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; canal?: string; situacao?: string; modo?: string; forn?: string }>;
}) {
  // Estado do filtro na URL, nunca em estado de componente (SPEC/08 §1):
  // o link e compartilhavel e o botao voltar funciona.
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const canal = (sp.canal ?? "").trim();
  const situacao = (sp.situacao ?? "").trim();
  const modo = (sp.modo ?? "").trim();
  const forn = (sp.forn ?? "").trim();

  const cond: string[] = [];
  const args: unknown[] = [];

  if (q) {
    args.push(`%${q}%`);
    cond.push(`(p.nome ilike $${args.length} or p.handle ilike $${args.length} or v.sku ilike $${args.length})`);
  }
  if (canal) {
    args.push(canal);
    cond.push(
      `exists (select 1 from canal_variante cvq join canal cq on cq.id = cvq.canal_id
                where cvq.variante_id = v.id and cq.codigo = $${args.length} and cvq.visivel)`,
    );
  }
  if (modo && MODOS_FILTRO.some((m) => m.v === modo)) {
    args.push(modo);
    cond.push(`v.modo_entrega = $${args.length}::modo_entrega`);
  }
  if (forn) {
    args.push(forn);
    cond.push(`v.fornecedor_id = $${args.length}::uuid`);
  }
  if (situacao === "ativo") cond.push("v.ativo and p.ativo");
  if (situacao === "inativo") cond.push("(not v.ativo or not p.ativo)");
  if (situacao === "sem_custo") cond.push("cv.fonte_custo = 'indisponivel'");
  if (situacao === "sem_fornecedor") cond.push("v.fornecedor_id is null");
  if (situacao === "esgotado") {
    cond.push(
      `v.modo_entrega = 'estoque' and cv.disponivel = 0
       and exists (select 1 from canal_variante cvx where cvx.variante_id = v.id and cvx.visivel)`,
    );
  }
  const onde = cond.length ? `where ${cond.join(" and ")}` : "";

  const r = await db.query(
    `select p.handle, p.nome as familia, p.ativo as familia_ativa,
            v.sku, v.atributos, v.ativo, v.custo::text as custo, v.custo_moeda,
            v.modo_entrega::text as modo, v.publicavel_marketplace,
            f.nome as fornecedor, f.ativo as fornecedor_ativo,
            coalesce(cv.disponivel, 0)::int as disponivel,
            cv.fonte_custo,
            (select string_agg(distinct c2.codigo, ', ' order by c2.codigo)
               from canal_variante cv2 join canal c2 on c2.id = cv2.canal_id
              where cv2.variante_id = v.id and cv2.visivel) as canais
       from variante v
       join produto p on p.id = v.produto_id
       left join fornecedor f on f.id = v.fornecedor_id
       left join custo_variante cv on cv.variante_id = v.id
       ${onde}
      order by p.nome, v.sku`,
    args,
  );

  const [canais, fornecedores] = await Promise.all([
    db.query("select codigo from canal where ativo order by codigo"),
    db.query("select id, nome from fornecedor order by nome"),
  ]);

  // "Esgotado no ar" so vale para quem tem prateleira: item de operadora nao
  // tem saldo por desenho, e contar o zero dele encheria a tela de alarme falso.
  const esgotados = r.rows.filter(
    (x: any) => x.modo === "estoque" && x.disponivel === 0 && x.canais,
  ).length;
  const semCusto = r.rows.filter((x: any) => x.fonte_custo === "indisponivel").length;
  const semForn = r.rows.filter((x: any) => !x.fornecedor).length;

  let familiaAtual = "";

  return (
    <>
      <div className="pn-cabeca">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1>Produtos</h1>
            <p>
              Cada linha e um item vendavel, com seu SKU, seu saldo, seu preco e de quem ele
              vem. O nome em destaque so agrupa — quem tem numero e o SKU.
            </p>
          </div>
          <Link href="/painel/produtos/novo" className="botao">+ Incluir</Link>
        </div>
      </div>

      {esgotados > 0 ? (
        <div className="cartao perigo" style={{ marginBottom: 14 }}>
          <div className="rot">Sem estoque e ainda na vitrine</div>
          <div className="val">{esgotados}</div>
          <div className="pe">Quem comprar paga e recebe erro. Tire da vitrine ou reponha o lote.</div>
        </div>
      ) : null}

      {semForn > 0 ? (
        <div className="cartao perigo" style={{ marginBottom: 14 }}>
          <div className="rot">Sem fornecedor</div>
          <div className="val">{semForn}</div>
          <div className="pe">
            Custo sem dono. <Link href="/painel/fornecedores">Amarrar agora →</Link>
          </div>
        </div>
      ) : null}

      {semCusto > 0 ? (
        <div className="cartao perigo" style={{ marginBottom: 18 }}>
          <div className="rot">Sem custo</div>
          <div className="val">{semCusto}</div>
          <div className="pe">Sem custo nao ha margem, e a margem e o que orienta o anuncio.</div>
        </div>
      ) : null}

      {/* Formulario GET: o filtro vira URL sozinho, sem JavaScript nenhum. */}
      <form method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <input type="search" name="q" defaultValue={q} placeholder="produto ou SKU" style={{ flex: "2 1 180px", width: "auto" }} />
        <select name="forn" defaultValue={forn} style={{ flex: "1 1 160px", width: "auto" }}>
          <option value="">Todos os fornecedores</option>
          {fornecedores.rows.map((f: any) => (<option key={f.id} value={f.id}>{f.nome}</option>))}
        </select>
        <select name="modo" defaultValue={modo} style={{ flex: "1 1 160px", width: "auto" }}>
          <option value="">Todos os modos</option>
          {MODOS_FILTRO.map((m) => (<option key={m.v} value={m.v}>{m.r}</option>))}
        </select>
        <select name="canal" defaultValue={canal} style={{ flex: "1 1 140px", width: "auto" }}>
          <option value="">Todos os canais</option>
          {canais.rows.map((c: any) => (<option key={c.codigo} value={c.codigo}>{c.codigo}</option>))}
        </select>
        <select name="situacao" defaultValue={situacao} style={{ flex: "1 1 160px", width: "auto" }}>
          <option value="">Todas as situacoes</option>
          {SITUACOES.map((s) => (<option key={s.v} value={s.v}>{s.r}</option>))}
        </select>
        <button type="submit">Filtrar</button>
        {q || canal || situacao || modo || forn ? (
          <Link href="/painel/produtos" className="botao secundario" style={{ display: "inline-flex", alignItems: "center" }}>Limpar</Link>
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
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>FORNECEDOR</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>ENTREGA</th>
                <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "right" }}>SALDO</th>
                <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "right" }}>CUSTO</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>VISIVEL EM</th>
              </tr>
            </thead>
            <tbody>
              {r.rows.map((v: any) => {
                const abre = familiaAtual !== v.handle;
                if (abre) familiaAtual = v.handle;
                const deEstoque = v.modo === "estoque";
                const zerado = deEstoque && v.disponivel === 0;
                return (
                  <tr key={v.sku} style={{ borderTop: "1px solid var(--borda)" }}>
                    <td style={{ padding: "12px 16px" }}>
                      {abre ? (
                        <div style={{ color: "var(--texto-fraco)", fontSize: "0.72rem", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
                          {v.familia}{v.familia_ativa ? "" : " · familia inativa"}
                        </div>
                      ) : null}
                      <Link href={`/painel/produtos/${v.handle}`}>
                        <b>{rotulo(v.familia, v.atributos)}</b>
                      </Link>
                      <br />
                      <code style={{ fontSize: "0.75rem", color: "var(--texto-fraco)" }}>{v.sku}</code>
                      {v.ativo ? null : (<span style={{ color: "var(--texto-fraco)", fontSize: "0.78rem" }}> · inativo</span>)}
                    </td>
                    <td style={{ padding: "12px 16px", fontSize: "0.86rem" }}>
                      {v.fornecedor ? (
                        <>
                          {v.fornecedor}
                          {v.fornecedor_ativo ? null : (<span style={{ color: "var(--texto-fraco)", fontSize: "0.76rem" }}> · inativo</span>)}
                        </>
                      ) : (
                        <Link href="/painel/fornecedores" style={{ color: "var(--alerta)" }}>sem fornecedor</Link>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--texto-fraco)", fontSize: "0.82rem" }}>
                      {ROTULO_MODO[v.modo] ?? v.modo}
                      {v.publicavel_marketplace ? null : (<><br /><span style={{ fontSize: "0.74rem" }}>fora do marketplace</span></>)}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>
                      {deEstoque ? (
                        <span style={{ color: zerado ? "var(--erro)" : "var(--ok)" }}>{v.disponivel}</span>
                      ) : (
                        <span style={{ color: "var(--texto-fraco)", fontSize: "0.82rem" }}>sob demanda</span>
                      )}
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {v.custo ? `${v.custo_moeda} ${Number(v.custo).toFixed(2)}` : (<span style={{ color: "var(--alerta)" }}>sem custo</span>)}
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--texto-fraco)" }}>
                      {v.canais ?? "—"}
                      {zerado && v.canais ? (<><br /><span style={{ color: "var(--erro)", fontSize: "0.76rem" }}>esgotado no ar</span></>) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
