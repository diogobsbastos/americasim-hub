"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Recarrega os dados da pagina sozinho enquanto o pedido ainda esta andando
// (preparando ou esperando instalacao). Substitui o "guarde o link e recarregue"
// por uma tela viva — sem WebSocket, so um refresh de servidor de tempos em
// tempos, que para de existir quando tudo termina (o componente nem e montado).
export default function AtualizaSozinho({ aCadaMs }: { aCadaMs: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), Math.max(aCadaMs, 10_000));
    return () => clearInterval(id);
  }, [router, aCadaMs]);

  return null;
}
