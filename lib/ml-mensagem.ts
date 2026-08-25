import { db } from "./db";
import { lerCodigo } from "./cripto-esim";
import { mlFetch, tokenDoCanal } from "./mercadolivre";

// O codigo do eSIM pela conversa do Mercado Livre.
//
// Um lugar so, porque dois chamam: a rota interna (quando o pedido e entregue)
// e o botao "Reenviar" na tela da venda (quando a primeira falhou). Manter o
// texto em dois arquivos e garantir que um dia eles divirjam.
//
// O POST e feito direto, sem mlFetch, para devolver a resposta CRUA do ML em
// caso de recusa. O mlFetch resume o erro em uma linha — e quando o ML recusa
// mensagem, o motivo costuma estar no detalhe que o resumo joga fora.

export interface ResultadoMensagem {
  ok: boolean;
  enviados: number; // quantos codigos foram no texto
  erro: string; // vazio quando ok; senao a resposta inteira do ML (ate 900 chars)
}

export async function enviarCodigoPelaConversa(canalId: string, pedidoId: string): Promise<ResultadoMensagem> {
  const ped = await db.query(
    `select p.id_externo, c.config->>'usuario_marketplace' as vendedor_config
       from pedido p join canal c on c.id = p.canal_id
      where p.id = $1 and p.canal_id = $2`,
    [pedidoId, canalId],
  );
  const idMl = String(ped.rows[0]?.id_externo ?? "").trim();
  if (!idMl) return { ok: false, enviados: 0, erro: "este pedido nao tem numero do Mercado Livre" };

  const cods = await db.query(
    `select e.codigo_lpa, e.cifrado
       from ativacao a join estoque_esim e on e.id = a.estoque_id
      where a.pedido_id = $1 order by a.entregue_em`,
    [pedidoId],
  );
  const textos = cods.rows
    .map((l: any) => lerCodigo(l.codigo_lpa, !!l.cifrado))
    .filter(Boolean) as string[];
  if (textos.length === 0) {
    return { ok: false, enviados: 0, erro: "nenhum eSIM entregue neste pedido — nao ha codigo para mandar" };
  }

  // O pedido na fonte: pack_id, vendedor e comprador vem de la.
  let pedidoMl: any;
  try {
    pedidoMl = await mlFetch(canalId, `/orders/${idMl}`);
  } catch (e: any) {
    return { ok: false, enviados: 0, erro: `nao consegui ler o pedido ${idMl} no ML: ${String(e?.message ?? e)}` };
  }
  const pack = String(pedidoMl?.pack_id ?? pedidoMl?.id ?? idMl);
  const vendedor = String(pedidoMl?.seller?.id ?? ped.rows[0]?.vendedor_config ?? "");
  const comprador = String(pedidoMl?.buyer?.id ?? "");
  if (!vendedor || !comprador) {
    return { ok: false, enviados: 0, erro: `pedido ${idMl} sem vendedor (${vendedor || "?"}) ou comprador (${comprador || "?"})` };
  }

  const texto =
    "Obrigado pela compra! Seu eSIM esta pronto.\n\n" +
    textos.map((t) => `Codigo de ativacao:\n${t}`).join("\n\n") +
    "\n\nComo instalar: Ajustes > Dados moveis > Adicionar eSIM > Usar codigo QR > Inserir manualmente, e cole o codigo acima.\n" +
    "Ative so quando chegar ao destino: a validade comeca na primeira conexao.";

  const caminho = `/messages/packs/${pack}/sellers/${vendedor}?tag=post_sale`;
  const token = await tokenDoCanal(canalId);
  let r: Response;
  try {
    r = await fetch(`https://api.mercadolibre.com${caminho}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ from: { user_id: vendedor }, to: { user_id: comprador }, text: texto }),
      cache: "no-store",
      signal: AbortSignal.timeout(20000),
    });
  } catch (e: any) {
    return { ok: false, enviados: 0, erro: `rede: ${String(e?.message ?? e)} em POST ${caminho}` };
  }
  const bruto = await r.text();
  if (r.ok) return { ok: true, enviados: textos.length, erro: "" };
  return { ok: false, enviados: 0, erro: `HTTP ${r.status} em POST ${caminho} — ${bruto.slice(0, 900)}` };
}
