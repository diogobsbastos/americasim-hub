import { createHash } from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { db } from "./db";
import { configGmail } from "./google";

// A CAIXA DO ROBO — IMAP IDLE na conta do Gmail (cofre). Por demanda de
// verdade: a conexao fica aberta em silencio e e o GOOGLE que avisa quando
// chega mensagem ('exists'). O worker so cutuca /v1/interno/email/caixa de
// tempos em tempos para GARANTIR que a conexao esta viva (build/restart do hub
// derruba; o toque religa em ate ~1 min).
//
// Chegou e-mail: remetente autorizado? anexo CSV? hash ja visto? — novo vira
// linha em `email_lote` (status pendente) para APROVACAO HUMANA na tela
// Requisicoes. CSV nunca entra sozinho no estoque (SPEC_AUTOMACOES regra 6).

export interface EstadoCaixa {
  ligada: boolean;
  desde: string | null;
  ultimaChecagem: string | null;
  ultimoErro: string | null;
  lotesNovos: number;
}

const estado: EstadoCaixa = { ligada: false, desde: null, ultimaChecagem: null, ultimoErro: null, lotesNovos: 0 };
let ligando = false;
let cliente: ImapFlow | null = null;
let verificando = false;

export function estadoCaixa(): EstadoCaixa {
  return { ...estado };
}

async function lerParametro(chave: string, padrao = ""): Promise<string> {
  const r = await db.query("select valor from parametro where chave = $1", [chave]);
  const v = String(r.rows[0]?.valor ?? "").trim();
  return v || padrao;
}

async function gravarParametro(chave: string, valor: string, descricao: string): Promise<void> {
  await db.query(
    `insert into parametro (chave, valor, tipo, descricao, atualizado_em)
     values ($1, $2, 'texto', $3, now())
     on conflict (chave) do update set valor = excluded.valor, atualizado_em = now()`,
    [chave, valor, descricao],
  );
}

export async function remetentesAutorizados(): Promise<string[]> {
  const bruto = await lerParametro("caixa.remetentes", "admin@easysim4u.com");
  return bruto.toLowerCase().split(/[\s,;]+/).filter(Boolean);
}

// Liga (ou confirma ligada) a caixa. Nunca lanca: o estado conta a historia.
export async function garantirCaixa(): Promise<EstadoCaixa> {
  if (!estado.ligada && !ligando) {
    ligando = true;
    conectar().catch(() => {});
    await new Promise((r) => setTimeout(r, 150));
  }
  return estadoCaixa();
}

async function conectar(): Promise<void> {
  try {
    const { usuario, senhaApp } = await configGmail();
    if (!usuario || !senhaApp) {
      estado.ultimoErro = "Gmail do robô não configurado (tela Sistema → Google & E-mail).";
      ligando = false;
      return;
    }
    const c = new ImapFlow({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { user: usuario, pass: senhaApp },
      logger: false,
    });
    cliente = c;
    c.on("error", (e: any) => { estado.ultimoErro = String(e?.message ?? e).slice(0, 300); });
    c.on("close", () => { estado.ligada = false; cliente = null; ligando = false; });
    await c.connect();
    await c.mailboxOpen("INBOX");
    estado.ligada = true;
    estado.desde = new Date().toISOString();
    estado.ultimoErro = null;
    ligando = false;
    console.log(`caixa: conectada como ${usuario} (IDLE)`);
    // O aviso do Google: mensagem nova na caixa.
    c.on("exists", () => { verificarNovas().catch((e) => { estado.ultimoErro = String(e?.message ?? e).slice(0, 300); }); });
    await verificarNovas();
  } catch (e: any) {
    estado.ultimoErro = String(e?.message ?? e).slice(0, 300);
    estado.ligada = false;
    ligando = false;
    try { await cliente?.logout(); } catch {}
    cliente = null;
  }
}

async function verificarNovas(): Promise<void> {
  if (!cliente || verificando) return;
  verificando = true;
  try {
    estado.ultimaChecagem = new Date().toISOString();
    const ultimoUid = Number(await lerParametro("caixa.ultimo_uid", "0")) || 0;
    const autorizados = await remetentesAutorizados();
    const { usuario } = await configGmail();
    let maiorUid = ultimoUid;

    for await (const msg of cliente.fetch(
      `${ultimoUid + 1}:*`,
      { uid: true, envelope: true, source: true },
      { uid: true },
    )) {
      if (!msg.uid || msg.uid <= ultimoUid) continue;
      maiorUid = Math.max(maiorUid, msg.uid);

      const de = String(msg.envelope?.from?.[0]?.address ?? "").toLowerCase();
      if (!de || de === usuario) continue; // nunca reagir ao proprio e-mail (anti-loço)
      const autorizado = autorizados.some((a) => (a.startsWith("@") ? de.endsWith(a) : de === a));
      if (!autorizado) continue;
      if (!msg.source) continue;

      const corpo = await simpleParser(msg.source);
      for (const anexo of corpo.attachments ?? []) {
        const nome = String(anexo.filename ?? "arquivo.csv");
        const pareceCsv =
          /csv|plain/.test(String(anexo.contentType ?? "")) || /\.(csv|txt)$/i.test(nome);
        if (!pareceCsv || !anexo.content?.length) continue;
        const texto = anexo.content.toString("utf8");
        if (!texto.trim()) continue;

        const hash = createHash("sha256").update(anexo.content).digest("hex");
        const previa = parsearCsv(texto);
        const r = await db.query(
          `insert into email_lote (mensagem_uid, remetente, assunto, recebido_em, arquivo_nome,
                                   arquivo_hash, csv_texto, linhas, iccids, previa)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
           on conflict (arquivo_hash) do nothing
           returning id`,
          [
            String(msg.uid), de, String(corpo.subject ?? ""), corpo.date ?? new Date(), nome,
            hash, texto, previa.totalLinhas, previa.iccids.length, JSON.stringify(previa.resumo),
          ],
        );
        if (r.rows.length > 0) {
          estado.lotesNovos += 1;
          console.log(`caixa: lote novo "${nome}" de ${de} — ${previa.iccids.length} ICCID(s), aguardando aprovação`);
        }
      }
    }

    if (maiorUid > ultimoUid) {
      await gravarParametro("caixa.ultimo_uid", String(maiorUid), "Ultimo UID do Gmail processado pela caixa do robo");
    }
  } finally {
    verificando = false;
  }
}

// ------------------------------------------------------------ parser do CSV
// O formato REAL da EasySim4u (visto em 02/09):
//   HIMSI;ICCID;MSISDN;PIN;PUK;ESIM_URL
// com ESIM_URL trazendo o LPA completo — ou seja, lote aprovado ja vem com QR
// pronto para vender. Cabecalho e mapeado por NOME quando existe; a heuristica
// (ICCID 18–20 digitos, LPA com '$') cobre arquivo sem cabecalho ou diferente.
// O que o parser entendeu vira PREVIA na tela — humano confere antes de entrar.

export interface LinhaCsv {
  iccid: string;
  lpa: string | null;
  extras: Record<string, string>;
}

export function parsearCsv(texto: string): {
  totalLinhas: number;
  iccids: LinhaCsv[];
  resumo: Record<string, unknown>;
} {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const primeira = linhas[0] ?? "";
  const sep = primeira.includes(";") ? ";" : primeira.includes("\t") ? "\t" : ",";

  // Linha de cabecalho tem letras e nenhum '$'; linha de dados com LPA tem '$'.
  const temCabecalho = !primeira.includes("$") && /[a-z]/i.test(primeira);
  const colunas = temCabecalho ? primeira.split(sep).map((c) => c.trim().toLowerCase()) : [];
  const idx = (nomes: string[]) => colunas.findIndex((c) => nomes.some((n) => c.includes(n)));
  const iIccid = idx(["iccid"]);
  const iLpa = idx(["esim", "lpa", "url", "qr"]);
  const extrasMapa = ([
    ["himsi", idx(["himsi", "imsi"])],
    ["msisdn", idx(["msisdn", "phone", "numero"])],
    ["pin", idx(["pin"])],
    ["puk", idx(["puk"])],
  ] as [string, number][]).filter(([, i]) => i >= 0);

  const dados = temCabecalho ? linhas.slice(1) : linhas;
  const achadas: LinhaCsv[] = [];
  for (const linha of dados) {
    const celulas = linha.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    let iccid = "";
    let lpa: string | null = null;

    if (iIccid >= 0) {
      const d = (celulas[iIccid] ?? "").replace(/\D/g, "");
      if (d.length >= 18 && d.length <= 20) iccid = d;
    }
    if (iLpa >= 0 && celulas[iLpa]?.includes("$")) lpa = celulas[iLpa];

    // Heuristica: cobre arquivo sem cabecalho ou com colunas fora do esperado.
    if (!iccid || !lpa) {
      for (const cel of celulas) {
        const digitos = cel.replace(/\D/g, "");
        const soNumero = /^[\d\s-]+$/.test(cel);
        if (!iccid && soNumero && digitos.length >= 18 && digitos.length <= 20) iccid = digitos;
        if (!lpa && cel.includes("$") && /lpa:|\$[^$]+\$/i.test(cel)) lpa = cel;
      }
    }
    if (!iccid) continue;

    const extras: Record<string, string> = {};
    for (const [nome, i] of extrasMapa) {
      const v = (celulas[i] ?? "").trim();
      if (v) extras[nome] = v;
    }
    achadas.push({ iccid, lpa, extras });
  }

  const unicos = new Map<string, LinhaCsv>();
  for (const a of achadas) if (!unicos.has(a.iccid)) unicos.set(a.iccid, a);
  const iccids = [...unicos.values()];

  return {
    totalLinhas: linhas.length,
    iccids,
    resumo: {
      separador: sep === "\t" ? "tab" : sep,
      cabecalho: temCabecalho ? colunas : null,
      campos_extras: extrasMapa.map(([n]) => n),
      total_linhas: linhas.length,
      iccids: iccids.length,
      com_lpa: iccids.filter((x) => x.lpa).length,
      amostra: iccids.slice(0, 5).map((x) => ({ iccid: x.iccid, com_lpa: !!x.lpa })),
    },
  };
}
