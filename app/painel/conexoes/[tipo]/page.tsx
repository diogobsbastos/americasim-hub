import type { CSSProperties } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { conectorPorTipo, estadoDoConector } from "../../../../lib/conectores";
import { db } from "../../../../lib/db";
import { quando } from "../../../../lib/quando";
import { listarUsuariosTeste } from "../../../../lib/usuario-teste";
import { usuarioDaSessao } from "../../../../lib/painel/sessao";
import Cartao from "../Cartao";
import UsuariosTeste from "../UsuariosTeste";

export const dynamic = "force-dynamic";

// A pagina do conector. O cartao da lista diz "em que pe esta"; aqui fica tudo
// o que se precisa para CONFIGURAR e CONFERIR — inclusive a lista do que tem
// que estar marcado no painel do marketplace.
//
// Essa lista mora no codigo (lib/conectores.ts) e nao numa conversa: quem for
// conferir isso daqui a seis meses nao vai ter o chat, vai ter esta tela.

export async function generateMetadata({ params }: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await params;
  const c = conectorPorTipo(tipo);
  return { title: `${c?.nome ?? "Conexão"} — AmericaSim`, robots: { index: false, follow: false } };
}

const RECADO: Record<string, string> = {
  papel: "Só um admin pode mexer nas conexões.",
  conector: "Conector desconhecido ou ainda não disponível.",
  sem_aplicacao: "Falta guardar o Client ID antes de autorizar.",
  sem_segredo: "Falta a senha da aplicação.",
  recusado: "A autorização foi recusada no marketplace. Nada foi alterado.",
  estado: "O vaivém da autorização não bateu (pode ter demorado demais, ou o link foi aberto fora daqui). Comece de novo.",
  troca: "O marketplace recusou a troca do código pelo token. O motivo está nos erros de sincronia, abaixo.",
  rede: "Não consegui falar com o marketplace. Tente de novo.",
};

function Marca({ ligar }: { ligar: boolean }) {
  return (
    <span style={{ color: ligar ? "var(--ok)" : "var(--texto-fraco)", fontWeight: 700 }}>
      {ligar ? "marcar" : "deixar desmarcado"}
    </span>
  );
}

const th: CSSProperties = { padding: "9px 13px", fontWeight: 600, textAlign: "left" };
const td: CSSProperties = { padding: "9px 13px", verticalAlign: "top" };

export default async function ConectorDetalhe({
  params,
  searchParams,
}: {
  params: Promise<{ tipo: string }>;
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const { tipo } = await params;
  const sp = await searchParams;
  const c = conectorPorTipo(tipo);
  if (!c) notFound();

  const u = await usuarioDaSessao();
  const podeMexer = u?.papel === "admin";

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "127.0.0.1:3002";
  const base = `${proto}://${host}`;

  const e = await estadoDoConector(c);

  // A conta do marketplace fica em canal.config — nunca o token, so quem e.
  let conta: any = null;
  if (e.canalId) {
    const q = await db.query("select config from canal where id = $1", [e.canalId]);
    conta = q.rows[0]?.config ?? null;
  }
  // `config` nasce `{}` quando o Client ID e guardado, antes de existir conta
  // nenhuma. Sem esta conferencia o cartao "Conta conectada" aparecia vazio.
  const temConta = !!conta?.usuario_marketplace || !!conta?.apelido;

  const ligado = ["conectado", "vencendo"].includes(e.situacao);
  const usuariosTeste =
    c.tipo === "mercadolivre" && e.canalId && ligado ? await listarUsuariosTeste(e.canalId) : [];

  const cfg = c.configuracao;

  return (
    <>
      <div className="pn-cabeca">
        <p style={{ margin: "0 0 4px", fontSize: "0.85rem" }}>
          <Link href="/painel/conexoes">← Conexões</Link>
        </p>
        <h1>{c.nome}</h1>
        <p>{c.resumo}</p>
      </div>

      {sp.erro ? (
        <div className="cartao perigo" style={{ marginBottom: 18 }}>
          <p style={{ margin: 0, color: "var(--erro)" }}>
            {RECADO[sp.erro] ?? "Não deu para completar a conexão."}
          </p>
        </div>
      ) : null}
      {sp.ok === "conectado" ? (
        <div className="cartao" style={{ marginBottom: 18, borderLeft: "4px solid var(--ok)" }}>
          <p style={{ margin: 0, color: "var(--ok)" }}>Conectado.</p>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(320px, 420px) 1fr", alignItems: "start" }}>
        {/* ------------------------------------------------ coluna 1: estado */}
        <div style={{ display: "grid", gap: 16 }}>
          <Cartao
            detalhado
            tipo={c.tipo}
            nome={c.nome}
            resumo={c.resumo}
            situacao={e.situacao}
            rotulo={e.rotulo}
            detalhe={e.detalhe}
            clientId={e.clientId}
            temSegredo={e.temSegredo}
            ondeSegredo={e.ondeSegredo}
            envSecret={c.envSecret}
            urlDev={c.urlDev}
            urlRetorno={`${base}/painel/conexoes/${c.tipo}/retorno`}
            escopos={c.escopos}
            podeMexer={!!podeMexer}
            itens={e.itens}
            ultimoSync={e.ultimoSync ? new Date(e.ultimoSync).toISOString() : null}
            expiraEm={e.cred.expiraEm ? new Date(e.cred.expiraEm).toISOString() : null}
            ultimosErros={e.ultimosErros.map((x) => ({
              quando: new Date(x.quando).toISOString(),
              acao: x.acao,
              detalhe: x.detalhe,
            }))}
          />

          {c.urlPainel ? (
            <div className="cartao">
              <h2 style={{ margin: "0 0 6px", fontSize: "1rem" }}>Painel do {c.nome}</h2>
              <p style={{ margin: "0 0 12px", color: "var(--texto-fraco)", fontSize: "0.85rem" }}>
                Para criar ou editar a aplicação, mudar permissões e ligar os avisos.
              </p>
              <a className="botao" href={c.urlPainel} target="_blank" rel="noreferrer" style={{ fontSize: "0.9rem" }}>
                Abrir o DevCenter ↗
              </a>
            </div>
          ) : null}

          {temConta ? (
            <div className="cartao">
              <h2 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Conta conectada</h2>
              <div style={{ fontSize: "0.86rem", color: "var(--texto-fraco)" }}>
                {conta.usuario_marketplace ? (
                  <div>
                    Usuário no {c.nome}: <code>{String(conta.usuario_marketplace)}</code>
                  </div>
                ) : null}
                {conta.apelido ? <div>Apelido: <b style={{ color: "var(--texto)" }}>{String(conta.apelido)}</b></div> : null}
                {conta.site ? <div>Site: <code>{String(conta.site)}</code></div> : null}
                {conta.teste ? (
                  <div style={{ color: "var(--alerta)" }}>É uma conta de TESTE do marketplace.</div>
                ) : null}
                {e.cred.escopos.length > 0 ? (
                  <div style={{ marginTop: 6 }}>
                    Permissões concedidas: <code>{e.cred.escopos.join(" ")}</code>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {c.tipo === "mercadolivre" && ligado ? (
            <UsuariosTeste tipo={c.tipo} usuarios={usuariosTeste} podeMexer={!!podeMexer} />
          ) : null}
        </div>

        {/* --------------------------------------- coluna 2: o que configurar */}
        <div style={{ display: "grid", gap: 16 }}>
          <div className="cartao">
            <h2 style={{ margin: "0 0 6px", fontSize: "1rem" }}>Endereços que o {c.nome} precisa saber</h2>
            <p style={{ margin: "0 0 10px", color: "var(--texto-fraco)", fontSize: "0.84rem" }}>
              Copie daqui. É o campo que mais dá erro, porque tem que bater caractere por caractere.
            </p>

            <p style={{ margin: "0 0 4px", fontSize: "0.82rem", fontWeight: 600 }}>URI de redirect</p>
            <code style={{ display: "block", wordBreak: "break-all", padding: "8px 10px", fontSize: "0.76rem", marginBottom: 12 }}>
              {base}/painel/conexoes/{c.tipo}/retorno
            </code>

            <p style={{ margin: "0 0 4px", fontSize: "0.82rem", fontWeight: 600 }}>
              URL de avisos (webhook) — <span style={{ color: "var(--alerta)" }}>ainda não construída</span>
            </p>
            <code style={{ display: "block", wordBreak: "break-all", padding: "8px 10px", fontSize: "0.76rem" }}>
              {base}/v1/webhooks/{c.tipo}
            </code>
            <p style={{ margin: "8px 0 0", color: "var(--texto-fraco)", fontSize: "0.8rem" }}>
              Só registre esta segunda quando os tópicos forem ligados — hoje ela responderia erro.
            </p>
          </div>

          {cfg ? (
            <>
              <div className="cartao" style={{ padding: 0, overflowX: "auto" }}>
                <div style={{ padding: "16px 16px 6px" }}>
                  <h2 style={{ margin: "0 0 4px", fontSize: "1rem" }}>Permissões da aplicação</h2>
                  <p style={{ margin: 0, color: "var(--texto-fraco)", fontSize: "0.84rem" }}>
                    Mudar isto depois <b>obriga a reautorizar</b>. Por isso vale conferir agora.
                  </p>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ color: "var(--texto-fraco)", fontSize: "0.7rem" }}>
                      <th style={th}>PERMISSÃO</th>
                      <th style={th}>NÍVEL</th>
                      <th style={th}>POR QUÊ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cfg.permissoes.map((p) => (
                      <tr key={p.nome} style={{ borderTop: "1px solid var(--borda)" }}>
                        <td style={td}>
                          {p.essencial ? <span style={{ color: "var(--marca)" }}>★ </span> : null}
                          {p.nome}
                        </td>
                        <td style={{ ...td, whiteSpace: "nowrap", color: p.nivel === "Sem acesso" ? "var(--texto-fraco)" : "var(--ok)" }}>
                          {p.nivel}
                        </td>
                        <td style={{ ...td, color: "var(--texto-fraco)" }}>{p.porque}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p style={{ padding: "10px 16px 16px", margin: 0, color: "var(--texto-fraco)", fontSize: "0.8rem" }}>
                  ★ = sem isso não existe integração.
                </p>
              </div>

              <div className="cartao">
                <h2 style={{ margin: "0 0 10px", fontSize: "1rem" }}>Fluxos e segurança</h2>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.86rem", display: "grid", gap: 8 }}>
                  {cfg.fluxos.map((f) => (
                    <li key={f.nome}>
                      <b>{f.nome}</b>: <Marca ligar={f.ligar} />
                      <div style={{ color: "var(--texto-fraco)", fontSize: "0.82rem" }}>{f.porque}</div>
                    </li>
                  ))}
                  <li>
                    <b>PKCE</b>: <Marca ligar={cfg.pkce.ligar} />
                    <div style={{ color: "var(--texto-fraco)", fontSize: "0.82rem" }}>{cfg.pkce.porque}</div>
                  </li>
                  <li>
                    <b>Negócios</b>:{" "}
                    {cfg.negocios.map((n, i) => (
                      <span key={n.nome}>
                        {i > 0 ? " · " : ""}
                        {n.nome} — <Marca ligar={n.ligar} />
                      </span>
                    ))}
                  </li>
                </ul>
              </div>

              <div className="cartao" style={{ padding: 0, overflowX: "auto" }}>
                <div style={{ padding: "16px 16px 6px" }}>
                  <h2 style={{ margin: "0 0 4px", fontSize: "1rem" }}>Avisos (tópicos)</h2>
                  <p style={{ margin: 0, color: "var(--texto-fraco)", fontSize: "0.84rem" }}>
                    São os avisos que o {c.nome} dispara para o hub. Mudar isto depois{" "}
                    <b>não</b> pede reautorização — por isso podem esperar o receptor existir.
                  </p>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ color: "var(--texto-fraco)", fontSize: "0.7rem" }}>
                      <th style={th}>TÓPICO</th>
                      <th style={th}>QUANDO LIGAR</th>
                      <th style={th}>SERVE PARA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cfg.topicos.map((t) => (
                      <tr key={t.nome} style={{ borderTop: "1px solid var(--borda)" }}>
                        <td style={td}>
                          <code style={{ fontSize: "0.76rem" }}>{t.nome}</code>
                        </td>
                        <td style={{ ...td, whiteSpace: "nowrap", color: t.quando === "nunca" ? "var(--texto-fraco)" : "var(--alerta)" }}>
                          {t.quando}
                        </td>
                        <td style={{ ...td, color: "var(--texto-fraco)" }}>{t.porque}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {e.ultimosErros.length > 0 ? (
            <div className="cartao perigo">
              <h2 style={{ margin: "0 0 8px", fontSize: "1rem", color: "var(--erro)" }}>
                Erros de sincronia
              </h2>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.82rem", color: "var(--texto-fraco)" }}>
                {e.ultimosErros.map((x, i) => (
                  <li key={i}>
                    <b>{quando(x.quando)}</b> · {x.acao} — {x.detalhe}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
