import Link from "next/link";
import { db } from "../../../../../lib/db";
import { usuarioDaSessao } from "../../../../../lib/painel/sessao";
import FormLote from "./FormLote";
import ListaCodigos, { type LinhaEstoque } from "./ListaCodigos";
import Abas from "../Abas";

export const dynamic = "force-dynamic";

export const metadata = { title: "Estoque — AmericaSim", robots: { index: false, follow: false } };

// Teto da lista. Sem teto, um lote de 5 mil codigos monta uma tabela que trava o
// navegador e ninguem consegue clicar em nada. Com teto, a tela AVISA quantos
// ficaram de fora — agir sobre o que nao se esta vendo e como isso da errado.
const TETO = 200;

const SITUACOES = ["disponivel", "reservado", "entregue", "defeito", "expirado", "devolvido", "interno"];

function brl(v: string | number | null): string {
  if (v === null || v === undefined) return "—";
  const n = String(v).split(".");
  return `R$ ${(n[0] || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${(n[1] ?? "00").padEnd(2, "0").slice(0, 2)}`;
}

function descreverMovimento(m: any): string {
  if (m.tipo === "correcao") {
    const campos = m.campos ?? {};
    const partes = Object.keys(campos).map(
      (c) => `${c}: ${campos[c].antes ?? "—"} → ${campos[c].depois ?? "—"}`,
    );
    return partes.join(" · ") || "correção";
  }
  if (m.status_antes && m.status_depois) return `${m.status_antes} → ${m.status_depois}`;
  if (m.status_depois) return `entrou como ${m.status_depois}`;
  return m.tipo;
}

export default async function Estoque({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string }>;
  searchParams: Promise<{ v?: string; s?: string; l?: string }>;
}) {
  const { handle } = await params;
  const filtro = await searchParams;
  const fSku = (filtro.v ?? "").trim();
  const fStatus = (filtro.s ?? "").trim();
  const fLote = (filtro.l ?? "").trim();

  const u = await usuarioDaSessao();
  const podeImportar = u?.papel === "admin" || u?.papel === "operacao";
  const podeCusto = u?.papel === "admin";

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

  // Os filtros entram como parametro, nunca concatenados na string do SQL.
  // `$3 = '' or e.lote ilike ...` deixa o mesmo SQL servir com e sem filtro,
  // sem montar consulta por pedaco de texto vindo da URL.
  const where = `v.produto_id = $1
       and ($2 = '' or v.sku = $2)
       and ($3 = '' or e.status::text = $3)
       and ($4 = '' or e.lote ilike '%' || $4 || '%')`;
  const args = [prod.id, fSku, fStatus, fLote];

  const [vars, porVariante, lotes, codigos, quantos, historico] = await Promise.all([
    db.query("select id, sku from variante where produto_id = $1 and ativo order by sku", [prod.id]),
    db.query(
      `select v.sku,
              count(*) filter (where e.status = 'disponivel')::int as disponivel,
              count(*) filter (where e.status = 'entregue')::int   as entregue,
              count(*) filter (where e.status not in ('disponivel','entregue'))::int as outros,
              count(*) filter (where e.status = 'disponivel' and e.custo_brl is null)::int as sem_custo,
              min(e.validade) filter (where e.status = 'disponivel') as validade_mais_proxima
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
    db.query(
      `select e.id, v.sku, e.iccid, e.status::text as status, e.lote, e.operadora,
              e.validade::text as validade, e.custo_brl::text as custo_brl,
              e.criado_em::text as criado_em
         from estoque_esim e
         join variante v on v.id = e.variante_id
        where ${where}
        order by (e.status = 'disponivel') desc, e.criado_em desc
        limit ${TETO}`,
      args,
    ),
    db.query(
      `select count(*)::int as n
         from estoque_esim e join variante v on v.id = e.variante_id
        where ${where}`,
      args,
    ),
    db.query(
      `select m.tipo, m.status_antes::text as status_antes, m.status_depois::text as status_depois,
              m.motivo, m.campos, m.criado_em, u.nome as quem, e.iccid, v.sku
         from movimento_estoque m
         join estoque_esim e on e.id = m.estoque_id
         join variante v on v.id = e.variante_id
         left join usuario u on u.id = m.usuario_id
        where v.produto_id = $1
        order by m.criado_em desc, m.id desc
        limit 40`,
      [prod.id],
    ),
  ]);

  const total = quantos.rows[0]?.n ?? 0;
  const linhas: LinhaEstoque[] = codigos.rows as any;

  return (
    <>
      <div className="pn-cabeca">
        <h1>{prod.nome}</h1>
        <p>
          <code>{prod.handle}</code> · <Link href="/painel/produtos">voltar para a lista</Link> ·{" "}
          <Link href="/painel/estoque/alertas">configurar alertas de mínimo</Link>
        </p>
      </div>

      <Abas handle={prod.handle} atual="estoque" />

      <p style={{ color: "var(--texto-fraco)", margin: "0 0 22px", fontSize: "0.9rem" }}>
        Cada código é uma linha própria no banco, nunca um contador. É isso que impede dois
        clientes receberem o mesmo eSIM — e por isso retirar do estoque é escolher <b>qual</b>,
        não digitar quantos.
      </p>

      {/* ------------------------------------------------------- resumo */}
      <div className="cartao" style={{ padding: 0, overflowX: "auto", marginBottom: 26 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--texto-fraco)", fontSize: "0.72rem" }}>
              <th style={{ padding: "12px 16px", fontWeight: 600 }}>VARIANTE</th>
              <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "right" }}>DISPONÍVEL</th>
              <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "right" }}>ENTREGUE</th>
              <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "right" }}>FORA DO ESTOQUE</th>
              <th style={{ padding: "12px 16px", fontWeight: 600 }}>SEM CUSTO EM BRL</th>
              <th style={{ padding: "12px 16px", fontWeight: 600 }}>VENCE PRIMEIRO</th>
            </tr>
          </thead>
          <tbody>
            {porVariante.rows.map((v: any) => (
              <tr key={v.sku} style={{ borderTop: "1px solid var(--borda)" }}>
                <td style={{ padding: "12px 16px" }}>
                  <Link href={`/painel/produtos/${prod.handle}/estoque?v=${encodeURIComponent(v.sku)}`}>
                    <code>{v.sku}</code>
                  </Link>
                </td>
                <td style={{ padding: "12px 16px", textAlign: "right" }}>
                  <span style={{ color: v.disponivel > 0 ? "var(--ok)" : "var(--erro)" }}>{v.disponivel}</span>
                </td>
                <td style={{ padding: "12px 16px", textAlign: "right", color: "var(--texto-fraco)" }}>{v.entregue}</td>
                <td style={{ padding: "12px 16px", textAlign: "right", color: "var(--texto-fraco)" }}>{v.outros}</td>
                <td style={{ padding: "12px 16px" }}>
                  {v.sem_custo > 0 ? (
                    <span style={{ color: "var(--alerta)" }}>{v.sem_custo} — margem aproximada, não apurada</span>
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

      {/* ------------------------------------------------------- filtro */}
      <h2 style={{ fontSize: "1.1rem", margin: "0 0 4px" }}>Códigos</h2>
      <p style={{ color: "var(--texto-fraco)", margin: "0 0 12px", fontSize: "0.88rem" }}>
        O código de ativação não aparece aqui. Quem identifica a linha é o ICCID.
      </p>

      <form
        method="get"
        className="cartao"
        style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}
      >
        <div style={{ minWidth: 180 }}>
          <label className="rotulo">Variante</label>
          <select name="v" defaultValue={fSku}>
            <option value="">todas</option>
            {vars.rows.map((v: any) => (
              <option key={v.id} value={v.sku}>
                {v.sku}
              </option>
            ))}
          </select>
        </div>
        <div style={{ minWidth: 160 }}>
          <label className="rotulo">Situação</label>
          <select name="s" defaultValue={fStatus}>
            <option value="">todas</option>
            {SITUACOES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div style={{ minWidth: 160 }}>
          <label className="rotulo">Lote contém</label>
          <input type="text" name="l" defaultValue={fLote} placeholder="NF-1234" />
        </div>
        <button type="submit">Filtrar</button>
        {fSku || fStatus || fLote ? (
          <Link href={`/painel/produtos/${prod.handle}/estoque`} style={{ fontSize: "0.85rem" }}>
            limpar
          </Link>
        ) : null}
        <span style={{ color: "var(--texto-fraco)", fontSize: "0.85rem", marginLeft: "auto" }}>
          {total} código(s) no filtro
        </span>
      </form>

      <ListaCodigos
        handle={prod.handle}
        linhas={linhas}
        podeMover={!!podeImportar}
        podeCusto={!!podeCusto}
        truncado={Math.max(0, total - linhas.length)}
      />

      {/* ------------------------------------------------------- entrada */}
      <h2 style={{ fontSize: "1.1rem", margin: "34px 0 4px" }}>Entrada de estoque</h2>
      {podeImportar ? (
        <FormLote handle={prod.handle} variantes={vars.rows.map((v: any) => ({ id: v.id, sku: v.sku }))} />
      ) : (
        <div className="aviso">
          <h1>Somente leitura</h1>
          <p className="nota">Seu papel não permite importar estoque.</p>
        </div>
      )}

      {/* ------------------------------------------------------- lotes */}
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
                      <Link href={`/painel/produtos/${prod.handle}/estoque?l=${encodeURIComponent(l.lote)}`}>
                        <b>{l.lote}</b>
                      </Link>
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

      {/* ------------------------------------------------------- historico */}
      <h2 style={{ fontSize: "1.1rem", margin: "34px 0 4px" }}>Histórico de movimentação</h2>
      <p style={{ color: "var(--texto-fraco)", margin: "0 0 12px", fontSize: "0.88rem" }}>
        Quem mexeu, quando, e o que mudou. Últimos 40 movimentos deste produto.
      </p>
      <div className="cartao" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--texto-fraco)", fontSize: "0.7rem" }}>
              <th style={{ padding: "10px 14px", fontWeight: 600 }}>QUANDO</th>
              <th style={{ padding: "10px 14px", fontWeight: 600 }}>O QUÊ</th>
              <th style={{ padding: "10px 14px", fontWeight: 600 }}>LINHA</th>
              <th style={{ padding: "10px 14px", fontWeight: 600 }}>MUDANÇA</th>
              <th style={{ padding: "10px 14px", fontWeight: 600 }}>OBSERVAÇÃO</th>
              <th style={{ padding: "10px 14px", fontWeight: 600 }}>QUEM</th>
            </tr>
          </thead>
          <tbody>
            {historico.rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "10px 14px", color: "var(--texto-fraco)" }}>
                  Nenhum movimento ainda. A partir de agora, toda entrada, retirada e correção
                  aparece aqui.
                </td>
              </tr>
            ) : null}
            {historico.rows.map((m: any, i: number) => (
              <tr key={i} style={{ borderTop: "1px solid var(--borda)" }}>
                <td style={{ padding: "10px 14px", color: "var(--texto-fraco)", whiteSpace: "nowrap" }}>
                  {new Date(m.criado_em).toLocaleString("pt-BR")}
                </td>
                <td style={{ padding: "10px 14px" }}>{m.tipo}</td>
                <td style={{ padding: "10px 14px" }}>
                  <code style={{ fontSize: "0.72rem" }}>{m.iccid ?? m.sku}</code>
                </td>
                <td style={{ padding: "10px 14px" }}>{descreverMovimento(m)}</td>
                <td style={{ padding: "10px 14px", color: "var(--texto-fraco)" }}>{m.motivo ?? "—"}</td>
                <td style={{ padding: "10px 14px", color: "var(--texto-fraco)" }}>{m.quem ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p
        style={{
          color: "var(--texto-fraco)",
          fontSize: "0.82rem",
          marginTop: 20,
          borderLeft: "3px solid var(--borda)",
          paddingLeft: 12,
        }}
      >
        <b>O código de ativação não aparece em tela nenhuma do painel</b>, nem aqui, nem no
        histórico, nem na auditoria. Ele é o produto: quem vê, tem.
      </p>
    </>
  );
}
