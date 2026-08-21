"use client";

import { useActionState } from "react";
import {
  registrarDominioAcao,
  revalidarDominioAcao,
  salvarDominioVitrine,
} from "../acoes";
import { ESTADO_PAGAMENTO_INICIAL } from "../tipos";

interface DominioStripe {
  id: string;
  dominio: string;
  habilitado: boolean;
  googlePay: string;
  applePay: string;
  link: string;
}

interface VitrineDominio {
  canalId: string;
  canalCodigo: string;
  canalNome: string;
  dominio: string | null;
  sugestao: string | null;
  registro: DominioStripe | null;
  precisaWww: boolean;
  wwwRegistrado: boolean;
}

function Recado({ e }: { e: { erro: string; ok: string } }) {
  if (!e?.erro && !e?.ok) return null;
  return (
    <p style={{ margin: "8px 0 0", fontSize: "0.85rem", color: e?.erro ? "var(--erro)" : "var(--ok)" }}>
      {e?.erro || e?.ok}
    </p>
  );
}

// Verde só quando está ATIVO de verdade. "Registrado" e "ativo" são coisas
// diferentes: a Stripe verifica o domínio depois de registrar, e uma carteira
// pode ficar inativa com o registro existindo. Pintar as duas de verde faria a
// tela mentir exatamente no caso que ela existe para pegar.
function Selo({ nome, status }: { nome: string; status: string }) {
  const cor =
    status === "active" ? "var(--ok)" : status === "inactive" ? "var(--erro)" : "var(--texto-fraco)";
  const texto = status === "active" ? "ativo" : status === "inactive" ? "inativo" : "?";
  return (
    <span
      style={{
        fontSize: "0.72rem", border: `1px solid ${cor}`, color: cor,
        borderRadius: 999, padding: "1px 8px", whiteSpace: "nowrap",
      }}
    >
      {nome}: {texto}
    </span>
  );
}

export default function Dominios({
  vitrines,
  soltos,
  podeMexer,
}: {
  vitrines: VitrineDominio[];
  soltos: DominioStripe[];
  podeMexer: boolean;
}) {
  const [eDom, aDom, pDom] = useActionState(salvarDominioVitrine, ESTADO_PAGAMENTO_INICIAL);
  const [eReg, aReg, pReg] = useActionState(registrarDominioAcao, ESTADO_PAGAMENTO_INICIAL);
  const [eVal, aVal, pVal] = useActionState(revalidarDominioAcao, ESTADO_PAGAMENTO_INICIAL);

  return (
    <>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))" }}>
        {vitrines.map((v) => {
          const registrado = !!v.registro;
          return (
            <div key={v.canalId} className="cartao" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{v.canalNome}</h2>
                <code style={{ fontSize: "0.72rem", color: "var(--texto-fraco)" }}>{v.canalCodigo}</code>
              </div>

              {/* ---------------------------------------- qual é o domínio */}
              {podeMexer ? (
                <form action={aDom}>
                  <input type="hidden" name="canal_id" value={v.canalId} />
                  <label className="rotulo">Domínio desta vitrine</label>
                  <input
                    type="text"
                    name="dominio"
                    defaultValue={v.dominio ?? v.sugestao ?? ""}
                    placeholder="americasim.duckdns.org"
                    disabled={pDom}
                  />
                  {!v.dominio && v.sugestao ? (
                    <p style={{ margin: "6px 0 0", fontSize: "0.78rem", color: "var(--texto-fraco)" }}>
                      Sugerido a partir das chaves de vitrine do servidor. Confira antes de salvar.
                    </p>
                  ) : null}
                  <button type="submit" disabled={pDom} className="botao secundario" style={{ marginTop: 8, fontSize: "0.85rem" }}>
                    {pDom ? "Guardando…" : "Guardar domínio"}
                  </button>
                </form>
              ) : (
                <p style={{ margin: 0, fontSize: "0.88rem" }}>
                  {v.dominio ?? <span style={{ color: "var(--alerta)" }}>sem domínio definido</span>}
                </p>
              )}

              {/* ---------------------------------------- estado na Stripe */}
              <div style={{ borderTop: "1px solid var(--borda)", paddingTop: 10 }}>
                {!v.dominio ? (
                  <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--texto-fraco)" }}>
                    Defina o domínio acima para poder registrá-lo na Stripe.
                  </p>
                ) : !registrado ? (
                  <>
                    <p style={{ margin: "0 0 8px", fontSize: "0.85rem", color: "var(--alerta)" }}>
                      Não registrado na Stripe. Nenhuma carteira vai aparecer neste domínio.
                    </p>
                    {podeMexer ? (
                      <form action={aReg}>
                        <input type="hidden" name="dominio" value={v.dominio} />
                        <button type="submit" disabled={pReg} style={{ fontSize: "0.88rem" }}>
                          {pReg ? "Registrando…" : `Registrar ${v.dominio}`}
                        </button>
                      </form>
                    ) : null}
                  </>
                ) : (
                  <>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                      <Selo nome="Google Pay" status={v.registro!.googlePay} />
                      <Selo nome="Apple Pay" status={v.registro!.applePay} />
                      <Selo nome="Link" status={v.registro!.link} />
                    </div>
                    {!v.registro!.habilitado ? (
                      <p style={{ margin: "0 0 8px", fontSize: "0.85rem", color: "var(--erro)" }}>
                        O registro existe mas está <b>desabilitado</b> na Stripe — as carteiras não
                        aparecem enquanto isso.
                      </p>
                    ) : null}
                    {podeMexer ? (
                      <form action={aVal}>
                        <input type="hidden" name="pmd_id" value={v.registro!.id} />
                        <button type="submit" disabled={pVal} className="botao secundario" style={{ fontSize: "0.85rem" }}>
                          {pVal ? "Revalidando…" : "Revalidar"}
                        </button>
                      </form>
                    ) : null}
                  </>
                )}

                {/* ------------------------------------- a armadilha do www */}
                {v.dominio && v.precisaWww && !v.wwwRegistrado ? (
                  <div style={{ marginTop: 10, borderLeft: "3px solid var(--alerta)", paddingLeft: 10 }}>
                    <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--alerta)" }}>
                      <b>www.{v.dominio}</b> é um subdomínio e precisa de registro próprio. Quem
                      chegar pelo endereço com <code>www</code> não vê carteira nenhuma.
                    </p>
                    {podeMexer ? (
                      <form action={aReg} style={{ marginTop: 6 }}>
                        <input type="hidden" name="dominio" value={`www.${v.dominio}`} />
                        <button type="submit" disabled={pReg} className="botao secundario" style={{ fontSize: "0.82rem" }}>
                          Registrar www.{v.dominio}
                        </button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <Recado e={eDom} />
      <Recado e={eReg} />
      <Recado e={eVal} />

      {soltos.length > 0 ? (
        <details style={{ marginTop: 22 }}>
          <summary style={{ cursor: "pointer", fontSize: "0.88rem", color: "var(--texto-fraco)" }}>
            {soltos.length} domínio(s) registrado(s) na Stripe sem vitrine correspondente
          </summary>
          <p style={{ fontSize: "0.82rem", color: "var(--texto-fraco)", margin: "8px 0" }}>
            Não é erro por si só: <code>checkout.stripe.com</code> é criado pela própria Stripe.
            Mas se aparecer aqui um domínio nosso, é sinal de que alguém registrou por fora ou de
            que uma vitrine mudou de endereço.
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: "0.82rem", color: "var(--texto-fraco)" }}>
            {soltos.map((d) => (
              <li key={d.id} style={{ marginBottom: 4 }}>
                <code>{d.dominio}</code> — Google Pay: {d.googlePay} · Apple Pay: {d.applePay}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}
