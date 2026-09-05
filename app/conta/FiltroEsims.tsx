"use client";

import Link from "next/link";
import { useState } from "react";
import { IcoQr } from "../Icones";

// Filtros por SITUACAO do eSIM, no proprio navegador (sao no maximo 50 pedidos
// por conta — filtrar no cliente evita ida ao servidor a cada clique).
//
// "Expirado" e "em uso" DE VERDADE dependem da integracao de consumo com a
// operadora (pendente das chaves master CMLink): quando ela chegar, entra como
// mais um filtro aqui — a estrutura ja esta pronta para receber.

export interface PedidoLista {
  numero: string;
  status: string;
  entregue: boolean;
  criado_em: string;
  esims: number;
  instalados: number;
  produto: string | null;
  gb: number | string | null;
  dias: number | string | null;
  t: string;
}

type Filtro = "todos" | "prontos" | "instalados" | "preparo" | "cancelados";

const FILTROS: { id: Filtro; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "prontos", rotulo: "Prontos para instalar" },
  { id: "instalados", rotulo: "Instalados" },
  { id: "preparo", rotulo: "Em preparação" },
  { id: "cancelados", rotulo: "Cancelados" },
];

function casa(p: PedidoLista, f: Filtro): boolean {
  switch (f) {
    case "todos": return true;
    // Comprado e entregue, mas ainda nao instalado no aparelho: e o eSIM da
    // PROXIMA viagem, esperando o embarque.
    case "prontos": return p.entregue && p.instalados < p.esims;
    case "instalados": return p.instalados > 0;
    case "preparo": return !p.entregue && p.status !== "cancelado";
    case "cancelados": return p.status === "cancelado";
  }
}

function chipDoStatus(p: PedidoLista): { classe: string; texto: string } {
  if (p.entregue) return { classe: "ct-chip ok", texto: "entregue" };
  if (p.status === "cancelado") return { classe: "ct-chip off", texto: "cancelado" };
  if (p.status === "aguardando_pagamento") return { classe: "ct-chip espera", texto: "aguardando pagamento" };
  if (p.status === "pago") return { classe: "ct-chip espera", texto: "preparando seu eSIM" };
  return { classe: "ct-chip off", texto: p.status };
}

function titulo(p: PedidoLista): string {
  if (p.gb) return `${p.gb} GB${p.dias ? ` · ${p.dias} dias` : ""}`;
  return `Pedido ${p.numero}`;
}

export default function FiltroEsims({ pedidos }: { pedidos: PedidoLista[] }) {
  const [ativo, setAtivo] = useState<Filtro>("todos");
  const visiveis = pedidos.filter((p) => casa(p, ativo));

  return (
    <>
      <div className="ct-filtros" role="tablist" aria-label="filtrar eSIMs">
        {FILTROS.map((f) => {
          const n = pedidos.filter((p) => casa(p, f.id)).length;
          if (f.id !== "todos" && n === 0) return null;
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={ativo === f.id}
              className={ativo === f.id ? "ct-filtro ativo" : "ct-filtro"}
              onClick={() => setAtivo(f.id)}
            >
              {f.rotulo} <b>{n}</b>
            </button>
          );
        })}
      </div>

      {visiveis.length === 0 ? (
        <p className="nota">Nenhum eSIM nesta situação.</p>
      ) : (
        <div className="ct-grade">
          {visiveis.map((p) => {
            const chip = chipDoStatus(p);
            const url = `/pedido?pedido=${encodeURIComponent(p.numero)}&t=${encodeURIComponent(p.t)}`;
            return (
              <article key={p.numero} className="ct-cartao">
                <div className="ct-cartao-topo">
                  <span className="ct-ico" aria-hidden="true"><IcoQr /></span>
                  <div className="ct-cartao-titulo">
                    <b>{titulo(p)}</b>
                    {p.produto ? <p>{p.produto}</p> : null}
                  </div>
                  <span className={chip.classe}>{chip.texto}</span>
                </div>
                <p className="ct-meta">
                  <code>{p.numero}</code> · {new Date(p.criado_em).toLocaleDateString("pt-BR")}
                  {p.esims > 0 ? ` · ${p.esims} eSIM${p.esims === 1 ? "" : "s"}` : ""}
                  {p.instalados > 0 ? ` · ${p.instalados} instalado${p.instalados === 1 ? "" : "s"}` : ""}
                </p>
                <div className="ct-acoes">
                  {p.entregue ? (
                    <Link className="botao" href={url}>Ver eSIM e QR →</Link>
                  ) : p.status === "cancelado" ? (
                    <Link className="botao secundario" href={url}>Detalhes</Link>
                  ) : (
                    <Link className="botao secundario" href={url}>Acompanhar pedido →</Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
