"use server";

// ATENCAO: so exporta FUNCOES ASSINCRONAS. Os estados iniciais moram em ./tipos.

import { revalidatePath } from "next/cache";
import { apagarCredencial } from "../../../lib/canal-credencial";
import { conectorPorTipo } from "../../../lib/conectores";
import { db } from "../../../lib/db";
import { ErroMl } from "../../../lib/mercadolivre";
import { apagarSegredoApp, salvarSegredoApp } from "../../../lib/segredo-app";
import { novoUsuarioTeste, senhaDoUsuarioTeste } from "../../../lib/usuario-teste";
import { auditar, usuarioDaSessao } from "../../../lib/painel/sessao";
import {
  CHAVE_SECRETA,
  CHAVE_WEBHOOK,
  PARAM_COMISSAO_FIXA,
  PARAM_COMISSAO_PCT,
  conferirConta,
  modoDaChave,
} from "../../../lib/stripe";
import type { EstadoConexao, EstadoUsuarioTeste, EstadoTesteStripe } from "./tipos";

const PODE_MEXER = ["admin"];

async function autorizar(): Promise<{ id: string } | EstadoConexao> {
  const u = await usuarioDaSessao();
  if (!u) return { erro: "Sessão expirada. Entre de novo.", ok: "" };
  // Conectar um marketplace e dar a um sistema o direito de publicar e vender em
  // nome da empresa. Isso e decisao de admin, nao de operacao.
  if (!PODE_MEXER.includes(u.papel)) {
    return { erro: "Só um admin pode mexer nas conexões.", ok: "" };
  }
  return { id: u.id };
}

export async function salvarClientId(
  _anterior: EstadoConexao,
  form: FormData,
): Promise<EstadoConexao> {
  const u = await autorizar();
  if ("erro" in u) return u;

  const tipo = String(form.get("tipo") ?? "");
  const c = conectorPorTipo(tipo);
  if (!c) return { erro: "Conector desconhecido.", ok: "" };
  if (!c.disponivel) return { erro: `${c.nome} ainda não pode ser conectado.`, ok: "" };

  const clientId = String(form.get("client_id") ?? "").trim();
  // O Client ID do ML e numerico e longo. Recusar lixo aqui evita descobrir o
  // erro so no meio do vaivem do OAuth, onde a mensagem do marketplace nao
  // ajuda ninguem.
  if (!/^[A-Za-z0-9._-]{6,120}$/.test(clientId)) {
    return { erro: "Client ID inválido. Copie exatamente o que aparece no painel do desenvolvedor.", ok: "" };
  }
  // Cinto: se alguem colar a SENHA no lugar do ID, nao gravar em claro.
  if (/^APP_USR|^TG-/.test(clientId)) {
    return {
      erro: "Isso parece um token, não o Client ID. Token e senha não vão neste campo — a senha tem campo próprio, logo abaixo.",
      ok: "",
    };
  }

  const cl = await db.connect();
  try {
    await cl.query("begin");
    await cl.query(
      `insert into parametro (chave, valor, tipo, descricao, atualizado_em, atualizado_por)
       values ($1, $2, 'texto', $3, now(), $4)
       on conflict (chave) do update
         set valor = excluded.valor, atualizado_em = now(), atualizado_por = excluded.atualizado_por`,
      [c.paramClientId, clientId, `Client ID publico da aplicacao ${c.nome}`, u.id],
    );
    // O canal e criado junto: sem ele nao ha onde pendurar credencial, anuncio
    // nem pedido. Inativo de proposito — quem liga e a autorizacao.
    await cl.query(
      `insert into canal (codigo, nome, tipo, moeda, ativo)
       values ($1, $2, $3::tipo_canal, 'BRL', false)
       on conflict (codigo) do nothing`,
      [c.tipo, c.nome, c.tipo],
    );
    await cl.query("commit");
  } catch (e: any) {
    await cl.query("rollback").catch(() => {});
    console.error("salvarClientId:", e);
    return { erro: "Falha ao gravar. Nada foi alterado.", ok: "" };
  } finally {
    cl.release();
  }

  await auditar("conexao.client_id", {
    usuarioId: u.id, entidade: "parametro",
    depois: { conector: c.tipo, chave: c.paramClientId },
  });
  revalidatePath("/painel/conexoes");
  revalidatePath(`/painel/conexoes/${c.tipo}`);
  return { erro: "", ok: `Client ID do ${c.nome} guardado.` };
}

export async function desconectar(
  _anterior: EstadoConexao,
  form: FormData,
): Promise<EstadoConexao> {
  const u = await autorizar();
  if ("erro" in u) return u;

  const tipo = String(form.get("tipo") ?? "");
  const c = conectorPorTipo(tipo);
  if (!c) return { erro: "Conector desconhecido.", ok: "" };

  const q = await db.query("select id from canal where tipo = $1::tipo_canal limit 1", [c.tipo]);
  const canalId = q.rows[0]?.id;
  if (!canalId) return { erro: "Este canal não existe.", ok: "" };

  // Desconectar apaga a credencial e DESLIGA o canal. Deixar o canal ativo sem
  // credencial faria o hub tentar publicar e falhar em silencio a cada ciclo.
  await apagarCredencial(canalId);
  await db.query("update canal set ativo = false where id = $1", [canalId]);

  await auditar("conexao.desconectar", {
    usuarioId: u.id, entidade: "canal", entidadeId: canalId, depois: { conector: c.tipo },
  });
  revalidatePath("/painel/conexoes");
  revalidatePath(`/painel/conexoes/${c.tipo}`);
  return { erro: "", ok: `${c.nome} desconectado. Os anúncios continuam lá, mas o hub para de sincronizar.` };
}

export async function salvarSegredo(
  _anterior: EstadoConexao,
  form: FormData,
): Promise<EstadoConexao> {
  const u = await autorizar();
  if ("erro" in u) return u;

  const tipo = String(form.get("tipo") ?? "");
  const c = conectorPorTipo(tipo);
  if (!c) return { erro: "Conector desconhecido.", ok: "" };
  if (!c.disponivel) return { erro: `${c.nome} ainda não pode ser conectado.`, ok: "" };

  const segredo = String(form.get("segredo") ?? "").trim();
  if (segredo.length < 8) {
    return { erro: "Senha muito curta. Copie a Client Secret inteira do painel do marketplace.", ok: "" };
  }
  // Cinto: se alguem colar o Client ID (publico) no campo da senha, o OAuth
  // falharia depois com uma mensagem do marketplace que nao explica nada.
  if (/^[0-9]{10,}$/.test(segredo)) {
    return {
      erro: "Isso parece o Client ID, não a senha. A senha tem letras e números misturados.",
      ok: "",
    };
  }

  try {
    await salvarSegredoApp(c.envSecret, segredo, u.id);
  } catch (e: any) {
    console.error("salvarSegredo:", e);
    // Sem a chave-mae nao da para cifrar, e gravar em claro esta fora de
    // questao. Melhor recusar e dizer por que.
    return {
      erro: "Não consegui guardar com segurança: o servidor está sem a chave de cifra (ESIM_CHAVE). Nada foi gravado.",
      ok: "",
    };
  }

  // A auditoria registra QUE mudou e quem mudou. Nunca o valor, nem um pedaço.
  await auditar("conexao.segredo", {
    usuarioId: u.id, entidade: "parametro",
    depois: { conector: c.tipo, variavel: c.envSecret },
  });
  revalidatePath("/painel/conexoes");
  revalidatePath(`/painel/conexoes/${c.tipo}`);
  return { erro: "", ok: "Senha guardada, cifrada. Agora é só autorizar." };
}

export async function apagarSegredo(
  _anterior: EstadoConexao,
  form: FormData,
): Promise<EstadoConexao> {
  const u = await autorizar();
  if ("erro" in u) return u;

  const c = conectorPorTipo(String(form.get("tipo") ?? ""));
  if (!c) return { erro: "Conector desconhecido.", ok: "" };

  await apagarSegredoApp(c.envSecret);
  await auditar("conexao.segredo.apagar", {
    usuarioId: u.id, entidade: "parametro",
    depois: { conector: c.tipo, variavel: c.envSecret },
  });
  revalidatePath("/painel/conexoes");
  revalidatePath(`/painel/conexoes/${c.tipo}`);
  return { erro: "", ok: "Senha apagada." };
}

// =============================================================== pagamento

const CHAVES_STRIPE: Record<string, string> = {
  secreta: CHAVE_SECRETA,
  webhook: CHAVE_WEBHOOK,
};

export async function salvarChaveStripe(
  _anterior: EstadoConexao,
  form: FormData,
): Promise<EstadoConexao> {
  const u = await autorizar();
  if ("erro" in u) return u;

  const qual = String(form.get("qual") ?? "");
  const nomeVar = CHAVES_STRIPE[qual];
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
      return { erro: "Isso é o segredo do webhook. Ele tem campo próprio, logo abaixo.", ok: "" };
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
        erro: "O segredo do webhook começa com whsec_ e aparece uma única vez, quando você cria o endpoint no painel da Stripe.",
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
  revalidatePath("/painel/conexoes");
  return { erro: "", ok: recado };
}

export async function apagarChaveStripe(
  _anterior: EstadoConexao,
  form: FormData,
): Promise<EstadoConexao> {
  const u = await autorizar();
  if ("erro" in u) return u;

  const qual = String(form.get("qual") ?? "");
  const nomeVar = CHAVES_STRIPE[qual];
  if (!nomeVar) return { erro: "Campo desconhecido.", ok: "" };

  await apagarSegredoApp(nomeVar);
  await auditar("pagamento.chave.apagar", {
    usuarioId: u.id, entidade: "parametro", depois: { provedor: "stripe", variavel: nomeVar },
  });
  revalidatePath("/painel/conexoes");
  return {
    erro: "",
    ok:
      qual === "secreta"
        ? "Chave apagada. A loja volta ao modo demonstração: nenhum pagamento é cobrado."
        : "Segredo do webhook apagado. A Stripe deixa de conseguir confirmar pagamentos.",
  };
}

export async function testarStripe(
  _anterior: EstadoTesteStripe,
  _form: FormData,
): Promise<EstadoTesteStripe> {
  const u = await autorizar();
  if ("erro" in u) return { erro: u.erro, ok: "", conta: null };

  const r = await conferirConta();
  if (!r.ok) {
    return {
      erro: `A Stripe recusou a chave: ${r.erro ?? "sem detalhe"}`,
      ok: "",
      conta: null,
    };
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

export async function salvarComissao(
  _anterior: EstadoConexao,
  form: FormData,
): Promise<EstadoConexao> {
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
  revalidatePath("/painel/conexoes");
  // Dito na tela porque e a duvida que sempre aparece depois de mudar preco.
  return {
    erro: "",
    ok: "Comissão atualizada. Vale para os próximos pedidos — os já pagos mantêm a regra que valia no dia.",
  };
}

// --------------------------------------------------------- usuarios de teste

const VAZIO_TESTE: EstadoUsuarioTeste = {
  erro: "", ok: "", criado: null, senhaDe: "", senha: "",
};

async function canalDe(tipo: string): Promise<{ canalId: string } | { erro: string }> {
  const c = conectorPorTipo(tipo);
  if (!c) return { erro: "Conector desconhecido." };
  const q = await db.query("select id from canal where tipo = $1::tipo_canal limit 1", [c.tipo]);
  const canalId = q.rows[0]?.id;
  if (!canalId) return { erro: "Este canal ainda não existe. Guarde o Client ID primeiro." };
  return { canalId };
}

export async function criarUsuarioTesteAcao(
  _anterior: EstadoUsuarioTeste,
  form: FormData,
): Promise<EstadoUsuarioTeste> {
  const u = await autorizar();
  if ("erro" in u) return { ...VAZIO_TESTE, erro: u.erro };

  const tipo = String(form.get("tipo") ?? "");
  const alvo = await canalDe(tipo);
  if ("erro" in alvo) return { ...VAZIO_TESTE, erro: alvo.erro };

  let novo;
  try {
    // Este e o caminho que passa por mlFetch -> tokenDoCanal -> renovar. Se a
    // autorizacao estiver vencida, ela se renova aqui, sozinha, e o operador
    // nem fica sabendo.
    novo = await novoUsuarioTeste(alvo.canalId);
  } catch (e: any) {
    console.error("criarUsuarioTeste:", e);
    const msg = String(e?.message ?? e);
    if (e instanceof ErroMl && e.precisaReconectar) {
      return { ...VAZIO_TESTE, erro: `${msg} — clique em Reconectar acima.` };
    }
    return { ...VAZIO_TESTE, erro: `O Mercado Livre recusou: ${msg}` };
  }

  // A auditoria guarda QUEM criou e QUAL usuario. Nunca a senha.
  await auditar("conexao.usuario_teste", {
    usuarioId: u.id, entidade: "canal", entidadeId: alvo.canalId,
    depois: { conector: tipo, usuario_teste: novo.id, apelido: novo.apelido },
  });
  revalidatePath(`/painel/conexoes/${tipo}`);
  return {
    ...VAZIO_TESTE,
    ok: "Usuário de teste criado.",
    criado: { id: novo.id, apelido: novo.apelido, email: novo.email, senha: novo.senha },
  };
}

export async function verSenhaTesteAcao(
  _anterior: EstadoUsuarioTeste,
  form: FormData,
): Promise<EstadoUsuarioTeste> {
  const u = await autorizar();
  if ("erro" in u) return { ...VAZIO_TESTE, erro: u.erro };

  const tipo = String(form.get("tipo") ?? "");
  const id = String(form.get("id") ?? "").trim();
  const alvo = await canalDe(tipo);
  if ("erro" in alvo) return { ...VAZIO_TESTE, erro: alvo.erro };

  const senha = await senhaDoUsuarioTeste(alvo.canalId, id);
  if (!senha) {
    return {
      ...VAZIO_TESTE,
      erro: "Não consigo abrir a senha guardada deste usuário. O Mercado Livre não a mostra de novo — crie outro usuário de teste.",
    };
  }

  // Ver senha e um acesso a segredo. Fica registrado quem viu e de quem.
  await auditar("conexao.usuario_teste.senha", {
    usuarioId: u.id, entidade: "canal", entidadeId: alvo.canalId,
    depois: { conector: tipo, usuario_teste: id },
  });
  return { ...VAZIO_TESTE, senhaDe: id, senha };
}
