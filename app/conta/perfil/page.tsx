import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiPost } from "../../../lib/vitrine";
import { COOKIE_SESSAO } from "../../../lib/conta";
import { marcaAtual } from "../../../lib/marcas";
import ShellCliente from "../../ShellCliente";
import FormPerfil from "./FormPerfil";
import FormSenha from "./FormSenha";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const m = await marcaAtual();
  return { title: `Meu perfil — ${m.nome}`, robots: { index: false, follow: false } };
}

// MEU PERFIL, dentro do shell do cliente: dois cartoes — dados de contato
// (nome + WhatsApp; e-mail travado) e senha (trocar, ou CRIAR quando a conta
// nasceu pelo Google e nao tem nenhuma).
export default async function MeuPerfil() {
  const marca = await marcaAtual();
  const c = await cookies();
  const sessao = c.get(COOKIE_SESSAO)?.value ?? "";
  if (!sessao) redirect("/conta/entrar");

  const r = await apiPost("/v1/conta/perfil", { sessao });
  if (!r.ok) {
    if (r.erro_codigo === "sessao_invalida") redirect("/conta/entrar");
    return (
      <ShellCliente codigo={marca.codigo} nome={marca.nome} temBackend={false} logado ativo="perfil">
        <h1 className="ct-ola">Não deu para carregar seu perfil</h1>
        <p className="nota">{r.erro_mensagem}</p>
        <p style={{ marginTop: 16 }}>
          <a className="botao secundario" href="/conta/perfil">Tentar de novo</a>
        </p>
      </ShellCliente>
    );
  }

  const email = String(r.dados?.email ?? "");
  const nome = String(r.dados?.nome ?? "");
  const telefone = String(r.dados?.telefone ?? "");
  const temSenha = r.dados?.tem_senha === true;
  const temBackend = r.dados?.backend === true;
  const ola = nome.trim() ? nome.trim().split(" ")[0] : "";

  return (
    <ShellCliente codigo={marca.codigo} nome={marca.nome} temBackend={temBackend} logado ativo="perfil">
      <h1 className="ct-ola">Meu perfil</h1>
      <p className="ct-quem">{ola ? `${ola} · ` : ""}{email}</p>

      <div className="perfil-grade">
        <section className="ct-cartao perfil-cartao" aria-label="dados de contato">
          <h2>Dados de contato</h2>
          <p className="perfil-sub">
            Seu nome aparece na área do cliente; o WhatsApp é o canal do nosso suporte.
          </p>
          <FormPerfil email={email} nome={nome} telefone={telefone} />
        </section>

        <section className="ct-cartao perfil-cartao" aria-label="senha">
          <h2>{temSenha ? "Senha" : "Criar senha"}</h2>
          <p className="perfil-sub">
            {temSenha
              ? "Troque sua senha sempre que quiser. A sessão dos seus outros aparelhos continua valendo até expirar."
              : "Um caminho a mais para entrar, além do Google."}
          </p>
          <FormSenha temSenha={temSenha} />
        </section>
      </div>
    </ShellCliente>
  );
}
