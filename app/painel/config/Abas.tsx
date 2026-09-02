"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Abas da area Configuracoes (pedido de 02/09: "Configurações < ABAS de
// configurações"). Integracao nova de sistema = aba nova aqui.
const ABAS = [
  { href: "/painel/config/google", rotulo: "Google & E-mail" },
  { href: "/painel/config/zap", rotulo: "Zap (WhatsApp)" },
];

export default function Abas() {
  const caminho = usePathname();
  return (
    <div style={{ display: "flex", gap: 6, borderBottom: "1px solid var(--borda)", margin: "0 0 18px", flexWrap: "wrap" }}>
      {ABAS.map((a) => {
        const ativo = caminho.startsWith(a.href);
        return (
          <Link
            key={a.href}
            href={a.href}
            style={{
              padding: "8px 14px",
              fontSize: "0.9rem",
              textDecoration: "none",
              color: ativo ? "inherit" : "var(--texto-fraco)",
              borderBottom: ativo ? "2px solid currentColor" : "2px solid transparent",
              fontWeight: ativo ? 600 : 400,
            }}
          >
            {a.rotulo}
          </Link>
        );
      })}
    </div>
  );
}
