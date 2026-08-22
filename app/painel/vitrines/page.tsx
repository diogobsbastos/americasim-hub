import { headers } from "next/headers";
import { db } from "../../../lib/db";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Vitrines — AmericaSim",
  robots: { index: false, follow: false },
};

// Por que esta tela existe (pedido de 21/08/2026): quem opera precisa ABRIR a
// loja e ver o cliente vendo. Ate agora as vitrines so existiam como linha na
// tabela `canal` e como vhost no Nginx — dois lugares que ninguem da operacao
// abre. Aqui elas viram uma lista com botao.
//
// O link sai do banco, NAO de uma constante no codigo. Se alguem cadastrar uma
// vitrine nova amanha, ela aparece aqui sozinha. Uma lista escrita a mao
// envelheceria no primeiro dia e passaria a mentir.
//
// DUAS FONTES para o dominio, e isso nao e descuido: a tela de Pagamentos
// (20/08) grava e le `canal.config->>'dominio'`, enquanto a coluna
// `canal.dominio` e mais antiga e hoje guarda 'localhost' na loja principal.
// A convencao nova ganha; a coluna fica de rede de seguranca. Escolher so uma
// deixaria esta tela discordando da outra em silencio — que e exatamente o tipo
// de divergencia que ninguem descobre ate o cliente reclamar.

interface Linha {
  codigo: string;
  nome: string;
  dominio: string | null;
  ativo: boolean;
  visiveis: number;
  destaques: number;
  total: number;
}

// Um dominio so vira link se for mesmo um endereco publico. "localhost" e o
// vazio viram AVISO, nunca um botao quebrado: botao que abre aba em branco faz
// a pessoa achar que a loja caiu.
function ehPublico(d: string | null): boolean {
  if (!d) return false;
  const x = d.trim().toLowerCase();
  if (!x || x === "localhost" || x.startsWith("127.") || x.startsWith("0.")) return false;
  return x.includes(".");
}

export default async function Vitrines() {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const hostPainel = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(":")[0];

  let linhas: Linha[] = [];
  let falhou = "";
  try {
    const r = await db.query(
      `select c.codigo, c.nome, c.ativo,
              coalesce(nullif(c.config->>'dominio', ''), c.dominio) as dominio,
              count(cv.variante_id) filter (where cv.visivel)  as visiveis,
              count(cv.variante_id) filter (where cv.destaque) as destaques,
              count(cv.variante_id)                            as total
         from canal c
         left join canal_variante cv on cv.canal_id = c.id
        where c.tipo = 'landing'::tipo_canal
        group by c.id, c.codigo, c.nome, c.config, c.dominio, c.ativo
        order by c.codigo`,
    );
    linhas = r.rows.map((x: any) => ({
      codigo: x.codigo,
      nome: x.nome,
      dominio: x.dominio,
      ativo: x.ativo,
      visiveis: Number(x.visiveis ?? 0),
      destaques: Number(x.destaques ?? 0),
      total: Number(x.total ?? 0),
    }));
  } catch {
    falhou = "Não consegui ler os canais no banco.";
  }

  return (
    <>
      <div className="pn-cabeca">
        <h1>Vitrines</h1>
        <p>
          As lojas que estão no ar, com o endereço de cada uma. O botão abre em outra aba,
          para você conferir a loja como o cliente a vê sem perder o painel.
        </p>
      </div>

      {falhou ? (
        <div className="cartao" style={{ borderLeft: "4px solid var(--erro)", marginBottom: 18 }}>
          <p style={{ margin: 0, color: "var(--erro)" }}>{falhou}</p>
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))",
        }}
      >
        {linhas.map((l) => {
          const publico = ehPublico(l.dominio);
          // A vitrine sem dominio proprio e a que responde no dominio deste
          // painel — e a loja principal. Cair para o host atual e o unico jeito
          // de o botao funcionar sem eu chutar um endereco.
          const alvo = publico ? `https://${l.dominio}` : `${proto}://${hostPainel}`;
          const podeAbrir = publico || !!hostPainel;

          return (
            <div key={l.codigo} className="cartao">
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{l.nome}</h2>
                <span style={{ color: "var(--texto-fraco)", fontSize: "0.78rem" }}>
                  {l.codigo}
                </span>
              </div>

              <p
                style={{
                  margin: "8px 0 0",
                  fontSize: "0.86rem",
                  color: l.ativo ? "var(--ok)" : "var(--erro)",
                }}
              >
                {l.ativo ? "Canal ativo" : "Canal desativado — não vende"}
              </p>

              <p
                style={{
                  margin: "12px 0 0",
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                  fontSize: "0.82rem",
                  wordBreak: "break-all",
                }}
              >
                {alvo}
              </p>

              {!publico ? (
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: "0.78rem",
                    color: "var(--alerta)",
                    lineHeight: 1.5,
                  }}
                >
                  O domínio gravado no banco é{" "}
                  <b>{l.dominio ? l.dominio : "(vazio)"}</b>, que não é um endereço público.
                  O botão abaixo usa o domínio deste painel, que é onde esta loja responde
                  hoje. Vale corrigir o cadastro para o link parar de depender disso.
                </p>
              ) : null}

              <p style={{ margin: "12px 0 0", fontSize: "0.84rem", color: "var(--texto-fraco)" }}>
                {l.visiveis} de {l.total} variantes visíveis
                {l.destaques > 0 ? ` · ${l.destaques} em destaque` : ""}
              </p>
              {l.visiveis === 0 ? (
                <p style={{ margin: "6px 0 0", fontSize: "0.78rem", color: "var(--alerta)" }}>
                  Nenhuma variante visível — esta loja abre vazia para o cliente.
                </p>
              ) : null}

              <p style={{ margin: "16px 0 0" }}>
                {podeAbrir ? (
                  <a className="botao" href={alvo} target="_blank" rel="noopener noreferrer">
                    Abrir a loja ↗
                  </a>
                ) : (
                  <span className="botao secundario" style={{ opacity: 0.6 }}>
                    Sem endereço
                  </span>
                )}
              </p>
            </div>
          );
        })}

        {/* Nao e um canal: nao vende, nao tem catalogo, nao esta na tabela.
            Aparece aqui porque quem opera procura "as paginas do site" neste
            lugar, e some-la faria a lista parecer incompleta. */}
        <div className="cartao" style={{ borderStyle: "dashed" }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Site institucional</h2>
            <span style={{ color: "var(--texto-fraco)", fontSize: "0.78rem" }}>não é canal</span>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: "0.86rem", color: "var(--texto-fraco)" }}>
            Página em construção, no domínio definitivo. Não vende e não tem catálogo.
          </p>
          <p
            style={{
              margin: "12px 0 0",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "0.82rem",
            }}
          >
            https://americasim.com.br
          </p>
          <p style={{ margin: "16px 0 0" }}>
            <a
              className="botao secundario"
              href="https://americasim.com.br"
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir ↗
            </a>
          </p>
        </div>
      </div>

      <p
        style={{
          color: "var(--texto-fraco)",
          fontSize: "0.82rem",
          marginTop: 22,
          borderLeft: "3px solid var(--borda)",
          paddingLeft: 12,
        }}
      >
        <b>As duas lojas dividem o mesmo estoque.</b> Vender numa derruba o número na outra no
        mesmo segundo — isso não é recurso, é consequência do desenho: <code>estoque_esim</code>{" "}
        não tem canal. O que muda por vitrine é preço, visibilidade e identidade.
      </p>
    </>
  );
}
