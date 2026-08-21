"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Subabas da area Pagamentos. O que ainda nao existe aparece marcado "em breve"
// em vez de sumir — mesmo criterio do menu principal: a navegacao tambem serve
// para saber o que falta.
const ABAS = [
  { href: "/painel/pagamentos/conta", rotulo: "Conta", pronto: true },
  { href: "/painel/pagamentos/dominios", rotulo: "Domínios", pronto: true },
  { href: "/painel/pagamentos/comissao", rotulo: "Comissão", pronto: true },
  { href: "/painel/pagamentos/carteiras", rotulo: "Carteiras", pronto: false },
  { href: "/painel/pagamentos/eventos", rotulo: "Eventos", pronto: false },
];

export default function Abas() {
  const caminho = usePathname();

  return (
    <div
      style={{
        display: "flex", gap: 4, flexWrap: "wrap",
        borderBottom: "1px solid var(--borda)", marginBottom: 18,
      }}
    >
      {ABAS.map((a) => {
        if (!a.pronto) {
          return (
            <span
              key={a.href}
              style={{
                padding: "8px 14px", fontSize: "0.9rem",
                color: "var(--texto-fraco)", opacity: 0.5, cursor: "default",
              }}
            >
              {a.rotulo}
              <span style={{ fontSize: "0.66rem", marginLeft: 6, textTransform: "uppercase" }}>
                em breve
              </span>
            </span>
          );
        }
        const ativo = caminho.startsWith(a.href);
        return (
          <Link
            key={a.href}
            href={a.href}
            style={{
              padding: "8px 14px", fontSize: "0.9rem", textDecoration: "none",
              color: ativo ? "var(--texto)" : "var(--texto-fraco)",
              fontWeight: ativo ? 700 : 500,
              borderBottom: ativo ? "2px solid var(--marca)" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {a.rotulo}
          </Link>
        );
      })}
    </div>
  );
}
