# Teste da API do Força em modo `"teste": true` — 19/11/2026

Pedido do gestor: *"vasculhe algum cliente que já foi inativo da Nitron e algum que já é cliente
para vermos o que acontece… é um ambiente de teste, não é para gravar nada no força."*

**Nada foi gravado.** Todas as seis chamadas foram com `"teste": true`, que pela seção 5 do
contrato não cadastra cliente, não cria orçamento, não gera link e não consulta crédito. Conferido
depois: nenhuma linha nova em `copiloto_lead`, nenhum protocolo, nenhum pedido.

Função usada: `forca-teste` (v4), isolada de propósito — a `forca-cadastro` roda de 5 em 5 min
abrindo pedido de verdade e está atendendo lead; publicar por cima dela para experimentar seria a
lição de 16/09 outra vez.

## O processo, do começo ao fim

| passo | o que acontece | tempo medido |
|---|---|---|
| 1 | `POST /api/crm/auth` → token Bearer de 60 min | **0,2 s** |
| 2 | `POST /api/crm/orcamento` com `"teste": true` | 4 a 27 s |
| 3 | `GET /api/crm/orcamento/{protocolo}` | **não se aplica** — em modo teste não nasce protocolo, porque nada é criado |

## Os seis casos

| papel | loja | CNPJ | o que eu esperava | **o que a API respondeu** | s |
|---|---|---|---|---|---|
| inativo, 338 d | DMX ATACADISTA (PB) | 09330604000170 | abriria | ✅ **ABRIRIA** · `cadastro: aproveita` | 27,1 |
| ativo, 59 d | CASA TOP MIX (SP) | 34471636000133 | CLIENTE_COM_REPRESENTANTE | ✅ **CLIENTE_COM_REPRESENTANTE** | 4,5 |
| Clube, 59 d | MUNDO DAS MENINAS (SP) | 35675991000197 | CLIENTE_CLUBE | ❌ **CLIENTE_COM_REPRESENTANTE** | 4,1 |
| Clube, 231 d | ARMARINHO MARIA VITORIA (MG) | 15254586000198 | CLIENTE_CLUBE | ✅ **CLIENTE_CLUBE** | 8,9 |
| lead novo | SOFORT-KAUFEN (RJ) | 33254242000160 | abriria | ✅ **ABRIRIA** · `cadastro: cria` | 7,6 |
| lead barrado na IE | ROSELI VERGANI RITTER (SC) | 64738629000116 | ERRO_ERP (IE) | ⚠️ **ABRIRIA** | 8,2 |

## As cinco coisas que o teste ensinou

### 1. A trava NÃO é "tem representante" — é "comprou nos últimos 180 dias"

O DMX ATACADISTA **tem representante no cadastro** (WALDEMAR, codvend 32), e mesmo assim passaria:
parou de comprar há 338 dias. A própria resposta devolve o vendedor dentro de `cliente.vendedor`,
como informação, sem recusar.

**Consequência de negócio, para o gestor decidir:** todo cliente que parou de comprar há mais de
180 dias vira público do canal direto, ainda que o representante continue dono dele no cadastro.
Isso pode ser exatamente o que se quer (reativar quem o rep não está visitando) ou não.

### 2. A ordem das travas importa: representante vem ANTES de Clube

Eu previ `CLIENTE_CLUBE` para a MUNDO DAS MENINAS por ela estar na CODTAB 153, e **errei**: veio
`CLIENTE_COM_REPRESENTANTE`, porque ela comprou há 59 dias e essa regra é avaliada primeiro. A
CODTAB continua mandando na recusa por Clube — só não chega a ser consultada quando a compra
recente já encerrou o caso. Confirmado isolando a variável: o ARMARINHO MARIA VITORIA, Clube e
231 dias sem comprar, aí sim devolveu `CLIENTE_CLUBE`.

### 3. O modo teste NÃO pega o erro da Inscrição Estadual

A ROSELI VERGANI RITTER **falhou de verdade em 17/11** com `ERRO_ERP: Insc. Estadual, deve ser
informada`. Em modo teste ela responde `passaria: true`.

É a ressalva que o próprio contrato escreve — *"o que o teste não garante: a última milha"* — mas
agora medida num caso em que já sabemos a resposta real. **O modo teste não serve para
pré-filtrar MEI e firma individual**, que é justamente o grupo que trava hoje.

### 4. `mix` e `valor` não vêm — e a seção 5 promete os dois

A resposta real traz só `{ cadastro, catalogo: 619 }`. O contrato documenta também `mix` (com que
lista de produtos o orçamento nasceria) e `valor` (total, `percentualCif` e `regiao`).

Testei a hipótese de que faltasse o endereço — sem região não haveria CIF. **Reenviei com
`entrega: {cep, numero}` e continuou sem os dois.** Hipótese descartada; é pendência com o time da
`vendas.nitron.com.br`. São exatamente os campos que serviriam para mostrar o mix e o preço do
lojista antes de abrir qualquer coisa.

### 5. A recusa agora identifica o representante, com contato

`CLIENTE_COM_REPRESENTANTE` e `CLIENTE_CLUBE` voltam com `vendedor`: código, apelido, razão social,
e-mail e telefone. É o que faltava para a etapa "Representante ou Clube" do pipeline deixar de ser
um beco — dá para encaminhar nominalmente.

## O que ficou no ar

Nada do fluxo foi tocado: chaves, crons e funções seguem como em `docs/forca-estado-19-11.md`.
A `forca-teste` v4 continua publicada e é inofensiva por padrão (`"teste": true`). O parâmetro
`?teste=0` existe e é a chamada de verdade — não usar sem ordem explícita.

---

# Adendo: e o cliente que está numa tabela de preço diferente?

Pergunta do gestor. Tem duas metades, e só uma é respondível pelo modo teste.

## Metade 1 — tabela diferente NÃO barra nada

Testados dois clientes na **PV0004 TABELA ESPECIAL RED (CODTAB 13)**, parados há 211 e 212 dias:

| cliente | CNPJ | tabela | resultado |
|---|---|---|---|
| TRES RIOS CASA & MODAS (RJ) | 54535200000178 | 13 ESPECIAL RED | ✅ `passaria: true` · `cadastro: aproveita` |
| MINI PRECO (MG) | 71469951000152 | 13 ESPECIAL RED | ✅ `passaria: true` · `cadastro: aproveita` |

As travas olham **só** duas coisas: compra nos últimos 180 dias e Clube ativo. A tabela do
cadastro não entra na decisão de abrir ou não.

## Metade 2 — mas a tabela dele NÃO é usada no preço

A seção 8 do contrato diz "preço da **tabela do canal**", e isso se confirma na base: medidos
**387 pedidos reais do canal Acelera desde 01/09**, o canal substitui a tabela do cadastro pela
tabela Gestor. O mapeamento observado é **RED × não-RED**, e não tem exceção nos 387:

| tabela que o canal gravou | tabelas de cadastro que caem nela | pedidos |
|---|---|---|
| **194** GESTOR VAREJO | 0 padrão (255) · 153 Clube varejo (9) · 150 padrão SP (6) · 102 FOB Nordeste (5) · 155 Clube atacado (2) · 194 (2) · 200 Amazon (1) | **280** |
| **195** GESTOR RED 194 | 13 ESPECIAL RED (98) · 195 (4) · 159 Clube RED (2) · 165 Clube RED atacado (1) · 83 RED 102 Nordeste (1) · 151 CANINDE RED (1) | **107** |

O par que fecha a regra: **102 (FOB Especial Nordeste) → 194**, mas **83 (RED 102 Especial
Nordeste) → 195**. É a mesma praça; o que muda é o RED.

**O ponto a confirmar com o fiscal/comercial.** O `CLAUDE.md` já registra que a **195 é exatamente
metade da 194** — tabela derivada. Então cliente em cadastro RED tem o pedido gravado numa tabela
de valor absoluto pela metade, enquanto a página de pedido publica `194 / 0,90` para todo mundo.
Isso provavelmente é construção fiscal (a diferença voltando como imposto na nota), **mas eu não
sei o motivo e não vou afirmar que sei**. Se não for, é lojista vendo um preço e sendo faturado
noutro — e é o tipo de erro que só aparece no faturamento.

## O que eu NÃO consigo responder daqui

**Qual preço exato esse lojista veria na tela.** Duas portas, as duas fechadas:

- o modo teste não devolve `valor` (nem `mix`), como já registrado acima;
- os orçamentos do Força **não aparecem nas views liberadas do Sankhya** — procurei os 22 números
  por `NUNOTA` e depois por `CODPARC`, e `AD_VW_COM_PEDIDOS` devolveu zero linhas nas duas. O que
  se vê ali é o pedido depois de virar pedido de venda, não o orçamento em elaboração.

Então: ou eles implementam o `valor` da seção 5, ou só abrindo um pedido de verdade.
