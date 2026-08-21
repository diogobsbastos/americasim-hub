import { clienteStripe } from "./stripe";
import { db } from "./db";

// Domínios de forma de pagamento — SPEC/13 §"O custo escondido".
//
// O Express Checkout Element só desenha Google Pay / Apple Pay / Link em
// domínios REGISTRADOS na Stripe. Esquecer um registro nao da erro: o botao
// simplesmente nao aparece, e ninguem descobre ate a conversao cair sem
// explicacao. Por isso esta tela existe — e por isso ela mostra o estado de
// cada carteira POR DOMINIO, em vez de so dizer "registrado sim/nao".
//
// A SPEC/13 sugeriu guardar um marcador `dominio_registrado_stripe` no
// `canal.config`. Nao fazemos isso de proposito: marcador em banco vira mentira
// no dia em que alguem mexe no dashboard da Stripe por fora. A verdade e
// perguntada a Stripe a cada carregamento da tela. O que guardamos no
// `canal.config` e apenas QUAL e o dominio de cada vitrine — isso sim e nosso.

export type StatusCarteira = "active" | "inactive" | "desconhecido";

export interface DominioStripe {
  id: string;
  dominio: string;
  habilitado: boolean;
  googlePay: StatusCarteira;
  applePay: StatusCarteira;
  link: StatusCarteira;
}

export interface VitrineDominio {
  canalId: string;
  canalCodigo: string;
  canalNome: string;
  // Nulo = ninguem disse ainda qual e o dominio desta vitrine.
  dominio: string | null;
  // Sugestao lida do ambiente, para o operador nao ter que digitar.
  sugestao: string | null;
  registro: DominioStripe | null;
  // `www` e subdominio e precisa de registro PROPRIO (SPEC/13). Nao vale para
  // duckdns, que nao tem www.
  precisaWww: boolean;
  wwwRegistrado: boolean;
}

function statusDe(v: unknown): StatusCarteira {
  const s = (v as { status?: string } | null)?.status;
  return s === "active" || s === "inactive" ? s : "desconhecido";
}

function paraDominio(d: any): DominioStripe {
  return {
    id: String(d?.id ?? ""),
    dominio: String(d?.domain_name ?? ""),
    habilitado: d?.enabled !== false,
    googlePay: statusDe(d?.google_pay),
    applePay: statusDe(d?.apple_pay),
    link: statusDe(d?.link),
  };
}

// Lista o que a Stripe tem registrado HOJE. Fonte da verdade, sempre.
export async function listarDominios(): Promise<DominioStripe[] | { erro: string }> {
  const s = await clienteStripe();
  if (!s) return { erro: "Nao ha chave da Stripe configurada." };
  try {
    // rawRequest pelo mesmo motivo de `conferirConta`: mantem a chamada estavel
    // mesmo quando o SDK muda a assinatura do recurso entre versoes maiores.
    const r: any = await s.cli.rawRequest("GET", "/v1/payment_method_domains?limit=100");
    const dados = Array.isArray(r?.data) ? r.data : [];
    return dados.map(paraDominio);
  } catch (e: any) {
    return { erro: String(e?.message ?? e).slice(0, 300) };
  }
}

export async function registrarDominio(dominio: string): Promise<DominioStripe | { erro: string }> {
  const s = await clienteStripe();
  if (!s) return { erro: "Nao ha chave da Stripe configurada." };
  const nome = dominio.trim().toLowerCase();
  try {
    const r: any = await s.cli.rawRequest("POST", "/v1/payment_method_domains", {
      domain_name: nome,
    });
    return paraDominio(r);
  } catch (e: any) {
    return { erro: String(e?.message ?? e).slice(0, 300) };
  }
}

// Revalidar serve para depois de consertar algo do lado do dominio: a Stripe
// refaz a verificacao em vez de esperar o proximo ciclo dela.
export async function revalidarDominio(id: string): Promise<DominioStripe | { erro: string }> {
  const s = await clienteStripe();
  if (!s) return { erro: "Nao ha chave da Stripe configurada." };
  try {
    const r: any = await s.cli.rawRequest(
      "POST",
      `/v1/payment_method_domains/${encodeURIComponent(id)}/validate`,
    );
    return paraDominio(r);
  } catch (e: any) {
    return { erro: String(e?.message ?? e).slice(0, 300) };
  }
}

// De onde vem a SUGESTAO de dominio: o mapa `CHAVES_VITRINE` do ambiente, que
// ja associa host -> chave de canal. E so sugestao — quem confirma e o operador,
// porque host de desenvolvimento tambem aparece nesse mapa.
function hostsDoAmbiente(): string[] {
  const bruto = process.env.CHAVES_VITRINE ?? "";
  const fora: string[] = [];
  if (bruto.trim()) {
    try {
      const o = JSON.parse(bruto);
      if (o && typeof o === "object") fora.push(...Object.keys(o));
    } catch {
      // JSON torto no .env nao derruba a tela; a sugestao apenas nao aparece.
    }
  }
  return fora.map((h) => h.split(":")[0].trim().toLowerCase()).filter(Boolean);
}

// `www.x.com` precisa de registro proprio (SPEC/13). Nao se aplica a duckdns,
// que nao serve www, nem a um dominio que JA e www.
function exigeWww(dominio: string): boolean {
  if (!dominio) return false;
  if (dominio.startsWith("www.")) return false;
  if (dominio.endsWith(".duckdns.org")) return false;
  // Subdominio de terceiro nivel (loja.marca.com.br) tambem nao usa www.
  const partes = dominio.split(".");
  return partes.length <= 3;
}

export async function estadoDosDominios(): Promise<{
  vitrines: VitrineDominio[];
  soltos: DominioStripe[];
  erro: string;
}> {
  const [canaisQ, lista] = await Promise.all([
    db.query(
      `select id, codigo, nome, config->>'dominio' as dominio
         from canal
        where tipo = 'landing'::tipo_canal
        order by codigo`,
    ),
    listarDominios(),
  ]);

  if ("erro" in lista) {
    return { vitrines: [], soltos: [], erro: lista.erro };
  }

  const porNome = new Map<string, DominioStripe>();
  for (const d of lista) porNome.set(d.dominio, d);

  const sugestoes = hostsDoAmbiente();
  const usados = new Set<string>();

  const vitrines: VitrineDominio[] = canaisQ.rows.map((c: any, i: number) => {
    const dominio: string | null = (c.dominio ?? "").trim() || null;
    if (dominio) usados.add(dominio);
    const registro = dominio ? porNome.get(dominio) ?? null : null;
    if (registro) usados.add(registro.dominio);

    const precisaWww = dominio ? exigeWww(dominio) : false;
    const wwwRegistrado = precisaWww ? porNome.has(`www.${dominio}`) : false;
    if (wwwRegistrado) usados.add(`www.${dominio}`);

    return {
      canalId: c.id,
      canalCodigo: c.codigo,
      canalNome: c.nome,
      dominio,
      // Sugere o host do ambiente que ainda nao foi usado por outra vitrine.
      sugestao: dominio ? null : sugestoes[i] ?? sugestoes[0] ?? null,
      registro,
      precisaWww,
      wwwRegistrado,
    };
  });

  // Registrado na Stripe mas sem vitrine correspondente. Nao e erro — pode ser
  // `checkout.stripe.com`, que a propria Stripe cria — mas precisa aparecer,
  // senao a tela mente por omissao.
  const soltos = lista.filter((d) => !usados.has(d.dominio));

  return { vitrines, soltos, erro: "" };
}
