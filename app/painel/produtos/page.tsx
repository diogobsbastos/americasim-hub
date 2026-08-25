import Link from "next/link";
import { db } from "../../../lib/db";
import Selos, { type SeloCanal } from "./Selos";

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
//
// ONDE VENDE, as duas origens (25/08/2026): esta coluna lia so canal_variante,
// que e a visibilidade das VITRINES. O vinculo com marketplace mora em
// canal_item, e a consulta nem olhava — entao um SKU podia estar publicado e
// vendendo no Mercado Livre com a lista jurando que ele nao estava em canal
// nenhum. Sao dois conceitos diferentes (intencao de exibir x anuncio
// amarrado), mas quem opera faz UMA pergunta so: onde este item esta no ar?

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

function lista(v: unknown): SeloCanal[] {
  return Array.isArray(v) ? (v as SeloCanal[]) : [];
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
    // As duas origens. Antes so a primeira: filtrar por "mercadolivre" devolvia
    // lista vazia mesmo com anuncio publicado, porque marketplace nunca entra
    // em canal_variante.
    args.push(canal);
    cond.push(
      `(exists (select 1 from canal_variante cvq join canal cq on cq.id = cvq.canal_id
                 where cvq.variante_id = v.id and cq.codigo = $${args.length} and cvq.visivel)
        or exists (select 1 from canal_item ciq join canal cq2 on cq2.id = ciq.canal_id
                    where ciq.variante_id = v.id and cq2.codigo = $${args.length}
                      and ciq.id_externo is not null))`,
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
       and (exists (select 1 from canal_variante cvx where cvx.variante_id = v.id and cvx.visivel)
            or exists (select 1 from canal_item cix where cix.variante_id = v.id and cix.id_externo is not null))`,
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
            (select json_agg(json_build_object(
                      'codigo', c2.codigo, 'nome', c2.nome, 'tipo', c2.tipo::text)
                      order by c2.codigo)
               from canal_variante cv2 join canal c2 on c2.id = cv2.canal_id
              where cv2.variante_id = v.id and cv2.visivel) as vitrines,
            (select json_agg(json_build_object(
                      'codigo', c3.codigo, 'nome', c3.nome, 'tipo', c3.tipo::text,
                      'externo', ci.id_externo, 'situacao', ci.status::text)
                      order by c3.codigo)
               from canal_item ci join canal c3 on c3.id = ci.canal_id
              where ci.variante_id = v.id and ci.id_externo is not null) as anuncios
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
  // Agora conta tambem quem esta no ar SO no marketplace — o risco la e maior,
  // porque o ML deixa comprar e o cliente ja pagou quando o erro aparece.
  const noAr = (x: any) => lista(x.vitrines).length > 0 || lista(x.anuncios).length > 0;
  const esgotados = r.rows.filter((x: any) => x.modo === "estoque" && x.disponivel === 0 && noAr(x)).length;
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
          <div className="rot">Sem estoque e ainda no ar</div>
          <div className="val">{esgotados}</div>
          <div className="pe">Quem comprar paga e recebe erro. Tire do ar ou reponha o lote.</div>
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
                <th style={{ padding: "12px 16px", fontWeight: 600, minWidth: 150 }}>ONDE VENDE</th>
              </tr>
            </thead>
            <tbody>
              {r.rows.map((v: any) => {
                const abre = familiaAtual !== v.handle;
                if (abre) familiaAtual = v.handle;
                const deEstoque = v.modo === "estoque";
                const zerado = deEstoque && v.disponivel === 0;
                const selos = [...lista(v.anuncios), ...lista(v.vitrines)];
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
                    <td style={{ padding: "12px 16px" }}>
                      <Selos canais={selos} />
                      {zerado && selos.length > 0 ? (
                        <div style={{ color: "var(--erro)", fontSize: "0.76rem", marginTop: 6 }}>esgotado no ar</div>
                      ) : null}
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
