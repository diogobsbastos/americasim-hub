# SPEC — API da China Mobile International (CMLink) · Global Data SIM Platform V4.2

> Transcrição estruturada da "CMI Global Data SIM Platform API Specification V4.2_AZ"
> (61 páginas, recebida do Haoran em 25/08/2026), reorganizada para consulta rápida.
> Escrita em 26/08/2026. **Não contém credencial nenhuma.** As chaves vivem em
> `~/.americasim-hub.env` (gravadas por `libs-base/cmlink_env.sh`) ou cifradas no banco
> (tela Operadoras).
>
> Onde a doc original é ambígua, está marcado **⚠️ AMBÍGUO** e a pergunta está na
> seção 12. O que já foi PROVADO contra o sandbox está marcado ✅; o resto é o que
> a doc diz.

---

## 0. Índice

1. Ambiente e rede
2. Conceitos (o modelo mental que a doc impõe)
3. Convenções gerais (tempo, campos M/O, `ext`)
4. Autenticação (WSSE + accessToken)
5. Endpoints northbound (nós → eles) — tabela-resumo
6. Endpoints em detalhe
7. Callbacks southbound (eles → nós)
8. Tipos compostos (DataBundle, UserDataBundle, Himsi, EsimCardInfo…)
9. Enums e estados
10. Códigos HTTP
11. Códigos de retorno (`code`) — tabela completa
12. Perguntas em aberto para o Haoran
13. Como isso se mapeia no hub AmericaSim

---

## 1. Ambiente e rede

| Item | Valor |
|---|---|
| Sandbox | `https://gdschannel.cmlink.com:39043` — **só HTTPS** (HTTP puro devolve 400) ✅ |
| Base path das rotas | `http(s)://ip:port/aep/<rota>` — a doc escreve `/aep/` em todos os exemplos |
| Produção | não informado na doc — perguntar |
| IP de saída da VPS | 137.131.216.214, enviado para whitelist deles em 25/08 ✅ |
| Prova de rede (25/08) | DNS ok, TCP ok, HTTPS sem auth = **401** (esperado) ✅ |
| Formato | JSON em ambas as direções. `Content-Type: application/json`, `Accept: application/json` |
| Método | **POST em todas as rotas**, inclusive consultas |
| ICCIDs de homologação | `89852342022449473379`, `89852342022449473387`, `89852342022449473395` |
| Contato | Haoran (+852), grupo de WhatsApp com Rafick e Diogo |

---

## 2. Conceitos — o modelo que a doc impõe

- **Canal (channel / cooperator / partner)**: nós. Identificado pelo `appkey`. Nossa
  conta tem um `cooperationMode` (1 = consignação, 2 = A2Z) e um depósito
  (pré-pago). **Não há rota de consulta de saldo** — só o erro `1000103 insufficient deposit`.
- **Card pool**: o conjunto de chips (ICCID/IMSI) pré-alocados ao canal. **Não existe
  rota "criar eSIM"**: o ICCID já existe no pool antes de qualquer venda.
- **Primary card / H-IMSI (himsi)**: o chip físico ou eSIM. Tem `iccid`, `himsi`,
  `msisdn`, `status` (0 normal / 1 pausa / 3 baixa) e `serviceUsageMode`
  (0 ativação manual / 1 automática).
- **V-IMSI (vimsi)**: IMSI virtual que a plataforma aloca quando o chip usa rede em
  outro país (multi-IMSI). Aparece nas trajetórias; não operamos nele.
- **Data bundle / package (`dataBundleId`)**: o plano de dados vendável (país/mcc,
  GB, dias, preço). É o que se compra **para um ICCID**.
- **Order (`orderID`) / child order (`subscriptionKey`, `childOrderId`)**: a compra de
  um bundle para um ICCID. `thirdOrderId` é o NOSSO id; `transactionCode` é um número
  de transação opcional que, se enviado, **não pode repetir** (idempotência).
- **Refueling package (add-on)**: pacote extra para um plano já ativo.
- **UPCC**: o controlador de política (quota, velocidade). Aparece nas rotas de consumo
  e nos templates de velocidade.
- **eSIM**: o ICCID pode ser um perfil eSIM; `SBO_queryEsimCardInfo` devolve
  `smdpAddress` + `activationCode` (= o QR/LPA) e o estado do perfil.
- **Southbound**: rotas que ELES chamam em uma URL NOSSA ("Provided by cooperator").

Fluxo de venda que a doc suporta:

```
ICCID do pool  ──►  APP_createOrder_SBO (bundle p/ ICCID)  ──►  [APP_activeDataBundle_SBO se manual]
      │                                                                  │
      └──►  SBO_queryEsimCardInfo (smdp + activationCode = QR)  ◄────────┘
                       │
                       ▼
        cliente instala  ──►  callback 3.2.17 (eSIM baixado/instalado/habilitado)
        chip usa rede    ──►  callback 3.2.15 (pacote ativou: activeTime/endTime)
                          ──►  callback 3.2.16 (consumo em bytes)
```

---

## 3. Convenções gerais (cap. 1 da doc)

- **Tempo** (§1.2.1): string de 14 dígitos `YYYYMMDDHHMMSS`, relógio 24h, **UTC0**.
  Exceções: `Created` do WSSE é ISO `YYYY-MM-DD'T'HH:mm:ss'Z'`; `setActiveTime` é
  `YYYYMMDD` (8); `installTime`/`updateTime` do eSIM é `yyyy-MM-dd HH:mm:ss`;
  `timeStamp` do callback 3.2.17 é epoch em segundos (10 dígitos).
- **`ext`** (§1.2.2, §1.2.6): `Map<String,String>` de propriedades estendidas. Se a
  resposta não tem extensão, o nó `ext` **não vem**. O `ext` mais externo do request
  é parâmetro de controle e não entra no banco deles.
- **Campos M/O** (§1.2.3): M = obrigatório, nó presente e não vazio. O = opcional:
  string pode faltar ou vir vazia; numérico pode faltar ou vir 0; lista pode faltar ou
  vir vazia; **objeto opcional não pode vir como nó vazio**.
- Em consultas, o nó de resposta (`Rsp`/lista) **volta mesmo vazio** quando sucesso;
  em falha, pode não voltar.
- Campos M da **resposta** só são garantidos em sucesso (§1.2.4).
- Senhas em trânsito (quando houver): **AES CBC** (§1.2.5) — não usamos nenhuma rota com senha.
- Cabeçalhos opcionais de rastreio (§3.1.2): `CallChainInfo`, `TraceInfo`, `Client-Info: beID=`.
  Não são obrigatórios; não vamos mandar.

---

## 4. Autenticação

### 4.1 Camada 1 — headers WSSE em TODA requisição (§3.1.1)

```
Authorization: WSSE realm="SDP", profile="UsernameToken", type="Appkey"
X-WSSE: UsernameToken Username="<appkey>", PasswordDigest="<digest>", Nonce="<nonce>", Created="<created>"
```

| Parte | Regra |
|---|---|
| `Username` | o **App Key** (App ID atribuído pela AEP) |
| `Nonce` | aleatório por requisição. Exemplo da doc: `66C92B11FF8A425FB8D4CCFE0ED9ED1F` (32 hex maiúsculo) |
| `Created` | UTC ISO `2022-07-07T09:58:21Z`. **Válido por 10 minutos** |
| `PasswordDigest` | `Base64( SHA256( Nonce + Created + AppSecret ) )` |

**⚠️ AMBÍGUO** — a frase da doc: *"the value of SHA256 byte is transcoded in utf8
encoding format, after that, compiled as Base64"*. Duas leituras:

- **A**: `base64(sha256_bytes)` — bytes crus do hash em base64 (padrão Huawei/WSSE);
- **B**: `base64(utf8(hex(sha256)))` — o hex do hash como texto, em base64.

O botão **Testar conexão** (painel → Operadoras) e o `libs-base/cmlink_auth_teste.mjs`
tentam A e depois B e dizem qual passou. `lib/cmlink.ts` usa a variante configurada
na tela (campo *Digest*).

### 4.2 Camada 2 — accessToken (§3.2.1)

`POST /aep/APP_getAccessToken_SBO/v1` (interface `SBO directGetAccessToken`)

| Req | Tipo | M/O | Tam | Descrição |
|---|---|---|---|---|
| `id` | String | M | 64 | appkey do canal |
| `type` | Integer | M | | tipo de conta de login: **106 = Channel** |

| Resp | Tipo | M/O | Tam | Descrição |
|---|---|---|---|---|
| `code` | String | M | 10 | `0000000` = ok |
| `description` | String | O | 1024 | |
| `accessToken` | String | O | 64 | |
| `expireTime` | String | O | 14 | UTC `YYYYMMDDHHMMSS`; **10 min por padrão** |

- Toda rota seguinte leva `accessToken` **no corpo** E os headers WSSE de novo.
- Erros: `1000008` accessToken inválido, `1000009` expirou. Renovar e repetir uma vez.
- Cache no hub: guardar token + `expireTime`, renovar com folga de 60 s.

---

## 5. Endpoints northbound — tabela-resumo

| § | Rota (`POST /aep/…`) | Para quê | Usamos? |
|---|---|---|---|
| 3.2.1 | `APP_getAccessToken_SBO/v1` | token | ✅ sempre |
| 3.2.2 | `app_getDataBundle_SBO/v1` | catálogo de pacotes | ✅ sync de `operadora_plano` |
| 3.2.3 | `APP_activeDataBundle_SBO/v1` | ativar pacote já comprado num chip | ✅ se `serviceUsageMode=0` |
| 3.2.4 | `APP_HIMSI_TERMSTATE_SBO/v1` | localização/estado em tempo real do chip | suporte |
| 3.2.5 | `APP_createOrder_SBO/v1` | **comprar pacote para um ICCID** | ✅ motor |
| 3.2.6 | `APP_getSubedUserDataBundle_SBO/v1` | pacotes de um chip (status, restante) | ✅ "ver status" |
| 3.2.7 | `APP_queryCarrier_SBO/v1` | operadoras/países configurados (APN) | catálogo/LP |
| 3.2.8 | `APP_getSubscriberAllQuota_SBO/v1` | consumo (UPCC) | ✅ "ver status" |
| 3.2.9 | `SBO_package_end/v1` | encerrar pacote ativo antes do prazo | suporte |
| 3.2.10 | `SBO_query_SIMInfo/v1` | estado do chip (lista) | ✅ "ver status" |
| 3.2.11 | `SBO_query_usingTrajectories/v1` | trajetória (países × datas) | suporte |
| 3.2.12 | `SBO_channel_unsubscribe/v1` | cancelar pedido (antes de ativar) | ✅ estorno |
| 3.2.13 | `SBO_queryEsimCardInfo/v1` | **QR/LPA do eSIM** | ✅ motor |
| 3.2.14 | `SBO_queryUpccTemplate/v1` | templates de velocidade/hotspot | não |

---

## 6. Endpoints em detalhe

Convenção: todos POST, corpo JSON, headers WSSE. Campos de resposta comuns:
`code` (String, M, 10) e `description` (String, O, 1024). Onde a doc escreve
`decsription`/`msg`, está anotado.

### 6.1 Catálogo — `app_getDataBundle_SBO/v1` (§3.2.2, `VSBO.getDataBundle`)

Request:

| Campo | Tipo | M/O | Tam | Descrição |
|---|---|---|---|---|
| `accessToken` | String | M | | |
| `Partners` | String | O | 20 | Channel ID (exemplo escreve `Partner`) |
| `dataBundleId` | String | O | 20 | filtrar por pacote |
| `dataBundleName` | String | O | 20 | |
| `Group_id` | String | O | 32 | grupo de pacotes |
| `language` | String | O | | ISO-639 (`zh`, `en`) |
| `country` | String | O | | ISO-3166 (`CN`, `US`, `HK`) |
| `mcc` | String | O | | código do país (MCC) |
| `status` | Integer | O | | 1 = normal |
| `currency` | List<String> | O | | ex. `["USD"]` (exemplo manda string) |
| `beginIndex` | Integer | O | | default 0 |
| `count` | Integer | O | | default 50 |
| `cooperationMode` | String | **M** | 1 | **1 = consignment · 2 = A2Z** |
| `ext` | Map | O | | |

Response: `code`, `description`, `dataBundles: List<DataBundle>` (M) — ver §8.1.

### 6.2 Ativar pacote — `APP_activeDataBundle_SBO/v1` (§3.2.3)

"Activate subscripted package, reserved previous activated plan".

| Campo | Tipo | M/O | Tam | Descrição |
|---|---|---|---|---|
| `accessToken` | String | M | | |
| `hImsi` | String | O | 6–15 | um de `hImsi`/`msisdn`/`iccid` é obrigatório |
| `msisdn` | String | O | 20 | |
| `iccid` | String | O | 20 | |
| `dataBundleId` | String | M | 20 | |
| `mcc` | String | M | 20 | país (⚠️ o que mandar em pacote multi-país — perguntar) |
| `ext` | Map | O | | |

Response: `code`, `description` (exemplo: `decsription`), `ext`.

### 6.3 Localização/estado do chip — `APP_HIMSI_TERMSTATE_SBO/v1` (§3.2.4)

Request: `accessToken` (M), `imsi` (O), `iccid` (O) — um dos dois, `ext`.
Response: `code`, `description`, `imsi` (M), `msisdn` (O), **`mobileCountryCode`** (O, MCC atual), `ext`.

### 6.4 **Comprar pacote** — `APP_createOrder_SBO/v1` (§3.2.5 "Order synchronization")

| Campo | Tipo | M/O | Tam | Descrição |
|---|---|---|---|---|
| `accessToken` | String | M | | |
| `thirdOrderId` | String | M | (200 em 3.2.12) | **nosso** id de pedido |
| `includeCard` | Integer | M | | **fixo 0** |
| `is_Refuel` | String | M | 1 | **0 = É add-on · 1 = NÃO é add-on** (invertido do óbvio) |
| `refuelingId` | String | O | 20 | obrigatório se `is_Refuel=0` |
| `dataBundleId` | String | O | 20 | id do pacote |
| `quantity` | Integer | M | | quantidade (1000095: só 1 ou X = dias restantes) |
| `ICCID` | String | M | 20 | **maiúsculo** no nome do campo |
| `sendLang` | String | O | | idioma do SMS de compra: 1 zh-TW · 2 en · 3 zh-CN |
| `setActiveTime` | String | O | 8 | data de ativação `YYYYMMDD` (só activationMode=1) |
| `transactionCode` | String | O | 32 | número de transação; se enviado, **não pode repetir** (1000162) e é processado uma vez só |

Response:

| Campo | Tipo | M/O | Descrição |
|---|---|---|---|
| `code` | String | M | |
| `description` | String | O | (exemplo: `decsription`) |
| `orderID` | String | M | id do pedido na plataforma |
| `totalAmount` | Long | M | (exemplo: `toatlAmount`) |
| `quantity` | Integer | M | |
| `price` | String | M | unitário |
| `currency` | String | M | |
| `ext` | Map | O | |

Erros relevantes: `1000013` ICCID não existe · `1000065` ICCID inválido/não pronto ·
`1000073`/`1000175` ICCID não é deste canal · `1000103` depósito insuficiente ·
`1000117` iccid/orderID já ativo · `1000154` pedido em processamento, não repita ·
`1000162` transactionCode repetido · `1000163` compra não permitida.

### 6.5 Pacotes do chip — `APP_getSubedUserDataBundle_SBO/v1` (§3.2.6, `SBO.getSubedUserDataBundle`)

| Campo | Tipo | M/O | Descrição |
|---|---|---|---|
| `accessToken` | String | M | |
| `hImsi` | String | O | um de `hImsi`/`iccid` |
| `iccid` | String | O | |
| `status` | String | O | 1 em uso · 2 usado · 3 não usado · 4 expirado (vazio = todos) |
| `language` | String | **M** | **0 zh-CN · 1 zh-TW · 2 en** (numérico aqui!) |
| `beginIndex` | Int32 | O | default 0 |
| `count` | Int32 | O | default 50 |
| `mcc` | String | O | vazio = todos |
| `ext` | Map | O | |

Response: `code`, `description`, `userDataBundles: List<UserDataBundle>` (M) — ver §8.2.

### 6.6 Operadoras/países — `APP_queryCarrier_SBO/v1` (§3.2.7)

Request: `language` (M: 0 zh-CN · 1 zh-TW · 2 en), `mcc` (O), `continent` (O), `ext`.
**Sem `accessToken` na tabela** (⚠️ perguntar).
Response: `code`, `description`, `stateList: List<Carrier>`, `ext`.
Carrier: `country` M, `continent` M, `carrier` M, `isHot` M, `imageUrl` O, `APN` M, `mcc` M.

### 6.7 Consumo — `APP_getSubscriberAllQuota_SBO/v1` (§3.2.8)

Request: `himsi` (O), `iccid` (O) — um dos dois, `beginTime` `YYYYMMDD` (O),
`endTime` (O), `childOrderId` (O — se passado, só ele vale), `thirdOrderId` (O), `ext`.
**Sem `accessToken` na tabela** (⚠️).
Response: `code` (0 ok), `description` (mensagens: "The service is temporarily
unavailable", "The card is not queried…", "Package does not exist", "Wrong type of
data usage limit package", "Start/End time cannot be empty", "ICCID and HIMSI must be
fill-in either one"), `quotaList: List<QuotaRes>`.

QuotaRes: `subscriberQuota` (SubscriberQuota, O), `historyQuota` (List<HistoryQuota>, O), `ext`.

SubscriberQuota (tudo String, M): `qtavalue` (total do pacote, MB), `qtabalance`
(restante alta velocidade), `qtaconsumption` (usado), `type` (1 ciclo · 2 dia),
`refuelingTotal` (add-ons comprados), `qtaconsumptionTotal` (alta + limitada),
`directionalAppFlow: List<DirectionalAppFlow>` (O).
DirectionalAppFlow: `directionalAppTotalFlow` O, `directionalAppUsedFlow` M, `directionalAppName: List<String>` M.
HistoryQuota: `time` `YYYYMMDD` M, `qtaconsumption` M, `mcc` M, `appName` O.

Exemplo real da doc: `{"code":"0000000","subscriberQuota":{"qtavalue":"300.00","qtabalance":"0.00",…},"historyQuota":[{"time":"20240308","qtaconsumption":"121.89","mcc":"454","appName":"youtube"}…],"ext":null}` — note que o exemplo vem **sem** `quotaList` (⚠️ formato real a confirmar no sandbox).

### 6.8 Encerrar pacote — `SBO_package_end/v1` (§3.2.9)

Request: `iccidPackageList: IccidPackage[]` (M), `accessToken` (M, 50).
IccidPackage: `iccid` (O), `imsi` (O) — um dos dois, `packageid` (Required).
Response: `code` (0 ok), `description`, `errorList: List<Parameter>` (O) —
`parameterName` (ICCID ou imsi), `parameterValue` (motivo).

### 6.9 Estado do chip — `SBO_query_SIMInfo/v1` (§3.2.10)

**O corpo é um ARRAY** (não objeto): `[{"imsi":"","iccid":""}, …]` — um de
`imsi`/`iccid` por item. **Sem `accessToken`** na doc (⚠️).
Response: `code` (0 ok), `description`, `himsis: List<Himsi>` (O, "só IMSI e status têm valor") — ver §8.3.

### 6.10 Trajetória — `SBO_query_usingTrajectories/v1` (§3.2.11)

Request: `imsi` (O)/`iccid` (O) — um dos dois, `packageID` (M), `orderID` (O),
`subscriptionKey` (O), `language` (0 zh · 1 en · 2 zh-TW — ⚠️ ordem diferente das outras rotas).
Response: `code`, `description`, `trajectoriesList: List<trajectories>` (O).
trajectories: `hImsi` M, `vimsi` O, `mcc` M, `country` M, `beginTime` `YYYYMMDD` M,
`useTime` `YYYYMMDD` M, `qtavalue` (MB) O.

### 6.11 Cancelar pedido — `SBO_channel_unsubscribe/v1` (§3.2.12)

"Only the channel can call the unsubscribed interface."
Request: `orderId` (O, 32), `thirdOrderId` (O, 200) — um dos dois, `orderId` prevalece; `accessToken` (M, 50).
Response: `code` (`0000000` ok), **`msg`** (M, 1024).
Regras (pelos códigos): só pedido **completo** e **não ativado** (1000041, 1000044);
`1000035` pedido de outro mês não cancela; `1000040` só pacotes; `1000045` quantidade
inconsistente; `1000047` reembolso falhou.

### 6.12 **eSIM (QR/LPA)** — `SBO_queryEsimCardInfo/v1` (§3.2.13)

Request: `iccid` (M), `accessToken` (M).
Response: `code`, `description`, **`cardInfo: EsimCardInfo`** (O).
**⚠️ AMBÍGUO**: o exemplo devolve `{"data":{…},"code":"","msg":""}` — chave `data` e
`msg` em vez de `cardInfo`/`description`. O cliente do hub aceita as duas.

EsimCardInfo:

| Campo | Tipo | M/O | Descrição |
|---|---|---|---|
| `eid` | String | M | EID do eUICC (vazio até instalar) |
| `activationCode` | String | M | código de ativação (matching ID) |
| `smdpAddress` | String | M | endereço SM-DP+ |
| `installDevice` | String | O | |
| `installCount` | Integer | O | quantas vezes foi instalado |
| `installTime` | String | O | `yyyy-MM-dd HH:mm:ss` |
| `updateTime` | String | O | |
| `state` | String | M | estado do perfil (valores não listados na doc ⚠️) |
| `downloadUrl` | String | M | URL de download |

**LPA (string do QR)** = `LPA:1$<smdpAddress>$<activationCode>` (padrão GSMA SGP.22).

### 6.13 Templates UPCC — `SBO_queryUpccTemplate/v1` (§3.2.14)

Request: `templateId` O, `accessToken` M, `templateName` O, `templateDesc` O, `supportHotspot` O (1 sim · 2 não).
Response: `code`, `description`/`msg`, `upccTemplate: List<UpccTemplate>` (`templateId`, `templateName`, `templateDesc`, `supportHotspot`).

---

## 7. Callbacks southbound (eles → nós) — "Provided by cooperator"

Todos POST JSON na URL que registrarmos. Proposta: `https://americasim.com.br/v1/webhooks/cmlink`
(uma rota, discrimina pelo corpo). **A doc não descreve assinatura/autenticação do
callback** — os exemplos mostram headers WSSE, então provavelmente eles assinam com
NOSSO appkey/appsecret (verificar) ou é IP fixo (perguntar).

### 7.1 Ativação confirmada — §3.2.15 "Channel Activation Notifications"

| Campo | Tipo | M/O | Descrição |
|---|---|---|---|
| `iccid` | String | M | |
| `packageId` | String | M | pacote / traffic pool |
| `mcc` | String | O | país onde ativou |
| `cmccNumberProvince` | String | O | província (número doméstico CN) |
| `thirdOrderId` | String | O | nosso id |
| `activeTime` | String | M | `YYYYMMDDHHmmss` |
| `endTime` | String | M | `YYYYMMDDHHmmss` |
| `rderId` (sic; exemplo: `orderId`) | String | M | order ID total |

Resposta esperada de nós: `{"code":"0","msg":"Success"}` (code 0 ok / não-0 falha).

### 7.2 Consumo — §3.2.16 "Data Notification Interface (new)"

| Campo | Tipo | M/O | Descrição |
|---|---|---|---|
| `imsi` | String | O | um de imsi/iccid |
| `iccid` | String | O | |
| `qtavalue` | String | M | **bytes** usados |
| `timestamp` | String | M | UTC `YYYYMMDDHHMMSS` |
| `orderId` | String | M | |
| `childOrderId` | String | M | |

Exemplo: `{"iccid":"89852342022006915895","imsi":"454120381956774","qtavalue":"101804370","timestamp":"20240109175959"}` (sem orderId no exemplo).
Resposta: `{"code":"0","description":"Success"}`.

### 7.3 Estado do eSIM — §3.2.17 "ESIM Status Notification" (ES2+ `handleDownloadProgressInfo`)

URI na doc: `http(s)://ip:port/aep/gsma/rsp2/es2plus/handleDownloadProgressInfo` (⚠️ a doc
põe como "Request URI" — perguntar se é enviado para nós ou se é rota deles).

| Campo | Tipo | M/O | Descrição |
|---|---|---|---|
| `header` | EsimNotifyReqHeader | M | `functionRequesterIdentifier` (10–32), `functionCallIdentifier` (1–32) |
| `eid` | String | O | 32 |
| `iccid` | String | M | 18–20 |
| `profileType` | String | M | ex. `CMI_gds_esim_02` |
| `timeStamp` | String | M | epoch segundos (ex. `1709712641`) |
| `notificationPointId` | String | M | 1 Eligibility/retry check · 2 Confirmation failure · **3 BPP download** · **4 BPP installation** · 5 DELETED · **101 ENABLED** · **102 DISABLED** |
| `notificationPointStatus` | `{status}` | M | ex. `Executed-Success` |
| `resultData` | String | O | resultado da instalação no eUICC |

Resposta esperada:
```json
{"header":{"functionExecutionStatus":{"status":"Executed-Success","statusCodeData":{"subjectCode":"0","reasonCode":"0","message":"success"}}},"iccid":"<iccid>"}
```

---

## 8. Tipos compostos

### 8.1 DataBundle (catálogo)

| Campo | Tipo | M/O | Descrição |
|---|---|---|---|
| `id` | String(20) | M | id do pacote |
| `name` | List<DialectInfo> | M | nome multi-idioma |
| `desc` | List<DialectInfo> | M | |
| `cardPools` | Map<String, List<NetCapability>> | M | poolId → países (`mcc` M, `mnc` O) |
| `status` | Integer | M | 1 normal · 2 suspenso (não vende; assinaturas antigas seguem) · ~~3 baixado~~ |
| `activationMode` | String | M | 1 começa na data reservada/1ª chamada · 2 após LU do IMSI · 3 após uso > limite |
| `type` | Int32 | M | 1 limite no ciclo · 2 limite por dia |
| `periodType` | Int32 | M | 0 = 24h · 1 dias · 2 meses · 3 anos |
| `period` | Int32 | M | duração (ex. 3, 7, 30) |
| `imgurl` | String(1000) | M | |
| `priceInfo` | List<PriceInfo> | O | `currencyCode`, `price`, `unit` |
| `refuelingPackage` | List<RefuelingPackage> | O | add-ons |
| `createTime`/`expireTime`/`lastModifyTime` | String(14) | M | UTC |
| `originalPriceInfo` | List<PriceInfo> | O | preço de tabela |
| `ext` | Map | M | |

DialectInfo: `langInfo{language ISO-639, country ISO-3166}`, `value`.
RefuelingPackage: `refuelingID` M, `nameCN/nameTW/nameEN` O, `flowVrange` int M,
`flowUnight` (1 MB · 2 GB) M, `hkd`/`usd`/`cny` M, `createTime` M, `isOrderingAllowed` (1 sim · 2 não) M.

### 8.2 UserDataBundle (pacotes do chip)

| Campo | Tipo | M/O | Descrição |
|---|---|---|---|
| `bundleDesc` | List<DialectInfo> | M | |
| `name` | List<DialectInfo> | M | |
| `dataBundleId` (exemplo: `dataBundleID`) | String | M | |
| `status` | Integer | O | **1 não ativado · 2 expirado · 3 ativado · 99 reembolsado** |
| `remainderDays` | Integer | O | dias restantes (só ativado + limite diário) |
| `orderID` | String | O | |
| `subscriptionKey` | String | O | id do sub-pedido (child order) |
| `price` | PriceInfo | O | |
| `orderChannel` | String | O | |
| `createTime` | String(14) | O | |
| `expireTime` / `endTime` / `activeTime` / `setActiveTime` | String | O | |
| `isSupportFuelpack` | String | O | 1 sim · 2 não |
| `packageType` | String | O | 1 ciclo · 2 dia |
| `deductionModel` | String | M | 1 padrão · 2 binding |
| `remainFlow` | String | O | MB restantes (2 casas) — só ativado |
| `remainTime` | String | O | "x hours, y minutes, z seconds" — só ativado |

### 8.3 Himsi (chip)

| Campo | Tipo | M/O | Descrição |
|---|---|---|---|
| `hImsi` | String(20) | M | |
| `msisdn` | String(20) | M | |
| `iccid` | String(20) | M | |
| `status` | Int32 | M | **0 Normal · 1 Pause · 3 Log out** |
| `cardHlrId` / `cardOtaId` | String | O | |
| `createTime`/`expireTime`/`lastModifyTime` | String(14) | M | |
| `serviceUsageMode` | String | O | **0 ativação manual · 1 automática** |
| `realRuleList` | realRule[] | O | regras de nome real (vazio = não exige) |
| `ext` | Map | O | |

realRule: `ruleID` M, `name` M, `mcc` String[] M, `certificatesType` (1 passaporte · 2 HK/Macau pass · 3 HKID · 4 Macau ID) O, `certificatesTime` `YYYY-MM-DD` O, `authStatus` (1 a certificar · 2 verificando · 3 certificado · 4 falhou · 5 expirou) O.

---

## 9. Enums e estados (consolidado)

| Onde | Valores |
|---|---|
| `cooperationMode` (catálogo) | 1 consignment · 2 A2Z |
| `type` do login | 106 Channel |
| `language` (getSubed, queryCarrier) | 0 zh-CN · 1 zh-TW · 2 en |
| `language` (catálogo) | ISO-639 `zh`/`en` |
| `language` (trajetória) | 0 zh · 1 en · 2 zh-TW |
| `sendLang` (createOrder) | 1 zh-TW · 2 en · 3 zh-CN |
| `is_Refuel` | 0 é add-on · 1 não é |
| DataBundle.status | 1 normal · 2 suspenso |
| DataBundle.activationMode | 1 data/1ª chamada · 2 LU · 3 uso > limite |
| DataBundle.type / packageType | 1 ciclo · 2 dia |
| DataBundle.periodType | 0 24h · 1 dia · 2 mês · 3 ano |
| UserDataBundle.status | 1 não ativado · 2 expirado · 3 ativado · 99 reembolsado |
| getSubed filtro `status` | 1 em uso · 2 usado · 3 não usado · 4 expirado |
| Himsi.status | 0 normal · 1 pausa · 3 baixa |
| serviceUsageMode | 0 manual · 1 automático |
| deductionModel | 1 padrão · 2 binding |
| flowUnight | 1 MB · 2 GB |
| isOrderingAllowed / isSupportFuelpack / supportHotspot | 1 sim · 2 não |
| notificationPointId (ES2+) | 1, 2, 3 download, 4 instalação, 5 deleted, 101 enabled, 102 disabled |

---

## 10. Códigos HTTP (cap. 4)

| HTTP | Significado |
|---|---|
| 200 | ok (GET obteve / POST atualizou) |
| 201 | criado |
| 302 | redirect |
| 400 | parâmetro incorreto ou formato errado |
| 401 | **autenticação falhou** ou recurso não pertence à conta (é o que a VPS recebeu sem auth ✅) |
| 404 | não encontrado |
| 405 | método não suportado |
| 429 | muitas requisições |
| 500 | erro interno |

---

## 11. Códigos de retorno (`code`) — tabela completa (cap. 5)

Sucesso: **`0000000`**. (Nas rotas mais novas — 3.2.8 a 3.2.17 — a doc diz "0 = success; non-0 = fail"; o exemplo do 3.2.14 devolve `0000000`. Tratar **`0000000` e `0` como sucesso**.)

| Código | Descrição |
|---|---|
| 1000000 | Falta header Authorization / erro no header / falta X-WSSE / formato do X-WSSE errado |
| 1000001 | PasswordDigest falhou |
| 1000002 | UserName inválido |
| 1000003 | Nonce inválido |
| 1000004 | Created inválido |
| 1000005 | Parâmetro obrigatório {nome} vazio |
| 1000006 | App Key não existe |
| 1000007 | Parâmetro {nome} malformado |
| 1000008 | accessToken inválido |
| 1000009 | Código de verificação expirou |
| 1000010 | Nenhum pacote disponível |
| 1000012 | IMSI não existe |
| 1000013 | ICCID não existe |
| 1000014 | MSISDN não existe |
| 1000015 | Crédito do pacote insuficiente / pacote promocional excedeu quantidade |
| 1000016 | Username já existe |
| 1000017 | Erro de captcha |
| 1000018 | Senha original não confere |
| 1000019 | Login falhou |
| 1000020 | ICCID já pareado; não pode parear de novo |
| 1000021 | Cartão principal já entregue; não pode modificar |
| 1000022 | Já há registro de ativação no mês; não pode modificar |
| 1000023 | Cobrança do parceiro falhou |
| 1000024 | Liberação do pacote falhou (cancelamento de conta UPCC falhou) |
| 1000025 | Compra do pacote falhou |
| 1000026 | Interface do fornecedor final chamada anormalmente |
| 1000027 | IMSI do card pool insuficiente |
| 1000028 | Order ID incorreto |
| 1000029 | Cartão principal em estado anormal; pacote não será pedido |
| 1000030 | Cancelamento parcial falhou / crédito de cancelamento insuficiente |
| 1000031 | Sem pacote ativo; add-on não permitido |
| 1000032 | Pipeline code repetido; recarga falhou |
| 1000033 | Moeda da recarga errada |
| 1000034 | Moeda inconsistente com a do canal |
| 1000035 | Pedido de outro mês; cancelamento não suportado |
| 1000036 | Tipo de recarga incorreto (indisponível em modo depósito) |
| 1000037 | Após recarga, disponível < 0 |
| 1000038 | Canal não encontrado |
| 1000039 | Pedido não existe; cancelamento falhou |
| 1000040 | Só pacotes podem ser cancelados |
| 1000041 | Cancelamento só para pedido com status concluído |
| 1000042 | Status do sub-pedido inconsistente |
| 1000043 | Pacote parcial já ativado |
| 1000044 | Pacote não está pendente de ativação; cancelamento falhou |
| 1000045 | Nº de pacotes ≠ nº de sub-pedidos |
| 1000046 | Cancelamento falhou; tente depois |
| 1000047 | Reembolso falhou |
| 1000048 | Total insuficiente após recarga |
| 1000049 | Valor usado insuficiente após recarga |
| 1000050 | Senha errada demais vezes; conta bloqueada |
| 1000051 | Usuário ou senha incorretos |
| 1000052 | Operação falhou |
| 1000053 | Conta não existe |
| 1000054 | Tipo de usuário sem permissão |
| 1000055 | Verificação de assinatura falhou |
| 1000056 | Cartão principal expirou |
| 1000057 | Consulta de localização falhou |
| 1000058 | Pacote não suporta este país |
| 1000059 | Ativação falhou |
| 1000060 | Registro de nome real incompleto; ativação falhou |
| 1000062 | Cartão principal cancelado e fora do prazo de retenção |
| 1000063 | Sem info do fabricante do chip / mudou de província |
| 1000065 | ICCID inválido (não é CMI ou não está pronto para venda) |
| 1000066 | Cliente de origem do chip e traffic pool não batem |
| 1000067 | Chip já existe no traffic pool |
| 1000068 | Importação de ICCID falhou |
| 1000069 | Ciclo do flow pool fora de uso (expirou) |
| 1000070 | Traffic pool não aprovado |
| 1000071 | Tipo de operação errado |
| 1000072 | Batch card não encontrado |
| 1000073 | ICCID {} não pertence a este canal |
| 1000074 | Consulta da lista de traffic pool falhou |
| 1000076 | Sem permissão para operar este IMSI/ICCID |
| 1000077 | Não pediu o chip nem o pacote |
| 1000079 | Usuários temporários só compram pacotes/add-ons |
| 1000081 | Usuários de canal/ICCID só compram pacotes/add-ons |
| 1000082 | Falta endereço do destinatário |
| 1000083 | Erro de moeda |
| 1000084 | Usuário individual não existe |
| 1000085 | Cliente não existe |
| 1000086 | Chip não-CMI; add-on/pacote não permitido |
| 1000087 | Data de ativação vazia ou fora do intervalo |
| 1000088 | Info do cartão principal não existe |
| 1000089 | Cartão principal é de emissão cooperativa |
| 1000090 | **Cartão principal não é eSIM** |
| 1000091 | Cartão principal já entregue |
| 1000094 | Sem pacote ativo; add-on não permitido |
| 1000095 | Quantidade só pode ser 1 ou X (dias restantes) |
| 1000096 | Pacote não existe ou não suporta add-on |
| 1000097 | Add-on não permitido / não aprovado |
| 1000099 | Canal não existe ou status anormal |
| 1000100 | Status atual não permite pedir |
| 1000101 | Chip atribuído a outro cliente |
| 1000102 | Compra falhou: moeda não bate |
| 1000103 | **Compra falhou: depósito insuficiente** |
| 1000105 | Pacote não pode ser comprado |
| 1000107 | ICCID ou orderID obrigatório |
| 1000108 | Telefone ou e-mail obrigatório |
| 1000109 | País do passaporte vazio |
| 1000110 | Tipo e nº do ID antigo: ambos ou nenhum |
| 1000111 | Data de nascimento: `YYYYMMDD` |
| 1000112 | Imagem do ID só JPG/PNG |
| 1000113 | Imagem do ID entre 15×15 e 4096 px |
| 1000114 | Imagem do ID até 10 MB |
| 1000115 | Falha ao obter cartão principal; confira o ICCID |
| 1000116 | Falha ao obter pedido; confira se existe |
| 1000117 | **iccid/orderID já existe e está ativo** |
| 1000118 | Pedido já verificado por nome real |
| 1000119 | Falha ao obter regra; confira o código de autenticação |
| 1000120 | Falha ao salvar imagem com marca d'água |
| 1000121 | Documento excede X chips pareados |
| 1000122 | Tipo/ID antigo não existe |
| 1000123 | Nome da autenticação antiga inconsistente |
| 1000124 | Tipo de passaporte não atende |
| 1000125 | Certificação em processamento; não repita |
| 1000126 | Autenticação H5 falhou |
| 1000127 | Nenhum pacote no pedido atual |
| 1000129 | Falha ao obter PLMNs |
| 1000131 | Fornecedor não encontrado |
| 1000132 | Info do pacote não encontrada |
| 1000134 | Não conseguiu recursos VIMSI |
| 1000135 | Sem VIMSI em nenhum card pool para este pacote |
| 1000136 | KI do V card vazio |
| 1000137 | Cifra do KI falhou |
| 1000138 | Criação da conta HSS falhou |
| 1000139 | Criação da conta UPCC falhou |
| 1000140 | Verificação de assinatura falhou |
| 1000141 | Arquivo grande demais |
| 1000150 | Tipo de limite de dados errado |
| 1000151 | Status do pacote não é normal |
| 1000152 | Quantidade de pacote promocional excedida |
| 1000153 | Status do cartão principal não é normal |
| 1000154 | **Pedido em processamento; não reenvie** |
| 1000155 | Tipo de fornecedor do canal errado; recarga falhou |
| 1000156 | Chip não encontrado |
| 1000158 | Add-on não associado ao pacote |
| 1000159 | Grupo de pacotes não existe |
| 1000160 | Detalhes do pacote não existem |
| 1000161 | Chip de emissão cooperativa; compra não permitida |
| 1000162 | **transactionCode já existe; criação do pedido falhou** |
| 1000163 | Pedido não permitido |
| 1000164 | ICCID vazio |
| 1000165 | cmccNumber/cmccNumberProvince vazio |
| 1000166 | Quantidade do pedido não é única |
| 1000167 | Relação do número errada |
| 1000168 | Sem permissão para este template de velocidade |
| 1000169 | Pacote em uso não é este; sem controle de velocidade |
| 1000170 | UPCC signing id não encontrado |
| 1000171 | V card não é de card pool dinâmico |
| 1000172 | Nenhum pacote atende aos requisitos |
| 1000173 | Sem localização do chip; sem controle de velocidade |
| 1000174 | Usuário não é do canal |
| 1000175 | **Chip não pertence a este canal** |
| 1000176 | Congestionamento de rede |
| 1000177 | Anomalia no OCR |
| 1000178 | Formato da validade do certificado |
| 1000179 | ID expirou |
| 1000180 | Menor de 16 anos |
| 1000201 | thirdOrderId e orderId não podem ser ambos vazios |
| 2000000–2000006 | Falha ao chamar serviço remoto |
| 9000001 | Exceção de banco |
| 9000002 | Exceção de I/O |
| 9000003 | Rede oscilou; conexão falhou |
| 9000004 | **Limite de QPS excedido** |
| 9999999 | Erro de sistema não classificado |

Classificação para o motor (`lib/cmlink.ts`, função `retentavel`):

- **Retentável** (espera crescente): HTTP 429/500/502/503/504, timeout, `1000154`, `1000176`,
  `2000000–2000006`, `9000001–9000004`, `9999999`, `1000008`/`1000009` (renovar token 1×).
- **Definitivo** (falhou, avisar operador): `1000013`, `1000065`, `1000073`, `1000090`,
  `1000103`, `1000117`, `1000162` (já foi — consultar o pedido antes de repetir), `1000163`, o resto.

---

## 12. Perguntas em aberto para o Haoran

(★ = o botão *Testar conexão* / *Consultar ICCID* provavelmente responde sozinho; perguntar só o que sobrar.)

1. ★ Base path `https://gdschannel.cmlink.com:39043/aep/...` confirma? Host/porta de **produção**?
2. ★ `PasswordDigest`: base64 dos **bytes crus** do SHA256 ou do **hex**?
3. Nosso `cooperationMode` (1 ou 2)? Moeda de cobrança? **Como consultar saldo/depósito?**
4. Fluxo eSIM: `createOrder` já ativa quando `serviceUsageMode=1`, ou temos que chamar `activeDataBundle`? Que `mcc` mandar num pacote multi-país?
5. ★ O QR (`smdpAddress`+`activationCode`) existe **antes** da compra do pacote? Pode ser baixado mais de uma vez (`installCount`)? Valores possíveis de `state`?
6. Como recebemos ICCIDs em escala (arquivo? API?) — não há rota de alocação na doc.
7. Callbacks: registram `https://americasim.com.br/v1/webhooks/cmlink`? Assinam com WSSE (nosso appkey) ou é IP fixo deles? O 3.2.17 é enviado para nós?
8. Sandbox: os 3 ICCIDs podem ser reusados (1000117)? `unsubscribe` reseta? Cobra do depósito?
9. ★ `dataBundleId`s disponíveis para teste; limite de QPS.
10. ★ `SBO_query_SIMInfo`, `APP_queryCarrier_SBO` e `APP_getSubscriberAllQuota_SBO` vão **sem `accessToken`** mesmo?
11. ★ Formato real da resposta do `SBO_queryEsimCardInfo` (`cardInfo` ou `data`) e do `getSubscriberAllQuota` (`quotaList` ou direto).

---

## 13. Como isso se mapeia no hub AmericaSim

| Tabela/coluna do hub | O que guarda para CMLink |
|---|---|
| `operadora` (`codigo='cmlink'`, `tipo=chinamobile`, `ambiente`, `base_url`, `config`) | criada pela tela Operadoras; `config.digest`, `config.cooperationMode`, `config.mcc_padrao`, `config.sendLang`, `config.catalogo` (resumo do catálogo sincronizado) |
| `parametro` (`segredo.CMLINK_APPKEY`, `segredo.CMLINK_APPSECRET`) | chaves **cifradas** (lib/segredo-app); a variável de ambiente, se existir, manda |
| `credencial_operadora` | **não usado** por enquanto |
| `operadora_plano` (`variante_id`, `plano_externo`, `custo`, `custo_moeda`, `cobertura`, `dias`, `dados_mb`) | `plano_externo` = `dataBundleId`; `cobertura` = mccs de `cardPools`; custo = `priceInfo` |
| `estoque_esim` (`iccid`, `status='interno'`, `operadora='cmlink'`, `codigo_lpa` cifrado) | **pool de ICCIDs virgens**; ao entregar, recebe o LPA e vai a `entregue` |
| `requisicao_operadora` (`operacao`, `chave_idem`, `requisicao`, `resposta`, `http_status`, `resultado`, `duracao_ms`, `tentativa`) | **toda chamada**, com corpo e resposta completos (accessToken mascarado, sem headers). Retentativa da mesma chave ganha sufixo `#n` |
| `ativacao` (`status`: pendente → provisionando → entregue → instalado → falhou) | `provisionando` enquanto CMLink não confirma; `instalado` no callback 3.2.17 (4/101) |
| `pedido.status = em_provisionamento` | entre o pagamento e a entrega do QR |
| `evento_saida` `tipo='operadora.provisionar'` | gatilho do motor, fora da transação de venda |
| `chave_idem` / `transactionCode` | = número do pedido + item (nunca aleatório); compra manual = `MANUAL-<iccid>-<bundle>-<dia>` |

Telas e rotas do hub: `/painel/operadoras` (chaves, config, testes, compra manual, últimas chamadas),
`/painel/operadoras/cmlink/doc` (esta spec), `/v1/interno/operadora/provisionar` (worker → hub, a fazer),
`/v1/webhooks/cmlink` (callbacks, a fazer).
