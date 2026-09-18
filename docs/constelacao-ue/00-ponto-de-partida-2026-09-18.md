# Ponto de partida — 18/09/2026

Foto do projeto no dia em que esta continuação começou, medida direto no banco
(`integracao-crm-sankhya`, schema `constelacao`). Tudo abaixo é estado real de produção,
construído pelo Ricardo entre 19/08 e 14/09. **É contra estes números que qualquer
mudança daqui para a frente se compara.**

## A audiência

**3.777 contatos** espelhados do GHL da Constelação (location `qYB23pk0myfkyNwl6tCm`).

| | |
|---|---|
| com e-mail | 2.680 (71%) |
| com telefone | 3.594 (95%) |

Por idioma — derivado do país do contato, não de campo preenchido:

| idioma | contatos | |
|---|---|---|
| EN | 1.496 | é também o fallback de todo país fora da lista |
| FR | 822 | FR + BE |
| IT | 630 | |
| DE | 426 | DE + AT + CH |
| ES | 320 | |
| NL | 44 | |
| PT | 39 | |

## As filas

**4.253 linhas em `fila_envio`**, desde 21/08:

| canal | estado | linhas | período |
|---|---|---|---|
| email | enviado | **3.061** | 21/08 → 18/09 |
| email | erro | 153 | 24/08 → 16/09 |
| email | pendente | 4 | 18/09 |
| whatsapp | enviado | **469** | 01/09 → **14/09** |
| whatsapp | pendente | **566** | 04/09 → 18/09 |

O WhatsApp parou em 14/09 e tem 566 linhas esperando. Isso é intencional — veja
`02-canal-whatsapp-evolution.md`.

## O que aconteceu com os e-mails

Status devolvido pelo GHL para os 3.061 enviados:

| status | linhas | |
|---|---|---|
| delivered | 1.397 | entregue, não aberto |
| **opened** | **935** | **30,5% dos enviados** |
| (ainda sem status) | 573 | o `refill` refresca 80 por rodada, os mais recentes primeiro |
| failed | 145 | |
| clicked | 9 | |
| sent / pending | 2 | |

Os 153 erros de envio são quase todos a mesma coisa: **151 são
`contact's e-mail is invalid`** — endereço malformado na base do GHL, não falha nossa. O
resto é 1 DND ativo, 1 erro 500, 1 timeout e 1 resposta vazia.

## As conversas

| | |
|---|---|
| mensagens registradas em `atendimento_log` | 1.571 (764 recebidas, 807 enviadas) |
| **empresas que responderam de verdade** | **28** |
| handoffs abertos para humano | 5 (todos já alertados) |
| linhas em `pipe_estado` | 2.520 |
| último registro de conversa | 18/09 (hoje) |

28 empresas em conversa a partir de 935 aberturas. É esse o funil hoje.

## Quotas e ritmo (`fila_config`)

| id | canal | quota/dia | lote | intervalo | pausado | hoje |
|---|---|---|---|---|---|---|
| 1 | e-mail | **200** (teto batido) | 9 | 2s | não | **200/200 — quota esgotada** |
| 2 | whatsapp | **37** | 2 | 8s | **SIM** | 0/37 |

A quota cresce sozinha a cada virada de dia: e-mail +40% até o teto de 200
(`email_ramp_pct` / `email_ramp_max`), WhatsApp +15% até 40 (`wa_ramp_pct` /
`wa_ramp_max`). O e-mail já chegou ao teto; o WhatsApp parou a caminho, em 37.

O lote se recalcula a cada rodada: `quota_dia / 24`, limitado a 15.

## Os 8 crons ativos

| cron | ritmo | o que faz |
|---|---|---|
| `constelacao-fila` | */20 min | processa a fila de e-mail |
| `constelacao-wa` | */30 min | processa a fila de WhatsApp |
| `constelacao-atende` | */10 min | IA responde quem respondeu (máx. 3 por rodada) |
| `constelacao-pipe-sync` | */10 min | move oportunidades no pipeline do GHL |
| `constelacao-refill` | */20 min | refresca aberturas e enfileira os 2º toques |
| `constelacao-alerta` | */5 min | avisa a equipe dos handoffs pendentes |
| `constelacao-wa-saude` | */15 min | vigia a instância do WhatsApp |
| `constelacao-watchdog` | hora cheia (:05) | despausa a fila **se** não houver pausa manual |

## Parâmetros de negócio (`constelacao.config`)

Chaves que mandam no comportamento. Segredos (token do GHL) ficam na mesma tabela,
protegidos por RLS com `anon`/`authenticated` revogados — não são reproduzidos aqui.

| chave | valor hoje | o que governa |
|---|---|---|
| `wa_via` | `evolution_sms` | qual provedor de WhatsApp manda |
| `evolution_provider_id` | `6aa320fd…` | provedor novo (em uso) |
| `zaptos_provider_id` | `6770181745…` | provedor antigo (cadastrado, fora de uso) |
| `pausa_manual` | `sim` | trava o `watchdog`: enquanto for `sim`, nada despausa sozinho |
| `email_ramp_pct` / `email_ramp_max` | 40 / 200 | aquecimento do e-mail |
| `wa_ramp_pct` / `wa_ramp_max` | 15 / 40 | aquecimento do WhatsApp |
| `chegada_dias_ini` / `chegada_dias_fim` | 25 / 29 | a janela de chegada que aparece nas mensagens, contada a partir de hoje |
| `remetente_nome` | Felipe | assina as mensagens e as respostas da IA |
| `remetente_email` | `contato@mail.constelacaodetalentos.com` | domínio de envio |
| `remetente_contacto` | +55 11 97713-7962 | número que a IA usa como referência |
| `alerta_wa_nums` | +5511983776720 | para onde vai o alerta de handoff |
| `alerta_teams_webhook` | (vazio) | canal alternativo de alerta, desligado |
| `pipe_id` + 8 `pipe_stage_*` | — | pipeline e estágios no GHL |
| `cf_*` (9 chaves) | — | ids dos custom fields do GHL |
| `ghl_location`, `ghl_api`, `ghl_token` | — | identidade da subconta |

`chegada` também existe na tabela com o valor fixo `22–26 Sept`, mas **não é ela que sai
na mensagem**: o envio recalcula a janela na hora, a partir de `chegada_dias_ini/fim`.
A chave parada é resíduo.

## O que NÃO existe neste ponto de partida

- **Painel.** Nenhuma tela; o acompanhamento é a função `constelacao-relatorio`, que
  devolve um texto em markdown, e a `constelacao-conversas-dia`, que devolve a lista de
  ações do dia. Ambas só respondem a quem as chama — não há cron entregando isso a ninguém.
- **Código versionado.** As 13 funções vivem só no Supabase; não há cópia em `supabase/functions/`.
- **Migrações do que veio depois de 19/08.** As tabelas `atendido`, `atendimento_log`,
  `humano`, `pipe_estado` e a coluna `fila_envio.status_ghl` foram criadas fora de
  migração. Só existem duas migrações do projeto, as de 19/08.
