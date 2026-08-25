import Link from "next/link";
import AbasSku from "./AbasSku";

// O cabecalho repetido em todas as abas do SKU: quem e o item, quanto tem,
// quanto custa, quanto vende. Repetido de proposito — quem esta mexendo no
// estoque tambem quer ver o preco sem trocar de tela, e quem esta mexendo no
// preco quer ver o saldo antes de decidir.

const rot: React.CSSProperties = {
  display: "block", fontSize: "0.7rem", letterSpacing: "0.07em",
  textTransform: "uppercase", color: "var(--texto-fraco)", marginBottom: 3,
};

export type ResumoSku = {
  sku: string;
  familia: string;
  pacote: string;
  ativo: boolean;
  livre: number;
  custo: string | null;
  custoMoeda: string;
  custoBrl: string | null;
  fonteCusto: string | null;
  preco: string | null;
  fornecedor: string | null;
  modo: string;
  anuncio: string | null;
};

export default function Cabeca({ r, aba }: { r: ResumoSku; aba: string }) {
  return (
    <>
      <div className="pn-cabeca">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ marginBottom: 4 }}>{r.familia} {r.pacote}</h1>
            <code style={{ color: "var(--texto-fraco)" }}>{r.sku}</code>
            {r.ativo ? null : <span style={{ color: "var(--erro)" }}> · inativo</span>}
          </div>
          <Link href="/painel/produtos" className="botao secundario">← Produtos</Link>
        </div>
      </div>

      <div className="cartao" style={{ marginBottom: 18 }}>
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
          <div>
            <span style={rot}>Saldo</span>
            <b style={{ fontSize: "1.25rem", color: r.livre > 0 ? "var(--ok)" : "var(--erro)" }}>
              {r.livre > 0 ? r.livre : "esgotado"}
            </b>
          </div>
          <div>
            <span style={rot}>Custo</span>
            <b>{r.custo ? `${r.custoMoeda} ${Number(r.custo).toFixed(2)}` : "—"}</b>
            {r.custoBrl ? (
              <div style={{ fontSize: "0.74rem", color: "var(--texto-fraco)" }}>
                R$ {Number(r.custoBrl).toFixed(2)} · {r.fonteCusto}
              </div>
            ) : null}
          </div>
          <div>
            <span style={rot}>Preço</span>
            <b>{r.preco ? `R$ ${Number(r.preco).toFixed(2)}` : <span style={{ color: "var(--alerta)" }}>sem preço</span>}</b>
          </div>
          <div>
            <span style={rot}>Fornecedor</span>
            <b>{r.fornecedor ?? <span style={{ color: "var(--alerta)" }}>sem fornecedor</span>}</b>
          </div>
          <div>
            <span style={rot}>Mercado Livre</span>
            <b>{r.anuncio ? <code style={{ fontSize: "0.8rem" }}>{r.anuncio}</code> : <span style={{ color: "var(--texto-fraco)" }}>não publicado</span>}</b>
          </div>
        </div>
      </div>

      <AbasSku sku={r.sku} atual={aba} />
    </>
  );
}
