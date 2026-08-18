import QRCode from "qrcode";
import { autenticar, erro } from "../../../../lib/api";
import { lerCodigo } from "../../../../lib/cripto-esim";
import { db } from "../../../../lib/db";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /v1/ativacoes/{id} — o produto propriamente dito (SPEC/03 rev. 18/08).
// E POST de proposito: a confirmacao por e-mail vai no CORPO — em GET ela iria na
// query string e cairia no access log do Nginx (LGPD).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const canal = await autenticar(req, "pedidos");
  if (canal instanceof Response) return canal;

  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return erro(404, "nao_encontrado", "Ativacao nao encontrada.");

  let corpo: any;
  try {
    corpo = await req.json();
  } catch {
    return erro(400, "corpo_invalido", "JSON invalido.");
  }
  const email = corpo?.email;
  if (!email || typeof email !== "string") {
    return erro(400, "corpo_invalido", "email e obrigatorio no corpo.");
  }

  // O bytea sai CRU daqui. O `convert_from(..., 'UTF8')` de antes so funcionava
  // com texto claro; agora quem transforma bytes em codigo e o Node, com a
  // chave que o servidor de banco nao tem — que e o ponto inteiro da mudanca
  // (migracao 005 + lib/cripto-esim).
  const r = await db.query(
    `select a.status, e.codigo_lpa as codigo, e.cifrado, e.iccid
       from ativacao a
       join pedido p on p.id = a.pedido_id and p.canal_id = $2
       join cliente c on c.id = p.cliente_id and lower(c.email::text) = lower($3)
       left join estoque_esim e on e.id = a.estoque_id
      where a.id = $1`,
    [id, canal.id, email],
  );
  if (r.rows.length === 0) return erro(404, "nao_encontrado", "Ativacao nao encontrada.");

  const a = r.rows[0];

  // O left join deixa `codigo` nulo quando ainda nao ha eSIM alocado — isso e
  // estado normal (pedido pago, entrega pendente), nao erro.
  let lpa = "";
  if (a.codigo) {
    try {
      lpa = lerCodigo(a.codigo, a.cifrado === true);
    } catch (e) {
      // Chave errada, registro adulterado ou versao de cifra desconhecida.
      // Devolver 200 com o codigo vazio faria o cliente ver uma tela de sucesso
      // sem produto e abrir chamado no atendimento sem ninguem saber por que.
      // Melhor falhar alto: o erro fica no log com o id da ativacao.
      console.error(`ativacoes ${id}: falha ao ler o codigo do eSIM:`, e);
      return erro(
        500,
        "codigo_ilegivel",
        "Nao foi possivel ler o codigo deste eSIM. O atendimento ja tem o registro.",
      );
    }
  }

  const partes = lpa.split("$"); // LPA:1$<smdp>$<codigo>

  // QR do proprio LPA. E a mesma imagem que vai no e-mail de entrega (o bloco do
  // e-mail reaproveita esta geracao). Falha aqui nao derruba a resposta: o codigo
  // manual abaixo continua sendo caminho valido de instalacao.
  let qr: string | null = null;
  if (lpa) {
    try {
      const dataUrl = await QRCode.toDataURL(lpa, { margin: 1, width: 320 });
      qr = dataUrl.split(",")[1] ?? null;
    } catch (e) {
      console.error("ativacoes: falha ao gerar QR:", e);
    }
  }

  return Response.json({
    status: a.status,
    qr_png_base64: qr,
    codigo_manual: { smdp: partes[1] ?? "", ativacao: partes[2] ?? "" },
    link_apple: `https://esimsetup.apple.com/esim_qrcode_provisioning?carddata=${encodeURIComponent(lpa)}`,
    link_android: lpa,
    instrucoes_url: null,
  });
}
