"use client";

import { useEffect, useState } from "react";
import FormAtivacao from "./FormAtivacao";

// O retrato de UM eSIM do pedido: linha do tempo da esteira, validade com
// contagem regressiva e — quando pronto — o formulario que revela QR e botoes
// de instalacao. O codigo LPA NUNCA chega junto com esta tela: continua atras
// da confirmacao de e-mail (POST /v1/ativacoes/{id}).
export interface AtivacaoTela {
  id: string;
  status: string;
  produto: string | null;
  iccid_final: string | null;
  validade: string | null;
  entregue_em: string | null;
  instalado_em: string | null;
}

const ETAPAS = ["Pagamento", "Preparando o eSIM", "Pronto para instalar", "Instalado no aparelho"];

function etapaAtual(status: string): number {
  if (status === "instalado") return 3;
  if (status === "entregue") return 2;
  return 1; // pendente / provisionando — pagamento ja aconteceu para existir ativacao
}

// Contagem regressiva ate o fim do dia da validade. Renderiza vazio no servidor
// e so anima no cliente, para nao dar erro de hidratacao.
function Contagem({ validade }: { validade: string }) {
  const [texto, setTexto] = useState("");

  useEffect(() => {
    const fim = new Date(`${validade.slice(0, 10)}T23:59:59`);
    const tique = () => {
      const ms = fim.getTime() - Date.now();
      if (ms <= 0) { setTexto("expirado"); return; }
      const d = Math.floor(ms / 86_400_000);
      const h = Math.floor((ms % 86_400_000) / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      const dois = (n: number) => String(n).padStart(2, "0");
      setTexto(d > 0 ? `${d}d ${dois(h)}:${dois(m)}:${dois(s)}` : `${dois(h)}:${dois(m)}:${dois(s)}`);
    };
    tique();
    const id = setInterval(tique, 1000);
    return () => clearInterval(id);
  }, [validade]);

  if (!texto) return null;
  return (
    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, color: texto === "expirado" ? "var(--erro)" : "var(--marca)" }}>
      {texto}
    </span>
  );
}

export default function CartaoEsim({ a }: { a: AtivacaoTela }) {
  const atual = etapaAtual(a.status);
  const falhou = a.status === "falhou";
  const validade = a.validade ? new Date(`${a.validade.slice(0, 10)}T12:00:00`) : null;

  return (
    <div style={{ border: "1px solid var(--borda)", borderRadius: 12, padding: "16px 18px", marginTop: 14 }}>
      {(a.produto || a.iccid_final) ? (
        <div className="linha">
          <span>{a.produto ?? "eSIM"}</span>
          {a.iccid_final ? <code>chip …{a.iccid_final}</code> : null}
        </div>
      ) : null}

      {/* Linha do tempo da esteira */}
      <ol style={{ listStyle: "none", margin: "12px 0 0", padding: 0 }}>
        {ETAPAS.map((nome, i) => {
          const feito = i < atual || (i === 3 && a.status === "instalado");
          const agora = i === atual && a.status !== "instalado";
          return (
            <li key={nome} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}>
              <span
                aria-hidden="true"
                style={{
                  width: 12, height: 12, borderRadius: "50%", flex: "0 0 auto",
                  background: feito ? "var(--ok)" : agora ? "var(--marca)" : "var(--borda)",
                  outline: agora ? "3px solid color-mix(in srgb, var(--marca) 25%, transparent)" : "none",
                }}
              />
              <span style={{ fontSize: "0.9rem", color: feito || agora ? "var(--texto)" : "var(--texto-fraco)", fontWeight: agora ? 700 : 400 }}>
                {nome}
                {i === 3 && a.instalado_em ? ` — ${new Date(a.instalado_em).toLocaleString("pt-BR")}` : ""}
              </span>
            </li>
          );
        })}
      </ol>

      {falhou ? (
        <p className="nota" style={{ color: "var(--erro)" }}>
          Encontramos um problema ao preparar este eSIM. O atendimento ja foi acionado
          automaticamente e vai resolver — voce nao precisa fazer nada.
        </p>
      ) : null}

      {/* Validade / timer */}
      <div className="linha" style={{ marginTop: 10 }}>
        <span>Validade</span>
        {validade ? (
          <span>
            ate {validade.toLocaleDateString("pt-BR")} · <Contagem validade={a.validade!} />
          </span>
        ) : (
          <span style={{ color: "var(--texto-fraco)" }}>
            {a.status === "instalado"
              ? "plano em uso"
              : "o prazo so comeca a contar na primeira conexao"}
          </span>
        )}
      </div>

      {/* QR e instalacao — so quando o eSIM esta pronto */}
      {a.status === "entregue" || a.status === "instalado" ? (
        <FormAtivacao ativacaoId={a.id} />
      ) : null}
    </div>
  );
}
