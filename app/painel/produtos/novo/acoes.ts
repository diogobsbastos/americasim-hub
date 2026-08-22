"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "../../../../lib/db";
import { auditar, usuarioDaSessao } from "../../../../lib/painel/sessao";
import type { EstadoNovo } from "./tipos";

// Criar produto — o CRUD que faltava (so dava por SQL ate 22/08/2026).
//
// Papeis seguem a regra ja usada na matriz: cadastrar e operacao do dia a dia
// (admin + operacao), mas mexer em CUSTO e dinheiro e so admin. Por isso o
// custo e checado separado, e nao o formulario inteiro.
const PODE_CADASTRAR = ["admin", "operacao"];
const PODE_DINHEIRO = ["admin"];

const MODOS_VALIDOS = ["estoque", "operadora_fixo", "operadora_sob_medida"];

function paraDecimal(v: string): string | null {
  let s = String(v).trim().replace(/\s/g, "").replace(/R\$/gi, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  if (!/^\d{1,9}(\.\d{1,4})?$/.test(s)) return null;
  return s;
}

// Handle e endereco: entra no link da tela e um dia na URL da loja. Acento e
// espaco viram tracinho aqui, e nao no navegador de quem abrir depois.
function paraHandle(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function inteiro(v: string): number | null {
  const s = String(v).trim();
  if (!s) return null;
  if (!/^\d{1,6}$/.test(s)) return null;
  return Number(s);
}

export async function criarProduto(_anterior: EstadoNovo, form: FormData): Promise<EstadoNovo> {
  const u = await usuarioDaSessao();
  if (!u) return { erro: "Sessao expirada. Entre de novo.", campo: "" };
  if (!PODE_CADASTRAR.includes(u.papel)) {
    return { erro: "Seu papel nao permite cadastrar produto.", campo: "" };
  }

  const familiaHandle = String(form.get("familia") ?? "").trim();
  const familiaNome = String(form.get("familia_nome") ?? "").trim();
  const sku = String(form.get("sku") ?? "").trim().toUpperCase();
  const modo = String(form.get("modo") ?? "estoque");
  const publicavelBruto = form.get("publicavel") !== null;
  const custoBruto = String(form.get("custo") ?? "");
  const moeda = String(form.get("moeda") ?? "USD").toUpperCase();
  const gb = inteiro(String(form.get("gb") ?? ""));
  const dias = inteiro(String(form.get("dias") ?? ""));
  const cobertura = String(form.get("cobertura") ?? "")
    .toUpperCase()
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter((x) => /^[A-Z]{2}$/.test(x));

  if (!MODOS_VALIDOS.includes(modo)) return { erro: "Modo de entrega invalido.", campo: "modo" };
  if (!sku) return { erro: "O SKU e obrigatorio — e por ele que o marketplace casa o anuncio.", campo: "sku" };
  if (!/^[A-Z0-9][A-Z0-9._-]{2,39}$/.test(sku)) {
    return { erro: "SKU so aceita letras, numeros, ponto, hifen e sublinhado (3 a 40).", campo: "sku" };
  }
  if (!familiaHandle && !familiaNome) {
    return { erro: "Escolha uma familia existente ou de um nome para a nova.", campo: "familia" };
  }

  // A trava do banco (CHECK da migracao 008) diz que sob medida nao vai para
  // marketplace. Repetimos aqui para o operador ver a razao na tela, em vez de
  // levar um erro de constraint na cara.
  const publicavel = modo === "operadora_sob_medida" ? false : publicavelBruto;

  const custo = custoBruto.trim() === "" ? null : paraDecimal(custoBruto);
  if (custoBruto.trim() !== "" && custo === null) {
    return { erro: `Custo invalido: "${custoBruto}".`, campo: "custo" };
  }
  if (custo !== null && !PODE_DINHEIRO.includes(u.papel)) {
    return { erro: "So um administrador pode informar custo. Deixe em branco e peca depois.", campo: "custo" };
  }

  const atributos: Record<string, unknown> = {};
  if (gb !== null) atributos.gb = gb;
  if (dias !== null) atributos.dias = dias;
  if (cobertura.length) atributos.cobertura = cobertura;

  const c = await db.connect();
  let varianteId = "";
  let handleFinal = familiaHandle;

  try {
    await c.query("begin");

    // SKU duplicado e o erro mais provavel aqui, e o mais caro: dois itens com
    // o mesmo codigo quebram o de-para com o Mercado Livre, que casa por SKU.
    const jaTem = await c.query("select 1 from variante where upper(sku) = $1", [sku]);
    if (jaTem.rows.length > 0) {
      await c.query("rollback");
      return { erro: `Ja existe um produto com o SKU ${sku}.`, campo: "sku" };
    }

    let produtoId = "";
    if (familiaHandle) {
      const f = await c.query("select id, handle from produto where handle = $1", [familiaHandle]);
      if (f.rows.length === 0) {
        await c.query("rollback");
        return { erro: "Essa familia nao existe mais. Recarregue a pagina.", campo: "familia" };
      }
      produtoId = f.rows[0].id;
      handleFinal = f.rows[0].handle;
    } else {
      let h = paraHandle(familiaNome);
      if (!h) {
        await c.query("rollback");
        return { erro: "Esse nome nao gera um endereco valido. Use letras ou numeros.", campo: "familia_nome" };
      }
      // Sufixo numerico em vez de erro: quem esta cadastrando quer cadastrar,
      // nao resolver colisao de nome.
      const base = h;
      for (let i = 2; i < 50; i++) {
        const ocupado = await c.query("select 1 from produto where handle = $1", [h]);
        if (ocupado.rows.length === 0) break;
        h = `${base}-${i}`;
      }
      const novo = await c.query(
        "insert into produto (handle, nome, tipo, ativo) values ($1, $2, 'digital', true) returning id",
        [h, familiaNome],
      );
      produtoId = novo.rows[0].id;
      handleFinal = h;
    }

    const v = await c.query(
      `insert into variante
         (produto_id, sku, atributos, custo, custo_moeda, ativo,
          modo_entrega, publicavel_marketplace)
       values ($1, $2, $3::jsonb, $4::numeric, $5, true, $6::modo_entrega, $7)
       returning id`,
      [produtoId, sku, JSON.stringify(atributos), custo, moeda, modo, publicavel],
    );
    varianteId = v.rows[0].id;

    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    console.error("criarProduto:", e);
    return { erro: "Falha ao gravar. Nada foi criado.", campo: "" };
  } finally {
    c.release();
  }

  await auditar("produto.criar", {
    usuarioId: u.id,
    entidade: "variante",
    entidadeId: varianteId,
    antes: null,
    depois: { sku, modo_entrega: modo, publicavel_marketplace: publicavel, familia: handleFinal },
  });

  revalidatePath("/painel/produtos");
  revalidatePath(`/painel/produtos/${handleFinal}`);

  // Fora do try: `redirect` funciona lancando, e um catch generico o engoliria.
  redirect(`/painel/produtos?q=${encodeURIComponent(sku)}`);
}
