import Link from "next/link";
import { marcaAtual } from "../../../lib/marcas";
import FormEntrar from "../FormEntrar";
import Logotipo from "../../Logotipo";
import CenaViagem from "../../CenaViagem";
import { googleConfigurado } from "../../../lib/google";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const m = await marcaAtual();
  return { title: `Entrar — ${m.nome}`, robots: { index: false, follow: false } };
}

// Padrao de login do guia de identidade (05/09): cartao centralizado com o
// logo oficial, CTA crimson unico (Entrar) e Google como caminho SECUNDARIO
// (botao claro com borda) — nunca dois botoes crimson na mesma tela.
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
    <main className="entrar-tela entrar-cena">
      <CenaViagem />
      <div className="entrar-caixa">
        <Link href="/" aria-label="Voltar para a loja">
          <Logotipo codigo={marca.codigo} nome={marca.nome} />
        </Link>
        <h1>Entrar na sua conta</h1>
        <p className="sub">Veja todos os seus pedidos e eSIMs num lugar só.</p>
        <FormEntrar temGoogle={temGoogle} avisoInicial={aviso} />
        <p className="nota caixa-pe">
          <Link href="/">← Voltar para a loja</Link>
        </p>
      </div>
    </main>
  );
}
