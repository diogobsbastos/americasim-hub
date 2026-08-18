import Link from "next/link";
import { db } from "../../lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Painel — AmericaSim", robots: { index: false, follow: false } };

function dinheiro(v: string | number | null): string {
  const n = String(v ?? "0").split(".");
  const inteiro = (n[0] || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${inteiro},${(n[1] ?? "00").padEnd(2, "0").slice(0, 2)}`;
}

export default async function PainelHome() {
  // Consulta unica: cada numero desta tela tem que sair do mesmo instante, senao
  // o alerta discorda do contador logo abaixo dele.
  const r = await db.query(`
    select
      (select count(*)::int from pedido where criado_em::date = current_date) as pedidos_hoje,
      (select coalesce(sum(total),0)::text from pedido
        where criado_em::date = current_date and status <> 'cancelado') as receita_hoje,
      (select count(*)::int from pedido where entregue) as entregues_total,
      (select count(*)::int from estoque_esim where status = 'disponivel') as esims_disponiveis,
      (select count(*)::int from pedido
        where status in ('pago','em_provisionamento') and entregue = false) as fila_excecao,
      (select count(*)::int from notificacao where status = 'pendente') as notif_pendentes,
      (select count(*)::int from evento_saida where publicado_em is null) as outbox_parado
  `);
  const m = r.rows[0];

  const ultimos = await db.query(`
    select p.numero, p.status::text as status, p.entregue, p.total::text as total,
           p.criado_em, c.codigo as canal, cl.email::text as email
      from pedido p
      join canal c on c.id = p.canal_id
      left join cliente cl on cl.id = p.cliente_id
     order by p.criado_em desc
     limit 10
  `);

  const temAlerta = m.fila_excecao > 0 || m.esims_disponiveis === 0 || m.outbox_parado > 0;

  return (
    <>
      <div className="pn-cabeca">
        <h1>Painel</h1>
        <p>Se estiver tudo verde aqui, está tudo bem.</p>
      </div>

      {temAlerta ? (
        <div className="cartoes" style={{ marginBottom: 22 }}>
          {m.fila_excecao > 0 ? (
            <div className="cartao perigo">
              <div className="rot">Pago sem entrega</div>
              <div className="val">{m.fila_excecao}</div>
              <div className="pe">
                <Link href="/painel/vendas?fila=excecao">Resolver agora</Link>
              </div>
            </div>
          ) : null}
          {m.esims_disponiveis === 0 ? (
            <div className="cartao perigo">
              <div className="rot">Estoque de eSIM</div>
              <div className="val">0</div>
              <div className="pe">A loja não consegue mais entregar.</div>
            </div>
          ) : null}
          {m.outbox_parado > 0 ? (
            <div className="cartao perigo">
              <div className="rot">Eventos na fila</div>
              <div className="val">{m.outbox_parado}</div>
              <div className="pe">O worker pode estar parado.</div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="cartoes">
        <div className="cartao">
          <div className="rot">Pedidos hoje</div>
          <div className="val">{m.pedidos_hoje}</div>
        </div>
        <div className="cartao">
          <div className="rot">Receita hoje</div>
          <div className="val">{dinheiro(m.receita_hoje)}</div>
          <div className="pe">Sem descontar taxa nem custo</div>
        </div>
        <div className="cartao">
          <div className="rot">eSIMs disponíveis</div>
          <div className="val">{m.esims_disponiveis}</div>
        </div>
        <div className="cartao">
          <div className="rot">Entregues no total</div>
          <div className="val">{m.entregues_total}</div>
        </div>
        <div className="cartao">
          <div className="rot">Notificações na fila</div>
          <div className="val">{m.notif_pendentes}</div>
          <div className="pe">E-mail real ainda não ligado</div>
        </div>
      </div>

      <h2 style={{ margin: "34px 0 12px", fontSize: "1.05rem", textTransform: "uppercase" }}>
        Últimos pedidos
      </h2>

      {ultimos.rows.length === 0 ? (
        <div className="aviso">
          <h1>Nenhum pedido ainda</h1>
          <p className="nota">Assim que alguém comprar na loja, aparece aqui.</p>
        </div>
      ) : (
        <div className="cartao" style={{ padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--texto-fraco)", fontSize: "0.75rem" }}>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>PEDIDO</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>CLIENTE</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>CANAL</th>
                <th style={{ padding: "12px 16px", fontWeight: 600 }}>SITUAÇÃO</th>
                <th style={{ padding: "12px 16px", fontWeight: 600, textAlign: "right" }}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {ultimos.rows.map((p: any) => (
                <tr key={p.numero} style={{ borderTop: "1px solid var(--borda)" }}>
                  <td style={{ padding: "12px 16px" }}>
                    <Link href={`/painel/vendas/${p.numero}`}>
                      <code>{p.numero}</code>
                    </Link>
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--texto-fraco)" }}>
                    {p.email ?? "—"}
                  </td>
                  <td style={{ padding: "12px 16px", color: "var(--texto-fraco)" }}>{p.canal}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <span style={{ color: p.entregue ? "var(--ok)" : "var(--alerta)" }}>
                      {p.status}
                    </span>
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>{dinheiro(p.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
