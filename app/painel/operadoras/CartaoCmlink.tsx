"use client";

import { useActionState, useState, type CSSProperties } from "react";
import {
  apagarChavesAcao, ativarPacoteAcao, comprarPacoteAcao, consultarIccidAcao,
  salvarChaveAcao, salvarConfigAcao, salvarSegredoAcao, sincronizarCatalogoAcao, testarConexaoAcao,
} from "./acoes";
import { ESTADO_CHAMADAS_INICIAL, ESTADO_SIMPLES_INICIAL, type EstadoChamadas } from "./tipos";

export interface PacoteTela {
  id: string; nome: string; status: number | string; activationMode: string;
  period: number | string; periodType: number | string; precos: { moeda: string; valor: string }[]; mccs: string[];
}

function Recado({ e }: { e: { erro: string; ok: string } }) {
  if (!e?.erro && !e?.ok) return null;
  return (
    <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: e?.erro ? "var(--erro)" : "var(--ok)", whiteSpace: "pre-wrap" }}>
      {e?.erro || e?.ok}
    </p>
  );
}

// A resposta completa da operadora, chamada por chamada. Fechada por padrao:
// o resumo de uma linha ja diz se deu certo; o JSON e para quando nao deu.
function Respostas({ e }: { e: EstadoChamadas }) {
  if (!e?.chamadas?.length && !e?.lpa) return null;
  return (
    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
      {e.lpa ? (
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap", border: "1px solid var(--borda)", borderRadius: 10, padding: 10 }}>
          {e.qrPng ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="QR do eSIM" src={`data:image/png;base64,${e.qrPng}`} width={160} height={160} style={{ background: "#fff", borderRadius: 8, padding: 6 }} />
          ) : null}
          <div style={{ fontSize: "0.8rem", minWidth: 0 }}>
            <div style={{ color: "var(--texto-fraco)", marginBottom: 4 }}>
              LPA (só aparece aqui, na área de homologação — na venda ele vai para o cliente pelo link do pedido)
            </div>
            <code style={{ wordBreak: "break-all" }}>{e.lpa}</code>
          </div>
        </div>
      ) : null}
      {e.chamadas.map((c, i) => (
        <details key={i} style={{ border: "1px solid var(--borda)", borderRadius: 10, padding: "6px 10px" }}>
          <summary style={{ cursor: "pointer", fontSize: "0.84rem" }}>
            <span style={{ color: c.ok ? "var(--ok)" : "var(--erro)", fontWeight: 700 }}>{c.ok ? "OK" : "ERRO"}</span>
            {" · "}{c.titulo}{" — "}<span style={{ color: "var(--texto-fraco)" }}>{c.resumo}</span>
          </summary>
          <pre style={{ margin: "8px 0 0", fontSize: "0.74rem", whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 420, overflow: "auto" }}>
            {c.corpo || "(sem corpo)"}
          </pre>
        </details>
      ))}
    </div>
  );
}

export default function CartaoCmlink({
  host, hostDe, ambiente, ativa, digest, cooperationMode, mccPadrao, sendLang,
  ondeAppkey, ondeAppsecret, catalogo, catalogoEm, iccidsTeste, podeAdmin, podeOperar,
}: {
  host: string; hostDe: string; ambiente: string; ativa: boolean; digest: string;
  cooperationMode: string; mccPadrao: string; sendLang: string;
  ondeAppkey: string; ondeAppsecret: string;
  catalogo: PacoteTela[]; catalogoEm: string | null; iccidsTeste: string[];
  podeAdmin: boolean; podeOperar: boolean;
}) {
  const [eCfg, aCfg, pCfg] = useActionState(salvarConfigAcao, ESTADO_SIMPLES_INICIAL);
  const [eKey, aKey, pKey] = useActionState(salvarChaveAcao, ESTADO_SIMPLES_INICIAL);
  const [eSec, aSec, pSec] = useActionState(salvarSegredoAcao, ESTADO_SIMPLES_INICIAL);
  const [eApg, aApg, pApg] = useActionState(apagarChavesAcao, ESTADO_SIMPLES_INICIAL);
  const [eTst, aTst, pTst] = useActionState(testarConexaoAcao, ESTADO_CHAMADAS_INICIAL);
  const [eCat, aCat, pCat] = useActionState(sincronizarCatalogoAcao, ESTADO_CHAMADAS_INICIAL);
  const [eCon, aCon, pCon] = useActionState(consultarIccidAcao, ESTADO_CHAMADAS_INICIAL);
  const [eCmp, aCmp, pCmp] = useActionState(comprarPacoteAcao, ESTADO_CHAMADAS_INICIAL);
  const [eAtv, aAtv, pAtv] = useActionState(ativarPacoteAcao, ESTADO_CHAMADAS_INICIAL);
  const [iccid, setIccid] = useState(iccidsTeste[0] ?? "");

  const temChaves = ["ambiente", "banco"].includes(ondeAppkey) && ["ambiente", "banco"].includes(ondeAppsecret);
  const rotuloOnde = (o: string) =>
    o === "ambiente" ? "no ambiente do serviço (manda)" : o === "banco" ? "guardada, cifrada" : o === "ilegivel" ? "guardada mas ILEGÍVEL com a chave atual" : "falta";

  const campo: CSSProperties = { display: "flex", flexDirection: "column", gap: 4 };
  const grade: CSSProperties = { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" };

  return (
    <div className="cartao" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: "1.15rem" }}>China Mobile (CMLink)</h2>
        <span style={{
          fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 800,
          color: temChaves ? (ativa ? "var(--ok)" : "var(--marca)") : "var(--alerta)",
          border: `1px solid ${temChaves ? (ativa ? "var(--ok)" : "var(--marca)") : "var(--alerta)"}`, borderRadius: 999, padding: "2px 9px",
        }}>
          {temChaves ? (ativa ? `ativa · ${ambiente}` : `configurada · ${ambiente} · inativa`) : "faltam chaves"}
        </span>
        <a href="/painel/operadoras/cmlink/doc" style={{ fontSize: "0.85rem", marginLeft: "auto" }}>Documentação da API →</a>
      </div>
      <p style={{ margin: 0, color: "var(--texto-fraco)", fontSize: "0.88rem" }}>
        Provisionamento sob demanda: o ICCID já existe no pool da operadora; a venda compra o pacote de
        dados para ele e busca o QR. Toda chamada fica registrada abaixo, com a resposta completa.
      </p>

      {/* ------------------------------------------------ 1. chaves */}
      <details open={!temChaves} style={{ borderTop: "1px solid var(--borda)", paddingTop: 10 }}>
        <summary style={{ cursor: "pointer", fontSize: "0.9rem", fontWeight: 600 }}>
          1. Chaves {temChaves ? "✓" : "— faltam"}
        </summary>
        <p style={{ color: "var(--texto-fraco)", fontSize: "0.84rem", margin: "8px 0" }}>
          AppKey: <b>{rotuloOnde(ondeAppkey)}</b> · AppSecret: <b>{rotuloOnde(ondeAppsecret)}</b>. Guardadas
          cifradas com a chave-mãe do servidor; a variável de ambiente (<code>CMLINK_APPKEY</code>/<code>CMLINK_APPSECRET</code>),
          se existir, tem prioridade. Nenhuma das duas volta para esta tela.
        </p>
        {podeAdmin ? (
          <div style={grade}>
            <form action={aKey} style={campo}>
              <label className="rotulo">AppKey</label>
              <input type="password" name="appkey" autoComplete="off" placeholder={ondeAppkey === "nenhum" ? "cole aqui" : "•••••••• (cole de novo só para trocar)"} disabled={pKey || ondeAppkey === "ambiente"} />
              <button type="submit" disabled={pKey || ondeAppkey === "ambiente"}>{pKey ? "Guardando…" : "Guardar AppKey"}</button>
              <Recado e={eKey} />
            </form>
            <form action={aSec} style={campo}>
              <label className="rotulo">AppSecret</label>
              <input type="password" name="appsecret" autoComplete="off" placeholder={ondeAppsecret === "nenhum" ? "cole aqui" : "•••••••• (cole de novo só para trocar)"} disabled={pSec || ondeAppsecret === "ambiente"} />
              <button type="submit" disabled={pSec || ondeAppsecret === "ambiente"}>{pSec ? "Guardando…" : "Guardar AppSecret"}</button>
              <Recado e={eSec} />
            </form>
          </div>
        ) : null}
        {podeAdmin && (ondeAppkey === "banco" || ondeAppsecret === "banco" || ondeAppkey === "ilegivel" || ondeAppsecret === "ilegivel") ? (
          <form action={aApg} style={{ marginTop: 8 }}>
            <button type="submit" disabled={pApg} className="botao secundario" style={{ fontSize: "0.82rem" }}>
              {pApg ? "Apagando…" : "Apagar chaves guardadas no banco"}
            </button>
            <Recado e={eApg} />
          </form>
        ) : null}
      </details>

      {/* ------------------------------------------------ 2. configuração */}
      <details open={temChaves && !ativa} style={{ borderTop: "1px solid var(--borda)", paddingTop: 10 }}>
        <summary style={{ cursor: "pointer", fontSize: "0.9rem", fontWeight: 600 }}>2. Configuração</summary>
        <form action={aCfg} style={{ marginTop: 8 }}>
          <div style={grade}>
            <div style={campo}>
              <label className="rotulo">Host {hostDe === "ambiente" ? "(vem do ambiente: CMLINK_HOST)" : ""}</label>
              <input type="text" name="host" defaultValue={host} disabled={!podeAdmin || pCfg} />
            </div>
            <div style={campo}>
              <label className="rotulo">Ambiente</label>
              <select name="ambiente" defaultValue={ambiente} disabled={!podeAdmin || pCfg}>
                <option value="sandbox">sandbox</option>
                <option value="producao">produção</option>
              </select>
            </div>
            <div style={campo}>
              <label className="rotulo">Digest (WSSE)</label>
              <select name="digest" defaultValue={digest} disabled={!podeAdmin || pCfg}>
                <option value="A">A — base64 dos bytes do SHA-256</option>
                <option value="B">B — base64 do hex do SHA-256</option>
              </select>
            </div>
            <div style={campo}>
              <label className="rotulo">cooperationMode</label>
              <select name="cooperation_mode" defaultValue={cooperationMode} disabled={!podeAdmin || pCfg}>
                <option value="1">1 — consignment</option>
                <option value="2">2 — A2Z</option>
              </select>
            </div>
            <div style={campo}>
              <label className="rotulo">MCC padrão (ativação)</label>
              <input type="text" name="mcc_padrao" defaultValue={mccPadrao} placeholder="ex. 724" disabled={!podeAdmin || pCfg} />
            </div>
            <div style={campo}>
              <label className="rotulo">Idioma do SMS (sendLang)</label>
              <select name="send_lang" defaultValue={sendLang} disabled={!podeAdmin || pCfg}>
                <option value="2">2 — inglês</option>
                <option value="1">1 — chinês tradicional</option>
                <option value="3">3 — chinês simplificado</option>
              </select>
            </div>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, fontSize: "0.88rem" }}>
            <input type="checkbox" name="ativa" defaultChecked={ativa} disabled={!podeAdmin || pCfg} style={{ width: "auto" }} />
            Operadora ativa (o motor de entrega pode usá-la)
          </label>
          {podeAdmin ? (
            <button type="submit" disabled={pCfg} style={{ marginTop: 10 }}>{pCfg ? "Guardando…" : "Guardar configuração"}</button>
          ) : null}
          <Recado e={eCfg} />
        </form>
      </details>

      {/* ------------------------------------------------ 3. testes (só leitura) */}
      <div style={{ borderTop: "1px solid var(--borda)", paddingTop: 10 }}>
        <p style={{ fontSize: "0.9rem", fontWeight: 600, margin: "0 0 8px" }}>3. Testar (só leitura — não compra nada)</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
          <form action={aTst}>
            <button type="submit" disabled={!podeOperar || pTst}>{pTst ? "Testando…" : "Testar conexão (token)"}</button>
          </form>
          <form action={aCat}>
            <button type="submit" disabled={!podeOperar || pCat} className="botao secundario">{pCat ? "Buscando…" : "Sincronizar catálogo"}</button>
          </form>
        </div>
        <Recado e={eTst} /><Respostas e={eTst} />
        <Recado e={eCat} /><Respostas e={eCat} />

        <form action={aCon} style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ ...campo, minWidth: 260 }}>
            <label className="rotulo">ICCID</label>
            <input type="text" name="iccid" value={iccid} onChange={(ev) => setIccid(ev.target.value)} inputMode="numeric" disabled={pCon} />
          </div>
          <button type="submit" disabled={!podeOperar || pCon} className="botao secundario">{pCon ? "Consultando…" : "Consultar ICCID (estado, eSIM/QR, pacotes, consumo)"}</button>
        </form>
        {iccidsTeste.length > 0 ? (
          <p style={{ fontSize: "0.78rem", color: "var(--texto-fraco)", margin: "6px 0 0" }}>
            ICCIDs de homologação:{" "}
            {iccidsTeste.map((i) => (
              <button key={i} type="button" onClick={() => setIccid(i)} className="botao secundario" style={{ padding: "2px 8px", fontSize: "0.74rem", marginRight: 6 }}>
                …{i.slice(-4)}
              </button>
            ))}
          </p>
        ) : null}
        <Recado e={eCon} /><Respostas e={eCon} />
      </div>

      {/* ------------------------------------------------ 4. compra manual (gasta deposito) */}
      {podeAdmin ? (
        <details style={{ borderTop: "1px solid var(--borda)", paddingTop: 10 }}>
          <summary style={{ cursor: "pointer", fontSize: "0.9rem", fontWeight: 600, color: "var(--alerta)" }}>
            4. Comprar / ativar pacote para um ICCID (gasta o depósito na operadora)
          </summary>
          <p style={{ color: "var(--texto-fraco)", fontSize: "0.84rem", margin: "8px 0" }}>
            É a mesma chamada que a venda vai fazer sozinha (APP_createOrder). Idempotente por
            ICCID + pacote + dia: apertar duas vezes não compra duas vezes. Sincronize o catálogo
            antes para escolher o pacote pela lista.
          </p>
          <form action={aCmp} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div style={{ ...campo, minWidth: 240 }}>
              <label className="rotulo">ICCID</label>
              <input type="text" name="iccid" defaultValue={iccid} inputMode="numeric" disabled={pCmp} />
            </div>
            <div style={{ ...campo, minWidth: 280 }}>
              <label className="rotulo">Pacote (dataBundleId)</label>
              {catalogo.length > 0 ? (
                <select name="data_bundle_id" disabled={pCmp} defaultValue="">
                  <option value="">— escolha —</option>
                  {catalogo.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.id} · {p.nome} · {p.period}{String(p.periodType) === "1" ? "d" : ""} · {p.precos.map((x) => `${x.valor} ${x.moeda}`).join("/")}
                    </option>
                  ))}
                </select>
              ) : (
                <input type="text" name="data_bundle_id" placeholder="sincronize o catálogo, ou digite o id" disabled={pCmp} />
              )}
            </div>
            <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.84rem" }}>
              <input type="checkbox" name="confirmo" style={{ width: "auto" }} disabled={pCmp} /> confirmo a compra
            </label>
            <button type="submit" disabled={pCmp}>{pCmp ? "Comprando…" : "Comprar pacote"}</button>
          </form>
          <Recado e={eCmp} /><Respostas e={eCmp} />

          <form action={aAtv} style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginTop: 14 }}>
            <div style={{ ...campo, minWidth: 240 }}>
              <label className="rotulo">ICCID</label>
              <input type="text" name="iccid" defaultValue={iccid} inputMode="numeric" disabled={pAtv} />
            </div>
            <div style={{ ...campo, minWidth: 200 }}>
              <label className="rotulo">dataBundleId</label>
              <input type="text" name="data_bundle_id" disabled={pAtv} />
            </div>
            <div style={{ ...campo, minWidth: 120 }}>
              <label className="rotulo">MCC</label>
              <input type="text" name="mcc" defaultValue={mccPadrao} disabled={pAtv} />
            </div>
            <button type="submit" disabled={pAtv} className="botao secundario">{pAtv ? "Ativando…" : "Ativar pacote já comprado (APP_activeDataBundle)"}</button>
          </form>
          <Recado e={eAtv} /><Respostas e={eAtv} />
        </details>
      ) : null}

      {/* ------------------------------------------------ catálogo */}
      <details style={{ borderTop: "1px solid var(--borda)", paddingTop: 10 }}>
        <summary style={{ cursor: "pointer", fontSize: "0.9rem", fontWeight: 600 }}>
          Catálogo guardado: {catalogo.length} pacote(s){catalogoEm ? ` · sincronizado em ${catalogoEm}` : ""}
        </summary>
        {catalogo.length === 0 ? (
          <p className="nota" style={{ margin: "8px 0 0" }}>Nenhum pacote ainda. Clique em “Sincronizar catálogo”.</p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: 8 }}>
            <table style={{ width: "100%", fontSize: "0.8rem", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--texto-fraco)" }}>
                  <th style={{ padding: "4px 6px" }}>id</th><th style={{ padding: "4px 6px" }}>nome</th><th style={{ padding: "4px 6px" }}>status</th>
                  <th style={{ padding: "4px 6px" }}>ativação</th><th style={{ padding: "4px 6px" }}>período</th><th style={{ padding: "4px 6px" }}>preço</th><th style={{ padding: "4px 6px" }}>mcc</th>
                </tr>
              </thead>
              <tbody>
                {catalogo.map((p) => (
                  <tr key={p.id} style={{ borderTop: "1px solid var(--borda)" }}>
                    <td style={{ padding: "4px 6px" }}><code>{p.id}</code></td>
                    <td style={{ padding: "4px 6px" }}>{p.nome}</td>
                    <td style={{ padding: "4px 6px" }}>{String(p.status)}</td>
                    <td style={{ padding: "4px 6px" }}>{p.activationMode}</td>
                    <td style={{ padding: "4px 6px" }}>{String(p.period)} ({String(p.periodType)})</td>
                    <td style={{ padding: "4px 6px" }}>{p.precos.map((x) => `${x.valor} ${x.moeda}`).join(" / ")}</td>
                    <td style={{ padding: "4px 6px", wordBreak: "break-all" }}>{p.mccs.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </div>
  );
}
