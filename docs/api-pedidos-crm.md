# API de orçamento do CRM — guia para a Nina

Como o CRM pede um orçamento à Nitron pelo CNPJ e recebe de volta o **link** do pedido para
mandar ao cliente. O cliente abre o link, ajusta o que quiser e envia o pedido — nada volta
para o CRM depois disso.

- **Base:** `https://vendas.nitron.com.br`
- **Formato:** JSON em tudo (`Content-Type: application/json`)
- **Autenticação:** token Bearer, válido por **60 minutos**

---

## 1. Autenticar

```
POST /api/crm/auth
Content-Type: application/json

{
  "client_id": "crm-nitron",
  "client_secret": "<o segredo entregue à parte>"
}
```

**Resposta 200**

```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

O token vale 60 minutos. Reaproveite o mesmo token enquanto durar; peça outro quando a chamada
responder `401 TOKEN_EXPIRADO`.

**Erros**

| HTTP | erro | quando |
|---|---|---|
| 401 | `NAO_AUTORIZADO` | client_id ou client_secret errado, ou integração desativada |
| 429 | `BLOQUEADO` | 5 tentativas erradas em 1 minuto. Espere 15 minutos |

---

## 2. Pedir o orçamento

Esta é a chamada **de verdade**: cadastra o cliente, cria o orçamento e devolve o link. Para só
experimentar, sem gravar nada, veja a **seção 5** (`"teste": true`).

```
POST /api/crm/orcamento
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "cnpj": "02764037000111",
  "contato": "Juliana Matos",
  "email": "juliana@lojaexemplo.com.br",
  "whatsapp": "11981014565"
}
```

### Campos

| campo | obrigatório | regra |
|---|---|---|
| `cnpj` | sim | 14 números. Pontuação é aceita e ignorada |
| `contato` | sim | nome de quem compra, 2 a 100 caracteres |
| `email` | sim | e-mail válido, até 100 caracteres |
| `whatsapp` | sim | 10 a 13 números, com DDD |
| `entrega` | não | só quando a entrega **não** é no endereço da Receita |
| `entrega.cep` | — | 8 números, e o CEP precisa existir no cadastro da Nitron |
| `entrega.numero` | — | até 10 caracteres |
| `entrega.complemento` | — | até 30 caracteres |
| `itens` | não | até 300 produtos. Sem itens, o orçamento nasce com a cesta do ramo do cliente |
| `itens[].referencia` | — | referência do produto (a que está no catálogo), até 30 caracteres |
| `itens[].pacotes` | — | inteiro de 1 a 9999 |

### Exemplo com entrega e itens

```json
{
  "cnpj": "02.764.037/0001-11",
  "contato": "Juliana Matos",
  "email": "juliana@lojaexemplo.com.br",
  "whatsapp": "11981014565",
  "entrega": { "cep": "04040031", "numero": "1445", "complemento": "sala 2" },
  "itens": [
    { "referencia": "153.012.546", "pacotes": 3 },
    { "referencia": "013.050.003", "pacotes": 1 }
  ]
}
```

### Resposta — sempre HTTP 202

O caminho leva cerca de **um minuto** (cadastro do cliente na Receita, consulta à SEFAZ,
orçamento e itens). O POST devolve o que já estiver pronto:

**ainda processando**

```json
{ "protocolo": "ORC-A8KKRA7Y", "status": "processando" }
```

**já pronto** (acontece com cliente que já existe)

```json
{
  "protocolo": "ORC-A8KKRA7Y",
  "status": "pronto",
  "pedido": 1711559,
  "link": "https://vendas.nitron.com.br/link/18e79a5d12a50a6e1914b94d6382a55c",
  "validade": "2026-11-23",
  "situacao": "Elaboração Cliente",
  "pagamento": null,
  "confirmado": false
}
```

Os campos estão explicados na seção 3, que devolve exatamente a mesma coisa.

**Leia sempre o campo `status`, não o código HTTP** — o POST responde 202 nos dois casos.

### Erros do POST

| HTTP | erro | quando |
|---|---|---|
| 400 | `DADOS_INVALIDOS` | algum campo fora da regra. A mensagem diz qual |
| 401 | `NAO_AUTORIZADO` / `TOKEN_EXPIRADO` | token ausente, inválido ou vencido |
| 429 | `LIMITE_EXCEDIDO` | mais de 30 chamadas por minuto |
| 500 | `ERRO_INTERNO` | falha na Nitron. Tente de novo em alguns minutos |

---

## 3. Consultar o protocolo

Enquanto o status for `processando`, consulte o protocolo. Cada consulta também **empurra** o
processamento, então consultar é o que faz o caminho andar.

```
GET /api/crm/orcamento/ORC-A8KKRA7Y
Authorization: Bearer <access_token>
```

**Ritmo sugerido:** primeira consulta ~10 segundos depois do POST, depois a cada 10 segundos.
A resposta pode demorar até 60 segundos, porque ela trabalha enquanto responde — use timeout de
pelo menos 120 segundos.

**Resposta — pronto**

```json
{
  "protocolo": "ORC-A8KKRA7Y",
  "status": "pronto",
  "pedido": 1711559,
  "link": "https://vendas.nitron.com.br/link/18e79a5d12a50a6e1914b94d6382a55c",
  "validade": "2026-11-23"
}
```

- `pedido` — número do orçamento no ERP da Nitron
- `link` — é isto que vai para o cliente
- `validade` — o link expira nesta data (7 dias)
- `situacao` — em que pé está o pedido **agora**. Consultando o mesmo protocolo dias depois,
  ela acompanha: `Elaboração Cliente` enquanto ele monta, `Aguardando PIX` ou `Aguardando
  Cartão` depois de fechado, `Aprovado`, `Faturado`, `Entregue`
- `pagamento` — o que falta pagar: `PIX`, `CARTAO` ou `null`
- `confirmado` — `true` quando o pagamento entrou e o pedido foi confirmado no ERP

**Resposta — erro**

```json
{
  "protocolo": "ORC-A8KKRA7Y",
  "status": "erro",
  "erro": "CLIENTE_COM_REPRESENTANTE",
  "resolve": "encerrado",
  "mensagem": "Direcione o lead para o representante que já atende este cliente - o nome e o contato dele vêm em `vendedor`.",
  "detalhe": "Este cliente já é atendido por um representante da Nitron.",
  "etapa": "cliente",
  "vendedor": {
    "codigo": 23,
    "apelido": "Milton",
    "nome": "MILTON DA SILVA",
    "email": "milton@nitron.com.br",
    "telefone": "11988887777"
  }
}
```

- `resolve` — **de quem é a vez**. É por ele que a automação decide o que fazer:

  | resolve | o que significa |
  |---|---|
  | `corrigir` | o dado veio na sua chamada. Arrume e mande de novo |
  | `nitron` | é cadastro, regra ou indisponibilidade nossa. **Reenviar não resolve** |
  | `encerrado` | recusa de propósito: o cliente já é atendido. Não reenvie |

- `mensagem` — frase pronta, para quem atende repassar ao cliente
- `detalhe` — o texto cru, nosso, para investigar. Não mostre ao cliente
- `etapa` — onde parou: `cliente`, `cadastro`, `contato`, `orcamento`, `itens`, `link`
- `vendedor` — só quando o cliente já é atendido por uma pessoa: é para ele que o lead vai

| HTTP | erro | quando |
|---|---|---|
| 404 | `PROTOCOLO_NAO_ENCONTRADO` | protocolo inexistente ou de outra integração |

---

## 4. Os três finais possíveis

| status | o que fazer |
|---|---|
| `processando` | consultar de novo em ~10 segundos |
| `pronto` | mandar o `link` ao cliente |
| `erro` | mostrar a `mensagem` a quem atende e decidir pelo `resolve` |

### Erros de negócio (vêm em `status: "erro"`)

| erro | resolve | significado |
|---|---|---|
| `CNPJ_NAO_ENCONTRADO` | corrigir | CNPJ não existe na Receita Federal |
| `CNPJ_INATIVO` | corrigir | CNPJ não está ativo na Receita Federal |
| `CEP_NAO_ENCONTRADO` | corrigir | o CEP de entrega não está no cadastro da Nitron |
| `ITEM_INVALIDO` | corrigir | referência inexistente ou fora de linha. O `detalhe` lista quais |
| `CLIENTE_CLUBE` | encerrado | cliente tem Clube Nitron ativo. Vem com o `vendedor` |
| `CLIENTE_COM_REPRESENTANTE` | encerrado | comprou nos últimos 180 dias com um representante. Vem com o `vendedor` |
| `CADASTRO_RECUSADO` | nitron | cadastro inativo, CNPJ em mais de um cadastro, ou cadastro incompleto |
| `ORCAMENTO_RECUSADO` | nitron | o ERP não concluiu o orçamento ou os itens no tempo esperado |
| `ERRO_ERP` | nitron | regra do ERP recusou. O texto dele vem em `detalhe` |
| `ERRO_INTERNO` | nitron | falha nossa. Dá para tentar de novo em alguns minutos |

Decida pelo `resolve`, não pelo `erro`: o `resolve` é a regra e o `erro` é o detalhe. Se um
código novo aparecer um dia, o `resolve` continua dizendo o que fazer com o lead.

---

## 5. Testar sem criar nada

Mande o mesmo corpo com **`"teste": true`**. A resposta diz o que aconteceria e **nada é
gravado**: não cadastra cliente, não cria orçamento, não gera link e não consulta crédito.

```
POST /api/crm/orcamento
Authorization: Bearer <access_token>

{ "teste": true, "cnpj": "12345678000190", "contato": "Ana",
  "email": "ana@loja.com.br", "whatsapp": "11999998888",
  "entrega": { "cep": "01310100", "numero": "100" },
  "itens": [ { "referencia": "135.024.001", "pacotes": 1 } ] }
```

**Passaria:**

```json
{
  "teste": true,
  "passaria": true,
  "problemas": [],
  "cliente": { "codparc": 0, "nome": "LOJA DA ANA LTDA", "novo": true },
  "aconteceria": {
    "cadastro": "cria",
    "mix": { "codigo": 999, "ramo": "Serviços / Institucional", "itens": 56, "padrao": true },
    "catalogo": 619,
    "valor": { "total": 8755.27, "percentualCif": 9, "regiao": "PR - Demais Cidades" }
  }
}
```

- `cadastro` — `cria` (cliente novo) ou `aproveita` (já é cliente da Nitron)
- `mix` — com que lista de produtos o orçamento nasceria. `padrao: true` quer dizer que o CNAE
  do cliente não tem mix próprio e caiu no genérico
- `catalogo` — quantos produtos ele veria na loja, para escolher além do mix
- `valor` — quanto o orçamento valeria, já com o frete da região dele

**Não passaria:**

```json
{
  "teste": true,
  "passaria": false,
  "problemas": [
    { "erro": "CNPJ_NAO_ENCONTRADO", "resolve": "corrigir",
      "mensagem": "Este CNPJ não existe na Receita Federal. Confirme o número com o cliente e envie de novo." }
  ],
  "cliente": { "codparc": 0, "nome": "", "novo": true }
}
```

Cada item de `problemas` tem o mesmo formato da recusa de verdade — `erro`, `resolve`,
`mensagem` —, e todos os problemas vêm de uma vez, não um por vez.

**O que o teste não garante:** a última milha. Uma regra do ERP que só aparece na hora de gravar
pode recusar mesmo depois de um `passaria: true` — por isso o campo chama `passaria`, não
"vai passar".

---

## 6. Exemplo completo (curl)

```bash
# 1. autenticar
TOKEN=$(curl -s -X POST https://vendas.nitron.com.br/api/crm/auth \
  -H 'Content-Type: application/json' \
  -d '{"client_id":"crm-nitron","client_secret":"<segredo>"}' \
  | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p')

# 2. pedir o orcamento
curl -s -X POST https://vendas.nitron.com.br/api/crm/orcamento \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"cnpj":"02764037000111","contato":"Juliana Matos",
       "email":"juliana@lojaexemplo.com.br","whatsapp":"11981014565"}'

# 3. consultar ate ficar pronto
curl -s https://vendas.nitron.com.br/api/crm/orcamento/ORC-A8KKRA7Y \
  -H "Authorization: Bearer $TOKEN"
```

---

## 7. Regras de uso

- **Um pedido por vez, por CNPJ.** Enquanto houver protocolo em andamento para o mesmo CNPJ, o
  POST devolve o protocolo existente em vez de abrir outro.
- **O mesmo CNPJ com link ainda válido** recebe o link já existente, com o pedido que o cliente
  está montando — não nasce um pedido novo a cada chamada.
- **30 chamadas por minuto** por integração, somando POST e GET.
- **O token vale 60 minutos.** Renove quando vier `TOKEN_EXPIRADO`.
- **O CRM não acompanha o pedido depois do link.** O cliente conclui pelo link e a Nitron segue
  daí: conferência, liberação e faturamento.

---

## 8. O que o cliente vê no link

- O orçamento já montado, com a cesta do ramo dele quando o CRM não manda itens.
- Preço da tabela do canal, com o frete CIF da região já embutido.
- **Acima de R$ 5.000 em produtos, 10% de desconto em cada item.** Abaixo disso, preço cheio.
- A venda mínima da região dele, que libera o envio.
- Pagamento à vista: PIX ou cartão.

O cliente ajusta quantidades, tira ou acrescenta produtos e envia. O pedido entra na Nitron como
qualquer outro.
