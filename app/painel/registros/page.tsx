import { db } from "../../../lib/db";
import { usuarioDaSessao } from "../../../lib/painel/sessao";
import { quando } from "../../../lib/quando";

export const dynamic = "force-dynamic";

export const metadata = { title: "Registros — AmericaSim", robots: { index: false, follow: false } };

// Linha do tempo unificada para AUDITORIA (pedido de 02/09): tudo que o sistema
// fez, num lugar so — acoes do painel (log_auditoria), e-mails enviados e Zaps
// (notificacao), e-mails recebidos (email_lote), requisicoes de ICCID
// (requisicao_iccid) e chamadas a operadora (requisicao_operadora).
// SO LEITURA: esta tela nao muda nada, so mostra o que as tabelas ja guardam.

interface Linha {
  tipo: string;
  em: Date;
  quem: string;
  titulo: string;
  detalhe: string;
}

const TIPOS: { valor: string; rotulo: string }[] = [
  { valor: "", rotulo: "Tudo" },
  { valor: "acao", rotulo: "Ações no painel" },
  { valor: "email_out", rotulo: "E-mails enviados" },
  { valor: "email_in", rotulo: "E-mails recebidos" },
  { valor: "zap", rotulo: "Zaps" },
  { valor: "requisicao", rotulo: "Requisições de ICCID" },
  { valor: "operadora", rotulo: "Chamadas à operadora" },
];

const ROTULO_TIPO: Record<string, string> = {
  acao: "🖱️ ação",
  email_out: "📧 e-mail →",
  email_in: "📥 e-mail ←",
  zap: "💬 zap",
  requisicao: "📤 requisição",
  operadora: "📡 operadora",
};

const TETO = 300;

export default async function Registros({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; d?: string }>;
}) {
  const u = await usuarioDaSessao();
  const podeVer = u?.papel === "admin" || u?.papel === "operacao";
  const f = await searchParams;
  const tipo = (f.t ?? "").trim();
  const dias = [1, 7, 30, 90].includes(Number(f.d)) ? Number(f.d) : 7;

  if (!podeVer) {
    return (
      <div className="pn-cabeca">
        <h1>Registros</h1>
        <p>Seu papel não permite ver os registros.</p>
      </div>
    );
  }

  const quer = (t: string) => tipo === "" || tipo === t;
  const corte = `${dias} days`;

  const [acoes, notifs, recebidos, reqs, operadora] = await Promise.all([
    quer("acao")
      ? db.query(
          `select la.quando as em, coalesce(u.email, 'sistema') as quem, la.acao as titulo,
                  coalesce(la.entidade, '') as detalhe
             from log_auditoria la
             left join usuario u on u.id = la.usuario_id
            where la.quando >= now() - $1::interval
            order by la.quando desc limit ${TETO}`,
          [corte],
        )
      : Promise.resolve({ rows: [] as any[] }),
    quer("email_out") || quer("zap")
      ? db.query(
          `select coalesce(enviada_em, criado_em) as em, destino as quem, canal::text as canal,
                  referencia || ' · ' || modelo || ' (' || status::text || ')' as titulo,
                  coalesce(nullif(payload->>'texto', ''), coalesce(ultimo_erro, '')) as detalhe
             from notificacao
            where coalesce(enviada_em, criado_em) >= now() - $1::interval
            order by coalesce(enviada_em, criado_em) desc limit ${TETO}`,
          [corte],
        )
      : Promise.resolve({ rows: [] as any[] }),
    quer("email_in")
      ? db.query(
          `select coalesce(recebido_em, criado_em) as em, remetente as quem,
                  coalesce(arquivo_nome, 'CSV') || ' (' || status || ')' as titulo,
                  coalesce(assunto, '') || ' · ' || coalesce(iccids::text, '0') || ' ICCID(s)' as detalhe
             from email_lote
            where criado_em >= now() - $1::interval
            order by criado_em desc limit ${TETO}`,
          [corte],
        )
      : Promise.resolve({ rows: [] as any[] }),
    quer("requisicao")
      ? db.query(
          `select criado_em as em, para as quem,
                  'Requisição de ' || coalesce(quantidade::text, '?') || ' ICCID(s)' as titulo,
                  coalesce(corpo, '') as detalhe
             from requisicao_iccid
            where criado_em >= now() - $1::interval
            order by criado_em desc limit ${TETO}`,
          [corte],
        )
      : Promise.resolve({ rows: [] as any[] }),
    quer("operadora")
      ? db.query(
          `select ro.criado_em as em, coalesce(o.codigo, '?') as quem,
                  ro.operacao || coalesce(' (' || ro.resultado::text || ')', '') as titulo,
                  'HTTP ' || coalesce(ro.http_status::text, '—') || ' · ' || coalesce(ro.duracao_ms::text, '—') || ' ms' as detalhe
             from requisicao_operadora ro
             left join operadora o on o.id = ro.operadora_id
            where ro.criado_em >= now() - $1::interval
            order by ro.criado_em desc limit ${TETO}`,
          [corte],
        )
      : Promise.resolve({ rows: [] as any[] }),
  ]);

  const linhas: Linha[] = [];
  for (const r of acoes.rows) linhas.push({ tipo: "acao", em: r.em, quem: r.quem, titulo: r.titulo, detalhe: r.detalhe });
  for (const r of notifs.rows) {
    const t = r.canal === "whatsapp" ? "zap" : "email_out";
    if (quer(t)) linhas.push({ tipo: t, em: r.em, quem: r.quem, titulo: r.titulo, detalhe: r.detalhe });
  }
  for (const r of recebidos.rows) linhas.push({ tipo: "email_in", em: r.em, quem: r.quem, titulo: r.titulo, detalhe: r.detalhe });
  for (const r of reqs.rows) linhas.push({ tipo: "requisicao", em: r.em, quem: r.quem, titulo: r.titulo, detalhe: r.detalhe });
  for (const r of operadora.rows) linhas.push({ tipo: "operadora", em: r.em, quem: r.quem, titulo: r.titulo, detalhe: r.detalhe });

  linhas.sort((a, b) => new Date(b.em).getTime() - new Date(a.em).getTime());
  const mostrar = linhas.slice(0, TETO);

  return (
    <>
      <div className="pn-cabeca">
        <h1>Registros</h1>
        <p>
          Tudo que o sistema fez, num lugar só, para auditoria: ações no painel, e-mails enviados e
          recebidos, Zaps e chamadas à operadora. Só leitura — nada aqui altera nada.
        </p>
      </div>

      <div className="cartao" style={{ marginBottom: 18 }}>
        <form method="get" style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
          <label style={{ fontSize: "0.78rem", color: "var(--texto-fraco)" }}>
            Tipo
            <select name="t" defaultValue={tipo} style={{ display: "block", marginTop: 4 }}>
              {TIPOS.map((t) => (
                <option key={t.valor} value={t.valor}>{t.rotulo}</option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: "0.78rem", color: "var(--texto-fraco)" }}>
            Período
            <select name="d" defaultValue={String(dias)} style={{ display: "block", marginTop: 4 }}>
              <option value="1">Últimas 24 h</option>
              <option value="7">Últimos 7 dias</option>
              <option value="30">Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
            </select>
          </label>
          <button type="submit">Filtrar</button>
        </form>
        <p className="nota" style={{ marginBottom: 0 }}>
          {mostrar.length === TETO ? `Mostrando os ${TETO} mais recentes — afine o filtro para ver mais atrás.` : `${mostrar.length} registro(s) no período.`}
        </p>
      </div>

      <div className="cartao" style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.84rem" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--texto-fraco)" }}>
              <th style={{ padding: "6px 10px 6px 0", whiteSpace: "nowrap" }}>Quando</th>
              <th style={{ padding: "6px 10px 6px 0", whiteSpace: "nowrap" }}>Tipo</th>
              <th style={{ padding: "6px 10px 6px 0" }}>Quem / destino</th>
              <th style={{ padding: "6px 10px 6px 0" }}>O quê</th>
              <th style={{ padding: "6px 0" }}>Detalhe</th>
            </tr>
          </thead>
          <tbody>
            {mostrar.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: "12px 0", color: "var(--texto-fraco)" }}>Nenhum registro no período.</td></tr>
            ) : mostrar.map((l, i) => (
              <tr key={i} style={{ borderTop: "1px solid var(--borda)" }}>
                <td style={{ padding: "6px 10px 6px 0", whiteSpace: "nowrap", color: "var(--texto-fraco)" }}>{quando(l.em)}</td>
                <td style={{ padding: "6px 10px 6px 0", whiteSpace: "nowrap" }}>{ROTULO_TIPO[l.tipo] ?? l.tipo}</td>
                <td style={{ padding: "6px 10px 6px 0", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{l.quem}</td>
                <td style={{ padding: "6px 10px 6px 0" }}>{l.titulo}</td>
                <td style={{ padding: "6px 0", color: "var(--texto-fraco)", maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis" }}>{String(l.detalhe ?? "").slice(0, 200)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
