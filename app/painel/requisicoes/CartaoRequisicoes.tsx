"use client";

import { useActionState } from "react";
import { aprovarLoteAcao, enviarRequisicaoAcao, rejeitarLoteAcao, salvarConfigReqAcao, testarZapAcao, zapConectarAcao, zapDesconectarAcao, zapStatusAcao } from "./acoes";
import { ESTADO_REQ_INICIAL, ESTADO_ZAP_INICIAL } from "./tipos";

export interface LoteTela {
  id: string;
  remetente: string;
  assunto: string;
  arquivo: string;
  recebidoEm: string;
  linhas: number;
  iccids: number;
  comLpa: number;
  amostra: string[];
  status: string;
  resultado: string;
}

export interface RequisicaoTela {
  para: string;
  quantidade: number | null;
  criadoEm: string;
}

export interface VarianteOpcao {
  id: string;
  sku: string;
  modo: string;
}

function Resultado({ e }: { e: { erro: string; ok: string } }) {
  return (
    <>
      {e.erro ? <p style={{ color: "var(--erro)", margin: "8px 0 0", fontSize: "0.84rem" }}>{e.erro}</p> : null}
      {e.ok ? <p style={{ color: "var(--ok)", margin: "8px 0 0", fontSize: "0.84rem" }}>{e.ok}</p> : null}
    </>
  );
}

const rotulo = { display: "block", fontSize: "0.78rem", color: "var(--texto-fraco)", margin: "10px 0 4px" } as const;
const campo = { width: "100%", maxWidth: 520 } as const;

export default function CartaoRequisicoes({
  destino, remetentes, zapInstancia, zapDestino, zapApikeyOnde, caixaLigada, caixaErro, lotes, requisicoes, variantes, podeAdmin, podeOperar,
}: {
  destino: string; remetentes: string; zapInstancia: string; zapDestino: string; zapApikeyOnde: string;
  caixaLigada: boolean; caixaErro: string;
  lotes: LoteTela[]; requisicoes: RequisicaoTela[]; variantes: VarianteOpcao[];
  podeAdmin: boolean; podeOperar: boolean;
}) {
  const [eReq, aReq, pReq] = useActionState(enviarRequisicaoAcao, ESTADO_REQ_INICIAL);
  const [eApr, aApr, pApr] = useActionState(aprovarLoteAcao, ESTADO_REQ_INICIAL);
  const [eRej, aRej, pRej] = useActionState(rejeitarLoteAcao, ESTADO_REQ_INICIAL);
  const [eCfg, aCfg, pCfg] = useActionState(salvarConfigReqAcao, ESTADO_REQ_INICIAL);
  const [eZap, aZap, pZap] = useActionState(testarZapAcao, ESTADO_REQ_INICIAL);
  const [eZs, aZs, pZs] = useActionState(zapStatusAcao, ESTADO_ZAP_INICIAL);
  const [eZc, aZc, pZc] = useActionState(zapConectarAcao, ESTADO_ZAP_INICIAL);
  const [eZd, aZd, pZd] = useActionState(zapDesconectarAcao, ESTADO_ZAP_INICIAL);

  const pendentes = lotes.filter((l) => l.status === "pendente");
  const tratados = lotes.filter((l) => l.status !== "pendente");
  const zapPronto = Boolean(zapInstancia && zapDestino && zapApikeyOnde !== "nenhum");

  return (
    <>
      <div className="cartao" style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: "0.95rem", textTransform: "uppercase", margin: "0 0 6px" }}>Requisitar ICCIDs</h2>
        <p className="nota" style={{ marginTop: 0 }}>
          Envia o e-mail padrão para <b>{destino}</b> e avisa no Zap. A resposta com o CSV entra sozinha na lista
          abaixo — o Gmail avisa o robô na hora ({caixaLigada ? "caixa conectada ✅" : `caixa desconectada ⚠️${caixaErro ? ` — ${caixaErro}` : ""}`}).
        </p>
        {podeOperar ? (
          <form action={aReq}>
            <label style={rotulo} htmlFor="rq">Quantidade de ICCIDs</label>
            <input id="rq" name="quantidade" type="number" min={1} max={10000} required style={{ width: 140 }} disabled={pReq} />
            <label style={rotulo} htmlFor="ro">Observação (opcional — vai no e-mail e no Zap)</label>
            <input id="ro" name="observacao" style={campo} disabled={pReq} />
            <div style={{ marginTop: 12 }}>
              <button type="submit" disabled={pReq}>{pReq ? "Enviando…" : "Enviar requisição"}</button>
            </div>
          </form>
        ) : null}
        <Resultado e={eReq} />
        {requisicoes.length > 0 ? (
          <p className="nota">Últimas: {requisicoes.map((r) => `${r.quantidade ?? "?"} un · ${r.criadoEm}`).join(" • ")}</p>
        ) : null}
      </div>

      <div className="cartao" style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: "0.95rem", textTransform: "uppercase", margin: "0 0 6px" }}>
          Lotes recebidos {pendentes.length > 0 ? `— ${pendentes.length} aguardando aprovação` : ""}
        </h2>
        <p className="nota" style={{ marginTop: 0 }}>
          CSV que chega por e-mail vira lote pendente — nada entra no estoque sem um clique seu.
          Com código LPA no arquivo, o eSIM entra pronto para vender; só ICCID entra como pool.
          Aprovação responde o e-mail do remetente e avisa no Zap.
        </p>
        {pendentes.length === 0 ? <p className="nota">Nenhum lote pendente.</p> : null}
        {pendentes.map((l) => (
          <div key={l.id} style={{ border: "1px solid var(--borda)", borderRadius: 10, padding: "12px 14px", marginTop: 10 }}>
            <div style={{ fontSize: "0.86rem" }}>
              <b>{l.arquivo}</b> · de <code>{l.remetente}</code> · {l.recebidoEm}
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--texto-fraco)", marginTop: 4 }}>
              {l.linhas} linha(s) → <b>{l.iccids} ICCID(s)</b>, {l.comLpa} com código LPA · amostra: {l.amostra.length ? l.amostra.map((a) => `…${a.slice(-6)}`).join(", ") : "—"}
            </div>
            {podeAdmin ? (
              <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", marginTop: 10 }}>
                <form action={aApr} style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
                  <input type="hidden" name="lote_id" value={l.id} />
                  <label style={{ fontSize: "0.78rem", color: "var(--texto-fraco)" }}>
                    SKU de destino{" "}
                    <select name="variante_id" required defaultValue="" style={{ display: "block", marginTop: 4 }}>
                      <option value="" disabled>escolha…</option>
                      {variantes.map((v) => (
                        <option key={v.id} value={v.id}>{v.sku} ({v.modo})</option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" disabled={pApr}>{pApr ? "Carregando…" : "Aprovar e carregar"}</button>
                </form>
                <form action={aRej}>
                  <input type="hidden" name="lote_id" value={l.id} />
                  <button type="submit" className="secundario" disabled={pRej}>Rejeitar</button>
                </form>
              </div>
            ) : null}
          </div>
        ))}
        <Resultado e={eApr} />
        <Resultado e={eRej} />
        {tratados.length > 0 ? (
          <p className="nota" style={{ marginTop: 12 }}>
            Histórico: {tratados.map((l) => `${l.arquivo} (${l.status}${l.resultado ? ` · ${l.resultado}` : ""})`).join(" • ")}
          </p>
        ) : null}
      </div>

      <div className="cartao" style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: "0.95rem", textTransform: "uppercase", margin: "0 0 6px" }}>Configuração</h2>
        <p className="nota" style={{ marginTop: 0 }}>
          Zap: {zapPronto ? "✅ configurado" : "— faltam campos"} · API key da Evolution: <b>{zapApikeyOnde === "banco" ? "✅ no cofre" : zapApikeyOnde === "ambiente" ? "✅ no .env" : "— vazia"}</b>
        </p>
        {podeAdmin ? (
          <form action={aCfg} autoComplete="off">
            <label style={rotulo} htmlFor="cd">Destino da requisição (e-mail da EasySim4u)</label>
            <input id="cd" name="destino" defaultValue={destino} style={campo} disabled={pCfg} />
            <label style={rotulo} htmlFor="cr">Remetentes autorizados a mandar CSV (vírgula; “@dominio.com” autoriza o domínio inteiro)</label>
            <input id="cr" name="remetentes" defaultValue={remetentes} style={campo} disabled={pCfg} />
            <label style={rotulo} htmlFor="czi">Zap — instância da Evolution (ex.: americasim)</label>
            <input id="czi" name="zap_instancia" defaultValue={zapInstancia} style={campo} disabled={pCfg} />
            <label style={rotulo} htmlFor="czd">Zap — número destino (só dígitos, com DDI: 55219…)</label>
            <input id="czd" name="zap_destino" defaultValue={zapDestino} style={campo} disabled={pCfg} />
            <label style={rotulo} htmlFor="cza">Zap — API key da Evolution (guardada, não reaparece)</label>
            <input id="cza" name="zap_apikey" type="password" autoComplete="new-password" data-lpignore="true" style={campo} disabled={pCfg} />
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button type="submit" disabled={pCfg}>{pCfg ? "Guardando…" : "Guardar"}</button>
            </div>
          </form>
        ) : (
          <p className="nota">Destino: <b>{destino}</b> · Remetentes: <b>{remetentes}</b></p>
        )}
        <form action={aZap} style={{ marginTop: 10 }}>
          <button type="submit" className="secundario" disabled={pZap}>{pZap ? "Enviando…" : "Testar Zap (manda mensagem de verdade)"}</button>
        </form>
        <Resultado e={eCfg} />
        <Resultado e={eZap} />
      </div>

      <div className="cartao" style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: "0.95rem", textTransform: "uppercase", margin: "0 0 6px" }}>Conexão do WhatsApp (número-robô)</h2>
        <p className="nota" style={{ marginTop: 0 }}>
          Ativação toda por aqui — criar a instância, escanear o QR e trocar de número no futuro, sem SSH.
          Usa a instância da Configuração acima ({zapInstancia ? <b>{zapInstancia}</b> : <b>defina e guarde primeiro</b>}) e a API key do cofre.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {podeOperar ? (
            <form action={aZs}>
              <button type="submit" className="secundario" disabled={pZs}>{pZs ? "Consultando…" : "Ver status"}</button>
            </form>
          ) : null}
          {podeAdmin ? (
            <>
              <form action={aZc}>
                <button type="submit" disabled={pZc}>{pZc ? "Gerando QR…" : "Conectar / gerar QR"}</button>
              </form>
              <form action={aZd}>
                <button type="submit" className="secundario" disabled={pZd}>{pZd ? "Desconectando…" : "Desconectar (trocar número)"}</button>
              </form>
            </>
          ) : null}
        </div>
        {eZc.qr ? (
          <div style={{ marginTop: 12 }}>
            {/* Fundo branco de proposito: QR precisa de contraste para a camera, claro ou escuro. */}
            <img src={eZc.qr} alt="QR para conectar o WhatsApp do número-robô" width={260} height={260} style={{ background: "#fff", padding: 8, borderRadius: 8, display: "block" }} />
            <p className="nota">O QR expira em menos de um minuto — se não der tempo, clique Conectar de novo. Depois de escanear, confira com Ver status.</p>
          </div>
        ) : null}
        <Resultado e={eZs} />
        <Resultado e={eZc} />
        <Resultado e={eZd} />
      </div>
    </>
  );
}
