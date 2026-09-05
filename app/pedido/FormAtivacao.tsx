"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { revelar } from "../acoes";
import { ESTADO_ESIM_INICIAL } from "../tipos";

// Botao "copiar" com feedback — codigo que o cliente digita errado e suporte
// na certa; copiar elimina o erro de transcricao.
function Copiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [feito, setFeito] = useState(false);
  return (
    <button
      type="button"
      className="copiar"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setFeito(true);
          setTimeout(() => setFeito(false), 2000);
        } catch {
          /* clipboard bloqueado: o codigo continua visivel para copia manual */
        }
      }}
      aria-label={`copiar ${rotulo}`}
    >
      {feito ? "copiado ✓" : "copiar"}
    </button>
  );
}

// Guia de instalacao por aparelho. Pre-seleciona pela plataforma de quem abriu
// (quem abre no iPhone quase sempre vai instalar NESTE iPhone), mas deixa
// trocar — comprar no computador e instalar no celular e o caminho comum.
function GuiaInstalacao({ ehIos }: { ehIos: boolean | null }) {
  const [aba, setAba] = useState<"iphone" | "android">("iphone");
  useEffect(() => {
    if (ehIos === false) setAba("android");
  }, [ehIos]);

  return (
    <div className="guia">
      <div className="guia-abas" role="tablist" aria-label="guia por aparelho">
        <button type="button" role="tab" aria-selected={aba === "iphone"} onClick={() => setAba("iphone")}>
          iPhone
        </button>
        <button type="button" role="tab" aria-selected={aba === "android"} onClick={() => setAba("android")}>
          Android
        </button>
      </div>

      {aba === "iphone" ? (
        <ol className="guia-passos">
          <li>Conecte o iPhone ao <b>Wi-Fi</b>.</li>
          <li>No iOS 17.4 ou mais novo, toque em <b>Instalar no iPhone</b> acima — pronto. Se nao funcionar, siga os passos abaixo.</li>
          <li>Abra <b>Ajustes → Celular → Adicionar eSIM</b>.</li>
          <li>Escolha <b>Usar QR code</b> e aponte a camera para o QR (na tela de outro aparelho ou impresso).</li>
          <li>Instalando no MESMO iPhone em que voce esta lendo? Toque em <b>Inserir detalhes manualmente</b> e cole o SM-DP+ e o codigo de ativacao copiados acima.</li>
          <li>Confirme e aguarde o &quot;Plano celular adicionado&quot;. <b>Nao apague o eSIM depois de instalar</b> — o QR e de uso unico.</li>
        </ol>
      ) : (
        <ol className="guia-passos">
          <li>Conecte o aparelho ao <b>Wi-Fi</b>.</li>
          <li>Toque em <b>Instalar no Android</b> acima; se o aparelho nao abrir o instalador, siga os passos abaixo.</li>
          <li>Abra <b>Configuracoes → Rede e internet → SIMs</b> (em alguns aparelhos: Conexoes → Gerenciador de SIM).</li>
          <li>Toque em <b>Adicionar eSIM / Baixar novo chip</b> e escaneie o QR.</li>
          <li>Sem outra tela para escanear? Escolha <b>inserir codigo manualmente</b> e cole o codigo de ativacao completo copiado acima.</li>
          <li>Confirme o download. <b>Nao apague o eSIM depois de instalar</b> — o QR e de uso unico.</li>
        </ol>
      )}

      <p className="nota" style={{ marginTop: 10 }}>
        Deixe o eSIM instalado e <b>desligado</b> ate a viagem. Ao pousar, ative a linha e
        ligue o <b>roaming de dados</b> para ela — o plano so comeca a contar ai. Qualquer
        duvida, responda o e-mail do pedido: gente de verdade resolve com voce.
      </p>
    </div>
  );
}

export default function FormAtivacao({ ativacaoId }: { ativacaoId: string }) {
  const [estado, acao, pendente] = useActionState(revelar, ESTADO_ESIM_INICIAL);
  const revelado = estado.smdp !== "" || estado.ativacao !== "";
  const [ehIos, setEhIos] = useState<boolean | null>(null);

  useEffect(() => {
    const ua = navigator.userAgent;
    setEhIos(/iPhone|iPad|iPod/i.test(ua) ? true : /Android/i.test(ua) ? false : null);
  }, []);

  if (revelado) {
    const lpaCompleto = estado.smdp && estado.ativacao ? `LPA:1$${estado.smdp}$${estado.ativacao}` : "";
    return (
      <div className="esim">
        {estado.qr ? (
          <img
            className="qr"
            src={`data:image/png;base64,${estado.qr}`}
            alt="QR code de instalacao do eSIM"
            width={280}
            height={280}
          />
        ) : (
          <p className="nota">QR ainda nao disponivel — use o codigo manual abaixo.</p>
        )}

        <div className="botoes" style={{ margin: "0 0 14px" }}>
          {estado.link_apple ? (
            <a className="botao" href={estado.link_apple}>
              Instalar no iPhone
            </a>
          ) : null}
          {estado.link_android ? (
            <a className="botao secundario" href={estado.link_android}>
              Instalar no Android
            </a>
          ) : null}
        </div>

        <div className="linha">
          <span>Endereco SM-DP+</span>
          <span className="cod-copia"><code>{estado.smdp}</code><Copiar texto={estado.smdp} rotulo="SM-DP+" /></span>
        </div>
        <div className="linha">
          <span>Codigo de ativacao</span>
          <span className="cod-copia"><code>{estado.ativacao}</code><Copiar texto={estado.ativacao} rotulo="codigo de ativacao" /></span>
        </div>
        {lpaCompleto ? (
          <div className="linha">
            <span>Codigo completo (para colar no aparelho)</span>
            <span className="cod-copia"><Copiar texto={lpaCompleto} rotulo="codigo completo" /></span>
          </div>
        ) : null}

        <GuiaInstalacao ehIos={ehIos} />
      </div>
    );
  }

  return (
    <form action={acao} className="compra">
      <input type="hidden" name="ativacao_id" value={ativacaoId} />
      <label className="rotulo" htmlFor={`conf-${ativacaoId}`}>
        Confirme o e-mail da compra para ver o seu eSIM
      </label>
      <input
        id={`conf-${ativacaoId}`}
        type="email"
        name="email"
        required
        autoComplete="email"
        placeholder="voce@exemplo.com"
        disabled={pendente}
      />
      <button type="submit" disabled={pendente}>
        {pendente ? "Verificando…" : "Ver meu eSIM"}
      </button>
      {estado.erro ? <p className="erro">{estado.erro}</p> : null}
    </form>
  );
}
