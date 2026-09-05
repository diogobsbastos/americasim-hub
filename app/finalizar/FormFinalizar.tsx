"use client";

import Link from "next/link";
import { useActionState } from "react";
import { finalizarCompra } from "../acoes";
import { ESTADO_COMPRA_INICIAL } from "../tipos";

// O formulario do checkout. Duas portas de entrada:
// - "Continuar com Google": 1 clique cadastra/entra e VOLTA para esta pagina
//   (?voltar=) com o e-mail ja preenchido;
// - e-mail digitado a mao, para quem nao quer Google.
// O WhatsApp e obrigatorio nas duas portas: e por ele que o SAC alcanca o
// cliente no meio da viagem — e-mail em roaming ninguem abre.
export default function FormFinalizar({
  sku,
  tentativa,
  rotulo,
  emailConta,
  telefoneConta,
  temGoogle,
}: {
  sku: string;
  tentativa: string;
  rotulo: string;
  emailConta: string;
  telefoneConta: string;
  temGoogle: boolean;
}) {
  const [estado, acao, pendente] = useActionState(finalizarCompra, ESTADO_COMPRA_INICIAL);
  const logada = emailConta !== "";
  const voltar = encodeURIComponent(`/finalizar?sku=${sku}`);

  return (
    <div className="fin-form">
      {logada ? (
        <p className="fin-conta">
          Comprando como <b>{emailConta}</b>
        </p>
      ) : temGoogle ? (
        <>
          {/* 1 clique: cadastra (ou entra) e volta para ca com o e-mail pronto. */}
          <a className="btn-google" href={`/conta/google?voltar=${voltar}`}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
            <span>Continuar com Google</span>
          </a>
          <p className="separa"><span>ou continue com e-mail</span></p>
        </>
      ) : null}

      <form action={acao} className="pilha">
        <input type="hidden" name="sku" value={sku} />
        <input type="hidden" name="tentativa" value={tentativa} />

        <div>
          <label className="rotulo" htmlFor="fin-email">E-mail — o eSIM chega nele</label>
          <input
            id="fin-email"
            type="email"
            name="email"
            required
            autoComplete="email"
            placeholder="voce@exemplo.com"
            defaultValue={emailConta}
            readOnly={logada}
            disabled={pendente}
          />
        </div>

        <div>
          <label className="rotulo" htmlFor="fin-zap">WhatsApp com DDD — nosso suporte fala por ele</label>
          <input
            id="fin-zap"
            type="tel"
            name="telefone"
            required
            autoComplete="tel"
            inputMode="tel"
            placeholder="(11) 91234-5678"
            defaultValue={telefoneConta}
            disabled={pendente}
          />
          <p className="fin-dica">
            Usamos só para o suporte da sua viagem. Nada de propaganda.
          </p>
        </div>

        <button type="submit" disabled={pendente}>
          {pendente ? "Processando…" : rotulo}
        </button>

        <p className="fin-termos">
          Ao comprar, você concorda com os <Link href="/termos">Termos de uso</Link> e a{" "}
          <Link href="/privacidade">Política de privacidade</Link>.
        </p>

        {estado.erro ? <p className="erro">{estado.erro}</p> : null}
      </form>
    </div>
  );
}
