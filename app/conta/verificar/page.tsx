import Link from "next/link";
import { apiPost } from "../../../lib/vitrine";
import { marcaAtual } from "../../../lib/marcas";
import Logotipo from "../../Logotipo";
import CenaViagem from "../../CenaViagem";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const m = await marcaAtual();
  return { title: `Confirmar e-mail — ${m.nome}`, robots: { index: false, follow: false } };
}

// A tela que o link do e-mail abre. A confirmacao acontece NO SERVIDOR, ao
// carregar: quem chegou aqui com um token assinado valido e o dono da caixa.
// Mesmo cartao sobre a cena de viagem do login — a pessoa reconhece o lugar.
export default async function Verificar({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const marca = await marcaAtual();
  const token = (await searchParams).t ?? "";

  const r = token ? await apiPost("/v1/conta/verificar", { token }) : null;
  const ok = Boolean(r?.ok);
  const mensagem = !token
    ? "Este link está incompleto. Abra o e-mail de confirmação e toque no botão."
    : r?.erro_mensagem ?? "";

  return (
    <main className="entrar-tela entrar-cena">
      <CenaViagem />
      <div className="entrar-caixa">
        <Link href="/" aria-label="Voltar para a loja">
          <Logotipo codigo={marca.codigo} nome={marca.nome} />
        </Link>

        {ok ? (
          <>
            <h1>E-mail confirmado ✓</h1>
            <p className="sub">
              Pronto. Seus pedidos e eSIMs já aparecem na sua conta.
            </p>
            <Link className="botao" href="/conta" style={{ display: "block", textAlign: "center" }}>
              Ver meus eSIMs →
            </Link>
          </>
        ) : (
          <>
            <h1>Não deu para confirmar</h1>
            <p className="sub">{mensagem}</p>
            <p className="fin-dica" style={{ marginBottom: 14 }}>
              Links de confirmação valem por 3 dias. Entre na sua conta e peça um novo —
              leva um clique.
            </p>
            <Link className="botao" href="/conta" style={{ display: "block", textAlign: "center" }}>
              Ir para minha conta →
            </Link>
          </>
        )}

        <p className="nota caixa-pe">
          <Link href="/">← Voltar para a loja</Link>
        </p>
      </div>
    </main>
  );
}
