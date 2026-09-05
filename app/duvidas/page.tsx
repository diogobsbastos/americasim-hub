import Link from "next/link";
import { marcaAtual } from "../../lib/marcas";
import CabLoja from "../CabLoja";
import Rodape from "../Rodape";
import { IcoAviao, IcoCadeado, IcoCelular, IcoFerramenta, IcoIlimitado, IcoLivro, IcoQr, IcoRede } from "../Icones";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const m = await marcaAtual();
  return {
    title: `Dúvidas — ${m.nome}`,
    robots: { index: false, follow: false },
  };
}

// Central de duvidas no estilo hub (referencia estrutural: FAQ da Holafly):
// hero de acolhimento -> cartoes de categoria com icone -> acordeoes por
// categoria -> "ainda tem duvidas" -> CTA final. CONTEUDO nosso, escrito para
// o NOSSO produto (QR por e-mail, ativacao no destino, Stripe, reembolso).
// Uma pagina so, com ancoras: seis paginas separadas seria manutencao em dobro
// para o mesmo cliente perdido.

interface Categoria {
  id: string;
  titulo: string;
  sub: string;
  icone: React.ReactNode;
  perguntas: { q: string; a: React.ReactNode }[];
}

function categorias(nome: string): Categoria[] {
  return [
    {
      id: "sobre",
      titulo: "Sobre o eSIM",
      sub: "O que é o chip digital e por que ele resolve a sua viagem.",
      icone: <IcoLivro />,
      perguntas: [
        {
          q: "O que é um eSIM?",
          a: (
            <>É um chip 100% digital, embutido no seu celular. Em vez de encaixar um chip
            físico, você escaneia um QR code e a linha de dados é instalada no aparelho — em
            minutos, sem loja, sem sedex, sem trocar o chip da sua operadora.</>
          ),
        },
        {
          q: "O eSIM substitui o meu chip atual?",
          a: (
            <>Não. Ele convive com o seu chip: o celular fica com as duas linhas ao mesmo
            tempo. Seu número continua ativo para ligações e SMS, e o eSIM da {nome} cuida
            só da internet no exterior.</>
          ),
        },
        {
          q: "Continuo recebendo WhatsApp no meu número de sempre?",
          a: (
            <>Sim. O WhatsApp (e qualquer app) continua ligado ao seu número brasileiro.
            Nada muda — só a conta de roaming, que deixa de existir.</>
          ),
        },
        {
          q: "Qual a diferença para o roaming da minha operadora?",
          a: (
            <>Preço fechado antes de embarcar, velocidade plena na rede local e zero
            surpresa na fatura. Roaming tradicional costuma cobrar por dia, reduzir a
            velocidade e só mostrar o estrago na conta seguinte.</>
          ),
        },
      ],
    },
    {
      id: "compatibilidade",
      titulo: "Compatibilidade",
      sub: "Confira se o seu celular aceita eSIM antes de comprar.",
      icone: <IcoCelular />,
      perguntas: [
        {
          q: "Meu celular é compatível?",
          a: (
            <>A regra prática: iPhone XR ou mais novo, e Android intermediário/topo de
            linha lançado de 2019 em diante (Samsung Galaxy S20+, Pixel 3+, Motorola Edge,
            entre outros). O aparelho precisa estar <b>desbloqueado</b> pela operadora.</>
          ),
        },
        {
          q: "Como testo no meu aparelho em 10 segundos?",
          a: (
            <>iPhone: Ajustes → Celular → se aparecer &quot;Adicionar eSIM&quot;, é compatível.
            Android: Configurações → Rede e internet → SIMs → se aparecer &quot;Baixar novo
            chip&quot; ou &quot;Adicionar eSIM&quot;, é compatível. Outra via: disque{" "}
            <code>*#06#</code> — se aparecer um EID, o aparelho tem eSIM.</>
          ),
        },
        {
          q: "Comprei e meu aparelho não é compatível. E agora?",
          a: (
            <>Reembolso. Aparelho incompatível ou bloqueado tem devolução — fale com a
            gente respondendo o e-mail do pedido.</>
          ),
        },
      ],
    },
    {
      id: "instalar",
      titulo: "Instalar e ativar",
      sub: "Do QR no e-mail à internet funcionando no destino.",
      icone: <IcoQr />,
      perguntas: [
        {
          q: "Quando devo instalar o eSIM?",
          a: (
            <>Antes de viajar, com Wi-Fi e calma — de preferência um ou dois dias antes do
            embarque. Instalar não gasta o plano: <b>a validade só começa a contar quando
            você ativa no destino</b>.</>
          ),
        },
        {
          q: "Como instalo?",
          a: (
            <>Na página do seu pedido tem o guia passo a passo por aparelho. Resumo —
            iPhone: Ajustes → Celular → Adicionar eSIM → escanear o QR (no iOS 17.4+ o
            botão &quot;Instalar no iPhone&quot; faz tudo sozinho). Android: Configurações → Rede e
            internet → SIMs → Baixar novo chip → escanear o QR. Se estiver no mesmo
            aparelho do e-mail, use o código copiável em vez da câmera.</>
          ),
        },
        {
          q: "E como ativo quando chegar?",
          a: (
            <>Ative a linha do eSIM e ligue o <b>roaming de dados</b> para ela (só para
            ela). O aparelho conecta sozinho na melhor rede local. É nesse momento que o
            plano começa a contar.</>
          ),
        },
        {
          q: "Instalei e apaguei sem querer. O QR funciona de novo?",
          a: (
            <>Não — o QR é de uso único, é assim que o padrão eSIM funciona no mundo
            inteiro. Por isso o aviso grande de &quot;não apague&quot;. Se aconteceu, fale com o
            suporte que a gente resolve caso a caso.</>
          ),
        },
      ],
    },
    {
      id: "uso",
      titulo: "Uso na viagem",
      sub: "Dados, hotspot e o dia a dia com o eSIM ligado.",
      icone: <IcoIlimitado />,
      perguntas: [
        {
          q: "Posso compartilhar internet com outras pessoas (hotspot)?",
          a: (
            <>Pode: o eSIM aceita roteamento pessoal. Lembre que quem compartilha consome o
            plano mais rápido — em viagem em grupo, um eSIM por pessoa sai melhor.</>
          ),
        },
        {
          q: "Como acompanho o consumo?",
          a: (
            <>No próprio aparelho (Ajustes/Configurações → dados móveis mostram o uso por
            linha) e pela página do seu pedido, que exibe o status do eSIM. Painel de
            consumo detalhado está a caminho.</>
          ),
        },
        {
          q: "O plano acabou no meio da viagem. E agora?",
          a: (
            <>Abra a página do pedido e toque em &quot;Comprar outro eSIM&quot; — sai um novo QR na
            hora, no mesmo e-mail. Em minutos você está de volta.</>
          ),
        },
        {
          q: "O eSIM serve para ligações e SMS?",
          a: (
            <>Nossos planos são de <b>dados</b>. Ligações funcionam por WhatsApp, FaceTime
            e afins — do seu número de sempre, que continua ativo no seu chip físico.</>
          ),
        },
      ],
    },
    {
      id: "problemas",
      titulo: "Problemas e soluções",
      sub: "Sem conexão? QR não lê? Começa por aqui.",
      icone: <IcoFerramenta />,
      perguntas: [
        {
          q: "Cheguei e não conectou. O que faço?",
          a: (
            <>Na ordem: 1) confira se a linha do eSIM está ativa; 2) ligue o roaming de
            dados PARA a linha do eSIM; 3) marque o eSIM como linha de dados padrão;
            4) reinicie o aparelho; 5) em Ajustes → seleção de rede, tente escolher uma
            operadora manualmente. Se não resolver em 5 minutos, chama a gente — resolve
            junto, em português.</>
          ),
        },
        {
          q: "A câmera não lê o QR code.",
          a: (
            <>Aumente o brilho da tela onde o QR está, afaste uns 20 cm e tente de novo.
            Se estiver tudo no mesmo aparelho, nem precisa de câmera: use o código
            copiável da página do pedido em &quot;inserir manualmente&quot;.</>
          ),
        },
        {
          q: "Apareceu “código não é mais válido”.",
          a: (
            <>Esse aviso quer dizer que o eSIM já foi instalado uma vez (o QR é de uso
            único). Se o eSIM está no seu aparelho, é só ativar a linha. Se você apagou ou
            trocou de aparelho, fale com o suporte.</>
          ),
        },
      ],
    },
    {
      id: "pagamento",
      titulo: "Pagamento e reembolso",
      sub: "Como você paga, o que aparece na fatura e como devolvemos.",
      icone: <IcoCadeado />,
      perguntas: [
        {
          q: "Como funciona o pagamento?",
          a: (
            <>Cartão de crédito, em reais, num checkout seguro processado pela Stripe —
            uma das maiores plataformas de pagamento do mundo. Nós não vemos nem guardamos
            os dados do seu cartão.</>
          ),
        },
        {
          q: "Quando recebo o eSIM depois de pagar?",
          a: (
            <>Na hora. O QR chega no seu e-mail em segundos, junto com o link da página do
            pedido — que é o seu acesso permanente ao eSIM, ao status e ao guia de
            instalação.</>
          ),
        },
        {
          q: "Qual é a política de reembolso?",
          a: (
            <>Devolvemos o valor quando: o aparelho é incompatível ou bloqueado; o eSIM
            não foi instalado e você desistiu da viagem; ou houve falha nossa de conexão
            que o suporte não conseguiu resolver. Basta responder o e-mail do pedido.</>
          ),
        },
      ],
    },
  ];
}

export default async function Duvidas() {
  const marca = await marcaAtual();
  const cats = categorias(marca.nome);

  return (
    <main className="wrap">
      <CabLoja codigo={marca.codigo} nome={marca.nome} atual="duvidas" />

      <section className="topo-duvidas">
        <div className="beira">Central de dúvidas</div>
        <p className="chamada" style={{ margin: "10px 0 8px" }}>
          Como podemos <em>ajudar?</em>
        </p>
        <p className="sub2">
          Tudo o que você precisa saber sobre o seu eSIM — da compra à ativação no destino.
          E quando a dúvida for sua mesmo, tem gente de verdade do outro lado.
        </p>
      </section>

      {/* Cartoes de categoria (ancoras) */}
      <div className="cat-grade" role="navigation" aria-label="categorias de dúvidas">
        {cats.map((c) => (
          <a key={c.id} className="cat-cartao" href={`#${c.id}`}>
            <span className="cat-ico">{c.icone}</span>
            <b>{c.titulo}</b>
            <p>{c.sub}</p>
          </a>
        ))}
      </div>

      {/* Acordeoes por categoria */}
      {cats.map((c) => (
        <section key={c.id} id={c.id} className="faq" aria-label={c.titulo}>
          <h2>
            <span className="cat-ico cat-ico-titulo">{c.icone}</span> {c.titulo}
          </h2>
          {c.perguntas.map((p) => (
            <details key={p.q}>
              <summary>{p.q}</summary>
              <p>{p.a}</p>
            </details>
          ))}
        </section>
      ))}

      <section className="ainda-duvida">
        <div>
          <h2 style={{ margin: "0 0 6px", fontSize: "1.2rem" }}>Ainda tem dúvidas?</h2>
          <p style={{ margin: 0, color: "var(--texto-fraco)" }}>
            Atendimento humano, em português. Responda o e-mail do seu pedido ou chame a
            gente que resolvemos junto.
          </p>
        </div>
        <Link className="botao" href="/#planos">Tudo pronto? Pegar meu eSIM →</Link>
      </section>

      <Rodape />
    </main>
  );
}
