import { db } from "../../../../../lib/db";
import { canalMl, mlFetch } from "../../../../../lib/mercadolivre";
import { conferirSegredo } from "../../segredo";

export const dynamic = "force-dynamic";

// POST /v1/interno/ml/estoque  { "variante_id": "..." }  ou  { "pedido_id": "..." }
//
// Leva a quantidade real do nosso estoque para o anuncio do Mercado Livre.
//
// Dois caminhos chegam aqui e os dois sao legitimos:
//   - o gatilho do banco (migracao 010) manda `variante_id` sempre que uma
//     linha de estoque nasce, muda de status ou some;
//   - a propria entrega enfileira 'estoque.replicar' com `pedido_id`, porque
//     naquele momento o que se sabe e qual pedido saiu.
//
// ONDE MORA A QUANTIDADE, no ML: depende do anuncio, e a primeira versao desta
// rota assumiu que era sempre no item. Levou
//   "Cannot update item MLB... (available_quantity is not modifiable.)"
// porque aquele anuncio tem uma variacao, e havendo variacao a quantidade mora
// nela. Agora a rota PERGUNTA o formato antes de escrever.

async function registrar(canalId: string | null, acao: string, sucesso: boolean, detalhe: string) {
  try {
    await db.query(
      `insert into log_sync (canal_id, entidade, acao, sucesso, detalhe)
       values ($1, 'estoque', $2, $3, $4)`,
      [canalId, acao, sucesso, detalhe.slice(0, 900)],
    );
  } catch (e) {
    console.error("registrar:", e);
  }
}

// O que mandar no PUT, decidido pelo que o anuncio e de verdade.
function comoEscrever(item: any, livre: number):
  { corpo: any } | { recusa: string } {
  const variacoes: any[] = Array.isArray(item?.variations) ? item.variations : [];

  // Full: o estoque esta no deposito do ML, contado por eles. Mandar o nosso
  // numero seria afirmar algo sobre o que ha nas prateleiras DELES.
  if (String(item?.shipping?.logistic_type ?? "") === "fulfillment") {
    return { recusa: "anuncio em logistica Full: a quantidade e controlada pelo deposito do ML" };
  }

  if (variacoes.length === 0) return { corpo: { available_quantity: livre } };

  if (variacoes.length === 1) {
    return { corpo: { variations: [{ id: variacoes[0].id, available_quantity: livre }] } };
  }

  // Varias variacoes: nosso SKU e um so e nao existe regra dizendo quanto vai
  // para cada uma. Inventar um rateio aqui seria decidir negocio no escuro, e
  // o erro so apareceria como venda que nao pode ser entregue.
  return {
    recusa:
      `anuncio tem ${variacoes.length} variacoes e o SKU e um so — nao ha regra de rateio. ` +
      "Republique o anuncio sem variacoes, ou crie um SKU por variacao.",
  };
}

export async function POST(req: Request) {
  const porta = await conferirSegredo(req);
  if (!porta.ok) return Response.json({ erro: porta.motivo }, { status: porta.status });

  let corpo: any = null;
  try {
    corpo = await req.json();
  } catch {
    return Response.json({ erro: "corpo invalido" }, { status: 400 });
  }

  const varianteId = String(corpo?.variante_id ?? corpo?.varianteId ?? "").trim();
  const pedidoId = String(corpo?.pedido_id ?? corpo?.pedidoId ?? "").trim();
  if (!varianteId && !pedidoId) {
    return Response.json({ erro: "informe variante_id ou pedido_id" }, { status: 400 });
  }

  const canal = await canalMl();
  if (!canal) return Response.json({ ok: true, ignorado: "canal mercadolivre nao existe" });

  const alvos = varianteId
    ? await db.query(
        `select ci.id as item_id, ci.id_externo, ci.quantidade_publicada,
                v.id as variante_id, v.sku, l.livre
           from variante v
           join estoque_livre l on l.variante_id = v.id
           join canal_item ci on ci.variante_id = v.id and ci.canal_id = $2
          where v.id = $1 and ci.id_externo is not null`,
        [varianteId, canal.id],
      )
    : await db.query(
        `select distinct ci.id as item_id, ci.id_externo, ci.quantidade_publicada,
                v.id as variante_id, v.sku, l.livre
           from item_pedido ip
           join variante v on v.id = ip.variante_id
           join estoque_livre l on l.variante_id = v.id
           join canal_item ci on ci.variante_id = v.id and ci.canal_id = $2
          where ip.pedido_id = $1 and ci.id_externo is not null`,
        [pedidoId, canal.id],
      );

  // Variante sem anuncio vinculado nao e erro: a maioria dos SKUs nunca vai
  // para marketplace. Silencio aqui e a resposta certa.
  if (alvos.rows.length === 0) return Response.json({ ok: true, ignorado: "sem anuncio vinculado" });

  const feitos: any[] = [];
  for (const a of alvos.rows) {
    const livre = Number(a.livre ?? 0);
    const publicada = a.quantidade_publicada === null ? null : Number(a.quantidade_publicada);

    // Ja esta igual la: nao gasta chamada. O ML tem limite de requisicoes por
    // aplicacao, e replicar o que nao mudou queima cota que faz falta no dia de
    // movimento.
    if (publicada === livre) {
      feitos.push({ sku: a.sku, anuncio: a.id_externo, quantidade: livre, acao: "ja_estava" });
      continue;
    }

    try {
      const item: any = await mlFetch(
        canal.id,
        `/items/${a.id_externo}?attributes=id,status,available_quantity,variations,shipping`,
      );

      const plano = comoEscrever(item, livre);
      if ("recusa" in plano) {
        // Recusa NAO e falha de rede: tentar de novo dara o mesmo resultado. Ela
        // fica gravada na linha do anuncio e o evento sai da fila, em vez de
        // ficar batendo no ML de 30 em 30 segundos para sempre.
        await db.query(
          `update canal_item set status = 'divergente'::status_sync, ultimo_erro = $2, ultimo_sync = now()
            where id = $1`,
          [a.item_id, plano.recusa],
        );
        await registrar(canal.id, "ml.estoque.recusado", false, `${a.sku} -> ${a.id_externo}: ${plano.recusa}`);
        feitos.push({ sku: a.sku, anuncio: a.id_externo, acao: "recusado", motivo: plano.recusa });
        continue;
      }

      await mlFetch(canal.id, `/items/${a.id_externo}`, {
        method: "PUT",
        body: JSON.stringify(plano.corpo),
      });

      await db.query(
        `update canal_item
            set quantidade_publicada = $2, ultimo_sync = now(),
                status = 'publicado'::status_sync, ultimo_erro = null
          where id = $1`,
        [a.item_id, livre],
      );
      const onde = plano.corpo.variations ? "na variacao" : "no item";
      await registrar(
        canal.id, "ml.estoque.replicar", true,
        `${a.sku} -> ${a.id_externo} (${onde}): ${publicada === null ? "?" : publicada} para ${livre}`,
      );
      feitos.push({ sku: a.sku, anuncio: a.id_externo, quantidade: livre, onde, acao: "atualizado" });
    } catch (e: any) {
      const msg = String(e?.message ?? e).slice(0, 400);

      // O erro fica GRAVADO na linha do anuncio, nao so no log: e a diferenca
      // entre a tela poder mostrar "este anuncio esta fora de sincronia e por
      // que" e alguem ter que caçar em log para descobrir.
      await db.query(
        `update canal_item set status = 'erro'::status_sync, ultimo_erro = $2, ultimo_sync = now()
          where id = $1`,
        [a.item_id, msg],
      );
      await registrar(canal.id, "ml.estoque.replicar", false, `${a.sku} -> ${a.id_externo}: ${msg}`);
      throw e; // a fila retenta com espera crescente
    }
  }

  return Response.json({ ok: true, itens: feitos });
}
