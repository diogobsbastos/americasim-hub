import { headers } from "next/headers";
import { CONECTORES, estadoDoConector } from "../../../lib/conectores";
import { usuarioDaSessao } from "../../../lib/painel/sessao";
import Cartao from "./Cartao";

export const dynamic = "force-dynamic";

export const metadata = { title: "Conexões — AmericaSim", robots: { index: false, follow: false } };

const RECADO: Record<string, string> = {
  papel: "Só um admin pode mexer nas conexões.",
  conector: "Conector desconhecido ou ainda não disponível.",
  sem_aplicacao: "Falta guardar o Client ID antes de autorizar.",
  sem_segredo: "Falta a senha da aplicação no ambiente do servidor.",
  recusado: "A autorização foi recusada no marketplace. Nada foi alterado.",
  estado: "O vaivém da autorização não bateu (pode ter demorado demais, ou o link foi aberto fora daqui). Comece de novo.",
  troca: "O marketplace recusou a troca do código pelo token. O motivo está nos erros de sincronia abaixo.",
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

  const estados = await Promise.all(CONECTORES.map((c) => estadoDoConector(c)));

  return (
    <>
      <div className="pn-cabeca">
        <h1>Conexões</h1>
        <p>
          Onde o hub se liga aos marketplaces. Cada conexão é uma permissão que você dá para
          este sistema publicar e vender em seu nome — por isso mexer aqui é só de admin, e
          por isso o passo a passo está na tela, não numa conversa.
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
        <b>O token de acesso é guardado cifrado e amarrado ao canal.</b> Se alguém copiar a linha
        de credencial de um canal para outro, a leitura falha em vez de funcionar. E ele nunca
        aparece em tela, log ou auditoria — nem aqui.
      </p>
    </>
  );
}
