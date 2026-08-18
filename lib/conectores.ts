import { db } from "./db";
import { estadoCredencial, type EstadoCredencial } from "./canal-credencial";

// Catalogo de conectores de marketplace — a area Conexoes do painel.
//
// O enum `tipo_canal` da migracao 001 ja previa `landing | mercadolivre |
// amazon`, e `status_sync` ja previa `nao_publicado | publicando | publicado |
// divergente | erro | pausado`. Aqui so damos cara a isso.

export type TipoConector = "mercadolivre" | "amazon";

export interface Conector {
  tipo: TipoConector;
  nome: string;
  resumo: string;
  // Da para conectar HOJE? Quando nao, `porqueNao` explica — e a tela mostra
  // isso em vez de um botao que nao leva a lugar nenhum.
  disponivel: boolean;
  porqueNao?: string;
  paramClientId: string; // chave na tabela `parametro` (valor publico)
  envSecret: string;     // nome da variavel de ambiente (valor NUNCA no banco)
  urlDev: string;
  escopos: string[];
  autorizacaoBase?: string;
}

export const CONECTORES: Conector[] = [
  {
    tipo: "mercadolivre",
    nome: "Mercado Livre",
    resumo:
      "Publica as variantes como anuncios, recebe o pedido e entrega o eSIM pelo mesmo caminho da loja.",
    // Da para construir e provar TUDO agora: o ML tem usuarios de teste (ate 10,
    // `POST /users/test_user`) que publicam e compram entre si, sem exigir CNPJ.
    // O CNPJ trava vender de verdade, nao integrar.
    disponivel: true,
    paramClientId: "mercadolivre.client_id",
    envSecret: "ML_CLIENT_SECRET",
    urlDev: "https://developers.mercadolivre.com.br/devcenter",
    // `offline_access` e o que da direito ao refresh token. Sem ele a conexao
    // morre em 6 horas e alguem precisa reconectar na mao, todo dia.
    escopos: ["offline_access", "read", "write"],
    autorizacaoBase: "https://auth.mercadolivre.com.br/authorization",
  },
  {
    tipo: "amazon",
    nome: "Amazon",
    resumo: "Mesma ideia do Mercado Livre, no marketplace da Amazon.",
    disponivel: false,
    // Diferente do ML: a Amazon nao tem ambiente de teste aberto que dispense o
    // cadastro de vendedor, e o cadastro exige CNPJ. Nao ha o que construir
    // antes disso — e melhor isso estar escrito na tela do que descoberto
    // depois de meio dia de trabalho.
    porqueNao:
      "Precisa da conta de vendedor (Seller Central), que exige CNPJ. Sem ela nao ha nem ambiente de teste.",
    paramClientId: "amazon.client_id",
    envSecret: "AMAZON_CLIENT_SECRET",
    urlDev: "https://sellercentral.amazon.com.br/",
    escopos: [],
  },
];

export function conectorPorTipo(tipo: string): Conector | null {
  return CONECTORES.find((c) => c.tipo === tipo) ?? null;
}

export type Situacao =
  | "indisponivel"
  | "sem_aplicacao"
  | "sem_segredo"
  | "pronto"
  | "conectado"
  | "vencendo"
  | "vencida"
  | "ilegivel";

export interface EstadoConector {
  conector: Conector;
  canalId: string | null;
  canalCodigo: string | null;
  canalAtivo: boolean;
  clientId: string | null;
  temSegredo: boolean;
  cred: EstadoCredencial;
  situacao: Situacao;
  rotulo: string;
  detalhe: string;
  itens: { total: number; publicados: number; comErro: number };
  ultimoSync: Date | null;
  ultimosErros: { quando: Date; acao: string; detalhe: string }[];
}

const ROTULO: Record<Situacao, string> = {
  indisponivel: "Ainda não dá",
  sem_aplicacao: "Falta criar a aplicação",
  sem_segredo: "Falta a senha da aplicação",
  pronto: "Pronto para conectar",
  conectado: "Conectado",
  vencendo: "Conectado — renovando em breve",
  vencida: "Conexão expirada",
  ilegivel: "Credencial ilegível",
};

export async function estadoDoConector(c: Conector): Promise<EstadoConector> {
  const [canalQ, paramQ] = await Promise.all([
    db.query("select id, codigo, ativo from canal where tipo = $1::tipo_canal limit 1", [c.tipo]),
    db.query("select valor from parametro where chave = $1", [c.paramClientId]),
  ]);

  const canal = canalQ.rows[0] ?? null;
  const canalId: string | null = canal?.id ?? null;
  const clientId: string | null = (paramQ.rows[0]?.valor ?? "").trim() || null;
  // So a PRESENCA da variavel, nunca o valor. Segredo de aplicacao nao passa
  // por tela, log nem auditoria.
  const temSegredo = !!(process.env[c.envSecret] ?? "").trim();

  const cred = canalId
    ? await estadoCredencial(canalId)
    : {
        existe: false, expiraEm: null, expirada: false, expiraEmBreve: false,
        escopos: [], atualizadaEm: null, ilegivel: false,
      };

  let itens = { total: 0, publicados: 0, comErro: 0 };
  let ultimoSync: Date | null = null;
  let ultimosErros: { quando: Date; acao: string; detalhe: string }[] = [];

  if (canalId) {
    const [i, s] = await Promise.all([
      db.query(
        `select count(*)::int as total,
                count(*) filter (where status = 'publicado')::int as publicados,
                count(*) filter (where status = 'erro')::int as com_erro,
                max(ultimo_sync) as ultimo
           from canal_item where canal_id = $1`,
        [canalId],
      ),
      db.query(
        `select quando, acao, detalhe from log_sync
          where canal_id = $1 and not sucesso
          order by quando desc limit 5`,
        [canalId],
      ),
    ]);
    itens = {
      total: i.rows[0]?.total ?? 0,
      publicados: i.rows[0]?.publicados ?? 0,
      comErro: i.rows[0]?.com_erro ?? 0,
    };
    ultimoSync = i.rows[0]?.ultimo ?? null;
    ultimosErros = s.rows.map((r: any) => ({
      quando: r.quando, acao: r.acao, detalhe: String(r.detalhe ?? "").slice(0, 300),
    }));
  }

  // A ordem importa: `ilegivel` vem ANTES de `conectado`, senao uma credencial
  // que nao abre apareceria como saudavel e o problema so surgiria na primeira
  // venda perdida.
  let situacao: Situacao;
  if (!c.disponivel) situacao = "indisponivel";
  else if (!clientId) situacao = "sem_aplicacao";
  else if (!temSegredo) situacao = "sem_segredo";
  else if (cred.ilegivel) situacao = "ilegivel";
  else if (!cred.existe) situacao = "pronto";
  else if (cred.expirada) situacao = "vencida";
  else if (cred.expiraEmBreve) situacao = "vencendo";
  else situacao = "conectado";

  const detalhe = explicar(c, situacao, cred);

  return {
    conector: c, canalId, canalCodigo: canal?.codigo ?? null, canalAtivo: !!canal?.ativo,
    clientId, temSegredo, cred, situacao, rotulo: ROTULO[situacao], detalhe,
    itens, ultimoSync, ultimosErros,
  };
}

function explicar(c: Conector, s: Situacao, cred: EstadoCredencial): string {
  switch (s) {
    case "indisponivel":
      return c.porqueNao ?? "Ainda não disponível.";
    case "sem_aplicacao":
      return `Crie a aplicação em ${c.urlDev} e cole aqui o Client ID. Ele é público — o que não pode aparecer é a senha.`;
    case "sem_segredo":
      return `O Client ID está guardado. Falta a senha da aplicação no ambiente do servidor (${c.envSecret}), que entra pelo SSH e nunca pelo banco.`;
    case "pronto":
      return "Aplicação configurada. Falta autorizar — é o vaivém que dá ao hub permissão de publicar e ler pedidos na sua conta.";
    case "ilegivel":
      return "Existe uma credencial gravada, mas ela não abre com a chave atual. Pode ter sido gravada para outro canal ou adulterada. Desconecte e conecte de novo.";
    case "vencida":
      return "A autorização expirou e a renovação automática não aconteceu. Conecte de novo.";
    case "vencendo":
      return `A autorização vence ${cred.expiraEm ? "em " + new Date(cred.expiraEm).toLocaleString("pt-BR") : "em breve"} e será renovada sozinha.`;
    default:
      return "Tudo certo. O hub publica anúncios e recebe pedidos por este canal.";
  }
}
