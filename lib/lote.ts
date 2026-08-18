// Importacao de lote de eSIM — usado pela tela de Estoque.
// Funcoes puras, para poderem ser testadas sem Next e sem banco.

export interface LinhaLote {
  lpa: string;
  iccid: string | null;
}

export interface ResultadoParse {
  linhas: LinhaLote[];
  erros: string[];
  duplicadosNoTexto: number;
}

// Aceita, por linha:
//   LPA:1$smdp.exemplo.com$ABC123
//   8955xxxxxxxxxxxxxxx;LPA:1$smdp.exemplo.com$ABC123
//   8955xxxxxxxxxxxxxxx,LPA:1$...      (ou TAB)
// O separador varia conforme quem exportou a planilha da operadora, e brigar
// com isso so gera retrabalho manual.
export function lerLote(texto: string): ResultadoParse {
  const erros: string[] = [];
  const linhas: LinhaLote[] = [];
  const vistos = new Set<string>();
  let duplicadosNoTexto = 0;

  const cruas = String(texto ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));

  cruas.forEach((linha, i) => {
    const n = i + 1;
    let iccid: string | null = null;
    let lpa = linha;

    // O LPA tem '$' e nunca tem ';' nem TAB, entao o separador e seguro.
    const m = linha.split(/[;\t,]/).map((x) => x.trim()).filter(Boolean);
    if (m.length >= 2) {
      const idxLpa = m.findIndex((x) => x.toUpperCase().startsWith("LPA:"));
      if (idxLpa === -1) {
        erros.push(`linha ${n}: nenhuma parte comeca com "LPA:"`);
        return;
      }
      lpa = m[idxLpa];
      const resto = m.filter((_, k) => k !== idxLpa);
      const cand = resto.find((x) => /^\d{18,22}$/.test(x));
      if (cand) iccid = cand;
      else if (resto.length) {
        erros.push(`linha ${n}: "${resto[0]}" nao parece um ICCID (18 a 22 digitos)`);
        return;
      }
    }

    const up = lpa.toUpperCase();
    if (!up.startsWith("LPA:")) {
      erros.push(`linha ${n}: nao comeca com "LPA:"`);
      return;
    }
    // LPA:1$<endereco do SM-DP+>$<matching id>. Menos que isso nao ativa nada,
    // e importar codigo invalido significa cliente pagando e nao recebendo.
    const partes = lpa.split("$");
    if (partes.length < 3 || !partes[1] || !partes[2]) {
      erros.push(`linha ${n}: formato invalido — esperado LPA:1$servidor$codigo`);
      return;
    }

    if (vistos.has(lpa)) {
      duplicadosNoTexto++;
      return;
    }
    vistos.add(lpa);
    linhas.push({ lpa, iccid });
  });

  return { linhas, erros, duplicadosNoTexto };
}

// Reparte o custo total do lote entre as linhas, em centavos inteiros, e joga o
// resto nas primeiras. Dividir e arredondar cada linha faria a soma NAO bater
// com a nota do fornecedor — e conferencia que nao fecha por centavos e a que
// mais consome tempo depois.
export function repartirCusto(totalBrl: string, quantidade: number): string[] | null {
  if (quantidade <= 0) return null;
  const s = String(totalBrl).trim();
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(s)) return null;

  const [ini, dec = ""] = s.split(".");
  const centavos = Number(ini) * 100 + Number((dec + "00").slice(0, 2));
  if (!Number.isSafeInteger(centavos)) return null;

  const base = Math.floor(centavos / quantidade);
  const resto = centavos - base * quantidade;

  return Array.from({ length: quantidade }, (_, i) => {
    const c = base + (i < resto ? 1 : 0);
    return `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;
  });
}
