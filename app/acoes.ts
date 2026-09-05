"use server";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { apiPost, basePublica } from "../lib/vitrine";
import {
  COOKIE_VISITA,
  COOKIE_ULTIMO,
  COOKIE_PRIMEIRO,
  decodificar,
  paraApi,
} from "../lib/atribuicao";
import type { EstadoCompra, EstadoEsim } from "./tipos";
import { ESTADO_ESIM_INICIAL } from "./tipos";

// Le os cookies de origem gravados pelo middleware e monta o bloco que vai no
// corpo do checkout (migracao 004). Nunca lanca: cookie ausente ou adulterado
// custa a atribuicao de uma venda; lancar aqui custaria a venda inteira.
async function atribuicaoDosCookies() {
  try {
    const c = await cookies();
    const visita = c.get(COOKIE_VISITA)?.value;
    const ultimo = paraApi(decodificar(c.get(COOKIE_ULTIMO)?.value));
    const primeiro = paraApi(decodificar(c.get(COOKIE_PRIMEIRO)?.value));
    if (!visita && !ultimo && !primeiro) return undefined;
    return { visita_id: visita, ultimo, primeiro };
  } catch {
    return undefined;
  }
}

// Normaliza o WhatsApp digitado para +55DDDNUMERO. Aceita com ou sem +55, com
// ou sem mascara. Devolve null quando nao da para aproveitar: a validacao
// conversa com o cliente na tela — lixo nao entra no banco, porque este numero
// e o canal do SAC em viagem.
function normalizarZap(bruto: string): string | null {
  const digitos = bruto.replace(/\D/g, "");
  const semPais =
    digitos.startsWith("55") && digitos.length >= 12 ? digitos.slice(2) : digitos;
  // DDD (2 digitos) + numero (8 fixo ou 9 celular).
  if (semPais.length !== 10 && semPais.length !== 11) return null;
  return `+55${semPais}`;
}

// POST /v1/checkout, chamado pela pagina /finalizar. Em modo dev (sem
// STRIPE_SECRET_KEY) a API considera pago e entrega na hora, entao o
// redirecionamento cai direto na pagina do pedido.
export async function finalizarCompra(_anterior: EstadoCompra, form: FormData): Promise<EstadoCompra> {
  const sku = String(form.get("sku") ?? "");
  const email = String(form.get("email") ?? "").trim();
  const tentativa = String(form.get("tentativa") ?? "");
  const telefone = normalizarZap(String(form.get("telefone") ?? ""));

  if (!sku) return { erro: "Produto invalido." };
  if (!email.includes("@")) return { erro: "Informe um e-mail valido." };
  if (!telefone) {
    return { erro: "Informe um WhatsApp valido com DDD — ex.: (11) 91234-5678." };
  }

  // Idempotency-Key DERIVADA (SPEC/00 3.4): tentativa desta tela + carrinho + cliente.
  // Duplo-clique no mesmo formulario colide e devolve o MESMO pedido; recarregar a
  // pagina gera outra tentativa e permite comprar de novo.
  const chaveIdem = createHash("sha256")
    .update(`${tentativa}|${sku}|${email.toLowerCase()}`)
    .digest("hex")
    .slice(0, 32);

  const base = await basePublica();
  const r = await apiPost(
    "/v1/checkout",
    {
      itens: [{ sku, quantidade: 1 }],
      cliente: { email, telefone },
      url_sucesso: `${base}/pedido`,
      atribuicao: await atribuicaoDosCookies(),
    },
    { "idempotency-key": chaveIdem },
  );

  if (!r.ok) {
    if (r.erro_codigo === "estoque_indisponivel") {
      return { erro: "Acabou o estoque desta opcao. Escolha outra." };
    }
    return { erro: `${r.erro_mensagem} (${r.erro_codigo})` };
  }

  const url = String(r.dados?.pagamento?.url ?? "");
  if (!url) return { erro: "A API nao devolveu a URL de retorno." };

  redirect(url);
}

// POST /v1/ativacoes/{id} — o e-mail vai no CORPO, nunca na query string:
// em GET ele cairia no access log do Nginx (LGPD). E o que prova que quem esta
// pedindo o eSIM e o dono do pedido.
export async function revelar(_anterior: EstadoEsim, form: FormData): Promise<EstadoEsim> {
  const id = String(form.get("ativacao_id") ?? "");
  const email = String(form.get("email") ?? "").trim();

  if (!email.includes("@")) {
    return { ...ESTADO_ESIM_INICIAL, erro: "Informe o e-mail usado na compra." };
  }

  const r = await apiPost(`/v1/ativacoes/${encodeURIComponent(id)}`, { email });
  if (!r.ok) {
    const msg =
      r.erro_codigo === "nao_encontrado"
        ? "Nao encontramos esta ativacao para esse e-mail."
        : `${r.erro_mensagem} (${r.erro_codigo})`;
    return { ...ESTADO_ESIM_INICIAL, erro: msg };
  }

  const d = r.dados ?? {};
  return {
    erro: "",
    status: String(d.status ?? ""),
    smdp: String(d.codigo_manual?.smdp ?? ""),
    ativacao: String(d.codigo_manual?.ativacao ?? ""),
    link_apple: String(d.link_apple ?? ""),
    link_android: String(d.link_android ?? ""),
    qr: String(d.qr_png_base64 ?? ""),
  };
}
