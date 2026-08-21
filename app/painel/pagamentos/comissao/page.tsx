import { estadoStripe } from "../../../../lib/stripe";
import { usuarioDaSessao } from "../../../../lib/painel/sessao";
import Comissao from "./Comissao";

export const dynamic = "force-dynamic";

export default async function PaginaComissao() {
  const u = await usuarioDaSessao();
  const podeMexer = u?.papel === "admin";
  const s = await estadoStripe();

  return (
    <div style={{ maxWidth: 620 }}>
      <Comissao fixa={s.comissaoFixa} pct={s.comissaoPct} podeMexer={!!podeMexer} />
    </div>
  );
}
