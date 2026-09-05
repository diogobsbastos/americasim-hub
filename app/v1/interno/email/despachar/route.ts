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

  // Paleta do padrao de e-mail oficial (05/09): cabecalho branco com wordmark
  // + filete no acento, UM CTA, rodape escuro. Cores por marca — quem comprou
  // na ViagemSim recebe e-mail da ViagemSim (paleta Passaporte).
  const cores = marca === "ViagemSim"
    ? { titulo: "#0f2a4a", acento: "#1e5aab", rodape: "#0f2a4a", sufixo: "Sim" }
    : { titulo: "#001b54", acento: "#f80838", rodape: "#0a1029", sufixo: "Sim" };
  const prefixo = marca.endsWith("Sim") ? marca.slice(0, -3) : marca;

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
      `<tr><td style="padding:14px 0;border-top:1px solid #e2e6f0">` +
        `<p style=\"margin:0 0 6px;font-weight:bold;color:${cores.titulo}\">eSIM ${i}${linha.iccid ? ` · chip …${String(linha.iccid).slice(-5)}` : ""}</p>` +
        `<p style=\"margin:0 0 4px\">QR code: <b>anexo esim-${i}.png</b> (abra e escaneie)</p>` +
        `<p style=\"margin:0;font-size:13px;color:#59627a\">Código manual — SM-DP+: <code>${partes[1] ?? ""}</code> · Ativação: <code>${partes[2] ?? ""}</code></p>` +
      `</td></tr>`,
    );
  }
  if (anexos.length === 0) throw new Error("pedido entregue sem codigo legivel para anexar");

  const html =
    `<div style="background:#f7f8fc;padding:24px 12px;font-family:'Segoe UI',Arial,Helvetica,sans-serif;color:#1a2233">` +
    `<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e6f0;border-radius:14px;overflow:hidden">` +
      `<div style="padding:18px 26px;border-bottom:3px solid ${cores.acento};font-size:22px;font-weight:800;letter-spacing:-0.5px">` +
        `<span style="color:${cores.titulo}">${prefixo}</span><span style="color:${cores.acento}">${cores.sufixo}</span>` +
      `</div>` +
      `<div style="padding:24px 26px;font-size:15px;line-height:1.6">` +
        `<h1 style="margin:0 0 10px;font-size:20px;line-height:1.3;color:${cores.titulo}">Seu eSIM chegou 🎉</h1>` +
        `<p style="margin:0 0 14px">Pedido <b>${numero}</b>. Instale agora mesmo, com Wi-Fi e calma — <b>o plano só começa a contar quando você chegar ao destino e ativar</b>.</p>` +
        `<table style="width:100%;border-collapse:collapse">${blocos.join("")}</table>` +
        `<p style="margin:20px 0 6px;text-align:center"><a href="${link}" style="background:${cores.acento};color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:12px;display:inline-block;font-weight:700">Abrir meu pedido: status, QR e guia de instalação</a></p>` +
        `<p style="margin:14px 0 0;font-size:13px;color:#59627a">Guarde este e-mail: o botão acima é o seu acesso ao pedido. Não apague o eSIM depois de instalar — o QR é de uso único. Dúvida a qualquer hora? Responda este e-mail: gente de verdade, em português.</p>` +
      `</div>` +
      `<div style="background:${cores.rodape};color:#8fa0c9;padding:14px 26px;font-size:12px;line-height:1.6">${marca} · internet de viagem sem roaming e sem susto</div>` +
    `</div></div>`;

  return { assunto: `Seu eSIM chegou — pedido ${numero} (${marca})`, html, deNome: marca, anexos };
}
