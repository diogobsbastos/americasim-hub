import type { ReactNode } from "react";
import Abas from "./Abas";

export const metadata = { title: "Configurações — AmericaSim", robots: { index: false, follow: false } };

// Area unica de configuracoes do sistema, em ABAS (pedido de 02/09).
// Google & E-mail mudou para ca; Zap saiu de Requisicoes para ca.
export default function ConfigLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="pn-cabeca">
        <h1>Configurações</h1>
        <p>
          Credenciais e integrações do sistema, cada uma na sua aba — tudo pela tela, cifrado no banco,
          nada por SSH.
        </p>
      </div>
      <Abas />
      {children}
    </>
  );
}
