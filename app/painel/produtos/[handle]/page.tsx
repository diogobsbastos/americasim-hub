import Link from "next/link";
import { db } from "../../../../lib/db";
import { usuarioDaSessao } from "../../../../lib/painel/sessao";
import Matriz, { type Canal, type Linha } from "./Matriz";
import FormProduto from "./FormProduto";

export const dynamic = "force-dynamic";

export const metadata = { title: "Produto — AmericaSim", robots: { index: false, follow: false } };

// "5 GB · 15 dias" a partir do jsonb de atributos. Cai para o proprio JSON se o
// formato mudar: melhor mostrar cru do que esconder que existe atributo novo.
function rotuloVariante(a: any): string {
  if (!a || typeof a !== "object") return "—";
  const partes: string[] = [];
  if (a.gb != null) partes.push(`${a.gb} GB`);
  if (a.dias != null) partes.push(`${a.dias} dias`);
  if (partes.length) return partes.join(" · ");
  const chaves = Object.keys(a).filter((k) => k !== "cobertura");
  if (!chaves.length) return "—";
  return chaves.map((k) => `${k}: ${JSON.stringify(a[k])}`).join(" · ");
}

function dataCurta(d: string | Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default async function Produto({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const u = await usuarioDaSessao();
  const papel = u?.papel ?? "leitura";
  const podeDinheiro = papel === "admin";
  const podeVitrine = papel === "admin" || papel === "operacao";

  const p = await db.query(
    "select id, handle, nome, descricao, tipo::text as tipo, ativo from produto where handle = $1",
    [handle],
  );
  if (p.rows.length === 0) {
    return (
      <div className="aviso">
        <h1>Produto não encontrado</h1>
        <p className="nota">
          <Link href="/painel/produtos">← voltar para Produtos</Link>
        </p>
      </div>
    );
  }
  const prod = p.rows[0];

  const [vars, cans, cels, precos, param, hist] = await Promise.all([
    db.query(
      `select v.id, v.sku, v.atributos, v.custo::text as custo, v.custo_moeda, v.ativo,
              cv.disponivel, cv.fonte_custo, cv.custo_brl_efetivo::text as custo_brl
         from variante v
         join custo_variante cv on cv.variante_id = v.id
        where v.produto_id = $1
        order by v.sku`,
      [prod.id],
    ),
    db.query("select id, codigo, nome, tipo::text as tipo, moeda from canal where ativo order by tipo, codigo"),
    db.query(
      `select cv.canal_id, cv.variante_id, cv.visivel, cv.destaque
         from canal_variante cv join variante v on v.id = cv.variante_id
        where v.produto_id = $1`,
      [prod.id],
    ),
    db.query(
      `select pr.canal_id, pr.variante_id, pr.valor::text as valor
         from preco pr join variante v on v.id = pr.variante_id
        where v.produto_id = $1 and pr.vigencia_fim is null`,
      [prod.id],
    ),
    db.query("select valor, atualizado_por from parametro where chave = 'cambio.usd_brl'"),
    db.query(
      `select v.sku, c.codigo as canal, pr.valor::text as valor, pr.vigencia_inicio, pr.vigencia_fim
         from preco pr
         join variante v on v.id = pr.variante_id
         join canal c on c.id = pr.canal_id
        where v.produto_id = $1 and pr.vigencia_fim is not null
        order by pr.vigencia_fim desc limit 12`,
      [prod.id],
    ),
  ]);

  const cambio = Number(param.rows[0]?.valor ?? 0);
  const cambioConfirmado = Boolean(param.rows[0]?.atualizado_por);

  const canais: Canal[] = cans.rows.map((c: any) => ({
    id: c.id, codigo: c.codigo, nome: c.nome, tipo: c.tipo, moeda: c.moeda,
  }));

  const linhas: Linha[] = vars.rows.map((v: any) => {
    const celulas: Linha["celulas"] = {};
    for (const c of canais) {
      const cel = cels.rows.find((x: any) => x.canal_id === c.id && x.variante_id === v.id);
      const pr = precos.rows.find((x: any) => x.canal_id === c.id && x.variante_id === v.id);
      celulas[c.id] = {
        visivel: cel?.visivel ?? false,
        destaque: cel?.destaque ?? false,
        preco: pr ? String(pr.valor).replace(".", ",") : "",
      };
    }
    return {
      varianteId: v.id,
      sku: v.sku,
      rotulo: rotuloVariante(v.atributos),
      custo: v.custo ? String(v.custo).replace(".", ",") : "",
      custoMoeda: v.custo_moeda,
      custoBrl: v.custo_brl,
      fonteCusto: v.fonte_custo,
      disponivel: Number(v.disponivel ?? 0),
      celulas,
    };
  });

  const semCusto = linhas.filter((l) => l.fonteCusto === "indisponivel");
  const esgotadoVisivel = linhas.filter(
    (l) => l.disponivel === 0 && canais.some((c) => l.celulas[c.id]?.visivel),
  );

  return (
    <>
      <div className="pn-cabeca">
        <h1>{prod.nome}</h1>
        <p>
          <code>{prod.handle}</code> · {prod.tipo} · {prod.ativo ? "ativo" : "inativo"} ·{" "}
          {linhas.length} variante{linhas.length === 1 ? "" : "s"} ·{" "}
          <Link href={`/painel/produtos/${prod.handle}/estoque`}>estoque e lotes</Link> ·{" "}
          <Link href="/painel/produtos">voltar</Link>
        </p>
      </div>

      {esgotadoVisivel.length > 0 ? (
        <div className="cartao perigo" style={{ marginBottom: 14 }}>
          <div className="rot">Visível na loja e sem estoque</div>
          <div className="val">{esgotadoVisivel.length}</div>
          <div className="pe">
            {esgotadoVisivel.map((l) => l.sku).join(", ")} — quem comprar paga e recebe erro.
          </div>
        </div>
      ) : null}

      {semCusto.length > 0 ? (
        <div className="cartao perigo" style={{ marginBottom: 14 }}>
          <div className="rot">Sem custo cadastrado</div>
          <div className="val">{semCusto.length}</div>
          <div className="pe">
            {semCusto.map((l) => l.sku).join(", ")} — sem custo não há margem, e sem margem o
            anúncio otimiza no escuro.
          </div>
        </div>
      ) : null}

      {!cambioConfirmado && linhas.some((l) => l.fonteCusto === "parametro") ? (
        <div className="faixa" style={{ marginBottom: 18 }}>
          O câmbio usado na margem é <strong>{cambio.toFixed(2).replace(".", ",")}</strong> e{" "}
          <strong>ninguém confirmou esse número</strong> — é a semente da migração. Enquanto for
          assim, a margem das variantes sem lote comprado é aproximada, não apurada.
        </div>
      ) : null}

      <FormProduto
        handle={prod.handle}
        nome={prod.nome}
        descricao={prod.descricao ?? ""}
        ativo={prod.ativo}
        podeEditar={podeVitrine}
      />

      {canais.length === 0 ? (
        <div className="aviso">
          <h1>Nenhum canal ativo</h1>
          <p className="nota">A matriz precisa de pelo menos um canal para ter colunas.</p>
        </div>
      ) : (
        <Matriz
          handle={prod.handle}
          canais={canais}
          linhas={linhas}
          cambio={cambio}
          podeDinheiro={podeDinheiro}
          podeVitrine={podeVitrine}
        />
      )}

      {hist.rows.length > 0 ? (
        <>
          <h2 style={{ fontSize: "1.05rem", margin: "30px 0 4px" }}>Preços anteriores</h2>
          <p style={{ color: "var(--texto-fraco)", margin: "0 0 12px", fontSize: "0.88rem" }}>
            O histórico existe porque trocar preço fecha o antigo em vez de apagar.
          </p>
          <div className="cartao" style={{ padding: 0, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.88rem" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--texto-fraco)", fontSize: "0.72rem" }}>
                  <th style={{ padding: "10px 16px", fontWeight: 600 }}>VARIANTE</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600 }}>CANAL</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600 }}>VALEU DE</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600 }}>ATÉ</th>
                  <th style={{ padding: "10px 16px", fontWeight: 600, textAlign: "right" }}>VALOR</th>
                </tr>
              </thead>
              <tbody>
                {hist.rows.map((h: any, i: number) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--borda)" }}>
                    <td style={{ padding: "10px 16px" }}><code>{h.sku}</code></td>
                    <td style={{ padding: "10px 16px", color: "var(--texto-fraco)" }}>{h.canal}</td>
                    <td style={{ padding: "10px 16px", color: "var(--texto-fraco)" }}>{dataCurta(h.vigencia_inicio)}</td>
                    <td style={{ padding: "10px 16px", color: "var(--texto-fraco)" }}>{dataCurta(h.vigencia_fim)}</td>
                    <td style={{ padding: "10px 16px", textAlign: "right" }}>
                      R$ {String(h.valor).replace(".", ",")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </>
  );
}
