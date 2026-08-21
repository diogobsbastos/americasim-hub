import { headers } from "next/headers";
import { estadoStripe } from "../../../../lib/stripe";
import { usuarioDaSessao } from "../../../../lib/painel/sessao";
import CartaoConta from "./CartaoConta";

export const dynamic = "force-dynamic";

export default async function Conta() {
  const u = await usuarioDaSessao();
  const podeMexer = u?.papel === "admin";

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "127.0.0.1:3002";

  const s = await estadoStripe();

  return (
    <>
      {!podeMexer ? (
        <p className="nota" style={{ marginBottom: 14 }}>
          Seu papel permite ver o estado da conta, mas não alterar credenciais.
        </p>
      ) : null}

      <div style={{ maxWidth: 720 }}>
        <CartaoConta
          modo={s.modo}
          temSecreta={s.temSecreta}
          temWebhook={s.temWebhook}
          ondeSecreta={s.ondeSecreta}
          ondeWebhook={s.ondeWebhook}
          urlWebhook={`${proto}://${host}/v1/webhooks/stripe`}
          podeMexer={!!podeMexer}
        />
      </div>
    </>
  );
}
