import { headers } from "next/headers";
import { CONECTORES, estadoDoConector } from "../../../lib/conectores";
import { estadoStripe } from "../../../lib/stripe";
import { usuarioDaSessao } from "../../../lib/painel/sessao";
import Cartao from "./Cartao";
import CartaoStripe from "./CartaoStripe";

export const dynamic = "force-dynamic";

export const metadata = { title: "Conexões — AmericaSim", robots: { index: false, follow: false } };

const RECADO: Record<string, string> = {
  papel: "Só um admin pode mexer nas conexões.",
  conector: "Conector desconhecido ou ainda não disponível.",
  sem_aplicacao: "Falta guardar o Client ID antes de autorizar.",
  sem_segredo: "Falta a senha da aplicação.",
  recusado: "A autorização foi recusada no marketplace. Nada foi alterado.",
  estado: "O vaivém da autorização não bateu (pode ter demorado demais, ou o link foi aberto fora daqui). Comece de novo.",
  troca: "O marketplace recusou a troca do código pelo token. O motivo está nos erros de sincronia.",
  rede: "Não consegui falar com o marketplace. Tente de novo.",
};

export default async function Conexoes({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; ok?: string }>;
}) {
  const sp = await searchParams;
  const u = await usuarioDaSessao();
  const podeMexer = u?.papel === "admin";

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "127.0.0.1:3002";
  const base = `${proto}://${host}`;

  const [estados, stripe] = await Promise.all([
    Promise.all(CONECTORES.map((c) => estadoDoConector(c))),
    estadoStripe(),
  ]);

  return (
    <>
      <div className="pn-cabeca">
        <h1>Conexões</h1>
        <p>
          Onde o hub se liga ao mundo: quem recebe o dinheiro, e onde os produtos são vendidos.
          Cada conexão é uma permissão que você dá para este sistema agir em seu nome — por isso
          mexer aqui é só de admin, e por isso o passo a passo está na tela, não numa conversa.
        </p>
      </div>

      {sp.erro ? (
        <div className="cartao perigo" style={{ marginBottom: 18 }}>
          <p style={{ margin: 0, color: "var(--erro)" }}>
            {RECADO[sp.erro] ?? "Não deu para completar a conexão."}
          </p>
        </div>
      ) : null}
      {sp.ok === "conectado" ? (
        <div className="cartao" style={{ marginBottom: 18, borderLeft: "4px solid var(--ok)" }}>
          <p style={{ margin: 0, color: "var(--ok)" }}>
            Conectado. O hub já pode publicar e receber pedidos por este canal.
          </p>
        </div>
      ) : null}

      {!podeMexer ? (
        <p className="nota" style={{ marginBottom: 14 }}>
          Seu papel permite ver o estado das conexões, mas não conectar nem desconectar.
        </p>
      ) : null}

      {/* Pagamento vem PRIMEIRO de proposito: sem ele, nenhum canal vende de
          verdade — o marketplace mais bem configurado do mundo nao cobra nada
          se o gateway nao estiver ligado. */}
      <h2 style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.1em",
                   color: "var(--texto-fraco)", margin: "0 0 10px" }}>
        Recebimento
      </h2>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))" }}>
        <CartaoStripe
          modo={stripe.modo}
          temSecreta={stripe.temSecreta}
          temWebhook={stripe.temWebhook}
          ondeSecreta={stripe.ondeSecreta}
          ondeWebhook={stripe.ondeWebhook}
          urlWebhook={`${base}/v1/webhooks/stripe`}
          comissaoFixa={stripe.comissaoFixa}
          comissaoPct={stripe.comissaoPct}
          podeMexer={!!podeMexer}
        />
      </div>

      <h2 style={{ fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.1em",
                   color: "var(--texto-fraco)", margin: "26px 0 10px" }}>
        Canais de venda
      </h2>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))" }}>
        {estados.map((e) => (
          <Cartao
            key={e.conector.tipo}
            tipo={e.conector.tipo}
            nome={e.conector.nome}
            resumo={e.conector.resumo}
            situacao={e.situacao}
            rotulo={e.rotulo}
            detalhe={e.detalhe}
            clientId={e.clientId}
            temSegredo={e.temSegredo}
            ondeSegredo={e.ondeSegredo}
            envSecret={e.conector.envSecret}
            urlDev={e.conector.urlDev}
            urlRetorno={`${base}/painel/conexoes/${e.conector.tipo}/retorno`}
            escopos={e.conector.escopos}
            podeMexer={!!podeMexer}
            itens={e.itens}
            ultimoSync={e.ultimoSync ? new Date(e.ultimoSync).toISOString() : null}
            expiraEm={e.cred.expiraEm ? new Date(e.cred.expiraEm).toISOString() : null}
            ultimosErros={e.ultimosErros.map((x) => ({
              quando: new Date(x.quando).toISOString(),
              acao: x.acao,
              detalhe: x.detalhe,
            }))}
          />
        ))}
      </div>

      <p
        style={{
          color: "var(--texto-fraco)", fontSize: "0.82rem", marginTop: 22,
          borderLeft: "3px solid var(--borda)", paddingLeft: 12,
        }}
      >
        <b>Chaves, senhas de aplicação e tokens são guardados cifrados</b>, com a chave-mãe fora
        do banco. Um backup roubado, sozinho, não abre nada — e nenhum deles volta para esta tela
        depois de salvo.
      </p>
    </>
  );
}
