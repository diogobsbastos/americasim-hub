import { db } from "../../../../lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /v1/webhooks/mercadolivre
//
// A REGRA QUE MOLDA ESTE ARQUIVO: o Mercado Livre exige HTTP 200 em ate 500 ms.
// Passando disso, ele DESATIVA o topico por fallback e e preciso reassinar no
// gerenciador de aplicativos — e o que se perdeu nao volta ao feed (o
// /missed_feeds guarda so 2 dias). Por isso aqui nao se busca o pedido, nao se
// fala com a API deles e nao se entrega nada: grava uma linha e responde.
// Quem trabalha e o worker, lendo `evento_saida`.
//
// AUTENTICACAO: ao contrario da Stripe, o ML NAO assina a notificacao. Sem
// nenhuma defesa, qualquer um na internet manda um JSON e faz o worker ir
// buscar pedidos que nao existem. Duas camadas, nesta ordem:
//   1. segredo compartilhado na URL (`?k=`), se ML_WEBHOOK_SEGREDO existir;
//   2. senao, a lista oficial de IPs de origem do ML.
// Nunca aberto: sem segredo configurado E vindo de IP desconhecido, recusa.
//
// IDEMPOTENCIA: o ML reenvia por 1 hora, ate 8 tentativas. O `agregado_id` sai
// de topico+resource, entao a reentrega cai na MESMA chave e a linha repetida e
// descartada — senao uma venda viraria oito.

// Publicados pelo proprio ML na doc de notificacoes.
const IPS_ML = new Set([
  "54.88.218.97", "18.215.140.160", "18.213.114.129", "18.206.34.84",
  "35.236.253.169", "35.245.91.34", "35.245.20.104", "35.186.182.146",
  "13.223.210.67", "54.160.66.146", "44.212.229.114", "52.204.14.181",
  "13.223.210.140", "54.236.191.153",
]);

// Topicos que sabemos tratar. Um topico desconhecido e ACEITO e registrado sem
// virar tarefa: recusar faria o ML reentregar por uma hora algo que nunca vai
// dar certo, e afogaria a fila dos que importam.
const TOPICOS = new Set(["orders_v2", "items", "messages", "shipments", "payments"]);

function ipDeOrigem(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  // O primeiro da lista e o cliente; o resto sao os proxies pelo caminho.
  return (xff.split(",")[0] ?? "").trim();
}

function autorizado(req: Request): { ok: boolean; motivo: string } {
  const segredo = process.env.ML_WEBHOOK_SEGREDO ?? "";
  if (segredo) {
    const k = new URL(req.url).searchParams.get("k") ?? "";
    // Comparacao de tamanho antes evita vazar o comprimento por tempo de resposta.
    if (k.length === segredo.length && k === segredo) return { ok: true, motivo: "segredo" };
    return { ok: false, motivo: "segredo invalido" };
  }
  const ip = ipDeOrigem(req);
  if (IPS_ML.has(ip)) return { ok: true, motivo: `ip ${ip}` };
  return { ok: false, motivo: `ip nao reconhecido (${ip || "sem x-forwarded-for"})` };
}

export async function POST(req: Request): Promise<Response> {
  const permissao = autorizado(req);
  if (!permissao.ok) {
    console.error("ml.webhook recusado:", permissao.motivo);
    // 401 e nao 200: recusa NAO deve ser reentregue nem parecer aceita.
    return Response.json({ erro: "nao autorizado" }, { status: 401 });
  }

  let corpo: any = null;
  try {
    corpo = await req.json();
  } catch {
    // Corpo torto nao vira retentativa eterna: aceita, registra e segue.
    console.error("ml.webhook: corpo nao e JSON");
    return Response.json({ recebido: true, detalhe: "corpo invalido" });
  }

  const topico = String(corpo?.topic ?? "").trim();
  const recurso = String(corpo?.resource ?? "").trim();

  if (!topico || !recurso) {
    return Response.json({ recebido: true, detalhe: "sem topic ou resource" });
  }
  if (!TOPICOS.has(topico)) {
    console.warn("ml.webhook: topico sem tratamento:", topico);
    return Response.json({ recebido: true, detalhe: "topico ignorado" });
  }

  try {
    // UMA consulta, sem rede: e o que cabe dentro de 500 ms com folga.
    //
    // `md5(...)::uuid` da a mesma chave para a mesma notificacao reentregue.
    // O `where not exists` so olha os NAO publicados: se o mesmo pedido mudar
    // de estado amanha e o ML avisar de novo, aquilo e evento novo e deve
    // entrar — o que nao pode entrar duas vezes e a retentativa da mesma coisa
    // enquanto a primeira ainda nem foi processada.
    const r = await db.query(
      `insert into evento_saida (agregado, agregado_id, tipo, payload)
       select 'mercadolivre', md5($1 || '|' || $2)::uuid, $1, $3::jsonb
        where not exists (
          select 1 from evento_saida
           where agregado = 'mercadolivre'
             and agregado_id = md5($1 || '|' || $2)::uuid
             and publicado_em is null
        )
       returning id`,
      [topico, recurso, JSON.stringify(corpo ?? {})],
    );

    if (r.rowCount === 0) {
      return Response.json({ recebido: true, detalhe: "repetida" });
    }
    return Response.json({ recebido: true, id: String(r.rows[0].id) });
  } catch (e: any) {
    // Falha nossa: devolver erro faz o ML tentar de novo, e e isso mesmo que
    // queremos aqui — a notificacao ainda nao foi guardada em lugar nenhum.
    console.error("ml.webhook: falha ao enfileirar:", e?.message ?? e);
    return Response.json({ erro: "falha temporaria" }, { status: 503 });
  }
}

// O ML nao usa GET, mas a doc oferece um teste de endpoint e da conforto poder
// abrir a URL no navegador e ver que ela existe sem enfileirar nada.
export async function GET(req: Request): Promise<Response> {
  const permissao = autorizado(req);
  return Response.json(
    { rota: "webhook mercadolivre", autorizado: permissao.ok, motivo: permissao.motivo },
    { status: permissao.ok ? 200 : 401 },
  );
}
