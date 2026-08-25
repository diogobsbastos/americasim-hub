"use client";

import { useActionState } from "react";
import { prepararMl, publicarNoMl } from "./acoes";
import { ESTADO_PUBLICAR_INICIAL, TIPOS_ANUNCIO, type LinhaPublicar } from "./tipos";

const rotulo: React.CSSProperties = {
  display: "block",
  fontSize: "0.72rem",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--texto-fraco)",
  marginBottom: 4,
};

function Obrigatorio() {
  return (
    <span style={{ color: "var(--alerta)", fontWeight: 700 }} title="O Mercado Livre exige este campo">
      {" "}*
    </span>
  );
}

// Passo 1: escolher a categoria. Sem ela nao da para saber o que perguntar —
// cada categoria do ML tem sua propria lista de exigencias.
export function FormCategoria({ handle, linha }: { handle: string; linha: LinhaPublicar }) {
  const [estado, acao, pendente] = useActionState(prepararMl, ESTADO_PUBLICAR_INICIAL);
  return (
    <form action={acao} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
      <input type="hidden" name="handle" value={handle} />
      <input type="hidden" name="variante_id" value={linha.varianteId} />
      <label style={{ flex: "1 1 200px" }}>
        <span style={rotulo}>Categoria no Mercado Livre</span>
        <input name="categoria" defaultValue={linha.categoria || "MLB270052"} placeholder="MLB270052" style={{ width: "100%" }} />
      </label>
      <button type="submit" disabled={pendente}>{pendente ? "Buscando…" : "Buscar exigências"}</button>
      {estado.erro ? <span style={{ color: "var(--erro)" }}>{estado.erro}</span> : null}
      {estado.ok ? <span style={{ color: "var(--ok)" }}>{estado.ok}</span> : null}
    </form>
  );
}

// Passo 2: o anuncio em si, ja sabendo o que aquela categoria cobra.
export function FormAnuncio({ handle, linha }: { handle: string; linha: LinhaPublicar }) {
  const [estado, acao, pendente] = useActionState(publicarNoMl, ESTADO_PUBLICAR_INICIAL);

  return (
    <form action={acao}>
      <input type="hidden" name="handle" value={handle} />
      <input type="hidden" name="variante_id" value={linha.varianteId} />
      <input type="hidden" name="categoria" value={linha.categoria} />

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", marginBottom: 14 }}>
        <label style={{ gridColumn: "1 / -1" }}>
          <span style={rotulo}>Título do anúncio<Obrigatorio /> <span style={{ textTransform: "none" }}>(máx. 60)</span></span>
          <input name="titulo" defaultValue={linha.titulo} maxLength={60} required style={{ width: "100%" }} />
        </label>
        <label>
          <span style={rotulo}>Preço<Obrigatorio /></span>
          <input name="preco" defaultValue={linha.preco} inputMode="decimal" required style={{ width: "100%", textAlign: "right", fontFamily: "var(--fonte-mono)" }} />
        </label>
        <label>
          <span style={rotulo}>Tipo de anúncio</span>
          <select name="tipo_anuncio" defaultValue="gold_special" style={{ width: "100%" }}>
            {TIPOS_ANUNCIO.map((t) => (<option key={t.id} value={t.id}>{t.nome}</option>))}
          </select>
        </label>
        <label>
          <span style={rotulo}>Copiar fotos de</span>
          <input name="base_mlb" placeholder="MLB123456789" style={{ width: "100%" }} />
          <span style={{ fontSize: "0.74rem", color: "var(--texto-fraco)" }}>
            anúncio existente de onde puxar as imagens
          </span>
        </label>
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {linha.campos.map((c) => (
          <label key={c.id}>
            <span style={rotulo}>
              {c.nome}{c.obrigatorio ? <Obrigatorio /> : null}
            </span>
            {c.valores.length > 0 ? (
              // Lista fechada vira seletor: digitar "T-mobile" onde o ML espera
              // "T-Mobile" e recusa na cara, sem dizer o motivo.
              <select name={`attr__${c.id}`} defaultValue={c.valorAtual} required={c.obrigatorio} style={{ width: "100%" }}>
                <option value="">— escolha —</option>
                {c.valores.map((v) => (<option key={v.id || v.nome} value={v.nome}>{v.nome}</option>))}
              </select>
            ) : (
              <input name={`attr__${c.id}`} defaultValue={c.valorAtual} required={c.obrigatorio} style={{ width: "100%" }} />
            )}
            {c.dica ? (
              <span style={{ fontSize: "0.72rem", color: "var(--texto-fraco)" }}>{c.dica}</span>
            ) : null}
          </label>
        ))}
      </div>

      {linha.bloqueados.length > 0 ? (
        <div style={{ marginTop: 16, borderLeft: "3px solid var(--borda)", paddingLeft: 12 }}>
          <div style={{ ...rotulo, marginBottom: 6 }}>Não serão enviados — criariam variação</div>
          <div style={{ color: "var(--texto-fraco)", fontSize: "0.84rem" }}>
            {linha.bloqueados.map((b) => b.nome).join(" · ")}
          </div>
          <div style={{ color: "var(--texto-fraco)", fontSize: "0.76rem", marginTop: 6 }}>
            Preenchidos, o Mercado Livre criaria uma grade e moveria o estoque para dentro dela —
            e o hub perderia o controle da quantidade. Aqui cada SKU é um anúncio.
          </div>
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 18, flexWrap: "wrap" }}>
        <button type="submit" name="acao" value="ensaio" className="secundario" disabled={pendente}>
          Ver o que será enviado
        </button>
        <button type="submit" name="acao" value="publicar" disabled={pendente}>
          {pendente ? "Publicando…" : "Publicar no Mercado Livre"}
        </button>
        {estado.erro ? <span style={{ color: "var(--erro)" }}>{estado.erro}</span> : null}
        {estado.ok ? <span style={{ color: "var(--ok)" }}>{estado.ok}</span> : null}
      </div>

      {estado.previa ? (
        estado.previa.startsWith("http") ? (
          <p style={{ marginTop: 12 }}>
            <a href={estado.previa} target="_blank" rel="noreferrer">abrir o anúncio no Mercado Livre →</a>
          </p>
        ) : (
          <pre style={{
            marginTop: 12, background: "var(--superficie-2)", border: "1px solid var(--borda)",
            borderRadius: 10, padding: 12, fontSize: "0.78rem", overflowX: "auto", maxHeight: 340,
          }}>{estado.previa}</pre>
        )
      ) : null}
    </form>
  );
}
