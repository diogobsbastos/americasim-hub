import Link from "next/link";
import { marcaAtual } from "../../../lib/marcas";
import FormCriar from "../FormCriar";
import Logotipo from "../../Logotipo";
import CenaViagem from "../../CenaViagem";
import { googleConfigurado } from "../../../lib/google";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const m = await marcaAtual();
  return { title: `Criar conta — ${m.nome}`, robots: { index: false, follow: false } };
}

// Mesmo padrao de cartao centralizado do /conta/entrar (guia de identidade).
export default async function Criar() {
  const marca = await marcaAtual();
  const temGoogle = await googleConfigurado();

  return (
    <main className="entrar-tela entrar-cena">
      <CenaViagem />
      <div className="entrar-caixa">
        <Link href="/" aria-label="Voltar para a loja">
          <Logotipo codigo={marca.codigo} nome={marca.nome} />
        </Link>
        <h1>Criar conta</h1>
        <p className="sub">
          Use o mesmo e-mail das suas compras: é ele que liga a conta aos seus pedidos.
        </p>
        <FormCriar temGoogle={temGoogle} />
        <p className="nota caixa-pe">
          <Link href="/">← Voltar para a loja</Link>
        </p>
      </div>
    </main>
  );
}
