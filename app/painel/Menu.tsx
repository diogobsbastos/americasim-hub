"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Ordem de construcao da SPEC/08 §11. O que ainda nao existe aparece marcado
// "em breve" em vez de sumir: o menu tambem serve para você saber o que falta.
//
// Estoque, Fornecedores e Alertas sao areas PROPRIAS, e nao abas escondidas
// dentro do produto. Ele reclamou, com razao, de olhar o menu e concluir que o
// sistema nao existia. Area que a operacao usa todo dia tem que estar no menu.
//
// Estoque casa EXATO: "/painel/estoque" e prefixo de "/painel/estoque/alertas",
// e sem isso os dois itens acenderiam juntos.
//
// Dinheiro e grupo proprio desde 21/08/2026: Conexoes e ONDE A GENTE VENDE,
// Pagamentos e COMO A GENTE RECEBE. Quem entra para resolver dinheiro nao quer
// passar por anuncio.
//
// Vitrines vem antes de Conexoes no grupo Canais: a loja propria se abre todo
// dia para conferir; Conexoes trata dos marketplaces.
//
// Operadoras (26/08/2026): quem PROVISIONA o eSIM sob demanda — China Mobile
// primeiro. Chaves, testes e compra manual por botao; doc da API dentro.
//
// Google & E-mail (01/09/2026): credenciais do Google pela tela — login das
// lojas (OAuth) e o Gmail do robo de requisicoes (senha de app), no cofre.
const AREAS = [
  {
    grupo: "Operação",
    itens: [
      { href: "/painel", rotulo: "Painel", pronto: true, exato: true },
      { href: "/painel/vendas", rotulo: "Vendas", pronto: true, exato: false },
      { href: "/painel/produtos", rotulo: "Produtos", pronto: true, exato: false },
      { href: "/painel/estoque", rotulo: "Estoque", pronto: true, exato: true },
      { href: "/painel/estoque/alertas", rotulo: "Alertas de estoque", pronto: true, exato: false },
      { href: "/painel/fornecedores", rotulo: "Fornecedores", pronto: true, exato: false },
    ],
  },
  {
    grupo: "Dinheiro",
    itens: [
      { href: "/painel/pagamentos", rotulo: "Pagamentos", pronto: true, exato: false },
    ],
  },
  {
    grupo: "Canais",
    itens: [
      { href: "/painel/vitrines", rotulo: "Vitrines", pronto: true, exato: false },
      { href: "/painel/conexoes", rotulo: "Conexões", pronto: true, exato: false },
      { href: "/painel/apis", rotulo: "APIs", pronto: false, exato: false },
    ],
  },
  {
    grupo: "Entrega",
    itens: [{ href: "/painel/operadoras", rotulo: "Operadoras", pronto: true, exato: false }],
  },
  {
    grupo: "Sistema",
    itens: [
      { href: "/painel/google", rotulo: "Google & E-mail", pronto: true, exato: false },
      { href: "/painel/marketing", rotulo: "Marketing", pronto: false, exato: false },
      { href: "/painel/config", rotulo: "Configuração", pronto: false, exato: false },
    ],
  },
];

export default function Menu() {
  const caminho = usePathname();

  return (
    <nav>
      {AREAS.map((a) => (
        <div key={a.grupo}>
          <div className="pn-grupo">{a.grupo}</div>
          {a.itens.map((i) => {
            if (!i.pronto) {
              return (
                <span key={i.href} className="pn-item desligado">
                  {i.rotulo}
                  <span className="breve">em breve</span>
                </span>
              );
            }
            const ativo = i.exato ? caminho === i.href : caminho.startsWith(i.href);
            return (
              <Link key={i.href} href={i.href} className={ativo ? "pn-item ativo" : "pn-item"}>
                {i.rotulo}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
