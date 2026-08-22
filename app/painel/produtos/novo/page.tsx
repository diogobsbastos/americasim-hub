import Link from "next/link";
import { db } from "../../../../lib/db";
import FormNovo from "./FormNovo";
import type { FamiliaOpcao } from "./tipos";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Novo produto — AmericaSim",
  robots: { index: false, follow: false },
};

export default async function NovoProduto() {
  const r = await db.query("select handle, nome from produto order by nome");
  const familias: FamiliaOpcao[] = r.rows.map((x: any) => ({ handle: x.handle, nome: x.nome }));

  return (
    <>
      <div className="pn-cabeca">
        <h1>Novo produto</h1>
        <p>
          Um produto aqui e um item vendavel: um SKU, com seu preco, seu custo e seu anuncio.
          A familia so agrupa na lista.
        </p>
        <p style={{ fontSize: "0.88rem" }}>
          <Link href="/painel/produtos">← voltar para a lista</Link>
        </p>
      </div>

      <FormNovo familias={familias} />
    </>
  );
}
