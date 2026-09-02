import { lerSegredoApp, ondeEstaOSegredo } from "../../../../lib/segredo-app";
import {
  SEG_GMAIL_SENHA, SEG_GMAIL_USUARIO, SEG_GOOGLE_ID, SEG_GOOGLE_SECRET,
} from "../../../../lib/google";
import { usuarioDaSessao } from "../../../../lib/painel/sessao";
import CartaoGoogle from "../../google/CartaoGoogle";

export const dynamic = "force-dynamic";

export const metadata = { title: "Configurações · Google & E-mail — AmericaSim", robots: { index: false, follow: false } };

// Aba Google & E-mail (mudou de /painel/google em 02/09; os componentes
// continuam na pasta antiga, so o endereco e a moldura de abas mudaram).
// Credenciais pela TELA, nunca por SSH: login das lojas (OAuth) e Gmail do
// robo (senha de app), cifrados no cofre.
export default async function ConfigGoogle() {
  const u = await usuarioDaSessao();
  const podeAdmin = u?.papel === "admin";

  const [ondeId, ondeSecret, ondeUsuario, ondeSenha, valorId, valorUsuario] = await Promise.all([
    ondeEstaOSegredo(SEG_GOOGLE_ID),
    ondeEstaOSegredo(SEG_GOOGLE_SECRET),
    ondeEstaOSegredo(SEG_GMAIL_USUARIO),
    ondeEstaOSegredo(SEG_GMAIL_SENHA),
    // Client ID e usuario NAO sao segredos: a tela mostra o valor gravado.
    // Secret e senha de app continuam write-only (so status).
    lerSegredoApp(SEG_GOOGLE_ID),
    lerSegredoApp(SEG_GMAIL_USUARIO),
  ]);

  return (
    <>
      <p className="nota" style={{ marginTop: 0 }}>
        O botão &quot;Entrar com Google&quot; das lojas e a conta Gmail que o robô usa para requisitar
        ICCIDs e ler as respostas. Tudo cifrado no banco; valor nunca aparece de volta na tela.
      </p>
      <CartaoGoogle
        ondeId={ondeId}
        ondeSecret={ondeSecret}
        ondeUsuario={ondeUsuario}
        ondeSenha={ondeSenha}
        valorId={valorId}
        valorUsuario={valorUsuario}
        podeAdmin={!!podeAdmin}
      />
    </>
  );
}
