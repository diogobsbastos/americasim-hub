import { db } from "../../../../lib/db";
import { CMLINK, garantirOperadora } from "../../../../lib/cmlink";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// POST /v1/webhooks/cmlink — os callbacks "southbound" da China Mobile
// (docs/SPEC_CMLINK_API.md §7): ativacao do pacote (3.2.15), consumo (3.2.16)
// e estado do eSIM ES2+ (3.2.17). Uma rota so; o tipo vem do CORPO.
//
// AUTENTICACAO: a doc nao descreve assinatura. Ate o Haoran responder, a rota
// aceita um segredo opcional na URL (?t=...), guardado em operadora.config
// .webhook_token — se estiver configurado e nao bater, 401. Sem token
// configurado, aceita e REGISTRA tudo (IP, corpo) em requisicao_operadora, que
// e onde se descobre o que eles mandam de verdade.
//
// EFEITOS, todos idempotentes e todos em banco:
//   3.2.15 ativacao  → estoque_esim.validade = endTime; ativacao.observacao
//   3.2.16 consumo   → so registro (consumo nao muda estado de venda)
//   3.2.17 eSIM      → notificationPointId 4/101 = instalado: ativacao.status = 'instalado',
//                      confirmado_em = now(); 5 = deletado: observacao
// Nunca se cria pedido nem se entrega nada a partir de callback: quem entrega e o motor.

function tipoDoCorpo(b: any): "esim" | "ativacao" | "consumo" | "desconhecido" {
  if (b && typeof b === "object") {
    if (b.notificationPointId !== undefined || b.header?.functionCallIdentifier) return "esim";
    if (b.activeTime !== undefined || b.endTime !== undefined || b.packageId !== undefined) return "ativacao";
    if (b.qtavalue !== undefined) return "consumo";
  }
  return "desconhecido";
}

// YYYYMMDDHHmmss (UTC) → Date | null
function dataCm(s: unknown): Date | null {
  const m = String(s ?? "").match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
}

async function pedidoPorThirdOrderId(third: unknown): Promise<string | null> {
  const t = String(third ?? "").trim();
  if (!t) return null;
  // chave do motor: "<numero do pedido>:<8 primeiros do item>"; compra manual: "MANUAL-..."
  const numero = t.split(":")[0];
  const r = await db.query("select id from pedido where numero = $1", [numero]);
  return r.rows[0]?.id ?? null;
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const cfg = await db.query("select config from operadora where codigo = $1", [CMLINK.codigo]);
  const esperado = String(cfg.rows[0]?.config?.webhook_token ?? "").trim();
  if (esperado && url.searchParams.get("t") !== esperado) {
    return Response.json({ code: "1", msg: "unauthorized" }, { status: 401 });
  }

  const cru = await req.text();
  let corpo: any = null;
  try {
    corpo = cru ? JSON.parse(cru) : null;
  } catch {
    corpo = { _texto: cru.slice(0, 5000) };
  }
  const tipo = tipoDoCorpo(corpo);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "";
  const iccid = String(corpo?.iccid ?? "").replace(/\D/g, "");

  let efeito = "registrado";
  let pedidoId: string | null = null;
  try {
    pedidoId = await pedidoPorThirdOrderId(corpo?.thirdOrderId);

    if (tipo === "ativacao" && iccid) {
      const fim = dataCm(corpo?.endTime);
      const ini = dataCm(corpo?.activeTime);
      const e = await db.query(
        `update estoque_esim
            set validade = coalesce($2::date, validade)
          where iccid = $1 and operadora = $3
          returning id, pedido_id`,
        [iccid, fim ? fim.toISOString().slice(0, 10) : null, CMLINK.codigo],
      );
      if (e.rows.length > 0) {
        pedidoId = pedidoId ?? e.rows[0].pedido_id ?? null;
        await db.query(
          `update ativacao
              set observacao = coalesce(observacao, '') || $2
            where estoque_id = $1`,
          [e.rows[0].id, `pacote ativo ${ini ? ini.toISOString() : "?"} ate ${fim ? fim.toISOString() : "?"} (orderId ${corpo?.orderId ?? corpo?.rderId ?? "?"}); `],
        );
        efeito = "validade_atualizada";
      } else {
        efeito = "iccid_desconhecido";
      }
    } else if (tipo === "esim" && iccid) {
      const ponto = String(corpo?.notificationPointId ?? "");
      const status = String(corpo?.notificationPointStatus?.status ?? "");
      const sucesso = /success/i.test(status);
      const e = await db.query(
        "select id, pedido_id from estoque_esim where iccid = $1 and operadora = $2",
        [iccid, CMLINK.codigo],
      );
      if (e.rows.length > 0) {
        pedidoId = pedidoId ?? e.rows[0].pedido_id ?? null;
        if (sucesso && (ponto === "4" || ponto === "101")) {
          await db.query(
            `update ativacao
                set status = 'instalado', confirmado_em = coalesce(confirmado_em, now()),
                    observacao = coalesce(observacao, '') || $2
              where estoque_id = $1 and status in ('entregue','provisionando','instalado')`,
            [e.rows[0].id, `eSIM ${ponto === "4" ? "instalado" : "habilitado"} (${corpo?.eid ?? "sem eid"}); `],
          );
          efeito = "instalado";
        } else {
          await db.query(
            `update ativacao set observacao = coalesce(observacao, '') || $2 where estoque_id = $1`,
            [e.rows[0].id, `eSIM ponto ${ponto} ${status}; `],
          );
          efeito = `esim_ponto_${ponto}`;
        }
      } else {
        efeito = "iccid_desconhecido";
      }
    } else if (tipo === "consumo") {
      efeito = "consumo_registrado";
    } else {
      efeito = "tipo_desconhecido";
    }
  } catch (e) {
    console.error("webhook cmlink:", e);
    efeito = "erro_interno";
  }

  // Resposta no formato que a doc pede para cada tipo.
  const resposta =
    tipo === "esim"
      ? {
          header: {
            functionExecutionStatus: {
              status: "Executed-Success",
              statusCodeData: { subjectCode: "0", reasonCode: "0", message: "success" },
            },
          },
          iccid: corpo?.iccid ?? "",
        }
      : { code: "0", msg: "Success", description: "Success" };

  // O registro: corpo e resposta completos, com o IP de origem. E daqui que
  // sai a resposta da pergunta "como eles autenticam o callback".
  try {
    const operadoraId = await garantirOperadora();
    await db.query(
      `insert into requisicao_operadora
         (operadora_id, pedido_id, operacao, chave_idem, requisicao, resposta, http_status, resultado, duracao_ms, tentativa)
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, 200, 'sucesso', 0, 1)`,
      [
        operadoraId, pedidoId, `callback.${tipo}`, `cb:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
        JSON.stringify({ ip, url: url.pathname, corpo, efeito }),
        JSON.stringify(resposta),
      ],
    );
  } catch (e) {
    console.error("webhook cmlink: registro:", e);
  }

  return Response.json(resposta);
}
