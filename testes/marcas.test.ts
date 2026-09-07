import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MARCAS, MARCA_PADRAO, cssDaMarca } from "../lib/marcas-dados.ts";

// POR QUE ESTE ARQUIVO EXISTE (07/09/2026)
//
// A ViagemSim sobrescrevia 14 dos 15 tokens de cor e esquecia UM:
// --marca-suave. Ninguem percebeu por meses porque o token so aparece com o
// APARELHO do visitante em modo escuro — e ai a loja azul herdava o vinho da
// AmericaSim. Medido ao vivo em viagemsim.duckdns.org: o item ativo do menu do
// cliente ficava com fundo #3B1526 e texto #1E5AAB, contraste 2,35:1.
//
// Uma revisao de codigo nao pega isso: falta uma linha, e falta de linha nao
// aparece no diff. Um teste pega. A regra e mecanica: TODO token que o
// globals.css inverte no bloco escuro TEM de estar em TODA vitrine que declara
// paleta propria — senao, naquele token, a vitrine vira a AmericaSim.

const globals = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

// Extrai os tokens declarados dentro de @media (prefers-color-scheme: dark).
// Sao exatamente os que MUDAM com o tema — os perigosos.
function tokensDoModoEscuro(css: string): string[] {
  const i = css.indexOf("@media (prefers-color-scheme: dark)");
  assert.notEqual(i, -1, "globals.css perdeu o bloco de modo escuro — este teste ficou cego");
  // Fecha no primeiro `}` de coluna zero depois do bloco (o do proprio @media).
  const fim = css.indexOf("\n}", css.indexOf("{", i));
  const bloco = css.slice(i, fim);
  return [...new Set([...bloco.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gim)].map((m) => m[1]))];
}

const OBRIGATORIOS = tokensDoModoEscuro(globals);

test("o bloco de modo escuro do globals foi lido de verdade", () => {
  // Guarda contra o teste passar por ter extraido lista vazia.
  assert.ok(OBRIGATORIOS.length >= 10, `tokens encontrados: ${OBRIGATORIOS.length}`);
  assert.ok(OBRIGATORIOS.includes("--marca-suave"));
  assert.ok(OBRIGATORIOS.includes("--texto"));
});

test("toda vitrine com paleta propria cobre TODOS os tokens do modo escuro", () => {
  for (const [host, m] of Object.entries(MARCAS)) {
    if (Object.keys(m.tokens).length === 0) continue; // marca sem paleta propria segue o padrao
    const faltando = OBRIGATORIOS.filter((t) => !(t in m.tokens));
    assert.deepEqual(
      faltando,
      [],
      `A vitrine "${m.codigo}" (${host}) nao sobrescreve ${faltando.join(", ")}. ` +
        `Sem isso ela herda esse token da AmericaSim quando o aparelho esta em modo escuro.`,
    );
  }
});

test("toda vitrine com paleta propria trava o color-scheme em claro", () => {
  // Sem isto o navegador pinta os controles nativos (select, scrollbar) no
  // escuro por cima de uma paleta clara.
  for (const [host, m] of Object.entries(MARCAS)) {
    if (Object.keys(m.tokens).length === 0) continue;
    assert.equal(m.tokens["color-scheme"], "light", `${m.codigo} (${host})`);
  }
});

// --- contraste: a razao de tudo isto ------------------------------------

function luminancia(hex: string): number {
  const h = hex.trim().replace("#", "");
  const canais = [h.slice(0, 2), h.slice(2, 4), h.slice(4, 6)].map((p) => {
    const n = parseInt(p, 16) / 255;
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * canais[0] + 0.7152 * canais[1] + 0.0722 * canais[2];
}

function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

test("o par que quebrou (--marca sobre --marca-suave) passa em AA em toda vitrine", () => {
  // .ct-item.ativo, .ct-icone e o halo de foco usam exatamente este par.
  for (const [host, m] of Object.entries(MARCAS)) {
    const fundo = m.tokens["--marca-suave"];
    const texto = m.tokens["--marca"];
    if (!fundo || !texto) continue;
    const r = contraste(fundo, texto);
    assert.ok(r >= 4.5, `${m.codigo} (${host}): ${r.toFixed(2)}:1, precisa de 4.5:1`);
  }
});

test("a marca padrao nao declara tokens — ela E o globals", () => {
  assert.deepEqual(MARCA_PADRAO.tokens, {});
  assert.equal(cssDaMarca(MARCA_PADRAO), "");
});

test("cssDaMarca escopa no seletor da marca e nao vaza", () => {
  const css = cssDaMarca(MARCAS["viagemsim.duckdns.org"]);
  assert.ok(css.startsWith('html[data-marca="viagemsim"] {'));
  assert.ok(css.includes("--marca-suave: #e9eff7;"));
  assert.ok(!css.includes(":root"), "um :root aqui sobrescreveria a outra vitrine");
});
