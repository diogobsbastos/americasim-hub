"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Ordem de construcao da SPEC/08 §11. O que ainda nao existe aparece marcado
// "em breve" em vez de sumir: o menu tambem serve para você saber o que falta.
//
// Estoque e area PROPRIA, e nao so uma aba dentro de cada produto. Enquanto ha
// um produto so, esconder o estoque la dentro parece organizado; com dez
// fornecedores e trinta variantes, ninguem entra produto por produto para
// descobrir o que esta acabando.
//
// Fornecedores segue a mesma regra e pelo mesmo motivo (22/08/2026): ele
// reclamou de olhar o menu e concluir que o sistema nao existia. Area que a
// operacao usa todo dia tem que estar no menu.
//
// Dinheiro e grupo proprio desde 21/08/2026. Pagamentos estava dentro de
// Conexoes porque as duas sao "ligacoes com o mundo" — mas para quem opera sao
// coisas diferentes: Conexoes e ONDE A GENTE VENDE, Pagamentos e COMO A GENTE
// RECEBE.
//
// Vitrines vem ANTES de Conexoes no grupo Canais: a loja propria e o canal que
// se abre todo dia para conferir; Conexoes trata dos marketplaces.
const AREAS = [
  {
    grupo: "Operação",
    itens: [
      { href: "/painel", rotulo: "Painel", pronto: true, exato: true },
      { href: "/painel/vendas", rotulo: "Vendas", pronto: true, exato: false },
      { href: "/painel/produtos", rotulo: "Produtos", pronto: true, exato: false },
      { href: "/painel/estoque", rotulo: "Estoque", pronto: true, exato: false },
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
    itens: [{ href: "/painel/operadoras", rotulo: "Operadoras", pronto: false, exato: false }],
  },
  {
    grupo: "Sistema",
    itens: [
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
