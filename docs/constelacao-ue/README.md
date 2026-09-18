# Constelação das Frutas — máquina de distribuição na Europa (ex-Hyak)

Projeto do Ricardo, nascido em 19/08/2026 como **gaveta `hyak`** e renomeado no mesmo dia
para **`constelacao`**. É a prospecção fria multilíngue que vende limão Taiti brasileiro a
atacadistas europeus: e-mail e WhatsApp saindo pelo GoHighLevel, IA respondendo quem
responde, e handoff para gente de verdade quando a conversa vira negociação.

Mora no mesmo projeto Supabase da Máquina de Vendas (`integracao-crm-sankhya`,
`bwbeieumxcuomtrvlqxs`), em **schema separado** — `constelacao`, com RLS ligado e
`anon`/`authenticated` revogados. Não encosta no `public` (Nitron) nem no `teak`.

## Por que ninguém achava "o projeto HYAK WhatsApp"

Porque o nome durou 79 minutos. As duas migrações contam a história:

| migração | quando (UTC) | o que fez |
|---|---|---|
| `hyak_gaveta_estrutura` | 19/08/2026 16:30 | criou o schema `hyak` com `config`, `ghl_contato`, `campanha`, `fila_envio`, `fila_config` |
| `renomear_hyak_para_constelacao` | 19/08/2026 17:49 | `alter schema hyak rename to constelacao` + cadastrou a empresa CONSTELACAO |

Sobrou um fóssil: a edge function **`hyak-contatos-sync`** continua publicada e ativa,
apontando para o schema `hyak`, que não existe mais. Ela é a versão anterior, palavra por
palavra, da atual `constelacao-contatos-sync`. Não é código em uso — é entulho, e está
na lista de pendências.

## Os documentos

| arquivo | o que responde |
|---|---|
| [`00-ponto-de-partida-2026-09-18.md`](00-ponto-de-partida-2026-09-18.md) | **a foto do marco zero**: números, filas, quotas e parâmetros no dia em que assumimos |
| [`01-mecanica.md`](01-mecanica.md) | como a máquina funciona: tabelas, as 13 funções, os 8 crons, o caminho da mensagem |
| [`02-canal-whatsapp-evolution.md`](02-canal-whatsapp-evolution.md) | o canal novo — Evolution no lugar do Zaptos, e o vigia que aprendeu com o tombo do Zaptos |
| [`03-campanhas-idiomas-e-ia.md`](03-campanhas-idiomas-e-ia.md) | as 28 campanhas em 7 idiomas, as ondas, e o que a IA pode e não pode dizer |
| [`04-pendencias-e-riscos.md`](04-pendencias-e-riscos.md) | o que está quebrado, o que está parado e o que precisa de decisão |

## A regra do ponto de partida

**O estado descrito em `00-ponto-de-partida-2026-09-18.md` é o marco zero desta
continuação.** Ele foi medido em 18/09/2026, no projeto em produção, com o Ricardo já
tendo construído tudo o que está aqui. Não é proposta nem plano: é o que existe.

Daqui para a frente:

1. **Nada do que está rodando se mexe sem registro.** Mudou quota, cron, texto de campanha
   ou parâmetro de `config`? Anota aqui, com a data e o motivo. Foi assim que a Máquina de
   Vendas da Nitron deixou de repetir erro.
2. **A fila de WhatsApp está pausada de propósito** (`fila_config#2.pausado=true` +
   `config.pausa_manual='sim'`). Ligar é decisão, não manutenção — leia
   `02-canal-whatsapp-evolution.md` antes.
3. **Continuar ≠ reescrever.** A máquina do Ricardo funciona: 3.061 e-mails entregues,
   935 aberturas, 28 empresas em conversa. O que ela precisa é de versionamento, de
   observabilidade e das decisões da lista de pendências — não de refatoração.
