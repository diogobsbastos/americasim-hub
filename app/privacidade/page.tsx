import Link from "next/link";
import { marcaAtual } from "../../lib/marcas";
import CabLoja from "../CabLoja";
import Rodape from "../Rodape";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const m = await marcaAtual();
  return { title: `Política de privacidade — ${m.nome}` };
}

// Texto redigido internamente (v1, 05/09/2026), orientado pela LGPD — passar
// por revisao juridica antes do lancamento comercial.
export default async function Privacidade() {
  const marca = await marcaAtual();
  return (
    <main className="wrap">
      <CabLoja codigo={marca.codigo} nome={marca.nome} />

      <article className="legal">
        <h1>Política de privacidade</h1>
        <p className="nota">Última atualização: 5 de setembro de 2026</p>

        <h2>1. O que coletamos</h2>
        <p>
          Para entregar o eSIM: seu e-mail (entrega e acesso ao pedido), nome e telefone/
          WhatsApp (atendimento), e os dados do pedido. O pagamento é processado pela
          Stripe — número de cartão não passa pelos nossos servidores.
        </p>

        <h2>2. Para que usamos</h2>
        <p>
          Entregar o produto, dar suporte, cumprir obrigações fiscais e melhorar o
          serviço. Comunicação de ofertas só com o seu consentimento, com descadastro em
          um clique.
        </p>

        <h2>3. Com quem compartilhamos</h2>
        <p>
          Somente com quem é necessário para o serviço funcionar: o processador de
          pagamento (Stripe), o provedor de conectividade que emite o eSIM e provedores de
          infraestrutura (hospedagem, e-mail). Não vendemos seus dados.
        </p>

        <h2>4. Por quanto tempo guardamos</h2>
        <p>
          Dados de pedido ficam pelo prazo exigido por lei (fiscal e de consumo). Dados de
          conta você pode excluir quando quiser, pelos nossos canais de atendimento.
        </p>

        <h2>5. Seus direitos (LGPD)</h2>
        <p>
          Confirmação de tratamento, acesso, correção, exclusão, portabilidade e revogação
          de consentimento — é pedir pelo e-mail do pedido que atendemos nos prazos da
          Lei 13.709/2018.
        </p>

        <h2>6. Segurança</h2>
        <p>
          Códigos de eSIM são armazenados cifrados; o acesso ao seu pedido exige o link
          assinado que só você recebe; a revelação do QR exige a confirmação do e-mail da
          compra.
        </p>

        <h2>7. Cookies</h2>
        <p>
          Usamos apenas cookies essenciais (sessão da conta). Se um dia adotarmos cookies
          de análise ou marketing, você verá o aviso de consentimento antes.
        </p>

        <h2>8. Contato</h2>
        <p>
          Dúvidas sobre privacidade: responda o e-mail do seu pedido ou use os canais da{" "}
          <Link href="/duvidas">Central de dúvidas</Link>.
        </p>
      </article>

      <Rodape />
    </main>
  );
}
