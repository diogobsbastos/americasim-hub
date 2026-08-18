"use client";

import { useActionState } from "react";
import { desconectar, salvarClientId } from "./acoes";
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
  tipo,
  nome,
  resumo,
  situacao,
  rotulo,
  detalhe,
  clientId,
  temSegredo,
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
  tipo: string;
  nome: string;
  resumo: string;
  situacao: string;
  rotulo: string;
  detalhe: string;
  clientId: string | null;
  temSegredo: boolean;
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
            <p style={{ color: "var(--texto-fraco)", fontSize: "0.84rem", margin: "8px 0" }}>
              A senha <b>não passa por aqui e não vai para o banco</b>. Ela entra no ambiente do
              servidor, pelo SSH:
            </p>
            <code style={{ display: "block", whiteSpace: "pre-wrap", wordBreak: "break-all", padding: "8px 10px", fontSize: "0.76rem" }}>
              {`echo '${envSecret}=cole-a-senha-aqui' >> ~/.americasim-hub.env\nsudo systemctl restart americasim-hub`}
            </code>
            <p style={{ color: "var(--texto-fraco)", fontSize: "0.8rem", margin: "8px 0 0" }}>
              Depois rode <code>clear</code> para tirar da tela. Esta página só sabe se a variável
              existe — nunca o valor.
            </p>
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
