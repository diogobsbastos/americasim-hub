import { db } from "./db";
import { cifrarSegredo, decifrarSegredo, mascarar } from "./cripto-segredo";

// Credencial de canal (Mercado Livre, Amazon, ...) — SPEC/06.
//
// As colunas `access_token` e `refresh_token` ja nasceram `bytea` na migracao
// 001: a SPEC sempre previu que fossem cifradas. Este arquivo e o codigo que
// faltava para cumprir isso.
//
// A AMARRA e o `canal_id`. O texto cifrado so abre no canal a que pertence:
// copiar a linha de credencial de um canal para outro produz erro de leitura em
// vez de funcionar. Sem isso, quem tivesse escrita no banco poderia mover uma
// credencial e passar a agir como outra loja.
//
// O token NUNCA volta inteiro para tela, log ou auditoria. Para conferir "e a
// mesma credencial de ontem?" existe a impressao digital; para mostrar ao
// operador existe `mascarar`.

const DOMINIO = "credencial-canal";

// Pool ou PoolClient — os dois tem .query. A renovacao de token precisa gravar
// DENTRO da transacao que segurou a trava da linha; se gravasse pelo pool, seria
// outra conexao esperando uma trava que ela mesma segura, e travaria de vez.
export interface Executor {
  query(texto: string, valores?: unknown[]): Promise<{ rows: any[] }>;
}

export interface Credencial {
  accessToken: string;
  refreshToken: string;
  expiraEm: Date | null;
  escopos: string[];
}

export interface EstadoCredencial {
  existe: boolean;
  expiraEm: Date | null;
  expirada: boolean;
  // Perto de vencer PARA A VIDA DELE. Antes isto era "menos de 24 h", o que com
  // o token do Mercado Livre — que nasce valendo 6 h — ficava aceso desde o
  // segundo em que era emitido. Alerta sempre aceso nao e alerta, e ruido.
  expiraEmBreve: boolean;
  // Existe refresh token guardado. Quando existe, vencer nao e um evento: a
  // proxima chamada renova sozinha. Quando NAO existe, vencer significa que
  // alguem vai ter que reconectar na mao.
  temRefresh: boolean;
  escopos: string[];
  atualizadaEm: Date | null;
  ilegivel: boolean; // ha linha no banco, mas nao abre com a chave atual
}

export const ESTADO_CREDENCIAL_VAZIO: EstadoCredencial = {
  existe: false, expiraEm: null, expirada: false, expiraEmBreve: false,
  temRefresh: false, escopos: [], atualizadaEm: null, ilegivel: false,
};

const UM_MINUTO = 60 * 1000;

export async function salvarCredencial(
  canalId: string,
  c: Credencial,
  ex: Executor = db,
): Promise<void> {
  await ex.query(
    `insert into credencial_canal (canal_id, access_token, refresh_token, expira_em, escopos, atualizado_em)
     values ($1, $2, $3, $4, $5, now())
     on conflict (canal_id) do update
       set access_token = excluded.access_token,
           refresh_token = excluded.refresh_token,
           expira_em = excluded.expira_em,
           escopos = excluded.escopos,
           atualizado_em = now()`,
    [
      canalId,
      cifrarSegredo(c.accessToken, DOMINIO, canalId),
      c.refreshToken ? cifrarSegredo(c.refreshToken, DOMINIO, canalId) : null,
      c.expiraEm,
      c.escopos,
    ],
  );
}

// Devolve os segredos abertos. So chamar onde eles serao REALMENTE usados —
// numa chamada ao marketplace. Nunca para "mostrar na tela".
//
// `travar` liga o FOR UPDATE: exige estar dentro de uma transacao (passe o
// PoolClient em `ex`) e serve para serializar a renovacao do token.
export async function lerCredencial(
  canalId: string,
  ex: Executor = db,
  travar = false,
): Promise<Credencial | null> {
  const r = await ex.query(
    `select access_token, refresh_token, expira_em, escopos
       from credencial_canal where canal_id = $1${travar ? " for update" : ""}`,
    [canalId],
  );
  if (r.rows.length === 0) return null;
  const l = r.rows[0];
  return {
    accessToken: decifrarSegredo(l.access_token, DOMINIO, canalId),
    refreshToken: l.refresh_token ? decifrarSegredo(l.refresh_token, DOMINIO, canalId) : "",
    expiraEm: l.expira_em ?? null,
    escopos: l.escopos ?? [],
  };
}

// O que a TELA pode saber: se existe, quando vence, se abre. Nada do segredo.
export async function estadoCredencial(canalId: string): Promise<EstadoCredencial> {
  const r = await db.query(
    `select access_token, (refresh_token is not null) as tem_refresh,
            expira_em, escopos, atualizado_em
       from credencial_canal where canal_id = $1`,
    [canalId],
  );
  if (r.rows.length === 0) return { ...ESTADO_CREDENCIAL_VAZIO };
  const l = r.rows[0];

  // Ha linha, mas nao abre: chave trocada, registro adulterado, ou credencial
  // gravada com outro canal_id. Precisa aparecer como PROBLEMA na tela, nao
  // como "conectado" — senao o operador so descobre na primeira venda perdida.
  let ilegivel = false;
  try {
    decifrarSegredo(l.access_token, DOMINIO, canalId);
  } catch {
    ilegivel = true;
  }

  const expira: Date | null = l.expira_em ?? null;
  const nasceu: Date | null = l.atualizado_em ?? null;
  const agora = Date.now();

  // A janela de alerta e proporcional a vida do proprio token, nao um numero
  // fixo: 6 h no ML, dias em outro marketplace. Um quinto da vida, com piso de
  // 10 min para token de vida muito curta.
  let janela = 10 * UM_MINUTO;
  if (expira && nasceu) {
    const vida = expira.getTime() - nasceu.getTime();
    if (vida > 0) janela = Math.max(janela, vida / 5);
  }

  return {
    existe: true,
    expiraEm: expira,
    expirada: !!expira && expira.getTime() <= agora,
    expiraEmBreve: !!expira && expira.getTime() > agora && expira.getTime() - agora < janela,
    temRefresh: !!l.tem_refresh,
    escopos: l.escopos ?? [],
    atualizadaEm: nasceu,
    ilegivel,
  };
}

export async function apagarCredencial(canalId: string): Promise<void> {
  await db.query("delete from credencial_canal where canal_id = $1", [canalId]);
}

export { mascarar };
