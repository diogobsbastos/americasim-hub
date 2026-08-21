"use server";

// ATENCAO: so exporta FUNCOES ASSINCRONAS. Os estados iniciais moram em ./tipos.

import { revalidatePath } from "next/cache";
import { db } from "../../../lib/db";
import { apagarSegredoApp, salvarSegredoApp } from "../../../lib/segredo-app";
import { auditar, usuarioDaSessao } from "../../../lib/painel/sessao";
import {
  CHAVE_SECRETA,
  CHAVE_WEBHOOK,
  PARAM_COMISSAO_FIXA,
  PARAM_COMISSAO_PCT,
  conferirConta,
  modoDaChave,
} from "../../../lib/stripe";
import { registrarDominio, revalidarDominio } from "../../../lib/stripe-dominios";
import type { EstadoPagamento, EstadoContaStripe } from "./tipos";

const PODE_MEXER = ["admin"];

async function autorizar(): Promise<{ id: string } | EstadoPagamento> {
  const u = await usuarioDaSessao();
  if (!u) return { erro: "Sessão expirada. Entre de novo.", ok: "" };
  // Mexer em recebimento e mexer em dinheiro. Isso e decisao de admin.
  if (!PODE_MEXER.includes(u.papel)) {
    return { erro: "Só um admin pode mexer nos pagamentos.", ok: "" };
  }
  return { id: u.id };
}

function tudo() {
  revalidatePath("/painel/pagamentos");
  revalidatePath("/painel/pagamentos/conta");
  revalidatePath("/painel/pagamentos/dominios");
  revalidatePath("/painel/pagamentos/comissao");
}

// =============================================================== credenciais

const CHAVES: Record<string, string> = {
  secreta: CHAVE_SECRETA,
  webhook: CHAVE_WEBHOOK,
};

export async function salvarChaveStripe(
  _anterior: EstadoPagamento,
  form: FormData,
): Promise<EstadoPagamento> {
  const u = await autorizar();
  if ("erro" in u) return u;

  const qual = String(form.get("qual") ?? "");
  const nomeVar = CHAVES[qual];
  if (!nomeVar) return { erro: "Campo desconhecido.", ok: "" };

  const valor = String(form.get("valor") ?? "").trim();
  if (!valor) return { erro: "Cole a chave antes de salvar.", ok: "" };

  let recado = "";

  if (qual === "secreta") {
    // A chave publicavel (pk_) e a que vai no navegador. Ela NAO cobra nada e,
    // se ficar guardada aqui, o checkout falharia com um erro da Stripe que nao
    // explica que a chave e do tipo errado.
    if (/^pk_/.test(valor)) {
      return {
        erro: "Isso é a chave PUBLICÁVEL (pk_...). Aqui vai a chave SECRETA, que começa com sk_ e fica escondida no painel da Stripe atrás de “Revelar”.",
        ok: "",
      };
    }
    if (/^whsec_/.test(valor)) {
      return { erro: "Isso é o segredo do webhook. Ele tem campo próprio, na mesma tela.", ok: "" };
    }
    const modo = modoDaChave(valor);
    if (modo === "invalida") {
      return {
        erro: "Não parece uma chave secreta da Stripe. Ela começa com sk_test_ (teste) ou sk_live_ (produção).",
        ok: "",
      };
    }
    if (modo === "producao") {
      // Trocar para producao e passar a cobrar dinheiro de verdade de gente de
      // verdade. Exige um segundo gesto consciente, e nao apenas colar e salvar.
      if (String(form.get("confirmo_producao") ?? "") !== "sim") {
        return {
          erro: "Esta é uma chave de PRODUÇÃO: a loja passa a cobrar dinheiro de verdade, e cobrança feita não tem desfazer automático — cada estorno é manual e a taxa da Stripe não volta. Marque a confirmação abaixo se é isso mesmo que você quer.",
          ok: "",
        };
      }
      recado = "Chave de PRODUÇÃO guardada. A loja passa a cobrar de verdade a partir do próximo pedido.";
    } else {
      recado = "Chave de teste guardada. Nenhum dinheiro real será movimentado.";
    }
  }

  if (qual === "webhook") {
    if (!/^whsec_[A-Za-z0-9_-]{10,}$/.test(valor)) {
      return {
        erro: "O segredo do webhook começa com whsec_ e aparece na página do endpoint, no painel da Stripe.",
        ok: "",
      };
    }
    recado = "Segredo do webhook guardado. Agora a Stripe consegue avisar o hub quando um pagamento for aprovado.";
  }

  try {
    await salvarSegredoApp(nomeVar, valor, u.id);
  } catch (e: any) {
    console.error("salvarChaveStripe:", e);
    return {
      erro: "Não consegui guardar com segurança: o servidor está sem a chave de cifra (ESIM_CHAVE). Nada foi gravado.",
      ok: "",
    };
  }

  // O MODO nao e segredo — e exatamente o que uma auditoria precisa saber depois:
  // quem ligou producao, e quando.
  await auditar("pagamento.chave", {
    usuarioId: u.id,
    entidade: "parametro",
    depois: {
      provedor: "stripe",
      variavel: nomeVar,
      modo: qual === "secreta" ? modoDaChave(valor) : "n/a",
    },
  });
  tudo();
  return { erro: "", ok: recado };
}

export async function apagarChaveStripe(
  _anterior: EstadoPagamento,
  form: FormData,
): Promise<EstadoPagamento> {
  const u = await autorizar();
  if ("erro" in u) return u;

  const qual = String(form.get("qual") ?? "");
  const nomeVar = CHAVES[qual];
  if (!nomeVar) return { erro: "Campo desconhecido.", ok: "" };

  await apagarSegredoApp(nomeVar);
  await auditar("pagamento.chave.apagar", {
    usuarioId: u.id, entidade: "parametro", depois: { provedor: "stripe", variavel: nomeVar },
  });
  tudo();
  return {
    erro: "",
    ok:
      qual === "secreta"
        ? "Chave apagada. A loja volta ao modo demonstração: nenhum pagamento é cobrado."
        : "Segredo do webhook apagado. A Stripe deixa de conseguir confirmar pagamentos.",
  };
}

export async function testarStripe(
  _anterior: EstadoContaStripe,
  _form: FormData,
): Promise<EstadoContaStripe> {
  const u = await autorizar();
  if ("erro" in u) return { erro: u.erro, ok: "", conta: null };

  const r = await conferirConta();
  if (!r.ok) {
    return { erro: `A Stripe recusou a chave: ${r.erro ?? "sem detalhe"}`, ok: "", conta: null };
  }
  return {
    erro: "",
    ok: "A chave funciona.",
    conta: {
      id: r.id ?? "",
      nome: r.nome ?? "",
      pais: r.pais ?? "",
      moeda: r.moeda ?? "",
      podeCobrar: !!r.podeCobrar,
    },
  };
}

// =================================================================== comissao

export async function salvarComissao(
  _anterior: EstadoPagamento,
  form: FormData,
): Promise<EstadoPagamento> {
  const u = await autorizar();
  if ("erro" in u) return u;

  const fixa = String(form.get("fixa") ?? "").trim() || "0";
  const pct = String(form.get("pct") ?? "").trim() || "0";

  if (!/^\d{1,7}$/.test(fixa)) {
    return { erro: "A parte fixa é um número inteiro de centavos. Ex.: 50 para R$ 0,50.", ok: "" };
  }
  if (!/^\d{1,2}([.,]\d{1,2})?$/.test(pct)) {
    return { erro: "O percentual vai de 0 a 99, com até duas casas. Ex.: 2,5.", ok: "" };
  }
  const pctNum = Number(pct.replace(",", "."));
  if (pctNum < 0 || pctNum > 99) return { erro: "O percentual precisa ficar entre 0 e 99.", ok: "" };

  const cl = await db.connect();
  try {
    await cl.query("begin");
    for (const [chave, valor, desc] of [
      [PARAM_COMISSAO_FIXA, fixa, "Comissao fixa por venda, em centavos"],
      [PARAM_COMISSAO_PCT, String(pctNum), "Comissao percentual sobre o total da venda"],
    ] as const) {
      await cl.query(
        `insert into parametro (chave, valor, tipo, descricao, atualizado_em, atualizado_por)
         values ($1, $2, 'numero', $3, now(), $4)
         on conflict (chave) do update
           set valor = excluded.valor, atualizado_em = now(),
               atualizado_por = excluded.atualizado_por`,
        [chave, valor, desc, u.id],
      );
    }
    await cl.query("commit");
  } catch (e: any) {
    await cl.query("rollback").catch(() => {});
    console.error("salvarComissao:", e);
    return { erro: "Falha ao gravar. Nada foi alterado.", ok: "" };
  } finally {
    cl.release();
  }

  await auditar("pagamento.comissao", {
    usuarioId: u.id, entidade: "parametro", depois: { fixa_centavos: fixa, percentual: pctNum },
  });
  tudo();
  return {
    erro: "",
    ok: "Comissão atualizada. Vale para os próximos pedidos — os já pagos mantêm a regra que valia no dia.",
  };
}

// =================================================================== dominios

// Grava QUAL e o dominio de cada vitrine. Isso e nosso, e fica no banco.
// Se o dominio ja esta registrado na Stripe ou nao, NAO se guarda aqui: e
// perguntado a ela a cada carregamento, senao o banco mente no dia em que
// alguem mexe no dashboard por fora.
export async function salvarDominioVitrine(
  _anterior: EstadoPagamento,
  form: FormData,
): Promise<EstadoPagamento> {
  const u = await autorizar();
  if ("erro" in u) return u;

  const canalId = String(form.get("canal_id") ?? "").trim();
  const dominio = String(form.get("dominio") ?? "").trim().toLowerCase();
  if (!canalId) return { erro: "Vitrine não informada.", ok: "" };

  // Domínio, não URL. Colar "https://x.com/loja" aqui faria o registro na Stripe
  // falhar com uma mensagem que não explica nada.
  if (dominio && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(dominio)) {
    return {
      erro: "Escreva só o domínio, sem https:// e sem barra no fim. Ex.: americasim.duckdns.org",
      ok: "",
    };
  }

  await db.query(
    `update canal
        set config = coalesce(config, '{}'::jsonb) || jsonb_build_object('dominio', $2::text)
      where id = $1`,
    [canalId, dominio || null],
  );

  await auditar("pagamento.dominio.vitrine", {
    usuarioId: u.id, entidade: "canal", entidadeId: canalId, depois: { dominio },
  });
  tudo();
  return { erro: "", ok: dominio ? `Domínio da vitrine guardado: ${dominio}` : "Domínio removido." };
}

export async function registrarDominioAcao(
  _anterior: EstadoPagamento,
  form: FormData,
): Promise<EstadoPagamento> {
  const u = await autorizar();
  if ("erro" in u) return u;

  const dominio = String(form.get("dominio") ?? "").trim().toLowerCase();
  if (!dominio) return { erro: "Domínio não informado.", ok: "" };

  const r = await registrarDominio(dominio);
  if ("erro" in r) {
    return { erro: `A Stripe recusou o registro de ${dominio}: ${r.erro}`, ok: "" };
  }

  await auditar("pagamento.dominio.registrar", {
    usuarioId: u.id, entidade: "parametro",
    depois: { dominio, pmd_id: r.id, google_pay: r.googlePay, apple_pay: r.applePay },
  });
  tudo();

  // Registrar nao e o mesmo que ficar ativo: a Stripe verifica o dominio e pode
  // devolver `inactive` com motivo. Dizer "registrado com sucesso" e esconder
  // isso seria mentir para quem vai depender do botao aparecer.
  const ativas = [
    r.googlePay === "active" ? "Google Pay" : null,
    r.applePay === "active" ? "Apple Pay" : null,
    r.link === "active" ? "Link" : null,
  ].filter(Boolean);

  return {
    erro: "",
    ok: ativas.length
      ? `${dominio} registrado. Já ativo para: ${ativas.join(", ")}.`
      : `${dominio} registrado, mas nenhuma carteira ficou ativa ainda. A Stripe verifica o domínio; use “Revalidar” em alguns instantes.`,
  };
}

export async function revalidarDominioAcao(
  _anterior: EstadoPagamento,
  form: FormData,
): Promise<EstadoPagamento> {
  const u = await autorizar();
  if ("erro" in u) return u;

  const id = String(form.get("pmd_id") ?? "").trim();
  if (!id) return { erro: "Registro não informado.", ok: "" };

  const r = await revalidarDominio(id);
  if ("erro" in r) return { erro: `A Stripe não conseguiu revalidar: ${r.erro}`, ok: "" };

  await auditar("pagamento.dominio.revalidar", {
    usuarioId: u.id, entidade: "parametro",
    depois: { dominio: r.dominio, google_pay: r.googlePay, apple_pay: r.applePay },
  });
  tudo();
  return {
    erro: "",
    ok: `${r.dominio}: Google Pay ${r.googlePay}, Apple Pay ${r.applePay}, Link ${r.link}.`,
  };
}
