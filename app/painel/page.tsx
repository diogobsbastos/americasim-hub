export const metadata = {
  title: "Painel — AmericaSim",
  robots: { index: false, follow: false },
};

// Endereco reservado para o backoffice do AmericaSim (SPEC/08: oito telas).
// Nao confundir com /admin/, que e o painel da VPS e cuida da maquina, nao do negocio.
export default function Painel() {
  return (
    <main className="wrap">
      <div className="aviso">
        <h1>Painel do AmericaSim</h1>
        <p>
          Endereco reservado para o backoffice: produtos, precos, estoque de eSIM, pedidos,
          canais e chaves de API. Ainda nao construido.
        </p>
        <p className="nota">
          Hoje essas configuracoes so existem no banco e mudam por SQL. Enquanto esta tela
          nao existir, este endereco deve ficar fechado por allowlist ou senha no Nginx.
        </p>
      </div>
    </main>
  );
}
