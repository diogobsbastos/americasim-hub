"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { criarProduto } from "./acoes";
import { ESTADO_NOVO_INICIAL, MODOS, type FamiliaOpcao } from "./tipos";

export default function FormNovo({ familias }: { familias: FamiliaOpcao[] }) {
  const [estado, acao, enviando] = useActionState(criarProduto, ESTADO_NOVO_INICIAL);
  const [modo, setModo] = useState("estoque");
  const [familia, setFamilia] = useState(familias[0]?.handle ?? "");

  const sobMedida = modo === "operadora_sob_medida";
  const deOperadora = modo !== "estoque";
  const ajuda = MODOS.find((m) => m.v === modo)?.ajuda ?? "";

  return (
    <form action={acao} style={{ display: "grid", gap: 18, maxWidth: 640 }}>
      {estado.erro ? (
        <div className="cartao perigo">
          <p style={{ margin: 0, color: "var(--erro)" }}>{estado.erro}</p>
        </div>
      ) : null}

      <div className="cartao">
        <label htmlFor="modo-0" className="rot">Como este produto e entregue</label>
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {MODOS.map((m, i) => (
            <label key={m.v} htmlFor={`modo-${i}`} style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: "pointer" }}>
              <input
                id={`modo-${i}`}
                type="radio"
                name="modo"
                value={m.v}
                checked={modo === m.v}
                onChange={() => setModo(m.v)}
                style={{ width: "auto", marginTop: 4 }}
              />
              <span>
                <b>{m.r}</b>
                <br />
                <span style={{ color: "var(--texto-fraco)", fontSize: "0.84rem" }}>{m.ajuda}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="cartao" style={{ display: "grid", gap: 14 }}>
        <div>
          <label htmlFor="familia">Familia</label>
          <select id="familia" name="familia" value={familia} onChange={(e) => setFamilia(e.target.value)}>
            {familias.map((f) => (
              <option key={f.handle} value={f.handle}>{f.nome}</option>
            ))}
            <option value="">+ criar uma familia nova</option>
          </select>
          <p className="nota" style={{ marginTop: 6 }}>
            Familia so agrupa na lista. Quem tem preco, estoque e anuncio e o SKU abaixo.
          </p>
        </div>

        {familia === "" ? (
          <div>
            <label htmlFor="familia_nome">Nome da familia nova</label>
            <input id="familia_nome" name="familia_nome" placeholder="eSIM Asia" />
          </div>
        ) : null}

        <div>
          <label htmlFor="sku">SKU</label>
          <input id="sku" name="sku" placeholder="ESIM-AS-10GB-30D" style={{ textTransform: "uppercase" }} />
          <p className="nota" style={{ marginTop: 6 }}>
            E por ele que o Mercado Livre casa o anuncio com o nosso produto. Precisa ser o
            mesmo dos dois lados, e nao pode repetir. O numero do anuncio (MLB) nao entra
            aqui: ele fica guardado ao lado, na aba Canais.
          </p>
        </div>
      </div>

      <div className="cartao" style={{ display: "grid", gap: 14 }}>
        <div className="rot">O que o pacote oferece</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 120px" }}>
            <label htmlFor="gb">Dados (GB)</label>
            <input id="gb" name="gb" inputMode="numeric" placeholder="10" />
          </div>
          <div style={{ flex: "1 1 120px" }}>
            <label htmlFor="dias">Validade (dias)</label>
            <input id="dias" name="dias" inputMode="numeric" placeholder="30" />
          </div>
        </div>
        <div>
          <label htmlFor="cobertura">Cobertura</label>
          <input id="cobertura" name="cobertura" placeholder="FR, ES, IT, PT, DE" />
          <p className="nota" style={{ marginTop: 6 }}>Siglas de dois digitos, separadas por virgula.</p>
        </div>
        {sobMedida ? (
          <p className="nota">
            No modo sob medida estes valores sao apenas o ponto de partida — os limites do
            que o cliente pode escolher ainda nao tem tela, e serao configurados depois.
          </p>
        ) : null}
      </div>

      <div className="cartao" style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "2 1 160px" }}>
            <label htmlFor="custo">Custo por unidade</label>
            <input id="custo" name="custo" placeholder="5,10" />
          </div>
          <div style={{ flex: "1 1 100px" }}>
            <label htmlFor="moeda">Moeda</label>
            <select id="moeda" name="moeda" defaultValue="USD">
              <option value="USD">USD</option>
              <option value="BRL">BRL</option>
              <option value="EUR">EUR</option>
            </select>
          </div>
        </div>
        <p className="nota">
          Pode ficar em branco: no modo de estoque o custo real vem do lote, na importacao.
          Custo so pode ser preenchido por administrador.
        </p>

        <label htmlFor="publicavel" style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: sobMedida ? "not-allowed" : "pointer" }}>
          <input
            id="publicavel"
            type="checkbox"
            name="publicavel"
            defaultChecked
            disabled={sobMedida}
            style={{ width: "auto", marginTop: 4 }}
          />
          <span>
            <b>Pode virar anuncio em marketplace</b>
            <br />
            <span style={{ color: sobMedida ? "var(--alerta)" : "var(--texto-fraco)", fontSize: "0.84rem" }}>
              {sobMedida
                ? "Desligado e travado: produto sob medida nao vai para marketplace. O banco tambem recusa, nao e so a tela."
                : "Deixe marcado se este item um dia sera publicado no Mercado Livre."}
            </span>
          </span>
        </label>

        {deOperadora ? (
          <p className="nota">
            Este item nao tem prateleira: nada sera reservado em estoque. A ligacao com a
            operadora (qual plano chamar) ainda nao tem tela e sera feita depois.
          </p>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button type="submit" disabled={enviando}>
          {enviando ? "Criando..." : "Criar produto"}
        </button>
        <Link href="/painel/produtos" className="botao secundario">Cancelar</Link>
        <span className="nota">{ajuda}</span>
      </div>
    </form>
  );
}
