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
// ninguem consegue entrar nele. Entao ela e guardada CIFRADA, amarrada ao
// canal, do mesmo jeito que o Client Secret.
//
// Onde mora: `canal.config.usuarios_teste`. Nao criei tabela para uma lista de
// no maximo 10 itens que so existe enquanto a integracao esta sendo provada.

const DOMINIO = "usuario-teste";

export interface UsuarioTeste {
  id: string;
  apelido: string;
  site: string;
  email: string;
  criadoEm: string;
}

// Com a senha em claro. So sai daqui para a tela de quem acabou de pedir.
export interface UsuarioTesteComSenha extends UsuarioTeste {
  senha: string;
}

function daLinha(x: any): UsuarioTeste {
  return {
    id: String(x?.id ?? ""),
    apelido: String(x?.apelido ?? ""),
    site: String(x?.site ?? ""),
    email: String(x?.email ?? ""),
    criadoEm: String(x?.criado_em ?? ""),
  };
}

export async function listarUsuariosTeste(canalId: string): Promise<UsuarioTeste[]> {
  const r = await db.query("select config from canal where id = $1", [canalId]);
  const lista = r.rows[0]?.config?.usuarios_teste;
  if (!Array.isArray(lista)) return [];
  return lista.map(daLinha).filter((u) => u.id);
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
  const linha = {
    id: String(d.id),
    apelido: String(d.nickname ?? ""),
    site: String(d.site_id ?? site),
    email: String(d.email ?? ""),
    criado_em: new Date().toISOString(),
    // Cifrada e amarrada ao canal: copiar esta linha para outro canal produz
    // erro de leitura em vez de funcionar.
    senha_b64: senha ? cifrarSegredo(senha, DOMINIO, canalId).toString("base64") : "",
  };

  const cli: any = await db.connect();
  try {
    await cli.query("begin");
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

  return { ...daLinha(linha), senha };
}

export async function senhaDoUsuarioTeste(canalId: string, id: string): Promise<string> {
  const r = await db.query("select config from canal where id = $1", [canalId]);
  const lista = r.rows[0]?.config?.usuarios_teste;
  if (!Array.isArray(lista)) return "";
  const x = lista.find((u: any) => String(u?.id) === id);
  if (!x?.senha_b64) return "";
  try {
    return decifrarSegredo(Buffer.from(String(x.senha_b64), "base64"), DOMINIO, canalId);
  } catch {
    // Cifrada com outra chave, ou adulterada. Vazio faz a tela dizer "nao
    // consigo abrir", que e verdade util — melhor que estourar 500.
    return "";
  }
}
