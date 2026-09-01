import { ondeEstaOSegredo } from "../../../lib/segredo-app";
import {
  SEG_GMAIL_SENHA, SEG_GMAIL_USUARIO, SEG_GOOGLE_ID, SEG_GOOGLE_SECRET,
} from "../../../lib/google";
import { usuarioDaSessao } from "../../../lib/painel/sessao";
import CartaoGoogle from "./CartaoGoogle";

export const dynamic = "force-dynamic";

export const metadata = { title: "Google & E-mail — AmericaSim", robots: { index: false, follow: false } };

// Credenciais do Google pela TELA, nunca por SSH (mesma regra das Operadoras):
// login das lojas (OAuth) e Gmail do robo (senha de app), cifrados no cofre.
export default async function GoogleEEmail() {
  const u = await usuarioDaSessao();
  const podeAdmin = u?.papel === "admin";

  const [ondeId, ondeSecret, ondeUsuario, ondeSenha] = await Promise.all([
    ondeEstaOSegredo(SEG_GOOGLE_ID),
    ondeEstaOSegredo(SEG_GOOGLE_SECRET),
    ondeEstaOSegredo(SEG_GMAIL_USUARIO),
    ondeEstaOSegredo(SEG_GMAIL_SENHA),
  ]);

  return (
    <>
      <div className="pn-cabeca">
        <h1>Google &amp; E-mail</h1>
        <p>
          As credenciais do Google num lugar só: o botão &quot;Entrar com Google&quot; das lojas e a conta
          Gmail que o robô usa para requisitar ICCIDs e ler as respostas. Tudo cifrado no banco;
          valor nunca aparece de volta na tela.
        </p>
      </div>

      <CartaoGoogle
        ondeId={ondeId}
        ondeSecret={ondeSecret}
        ondeUsuario={ondeUsuario}
        ondeSenha={ondeSenha}
        podeAdmin={!!podeAdmin}
      />
    </>
  );
}
