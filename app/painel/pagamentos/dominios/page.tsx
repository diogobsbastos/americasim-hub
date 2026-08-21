import { estadoDosDominios } from "../../../../lib/stripe-dominios";
import { usuarioDaSessao } from "../../../../lib/painel/sessao";
import Dominios from "./Dominios";

export const dynamic = "force-dynamic";

export default async function PaginaDominios() {
  const u = await usuarioDaSessao();
  const podeMexer = u?.papel === "admin";
  const { vitrines, soltos, erro } = await estadoDosDominios();

  return (
    <>
      <p style={{ color: "var(--texto-fraco)", fontSize: "0.88rem", margin: "0 0 16px", maxWidth: 760 }}>
        Google Pay, Apple Pay e Link só aparecem no checkout se o domínio da vitrine estiver
        registrado na Stripe. <b>Esquecer um registro não dá erro em lugar nenhum</b> — o botão
        simplesmente não aparece, e a conversão cai sem explicação. Por isso esta tela pergunta
        o estado à Stripe a cada carregamento, em vez de confiar num campo do nosso banco.
      </p>

      {erro ? (
        <div className="cartao perigo" style={{ marginBottom: 18 }}>
          <p style={{ margin: 0, color: "var(--erro)" }}>
            Não consegui falar com a Stripe: {erro}
          </p>
          <p style={{ margin: "6px 0 0", fontSize: "0.85rem", color: "var(--texto-fraco)" }}>
            Confira a chave secreta na aba <b>Conta</b>.
          </p>
        </div>
      ) : null}

      <Dominios vitrines={vitrines} soltos={soltos} podeMexer={!!podeMexer} />
    </>
  );
}
