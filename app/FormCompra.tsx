import Link from "next/link";

// O cartao de plano nao coleta mais nada: o botao leva para /finalizar, onde
// vive o checkout de verdade (Google em 1 clique, e-mail, WhatsApp para o SAC).
// Pedir e-mail aqui e de novo la seria digitar duas vezes a mesma coisa.
export default function FormCompra({
  sku,
  disponivel,
  rotulo = "Comprar",
}: {
  sku: string;
  disponivel: boolean;
  rotulo?: string;
}) {
  if (!disponivel) {
    return (
      <div className="compra">
        <button type="button" disabled>Esgotado</button>
      </div>
    );
  }
  return (
    <div className="compra">
      <Link className="botao" href={`/finalizar?sku=${encodeURIComponent(sku)}`}>
        {rotulo}
      </Link>
    </div>
  );
}
