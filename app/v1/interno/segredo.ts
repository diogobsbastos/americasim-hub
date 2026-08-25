import { timingSafeEqual } from "node:crypto";
import { db } from "../../../lib/db";

// Quem pode chamar as rotas /v1/interno/*.
//
// A primeira versao disto tentava provar a origem pela AUSENCIA de cabecalho:
// "se nao tem x-forwarded-for, nao passou pelo Nginx". Errado, e o teste pegou
// na hora — o proprio Next poe x-forwarded-for quando ele nao vem, entao a rota
// recusava ate o worker chamando de 127.0.0.1.
//
// Licao: ausencia nao prova nada. Prova e coisa positiva — quem chama apresenta
// algo que so ele poderia ter.
//
// O segredo mora em `parametro`, nao no codigo nem em variavel de ambiente:
// worker e app ja falam com o banco, e assim nao ha um terceiro lugar para
// manter em dia. Ele autoriza apenas uma rota que escuta em 127.0.0.1.

export const CHAVE_SEGREDO = "interno.segredo";
export const CABECALHO = "x-interno";

// Formato unico, de proposito. A primeira versao era uniao discriminada
// ({ok:true} | {ok:false,status,motivo}) e o build parou em TS2339: quem chama
// so alcanca `motivo` depois de estreitar o tipo. Para um porteiro com um
// chamador so, contrato simples vale mais que elegancia de tipos.
export type Veredito = {
  ok: boolean;
  status: number; // 200 quando aprova; o codigo a devolver quando recusa
  motivo: string; // vazio quando aprova
};

const APROVADO: Veredito = { ok: true, status: 200, motivo: "" };

export async function conferirSegredo(req: Request): Promise<Veredito> {
  const r = await db.query("select valor from parametro where chave = $1", [CHAVE_SEGREDO]);
  const esperado = String(r.rows[0]?.valor ?? "");

  // Sem parametro cadastrado a rota nao vira "aberta" nem some: ela diz que
  // esta mal configurada. 503 e 404 contam historias diferentes para quem
  // depura, e trocar uma pela outra custa horas.
  if (!esperado) {
    return { ok: false, status: 503, motivo: "parametro interno.segredo nao cadastrado" };
  }

  const veio = String(req.headers.get(CABECALHO) ?? "");
  if (!veio) return { ok: false, status: 404, motivo: "sem credencial" };

  // Comparacao em tempo constante: `===` em string vaza, pelo tempo, quantos
  // caracteres iniciais bateram. Conferir o tamanho antes evita o throw do
  // timingSafeEqual com buffers de tamanhos diferentes.
  const a = Buffer.from(veio);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, status: 404, motivo: "credencial invalida" };
  }
  return APROVADO;
}
