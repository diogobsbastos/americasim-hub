import { readFile } from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { markdownParaHtml } from "../../../../../lib/markdown-simples";

export const dynamic = "force-dynamic";

export const metadata = { title: "CMLink — documentação da API — AmericaSim", robots: { index: false, follow: false } };

// A SPEC da API da China Mobile, lida do proprio repositorio (docs/), para
// consulta de dentro do painel. Fonte-da-verdade e o arquivo — esta tela so
// renderiza. Se o build servir de outra pasta, cai na copia de libs-base.
const CANDIDATOS = [
  path.join(process.cwd(), "docs", "SPEC_CMLINK_API.md"),
  "/home/ubuntu/americasim-hub/docs/SPEC_CMLINK_API.md",
  "/home/ubuntu/libs-base/SPEC_CMLINK_API.md",
];

async function lerSpec(): Promise<{ texto: string; origem: string }> {
  for (const c of CANDIDATOS) {
    try {
      const texto = await readFile(c, "utf8");
      if (texto.trim()) return { texto, origem: c };
    } catch {
      // proximo candidato
    }
  }
  return { texto: "", origem: "" };
}

export default async function DocCmlink() {
  const { texto, origem } = await lerSpec();
  const html = texto ? markdownParaHtml(texto) : "";

  return (
    <>
      <div className="pn-cabeca">
        <p style={{ marginBottom: 6 }}>
          <Link href="/painel/operadoras">← Operadoras</Link>
        </p>
        <h1>China Mobile (CMLink) — documentação da API</h1>
        <p>
          Transcrição estruturada da spec V4.2 da operadora, sem credencial nenhuma.
          {origem ? <> Arquivo: <code>{origem}</code></> : null}
        </p>
      </div>

      <style>{`
        .md { max-width: 980px; font-size: 0.92rem; line-height: 1.55; }
        .md h1 { font-size: 1.5rem; margin: 28px 0 10px; }
        .md h2 { font-size: 1.2rem; margin: 30px 0 10px; padding-top: 10px; border-top: 1px solid var(--borda); }
        .md h3 { font-size: 1.02rem; margin: 22px 0 8px; }
        .md p { margin: 8px 0; }
        .md ul, .md ol { margin: 8px 0 8px 22px; }
        .md li { margin: 3px 0; }
        .md blockquote { border-left: 3px solid var(--marca); margin: 10px 0; padding: 4px 14px; color: var(--texto-fraco); background: var(--superficie-2); border-radius: 6px; }
        .md pre { background: var(--superficie-2); border: 1px solid var(--borda); border-radius: 10px; padding: 12px 14px; overflow-x: auto; font-size: 0.8rem; }
        .md code { font-family: var(--fonte-mono); font-size: 0.85em; }
        .md .md-tabela { overflow-x: auto; margin: 10px 0; }
        .md table { border-collapse: collapse; width: 100%; font-size: 0.84rem; }
        .md th, .md td { border: 1px solid var(--borda); padding: 5px 8px; text-align: left; vertical-align: top; }
        .md th { background: var(--superficie-2); }
        .md hr { border: 0; border-top: 1px solid var(--borda); margin: 18px 0; }
        .md a { color: var(--marca); }
      `}</style>

      {html ? (
        <div className="cartao md" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div className="cartao perigo">
          <div className="rot">Documento não encontrado</div>
          <div className="pe">
            Procurei em {CANDIDATOS.join(", ")}. O arquivo <code>docs/SPEC_CMLINK_API.md</code> precisa estar no
            repositório (ou a cópia em <code>libs-base</code>).
          </div>
        </div>
      )}
    </>
  );
}
