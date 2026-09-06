import { db } from "./db";

// Enfileira o e-mail de confirmacao de conta na mesma fila `notificacao` que o
// e-mail de entrega usa — mesmo remetente, mesmo worker, mesma retentativa com
// recuo exponencial. Nada novo de infraestrutura.
//
// REFERENCIA com o minuto: a chave unica da tabela e (destino, canal,
// referencia), o que impede duplicata. Fixar `verificar:<conta>` bloquearia o
// REENVIO para sempre; incluir o minuto deixa reenviar, mas nunca duas vezes no
// mesmo minuto. O abuso de verdade e barrado pelo freio da rota que chama aqui.
//
// O TOKEN NAO E GUARDADO: o payload leva so o id da conta e o dominio. Quem
// assina e o despachante, no instante do envio. Assim um dump da tabela
// `notificacao` nao entrega tokens validos.
export async function enfileirarVerificacao(contaId: string, canalId: string): Promise<boolean> {
  const r = await db.query(
    `select cc.email::text as email, cn.dominio::text as dominio
       from conta_cliente cc
       left join canal cn on cn.id = $2
      where cc.id = $1 and cc.verificado = false`,
    [contaId, canalId],
  );
  if (r.rows.length === 0) return false; // conta inexistente ou ja verificada

  const email = String(r.rows[0].email ?? "");
  if (!email) return false;

  // Mesma guarda do e-mail de entrega: 'localhost' e resquicio de configuracao
  // de teste e viraria um link morto na caixa do cliente.
  const dominio = String(r.rows[0].dominio ?? "");
  const base = dominio && dominio !== "localhost" ? `https://${dominio}` : "https://americasim.com.br";

  const minuto = Math.floor(Date.now() / 60000);
  await db.query(
    `insert into notificacao (destino, canal, referencia, modelo, payload)
          values ($1, 'email', $2, 'verificar_email', $3::jsonb)
     on conflict (destino, canal, referencia) do nothing`,
    [email, `verificar:${contaId}:${minuto}`, JSON.stringify({ conta_id: contaId, base })],
  );
  return true;
}
