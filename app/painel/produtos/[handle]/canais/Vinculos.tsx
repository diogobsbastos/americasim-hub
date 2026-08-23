"use client";

import { useActionState } from "react";
import { salvarVinculos } from "./acoes";
import {
  ESTADO_VINCULO_INICIAL,
  ROTULO_SYNC,
  type CanalMarketplace,
  type ItemVinculo,
  type SkuVinculo,
} from "./tipos";

function quando(s: string | null): string {
  if (!s) return "nunca";
  return new Date(s).toLocaleString("pt-BR");
}

export default function Vinculos({
  handle,
  canais,
  skus,
  itens,
  podeMexer,
}: {
  handle: string;
  canais: CanalMarketplace[];
  skus: SkuVinculo[];
  itens: ItemVinculo[];
  podeMexer: boolean;
}) {
  const [estado, acao, enviando] = useActionState(salvarVinculos, ESTADO_VINCULO_INICIAL);

  if (canais.length === 0) return null;

  const achar = (canalId: string, varianteId: string) =>
    itens.find((i) => i.canalId === canalId && i.varianteId === varianteId);

  return (
    <form action={acao} style={{ marginTop: 34 }}>
      <input type="hidden" name="handle" value={handle} />

      <h2 style={{ fontSize: "1.1rem", margin: "0 0 4px" }}>Anúncios no marketplace</h2>
      <p style={{ color: "var(--texto-fraco)", margin: "0 0 14px", fontSize: "0.88rem" }}>
        O código do anúncio lá deles, guardado ao lado do nosso SKU. Sem esse vínculo não
        sincroniza preço nem estoque — e ele fica <b>aqui</b>, nunca dentro do texto do SKU:
        o SKU é nosso e é um só, o anúncio é deles e pode ser vários.
      </p>

      {canais.map((c) => (
        <div key={c.id} className="cartao" style={{ padding: 0, overflowX: "auto", marginBottom: 16 }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--borda)" }}>
            <b>{c.nome}</b>{" "}
            <code style={{ fontSize: "0.75rem", color: "var(--texto-fraco)" }}>{c.codigo}</code>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--texto-fraco)", fontSize: "0.7rem" }}>
                <th style={{ padding: "10px 16px", fontWeight: 600 }}>NOSSO SKU</th>
                <th style={{ padding: "10px 16px", fontWeight: 600 }}>CÓDIGO DO ANÚNCIO</th>
                <th style={{ padding: "10px 16px", fontWeight: 600 }}>CATEGORIA LÁ</th>
                <th style={{ padding: "10px 16px", fontWeight: 600 }}>SITUAÇÃO</th>
              </tr>
            </thead>
            <tbody>
              {skus.map((s) => {
                const it = achar(c.id, s.varianteId);
                return (
                  <tr key={s.varianteId} style={{ borderTop: "1px solid var(--borda)" }}>
                    <td style={{ padding: "10px 16px" }}>
                      <input type="hidden" name={`vinc__${c.id}__${s.varianteId}`} value="1" />
                      <code style={{ fontSize: "0.78rem" }}>{s.sku}</code>
                      <br />
                      <span style={{ color: "var(--texto-fraco)", fontSize: "0.78rem" }}>{s.rotulo}</span>
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      {s.publicavel ? (
                        <input
                          name={`ext__${c.id}__${s.varianteId}`}
                          defaultValue={it?.idExterno ?? ""}
                          placeholder="MLB1234567890"
                          disabled={!podeMexer}
                          style={{ width: 190, textTransform: "uppercase" }}
                          aria-label={`Código do anúncio de ${s.sku}`}
                        />
                      ) : (
                        <span style={{ color: "var(--alerta)", fontSize: "0.82rem" }}>
                          fora do marketplace — {s.modo}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "10px 16px" }}>
                      {s.publicavel ? (
                        <input
                          name={`cat__${c.id}__${s.varianteId}`}
                          defaultValue={it?.categoria ?? ""}
                          placeholder="MLB1234"
                          disabled={!podeMexer}
                          style={{ width: 130, textTransform: "uppercase" }}
                          aria-label={`Categoria de ${s.sku}`}
                        />
                      ) : null}
                    </td>
                    <td style={{ padding: "10px 16px", fontSize: "0.82rem" }}>
                      <span style={{ color: it?.status === "publicado" ? "var(--ok)" : it?.status === "erro" ? "var(--erro)" : "var(--texto-fraco)" }}>
                        {ROTULO_SYNC[it?.status ?? "nao_publicado"] ?? "não publicado"}
                      </span>
                      <br />
                      <span style={{ color: "var(--texto-fraco)", fontSize: "0.74rem" }}>
                        último sync: {quando(it?.ultimoSync ?? null)}
                      </span>
                      {it?.ultimoErro ? (
                        <>
                          <br />
                          <span style={{ color: "var(--erro)", fontSize: "0.74rem" }}>{it.ultimoErro}</span>
                        </>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {podeMexer ? (
        <button type="submit" disabled={enviando}>{enviando ? "Salvando…" : "Salvar vínculos"}</button>
      ) : (
        <p className="nota">Seu papel permite ver, mas não vincular.</p>
      )}

      {estado?.erro || estado?.ok ? (
        <p style={{ margin: "12px 0 0", fontSize: "0.88rem", color: estado.erro ? "var(--erro)" : "var(--ok)" }}>
          {estado.erro || estado.ok}
        </p>
      ) : null}

      <p style={{ color: "var(--texto-fraco)", fontSize: "0.82rem", marginTop: 18, borderLeft: "3px solid var(--borda)", paddingLeft: 12 }}>
        Um anúncio, um SKU. Se dois produtos apontarem para o mesmo código, a venda cai no
        item errado e o eSIM errado é entregue — por isso a tela recusa.
      </p>
    </form>
  );
}
