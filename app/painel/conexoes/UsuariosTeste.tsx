"use client";

import { useActionState } from "react";
import { criarUsuarioTesteAcao, verSenhaTesteAcao } from "./acoes";
import { ESTADO_USUARIO_TESTE_INICIAL } from "./tipos";
import { definirPapelTeste } from "./papel";
import { ESTADO_PAPEL_INICIAL, PAPEIS } from "./papel-tipos";

// Os vendedores/compradores ficticios do Mercado Livre. E com eles que a
// integracao se prova: publicam e compram entre si, sem CNPJ e sem tocar na
// loja de verdade.

export interface LinhaUsuarioTeste {
  id: string;
  apelido: string;
  site: string;
  email: string;
  criadoEm: string;
  // Opcional de proposito: o commit que criou o campo compila antes de a tela
  // passar o dado.
  papel?: string;
}

const LIMITE = 10;

function Senha({ valor }: { valor: string }) {
  return (
    <code
      style={{
        display: "inline-block", padding: "3px 8px", fontSize: "0.82rem",
        background: "var(--superficie-2)", borderRadius: 6, userSelect: "all",
      }}
    >
      {valor}
    </code>
  );
}

function Etiqueta({ papel }: { papel?: string }) {
  if (!papel) return null;
  const vendedor = papel === "vendedor";
  return (
    <span
      style={{
        marginLeft: 8, fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.06em",
        textTransform: "uppercase", padding: "2px 7px", borderRadius: 3,
        background: vendedor ? "var(--marca)" : "var(--superficie-2)",
        color: vendedor ? "var(--marca-contraste)" : "var(--texto)",
        border: vendedor ? "none" : "1px solid var(--borda)",
      }}
    >
      {vendedor ? "vendedor" : "comprador"}
    </span>
  );
}

export default function UsuariosTeste({
  tipo,
  usuarios,
  podeMexer,
}: {
  tipo: string;
  usuarios: LinhaUsuarioTeste[];
  podeMexer: boolean;
}) {
  const [eNovo, aNovo, pNovo] = useActionState(criarUsuarioTesteAcao, ESTADO_USUARIO_TESTE_INICIAL);
  const [eVer, aVer, pVer] = useActionState(verSenhaTesteAcao, ESTADO_USUARIO_TESTE_INICIAL);
  const [ePap, aPap, pPap] = useActionState(definirPapelTeste, ESTADO_PAPEL_INICIAL);

  const cheio = usuarios.length >= LIMITE;
  const semPapel = usuarios.filter((u) => !u.papel).length;

  return (
    <div className="cartao">
      <h2 style={{ margin: "0 0 6px", fontSize: "1rem" }}>Usuários de teste</h2>
      <p style={{ margin: "0 0 12px", color: "var(--texto-fraco)", fontSize: "0.85rem" }}>
        Contas fictícias do marketplace. Uma publica os anúncios, outra compra —
        e assim o caminho inteiro (pedido pago → entrega do eSIM) é provado sem
        CNPJ e sem mexer na sua loja de verdade. O Mercado Livre permite{" "}
        <b>{LIMITE}</b>, e não dá para apagar depois.
      </p>

      {usuarios.length >= 2 && semPapel > 0 ? (
        <p style={{ margin: "0 0 12px", fontSize: "0.83rem", color: "var(--alerta)" }}>
          Marque quem é <b>vendedor</b> e quem é <b>comprador</b>. É na conta do vendedor que o
          hub deve ser autorizado — errar isso só aparece quando a compra de teste não funciona.
        </p>
      ) : null}

      {usuarios.length === 0 ? (
        <p style={{ margin: "0 0 12px", fontSize: "0.85rem" }}>Nenhum ainda.</p>
      ) : (
        <ul style={{ margin: "0 0 12px", padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
          {usuarios.map((u) => (
            <li key={u.id} style={{ borderTop: "1px solid var(--borda)", paddingTop: 8 }}>
              <div style={{ fontSize: "0.88rem" }}>
                <b>{u.apelido || u.id}</b>{" "}
                <span style={{ color: "var(--texto-fraco)" }}>· {u.site}</span>
                <Etiqueta papel={u.papel} />
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--texto-fraco)" }}>
                id <code style={{ fontSize: "0.76rem" }}>{u.id}</code>
                {u.email ? (
                  <>
                    {" · "}
                    <code style={{ fontSize: "0.76rem" }}>{u.email}</code>
                  </>
                ) : null}
              </div>

              {podeMexer ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                  <form action={aVer}>
                    <input type="hidden" name="tipo" value={tipo} />
                    <input type="hidden" name="id" value={u.id} />
                    <button type="submit" disabled={pVer} className="botao secundario" style={{ fontSize: "0.78rem" }}>
                      {pVer ? "Abrindo…" : "Ver senha"}
                    </button>
                  </form>

                  <form action={aPap} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input type="hidden" name="id" value={u.id} />
                    <select
                      name="papel"
                      defaultValue={u.papel ?? ""}
                      style={{ width: "auto", fontSize: "0.78rem", padding: "4px 8px" }}
                      aria-label={`Papel de ${u.apelido || u.id}`}
                    >
                      {PAPEIS.map((p) => (<option key={p.v} value={p.v}>{p.r}</option>))}
                    </select>
                    <button type="submit" disabled={pPap} className="botao secundario" style={{ fontSize: "0.78rem" }}>
                      {pPap ? "Salvando…" : "Marcar"}
                    </button>
                  </form>
                </div>
              ) : null}

              {eVer?.senhaDe === u.id && eVer?.senha ? (
                <p style={{ margin: "6px 0 0", fontSize: "0.82rem" }}>
                  Senha: <Senha valor={eVer.senha} />
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {ePap?.erro || ePap?.ok ? (
        <p style={{ margin: "0 0 10px", fontSize: "0.84rem", color: ePap.erro ? "var(--erro)" : "var(--ok)" }}>
          {ePap.erro || ePap.ok}
        </p>
      ) : null}

      {eVer?.erro ? (
        <p style={{ margin: "0 0 10px", fontSize: "0.84rem", color: "var(--erro)" }}>{eVer.erro}</p>
      ) : null}

      {podeMexer ? (
        <form action={aNovo}>
          <input type="hidden" name="tipo" value={tipo} />
          <button type="submit" disabled={pNovo || cheio}>
            {pNovo ? "Criando…" : cheio ? `Limite de ${LIMITE} atingido` : "Criar usuário de teste"}
          </button>
        </form>
      ) : (
        <p className="nota">Só um admin cria usuário de teste.</p>
      )}

      {eNovo?.erro ? (
        <p style={{ margin: "10px 0 0", fontSize: "0.85rem", color: "var(--erro)" }}>{eNovo.erro}</p>
      ) : null}

      {eNovo?.criado ? (
        <div
          style={{
            marginTop: 12, padding: 12, borderRadius: 8,
            border: "1px solid var(--ok)", fontSize: "0.85rem",
          }}
        >
          <p style={{ margin: "0 0 6px", color: "var(--ok)" }}>Usuário de teste criado.</p>
          <div>Apelido: <b>{eNovo.criado.apelido}</b></div>
          <div>id: <code style={{ fontSize: "0.78rem" }}>{eNovo.criado.id}</code></div>
          {eNovo.criado.email ? (
            <div>E-mail: <code style={{ fontSize: "0.78rem" }}>{eNovo.criado.email}</code></div>
          ) : null}
          <div style={{ marginTop: 6 }}>Senha: <Senha valor={eNovo.criado.senha} /></div>
          <p style={{ margin: "8px 0 0", color: "var(--texto-fraco)", fontSize: "0.8rem" }}>
            Ela fica guardada cifrada aqui — o botão “ver senha” acima traz de volta quando
            precisar. Não esqueça de marcar se este é o <b>vendedor</b> ou o <b>comprador</b>.
          </p>
        </div>
      ) : null}
    </div>
  );
}
