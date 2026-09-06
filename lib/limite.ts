// Freio de tentativas (rate limit) — achado da auditoria 06/09: /v1/conta/entrar
// aceitava tentativas infinitas, e o unico custo do atacante era o scrypt.
//
// POR QUE EM MEMORIA, e nao em tabela: o hub e UM processo (systemd
// americasim-hub) e a janela util aqui e de minutos. Um Map no processo resolve
// o ataque real (milhares de tentativas por minuto) sem migracao de schema e
// sem uma escrita no banco por tentativa — que seria, ela propria, um vetor de
// carga. LIMITACAO ACEITA E CONSCIENTE: o contador zera quando o processo
// reinicia (todo deploy). Isso da ao atacante uma janela nova por deploy, o que
// e irrelevante diante do custo de descobrir uma senha. Se um dia o hub rodar em
// mais de um processo/maquina, trocar por tabela ou Redis — a interface abaixo
// nao muda.
//
// Janela DESLIZANTE por lista de instantes: mais honesta que a janela fixa, que
// deixa passar 2x o limite na virada.

type Registro = { batidas: number[] };

const memoria = new Map<string, Registro>();

// Faxina preguicosa: sem isto, um alvo de ataque com muitas chaves distintas
// (um e-mail diferente por tentativa) faria o Map crescer sem teto.
const MAX_CHAVES = 20_000;

function limparSeGrande(agora: number, janelaMs: number) {
  if (memoria.size < MAX_CHAVES) return;
  for (const [k, reg] of memoria) {
    if (reg.batidas.length === 0 || agora - reg.batidas[reg.batidas.length - 1] > janelaMs) {
      memoria.delete(k);
    }
  }
}

export interface Veredito {
  ok: boolean;
  restantes: number;
  esperaSegundos: number;
}

// Registra uma batida e diz se passou do limite.
// `chave` deve embutir o escopo (ex.: "entrar:email:fulano@x.com").
export function bater(chave: string, max: number, janelaMs: number): Veredito {
  const agora = Date.now();
  limparSeGrande(agora, janelaMs);

  const reg = memoria.get(chave) ?? { batidas: [] };
  // descarta o que saiu da janela
  const dentro = reg.batidas.filter((t) => agora - t < janelaMs);
  dentro.push(agora);
  memoria.set(chave, { batidas: dentro });

  if (dentro.length <= max) {
    return { ok: true, restantes: max - dentro.length, esperaSegundos: 0 };
  }
  // Quanto falta para a batida mais antiga sair da janela.
  const maisAntiga = dentro[0];
  const espera = Math.max(1, Math.ceil((janelaMs - (agora - maisAntiga)) / 1000));
  return { ok: false, restantes: 0, esperaSegundos: espera };
}

// Sucesso limpa o contador: quem acertou a senha nao deve carregar o peso das
// tentativas erradas anteriores (o alvo do freio e o ataque, nao o esquecido).
export function perdoar(chave: string) {
  memoria.delete(chave);
}

// IP de quem chamou, atras do Nginx. Pegamos o PRIMEIRO da cadeia
// x-forwarded-for (o cliente); os demais sao proxies. Sem header, "?" — e o
// suficiente: o freio por e-mail continua valendo.
export function ipDaRequisicao(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const primeiro = xff.split(",")[0]?.trim();
  return primeiro || req.headers.get("x-real-ip") || "?";
}

export function respostaFreio(esperaSegundos: number): Response {
  return Response.json(
    {
      erro: {
        codigo: "muitas_tentativas",
        mensagem: `Muitas tentativas. Tente de novo em ${esperaSegundos > 60 ? Math.ceil(esperaSegundos / 60) + " minutos" : esperaSegundos + " segundos"}.`,
        detalhe: null,
        requisicao_id: null,
      },
    },
    { status: 429, headers: { "retry-after": String(esperaSegundos) } },
  );
}
