import Link from "next/link";
import { marcaAtual } from "../../../lib/marcas";
import FormEntrar from "../FormEntrar";
import { googleConfigurado } from "../../../lib/google";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const m = await marcaAtual();
  return { title: `Entrar — ${m.nome}`, robots: { index: false, follow: false } };
}

export default async function Entrar({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const marca = await marcaAtual();
  const sp = await searchParams;
  // O botao so aparece quando o Google esta configurado no servidor — melhor
  // nao existir do que existir quebrado.
  const temGoogle = await googleConfigurado();
  const aviso = sp.erro === "google" ? "Nao foi possivel entrar com o Google. Tente de novo ou use e-mail e senha." : "";

  return (
    <main className="wrap">
      <header className="topo">
        <div className="marca">
          <span className="ponto" aria-hidden="true" />
          {marca.nome}
        </div>
      </header>

      <section className="produto">
        <h1>Entrar na sua conta</h1>
        <p className="nota">Veja todos os seus pedidos e eSIMs num lugar so.</p>
        <FormEntrar temGoogle={temGoogle} avisoInicial={aviso} />
        <p className="nota">
          <Link href="/">Voltar para a loja</Link>
        </p>
      </section>
    </main>
  );
}
