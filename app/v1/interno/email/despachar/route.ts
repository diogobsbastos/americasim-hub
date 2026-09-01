import QRCode from "qrcode";
import { conferirSegredo } from "../../segredo";
import { db } from "../../../../../lib/db";
import { lerCodigo } from "../../../../../lib/cripto-esim";
import { assinarAcompanhamento } from "../../../../../lib/token";
import { enviarEmailGmail, type AnexoEmail } from "../../../../../lib/email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /v1/interno/email/despachar — processa a fila `notificacao` (canal email).
// Quem chama e o worker: quando um `entrega.notificar` acaba de inserir na fila
// (reação em ms via NOTIFY) e, de tempos em tempos, como rede de segurança para
// retentativas. A reivindicação do lote e atomica (UPDATE…WHERE…SKIP LOCKED):
// duas chamadas simultaneas nunca mandam o mesmo e-mail.
//
// Modelos:
//   entrega_qr — o e-mail DO PRODUTO: QR anexado, codigo manual e link assinado
//               da pagina do pedido (valido por 1 ano — o e-mail E o link que o
//               cliente guarda).
const MAX_TENTATIVAS = 8;

export async function POST(req: Request) {
  const porta = await conferirSegredo(req);
  if (!porta.ok) return Response.json({ erro: porta.motivo }, { status: porta.status });

  // Reivindica ate 5 devidas: marca a tentativa e empurra proxima_em para
  // frente — se este processo morrer no meio, a linha volta sozinha depois.
  const lote = await db.query(
    `update notificacao n
        set tentativas = n.tentativas + 1,
            proxima_em = now() + interval '10 minutes'
      where n.id in (
              select id from notificacao
               where canal = 'email' and status = 'pendente'
                 and (proxima_em is null or proxima_em <= now())
               order by criado_em
               for update skip locked
               limit 5)
      returning n.id, n.destino, n.referencia, n.modelo, n.payload, n.tentativas`,
  );

  let enviadas = 0, falhas = 0, esgotadas = 0;
  for (const n of lote.rows) {
    try {
      const conteudo = await montar(n.modelo, n.payload ?? {});
      const r = await enviarEmailGmail({ para: n.destino, ...conteudo });
      if (!r.ok) throw new Error(r.detalhe);
      await db.query(
        `update notificacao set status = 'enviada', enviada_em = now(), ultimo_erro = null where id = $1`,
        [n.id],
      );
      enviadas += 1;
      console.log(`notificacao ${n.referencia}: enviada para ${n.destino}`);
    } catch (e: any) {
      const msg = String(e?.message ?? e).slice(0, 500);
      const esgotou = n.tentativas >= MAX_TENTATIVAS;
      await db.query(
        `update notificacao
            set ultimo_erro = $2,
                status = case when $3 then 'esgotada'::status_notificacao else status end,
                proxima_em = now() + (interval '1 minute') * least(power(2, tentativas), 120)
          where id = $1`,
        [n.id, msg, esgotou],
      );
      if (esgotou) esgotadas += 1; else falhas += 1;
      console.error(`notificacao ${n.referencia}: falhou (${n.tentativas}ª) -> ${msg}`);
    }
  }

  return Response.json({ ok: true, enviadas, falhas, esgotadas, restantes_no_lote: lote.rows.length });
}

async function montar(modelo: string, payload: any): Promise<{ assunto: string; html: string; deNome?: string; anexos?: AnexoEmail[] }> {
  if (modelo === "entrega_qr") return montarEntrega(String(payload?.pedido_id ?? ""));
  if (modelo === "generico") {
    return { assunto: String(payload?.assunto ?? "AmericaSim"), html: String(payload?.html ?? "") };
  }
  throw new Error(`modelo de notificacao desconhecido: ${modelo}`);
}

async function montarEntrega(pedidoId: string) {
  if (!pedidoId) throw new Error("payload sem pedido_id");
  const p = await db.query(
    `select ped.numero, cn.nome as canal_nome, cn.dominio
       from pedido ped join canal cn on cn.id = ped.canal_id
      where ped.id = $1`,
    [pedidoId],
  );
  if (p.rows.length === 0) throw new Error("pedido nao encontrado");
  const { numero, canal_nome, dominio } = p.rows[0];

  const marca = String(dominio ?? "").includes("viagemsim") ? "ViagemSim" : "AmericaSim";
  const base = dominio ? `https://${dominio}` : "https://americasim.com.br";
  const link = `${base}/pedido?pedido=${encodeURIComponent(numero)}&t=${encodeURIComponent(assinarAcompanhamento(numero, 24 * 365))}`;

  const a = await db.query(
    `select e.codigo_lpa, e.cifrado, e.iccid
       from ativacao at join estoque_esim e on e.id = at.estoque_id
      where at.pedido_id = $1 and at.status in ('entregue','instalado')
      order by at.criado_em`,
    [pedidoId],
  );

  const anexos: AnexoEmail[] = [];
  const blocos: string[] = [];
  let i = 0;
  for (const linha of a.rows) {
    i += 1;
    let lpa = "";
    try { lpa = linha.codigo_lpa ? lerCodigo(linha.codigo_lpa, linha.cifrado === true) : ""; } catch { lpa = ""; }
    if (!lpa) continue;
    const dataUrl = await QRCode.toDataURL(lpa, { margin: 1, width: 360 });
    anexos.push({ nome: `esim-${i}.png`, tipo: "image/png", base64: dataUrl.split(",")[1] ?? "" });
    const partes = lpa.split("$");
    blocos.push(
      `<tr><td style="padding:12px 0;border-top:1px solid #e5e5e5">` +
        `<p style=\"margin:0 0 6px;font-weight:bold\">eSIM ${i}${linha.iccid ? ` · chip …${String(linha.iccid).slice(-5)}` : ""}</p>` +
        `<p style=\"margin:0 0 4px\">QR code: <b>anexo esim-${i}.png</b> (abra e escaneie)</p>` +
        `<p style=\"margin:0;font-size:13px;color:#555\">Código manual — SM-DP+: <code>${partes[1] ?? ""}</code> · Ativação: <code>${partes[2] ?? ""}</code></p>` +
      `</td></tr>`,
    );
  }
  if (anexos.length === 0) throw new Error("pedido entregue sem codigo legivel para anexar");

  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">` +
    `<h2 style="color:#0f2a4a">${marca}</h2>` +
    `<p>Seu eSIM chegou! Pedido <b>${numero}</b>.</p>` +
    `<table style="width:100%;border-collapse:collapse">${blocos.join("")}</table>` +
    `<p style="margin:18px 0"><a href="${link}" style="background:#0f2a4a;color:#fff;padding:12px 22px;text-decoration:none;border-radius:6px;display:inline-block">Acompanhar pedido, status e QR</a></p>` +
    `<p style="font-size:13px;color:#555">Instale com Wi-Fi e só ative quando chegar ao destino — o plano começa a contar na primeira conexão. Guarde este e-mail: o botão acima é o seu acesso ao pedido.</p>` +
    `</div>`;

  return { assunto: `Seu eSIM chegou — pedido ${numero} (${marca})`, html, deNome: marca, anexos };
}
