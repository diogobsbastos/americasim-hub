"use client";

import Link from "next/link";
import { useActionState } from "react";
import { adicionarRemetenteAcao, aprovarLoteAcao, editarRemetenteAcao, enviarRequisicaoAcao, rejeitarLoteAcao, removerRemetenteAcao, salvarConfigReqAcao } from "./acoes";
import { ESTADO_REQ_INICIAL } from "./tipos";

export interface LoteTela {
  id: string;
  remetente: string;
  assunto: string;
  arquivo: string;
  recebidoEm: string;
  linhas: number;
  iccids: number;
  comLpa: number;
  amostra: string[];
  status: string;
  resultado: string;
}

export interface RequisicaoTela {
  para: string;
  quantidade: number | null;
  criadoEm: string;
}

export interface VarianteOpcao {
  id: string;
  sku: string;
  modo: string;
}

export interface FornecedorOpcao {
  id: string;
  nome: string;
  email: string;
}

function Resultado({ e }: { e: { erro: string; ok: string } }) {
  return (
    <>
      {e.erro ? <p style={{ color: "var(--erro)", margin: "8px 0 0", fontSize: "0.84rem" }}>{e.erro}</p> : null}
      {e.ok ? <p style={{ color: "var(--ok)", margin: "8px 0 0", fontSize: "0.84rem" }}>{e.ok}</p> : null}
    </>
  );
}

const rotulo = { display: "block", fontSize: "0.78rem", color: "var(--texto-fraco)", margin: "10px 0 4px" } as const;
const campo = { width: "100%", maxWidth: 520 } as const;

export default function CartaoRequisicoes({
  destino, remetentes, caixaLigada, caixaErro, lotes, requisicoes, variantes, fornecedores, fornecedorPadrao, podeAdmin, podeOperar,
}: {
  destino: string; remetentes: string[];
  caixaLigada: boolean; caixaErro: string;
  lotes: LoteTela[]; requisicoes: RequisicaoTela[]; variantes: VarianteOpcao[];
  fornecedores: FornecedorOpcao[]; fornecedorPadrao: string;
  podeAdmin: boolean; podeOperar: boolean;
}) {
  const [eReq, aReq, pReq] = useActionState(enviarRequisicaoAcao, ESTADO_REQ_INICIAL);
  const [eApr, aApr, pApr] = useActionState(aprovarLoteAcao, ESTADO_REQ_INICIAL);
  const [eRej, aRej, pRej] = useActionState(rejeitarLoteAcao, ESTADO_REQ_INICIAL);
  const [eCfg, aCfg, pCfg] = useActionState(salvarConfigReqAcao, ESTADO_REQ_INICIAL);
  const [eAdd, aAdd, pAdd] = useActionState(adicionarRemetenteAcao, ESTADO_REQ_INICIAL);
  const [eEdi, aEdi, pEdi] = useActionState(editarRemetenteAcao, ESTADO_REQ_INICIAL);
  const [eRem, aRem, pRem] = useActionState(removerRemetenteAcao, ESTADO_REQ_INICIAL);

  const pendentes = lotes.filter((l) => l.status === "pendente");
  const tratados = lotes.filter((l) => l.status !== "pendente");

  return (
    <>
      <div className="cartao" style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: "0.95rem", textTransform: "uppercase", margin: "0 0 6px" }}>Requisitar ICCIDs</h2>
        <p className="nota" style={{ marginTop: 0 }}>
          Envia o e-mail padrão para <b>{destino}</b> e avisa no Zap. A resposta com o CSV entra sozinha na lista
          abaixo — o Gmail avisa o robô na hora ({caixaLigada ? "caixa conectada ✅" : `caixa desconectada ⚠️${caixaErro ? ` — ${caixaErro}` : ""}`}).
        </p>
        {podeOperar ? (
          <form action={aReq}>
            <label style={rotulo} htmlFor="rf">Fornecedor (o e-mail vem do cadastro em Fornecedores)</label>
            <select id="rf" name="fornecedor_id" defaultValue={fornecedorPadrao} style={{ maxWidth: 420 }} disabled={pReq}>
              <option value="">— padrão ({destino})</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}{f.email ? ` — ${f.email}` : " (sem e-mail: usa o padrão)"}</option>
              ))}
            </select>
            <label style={rotulo} htmlFor="rq">Quantidade de ICCIDs</label>
            <input id="rq" name="quantidade" type="number" min={1} max={10000} required style={{ width: 140 }} disabled={pReq} />
            <label style={rotulo} htmlFor="ro">Observação (opcional — vai no e-mail e no Zap)</label>
            <input id="ro" name="observacao" style={campo} disabled={pReq} />
            <div style={{ marginTop: 12 }}>
              <button type="submit" disabled={pReq}>{pReq ? "Enviando…" : "Enviar requisição"}</button>
            </div>
          </form>
        ) : null}
        <Resultado e={eReq} />
        {requisicoes.length > 0 ? (
          <p className="nota">Últimas: {requisicoes.map((r) => `${r.quantidade ?? "?"} un · ${r.criadoEm}`).join(" • ")}</p>
        ) : null}
      </div>

      <div className="cartao" style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: "0.95rem", textTransform: "uppercase", margin: "0 0 6px" }}>
          Lotes recebidos {pendentes.length > 0 ? `— ${pendentes.length} aguardando aprovação` : ""}
        </h2>
        <p className="nota" style={{ marginTop: 0 }}>
          CSV que chega por e-mail vira lote pendente — nada entra no estoque sem um clique seu.
          Aprovar SEM escolher SKU guarda tudo como <b>estoque do fornecedor</b> (fora de venda,
          para alocar depois na tela Estoque); escolhendo um SKU, já entra vendável nele.
          Aprovação responde o e-mail do remetente e avisa no Zap.
        </p>
        {pendentes.length === 0 ? <p className="nota">Nenhum lote pendente.</p> : null}
        {pendentes.map((l) => (
          <div key={l.id} style={{ border: "1px solid var(--borda)", borderRadius: 10, padding: "12px 14px", marginTop: 10 }}>
            <div style={{ fontSize: "0.86rem" }}>
              <b>{l.arquivo}</b> · de <code>{l.remetente}</code> · {l.recebidoEm}
            </div>
            <div style={{ fontSize: "0.82rem", color: "var(--texto-fraco)", marginTop: 4 }}>
              {l.linhas} linha(s) → <b>{l.iccids} ICCID(s)</b>, {l.comLpa} com código LPA · amostra: {l.amostra.length ? l.amostra.map((a) => `…${a.slice(-6)}`).join(", ") : "—"}
            </div>
            {podeAdmin ? (
              <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap", marginTop: 10 }}>
                <form action={aApr} style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
                  <input type="hidden" name="lote_id" value={l.id} />
                  <label style={{ fontSize: "0.78rem", color: "var(--texto-fraco)" }}>
                    Destino{" "}
                    <select name="variante_id" defaultValue="" style={{ display: "block", marginTop: 4 }}>
                      <option value="">— estoque do fornecedor (alocar depois)</option>
                      {variantes.map((v) => (
                        <option key={v.id} value={v.id}>{v.sku} ({v.modo})</option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" disabled={pApr}>{pApr ? "Carregando…" : "Aprovar e carregar"}</button>
                </form>
                <form action={aRej}>
                  <input type="hidden" name="lote_id" value={l.id} />
                  <button type="submit" className="secundario" disabled={pRej}>Rejeitar</button>
                </form>
              </div>
            ) : null}
          </div>
        ))}
        <Resultado e={eApr} />
        <Resultado e={eRej} />
        {tratados.length > 0 ? (
          <p className="nota" style={{ marginTop: 12 }}>
            Histórico: {tratados.map((l) => `${l.arquivo} (${l.status}${l.resultado ? ` · ${l.resultado}` : ""})`).join(" • ")}
          </p>
        ) : null}
      </div>

      <div className="cartao" style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: "0.95rem", textTransform: "uppercase", margin: "0 0 6px" }}>Configuração</h2>
        <p className="nota" style={{ marginTop: 0 }}>
          O Zap (conexão do número-robô, destino dos avisos e teste) mudou para{" "}
          <Link href="/painel/config/zap">Configurações → Zap</Link>.
        </p>
        {podeAdmin ? (
          <form action={aCfg} autoComplete="off">
            <label style={rotulo} htmlFor="cd">Destino da requisição (e-mail da EasySim4u)</label>
            <input id="cd" name="destino" defaultValue={destino} style={campo} disabled={pCfg} />
            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button type="submit" disabled={pCfg}>{pCfg ? "Guardando…" : "Guardar"}</button>
            </div>
          </form>
        ) : (
          <p className="nota">Destino: <b>{destino}</b></p>
        )}
        <Resultado e={eCfg} />

        <h3 style={{ fontSize: "0.85rem", textTransform: "uppercase", margin: "18px 0 4px" }}>Remetentes autorizados a mandar CSV</h3>
        <p className="nota" style={{ marginTop: 0 }}>
          O robô só aceita CSV vindo destes endereços. Um <code>@dominio.com</code> autoriza o domínio inteiro.
        </p>
        {remetentes.length === 0 ? <p className="nota">Nenhum remetente autorizado.</p> : null}
        {remetentes.map((r) => (
          <div key={r} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid var(--borda)", padding: "8px 0" }}>
            {podeAdmin ? (
              <>
                <form action={aEdi} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <input type="hidden" name="antigo" value={r} />
                  <input name="remetente" defaultValue={r} style={{ width: 280, fontSize: "0.84rem" }} disabled={pEdi} />
                  <button type="submit" className="secundario" disabled={pEdi}>Salvar</button>
                </form>
                <form action={aRem}>
                  <input type="hidden" name="remetente" value={r} />
                  <button type="submit" className="secundario" disabled={pRem}>Remover</button>
                </form>
              </>
            ) : (
              <code style={{ fontSize: "0.84rem" }}>{r}</code>
            )}
          </div>
        ))}
        {podeAdmin ? (
          <form action={aAdd} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
            <input name="remetente" placeholder="novo@email.com ou @dominio.com" style={{ width: 280, fontSize: "0.84rem" }} disabled={pAdd} />
            <button type="submit" disabled={pAdd}>{pAdd ? "Adicionando…" : "Adicionar"}</button>
          </form>
        ) : null}
        <Resultado e={eAdd} />
        <Resultado e={eEdi} />
        <Resultado e={eRem} />
      </div>
    </>
  );
}
