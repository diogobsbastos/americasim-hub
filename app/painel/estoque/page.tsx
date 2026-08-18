import Link from "next/link";
import { db } from "../../../lib/db";
import { usuarioDaSessao } from "../../../lib/painel/sessao";
import ListaCodigos, { type LinhaEstoque } from "./ListaCodigos";

export const dynamic = "force-dynamic";

export const metadata = { title: "Estoque — AmericaSim", robots: { index: false, follow: false } };

// Teto da lista. Sem teto, um lote de 5 mil codigos monta uma tabela que trava o
// navegador. Com teto, a tela AVISA quantos ficaram de fora — agir sobre o que
// nao se esta vendo e como isso da errado.
const TETO = 200;

const SITUACOES = ["disponivel", "reservado", "entregue", "defeito", "expirado", "devolvido", "interno"];

export default async function EstoqueGeral({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; v?: string; s?: string; l?: string }>;
}) {
  const f = await searchParams;
  const fProd = (f.p ?? "").trim();
  const fSku = (f.v ?? "").trim();
  const fStatus = (f.s ?? "").trim();
  const fLote = (f.l ?? "").trim();

  const u = await usuarioDaSessao();
  const podeMover = u?.papel === "admin" || u?.papel === "operacao";
  const podeCusto = u?.papel === "admin";

  // Filtros como PARAMETRO, nunca concatenados na string do SQL. O mesmo texto
  // de consulta serve com e sem filtro.
  const where = `($1 = '' or p.handle = $1)
       and ($2 = '' or v.sku = $2)
       and ($3 = '' or e.status::text = $3)
       and ($4 = '' or e.lote ilike '%' || $4 || '%')`;
  const args = [fProd, fSku, fStatus, fLote];

  const [produtos, variantes, resumo, atencao, codigos, quantos, historico] = await Promise.all([
    db.query("select handle, nome from produto order by nome"),
    db.query(
      `select distinct v.sku from variante v join produto p on p.id = v.produto_id
        where v.ativo and ($1 = '' or p.handle = $1) order by v.sku`,
      [fProd],
    ),
    db.query(
      `select p.handle, p.nome as produto, v.sku,
              count(*) filter (where e.status = 'disponivel')::int as disponivel,
              count(*) filter (where e.status = 'reservado')::int  as reservado,
              count(*) filter (where e.status = 'entregue')::int   as entregue,
              count(*) filter (where e.status not in ('disponivel','reservado','entregue'))::int as fora,
              min(e.validade) filter (where e.status = 'disponivel') as vence
         from variante v
         join produto p on p.id = v.produto_id
         left join estoque_esim e on e.variante_id = v.id
        where v.ativo and ($1 = '' or p.handle = $1)
        group by p.handle, p.nome, v.sku
        order by p.nome, v.sku`,
      [fProd],
    ),
    // O alerta que justifica a tela existir: variante SEM codigo livre que
    // continua visivel numa vitrine. Hoje isso so aparece quando o cliente paga
    // e o checkout devolve `estoque_indisponivel` — ou seja, o cliente descobre
    // antes de nos.
    db.query(
      `select p.handle, p.nome as produto, v.sku, c.codigo as canal
         from canal_variante cv
         join variante v on v.id = cv.variante_id and v.ativo
         join produto p on p.id = v.produto_id and p.ativo
         join canal c on c.id = cv.canal_id and c.ativo
        where cv.visivel
          and (select count(*) from estoque_esim e
                where e.variante_id = v.id and e.status = 'disponivel') = 0
        order by p.nome, v.sku, c.codigo`,
    ),
    db.query(
      `select e.id, p.nome as produto, p.handle, v.sku, e.iccid, e.status::text as status,
              e.lote, e.operadora, e.validade::text as validade,
              e.custo_brl::text as custo_brl, e.criado_em::text as criado_em
         from estoque_esim e
         join variante v on v.id = e.variante_id
         join produto p on p.id = v.produto_id
        where ${where}
        order by (e.status = 'disponivel') desc, e.criado_em desc
        limit ${TETO}`,
      args,
    ),
    db.query(
      `select count(*)::int as n
         from estoque_esim e
         join variante v on v.id = e.variante_id
         join produto p on p.id = v.produto_id
        where ${where}`,
      args,
    ),
    db.query(
      `select m.tipo, m.status_antes::text as status_antes, m.status_depois::text as status_depois,
              m.motivo, m.campos, m.criado_em, u.nome as quem, e.iccid, v.sku, p.nome as produto
         from movimento_estoque m
         join estoque_esim e on e.id = m.estoque_id
         join variante v on v.id = e.variante_id
         join produto p on p.id = v.produto_id
         left join usuario u on u.id = m.usuario_id
        order by m.criado_em desc, m.id desc
        limit 40`,
    ),
  ]);

  const total = quantos.rows[0]?.n ?? 0;
  const linhas: LinhaEstoque[] = codigos.rows as any;

  function descrever(m: any): string {
    if (m.tipo === "correcao") {
      const c = m.campos ?? {};
      const partes = Object.keys(c).map((k) => `${k}: ${c[k].antes ?? "—"} → ${c[k].depois ?? "—"}`);
      return partes.join(" · ") || "correção";
    }
    if (m.status_antes && m.status_depois) return `${m.status_antes} → ${m.status_depois}`;
    if (m.status_depois) return `entrou como ${m.status_depois}`;
    return m.tipo;
  }

  return (
    <>
      <div className="pn-cabeca">
        <h1>Estoque</h1>
        <p>
          Todos os códigos de todos os produtos. Cada código é uma linha própria, nunca um
          contador — é isso que impede dois clientes receberem o mesmo eSIM, e é por isso que
          retirar do estoque é escolher <b>qual</b>, não digitar quantos.
        </p>
      </div>

      {/* ------------------------------------------------ precisa de atenção */}
      {atencao.rows.length > 0 ? (
        <div className="cartao perigo" style={{ marginBottom: 22 }}>
          <p style={{ margin: "0 0 8px", fontWeight: 700, color: "var(--erro)" }}>
            {atencao.rows.length} variante(s) sem código livre e ainda à venda
          </p>
          <p style={{ margin: "0 0 10px", color: "var(--texto-fraco)", fontSize: "0.86rem" }}>
            A loja está mostrando e aceitando clique. O cliente só descobre depois de pagar,
            quando o checkout recusa. Ou repõe o estoque, ou tira de visível na tela de Produtos.
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.88rem" }}>
            {atencao.rows.map((a: any, i: number) => (
              <li key={i}>
                <Link href={`/painel/produtos/${a.handle}`}>
                  <code>{a.sku}</code>
                </Link>{" "}
                <span style={{ color: "var(--texto-fraco)" }}>
                  — {a.produto} · visível em <b>{a.canal}</b>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* ------------------------------------------------------- resumo */}
      <div className="cartao" style={{ padding: 0, overflowX: "auto", marginBottom: 22 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--texto-fraco)", fontSize: "0.7rem" }}>
              <th style={{ padding: "11px 14px", fontWeight: 600 }}>PRODUTO</th>
              <th style={{ padding: "11px 14px", fontWeight: 600 }}>VARIANTE</th>
              <th style={{ padding: "11px 14px", fontWeight: 600, textAlign: "right" }}>DISPONÍVEL</th>
              <th style={{ padding: "11px 14px", fontWeight: 600, textAlign: "right" }}>RESERVADO</th>
              <th style={{ padding: "11px 14px", fontWeight: 600, textAlign: "right" }}>ENTREGUE</th>
              <th style={{ padding: "11px 14px", fontWeight: 600, textAlign: "right" }}>FORA</th>
              <th style={{ padding: "11px 14px", fontWeight: 600 }}>VENCE PRIMEIRO</th>
              <th style={{ padding: "11px 14px", fontWeight: 600 }}></th>
            </tr>
          </thead>
          <tbody>
            {resumo.rows.map((r: any, i: number) => (
              <tr key={i} style={{ borderTop: "1px solid var(--borda)" }}>
                <td style={{ padding: "11px 14px" }}>{r.produto}</td>
                <td style={{ padding: "11px 14px" }}>
                  <code style={{ fontSize: "0.75rem" }}>{r.sku}</code>
                </td>
                <td style={{ padding: "11px 14px", textAlign: "right" }}>
                  <span style={{ color: r.disponivel > 0 ? "var(--ok)" : "var(--erro)", fontWeight: 700 }}>
                    {r.disponivel}
                  </span>
                </td>
                <td style={{ padding: "11px 14px", textAlign: "right", color: "var(--texto-fraco)" }}>{r.reservado}</td>
                <td style={{ padding: "11px 14px", textAlign: "right", color: "var(--texto-fraco)" }}>{r.entregue}</td>
                <td style={{ padding: "11px 14px", textAlign: "right", color: "var(--texto-fraco)" }}>{r.fora}</td>
                <td style={{ padding: "11px 14px", color: "var(--texto-fraco)" }}>
                  {r.vence ? new Date(r.vence).toLocaleDateString("pt-BR") : "—"}
                </td>
                <td style={{ padding: "11px 14px", fontSize: "0.8rem" }}>
                  <Link href={`/painel/estoque?v=${encodeURIComponent(r.sku)}`}>ver códigos</Link>
                  {" · "}
                  <Link href={`/painel/produtos/${r.handle}/estoque`}>entrada de lote</Link>
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
        <div style={{ minWidth: 170 }}>
          <label className="rotulo">Produto</label>
          <select name="p" defaultValue={fProd}>
            <option value="">todos</option>
            {produtos.rows.map((p: any) => (
              <option key={p.handle} value={p.handle}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div style={{ minWidth: 170 }}>
          <label className="rotulo">Variante</label>
          <select name="v" defaultValue={fSku}>
            <option value="">todas</option>
            {variantes.rows.map((v: any) => (
              <option key={v.sku} value={v.sku}>
                {v.sku}
              </option>
            ))}
          </select>
        </div>
        <div style={{ minWidth: 150 }}>
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
        <div style={{ minWidth: 150 }}>
          <label className="rotulo">Lote contém</label>
          <input type="text" name="l" defaultValue={fLote} placeholder="NF-1234" />
        </div>
        <button type="submit">Filtrar</button>
        {fProd || fSku || fStatus || fLote ? (
          <Link href="/painel/estoque" style={{ fontSize: "0.85rem" }}>
            limpar
          </Link>
        ) : null}
        <span style={{ color: "var(--texto-fraco)", fontSize: "0.85rem", marginLeft: "auto" }}>
          {total} código(s) no filtro
        </span>
      </form>

      <ListaCodigos
        linhas={linhas}
        podeMover={!!podeMover}
        podeCusto={!!podeCusto}
        truncado={Math.max(0, total - linhas.length)}
        mostrarProduto
      />

      <p style={{ color: "var(--texto-fraco)", fontSize: "0.85rem", marginTop: 18 }}>
        Para <b>dar entrada</b> em um lote novo, entre no produto:{" "}
        {produtos.rows.map((p: any, i: number) => (
          <span key={p.handle}>
            {i > 0 ? " · " : ""}
            <Link href={`/painel/produtos/${p.handle}/estoque`}>{p.nome}</Link>
          </span>
        ))}
      </p>

      {/* ------------------------------------------------------- historico */}
      <h2 style={{ fontSize: "1.1rem", margin: "34px 0 4px" }}>Histórico de movimentação</h2>
      <p style={{ color: "var(--texto-fraco)", margin: "0 0 12px", fontSize: "0.88rem" }}>
        Quem mexeu, quando, e o que mudou. Últimos 40 movimentos, de todos os produtos.
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
                <td style={{ padding: "10px 14px" }}>{descrever(m)}</td>
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
