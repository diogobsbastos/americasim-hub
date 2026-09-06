import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiPost } from "../../lib/vitrine";
import { COOKIE_SESSAO } from "../../lib/conta";
import { marcaAtual } from "../../lib/marcas";
import ShellCliente from "../ShellCliente";
import { IcoQr } from "../Icones";
import FiltroEsims, { type PedidoLista } from "./FiltroEsims";
import BotaoReenviar from "./BotaoReenviar";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const m = await marcaAtual();
  return { title: `Meus eSIMs — ${m.nome}`, robots: { index: false, follow: false } };
}

// AREA DO CLIENTE no padrao de painel (referencia estrutural: painel do
// QueroConsertar). O shell (sidebar + topo) e COMPARTILHADO com /pedido:
// app/ShellCliente.tsx.

export default async function MeusPedidos() {
  const marca = await marcaAtual();
  const c = await cookies();
  const sessao = c.get(COOKIE_SESSAO)?.value ?? "";
  if (!sessao) redirect("/conta/entrar");

  const r = await apiPost("/v1/conta/pedidos", { sessao });
  if (!r.ok && r.erro_codigo === "sessao_invalida") redirect("/conta/entrar");

  // Admin (e-mail que tambem e usuario ativo do painel) ganha o item "Backend"
  // no menu. So o MENU depende disto — a porta do painel confere a propria
  // sessao (cookie painel_sessao, criado no login com Google).
  const perfil = await apiPost("/v1/conta/perfil", { sessao });
  const temBackend = perfil.ok && perfil.dados?.backend === true;
  const email = String(perfil.dados?.email ?? r.dados?.email ?? "");
  const nomeCliente = String(perfil.dados?.nome ?? "").trim();
  const ola = nomeCliente ? nomeCliente.split(" ")[0] : "";

  if (!r.ok && r.erro_codigo === "conta_nao_verificada") {
    return (
      <ShellCliente codigo={marca.codigo} nome={marca.nome} temBackend={temBackend} logado ativo="esims">
        <h1 className="ct-ola">Falta confirmar seu e-mail</h1>
        <p className="nota" style={{ maxWidth: "52ch" }}>
          Por segurança, os pedidos só aparecem depois que você confirmar que este e-mail é seu.
          Enviamos um link de confirmação assim que a conta foi criada — ele vale por 3 dias.
        </p>
        <div className="ct-cartao perfil-cartao" style={{ maxWidth: 440, marginTop: 18 }}>
          <h2>Não recebeu o e-mail?</h2>
          <p className="perfil-sub">
            Procure também no spam. Se não achar, mandamos outro agora.
          </p>
          <BotaoReenviar email={email} />
          <p className="fin-dica" style={{ marginTop: 14 }}>
            Prefere pular esta etapa? Entrar com o Google confirma o e-mail na hora.
          </p>
          <p style={{ marginTop: 10 }}>
            <a className="botao secundario" href="/conta/entrar">Entrar com o Google →</a>
          </p>
        </div>
      </ShellCliente>
    );
  }

  if (!r.ok) {
    return (
      <ShellCliente codigo={marca.codigo} nome={marca.nome} temBackend={temBackend} logado ativo="esims">
        <h1 className="ct-ola">Não deu para carregar seus pedidos</h1>
        <p className="nota">{r.erro_mensagem}</p>
        <p style={{ marginTop: 16 }}>
          <a className="botao secundario" href="/conta">Tentar de novo</a>
        </p>
      </ShellCliente>
    );
  }

  const pedidos: PedidoLista[] = r.dados?.pedidos ?? [];

  return (
    <ShellCliente codigo={marca.codigo} nome={marca.nome} temBackend={temBackend} logado ativo="esims">
      <h1 className="ct-ola">Olá{ola ? `, ${ola}` : ""}! 👋</h1>
      {email ? <p className="ct-quem">{email}</p> : null}

      <h2 className="ct-rotulo">Meus eSIMs</h2>

      {pedidos.length === 0 ? (
        <div className="ct-vazio">
          <span className="ct-vazio-ico" aria-hidden="true"><IcoQr /></span>
          <b>Nenhum eSIM ainda</b>
          <p>Escolha um plano e receba o QR no seu e-mail na hora.</p>
          <Link className="botao" href="/#planos">Ver planos →</Link>
        </div>
      ) : (
        <FiltroEsims pedidos={pedidos} />
      )}
    </ShellCliente>
  );
}
