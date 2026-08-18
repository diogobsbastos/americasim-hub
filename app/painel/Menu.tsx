"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Ordem de construcao da SPEC/08 §11. O que ainda nao existe aparece marcado
// "em breve" em vez de sumir: o menu tambem serve para você saber o que falta.
const AREAS = [
  {
    grupo: "Operação",
    itens: [
      { href: "/painel", rotulo: "Painel", pronto: true, exato: true },
      { href: "/painel/vendas", rotulo: "Vendas", pronto: true, exato: false },
      { href: "/painel/produtos", rotulo: "Produtos", pronto: false, exato: false },
    ],
  },
  {
    grupo: "Canais",
    itens: [
      { href: "/painel/conexoes", rotulo: "Conexões", pronto: false, exato: false },
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
