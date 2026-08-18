import { db } from "./db";
import { lerCredencial, salvarCredencial } from "./canal-credencial";
import { conectorPorTipo } from "./conectores";
import { lerSegredoApp } from "./segredo-app";

// A camada de chamada ao Mercado Livre.
//
// Existe por um motivo so: o access_token do ML vale 6 HORAS. Sem o que esta
// aqui, a conexao autorizada as 20h esta morta as 2h e o operador descobre
// quando um pedido nao entrega. A tela ja dizia "sera renovada sozinha" — nao
// era verdade ate agora, porque nao havia nada que renovasse.
//
// Tudo que for falar com o ML (publicar anuncio, ler pedido, criar usuario de
// teste) passa por `mlFetch`. Ninguem chama fetch no ML direto: quem chama
// direto e quem esquece de renovar.

const API = "https://api.mercadolibre.com";
const TOKEN_URL = `${API}/oauth/token`;

// Renova com folga. Nao adianta renovar no ultimo segundo: entre decidir e a
// chamada chegar no ML o token pode ja ter virado, e o relogio do servidor nao
// e obrigado a concordar com o do ML.
const MARGEM = 20 * 60 * 1000;
const TEMPO_LIMITE = 15000;

export class ErroMl extends Error {
  status: number;
  // true = nao adianta tentar de novo, alguem tem que clicar em Conectar.
  precisaReconectar: boolean;
  constructor(mensagem: string, status = 0, precisaReconectar = false) {
    super(mensagem);
    this.name = "ErroMl";
    this.status = status;
    this.precisaReconectar = precisaReconectar;
  }
}

export interface CanalMl {
  id: string;
  config: Record<string, any>;
}

export async function canalMl(): Promise<CanalMl | null> {
  const r = await db.query(
    "select id, config from canal where tipo = 'mercadolivre'::tipo_canal limit 1",
  );
  if (r.rows.length === 0) return null;
  return { id: r.rows[0].id, config: r.rows[0].config ?? {} };
}

async function aplicacao(): Promise<{ clientId: string; segredo: string }> {
  const c = conectorPorTipo("mercadolivre");
  if (!c) throw new ErroMl("Conector mercadolivre nao existe no catalogo.");
  const [p, segredo] = await Promise.all([
    db.query("select valor from parametro where chave = $1", [c.paramClientId]),
    lerSegredoApp(c.envSecret),
  ]);
  const clientId = String(p.rows[0]?.valor ?? "").trim();
  if (!clientId || !segredo) {
    throw new ErroMl("Falta o Client ID ou a senha da aplicação.", 0, true);
  }
  return { clientId, segredo };
}

// Devolve um token que serve AGORA, renovando se preciso.
export async function tokenDoCanal(canalId: string): Promise<string> {
  const cred = await lerCredencial(canalId);
  if (!cred) throw new ErroMl("Este canal ainda não foi autorizado.", 0, true);
  const restante = cred.expiraEm ? cred.expiraEm.getTime() - Date.now() : -1;
  if (restante > MARGEM) return cred.accessToken;
  return renovar(canalId);
}

// Troca o refresh_token por um par novo.
//
// A trava e o ponto delicado. O ML ROTACIONA o refresh a cada uso: quem usa
// devolve um novo e o antigo morre na hora. Se duas requisicoes renovarem ao
// mesmo tempo, a segunda apresenta um refresh ja queimado, leva invalid_grant e
// derruba a conexao inteira — e o sintoma aparece horas depois, sem relacao
// aparente com a causa. Por isso a linha da credencial e travada com FOR UPDATE
// e a gravacao acontece na MESMA conexao que segura a trava.
export async function renovar(canalId: string, forcar = false): Promise<string> {
  const { clientId, segredo } = await aplicacao();
  const cli: any = await db.connect();
  try {
    await cli.query("begin");
    const cred = await lerCredencial(canalId, cli, true);
    if (!cred) throw new ErroMl("Este canal ainda não foi autorizado.", 0, true);

    // Quem ficou esperando na trava pode ter chegado depois de outro ja ter
    // renovado. Nesse caso o trabalho ja esta feito.
    const restante = cred.expiraEm ? cred.expiraEm.getTime() - Date.now() : -1;
    if (!forcar && restante > MARGEM) {
      await cli.query("commit");
      return cred.accessToken;
    }
    if (!cred.refreshToken) {
      throw new ErroMl(
        "A autorização venceu e não há refresh token guardado — a aplicação foi autorizada sem offline_access. Conecte de novo.",
        0,
        true,
      );
    }

    const r = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: segredo,
        refresh_token: cred.refreshToken,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TEMPO_LIMITE),
    });
    const d: any = await r.json().catch(() => null);
    if (!r.ok || !d?.access_token) {
      throw new ErroMl(
        `HTTP ${r.status} ${JSON.stringify(d ?? {}).slice(0, 300)}`,
        r.status,
        true,
      );
    }

    const escopos = String(d.scope ?? "").split(/\s+/).filter(Boolean);
    await salvarCredencial(
      canalId,
      {
        accessToken: String(d.access_token),
        // Guardar o refresh NOVO. Reaproveitar o antigo aqui e perder a conexao
        // na renovacao seguinte, com um erro que nao aponta para ca.
        refreshToken: String(d.refresh_token ?? cred.refreshToken),
        expiraEm: Number.isFinite(Number(d.expires_in))
          ? new Date(Date.now() + Number(d.expires_in) * 1000)
          : null,
        escopos: escopos.length ? escopos : cred.escopos,
      },
      cli,
    );
    await cli.query("commit");
    await registrar(canalId, "renovar", true, "");
    return String(d.access_token);
  } catch (e: any) {
    try {
      await cli.query("rollback");
    } catch {
      /* conexao ja pode ter caido; o erro que interessa e o de cima */
    }
    // Vai para log_sync, que e o que o cartao de Conexoes mostra em "últimos
    // erros". Sem isto a renovacao falha em silencio e a tela segue dizendo
    // "conectado".
    await registrar(canalId, "renovar", false, String(e?.message ?? e).slice(0, 400));
    throw e instanceof ErroMl
      ? e
      : new ErroMl(`Falha ao renovar a autorização: ${String(e?.message ?? e)}`, 0, true);
  } finally {
    cli.release();
  }
}

// Toda chamada ao ML passa por aqui.
export async function mlFetch(
  canalId: string,
  caminho: string,
  init: RequestInit = {},
  jaRenovou = false,
): Promise<any> {
  const token = await tokenDoCanal(canalId);
  const url = caminho.startsWith("http") ? caminho : `${API}${caminho}`;

  const r = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
      authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(TEMPO_LIMITE),
  });
  const corpo = await r.json().catch(() => null);

  // 401 com token que o relogio dizia estar valido: revogado por fora, ou os
  // relogios discordam. Renova a forca e tenta UMA vez — mais que isso viraria
  // laco contra a conta de chamadas do ML.
  if (r.status === 401 && !jaRenovou) {
    await renovar(canalId, true);
    return mlFetch(canalId, caminho, init, true);
  }

  if (!r.ok) {
    const msg = corpo?.message ?? corpo?.error ?? `HTTP ${r.status}`;
    const causa = Array.isArray(corpo?.cause) && corpo.cause.length
      ? ` (${corpo.cause.map((x: any) => x?.message ?? x?.code ?? "").filter(Boolean).join("; ")})`
      : "";
    throw new ErroMl(`${msg}${causa}`, r.status, r.status === 401 || r.status === 403);
  }
  return corpo;
}

// Quem e a conta do outro lado. Serve de teste de vida da conexao.
export async function contaMl(canalId: string): Promise<any> {
  return mlFetch(canalId, "/users/me");
}

// Ate 10 por aplicacao. O usuario de teste publica e compra sem CNPJ e sem
// tocar na loja de verdade — e com ele que a integracao se prova.
export async function criarUsuarioTeste(canalId: string, site = "MLB"): Promise<any> {
  return mlFetch(canalId, "/users/test_user", {
    method: "POST",
    body: JSON.stringify({ site_id: site }),
  });
}

async function registrar(
  canalId: string,
  acao: string,
  sucesso: boolean,
  detalhe: string,
): Promise<void> {
  try {
    await db.query(
      `insert into log_sync (canal_id, entidade, acao, sucesso, detalhe)
       values ($1, 'credencial', $2, $3, $4)`,
      [canalId, acao, sucesso, detalhe],
    );
  } catch (e) {
    console.error("log_sync:", e);
  }
}
