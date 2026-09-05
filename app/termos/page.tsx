import Link from "next/link";
import { marcaAtual } from "../../lib/marcas";
import Logotipo from "../Logotipo";
import Rodape from "../Rodape";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const m = await marcaAtual();
  return { title: `Termos de uso — ${m.nome}` };
}

// Texto redigido internamente (v1, 05/09/2026) — passar por revisao juridica
// antes do lancamento comercial. Linguagem simples de proposito: termo que o
// cliente entende e termo que gera menos disputa.
export default async function Termos() {
  const marca = await marcaAtual();
  return (
    <main className="wrap">
      <header className="cab">
        <Link href="/" aria-label="Voltar para a loja" style={{ display: "inline-flex" }}>
          <Logotipo codigo={marca.codigo} nome={marca.nome} />
        </Link>
      </header>

      <article className="legal">
        <h1>Termos de uso</h1>
        <p className="nota">Última atualização: 5 de setembro de 2026</p>

        <h2>1. O que oferecemos</h2>
        <p>
          A {marca.nome} vende planos de dados em eSIM (chip digital) para uso em viagens.
          O produto é entregue eletronicamente: após a confirmação do pagamento, você
          recebe por e-mail um QR code de instalação e um link de acompanhamento do pedido.
        </p>

        <h2>2. Compatibilidade é sua responsabilidade — com a nossa ajuda</h2>
        <p>
          O eSIM exige aparelho compatível e desbloqueado. Publicamos guias de verificação
          na <Link href="/duvidas#compatibilidade">Central de dúvidas</Link> e, em caso de
          incompatibilidade, aplicamos a <Link href="/reembolso">Política de reembolso</Link>.
        </p>

        <h2>3. Entrega e ativação</h2>
        <p>
          A entrega acontece por e-mail, em regra minutos após o pagamento. O QR code é de
          uso único, conforme o padrão internacional do eSIM. A validade do plano começa a
          contar na ativação da linha no destino, e não na compra ou na instalação.
        </p>

        <h2>4. Uso adequado</h2>
        <p>
          Os planos destinam-se a uso pessoal e legítimo em viagem. Não é permitido
          revender, usar para fins ilícitos ou explorar falhas do serviço. Podemos suspender
          eSIMs em caso de fraude confirmada.
        </p>

        <h2>5. Pagamento</h2>
        <p>
          Os pagamentos são processados pela Stripe. Não armazenamos os dados do seu
          cartão. Os preços exibidos incluem os tributos aplicáveis e são cobrados em
          reais, salvo indicação em contrário na página do plano.
        </p>

        <h2>6. Suporte</h2>
        <p>
          Atendemos em português, todos os dias. O canal oficial é a resposta ao e-mail do
          pedido — e a <Link href="/duvidas">Central de dúvidas</Link> resolve os casos mais
          comuns na hora.
        </p>

        <h2>7. Limites de responsabilidade</h2>
        <p>
          Dependemos das redes das operadoras locais parceiras: velocidade e cobertura
          variam por região e não são garantidas em local específico. Nossa
          responsabilidade limita-se ao valor pago pelo plano, aplicando-se o Código de
          Defesa do Consumidor.
        </p>

        <h2>8. Mudanças nestes termos</h2>
        <p>
          Podemos atualizar estes termos; a versão vigente é sempre a publicada nesta
          página, com a data acima. Compras já realizadas seguem os termos da data da
          compra.
        </p>
      </article>

      <Rodape />
    </main>
  );
}
