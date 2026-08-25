# SPEC — Integração Mercado Livre para produto digital (eSIM)

**Versão:** 1.0 · 25/08/2026 · escrita no dia em que o ciclo rodou inteiro sozinho.
**Projeto de origem:** AmericaSim hub (`diogobsbastos/americasim-hub`, branch de checkpoint `checkpoint/2026-08-25-ciclo-ml-fechado`, commit `75cbca8`).
**Para quê:** reproduzir, em outro projeto, a venda de um produto **digital** no Mercado Livre com entrega automática — o ML avisa, o sistema entrega, manda o código na conversa e mantém o estoque do anúncio igual ao estoque real. Tudo o que está aqui foi **provado com evidência** (API, banco, tela); o que é hipótese está marcado como tal.

---

## 0. O que foi provado (a linha do tempo da prova)

Compra de teste às 08:02 UTC de 25/08/2026, sem nenhum toque humano depois do clique em "Comprar":

| hora | o que aconteceu | onde ficou a prova |
|---|---|---|
| 08:02:45 | ML chamou `POST /v1/webhooks/mercadolivre` com `topic: orders_v2`, `resource: /orders/2000018106342142`, `is_test: true` | `evento_saida` #17 |
| 08:02:46 | webhook gravou a linha e respondeu 200 em < 500 ms | idem |
| 08:02:50 | worker pegou o evento, chamou a rota interna, rota buscou o pedido no ML, viu `paid`, criou pedido `AM-RJMR-5746`, entregou 1 eSIM (`disponivel` → `entregue`) | `pedido`, `ativacao`, `estoque_esim` |
| 08:02:51 | código do eSIM enviado na conversa do pedido no ML | `log_sync: ml.pedido.mensagem ok`; print da conversa |
| 08:02:51 | quantidade do anúncio atualizada no ML: 2 → 1 | `log_sync: ml.estoque.replicar` |
| 08:20:49 | caminho inverso: operador inseriu 2 códigos pelo painel → anúncio no ML foi a 3 | lista de anúncios do vendedor no ML: "Estoque: 3 un." |

---

## 1. Arquitetura (o mínimo que precisa existir)

```
 Mercado Livre ──(notificação orders_v2, < 500 ms)──▶  /v1/webhooks/mercadolivre
                                                            │ grava 1 linha, responde 200
                                                            ▼
                                                      tabela evento_saida  (fila no banco)
                                                            │
                                                      worker (Node puro + pg, loop)
                                                            │ POST /v1/interno/ml/pedido {resource}
                                                            ▼
                                         app (Next.js) — rota interna, atrás de segredo
                                          1. GET /orders/{id} no ML (fonte da verdade)
                                          2. exige status = paid
                                          3. de-para MLB → SKU (canal_item)
                                          4. cria pedido (idempotente por id_externo)
                                          5. entrega (estoque_esim disponivel → entregue)
                                          6. POST /messages/packs/... com o código
                                          7. enfileira estoque.replicar
                                                            │
                                                      worker → POST /v1/interno/ml/estoque
                                                            │ PUT /items/{MLB} {available_quantity}
                                                            ▼
                                                      Mercado Livre (anúncio com a quantidade real)
```

Regras de desenho que se pagaram:

1. **O webhook não pensa.** Grava e responde. O ML desativa o tópico se você passar de 500 ms, e o que ele não conseguiu entregar só fica 2 dias em `/missed_feeds` — que, aliás, só o dono do app lê.
2. **O worker não sabe nada de ML.** Não tem token, não tem chave de cifra, não tem regra. Ele só chama rotas internas do app. Toda regra vive num lugar.
3. **A rota interna nunca confia no corpo da notificação.** O ML manda só o ponteiro (`/orders/123`); o estado pode ter mudado. Busca o pedido na fonte, sempre.
4. **Idempotência em três camadas:** webhook (dedup por `topic+resource` enquanto não processado), pedido (chave `canal_id + id_externo`), entrega (o `UPDATE ... WHERE status = 'disponivel'` é a trava — conferir antes e atualizar depois abre janela para vender o mesmo código duas vezes).
5. **Mensagem é best-effort.** A venda fechou e o eSIM saiu do estoque; se o ML recusar a mensagem, isso vira linha de log e um botão "Reenviar" no painel — não se desfaz uma entrega porque o mensageiro caiu.
6. **Tudo o que é operação do dia a dia é botão no painel**, não comando no servidor: publicar, alterar envio, soltar anúncio, reenviar código, inserir/retirar estoque, reconectar.

---

## 2. Pré-requisitos no Mercado Livre (o que custou a madrugada)

### 2.1 Não existe sandbox

O "ambiente de teste" do ML é a **produção com usuários marcados como teste**. Consequências:

- A aplicação (client_id) pertence sempre a uma **conta real**. É no DevCenter dessa conta que se configura notificação e permissão. Editar o app **não toca a loja** dessa conta (não publica, não vende, não manda mensagem).
- Usuários de teste (`POST /users/test_user`, até 10 por app) publicam e compram entre si. Anúncios deles aparecem no site real, mas só test users compram.
- Token de usuário de teste dá **403** ao ler item de vendedor real, ao ler `/applications/{id}` e `/missed_feeds`. Para inspecionar a configuração do app, só logado no DevCenter como o dono.
- Em "Administrar permissões" do app, a conta real dona pode (e deve) ficar **INATIVA** — só os test users com token.

### 2.2 Configuração do app no DevCenter (checklist que vale ouro)

| item | valor | por quê |
|---|---|---|
| URIs de redirect | `https://<painel>/painel/conexoes/mercadolivre/retorno` | exata, com https |
| Fluxos OAuth | Authorization Code + Refresh Token (Client Credentials pode ficar) | `offline_access` dá o refresh token; sem ele o acesso morre em 6 h |
| PKCE | **desligado** | ligado, o retorno exige `code_verifier` e falha sem explicar |
| Negócios | Mercado Livre | — |
| Permissão Usuários | Leitura e escrita | saber qual conta fala |
| Permissão Publicação e sincronização | Leitura e escrita | criar/atualizar/pausar anúncio |
| Permissão Venda e envios | Leitura e escrita | ler pedido pago |
| **Permissão Comunicações pré e pós-vendas** | **Leitura e escrita** | sem escrita, `POST /messages/packs` devolve `403 PolicyAgent PA_UNAUTHORIZED_RESULT_FROM_POLICIES` |
| **Tópico Orders_v2** | **marcado** | sem ele o ML nunca chama o webhook |
| Tópico Messages | marcado | comprador escreveu (para o futuro) |
| **URL de retorno de chamada de notificação** | `https://<dominio>/v1/webhooks/mercadolivre` | tudo minúsculo |

**Depois de mudar permissão, reconectar no painel.** O token antigo não ganha escopo novo. A prova de que valeu: o retorno do OAuth grava os escopos, e tem que aparecer `urn:ml:all:comunication:/read-write`.

### 2.3 Envio: a regra que ninguém documenta direito

A conta do vendedor tem `mandatory_settings.mode = "me2"` (`GET /users/{id}/shipping_preferences`). **Em toda categoria cuja `GET /categories/{id}/shipping_preferences` lista `me2`, o ML força Mercado Envios**: o `PUT /items/{id}` com `shipping.mode = not_specified` responde 200 e é **ignorado**; criar o item já com `not_specified` também nasce `me2`. Acima de R$79 ainda vem `mandatory_free_shipping` — o vendedor paga frete de algo que não viaja.

**Só funciona em categoria que NÃO oferece me2.** Aí o item nasce `mode: not_specified` e a página mostra "Entrega a combinar com o vendedor". Para eSIM:

| categoria | caminho | modos de envio | serve? |
|---|---|---|---|
| MLB270052 | Celulares › Acessórios › Cartões SIM | custom, me1, **me2**, not_specified | ❌ o classificador sempre sugere esta; ML força ME2 |
| **MLB1730** | Informática › Softwares › Internet e Redes | custom, me1, not_specified | ✅ o próprio classificador aponta para ela com "plano de dados internet" |
| MLB5106 | Celulares › Acessórios › Softwares | custom, me1, not_specified | ✅ reserva |

**Custos do ML num item de R$49,90 (tela do vendedor, 25/08):** tarifa de venda Clássico 13% = R$6,49 · custo de envio R$0,00 ("combinar com o comprador") · **custo fixo por unidade vendida R$7,75** · você recebe R$35,66. O "custo fixo" é taxa do ML em **todo item abaixo de R$79**, por unidade, em qualquer categoria (no anúncio antigo em Cartões SIM aparecia como R$8,15). Acima de R$79 o custo fixo some; nas categorias com ME2 ele é trocado por frete grátis obrigatório por conta do vendedor — na MLB1730, sem ME2, a hipótese é que sobre só a comissão. **Confirmar publicando um item ≥ R$79 e lendo o detalhamento na lista de anúncios** antes de decidir faixa de preço.

Como descobrir para outro produto: `GET /sites/MLB/domain_discovery/search?q=<título>` dá as categorias candidatas; para cada uma, `GET /categories/{id}/shipping_preferences` — a que não tiver `me2` em `logistics[].mode` é a que serve. Script pronto: `cacar_categoria_sem_me2.sh`.

**`custom` não resolve.** `custom` precisa de `costs: [{description, cost: "0"}]` (lista, não inteiro — o ML recusa `costs: 0` com `invalid property type`), mas continua sendo um envio: o ML calcula prazo e coloca selo de frete.

### 2.4 Corpo do anúncio que funcionou

```json
{
  "category_id": "MLB1730",
  "price": 49.9,
  "currency_id": "BRL",
  "available_quantity": 3,
  "buying_mode": "buy_it_now",
  "listing_type_id": "gold_special",
  "condition": "new",
  "pictures": [{ "id": "852824-MLB116673182725_082026" }],
  "attributes": [
    { "id": "BRAND", "value_name": "Simli" },
    { "id": "MODEL", "value_name": "eSIM Europa 5GB 15 dias" }
  ],
  "shipping": { "mode": "not_specified", "local_pick_up": false, "free_shipping": false },
  "title": "eSIM Europa 5 GB · 15 dias",
  "description": { "plain_text": "..." }
}
```

Regras: **sem `variations`** (um SKU = um anúncio; variação move o estoque para dentro da grade e o hub perde o controle). Os atributos obrigatórios vêm de `GET /categories/{id}/attributes` — os que têm `tags.allow_variations` **não** são enviados. Foto: `pictures: [{id}]` de um item do mesmo vendedor continua válido mesmo com o item-fonte excluído; o certo a longo prazo é `pictures: [{source: url}]` com imagem própria.

### 2.5 Mensagem pós-venda

```
POST https://api.mercadolibre.com/messages/packs/{pack_id}/sellers/{seller_id}?tag=post_sale
{ "from": { "user_id": "<seller>" }, "to": { "user_id": "<buyer>" }, "text": "..." }
```

`pack_id` = `order.pack_id ?? order.id`. Para ler a conversa: `GET /messages/packs/{pack}/sellers/{seller}?tag=post_sale&mark_as_read=false`. O `403 PolicyAgent` é **permissão do app**, não regra de conversa — provado assim: ler funcionava, escrever não; o comprador escrever antes não mudou nada; mudar a permissão e reconectar resolveu.

### 2.6 Notificação (o payload real)

```json
{
  "_id": "eb7a262e-...",
  "topic": "orders_v2",
  "resource": "/orders/2000018106342142",
  "user_id": 3638003733,
  "application_id": 8621171534072235,
  "sent": "2026-08-25T08:02:46.044Z",
  "received": "2026-08-25T08:02:45.909Z",
  "attempts": 1,
  "actions": ["action:new_order", "is_test:true", "pack_order:false", "site_id:mlb", "channel:marketplace", "order_items"]
}
```

O ML **não assina** a notificação. Duas defesas, e basta uma passar: segredo compartilhado em `?k=` (se configurado) **ou** IP de origem na lista oficial. Ler o IP **certo**: `X-Real-IP` que o Nginx sobrescreve com `$remote_addr`, ou o **último** item de `X-Forwarded-For` — o primeiro é forjável. O ML reenvia por 1 h, até 8 tentativas: o `agregado_id = md5(topic|resource)` faz a reentrega cair na mesma chave.

### 2.7 Usuário de teste, cartão e dados

| o quê | valor |
|---|---|
| criar test user | `POST /users/test_user {"site_id":"MLB"}` com token da conta real (dono do app); guardar a senha na hora — não dá para recuperar |
| cartão que aprova | `5480 8328 0103 3311`, validade `11/30`, CVV `123`, **titular `APRO`** (é o nome que faz aprovar), CPF `12345678909` |
| nota fiscal no checkout | CPF `123.456.789-09`, nome `Teste`, sobrenome `Comprador` |
| pedido de teste | vem com tag `test_order`; `no_shipping` quando a categoria é sem ME2 |

---

## 3. Banco (o que precisa existir e por quê)

| tabela | papel | pontos que doeram |
|---|---|---|
| `canal` (tipo `landing`/`mercadolivre`/`amazon`, `config` jsonb) | um canal por marketplace/vitrine | **`config = excluded.config` apagou dados**: rota que só sabe de uma parte do jsonb usa `\|\|`, nunca substitui inteiro |
| `credencial_canal` (access/refresh **bytea** cifrados, `expira_em`, `escopos`) | token do vendedor | renovar antes de vencer; 401 com token "válido" → renovar à força uma vez |
| `canal_item` (`variante_id`, `id_externo` = MLB, `categoria_externa`, `atributos_externos`, `quantidade_publicada`, `status`) | **o vínculo SKU ↔ anúncio**; é o de-para da venda e o alvo da réplica | presença em marketplace é **só** `id_externo not null`. Não misturar com `canal_variante.visivel` (vitrine) |
| `canal_variante` (`visivel`, `destaque`) | vitrine (LP) | só conta para canal tipo landing |
| `estoque_esim` (`codigo_lpa` **cifrado**, `codigo_hash`, `status` enum `disponivel/reservado/entregue/defeito/expirado/devolvido/interno`, `reservado_ate`) | **estoque em série**: cada unidade é um código | "retirar 1" não existe — é "retirar QUAL e por quê". `entregue` nunca volta |
| `estoque_livre` (view/função) | `disponivel` menos reservas vigentes | é o número que vai ao anúncio |
| gatilho `tg_estoque_replicar` | qualquer mexida em `estoque_esim` enfileira `estoque.replicar {variante_id}` | reserva que **vence pelo relógio** não dispara (nenhuma linha muda) — pendente: varredura periódica |
| `movimento_estoque` | extrato por unidade (tipo, status antes/depois, motivo, usuário) | nunca guarda o código |
| `pedido` (`canal_id`, `id_externo`, `status`, `pagamento_ref`) + `item_pedido` + `ativacao` | o pedido interno | chave de idempotência `(canal_id, id_externo)` |
| `evento_saida` (`agregado`, `agregado_id`, `tipo`, `payload`, `publicado_em`, `tentativas`, `proxima_em`, `ultimo_erro`) | a fila | worker: `for update skip locked`; espera crescente `30s × 2^tentativas` (teto 64×) |
| `log_sync` (`canal_id`, `entidade`, `acao`, `sucesso`, `detalhe` **text**) | diário da integração; o cartão de Conexões lê os erros | **era jsonb e todo mundo gravava texto: tabela vazia por dias, erros engolidos.** Testar o log gravando uma linha antes de confiar |
| `log_auditoria` | quem fez o quê no painel | grava escopos do OAuth — é como se prova a permissão nova |
| `usuario_teste_ml` | cofre dos test users (senha cifrada) | a senha do ML não se recupera |
| `parametro` | `mercadolivre.client_id`, `interno.segredo` | client secret vai cifrado / em env, nunca em texto |

---

## 4. Rotas e módulos (mapa do código de referência)

| caminho | responsabilidade |
|---|---|
| `app/v1/webhooks/mercadolivre/route.ts` | recebe, autentica (segredo ou IP), dedup, grava `evento_saida`, 200 em < 500 ms |
| `worker/worker.mjs` | loop na fila; `orders_v2` → `/v1/interno/ml/pedido`; `estoque.replicar` → `/v1/interno/ml/estoque` |
| `app/v1/interno/ml/pedido/route.ts` | busca pedido, exige `paid`, de-para, cria pedido, `entregarPedido`, mensagem best-effort |
| `app/v1/interno/ml/estoque/route.ts` | `PUT /items/{MLB} {available_quantity: livre}` e grava `quantidade_publicada` |
| `app/v1/interno/ml/publicar/route.ts` + `lib/ml-publicar.ts` | regras da categoria, monta o corpo, `POST /items`, grava `canal_item` |
| `app/v1/interno/ml/espiar/route.ts` | `GET` de qualquer caminho relativo da API com o token (ferramenta de diagnóstico) |
| `lib/mercadolivre.ts` | `mlFetch` (token, renovação, erro com `cause`), `canalMl`, test users |
| `lib/ml-envio.ts` | `corpoDoEnvio("sem_frete") = {mode:"not_specified"}`; `atualizarEnvio` (PUT) com resposta crua |
| `lib/ml-mensagem.ts` | monta e manda o código pela conversa; devolve resposta crua do ML |
| `lib/ml-categoria.ts` | `domain_discovery` (classificador) |
| `lib/entrega.ts`, `lib/estoque.ts`, `lib/lote.ts`, `lib/cripto-esim.ts` | entrega atômica, baixa/retorno/correção, parse de lote, cifra AES-256-GCM |
| `app/painel/conexoes/*` | conectar (OAuth), test users, checklist do app, "últimos erros" (24 h e após a última autorização) |
| `app/painel/produtos/item/[sku]/mercado-livre` | ficha: categoria (classificador + código manual), publicar, alterar envio, soltar |
| `app/painel/vendas/[numero]` | venda, ativação, linha do tempo dos efeitos, **Reenviar código pela conversa** |
| `app/painel/produtos` + `AjusteSaldo.tsx` | lista por SKU; clicar no saldo → Inserir (colar códigos) / Retirar (quantidade + motivo) |

Regra de Next que derrubou a tela duas vezes: **módulo `"use server"` só exporta função async**. Constante exportada de lá chega `undefined` no cliente e derruba a árvore inteira — e o build não reclama. Estados iniciais e tipos moram num `tipos.ts` ao lado. O `subir_com_guarda.sh` varre isso antes de compilar.

---

## 5. Roteiro de reprodução (do zero ao ciclo fechado)

1. **Conta real cria o app** no DevCenter com a tabela da seção 2.2. Anotar client_id; o client secret vai para env/cofre.
2. **Painel → Conexões → Mercado Livre**: colar client_id, gravar o secret, **Conectar** com a conta que vai vender (em teste, um test user vendedor). Conferir no `log_auditoria` os escopos gravados.
3. **Criar test users** (vendedor e comprador) pelo painel; guardar as senhas no cofre.
4. **Escolher a categoria sem ME2** (`cacar_categoria_sem_me2.sh` ou a seção 2.3). Publicar pela ficha do SKU com `MLB1730`, envio "sem frete", um SKU por anúncio. Provar com `espiar_envio.sh MLB…` que o `shipping.mode` gravado é `not_specified` — "ok" do PUT não é prova.
5. **Webhook público** atrás de HTTPS, respondendo 200 em < 500 ms; cadastrar a URL e o tópico Orders_v2 no app.
6. **Compra de teste** com o comprador de teste e o cartão APRO. Não tocar em nada. Conferir na ordem: `evento_saida` (chegou?) → `pedido` (criou, `entregue`?) → `estoque_esim` (um `entregue` a mais?) → `log_sync` (`ml.pedido.mensagem` ok? `ml.estoque.replicar` "N para N-1"?) → conversa do comprador no ML (código chegou?) → lista de anúncios do vendedor (quantidade caiu?).
7. **Caminho inverso**: inserir códigos pelo painel → o anúncio sobe sozinho.
8. Se algo não andar, `auditar_compra.sh` responde na ordem em que o dado anda: venda existe no ML? app configurado? webhook chegou no Nginx? hub viu? worker processou?

---

## 6. Armadilhas (cada uma custou tempo real)

1. "Alterar envio" dizendo ok não é prova — o ML responde 200 e ignora o modo. Prova é ler o item de volta.
2. Ler metade do contrato do ML é pior que não ler: `shipping_modes` não existe (é `shipping_options`/`simple_shipping`); `costs` é lista; `family_name` não está nos atributos. Imprimir o objeto inteiro em vez de escolher campos.
3. `restrictions` vazio na categoria de serviço não quer dizer que serve: categoria de serviço é **classificado** (`buying_modes: ["classified"]`) — sem botão comprar, sem pedido, sem webhook.
4. Erro engolido por `catch` numa coluna de tipo errado (`log_sync.detalhe` jsonb) escondeu o motivo da mensagem falhar por uma madrugada inteira. Todo log: gravar uma linha e ler de volta antes de confiar.
5. "Onde vende" com duas tabelas (`canal_item` e `canal_variante`) e uma ação que limpa só uma: selo fantasma na lista. Uma fonte por tipo de canal.
6. Link errado parece dado errado: `www.mercadolivre.com.br/anuncio/MLB…` não existe (é `produto.mercadolivre.com.br/MLB-<n>`); a página vazia fez parecer que o estoque não tinha replicado.
7. Anúncio órfão ativo (sem vínculo) é risco real: venda nele chega ao hub e não há o que entregar — a fila insiste para sempre. Pausar antes de tudo; excluir depois de ter a foto reaproveitada.
8. `push_files` sobrescreve arquivo existente sem avisar: `acoes.ts`/`tipos.ts` genéricos em pasta compartilhada. Listar a pasta antes de criar arquivo "novo".
9. Ausência não prova origem: proteger rota interna por "não tem `x-forwarded-for`" falha porque o próprio Next põe o cabeçalho. Prova é positiva: segredo.
10. Test user + DevCenter: a sessão do site do ML continua sendo o test user mesmo depois de "entrar" com outra conta — conferir o nome no canto da tela; test user vê o DevCenter vazio.

---

## 7. Scripts de diagnóstico (só leitura, salvo o marcado)

| script | pergunta que responde |
|---|---|
| `espiar_envio.sh MLB…` | como o ML gravou o `shipping` deste item |
| `espiar_api.sh /caminho` | qualquer GET da API com o token do vendedor, resposta inteira |
| `cacar_categoria_sem_me2.sh` / `_rodada2.sh` | em qual categoria o ML não consegue forçar ME2 |
| `mapear_servicos.sh MLB…` | regras de uma categoria (buying_modes, restrictions, atributos) |
| `auditar_compra.sh` | a venda existe no ML? app configurado? webhook chegou? hub/worker viram? |
| `disparar_pedido_ml.sh <id>` | **ESCREVE**: entrega um pedido à mão pela rota interna (quando o aviso não chegou) |
| `conferir_webhook.sh` | o caminho Nginx → hub responde; IP do ML é aceito; domínio não abriu o painel |
| `subir_com_guarda.sh` | fetch + guarda do `"use server"` + safe-build + restart + conferência |

---

## 8. O que ainda não está feito (para não confundir com "pronto")

Reserva que vence pelo relógio não dispara réplica (varredura periódica pendente). Cancelamento no ML não devolve reserva na hora. Nome e descrição do anúncio ainda vêm da família, não do SKU. Fotos vêm de `base_mlb` (muleta) — o certo é imagem própria com URL pública. O seletor de envio ainda se chama "Sem frete — entrega digital" (deveria ser "Entrega a combinar"). Produto **sob demanda** (operadora gera o código na hora da venda): a escolha do modo existe na criação do produto e as tabelas existem (`operadora`, `operadora_plano`, `requisicao_operadora`, `ativacao.provisionando`), mas o motor que chama a operadora não — depende da documentação da API da operadora.

---

## 9. Glossário rápido

**MLB** id do item no site Brasil · **pack_id** id da conversa/pacote de pedidos · **me2** Mercado Envios (etiqueta ML) · **not_specified** "a combinar com o vendedor" · **gold_special** anúncio Clássico · **gold_pro** Premium · **test_order** tag de pedido entre usuários de teste · **PolicyAgent** camada de política do ML que devolve 403 quando o app não tem a permissão · **DevCenter** `developers.mercadolivre.com.br/devcenter`, painel do app, só para a conta dona.
