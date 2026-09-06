import { db } from "./db";
import { classificarOperacao, iccidDoCorpo, pedidoDoCorpo } from "./guarda-regras";

// ============================================================================
// O GUARDA DA CHAVE DO MASTER
//
// Por que ele existe (decidido em 06/09, depois da resposta do Haoran):
// a CMLink NAO permite credencial com escopo restrito — "sempre uma credencial
// por master account". Ou seja: a chave que a EasySim4u nos passar abre a conta
// INTEIRA deles — todos os cards, todas as operacoes. Nao ha nada do lado da
// operadora que nos limite aos nossos chips.
//
// Entao a trava e NOSSA, e este arquivo E a trava. Ele fica no funil por onde
// toda chamada passa (chamarCmlink) e recusa qualquer operacao de ESCRITA
// sobre um chip que nao esteja no nosso estoque. O que prometemos ao Rafick
// deixa de ser promessa e vira codigo que se pode ler.
//
// Tres decisoes de desenho, todas do lado seguro:
//
// 1. LISTA BRANCA DE LEITURA, e nao lista negra de escrita. Operacao que nao
//    esta classificada aqui e BLOQUEADA. Se amanha alguem adicionar uma chamada
//    nova e esquecer deste arquivo, ela nao passa — em vez de passar sem trava.
//    O erro diz exatamente o que fazer.
// 2. FAIL-CLOSED: se a consulta ao banco falhar, bloqueia. Melhor um pedido
//    parado com erro claro do que uma escrita as cegas no inventario alheio.
// 3. SEM PORTA DOS FUNDOS. Nao existe flag de "ignorar o guarda". Precisa
//    operar um chip? Cadastre no estoque primeiro. Uma excecao vira habito.
// ============================================================================

export { classificarOperacao, iccidDoCorpo, pedidoDoCorpo } from "./guarda-regras";

export interface Veredito {
  ok: boolean;
  motivo: string;
}

// A pergunta que o guarda faz: este chip e nosso?
async function chipNoNossoEstoque(iccid: string): Promise<boolean> {
  const r = await db.query(`select 1 from estoque_esim where iccid = $1 limit 1`, [iccid]);
  return r.rows.length > 0;
}

// Para o cancelamento: este pedido nasceu aqui? A prova e o nosso proprio
// registro de chamadas — se nao fomos nos que criamos, nao cancelamos.
async function pedidoNasceuAqui(orderId: string, thirdOrderId: string): Promise<boolean> {
  const r = await db.query(
    `select 1 from requisicao_operadora
      where operacao = 'createOrder' and resultado = 'sucesso'
        and ( ($1 <> '' and (resposta->>'orderID' = $1 or resposta->>'orderId' = $1))
           or ($2 <> '' and split_part(chave_idem, '#', 1) = $2) )
      limit 1`,
    [orderId, thirdOrderId],
  );
  return r.rows.length > 0;
}

// A porta. Devolve o veredito; quem chama registra e desiste.
export async function podeChamar(operacao: string, corpo: unknown): Promise<Veredito> {
  const classe = classificarOperacao(operacao);

  if (classe === "leitura") return { ok: true, motivo: "" };

  if (classe === "desconhecida") {
    return {
      ok: false,
      motivo:
        `operacao '${operacao}' nao classificada em lib/guarda-cmlink.ts. ` +
        `Toda chamada nova precisa ser declarada como leitura ou escrita antes de rodar ` +
        `com a chave do master — o guarda bloqueia por padrao.`,
    };
  }

  // Daqui para baixo e ESCRITA: exige prova de que o alvo e nosso.
  try {
    const iccid = iccidDoCorpo(corpo);
    if (iccid) {
      if (await chipNoNossoEstoque(iccid)) return { ok: true, motivo: "" };
      return {
        ok: false,
        motivo:
          `ICCID ${iccid} nao esta em estoque_esim. A chave e do master da EasySim4u e ` +
          `so operamos os nossos chips. Cadastre o lote no estoque antes.`,
      };
    }

    const { orderId, thirdOrderId } = pedidoDoCorpo(corpo);
    if (orderId || thirdOrderId) {
      if (await pedidoNasceuAqui(orderId, thirdOrderId)) return { ok: true, motivo: "" };
      return {
        ok: false,
        motivo:
          `pedido (orderId '${orderId}', thirdOrderId '${thirdOrderId}') nao consta como criado ` +
          `por nos em requisicao_operadora. Nao cancelamos pedido que nao criamos.`,
      };
    }

    return { ok: false, motivo: `escrita '${operacao}' sem ICCID nem identificador de pedido no corpo` };
  } catch (e) {
    // FAIL-CLOSED de proposito (ver cabecalho).
    return { ok: false, motivo: `guarda nao conseguiu confirmar a posse (${String(e).slice(0, 120)}); bloqueado por seguranca` };
  }
}

// O bloqueio VIRA REGISTRO. Sem isto o guarda seria invisivel: ninguem saberia
// que algo tentou sair. Fica em requisicao_operadora, junto das chamadas reais,
// com resultado 'erro' (o enum resultado_req nao tem 'bloqueado' e nao vale uma
// migracao) e a marca `bloqueado_pelo_guarda` na resposta.
export async function registrarBloqueio(
  operadoraId: string,
  operacao: string,
  motivo: string,
  corpo: unknown,
  pedidoId?: string | null,
  itemId?: string | null,
): Promise<void> {
  try {
    await db.query(
      `insert into requisicao_operadora
         (operadora_id, pedido_id, item_pedido_id, operacao, requisicao, resposta, http_status, resultado, duracao_ms, tentativa)
       values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, 0, 'erro'::resultado_req, 0, 1)`,
      [
        operadoraId,
        pedidoId ?? null,
        itemId ?? null,
        operacao,
        JSON.stringify({ iccid: iccidDoCorpo(corpo), ...pedidoDoCorpo(corpo) }),
        JSON.stringify({ bloqueado_pelo_guarda: true, motivo }),
      ],
    );
  } catch (e) {
    // Registrar e importante, mas nao pode ser o motivo de uma falha nova.
    console.error("guarda-cmlink: falha ao registrar bloqueio:", String(e).slice(0, 200));
  }
}
