import Link from "next/link";
import { marcaAtual } from "../../../lib/marcas";
import FormCriar from "../FormCriar";
import { googleConfigurado } from "../../../lib/google";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const m = await marcaAtual();
  return { title: `Criar conta — ${m.nome}`, robots: { index: false, follow: false } };
}

export default async function Criar() {
  const marca = await marcaAtual();
  const temGoogle = await googleConfigurado();

  return (
    <main className="wrap">
      <header className="topo">
        <div className="marca">
          <span className="ponto" aria-hidden="true" />
          {marca.nome}
        </div>
      </header>

      <section className="produto">
        <h1>Criar conta</h1>
        <p className="nota">
          Use o mesmo e-mail das suas compras: e ele que liga a conta aos seus pedidos.
        </p>
        <FormCriar temGoogle={temGoogle} />
        <p className="nota">
          <Link href="/">Voltar para a loja</Link>
        </p>
      </section>
    </main>
  );
}
