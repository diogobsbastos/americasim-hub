"use client";

import { useActionState } from "react";
import { salvarConfigZapAcao, testarZapAcao, zapConectarAcao, zapDesconectarAcao, zapStatusAcao } from "./acoes";
import { ESTADO_ZAP_CFG_INICIAL, ESTADO_ZAP_INICIAL } from "./tipos";

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

export default function CartaoZap({
  zapInstancia, zapDestino, zapApikeyOnde, podeAdmin, podeOperar,
}: {
  zapInstancia: string; zapDestino: string; zapApikeyOnde: string;
  podeAdmin: boolean; podeOperar: boolean;
}) {
  const [eCfg, aCfg, pCfg] = useActionState(salvarConfigZapAcao, ESTADO_ZAP_CFG_INICIAL);
  const [eZap, aZap, pZap] = useActionState(testarZapAcao, ESTADO_ZAP_CFG_INICIAL);
  const [eZs, aZs, pZs] = useActionState(zapStatusAcao, ESTADO_ZAP_INICIAL);
  const [eZc, aZc, pZc] = useActionState(zapConectarAcao, ESTADO_ZAP_INICIAL);
  const [eZd, aZd, pZd] = useActionState(zapDesconectarAcao, ESTADO_ZAP_INICIAL);

  return (
    <>
      <div className="cartao" style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: "0.95rem", textTransform: "uppercase", margin: "0 0 6px" }}>Conexão do WhatsApp (número-robô)</h2>
        <p className="nota" style={{ marginTop: 0 }}>
          Ativação toda por aqui — criar a instância, escanear o QR e trocar de número no futuro, sem SSH.
          Instância: <b>{zapInstancia || "americasim (padrão)"}</b>. A API key o painel acha sozinho
          (cofre primeiro; sem cofre, lê a do próprio servidor).
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

      <div className="cartao" style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: "0.95rem", textTransform: "uppercase", margin: "0 0 6px" }}>Configuração dos avisos</h2>
        <p className="nota" style={{ marginTop: 0 }}>
          API key da Evolution: <b>{zapApikeyOnde === "banco" ? "✅ no cofre" : zapApikeyOnde === "ambiente" ? "✅ no .env" : "— o painel usa a do servidor"}</b>.
          Todo aviso enviado (ou que falhar) fica gravado e aparece na tela Registros.
        </p>
        {podeAdmin ? (
          <form action={aCfg} autoComplete="off">
            <label style={rotulo} htmlFor="czi">Instância da Evolution (vazio = americasim)</label>
            <input id="czi" name="zap_instancia" defaultValue={zapInstancia} style={campo} disabled={pCfg} />
            <label style={rotulo} htmlFor="czd">Número destino dos avisos (só dígitos, com DDI: 55219…)</label>
            <input id="czd" name="zap_destino" defaultValue={zapDestino} style={campo} disabled={pCfg} />
            <label style={rotulo} htmlFor="cza">API key da Evolution (opcional — guardada no cofre, não reaparece)</label>
            <input id="cza" name="zap_apikey" type="password" autoComplete="new-password" data-lpignore="true" style={campo} disabled={pCfg} />
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button type="submit" disabled={pCfg}>{pCfg ? "Guardando…" : "Guardar"}</button>
            </div>
          </form>
        ) : (
          <p className="nota">Destino dos avisos: <b>{zapDestino || "— não definido"}</b></p>
        )}
        <form action={aZap} style={{ marginTop: 10 }}>
          <button type="submit" className="secundario" disabled={pZap}>{pZap ? "Enviando…" : "Testar Zap (manda mensagem de verdade)"}</button>
        </form>
        <Resultado e={eCfg} />
        <Resultado e={eZap} />
      </div>
    </>
  );
}
