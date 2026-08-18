import { redirect } from "next/navigation";
import { usuarioDaSessao } from "../../lib/painel/sessao";
import FormEntrar from "./FormEntrar";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Entrar — Painel AmericaSim",
  robots: { index: false, follow: false },
};

export default async function Entrar() {
  // Quem ja tem sessao valida nao precisa ver a tela de login.
  if (await usuarioDaSessao()) redirect("/painel");

  return (
    <main className="entrar-tela">
      <div className="entrar-caixa">
        <div className="marca">
          <span className="ponto" aria-hidden="true" />
          AmericaSim
        </div>
        <h1>Painel</h1>
        <p className="sub">Acesso restrito à operação.</p>
        <FormEntrar />
        <p className="nota">
          Sessão expira em 12 horas e pode ser revogada a qualquer momento.
        </p>
      </div>
    </main>
  );
}
