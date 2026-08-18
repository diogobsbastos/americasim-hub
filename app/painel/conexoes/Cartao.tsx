"use client";

import { useActionState } from "react";
import { apagarSegredo, desconectar, salvarClientId, salvarSegredo } from "./acoes";
import { ESTADO_CONEXAO_INICIAL } from "./tipos";

const COR: Record<string, string> = {
  indisponivel: "var(--texto-fraco)",
  sem_aplicacao: "var(--alerta)",
  sem_segredo: "var(--alerta)",
  pronto: "var(--marca)",
  conectado: "var(--ok)",
  vencendo: "var(--alerta)",
  vencida: "var(--erro)",
  ilegivel: "var(--erro)",
};

function Recado({ e }: { e: { erro: string; ok: string } }) {
  if (!e?.erro && !e?.ok) return null;
  return (
    <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: e?.erro ? "var(--erro)" : "var(--ok)" }}>
      {e?.erro || e?.ok}
    </p>
  );
}

export default function Cartao({
  detalhado = false,
  tipo,
  nome,
  resumo,
  situacao,
  rotulo,
  detalhe,
  clientId,
  temSegredo,
  ondeSegredo,
  envSecret,
  urlDev,
  urlRetorno,
  escopos,
  podeMexer,
  itens,
  ultimoSync,
  ultimosErros,
  expiraEm,
}: {
  // Na pagina do proprio conector nao faz sentido um link para ela mesma.
  detalhado?: boolean;
  tipo: string;
  nome: string;
  resumo: string;
  situacao: string;
  rotulo: string;
  detalhe: string;
  clientId: string | null;
  temSegredo: boolean;
  ondeSegredo?: string;
  envSecret: string;
  urlDev: string;
  urlRetorno: string;
  escopos: string[];
  podeMexer: boolean;
  itens: { total: number; publicados: number; comErro: number };
  ultimoSync: string | null;
  ultimosErros: { quando: string; acao: string; detalhe: string }[];
  expiraEm: string | null;
}) {
  const [eId, aId, pId] = useActionState(salvarClientId, ESTADO_CONEXAO_INICIAL);
  const [eSeg, aSeg, pSeg] = useActionState(salvarSegredo, ESTADO_CONEXAO_INICIAL);
  const [eApg, aApg, pApg] = useActionState(apagarSegredo, ESTADO_CONEXAO_INICIAL);
  const [eDes, aDes, pDes] = useActionState(desconectar, ESTADO_CONEXAO_INICIAL);

  const ligado = ["conectado", "vencendo"].includes(situacao);
  const temCredencial = ["conectado", "vencendo", "vencida", "ilegivel"].includes(situacao);

  return (
    <div className="cartao" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: "1.15rem" }}>{nome}</h2>
        <span
          style={{
            fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.08em",
            fontWeight: 800, color: COR[situacao] ?? "var(--texto-fraco)",
            border: `1px solid ${COR[situacao] ?? "var(--borda)"}`,
            borderRadius: 999, padding: "2px 9px",
          }}
        >
          {rotulo}
        </span>
      </div>

      <p style={{ margin: 0, color: "var(--texto-fraco)", fontSize: "0.88rem" }}>{resumo}</p>
      <p style={{ margin: 0, fontSize: "0.88rem" }}>{detalhe}</p>

      {!detalhado ? (
        <p style={{ margin: 0, fontSize: "0.88rem" }}>
          <a href={`/painel/conexoes/${tipo}`}>Abrir configuração de {nome} →</a>
        </p>
      ) : null}

      {situacao === "indisponivel" ? null : (
        <>
          {/* ---------------------------------------------- passo 1: aplicação */}
          <details open={!clientId} style={{ borderTop: "1px solid var(--borda)", paddingTop: 10 }}>
            <summary style={{ cursor: "pointer", fontSize: "0.9rem", fontWeight: 600 }}>
              1. Aplicação {clientId ? "✓" : "— falta"}
            </summary>
            <p style={{ color: "var(--texto-fraco)", fontSize: "0.84rem", margin: "8px 0" }}>
              Crie a aplicação em <a href={urlDev} target="_blank" rel="noreferrer">{urlDev}</a> e
              registre esta URL de retorno, exatamente assim:
            </p>
            <code style={{ display: "block", wordBreak: "break-all", padding: "8px 10px", fontSize: "0.76rem" }}>
              {urlRetorno}
            </code>
            {escopos.length > 0 ? (
              <p style={{ color: "var(--texto-fraco)", fontSize: "0.82rem", margin: "8px 0 0" }}>
                Permissões que o hub vai pedir: <code>{escopos.join(" ")}</code>.{" "}
                <b>offline_access</b> é o que permite renovar sozinho — sem ele a conexão morre em
                6 horas e alguém precisa reconectar todo dia.
              </p>
            ) : null}

            {podeMexer ? (
              <form action={aId} style={{ marginTop: 10 }}>
                <input type="hidden" name="tipo" value={tipo} />
                <label className="rotulo">Client ID (é público — pode colar aqui)</label>
                <input
                  type="text"
                  name="client_id"
                  defaultValue={clientId ?? ""}
                  placeholder="1234567890123456"
                  disabled={pId}
                />
                <button type="submit" disabled={pId} style={{ marginTop: 8 }}>
                  {pId ? "Guardando…" : clientId ? "Trocar Client ID" : "Guardar Client ID"}
                </button>
                <Recado e={eId} />
              </form>
            ) : null}
          </details>

          {/* ---------------------------------------------- passo 2: segredo */}
          <details open={!!clientId && !temSegredo} style={{ borderTop: "1px solid var(--borda)", paddingTop: 10 }}>
            <summary style={{ cursor: "pointer", fontSize: "0.9rem", fontWeight: 600 }}>
              2. Senha da aplicação {temSegredo ? "✓" : "— falta"}
            </summary>

            {ondeSegredo === "ilegivel" ? (
              <p style={{ color: "var(--erro)", fontSize: "0.84rem", margin: "8px 0" }}>
                Existe uma senha guardada, mas ela não abre com a chave atual do servidor. Cole
                de novo.
              </p>
            ) : null}

            {ondeSegredo === "ambiente" ? (
              <p style={{ color: "var(--texto-fraco)", fontSize: "0.84rem", margin: "8px 0" }}>
                A senha está no arquivo de ambiente do servidor (<code>{envSecret}</code>), e é
                ela que vale. Para trocar por aqui, remova de lá primeiro.
              </p>
            ) : (
              <>
                <p style={{ color: "var(--texto-fraco)", fontSize: "0.84rem", margin: "8px 0" }}>
                  Copie a <b>Client Secret</b> do painel do marketplace e cole aqui. Ela é
                  guardada <b>cifrada</b> — um backup do banco, sozinho, não abre nada. E não
                  volta para esta tela depois de salva.
                </p>
                {podeMexer ? (
                  <form action={aSeg}>
                    <input type="hidden" name="tipo" value={tipo} />
                    <label className="rotulo">
                      Client Secret {temSegredo ? "(já guardada — cole de novo só para trocar)" : ""}
                    </label>
                    <input
                      type="password"
                      name="segredo"
                      autoComplete="off"
                      placeholder={temSegredo ? "••••••••••••" : "cole aqui"}
                      disabled={pSeg}
                    />
                    <button type="submit" disabled={pSeg} style={{ marginTop: 8 }}>
                      {pSeg ? "Guardando…" : temSegredo ? "Trocar senha" : "Guardar senha"}
                    </button>
                    <Recado e={eSeg} />
                  </form>
                ) : null}
                {podeMexer && ondeSegredo === "banco" ? (
                  <form action={aApg} style={{ marginTop: 8 }}>
                    <input type="hidden" name="tipo" value={tipo} />
                    <button type="submit" disabled={pApg} className="botao secundario" style={{ fontSize: "0.82rem" }}>
                      {pApg ? "Apagando…" : "Apagar senha guardada"}
                    </button>
                    <Recado e={eApg} />
                  </form>
                ) : null}
              </>
            )}
          </details>

          {/* ---------------------------------------------- passo 3: autorizar */}
          <div style={{ borderTop: "1px solid var(--borda)", paddingTop: 10 }}>
            <p style={{ fontSize: "0.9rem", fontWeight: 600, margin: "0 0 8px" }}>
              3. Autorizar {ligado ? "✓" : "— falta"}
            </p>

            {ligado ? (
              <div style={{ fontSize: "0.85rem", color: "var(--texto-fraco)" }}>
                <div>
                  Anúncios: <b style={{ color: "var(--texto)" }}>{itens.publicados}</b> publicados de{" "}
                  {itens.total}
                  {itens.comErro > 0 ? (
                    <span style={{ color: "var(--erro)" }}> · {itens.comErro} com erro</span>
                  ) : null}
                </div>
                <div>
                  Última sincronia:{" "}
                  {ultimoSync ? new Date(ultimoSync).toLocaleString("pt-BR") : "ainda não houve"}
                </div>
                {expiraEm ? (
                  <div>Autorização vale até {new Date(expiraEm).toLocaleString("pt-BR")}</div>
                ) : null}
              </div>
            ) : null}

            {podeMexer && ["pronto", "vencida", "ilegivel", "conectado", "vencendo"].includes(situacao) ? (
              <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
                <a
                  className="botao"
                  href={`/painel/conexoes/${tipo}/conectar`}
                  style={{ fontSize: "0.9rem" }}
                >
                  {temCredencial ? "Reconectar" : "Conectar"}
                </a>
                {temCredencial ? (
                  <form action={aDes}>
                    <input type="hidden" name="tipo" value={tipo} />
                    <button
                      type="submit"
                      disabled={pDes}
                      className="botao secundario"
                      style={{ fontSize: "0.9rem" }}
                    >
                      {pDes ? "Desconectando…" : "Desconectar"}
                    </button>
                  </form>
                ) : null}
              </div>
            ) : null}
            <Recado e={eDes} />
          </div>

          {ultimosErros.length > 0 ? (
            <details style={{ borderTop: "1px solid var(--borda)", paddingTop: 10 }}>
              <summary style={{ cursor: "pointer", fontSize: "0.88rem", color: "var(--erro)" }}>
                {ultimosErros.length} erro(s) recente(s) de sincronia
              </summary>
              <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: "0.8rem", color: "var(--texto-fraco)" }}>
                {ultimosErros.map((e, i) => (
                  <li key={i}>
                    <b>{new Date(e.quando).toLocaleString("pt-BR")}</b> · {e.acao} — {e.detalhe}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}
