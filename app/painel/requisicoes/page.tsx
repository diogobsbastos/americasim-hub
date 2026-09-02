import { db } from "../../../lib/db";
import { estadoCaixa } from "../../../lib/caixa-imap";
import { usuarioDaSessao } from "../../../lib/painel/sessao";
import { quando } from "../../../lib/quando";
import CartaoRequisicoes, { type FornecedorOpcao, type LoteTela, type RequisicaoTela, type VarianteOpcao } from "./CartaoRequisicoes";

export const dynamic = "force-dynamic";

export const metadata = { title: "Requisições — AmericaSim", robots: { index: false, follow: false } };

// O fluxo de ICCIDs com a EasySim4u (reuniao de 01/09): requisitar por e-mail
// (+aviso no Zap), receber o CSV (o Gmail avisa o robo — IMAP IDLE), aprovar na
// tela, estoque carregado, confirmacao automatica por e-mail + Zap.
// O Zap em si (conexao/config) vive em Configuracoes → Zap desde 02/09.
export default async function Requisicoes() {
  const u = await usuarioDaSessao();
  const podeAdmin = u?.papel === "admin";
  const podeOperar = u?.papel === "admin" || u?.papel === "operacao";

  const [pDestino, pRemetentes] = await Promise.all([
    db.query("select valor from parametro where chave = 'requisicao.destino'"),
    db.query("select valor from parametro where chave = 'caixa.remetentes'"),
  ]);
  const destino = String(pDestino.rows[0]?.valor ?? "").trim() || "admin@easysim4u.com";
  const remetentes = Array.from(new Set(
    (String(pRemetentes.rows[0]?.valor ?? "").trim() || "admin@easysim4u.com")
      .split(",").map((x) => x.trim().toLowerCase()).filter(Boolean),
  ));

  const lotesBrutos = await db.query(
    `select id, remetente, assunto, arquivo_nome, recebido_em, linhas, iccids, previa, status, resultado
       from email_lote
      order by (status = 'pendente') desc, criado_em desc
      limit 20`,
  );
  const lotes: LoteTela[] = lotesBrutos.rows.map((l: any) => {
    const previa = l.previa ?? {};
    const amostra = Array.isArray(previa.amostra) ? previa.amostra.map((a: any) => String(a?.iccid ?? "")) : [];
    const resultado = l.resultado
      ? `${l.resultado.inseridos ?? 0} carregados, ${l.resultado.repetidos ?? 0} repetidos`
      : "";
    return {
      id: l.id,
      remetente: String(l.remetente ?? ""),
      assunto: String(l.assunto ?? ""),
      arquivo: String(l.arquivo_nome ?? "CSV"),
      recebidoEm: l.recebido_em ? quando(l.recebido_em) : "",
      linhas: Number(l.linhas ?? 0),
      iccids: Number(l.iccids ?? 0),
      comLpa: Number(previa.com_lpa ?? 0),
      amostra,
      status: String(l.status),
      resultado,
    };
  });

  const reqs = await db.query(
    `select para, quantidade, criado_em from requisicao_iccid order by criado_em desc limit 8`,
  );
  const requisicoes: RequisicaoTela[] = reqs.rows.map((r: any) => ({
    para: String(r.para),
    quantidade: r.quantidade === null ? null : Number(r.quantidade),
    criadoEm: quando(r.criado_em),
  }));

  const vars = await db.query(
    `select v.id, v.sku, v.modo_entrega::text as modo from variante v where v.ativo order by v.sku limit 200`,
  );
  const variantes: VarianteOpcao[] = vars.rows.map((v: any) => ({ id: v.id, sku: v.sku, modo: v.modo }));

  // Fornecedores para o seletor da requisicao (multi-fornecedor, 02/09).
  const forn = await db.query(
    `select id, nome, coalesce(contato->>'email', '') as email from fornecedor where ativo order by nome`,
  );
  const fornecedores: FornecedorOpcao[] = forn.rows.map((f: any) => ({ id: f.id, nome: f.nome, email: f.email }));
  const fornecedorPadrao = fornecedores.find((f) => f.nome.toLowerCase() === "easysim4u")?.id ?? "";

  const caixa = estadoCaixa();

  return (
    <>
      <div className="pn-cabeca">
        <h1>Requisições de ICCIDs</h1>
        <p>
          O ciclo com a EasySim4u: requisição por e-mail + Zap → CSV de volta → aprovação → estoque →
          confirmação automática por e-mail + Zap. O robô só dorme; quem o acorda é o Gmail.
        </p>
      </div>

      <CartaoRequisicoes
        destino={destino}
        remetentes={remetentes}
        caixaLigada={caixa.ligada}
        caixaErro={caixa.ultimoErro ?? ""}
        lotes={lotes}
        requisicoes={requisicoes}
        variantes={variantes}
        fornecedores={fornecedores}
        fornecedorPadrao={fornecedorPadrao}
        podeAdmin={!!podeAdmin}
        podeOperar={!!podeOperar}
      />
    </>
  );
}
