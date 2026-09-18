# Mecânica — como a máquina funciona

Duas camadas, como na Máquina de Vendas da Nitron: **o Supabase decide e guarda, o GHL
entrega**. A diferença é que aqui não existe ERP — a fonte de verdade do contato é o
próprio CRM, e o que o Supabase acrescenta é segmentação, ritmo, memória e IA.

## O caminho de uma mensagem

```
GHL (contatos)                     Supabase (schema constelacao)              GHL (entrega)
      │                                      │                                     │
      │  1. constelacao-contatos-sync  ──>  ghl_contato (idioma por país)          │
      │                                      │                                     │
      │                             2. constelacao-enfileirar                      │
      │                                (tag + filtros → fila_envio)                │
      │                                      │                                     │
      │                    3a. constelacao-fila-processar (e-mail, */20)  ────────>│  type: Email
      │                    3b. constelacao-wa-processar  (whatsapp, */30) ────────>│  type: SMS → Evolution
      │                                      │                                     │
      │  4. constelacao-refill / check-opens: lê status do e-mail e enfileira 2º toque
      │                                      │                                     │
      │  5. cliente responde  ──> constelacao-atende (*/10): IA responde  ────────>│
      │                              │                                             │
      │                              ├─ handoff? → humano + constelacao-alerta (*/5)
      │                              └─ senão   → move o pipeline
      │                                      │                                     │
      │  6. constelacao-pipe-sync (*/10): quem recebeu e não respondeu também anda no pipe
```

## As tabelas

| tabela | linhas em 18/09 | papel |
|---|---|---|
| `ghl_contato` | 3.777 | espelho dos contatos do GHL, com `idioma` derivado do país |
| `campanha` | 28 | textos por canal + idioma (`assunto` só no e-mail) |
| `fila_envio` | 4.253 | uma linha por (contato, canal, campanha); estado, tentativas, `status_ghl` |
| `fila_config` | 2 | ritmo: id=1 e-mail, id=2 WhatsApp |
| `config` | 34 chaves | token, ids do GHL, parâmetros de negócio |
| `atendimento_log` | 1.571 | toda mensagem lida e escrita pela IA, com `meta` em jsonb |
| `atendido` | 28 | último inbound já respondido, por conversa — é a trava anti-repetição |
| `humano` | 5 | conversas entregues a gente de verdade, com motivo |
| `pipe_estado` | 2.520 | em que ponto do pipeline cada contato já foi colocado |

Chaves que seguram a máquina:

- `fila_envio` tem índice único em **`(ghl_id, canal, campanha_id)`** — é isso que impede
  mandar a mesma campanha duas vezes para o mesmo contato. Todo `insert` usa
  `on conflict do nothing`.
- `atendido.conversation_id` é primária e guarda `ultimo_inbound_id`: se a mensagem mais
  recente do cliente já foi respondida, a IA pula a conversa. Sem isso, cada rodada de
  10 minutos responderia de novo.
- `pipe_estado.ord` é a ordem do estágio (1 a 8). Nada retrocede: só se move para frente.

## As 13 funções

### Entrada e disparo

| função | cron | o que faz |
|---|---|---|
| `constelacao-contatos-sync` | manual | pagina `/contacts/` do GHL (100 por vez, até 80 páginas), deriva o idioma do país e faz upsert em `ghl_contato`. Aguenta 429 com espera de 2,5s |
| `constelacao-enfileirar` | manual | segmenta por tag (padrão `frutas europa`), opcionalmente por `cliente_citrico` e excluindo um `tipo`; escolhe a campanha `Onda1` do idioma do contato (fallback EN) e cria as linhas da fila |
| `constelacao-fila-processar` | `*/20` | manda os e-mails: vira o dia, sobe a quota, calcula o lote, respeita pausa, substitui as variáveis, registra `ghl_message_id` |
| `constelacao-wa-processar` | `*/30` | o mesmo para WhatsApp, com `fila_config#2` e `type: SMS` |

Os dois processadores tratam erro do mesmo jeito, e vale entender: **429, 5xx ou queda de
rede voltam para `pendente`** com espera crescente (15 min × tentativa, até 5 tentativas);
qualquer outro erro vira `erro` e não se repete. Um e-mail inválido não fica tentando para
sempre — por isso os 151 erros de endereço inválido estão parados, e certos.

Os dois também priorizam o **segundo toque** antes do primeiro: follow-up (`Onda1-FU%`) e
WhatsApp de reforço (`%WA2%`) saem na frente da fila fria.

### Leitura do que aconteceu

| função | cron | o que faz |
|---|---|---|
| `constelacao-check-opens` | manual | varre **todos** os e-mails enviados e grava `status_ghl` (opened/delivered/failed…). É a versão pesada |
| `constelacao-refill` | `*/20` | a versão do dia a dia: refresca só os 80 mais recentes ainda sem status **e** enfileira os 2º toques — FU1 por e-mail e WA2 por WhatsApp — para quem abriu e não respondeu |
| `constelacao-relatorio` | manual | refresca aberturas, faz o refill de WA2 e devolve um resumo em markdown: enviados, aberturas, falhas, filas, quotas e nomes de quem respondeu |
| `constelacao-conversas-dia` | manual | pega quem interagiu nas últimas 24h e devolve a lista de ações do dia, priorizada 🔴🟠⚪, com resumo e próximo passo escritos pela IA |
| `constelacao-dbtest` | manual | diagnóstico: confirma que a função enxerga `SUPABASE_DB_URL` e lê `fila_config` |

### Conversa e passagem para humano

| função | cron | o que faz |
|---|---|---|
| `constelacao-atende` | `*/10` | o coração: busca conversas não lidas no GHL, monta o histórico, chama a IA, responde no mesmo canal e idioma, registra tudo e move o pipeline |
| `constelacao-alerta` | `*/5` | pega os handoffs com `alertado=false` e manda o aviso por WhatsApp para os números da equipe (e Teams, se configurado) |
| `constelacao-pipe-sync` | `*/10` | para quem **recebeu e não respondeu**: garante que existe oportunidade no pipeline e a coloca no estágio certo (2 = abordado, 3 = follow-up) |

### O fóssil

| função | situação |
|---|---|
| `hyak-contatos-sync` | ativa, publicada, apontando para o schema `hyak` que não existe mais desde 19/08. É a versão anterior da `constelacao-contatos-sync`. Nenhum cron a chama |

## Filtros que a IA nunca vê

Três exclusões estão no código, não em configuração — quem for mexer precisa saber:

1. **`ricardo@hyak.com.br` e `nicoletti.ricardo@gmail.com`** estão cravados em
   `constelacao-atende`, `constelacao-refill` e `constelacao-relatorio`: a IA não responde
   ao próprio dono, e o refill não o enfileira. É o equivalente aqui do contato de teste
   que saiu caro na Nitron — só que resolvido no fonte, o que significa que **acrescentar
   uma pessoa da casa exige deploy**.
2. **Auto-resposta é detectada por expressão regular** em 8 idiomas ("out of office",
   "risposta automatica", "réponse automatique", "férias"…). Quem cai nela vai para
   `humano` com o motivo `auto-resposta (ignorar)` e nunca mais é atendido pela IA.
3. **O próprio número do remetente** é excluído na hora de garimpar telefone no corpo do
   e-mail — senão a IA cadastraria o nosso número como sendo o do cliente.

## A ponte e-mail → WhatsApp

Detalhe fácil de perder e que muda o resultado: quando alguém responde **por e-mail** e não
é handoff, a `constelacao-atende` procura um telefone no corpo da resposta (e, se não
achar, usa o do cadastro). Achando, e se nunca tivermos mandado WhatsApp para esse
contato, ela:

1. grava o telefone no contato do GHL, se o cadastro estava vazio;
2. manda **uma** mensagem de ponte ("sigo por aqui no WhatsApp que é mais rápido");
3. registra no log para nunca repetir.

É como uma conversa de e-mail vira conversa de WhatsApp sem ninguém pedir. Com a fila de
WhatsApp pausada, **essa ponte continua saindo** — ela não passa por `fila_envio`.

## Onde este projeto encosta nos outros

- **`hyak-limao-mercado`** (`yreiygrcgktqowjccdmp`): a `constelacao-atende` chama
  `POST /functions/v1/preco-cotacao` desse projeto a cada rodada para saber o preço por
  calibre em EUR/caixa. É a mesma base que alimenta o painel de mercado de limão. **Se
  aquele projeto cair, a IA responde sem tabela de preço** — e o prompt manda usar só o
  que foi dado, então ela simplesmente não cota.
- **`public` (Nitron)**: só a linha `CONSTELACAO` na tabela `empresa`. Nenhuma função da
  Nitron lê o schema `constelacao`, e nenhuma função da Constelação lê o `public`.
