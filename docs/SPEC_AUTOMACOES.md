# SPEC — Automações (tudo que dispara sozinho)

**Versão 1 · 01/09/2026.** Princípio único: **por demanda, nunca vigia.**
Aconteceu → o sistema é avisado → age → volta a dormir. Nenhum processo varre o dia
inteiro procurando trabalho; o que resta de "espiada" é rede de segurança rara, para o
caso de um aviso se perder.

---

## 1. Os quatro mecanismos

| Mecanismo | O que é | Onde usamos |
|---|---|---|
| **Webhook** | o terceiro NOS chama no instante do fato | Stripe (pagamento), Mercado Livre (venda), CMLink (instalação/consumo do chip) |
| **Requisição direta** | o usuário clica e a resposta sai na hora | loja, portal do cliente, painéis, botões de teste |
| **Outbox + NOTIFY** | o fato grava um evento NA MESMA transação; a campainha do banco (`pg_notify`) acorda o worker em milissegundos | entrega de eSIM, e-mail, replicação de estoque ML, provisionamento na operadora |
| **IMAP IDLE** | conexão viva com o Gmail; é o GOOGLE que avisa quando chega e-mail | CSV de ICCIDs da EasySim4u |

## 2. Catálogo de automações

| # | Gatilho (aconteceu…) | Reação automática | Mecanismo |
|---|---|---|---|
| A1 | Cliente pagou na loja | webhook Stripe → pedido pago → eSIM entregue OU provisionamento na operadora → eventos na outbox | webhook + outbox |
| A2 | Venda no Mercado Livre | webhook ML → outbox → rota interna entrega + replica estoque | webhook + outbox |
| A3 | Evento entrou na outbox | trigger-campainha `pg_notify('evento_novo')` → worker acorda em ms e despacha | NOTIFY |
| A4 | eSIM entregue | evento `entrega.notificar` → fila `notificacao` (dedupe por referência) → **e-mail de entrega** com QR anexo, código manual e link do pedido | outbox + SMTP |
| A5 | E-mail com CSV chegou na caixa `americasimti@gmail.com` | Gmail avisa (IDLE) → remetente autorizado? → hash já visto? → **lote pendente** na tela Requisições | IMAP IDLE |
| A6 | Operador aprovou o lote | ICCIDs entram no estoque/pool → e-mail de confirmação ao remetente → push no Zap | ação + SMTP + Zap |
| A7 | Cliente instalou o chip / consumiu dados | callback CMLink → ativação marcada `instalado` / validade atualizada → portal do cliente reflete | webhook |
| A8 | Envio de e-mail falhou | linha da fila ganha `proxima_em` com espera crescente; worker re-dispara no próximo ciclo | fila com retentativa |
| A9 | Pagamento sem entrega possível (falha definitiva) | pedido marcado no alerta "pago sem entrega" do painel | outbox |

## 3. Regras de arquitetura (decisões, com porquê)

1. **Trigger de banco NÃO carrega regra de negócio.** Trigger não chama HTTP, não
   retenta, e falha derrubando a transação da venda. A única exceção é a
   **campainha** (`avisar_evento_saida`): um `pg_notify` e nada mais — encanamento,
   não lógica (migração 013).
2. **Outbox transacional.** O evento nasce na MESMA transação do fato: ou os dois
   existem, ou nenhum. Webhook duplicado não duplica efeito (idempotência por
   referência + `UPDATE … WHERE flag=false RETURNING`).
3. **Worker só despacha.** Regra mora no hub (rotas `/v1/interno/*`, porteiro
   `conferirSegredo`); o worker aponta e retenta. Duplicar regra = duas versões
   divergindo.
4. **Retentativa com espera crescente em TODA borda externa** (operadora, e-mail,
   ML). Falha definitiva → 200 ok:false → alerta humano; falha transitória → 500 →
   fila insiste sozinha.
5. **Rede de segurança é rara, não ciclo de trabalho.** Com NOTIFY ligado, a
   espiada da fila cai para ~1x/min e só existe para aviso perdido (reconexão).
6. **Aprovação humana onde entra dinheiro/estoque de fora.** CSV nunca entra
   sozinho no estoque: vira lote pendente e um humano aprova na tela (formato
   inesperado não contamina o pool).
7. **Credenciais no cofre cifrado** (tela /painel/google), nunca em código — o
   repositório é público.

## 4. Fluxo do robô de ICCIDs (EasySim4u) — fim a fim

```
[botão Requisitar ICCIDs no painel]
   └─ e-mail padrão (invoice) → admin@easysim4u.com   + registro em requisicao_iccid
[Davi responde com CSV]
   └─ Gmail avisa (IMAP IDLE) → hub baixa a mensagem
        ├─ remetente não autorizado → ignora (fica só no log)
        ├─ hash do arquivo já visto → ignora (dedupe: e-mail reenviado não duplica)
        └─ novo → email_lote status=pendente, com prévia interpretada
[tela Requisições: operador confere a prévia e escolhe o SKU]
   └─ Aprovar → ICCIDs no estoque (com LPA cifrado se o CSV trouxer; senão pool)
        ├─ e-mail de confirmação ao remetente ("recebidos N, carregados X")
        └─ push no Zap (adaptador trocável; Evolution/Cloud API quando configurado)
```

## 5. O que NÃO fazemos (e por quê)

- **Cron varrendo o dia inteiro**: não há. O único relógio é a rede de segurança
  de ~1 min do worker, que custa microssegundos num banco local.
- **Regra de negócio em trigger**: ver regra 1.
- **Gmail API + Pub/Sub**: ganharia nada perceptível sobre IMAP IDLE e adiciona
  infraestrutura no Google Cloud. Fica como upgrade se um dia houver volume.
- **Confiar no corpo do webhook**: assinatura validada E objeto rebuscado na API
  antes de liberar produto (padrão herdado da análise do queroconsertar).
