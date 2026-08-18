import { db } from "./db";
import { estadoCredencial, type EstadoCredencial } from "./canal-credencial";
import { ondeEstaOSegredo } from "./segredo-app";

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
  envSecret: string;     // nome da variavel de ambiente / do segredo cifrado
  urlDev: string;
  escopos: string[];
  autorizacaoBase?: string;
  // Onde o operador edita a aplicacao depois de criada.
  urlPainel?: string;
  // O que precisa estar marcado no painel do marketplace. Fica AQUI, como dado,
  // e nao numa conversa: quem for conferir daqui a seis meses nao vai ter o
  // chat, vai ter a tela.
  configuracao?: ConfiguracaoExigida;
}

export interface ConfiguracaoExigida {
  fluxos: { nome: string; ligar: boolean; porque: string }[];
  pkce: { ligar: boolean; porque: string };
  negocios: { nome: string; ligar: boolean }[];
  permissoes: { nome: string; nivel: string; porque: string; essencial: boolean }[];
  topicos: { nome: string; ligar: boolean; quando: string; porque: string }[];
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
    urlPainel: "https://developers.mercadolivre.com.br/devcenter",
    configuracao: {
      fluxos: [
        { nome: "Authorization Code", ligar: true, porque: "E o vaivem que usamos para autorizar." },
        {
          nome: "Refresh Token",
          ligar: true,
          porque:
            "Sem ele o acesso morre em 6 horas e alguem precisa reconectar na mao todo dia.",
        },
        { nome: "Client Credentials", ligar: true, porque: "Nao usamos, mas marcado nao atrapalha." },
      ],
      pkce: {
        ligar: false,
        porque:
          "Se ligar, o ML passa a exigir um parametro extra (code_verifier) que este codigo nao envia — e a autorizacao falha na volta com uma mensagem que nao explica nada.",
      },
      negocios: [
        { nome: "Mercado Livre", ligar: true },
        { nome: "VIS", ligar: false },
      ],
      permissoes: [
        { nome: "Usuarios", nivel: "Leitura e escrita", porque: "E como o hub sabe de qual conta ele fala.", essencial: true },
        { nome: "Publicacao e sincronizacao", nivel: "Leitura e escrita", porque: "Criar, atualizar e pausar anuncio. Sem isso nao existe integracao.", essencial: true },
        { nome: "Venda e envios de um produto", nivel: "Leitura e escrita", porque: "Ler o pedido pago e o que dispara a entrega do eSIM.", essencial: true },
        { nome: "Comunicacoes pre e pos-vendas", nivel: "Leitura", porque: "Ver pergunta de comprador. Escrita nao: o hub nao responde ninguem sozinho.", essencial: false },
        { nome: "Metricas do negocio", nivel: "Leitura", porque: "Alimenta a tabela metrica_canal.", essencial: false },
        { nome: "Publicidade de um produto", nivel: "Sem acesso", porque: "Nao criamos campanha.", essencial: false },
        { nome: "Faturamento de uma venda", nivel: "Sem acesso", porque: "Nota fiscal depende de CNPJ, que ainda nao temos.", essencial: false },
        { nome: "Promocoes, cupons e descontos", nivel: "Sem acesso", porque: "Nao usamos.", essencial: false },
      ],
      topicos: [
        { nome: "Orders_v2", ligar: false, quando: "quando o receptor de avisos existir", porque: "Pedido pago — e o que dispara a entrega." },
        { nome: "Items", ligar: false, quando: "quando o receptor de avisos existir", porque: "Alguem pausou ou alterou o anuncio por fora do hub." },
        { nome: "Questions", ligar: false, quando: "depois", porque: "Pergunta de comprador no anuncio." },
        { nome: "Items Prices", ligar: false, quando: "depois", porque: "Preco mudou por fora do hub." },
        { nome: "Orders Feedback / Quotations / Stock-Locations / User Products Families", ligar: false, quando: "nunca", porque: "Nao se aplicam a eSIM." },
      ],
    },
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
    urlPainel: "https://sellercentral.amazon.com.br/",
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
  // De onde o segredo veio. A tela mostra isso porque "esta no .env" e "esta no
  // banco" se resolvem de formas diferentes quando algo da errado.
  ondeSegredo: "ambiente" | "banco" | "ilegivel" | "nenhum";
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
  // So SE existe e DE ONDE veio, nunca o valor. Segredo de aplicacao nao passa
  // por tela, log nem auditoria.
  const ondeSegredo = await ondeEstaOSegredo(c.envSecret);
  const temSegredo = ondeSegredo === "ambiente" || ondeSegredo === "banco";

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
    clientId, temSegredo, ondeSegredo, cred, situacao, rotulo: ROTULO[situacao], detalhe,
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
      return "O Client ID está guardado. Falta a senha da aplicação — é o campo logo abaixo. Ela é guardada cifrada: um backup do banco, sozinho, não abre nada.";
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
