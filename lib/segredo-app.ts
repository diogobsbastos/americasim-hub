import { db } from "./db";
import { cifrarSegredo, decifrarSegredo } from "./cripto-segredo";

// Segredo de aplicacao (Client Secret de marketplace).
//
// Mora na tabela `parametro`, que ja existe para configuracao, guardado
// CIFRADO em base64. Nao criei tabela nem migracao para um campo.
//
// POR QUE PODE FICAR NO BANCO, SE A REGRA DO eSIM E "SEGREDO FORA DO BANCO":
// sao casos diferentes. A chave do eSIM PRECISA ficar fora, senao um dump
// roubado abre o estoque inteiro e a cifra nao protege nada. O Client Secret
// pode ser cifrado COM aquela chave — o dump sozinho continua sem abrir nada,
// e o operador deixa de precisar de SSH para configurar um marketplace.
//
// A variavel de ambiente continua funcionando e tem PRIORIDADE: quem ja pos o
// segredo no .env nao precisa mexer em nada.

const DOMINIO = "segredo-aplicacao";

function chaveDe(nomeEnv: string): string {
  return `segredo.${nomeEnv}`;
}

export async function salvarSegredoApp(
  nomeEnv: string,
  valor: string,
  usuarioId: string,
): Promise<void> {
  // A amarra e o proprio nome da variavel: um valor copiado da linha de um
  // conector para a de outro nao abre.
  const cifrado = cifrarSegredo(valor, DOMINIO, nomeEnv).toString("base64");
  await db.query(
    `insert into parametro (chave, valor, tipo, descricao, atualizado_em, atualizado_por)
     values ($1, $2, 'texto', $3, now(), $4)
     on conflict (chave) do update
       set valor = excluded.valor, atualizado_em = now(), atualizado_por = excluded.atualizado_por`,
    [chaveDe(nomeEnv), cifrado, `Segredo cifrado de ${nomeEnv}`, usuarioId],
  );
}

// Ambiente primeiro, banco depois. So chamar onde o segredo sera REALMENTE
// usado — numa troca de token. Nunca para mostrar em tela.
export async function lerSegredoApp(nomeEnv: string): Promise<string> {
  const doAmbiente = (process.env[nomeEnv] ?? "").trim();
  if (doAmbiente) return doAmbiente;

  const r = await db.query("select valor from parametro where chave = $1", [chaveDe(nomeEnv)]);
  const guardado = (r.rows[0]?.valor ?? "").trim();
  if (!guardado) return "";
  try {
    return decifrarSegredo(Buffer.from(guardado, "base64"), DOMINIO, nomeEnv);
  } catch {
    // Cifrado com outra chave, ou adulterado. Devolver vazio faz a tela dizer
    // "falta a senha", que e verdade util — em vez de estourar 500 no meio do
    // vaivem do OAuth, onde ninguem entende o que aconteceu.
    console.error(`segredo ${nomeEnv}: gravado mas ilegivel com a chave atual`);
    return "";
  }
}

// O que a TELA pode saber: se existe e de onde veio. Nunca o valor.
export async function ondeEstaOSegredo(
  nomeEnv: string,
): Promise<"ambiente" | "banco" | "ilegivel" | "nenhum"> {
  if ((process.env[nomeEnv] ?? "").trim()) return "ambiente";
  const r = await db.query("select valor from parametro where chave = $1", [chaveDe(nomeEnv)]);
  const guardado = (r.rows[0]?.valor ?? "").trim();
  if (!guardado) return "nenhum";
  try {
    decifrarSegredo(Buffer.from(guardado, "base64"), DOMINIO, nomeEnv);
    return "banco";
  } catch {
    return "ilegivel";
  }
}

export async function apagarSegredoApp(nomeEnv: string): Promise<void> {
  await db.query("delete from parametro where chave = $1", [chaveDe(nomeEnv)]);
}
