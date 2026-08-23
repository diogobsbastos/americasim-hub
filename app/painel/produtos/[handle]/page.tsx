import Link from "next/link";
import { db } from "../../../../lib/db";
import { usuarioDaSessao } from "../../../../lib/painel/sessao";
import FormProduto from "./FormProduto";
import Abas from "./Abas";

export const dynamic = "force-dynamic";

export const metadata = { title: "Produto — AmericaSim", robots: { index: false, follow: false } };

// Aba DADOS do produto (22/08/2026).
//
// A matriz de canais e o historico de preco saíram daqui para `/canais`. O que
// ficou e o que se quer ver ao abrir um produto: quais SKUs existem, de quem
// vem cada um, quanto custa e quanto tem.
//
// Os avisos continuam AQUI, e nao numa aba: esgotado no ar e custo faltando sao
// coisas que precisam interromper quem abriu a tela, nao esperar um clique.

const ROTULO_MODO: Record<string, string> = {
  estoque: "de estoque",
  operadora_fixo: "operadora, plano fixo",
  operadora_sob_medida: "operadora, sob medida",
};

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

export default async function Produto({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const u = await usuarioDaSessao();
  const papel = u?.papel ?? "leitura";
  const podeVitrine = papel === "admin" || papel === "operacao";

  const p = await db.query(
    "select id, handle, nome, descricao, tipo::text as tipo, ativo from produto where handle = $1",
    [handle],
  );
  if (p.rows.length === 0) {
    return (
      <div className="aviso">
        <h1>Produto não encontrado</h1>
        <p className="nota"><Link href="/painel/produtos">← voltar para Produtos</Link></p>
      </div>
    );
  }
  const prod = p.rows[0];

  const [vars, param] = await Promise.all([
    db.query(
      `select v.id, v.sku, v.atributos, v.ativo,
              v.custo::text as custo, v.custo_moeda,
              v.modo_entrega::text as modo, v.publicavel_marketplace,
              f.nome as fornecedor,
              cv.disponivel, cv.fonte_custo,
              exists (select 1 from canal_variante cx
                       where cx.variante_id = v.id and cx.visivel) as na_vitrine
         from variante v
         left join fornecedor f on f.id = v.fornecedor_id
         join custo_variante cv on cv.variante_id = v.id
        where v.produto_id = $1
        order by v.sku`,
      [prod.id],
    ),
    db.query("select valor, atualizado_por from parametro where chave = 'cambio.usd_brl'"),
  ]);

  const linhas = vars.rows;
  const cambio = Number(param.rows[0]?.valor ?? 0);
  const cambioConfirmado = Boolean(param.rows[0]?.atualizado_por);

  // So conta como esgotado quem tem prateleira: item de operadora nao tem saldo
  // por desenho, e o zero dele nao e falta de nada.
  const esgotadoVisivel = linhas.filter(
    (l: any) => l.modo === "estoque" && Number(l.disponivel) === 0 && l.na_vitrine,
  );
  const semCusto = linhas.filter((l: any) => l.fonte_custo === "indisponivel");
  const semForn = linhas.filter((l: any) => !l.fornecedor);

  return (
    <>
      <div className="pn-cabeca">
        <h1>{prod.nome}</h1>
        <p>
          <code>{prod.handle}</code> · {prod.tipo} · {prod.ativo ? "ativo" : "inativo"} ·{" "}
          {linhas.length} SKU{linhas.length === 1 ? "" : "s"} ·{" "}
          <Link href="/painel/produtos">voltar para a lista</Link>
        </p>
      </div>

      <Abas handle={prod.handle} atual="dados" />

      {esgotadoVisivel.length > 0 ? (
        <div className="cartao perigo" style={{ marginBottom: 14 }}>
          <div className="rot">Visível na loja e sem estoque</div>
          <div className="val">{esgotadoVisivel.length}</div>
          <div className="pe">
            {esgotadoVisivel.map((l: any) => l.sku).join(", ")} — quem comprar paga e recebe erro.
          </div>
        </div>
      ) : null}

      {semCusto.length > 0 ? (
        <div className="cartao perigo" style={{ marginBottom: 14 }}>
          <div className="rot">Sem custo cadastrado</div>
          <div className="val">{semCusto.length}</div>
          <div className="pe">
            {semCusto.map((l: any) => l.sku).join(", ")} — sem custo não há margem, e sem margem
            o anúncio otimiza no escuro.
          </div>
        </div>
      ) : null}

      {semForn.length > 0 ? (
        <div className="cartao perigo" style={{ marginBottom: 14 }}>
          <div className="rot">Sem fornecedor</div>
          <div className="val">{semForn.length}</div>
          <div className="pe">
            Custo sem dono. <Link href={`/painel/produtos/${prod.handle}/fornecedor`}>Amarrar agora →</Link>
          </div>
        </div>
      ) : null}

      {!cambioConfirmado && linhas.some((l: any) => l.fonte_custo === "parametro") ? (
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

      <h2 style={{ fontSize: "1.05rem", margin: "30px 0 4px" }}>Variações</h2>
      <p style={{ color: "var(--texto-fraco)", margin: "0 0 12px", fontSize: "0.88rem" }}>
        Cada uma é um item vendável, com SKU próprio. Preço e visibilidade por canal ficam na
        aba <Link href={`/painel/produtos/${prod.handle}/canais`}>Canais e preços</Link>.
      </p>

      <div className="cartao" style={{ padding: 0, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
          <thead>
            <tr style={{ textAlign: "left", color: "var(--texto-fraco)", fontSize: "0.72rem" }}>
              <th style={{ padding: "11px 16px", fontWeight: 600 }}>SKU</th>
              <th style={{ padding: "11px 16px", fontWeight: 600 }}>PACOTE</th>
              <th style={{ padding: "11px 16px", fontWeight: 600 }}>FORNECEDOR</th>
              <th style={{ padding: "11px 16px", fontWeight: 600 }}>ENTREGA</th>
              <th style={{ padding: "11px 16px", fontWeight: 600, textAlign: "right" }}>SALDO</th>
              <th style={{ padding: "11px 16px", fontWeight: 600, textAlign: "right" }}>CUSTO</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l: any) => {
              const deEstoque = l.modo === "estoque";
              const zerado = deEstoque && Number(l.disponivel) === 0;
              return (
                <tr key={l.id} style={{ borderTop: "1px solid var(--borda)" }}>
                  <td style={{ padding: "11px 16px" }}>
                    <code style={{ fontSize: "0.8rem" }}>{l.sku}</code>
                    {l.ativo ? null : (<span style={{ color: "var(--texto-fraco)", fontSize: "0.78rem" }}> · inativo</span>)}
                  </td>
                  <td style={{ padding: "11px 16px" }}>{rotuloVariante(l.atributos)}</td>
                  <td style={{ padding: "11px 16px", fontSize: "0.86rem" }}>
                    {l.fornecedor ?? (
                      <Link href={`/painel/produtos/${prod.handle}/fornecedor`} style={{ color: "var(--alerta)" }}>
                        sem fornecedor
                      </Link>
                    )}
                  </td>
                  <td style={{ padding: "11px 16px", color: "var(--texto-fraco)", fontSize: "0.82rem" }}>
                    {ROTULO_MODO[l.modo] ?? l.modo}
                    {l.publicavel_marketplace ? null : (<><br /><span style={{ fontSize: "0.74rem" }}>fora do marketplace</span></>)}
                  </td>
                  <td style={{ padding: "11px 16px", textAlign: "right" }}>
                    {deEstoque ? (
                      <span style={{ color: zerado ? "var(--erro)" : "var(--ok)" }}>{Number(l.disponivel)}</span>
                    ) : (
                      <span style={{ color: "var(--texto-fraco)", fontSize: "0.82rem" }}>sob demanda</span>
                    )}
                  </td>
                  <td style={{ padding: "11px 16px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {l.custo ? `${l.custo_moeda} ${Number(l.custo).toFixed(2)}` : (<span style={{ color: "var(--alerta)" }}>—</span>)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
