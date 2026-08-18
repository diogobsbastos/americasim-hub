import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "../../../../lib/db";

export const dynamic = "force-dynamic";

export const metadata = { title: "Pedido — AmericaSim", robots: { index: false, follow: false } };

function dinheiro(v: string | number | null): string {
  const n = String(v ?? "0").split(".");
  const inteiro = (n[0] || "0").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${inteiro},${(n[1] ?? "00").padEnd(2, "0").slice(0, 2)}`;
}

function quando(d: string | Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR");
}

export default async function DetalhePedido({ params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;

  const p = await db.query(
    `select p.id, p.numero, p.status::text as status, p.entregue, p.entregue_em, p.criado_em,
            p.total::text as total, p.moeda, p.pagamento_ref, p.id_externo,
            c.codigo as canal, c.nome as canal_nome,
            cl.email::text as email, cl.nome as cliente_nome, cl.telefone
       from pedido p
       join canal c on c.id = p.canal_id
       left join cliente cl on cl.id = p.cliente_id
      where p.numero = $1`,
    [numero],
  );
  if (p.rows.length === 0) notFound();
  const ped = p.rows[0];

  const itens = await db.query(
    `select i.quantidade, i.preco_unit::text as preco, i.custo_unit::text as custo,
            v.sku, v.atributos, pr.nome as produto
       from item_pedido i
       join variante v on v.id = i.variante_id
       join produto pr on pr.id = v.produto_id
      where i.pedido_id = $1`,
    [ped.id],
  );

  // ATENCAO: o codigo LPA NUNCA aparece aqui. Criterio de aceite da SPEC/08 §12.
  // Mostramos so o ICCID, que identifica o chip sem permitir instala-lo.
  const ativacoes = await db.query(
    `select a.id, a.status::text as status, a.entregue_em, a.confirmado_em,
            a.tentativas, a.ultimo_erro, e.iccid, e.operadora
       from ativacao a
       left join estoque_esim e on e.id = a.estoque_id
      where a.pedido_id = $1
      order by a.criado_em`,
    [ped.id],
  );

  const eventos = await db.query(
    `select tipo, criado_em, publicado_em, tentativas, ultimo_erro
       from evento_saida where agregado = 'pedido' and agregado_id = $1
      order by id`,
    [ped.id],
  );

  const notificacoes = await db.query(
    `select destino, canal::text as canal, modelo, status::text as status,
            tentativas, enviada_em, ultimo_erro, criado_em
       from notificacao where referencia = $1 order by criado_em`,
    [ped.numero],
  );

  const parado = !ped.entregue && (ped.status === "pago" || ped.status === "em_provisionamento");

  return (
    <>
      <div className="pn-cabeca">
        <p style={{ marginBottom: 6 }}>
          <Link href="/painel/vendas">← Vendas</Link>
        </p>
        <h1>{ped.numero}</h1>
        <p>
          {ped.canal_nome} · {quando(ped.criado_em)}
        </p>
      </div>

      {parado ? (
        <div className="cartao perigo" style={{ marginBottom: 20 }}>
          <div className="rot">Pago sem entrega</div>
          <div className="val">precisa de ação</div>
          <div className="pe">
            O cliente pagou e não recebeu o eSIM. Verifique estoque da variante e o worker.
          </div>
        </div>
      ) : null}

      <div className="cartoes" style={{ marginBottom: 24 }}>
        <div className="cartao">
          <div className="rot">Situação</div>
          <div className="val" style={{ fontSize: "1.2rem", color: ped.entregue ? "var(--ok)" : "var(--alerta)" }}>
            {ped.status.replace(/_/g, " ")}
          </div>
        </div>
        <div className="cartao">
          <div className="rot">Total</div>
          <div className="val" style={{ fontSize: "1.4rem" }}>{dinheiro(ped.total)}</div>
        </div>
        <div className="cartao">
          <div className="rot">Entregue em</div>
          <div className="val" style={{ fontSize: "1rem" }}>{quando(ped.entregue_em)}</div>
        </div>
      </div>

      <div className="cartao" style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: "0.95rem", textTransform: "uppercase", margin: "0 0 10px" }}>Cliente</h2>
        <div className="linha"><span>E-mail</span><code>{ped.email ?? "—"}</code></div>
        <div className="linha"><span>Nome</span><code>{ped.cliente_nome ?? "—"}</code></div>
        <div className="linha"><span>Telefone</span><code>{ped.telefone ?? "—"}</code></div>
        <div className="linha"><span>Canal</span><code>{ped.canal}</code></div>
        <div className="linha"><span>Referência do pagamento</span><code>{ped.pagamento_ref ?? "—"}</code></div>
      </div>

      <div className="cartao" style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: "0.95rem", textTransform: "uppercase", margin: "0 0 10px" }}>Itens</h2>
        {itens.rows.map((i: any, k: number) => (
          <div key={k}>
            <div className="linha">
              <span>{i.produto}</span>
              <code>{i.sku}</code>
            </div>
            <div className="linha">
              <span>
                {i.atributos?.gb ? `${i.atributos.gb} GB` : ""}
                {i.atributos?.dias ? ` · ${i.atributos.dias} dias` : ""} · qtd {i.quantidade}
              </span>
              <code>{dinheiro(i.preco)}</code>
            </div>
            <div className="linha">
              <span>Custo registrado</span>
              <code>{i.custo ? dinheiro(i.custo) : "não informado"}</code>
            </div>
          </div>
        ))}
      </div>

      <div className="cartao" style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: "0.95rem", textTransform: "uppercase", margin: "0 0 10px" }}>Ativação</h2>
        {ativacoes.rows.length === 0 ? (
          <p className="nota" style={{ margin: 0 }}>Nenhuma ativação gerada para este pedido.</p>
        ) : (
          ativacoes.rows.map((a: any) => (
            <div key={a.id}>
              <div className="linha"><span>Situação</span><code>{a.status}</code></div>
              <div className="linha"><span>ICCID</span><code>{a.iccid ?? "—"}</code></div>
              <div className="linha"><span>Operadora</span><code>{a.operadora ?? "—"}</code></div>
              <div className="linha"><span>Entregue em</span><code>{quando(a.entregue_em)}</code></div>
              <div className="linha"><span>Cliente abriu em</span><code>{quando(a.confirmado_em)}</code></div>
              {a.ultimo_erro ? (
                <div className="linha"><span>Último erro</span><code style={{ color: "var(--erro)" }}>{a.ultimo_erro}</code></div>
              ) : null}
            </div>
          ))
        )}
        <p className="nota">
          O código de instalação não é exibido aqui de propósito — ele entrega o produto, e
          quem precisa dele é o cliente, pelo link do pedido.
        </p>
      </div>

      <div className="cartao" style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: "0.95rem", textTransform: "uppercase", margin: "0 0 10px" }}>
          Linha do tempo dos efeitos
        </h2>
        {eventos.rows.length === 0 ? (
          <p className="nota" style={{ margin: 0 }}>Nenhum evento publicado.</p>
        ) : (
          eventos.rows.map((e: any, k: number) => (
            <div className="linha" key={k}>
              <span>{e.tipo}</span>
              <code style={{ color: e.publicado_em ? "var(--ok)" : "var(--alerta)" }}>
                {e.publicado_em ? `feito ${quando(e.publicado_em)}` : `na fila (${e.tentativas} tentativas)`}
              </code>
            </div>
          ))
        )}
      </div>

      <div className="cartao">
        <h2 style={{ fontSize: "0.95rem", textTransform: "uppercase", margin: "0 0 10px" }}>Notificações</h2>
        {notificacoes.rows.length === 0 ? (
          <p className="nota" style={{ margin: 0 }}>Nenhuma notificação registrada.</p>
        ) : (
          notificacoes.rows.map((n: any, k: number) => (
            <div className="linha" key={k}>
              <span>
                {n.modelo} · {n.canal} · {n.destino}
              </span>
              <code style={{ color: n.status === "enviada" ? "var(--ok)" : "var(--alerta)" }}>
                {n.status}
              </code>
            </div>
          ))
        )}
        <p className="nota">
          O envio real de e-mail ainda não está ligado — por isso as notificações ficam em
          <code style={{ marginLeft: 4 }}>pendente</code>.
        </p>
      </div>
    </>
  );
}
