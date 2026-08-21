"use client";

import { useActionState } from "react";
import { apagarChaveStripe, salvarChaveStripe, testarStripe } from "../acoes";
import { ESTADO_PAGAMENTO_INICIAL, ESTADO_CONTA_STRIPE_INICIAL } from "../tipos";

const COR: Record<string, string> = {
  nenhum: "var(--alerta)",
  invalida: "var(--erro)",
  teste: "var(--marca)",
  producao: "var(--ok)",
};

const ROTULO: Record<string, string> = {
  nenhum: "Falta a chave",
  invalida: "Chave inválida",
  teste: "Modo de teste",
  producao: "Produção — cobra de verdade",
};

function Recado({ e }: { e: { erro: string; ok: string } }) {
  if (!e?.erro && !e?.ok) return null;
  return (
    <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: e?.erro ? "var(--erro)" : "var(--ok)" }}>
      {e?.erro || e?.ok}
    </p>
  );
}

export default function CartaoConta({
  modo,
  temSecreta,
  temWebhook,
  ondeSecreta,
  ondeWebhook,
  urlWebhook,
  podeMexer,
}: {
  modo: string;
  temSecreta: boolean;
  temWebhook: boolean;
  ondeSecreta: string;
  ondeWebhook: string;
  urlWebhook: string;
  podeMexer: boolean;
}) {
  const [eSec, aSec, pSec] = useActionState(salvarChaveStripe, ESTADO_PAGAMENTO_INICIAL);
  const [eWh, aWh, pWh] = useActionState(salvarChaveStripe, ESTADO_PAGAMENTO_INICIAL);
  const [eApg, aApg, pApg] = useActionState(apagarChaveStripe, ESTADO_PAGAMENTO_INICIAL);
  const [eTeste, aTeste, pTeste] = useActionState(testarStripe, ESTADO_CONTA_STRIPE_INICIAL);

  return (
    <div className="cartao" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: "1.15rem" }}>Stripe</h2>
        <span
          style={{
            fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.08em",
            fontWeight: 800, color: COR[modo] ?? "var(--texto-fraco)",
            border: `1px solid ${COR[modo] ?? "var(--borda)"}`,
            borderRadius: 999, padding: "2px 9px",
          }}
        >
          {ROTULO[modo] ?? modo}
        </span>
      </div>

      <p style={{ margin: 0, color: "var(--texto-fraco)", fontSize: "0.88rem" }}>
        Recebe o pagamento do cliente. Enquanto não houver chave aqui, a loja funciona em modo
        demonstração: o pedido é considerado pago na hora e nada é cobrado.
      </p>

      {modo === "producao" ? (
        <p style={{ margin: 0, fontSize: "0.86rem", color: "var(--erro)", fontWeight: 600 }}>
          Atenção: esta loja está cobrando dinheiro de verdade.
        </p>
      ) : null}

      {/* ----------------------------------------------- 1. chave secreta */}
      <details open={!temSecreta} style={{ borderTop: "1px solid var(--borda)", paddingTop: 10 }}>
        <summary style={{ cursor: "pointer", fontSize: "0.9rem", fontWeight: 600 }}>
          1. Chave secreta {temSecreta ? "✓" : "— falta"}
        </summary>

        <p style={{ color: "var(--texto-fraco)", fontSize: "0.84rem", margin: "8px 0" }}>
          No painel da Stripe: <b>Desenvolvedores → Chaves de API</b>. Copie a{" "}
          <b>chave secreta</b> (começa com <code>sk_</code>). A publicável, que começa com{" "}
          <code>pk_</code>, não serve aqui.
        </p>

        {ondeSecreta === "ilegivel" ? (
          <p style={{ color: "var(--erro)", fontSize: "0.84rem", margin: "8px 0" }}>
            Existe uma chave guardada, mas ela não abre com a chave de cifra atual do servidor.
            Cole de novo.
          </p>
        ) : null}

        {ondeSecreta === "ambiente" ? (
          <p style={{ color: "var(--texto-fraco)", fontSize: "0.84rem", margin: "8px 0" }}>
            A chave está no arquivo de ambiente do servidor (<code>STRIPE_SECRET_KEY</code>) e é
            ela que vale. Para trocar por aqui, remova de lá primeiro.
          </p>
        ) : podeMexer ? (
          <form action={aSec}>
            <input type="hidden" name="qual" value="secreta" />
            <label className="rotulo">
              Chave secreta {temSecreta ? "(já guardada — cole de novo só para trocar)" : ""}
            </label>
            <input
              type="password" name="valor" autoComplete="off"
              placeholder={temSecreta ? "••••••••••••" : "sk_test_…"} disabled={pSec}
            />
            <label
              style={{
                display: "flex", alignItems: "flex-start", gap: 8, marginTop: 8,
                fontSize: "0.8rem", color: "var(--texto-fraco)",
              }}
            >
              <input type="checkbox" name="confirmo_producao" value="sim" style={{ width: "auto", marginTop: 3 }} />
              <span>
                Marque <b>apenas</b> se está colando uma chave de produção (<code>sk_live_</code>) e
                quer que a loja passe a cobrar dinheiro de verdade. Cobrança feita não tem desfazer
                automático: cada estorno é manual e a taxa da Stripe não volta.
              </span>
            </label>
            <button type="submit" disabled={pSec} style={{ marginTop: 8 }}>
              {pSec ? "Guardando…" : temSecreta ? "Trocar chave" : "Guardar chave"}
            </button>
            <Recado e={eSec} />
          </form>
        ) : null}

        {podeMexer && ondeSecreta === "banco" ? (
          <form action={aApg} style={{ marginTop: 8 }}>
            <input type="hidden" name="qual" value="secreta" />
            <button type="submit" disabled={pApg} className="botao secundario" style={{ fontSize: "0.82rem" }}>
              {pApg ? "Apagando…" : "Apagar chave guardada"}
            </button>
            <Recado e={eApg} />
          </form>
        ) : null}
      </details>

      {/* ----------------------------------------------- 2. webhook */}
      <details open={temSecreta && !temWebhook} style={{ borderTop: "1px solid var(--borda)", paddingTop: 10 }}>
        <summary style={{ cursor: "pointer", fontSize: "0.9rem", fontWeight: 600 }}>
          2. Aviso de pagamento (webhook) {temWebhook ? "✓" : "— falta"}
        </summary>

        <p style={{ color: "var(--texto-fraco)", fontSize: "0.84rem", margin: "8px 0" }}>
          É assim que a Stripe conta ao hub que o dinheiro entrou — e é o que dispara a entrega
          do eSIM. Sem isso o cliente paga e não recebe nada. No painel:{" "}
          <b>Desenvolvedores → Webhooks → Adicionar destino</b>, com esta URL:
        </p>
        <code style={{ display: "block", wordBreak: "break-all", padding: "8px 10px", fontSize: "0.76rem" }}>
          {urlWebhook}
        </code>
        <p style={{ color: "var(--texto-fraco)", fontSize: "0.84rem", margin: "8px 0" }}>
          Eventos a marcar:
        </p>
        <ul style={{ margin: "0 0 8px", paddingLeft: 18, fontSize: "0.8rem", color: "var(--texto-fraco)" }}>
          <li><code>checkout.session.completed</code> — cliente terminou o pagamento</li>
          <li><code>checkout.session.async_payment_succeeded</code> — Pix/boleto compensou</li>
          <li><code>checkout.session.async_payment_failed</code> — Pix/boleto não veio</li>
          <li><code>checkout.session.expired</code> — devolve o eSIM reservado ao estoque</li>
          <li><code>charge.refunded</code> e <code>charge.dispute.created</code> — estorno e contestação</li>
        </ul>
        <p style={{ color: "var(--texto-fraco)", fontSize: "0.84rem", margin: "8px 0" }}>
          Na página do destino, revele o <b>segredo de assinatura</b> (<code>whsec_</code>) e cole
          aqui. É ele que prova que o aviso veio mesmo da Stripe — sem essa conferência, qualquer
          um marcaria pedido como pago.
        </p>

        {ondeWebhook === "ilegivel" ? (
          <p style={{ color: "var(--erro)", fontSize: "0.84rem", margin: "8px 0" }}>
            Existe um segredo guardado, mas ele não abre com a chave de cifra atual. Cole de novo.
          </p>
        ) : null}

        {ondeWebhook === "ambiente" ? (
          <p style={{ color: "var(--texto-fraco)", fontSize: "0.84rem", margin: "8px 0" }}>
            O segredo está no arquivo de ambiente do servidor (<code>STRIPE_WEBHOOK_SECRET</code>).
          </p>
        ) : podeMexer ? (
          <form action={aWh}>
            <input type="hidden" name="qual" value="webhook" />
            <label className="rotulo">
              Segredo do webhook {temWebhook ? "(já guardado — cole de novo só para trocar)" : ""}
            </label>
            <input
              type="password" name="valor" autoComplete="off"
              placeholder={temWebhook ? "••••••••••••" : "whsec_…"} disabled={pWh}
            />
            <button type="submit" disabled={pWh} style={{ marginTop: 8 }}>
              {pWh ? "Guardando…" : temWebhook ? "Trocar segredo" : "Guardar segredo"}
            </button>
            <Recado e={eWh} />
          </form>
        ) : null}
      </details>

      {/* ----------------------------------------------- 3. conferir */}
      <div style={{ borderTop: "1px solid var(--borda)", paddingTop: 10 }}>
        <p style={{ fontSize: "0.9rem", fontWeight: 600, margin: "0 0 8px" }}>
          3. Conferir a conta {eTeste.conta ? "✓" : ""}
        </p>
        <p style={{ color: "var(--texto-fraco)", fontSize: "0.84rem", margin: "0 0 8px" }}>
          Guardar a chave não prova que ela funciona. Este botão pergunta à Stripe de quem é a
          conta — é o único jeito de saber antes do primeiro cliente.
        </p>

        {podeMexer && temSecreta ? (
          <form action={aTeste}>
            <button type="submit" disabled={pTeste} className="botao secundario" style={{ fontSize: "0.9rem" }}>
              {pTeste ? "Perguntando à Stripe…" : "Conferir conta"}
            </button>
          </form>
        ) : null}

        {eTeste.conta ? (
          <div style={{ fontSize: "0.85rem", color: "var(--texto-fraco)", marginTop: 8 }}>
            <div>
              Conta: <b style={{ color: "var(--texto)" }}>{eTeste.conta.nome}</b>{" "}
              <code>{eTeste.conta.id}</code>
            </div>
            <div>
              País: {eTeste.conta.pais || "—"} · Moeda de liquidação: {eTeste.conta.moeda || "—"}
            </div>
            <div style={{ color: eTeste.conta.podeCobrar ? "var(--ok)" : "var(--alerta)" }}>
              {eTeste.conta.podeCobrar
                ? "Habilitada para receber pagamentos."
                : "Ainda NÃO habilitada para receber — falta concluir a verificação na Stripe."}
            </div>
            {eTeste.conta.moeda && eTeste.conta.moeda !== "BRL" ? (
              <div style={{ color: "var(--alerta)", marginTop: 6 }}>
                A conta liquida em {eTeste.conta.moeda} e o catálogo está em BRL. A Stripe converte
                cada venda, com spread de câmbio por cima das taxas — isso entra na margem real.
              </div>
            ) : null}
          </div>
        ) : null}
        <Recado e={eTeste} />
      </div>
    </div>
  );
}
