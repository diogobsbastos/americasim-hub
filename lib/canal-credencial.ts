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
  expiraEmBreve: boolean; // menos de 24h
  escopos: string[];
  atualizadaEm: Date | null;
  ilegivel: boolean; // ha linha no banco, mas nao abre com a chave atual
}

const UMA_HORA = 3600 * 1000;

export async function salvarCredencial(canalId: string, c: Credencial): Promise<void> {
  await db.query(
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
export async function lerCredencial(canalId: string): Promise<Credencial | null> {
  const r = await db.query(
    "select access_token, refresh_token, expira_em, escopos from credencial_canal where canal_id = $1",
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
    "select access_token, expira_em, escopos, atualizado_em from credencial_canal where canal_id = $1",
    [canalId],
  );
  if (r.rows.length === 0) {
    return {
      existe: false, expiraEm: null, expirada: false, expiraEmBreve: false,
      escopos: [], atualizadaEm: null, ilegivel: false,
    };
  }
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
  const agora = Date.now();
  return {
    existe: true,
    expiraEm: expira,
    expirada: !!expira && expira.getTime() <= agora,
    expiraEmBreve: !!expira && expira.getTime() > agora && expira.getTime() - agora < 24 * UMA_HORA,
    escopos: l.escopos ?? [],
    atualizadaEm: l.atualizado_em ?? null,
    ilegivel,
  };
}

export async function apagarCredencial(canalId: string): Promise<void> {
  await db.query("delete from credencial_canal where canal_id = $1", [canalId]);
}

export { mascarar };
