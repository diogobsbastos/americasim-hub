"use client";

import { useState } from "react";

// O formulario "encontre seu plano" POR CIMA da cena de viagem (referencia
// estrutural: busca do hero da Holafly — destino + dias + botao). Beta: com o
// catalogo atual ele CASA o plano no proprio navegador e rola ate o cartao
// certo, acendendo-o. Quando houver muitos destinos, o mesmo formulario passa
// a filtrar a grade.

export interface OpcaoPlano {
  sku: string;
  produto: string;
  dias: number;
  disponivel: boolean;
}

export default function HeroBusca({ opcoes }: { opcoes: OpcaoPlano[] }) {
  const produtos = Array.from(new Set(opcoes.map((o) => o.produto)));
  const diasDisponiveis = Array.from(new Set(opcoes.map((o) => o.dias))).sort((a, b) => a - b);

  const [destino, setDestino] = useState(produtos[0] ?? "");
  const [dias, setDias] = useState(String(diasDisponiveis[0] ?? ""));
  const [aviso, setAviso] = useState("");

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    setAviso("");
    const d = Number(dias);
    const doDestino = opcoes
      .filter((o) => o.produto === destino && o.disponivel)
      .sort((a, b) => a.dias - b.dias);
    if (doDestino.length === 0) {
      setAviso("Este destino está sem estoque agora — veja os planos disponíveis abaixo.");
      document.getElementById("planos")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    // O plano certo: o MENOR que cobre os dias da viagem; se nenhum cobre,
    // o maior que existe (melhor um plano de 30 dias para uma viagem de 40
    // do que nada).
    const alvo = doDestino.find((o) => o.dias >= d) ?? doDestino[doDestino.length - 1];
    const el = document.getElementById(`plano-${alvo.sku}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("brilho");
    // reflow para reiniciar a animacao quando buscar duas vezes seguidas
    void (el as HTMLElement).offsetWidth;
    el.classList.add("brilho");
    window.setTimeout(() => el.classList.remove("brilho"), 3200);
  }

  return (
    <form className="busca-cartao" onSubmit={buscar} aria-label="encontre seu plano">
      <h3>Encontre seu plano ideal</h3>
      <div>
        <label className="rotulo" htmlFor="busca-destino">Para onde você vai?</label>
        <select
          id="busca-destino"
          value={destino}
          onChange={(e) => setDestino(e.target.value)}
        >
          {produtos.map((p) => (
            <option key={p} value={p}>{p.replace(/^eSIM\s+/i, "")}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="rotulo" htmlFor="busca-dias">Quantos dias de viagem?</label>
        <select id="busca-dias" value={dias} onChange={(e) => setDias(e.target.value)}>
          <option value="5">até 5 dias</option>
          <option value="10">até 10 dias</option>
          <option value="15">até 15 dias</option>
          <option value="20">até 20 dias</option>
          <option value="30">até 30 dias</option>
          <option value="45">mais de 30 dias</option>
        </select>
      </div>
      <button type="submit">Buscar plano →</button>
      {aviso ? <p className="erro">{aviso}</p> : null}
      <p className="fin-dica" style={{ textAlign: "center" }}>
        QR por e-mail na hora · a validade só conta quando você ativa no destino
      </p>
    </form>
  );
}
