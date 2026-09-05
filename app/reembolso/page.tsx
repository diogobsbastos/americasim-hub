import Link from "next/link";
import { marcaAtual } from "../../lib/marcas";
import CabLoja from "../CabLoja";
import Rodape from "../Rodape";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const m = await marcaAtual();
  return { title: `Política de reembolso — ${m.nome}` };
}

// A mesma politica que ja comunicamos na loja e na Central de duvidas, agora
// em pagina propria (v1, 05/09/2026) — passar por revisao juridica antes do
// lancamento comercial.
export default async function Reembolso() {
  const marca = await marcaAtual();
  return (
    <main className="wrap">
      <CabLoja codigo={marca.codigo} nome={marca.nome} />

      <article className="legal">
        <h1>Política de reembolso</h1>
        <p className="nota">Última atualização: 5 de setembro de 2026</p>

        <h2>Quando devolvemos o valor integral</h2>
        <p>
          1) <b>Aparelho incompatível ou bloqueado</b>: você comprou e descobriu que o
          celular não aceita eSIM. 2) <b>Desistência com eSIM não instalado</b>: mudou o
          plano de viagem e o QR ainda não foi usado (o direito de arrependimento de 7 dias
          do CDC também se aplica, desde que o eSIM não tenha sido instalado). 3){" "}
          <b>Falha nossa</b>: o eSIM não funcionou por problema do nosso serviço e o
          suporte não conseguiu resolver com você.
        </p>

        <h2>Quando o reembolso pode ser parcial ou não se aplicar</h2>
        <p>
          eSIM instalado é produto entregue e de uso único — por isso a desistência após a
          instalação, o consumo do plano e problemas causados por configuração do aparelho
          que o suporte não teve a chance de resolver são avaliados caso a caso. Cobertura
          e velocidade variam pela rede local e não são, por si só, motivo de reembolso —
          mas fale com a gente: analisamos cada situação.
        </p>

        <h2>Como pedir</h2>
        <p>
          Responda o e-mail do seu pedido dizendo o que aconteceu. O suporte confirma os
          dados, tenta resolver o problema junto com você e, cabendo o reembolso, ele é
          feito no mesmo meio de pagamento da compra. Prazo de resposta: até 1 dia útil.
        </p>

        <h2>Dúvidas antes de comprar?</h2>
        <p>
          A <Link href="/duvidas#compatibilidade">verificação de compatibilidade</Link>{" "}
          leva 10 segundos e evita a maior causa de reembolso.
        </p>
      </article>

      <Rodape />
    </main>
  );
}
