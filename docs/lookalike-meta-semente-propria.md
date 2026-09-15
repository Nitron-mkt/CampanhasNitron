# Lookalike no Meta a partir da base própria

Apurado em 14/09/2026. Guarda a regra da semente para que qualquer sessão refaça a conta
sem redescobrir de onde vem cada número.

## Por que a base própria, e não uma lista raspada

O pedido original era raspar perfis com e-mail publicado e subir como Público Personalizado.
Dois problemas mataram o caminho:

- **Termos de Públicos Personalizados.** Ao criar o público você declara ter direito de uso
  sobre os dados. Lista raspada do Instagram não passa nesse teste — e seria raspar a Meta
  para subir na Meta, no mesmo Business Manager (`439416517198642`) que carrega 8 contas ativas.
- **Semente fraca.** `contato@`, `vendas@`, `comercial@` quase nunca são o e-mail de login do
  Facebook de uma pessoa. A taxa de correspondência despenca e o lookalike sai ruim.

A base própria não tem nenhum dos dois problemas, e é maior do que parecia.

## O achado

A conta **NITRON** (`act_434365544371468`, BRL) tinha **46 públicos e nenhuma lista de clientes** —
só engajamento de vídeo, pixel e página. A carteira nunca foi usada como semente.

## A semente

| | |
|---|---|
| E-mails únicos de clientes | 5.655 |
| Desses, com telefone válido em E.164 | 5.423 |
| Com `faturamento_12m > 0` (lookalike por valor) | 1.704 — R$ 55,3 mi |

Fonte: `ghl_contato` × `contato_enriquecido` por `codparc`. Telefone entra junto do e-mail porque
**eleva bastante a correspondência no Brasil** — vale as duas colunas por linha.

O hash é feito **no Postgres**, com `pgcrypto`: o PII não trafega em texto puro até a Meta. O
endpoint aceita SHA-256 hex de 64 caracteres direto (valores já hasheados passam sem alteração).

### Normalização — a parte que erra fácil

- **E-mail:** `lower(trim())`. Descarta o que não casa `%@%.%`.
- **Telefone:** só dígitos. `10` ou `11` dígitos é número nacional, recebe o prefixo `55`;
  `12` ou `13` já começando em `55` fica como está. Qualquer outro comprimento vira coluna
  vazia (`''`), que o endpoint aceita numa linha de múltiplas chaves.
- **Dedup por e-mail**, mantendo o `codparc` de maior faturamento quando o mesmo e-mail
  aparece em mais de um cliente.

## A consulta

```sql
with base as (
  select g.codparc, lower(trim(g.email)) as email,
         regexp_replace(coalesce(g.fone,''),'\D','','g') as fd,
         ce.faturamento_12m
  from ghl_contato g
  join contato_enriquecido ce on ce.codparc = g.codparc
  where nullif(trim(g.email),'') is not null and g.email like '%@%.%'
), norm as (
  select codparc, email, faturamento_12m,
    case when length(fd) in (10,11) then '55'||fd
         when length(fd) in (12,13) and left(fd,2)='55' then fd end as fone
  from base
), dedup as (
  select distinct on (email) email, fone, codparc, faturamento_12m
  from norm order by email, faturamento_12m desc nulls last
)
select encode(digest(email,'sha256'),'hex') as email_sha256,
       coalesce(encode(digest(fone,'sha256'),'hex'),'') as phone_sha256,
       faturamento_12m            -- LOOKALIKE_VALUE, só no público por valor
from dedup
order by email
limit 500 offset 0;               -- paginar em lotes de 500 para o upload
```

## Dois públicos, não um

| público | subtipo | linhas | esquema do upload |
|---|---|---|---|
| Nitron — Clientes base própria | `CUSTOM`, `USER_PROVIDED_ONLY`, 180 dias | 5.655 | `EMAIL`, `PHONE` |
| Nitron — Clientes por valor (faturamento 12m) | `CUSTOM`, `is_value_based=true` | 1.704 | `EMAIL`, `PHONE`, `LOOKALIKE_VALUE` |

Depois de povoados, cada um origina um lookalike (`subtype=LOOKALIKE`, `lookalike_ratio=0.01`).
O ponderado por valor é o mais forte para distribuidor: ensina o modelo a procurar quem compra
muito, não só quem compra.

## O que trava hoje

Criar qualquer um dos dois exige **aceite de termos no navegador**, por um admin da conta NITRON.
A API recusa com `subcode 1870090` (lista de clientes) e `1870092` (público por valor) até lá:

- https://business.facebook.com/ads/manage/customaudiences/tos/?act=434365544371468
- https://www.facebook.com/customaudiences/value_based/tos/?act=434365544371468

Aceite uma vez, vale para a conta. Cuidado com o perfil logado no navegador: a página abre em
qualquer um, mas o aceite grava na conta do perfil ativo.
