import Link from "next/link";
import { db } from "../../../lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Vendas — AmericaSim", robots: { index: false, follow: false } };

const POR_PAGINA = 25;

const STATUS = [
  "aguardando_pagamento",
  "pago",
  "em_provisionamento",
  "entregue",
  "cancelado",
  "reembolsado",
  "chargeback",
];

function dinheiro(v: string | number | null): string {
  const n = String(v ?? "0").split(".");
  const inteiro = (n[0] || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${inteiro},${(n[1] ?? "00").padEnd(2, "0").slice(0, 2)}`;
}

function haQuanto(d: string | Date): string {
  const ms = Date.now() - new Date(d).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

export default async function Vendas({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; fila?: string; pagina?: string }>;
}) {
  // Estado do filtro na URL, nunca em estado de componente (SPEC/08 §1):
  // o link é compartilhável e o botão voltar funciona.
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = sp.status ?? "";
  const fila = sp.fila ?? "";
  const pagina = Math.max(1, Number(sp.pagina ?? "1") || 1);

  const cond: string[] = [];
  const args: unknown[] = [];

  if (q) {
    args.push(`%${q}%`);
    cond.push(`(p.numero ilike $${args.length} or cl.email::text ilike $${args.length})`);
  }
  if (status && STATUS.includes(status)) {
    args.push(status);
    cond.push(`p.status = $${args.length}::status_pedido`);
  }
  if (fila === "excecao") {
    cond.push(`p.status in ('pago','em_provisionamento') and p.entregue = false`);
  }
  const onde = cond.length ? `where ${cond.join(" and ")}` : "";

  const total = await db.query(
    `select count(*)::int as n from pedido p left join cliente cl on cl.id = p.cliente_id ${onde}`,
    args,
  );
  const nTotal: number = total.rows[0]?.n ?? 0;
  const nPaginas = Math.max(1, Math.ceil(nTotal / POR_PAGINA));
  const paginaSegura = Math.min(pagina, nPaginas);

  const r = await db.query(
    `select p.numero, p.status::text as status, p.entregue, p.total::text as total,
            p.criado_em, p.entregue_em, c.codigo as canal, cl.email::text as email
       from pedido p
       join canal c on c.id = p.canal_id
       left join cliente cl on cl.id = p.cliente_id
       ${onde}
      order by p.criado_em desc
      limit ${POR_PAGINA} offset ${(paginaSegura - 1) * POR_PAGINA}`,
    args,
  );

  const excecao = await db.query(
    `select count(*)::int as n from pedido
      where status in ('pago','em_provisionamento') and entregue = false`,
  );
  const nExcecao: number = excecao.rows[0]?.n ?? 0;

  function url(mudanca: Record<string, string>): string {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (status) p.set("status", status);
    if (fila) p.set("fila", fila);
    for (const [k, v] of Object.entries(mudanca)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const s = p.toString();
    return s ? `/painel/vendas?${s}` : "/painel/vendas";
  }

  return (
    <>
      <div className="pn-cabeca">
        <h1>Vendas</h1>
        <p>
          {nTotal} pedido{nTotal === 1 ? "" : "s"}
          {fila === "excecao" ? " na fila de exceção" : ""}
          {status ? ` com situação ${status}` : ""}
          {q ? ` para "${q}"` : ""}
        </p>
      </div>

      {nExcecao > 0 && fila !== "excecao" ? (
        <div className="cartao perigo" style={{ marginBottom: 18 }}>
          <div className="rot">Pago sem entrega</div>
          <div className="val">{nExcecao}</div>
          <div className="pe">
            Cliente pagou e não recebeu. <Link href={url({ fila: "excecao", pagina: "" })}>Ver só esses</Link>
          </div>
        </div>
      ) : null}

      {/* Formulario GET: o filtro vira URL sozinho, sem JavaScript nenhum. */}
      <form method="get" style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="número do pedido ou e-mail"
          style={{ flex: "2 1 240px", width: "auto" }}
        />
        <select name="status" defaultValue={status} style={{ flex: "1 1 180px", width: "auto" }}>
          <option value="">Todas as situações</option>
          {STATUS.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        {fila ? <input type="hidden" name="fila" value={fila} /> : null}
        <button type="submit">Filtrar</button>
        {q || status || fila ? (
          <Link
            href="/painel/vendas"
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
          <p className="nota">Nenhum pedido bate com esse filtro.</p>
        </div>
      ) : (
        <div className="cartao" style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--texto-fraco)", fontSize: "0.72rem" }}>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>PEDIDO</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>QUANDO</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>CLIENTE</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>CANAL</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>SITUAÇÃO</th>
                <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "right" }}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {r.rows.map((p: any) => {
                const parado = !p.entregue && (p.status === "pago" || p.status === "em_provisionamento");
                return (
                  <tr key={p.numero} style={{ borderTop: "1px solid var(--borda)" }}>
                    <td style={{ padding: "12px 16px" }}>
                      <Link href={`/painel/vendas/${p.numero}`}>
                        <code>{p.numero}</code>
                      </Link>
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--texto-fraco)" }}>
                      {haQuanto(p.criado_em)}
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--texto-fraco)" }}>
                      {p.email ?? "—"}
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--texto-fraco)" }}>{p.canal}</td>
                    <td style={{ padding: "12px 16px" }}>
                      <span style={{ color: parado ? "var(--erro)" : p.entregue ? "var(--ok)" : "var(--alerta)" }}>
                        {parado ? `parado há ${haQuanto(p.criado_em)}` : p.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right" }}>{dinheiro(p.total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {nPaginas > 1 ? (
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16 }}>
          {paginaSegura > 1 ? (
            <Link href={url({ pagina: String(paginaSegura - 1) })}>← anterior</Link>
          ) : null}
          <span style={{ color: "var(--texto-fraco)", fontSize: "0.85rem" }}>
            página {paginaSegura} de {nPaginas}
          </span>
          {paginaSegura < nPaginas ? (
            <Link href={url({ pagina: String(paginaSegura + 1) })}>próxima →</Link>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
