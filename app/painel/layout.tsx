import { redirect } from "next/navigation";
import { usuarioDaSessao } from "../../lib/painel/sessao";
import { sair } from "./acoes";
import Menu from "./Menu";

export const dynamic = "force-dynamic";

// Tudo sob /painel exige sessao. A tela de login fica FORA deste layout de
// proposito — se estivesse dentro, a verificacao redirecionaria para ela mesma.
export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const u = await usuarioDaSessao();
  if (!u) redirect("/entrar");

  return (
    <div className="pn">
      <aside className="pn-lado">
        <div className="marca">
          <span className="ponto" aria-hidden="true" />
          AmericaSim
        </div>

        <Menu />

        <div className="pn-rodape">
          <div className="quem">
            <b>{u.nome}</b>
            {u.papel}
          </div>
          <form action={sair}>
            <button type="submit" className="pn-sair">
              Sair
            </button>
          </form>
        </div>
      </aside>

      <main className="pn-conteudo">{children}</main>
    </div>
  );
}
