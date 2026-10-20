# Resultado das campanhas — 10/09 a 20/10/2026 (41 dias)

Varredura pedida pelo gestor em 20/10. Tudo aqui foi medido, e cada numero diz de onde saiu.
Onde nao da para saber, esta escrito que nao da.

## Como foi medido

| pergunta | fonte | como |
|---|---|---|
| quantos leads | `copiloto_lead` | toda linha criada no periodo |
| quantos repassados | `copiloto_lead.repasse_em` + `repasse_tipo` | `fisica` = representante, `online` = venda interna |
| quantos fecharam | Sankhya | os 179 CNPJs informados pelos leads, cruzados com `AD_VW_COM_CADCLIENTES`, `AD_VW_COM_VENDAS` e `AD_VW_COM_PEDIDOS_PEND` |
| quanto custou | Meta, conta `434365544371468` | `amount_spent` por campanha no periodo |

O cruzamento com o Sankhya foi feito por **CNPJ exato E por raiz de 8 digitos**, para pegar o
caso de o lead informar o CNPJ de uma loja e comprar por outra do mesmo grupo. Nenhuma filial
extra apareceu: os 21 casamentos sao todos exatos.

## O funil

| etapa | quantos | % dos leads |
|---|---|---|
| Leads que entraram | **465** | 100% |
| Informaram CNPJ | 179 | 38% |
| **Repassados** | **147** | 32% |
| → a representante (`fisica`) | 87 | 19% |
| → a venda interna (`online`) | 60 | 13% |
| Ficaram frios | 286 | 61% |
| Descartados | 23 | 5% |
| Ainda qualificando | 6 | 1% |
| **Compraram** | **1** | **0,22%** |

Por mes: setembro 295 leads (97 repassados), outubro ate o dia 20 — 170 leads (50 repassados).

## O que o Sankhya diz dos 179 CNPJs

- **21 existem no cadastro.**
- **13 ja eram clientes antes da campanha** — cadastros de 2019-08 a 2025-11. Nao sao lead novo:
  sao cliente nosso que entrou pelo anuncio.
- **8 foram cadastrados durante a campanha** (11/09 a 13/10).
- **1 comprou.** `MERCADO TICA`, codparc 223845, Carapicuiba/SP, CNPJ 68.917.926/0001-80.
  Nota 12921 de **15/10/2026, R$ 3.547,51** (PIX antecipado c/ 2% desc), faturada pela **MONICA**.
  E o lead **182** ("Berlim Marseille", 24/09), que foi repassado em 25/09 para a representante
  **LUCIANA MITIE** (`fisica`). Ou seja: foi para o representante e quem faturou foi a venda
  interna.
- **0 pedidos em aberto.** Nenhum dos 21 tem pedido digitado esperando faturamento — entao nao ha
  venda escondida na fila de liberacao.

## Uma segunda venda que NAO da para atribuir

`MEDCENTER - UNIDADE CIRURGICA LTDA`, Santos/SP, codparc 223944, cadastrada pela **MONICA em
30/09**, nota 12895 de **13/10, R$ 2.569,48**. **O CNPJ dela (00.034.534/0001-39) nao bate com
nenhum lead.**

Achei procurando o contrario: todos os clientes novos que a MONICA cadastrou desde 10/09 — sao
**12**, e so 3 deles estao na nossa lista de leads. Os outros 9 ou sao lead de quem a Nina nunca
apurou o CNPJ, ou sao prospeccao da propria MONICA. **Nao da para saber qual**, e por isso esta
venda nao entra na conta. Fica registrada porque mostra que a atribuicao por CNPJ **subestima**:
62% dos leads nunca informaram CNPJ.

## O "comprou" do feedback e falso

A regua de feedback marcou **1 lead como `comprou`**: o lead 3, Kasamais (Sao Luis/MA, rep CASSIO).
O que o cliente escreveu foi:

> "Já estou elaborando pedidos com a representante"

Isso e **preparando pedido**, nao comprou. E o CNPJ dele (47.258.455/0001-75) **nao esta no
cadastro do Sankhya** e nao tem nenhuma venda, 40 dias depois. O classificador
(`classificar()` do `copiloto-feedback`) leu "pedidos" e concluiu venda.

**Consequencia:** o unico indicador de venda que temos dentro de casa esta errado para mais. Quem
olhar so o `feedback_resultado` vai contar uma venda que nao existe, e perder a que existe
(MERCADO TICA, cujo feedback esta vazio).

## 18 clientes disseram que ninguem falou com eles

Dos 87 que foram a representante, 43 responderam a pergunta do 2º dia:

| resposta | quantos | % dos que responderam |
|---|---|---|
| `nao_atendido` — ninguem me procurou | **18** | 42% |
| `indefinido` | 11 | 26% |
| `sem_resposta` | 8 | 19% |
| `atendido` | 5 | 12% |
| `comprou` (falso, acima) | 1 | 2% |

44 dos 87 nao foram nem perguntados — a fila do `copiloto-feedback` processa do mais antigo para
o mais novo com teto de 20 por rodada, chumbado em `Math.min(cfg.feedback_limite, 20)`.

## Medimos o lado errado

| | repassados | tem regua de feedback | vendas |
|---|---|---|---|
| representante (`fisica`) | 87 | **sim** | 0 |
| venda interna (`online`) | 60 | **nao** (`feedback_tipos='fisica'`) | 1 atribuida + 1 provavel |

A regra de so perguntar a quem foi para representante tinha uma razao boa — a conversa da venda
interna acontece nas nossas instancias e da para ler no CRM. Mas ninguem le: **os 60 da venda
interna nao tem nenhum numero**, e e de la que sai a venda.

## Dinheiro

| | |
|---|---|
| Meta, 01/09 a 20/10 | **R$ 1.797,76** (set R$ 1.196,26 + out R$ 601,50) |
| Conversas iniciadas (Meta, 7d) | 384 |
| Leads gravados no CRM | 465 |
| Custo por lead gravado | **R$ 3,87** |
| Receita atribuida | **R$ 3.547,51** (1 nota) |
| Retorno bruto | **1,97x** — em RECEITA, nao em margem |

Duas campanhas respondem por todo o gasto:

| campanha | gasto | impressoes | cliques | conversas |
|---|---|---|---|---|
| Engajamento — Video Dan Varejo — Whatsapp | R$ 1.344,33 | 37.847 | 627 | 341 |
| Trafego — Video Dan — WhatsApp Nina | R$ 453,43 | 8.688 | 87 | 43 |

**As duas estao PAUSADAS.** E o lead secou junto, no mesmo dia:

| periodo | leads/dia |
|---|---|
| 05 a 13/10 | 11,2 |
| 14 a 19/10 | 2,0 |

14/10 nao teve **nenhum** lead. Nao e sazonalidade: e a torneira fechada.

## O que isto NAO mede

1. **62% dos leads (286) nunca informaram CNPJ.** Se um deles comprou, nao aparece aqui. O caso
   MEDCENTER mostra que isso acontece.
2. **`copiloto_lead.origem` nao identifica campanha.** 429 dos 465 estao como `WhatsApp`, que e o
   que o GHL escreve por padrao e nao diz nada. A ligacao com o Meta e por **janela de tempo e
   volume** (as conversas do Meta, 384, contra os 465 gravados), nao por identificador.
3. **Nao ha pixel de conversao.** Nem na landing do Google, nem no pedido. Atribuicao
   envio -> pedido continua sem existir (pendencia 4 do CLAUDE.md).
