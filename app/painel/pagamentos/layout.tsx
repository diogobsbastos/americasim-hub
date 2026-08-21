import Abas from "./Abas";

export const metadata = {
  title: "Pagamentos — AmericaSim",
  robots: { index: false, follow: false },
};

// Pagamentos e area PROPRIA, separada de Conexoes, desde 21/08/2026.
//
// Estavam juntas porque as duas sao "ligacoes com o mundo". Mas sao coisas
// diferentes para quem opera: Conexoes e ONDE A GENTE VENDE (Mercado Livre,
// Amazon); Pagamentos e COMO A GENTE RECEBE. Quem entra aqui quer resolver
// dinheiro, nao anuncio — e misturar as duas fez a tela crescer sem hierarquia.
export default function LayoutPagamentos({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="pn-cabeca">
        <h1>Pagamentos</h1>
        <p>
          Como o dinheiro entra: a conta que recebe, os domínios onde as carteiras podem
          aparecer, e quanto de cada venda é comissão. Mexer aqui é só de admin.
        </p>
      </div>
      <Abas />
      {children}
    </>
  );
}
