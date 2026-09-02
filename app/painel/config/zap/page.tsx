import { db } from "../../../../lib/db";
import { ondeEstaOSegredo } from "../../../../lib/segredo-app";
import { usuarioDaSessao } from "../../../../lib/painel/sessao";
import CartaoZap from "./CartaoZap";

export const dynamic = "force-dynamic";

export const metadata = { title: "Configurações · Zap — AmericaSim", robots: { index: false, follow: false } };

// Aba Zap (mudou de Requisicoes para ca em 02/09 — "Configurações < ABAS").
// Conexao do numero-robo por QR na tela + numero destino dos avisos.
export default async function ConfigZap() {
  const u = await usuarioDaSessao();
  const podeAdmin = u?.papel === "admin";
  const podeOperar = u?.papel === "admin" || u?.papel === "operacao";

  const [pInst, pDest, ondeKey] = await Promise.all([
    db.query("select valor from parametro where chave = 'zap.instancia'"),
    db.query("select valor from parametro where chave = 'zap.destino'"),
    ondeEstaOSegredo("ZAP_APIKEY"),
  ]);

  return (
    <CartaoZap
      zapInstancia={String(pInst.rows[0]?.valor ?? "").trim()}
      zapDestino={String(pDest.rows[0]?.valor ?? "").trim()}
      zapApikeyOnde={ondeKey}
      podeAdmin={!!podeAdmin}
      podeOperar={!!podeOperar}
    />
  );
}
