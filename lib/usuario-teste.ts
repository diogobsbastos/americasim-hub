import { db } from "./db";
import { cifrarSegredo, decifrarSegredo } from "./cripto-segredo";
import { criarUsuarioTeste } from "./mercadolivre";

// Usuarios de teste do Mercado Livre.
//
// Sao contas ficticias (ate 10 por aplicacao) que publicam e compram entre si.
// Servem para provar a integracao inteira — anuncio, pedido pago, entrega do
// eSIM — sem CNPJ e sem tocar na loja de verdade.
//
// A SENHA e o ponto delicado: o ML mostra uma vez e nao repete. Se ela nao for
// guardada, o usuario de teste vira lixo — existe, ocupa uma das 10 vagas, e
// ninguem consegue entrar nele.
//
// ONDE MORA — e por que em dois lugares.
//
// Ate 24/08 morava so em `canal.config.usuarios_teste`, e o comentario antigo
// aqui dizia que nao valia a pena criar tabela para no maximo 10 itens. Estava
// errado, e o custo apareceu: a rota de retorno do OAuth gravava o `config`
// INTEIRO no ON CONFLICT, entao "Reconectar" apagou a lista e a senha do
// vendedor 3615283058 se perdeu para sempre.
//
// O tamanho do dado nunca foi o criterio. O criterio e se o dado pode ser
// refeito: token se renova, cache se recalcula, senha de usuario de teste nao
// volta de lugar nenhum. Dado irrecuperavel merece casa propria.
//
// Entao agora sao duas casas, gravadas na MESMA transacao:
//   1. `usuario_teste_ml` (migracao 009) — append-only, nenhuma rota reescreve
//      a tabela inteira;
//   2. `canal.config.usuarios_teste` — mantido para nao quebrar quem le de la.
// A leitura prefere a tabela e cai no config quando a linha ainda nao existe.

const DOMINIO = "usuario-teste";

export interface UsuarioTeste {
  id: string;
  apelido: string;
  site: string;
  email: string;
  criadoEm: string;
  papel: string; // "vendedor" | "comprador" | ""
}

// Com a senha em claro. So sai daqui para a tela de quem acabou de pedir.
export interface UsuarioTesteComSenha extends UsuarioTeste {
  senha: string;
}

function papelLimpo(v: unknown): string {
  const s = String(v ?? "");
  return s === "vendedor" || s === "comprador" ? s : "";
}

function daLinhaConfig(x: any): UsuarioTeste {
  return {
    id: String(x?.id ?? ""),
    apelido: String(x?.apelido ?? ""),
    site: String(x?.site ?? ""),
    email: String(x?.email ?? ""),
    criadoEm: String(x?.criado_em ?? ""),
    papel: papelLimpo(x?.papel),
  };
}

function daLinhaTabela(l: any): UsuarioTeste {
  return {
    id: String(l.usuario_id ?? ""),
    apelido: String(l.apelido ?? ""),
    site: String(l.site ?? ""),
    email: String(l.email ?? ""),
    criadoEm: l.criado_em instanceof Date ? l.criado_em.toISOString() : String(l.criado_em ?? ""),
    papel: papelLimpo(l.papel),
  };
}

async function doConfig(canalId: string): Promise<UsuarioTeste[]> {
  const r = await db.query("select config from canal where id = $1", [canalId]);
  const lista = r.rows[0]?.config?.usuarios_teste;
  if (!Array.isArray(lista)) return [];
  return lista.map(daLinhaConfig).filter((u) => u.id);
}

export async function listarUsuariosTeste(canalId: string): Promise<UsuarioTeste[]> {
  // Uniao das duas casas, com a TABELA mandando no conflito: se as duas tem o
  // mesmo id, a tabela e a que nao pode ter sido pisada por uma rota.
  const porId = new Map<string, UsuarioTeste>();
  for (const u of await doConfig(canalId)) porId.set(u.id, u);

  try {
    const r = await db.query(
      `select usuario_id, apelido, site, email, papel, criado_em
         from usuario_teste_ml where canal_id = $1 order by criado_em`,
      [canalId],
    );
    for (const l of r.rows) {
      const t = daLinhaTabela(l);
      if (t.id) porId.set(t.id, t);
    }
  } catch (e) {
    // Tabela ainda nao existe (migracao 009 nao aplicada). O config sozinho
    // responde — e assim que era antes.
    console.error("listarUsuariosTeste: cofre indisponivel:", e);
  }

  return [...porId.values()].sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
}

export async function novoUsuarioTeste(
  canalId: string,
  site = "MLB",
): Promise<UsuarioTesteComSenha> {
  // Chama o ML ANTES de abrir transacao. Segurar a linha do canal travada
  // durante uma chamada de rede so aumenta a janela em que outra tela fica
  // esperando — e se o ML falhar, nao ha nada para desfazer.
  const d: any = await criarUsuarioTeste(canalId, site);
  if (!d?.id) throw new Error("O Mercado Livre respondeu sem o id do usuário de teste.");

  const senha = String(d.password ?? "");
  // Cifrada e amarrada ao canal: copiar esta linha para outro canal produz erro
  // de leitura em vez de funcionar.
  const cifrada = senha ? cifrarSegredo(senha, DOMINIO, canalId) : null;
  const criadoEm = new Date().toISOString();
  const linha = {
    id: String(d.id),
    apelido: String(d.nickname ?? ""),
    site: String(d.site_id ?? site),
    email: String(d.email ?? ""),
    criado_em: criadoEm,
    senha_b64: cifrada ? cifrada.toString("base64") : "",
  };

  const cli: any = await db.connect();
  try {
    await cli.query("begin");

    // O COFRE PRIMEIRO. Se a gravacao durave falhar, a transacao inteira cai e
    // ninguem fica com a impressao de que o usuario foi salvo. O caso que nao
    // pode acontecer e o inverso: aparecer na tela e nao estar no cofre.
    await cli.query(
      `insert into usuario_teste_ml
         (canal_id, usuario_id, apelido, site, email, senha_cifrada, criado_em)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (canal_id, usuario_id) do nothing`,
      [canalId, linha.id, linha.apelido, linha.site, linha.email, cifrada, criadoEm],
    );

    // FOR UPDATE porque duas criacoes simultaneas leriam o mesmo config e a
    // segunda gravaria por cima da primeira — sumindo com um usuario de teste
    // que ja gastou uma das 10 vagas e nao da para recuperar.
    const q = await cli.query("select config from canal where id = $1 for update", [canalId]);
    const cfg = q.rows[0]?.config ?? {};
    const lista = Array.isArray(cfg.usuarios_teste) ? cfg.usuarios_teste : [];
    lista.push(linha);
    await cli.query("update canal set config = $2::jsonb where id = $1", [
      canalId,
      JSON.stringify({ ...cfg, usuarios_teste: lista }),
    ]);

    await cli.query("commit");
  } catch (e) {
    await cli.query("rollback").catch(() => {});
    throw e;
  } finally {
    cli.release();
  }

  return { ...daLinhaConfig(linha), senha };
}

export async function senhaDoUsuarioTeste(canalId: string, id: string): Promise<string> {
  const abrir = (b: Buffer): string => decifrarSegredo(b, DOMINIO, canalId);

  // Cofre primeiro.
  try {
    const r = await db.query(
      "select senha_cifrada from usuario_teste_ml where canal_id = $1 and usuario_id = $2",
      [canalId, id],
    );
    const b = r.rows[0]?.senha_cifrada;
    if (b) return abrir(b);
  } catch (e) {
    console.error("senhaDoUsuarioTeste: cofre indisponivel:", e);
  }

  // Config como segunda chance.
  try {
    const r = await db.query("select config from canal where id = $1", [canalId]);
    const lista = r.rows[0]?.config?.usuarios_teste;
    if (!Array.isArray(lista)) return "";
    const x = lista.find((u: any) => String(u?.id) === id);
    if (!x?.senha_b64) return "";
    return abrir(Buffer.from(String(x.senha_b64), "base64"));
  } catch {
    // Cifrada com outra chave, ou adulterada. Vazio faz a tela dizer "nao
    // consigo abrir", que e verdade util — melhor que estourar 500.
    return "";
  }
}
