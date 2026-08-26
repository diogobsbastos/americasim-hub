import { db } from "../../../lib/db";
import { CMLINK, configCmlink, ondeEstaoAsChaves } from "../../../lib/cmlink";
import { usuarioDaSessao } from "../../../lib/painel/sessao";
import { quando } from "../../../lib/quando";
import CartaoCmlink from "./CartaoCmlink";
import PlanosEPool, { type VarianteTela } from "./PlanosEPool";

export const dynamic = "force-dynamic";

export const metadata = { title: "Operadoras — AmericaSim", robots: { index: false, follow: false } };

// Operadoras = quem PROVISIONA o eSIM sob demanda (modo de entrega
// `operadora_fixo`). Diferente de Fornecedores (quem vende lote para o estoque)
// e de Conexoes (onde a gente vende).
export default async function Operadoras() {
  const u = await usuarioDaSessao();
  const podeAdmin = u?.papel === "admin";
  const podeOperar = u?.papel === "admin" || u?.papel === "operacao";

  const cfg = await configCmlink();
  const onde = await ondeEstaoAsChaves();

  // As ultimas chamadas, com o que eles responderam. Nao mostra o corpo da
  // requisicao inteiro — o accessToken ja vai mascarado, mas a tela nao precisa
  // repetir o que a acao acabou de mostrar. O JSON completo fica no banco.
  const ultimas = cfg.operadoraId
    ? await db.query(
        `select r.operacao, r.resultado::text as resultado, r.http_status, r.duracao_ms, r.criado_em,
                r.tentativa, r.chave_idem,
                coalesce(r.resposta->>'code', '') as code,
                coalesce(r.resposta->>'description', r.resposta->>'msg', r.resposta->>'erro_rede', '') as descricao,
                p.numero as pedido
           from requisicao_operadora r
           left join pedido p on p.id = r.pedido_id
          where r.operadora_id = $1
          order by r.criado_em desc
          limit 25`,
        [cfg.operadoraId],
      )
    : { rows: [] as any[] };

  const totais = cfg.operadoraId
    ? await db.query(
        `select
           (select count(*) from estoque_esim where operadora = $2 and octet_length(codigo_lpa) = 0 and status = 'disponivel')::int as pool,
           (select count(*) from operadora_plano where operadora_id = $1 and ativo)::int as planos,
           (select count(*) from requisicao_operadora where operadora_id = $1 and resultado = 'erro'
               and criado_em > now() - interval '24 hours')::int as erros_24h`,
        [cfg.operadoraId, CMLINK.codigo],
      )
    : { rows: [{ pool: 0, planos: 0, erros_24h: 0 }] };
  const t = totais.rows[0] ?? { pool: 0, planos: 0, erros_24h: 0 };

  // Os SKUs sob demanda, com o plano vinculado e o tamanho do pool de cada um.
  // Pool = linha de estoque desta operadora SEM codigo (o QR chega na venda).
  const vars = await db.query(
    `select v.id, v.sku, p.nome as produto,
            op.plano_externo, op.custo::text as plano_custo, op.custo_moeda as plano_moeda,
            (select count(*) from estoque_esim e
              where e.variante_id = v.id and e.operadora = $1 and octet_length(e.codigo_lpa) = 0
                and (e.status = 'disponivel' or (e.status = 'reservado' and e.reservado_ate is not null and e.reservado_ate < now())))::int as pool,
            (select count(*) from estoque_esim e
              where e.variante_id = v.id and e.operadora = $1 and octet_length(e.codigo_lpa) = 0
                and e.status = 'reservado' and (e.reservado_ate is null or e.reservado_ate >= now()))::int as reservados
       from variante v
       join produto p on p.id = v.produto_id
       left join operadora o on o.codigo = $1
       left join operadora_plano op on op.operadora_id = o.id and op.variante_id = v.id and op.ativo
      where v.modo_entrega = 'operadora_fixo'::modo_entrega and v.ativo
      order by v.sku`,
    [CMLINK.codigo],
  );
  const variantes: VarianteTela[] = vars.rows.map((r: any) => ({
    id: r.id, sku: r.sku, produto: r.produto,
    planoExterno: r.plano_externo ?? null, planoCusto: r.plano_custo ?? null, planoMoeda: r.plano_moeda ? String(r.plano_moeda).trim() : null,
    pool: Number(r.pool ?? 0), reservados: Number(r.reservados ?? 0),
  }));

  return (
    <>
      <div className="pn-cabeca">
        <h1>Operadoras</h1>
        <p>
          Quem gera o eSIM na hora da venda. Aqui ficam as chaves, a configuração, os testes e o
          registro de cada chamada — operação é botão, não SSH.
        </p>
      </div>

      <div className="cartoes" style={{ marginBottom: 20, display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <div className="cartao">
          <div className="rot">ICCIDs no pool</div>
          <div className="val">{t.pool}</div>
          <div className="pe">chips da operadora vendáveis, ainda sem pacote/QR</div>
        </div>
        <div className="cartao">
          <div className="rot">Planos vinculados</div>
          <div className="val">{t.planos}</div>
          <div className="pe">produtos com plano da operadora (operadora_plano)</div>
        </div>
        <div className={t.erros_24h > 0 ? "cartao perigo" : "cartao"}>
          <div className="rot">Erros nas últimas 24 h</div>
          <div className="val">{t.erros_24h}</div>
          <div className="pe">chamadas que a operadora recusou</div>
        </div>
      </div>

      <CartaoCmlink
        host={cfg.host}
        hostDe={cfg.hostDe}
        ambiente={cfg.ambiente}
        ativa={cfg.ativa}
        digest={cfg.digest}
        cooperationMode={cfg.cooperationMode}
        mccPadrao={cfg.mccPadrao}
        sendLang={cfg.sendLang}
        ondeAppkey={onde.appkey}
        ondeAppsecret={onde.appsecret}
        catalogo={cfg.catalogo.map((p) => ({
          id: p.id, nome: p.nome, status: p.status, activationMode: p.activationMode,
          period: p.period, periodType: p.periodType, precos: p.precos, mccs: p.mccs,
        }))}
        catalogoEm={cfg.catalogoEm ? quando(cfg.catalogoEm) : null}
        iccidsTeste={cfg.ambiente === "sandbox" ? [...CMLINK.iccidsTeste] : []}
        podeAdmin={!!podeAdmin}
        podeOperar={!!podeOperar}
      />

      <PlanosEPool
        variantes={variantes}
        catalogo={cfg.catalogo.map((p) => ({
          id: p.id, nome: p.nome, status: p.status, activationMode: p.activationMode,
          period: p.period, periodType: p.periodType, precos: p.precos, mccs: p.mccs,
        }))}
        podeAdmin={!!podeAdmin}
      />

      <div className="cartao" style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: "0.95rem", textTransform: "uppercase", margin: "0 0 10px" }}>
          Últimas chamadas à operadora
        </h2>
        {ultimas.rows.length === 0 ? (
          <p className="nota" style={{ margin: 0 }}>Nenhuma chamada ainda.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--texto-fraco)" }}>
                  <th style={{ padding: "4px 6px" }}>quando</th>
                  <th style={{ padding: "4px 6px" }}>operação</th>
                  <th style={{ padding: "4px 6px" }}>resultado</th>
                  <th style={{ padding: "4px 6px" }}>HTTP</th>
                  <th style={{ padding: "4px 6px" }}>code</th>
                  <th style={{ padding: "4px 6px" }}>descrição</th>
                  <th style={{ padding: "4px 6px" }}>ms</th>
                  <th style={{ padding: "4px 6px" }}>pedido</th>
                </tr>
              </thead>
              <tbody>
                {ultimas.rows.map((r: any, i: number) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--borda)" }}>
                    <td style={{ padding: "4px 6px", whiteSpace: "nowrap" }}>{quando(r.criado_em)}</td>
                    <td style={{ padding: "4px 6px" }}><code>{r.operacao}</code>{r.tentativa > 1 ? ` (${r.tentativa}ª)` : ""}</td>
                    <td style={{ padding: "4px 6px", color: r.resultado === "sucesso" ? "var(--ok)" : "var(--erro)", fontWeight: 700 }}>{r.resultado}</td>
                    <td style={{ padding: "4px 6px" }}>{r.http_status ?? "—"}</td>
                    <td style={{ padding: "4px 6px" }}><code>{r.code || "—"}</code></td>
                    <td style={{ padding: "4px 6px", maxWidth: 380, wordBreak: "break-word" }}>{r.descricao}</td>
                    <td style={{ padding: "4px 6px" }}>{r.duracao_ms ?? "—"}</td>
                    <td style={{ padding: "4px 6px" }}>{r.pedido ? <a href={`/painel/vendas/${encodeURIComponent(r.pedido)}`}>{r.pedido}</a> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="nota">
          O corpo completo de cada requisição e resposta fica em <code>requisicao_operadora</code>
          (accessToken mascarado, sem cabeçalhos). É de lá que se depura.
        </p>
      </div>
    </>
  );
}
