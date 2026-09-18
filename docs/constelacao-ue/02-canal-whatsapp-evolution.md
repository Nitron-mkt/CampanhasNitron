# O canal de WhatsApp — Evolution no lugar do Zaptos

Este é o ponto que fazia o projeto ser chamado de "o novo WhatsApp/Zaptos do GHL". É
literal: a Constelação **não usa o ZaptosWPP**. Usa o **Evolution API**, plugado no GHL
pelo mesmo mecanismo — um provedor externo acoplado ao canal de SMS da subconta.

## Como a mensagem sai

`constelacao-wa-processar` manda para o endpoint de sempre do GHL:

```
POST https://services.leadconnectorhq.com/conversations/messages
{ "type": "SMS", "contactId": "<id>", "message": "<texto>" }
```

**`type: "SMS"`, não `type: "WhatsApp"`.** Quem transforma isso em WhatsApp é o provedor
acoplado à subconta. O e-mail, na mesma função irmã, vai com `type: "Email"` — esse sim é
nativo.

A escolha do provedor está no banco, não no código:

| chave em `constelacao.config` | valor | |
|---|---|---|
| `wa_via` | `evolution_sms` | o que manda hoje |
| `evolution_provider_id` | `6aa320fd652d120992c7a592` | Evolution |
| `zaptos_provider_id` | `6770181745a2e55f83cab3eb` | Zaptos, cadastrado e fora de uso |

Os dois ids convivem de propósito: trocar de provedor é trocar configuração na subconta do
GHL, não reescrever função. **Mas atenção — `wa_via` hoje é documentação, não chave de
comando**: nenhuma das funções lê essa chave para decidir o que fazer. Quem decide por
onde a mensagem sai é o provedor ligado ao canal de SMS no GHL. Se alguém trocar o valor
de `wa_via` esperando que o envio mude, não muda nada.

## O ritmo é deliberadamente lento

| | e-mail | WhatsApp |
|---|---|---|
| quota inicial | — | cresce +15%/dia |
| teto | 200/dia | **40/dia** |
| intervalo entre mensagens | 2s | **8s** |
| lote | até 15 | 2 |
| hoje | 200/dia (no teto) | 37/dia |

Cinco vezes menos volume e quatro vezes mais espaçado que o e-mail. Número novo que
dispara rápido em massa é número que o WhatsApp restringe — a Nitron já pagou essa conta
com a instância "Campanhas Nitron", restrita desde agosto. Aqui a rampa é a prevenção.

## O vigia — a lição do Zaptos, aplicada antes do tombo

`constelacao-wa-saude`, de 14/09, roda a cada 15 minutos e faz o que a Nitron aprendeu a
duras penas: **"aceito pelo GHL" não é "entregue"**.

1. pega os até 15 WhatsApp marcados como enviados nos últimos 45 minutos;
2. consulta cada um em `/conversations/messages/<id>`;
3. conta quantos voltaram `failed` com erro casando `instance|disconnect|500`;
4. se forem 3 ou mais (limiar ajustável na chamada) e a fila ainda não estiver pausada:
   - **pausa** `fila_config#2`;
   - grava `pausa_manual = 'sim'`, o que também **trava o watchdog** de despausar sozinho;
   - **devolve as linhas falhadas para `pendente`**, para reenviar depois — elas não se
     perdem como "enviadas" mentindo;
   - **avisa por e-mail**, não por WhatsApp. Se a instância caiu, o WhatsApp é justamente
     o canal que não pode ser usado para dar o alarme.

A diferença para a Nitron: lá o sinal é o ZaptosWPP escrevendo `[System]: <instância> -
The instance is disconnected.` na conversa, e o `campanhas-enviar` espera ~12s para
conferir. Aqui o sinal é o status `failed` da própria mensagem no GHL, conferido depois,
em lote. Mesma doença, diagnóstico diferente.

## Por que a fila está pausada agora

Em 18/09 o estado é: `fila_config#2.pausado = true`, `config.pausa_manual = 'sim'`,
**último WhatsApp enviado em 14/09** — o mesmo dia em que o vigia foi criado — e **566
linhas pendentes** esperando.

A leitura honesta: a fila foi parada quando a instância caiu, e não voltou. Como
`pausa_manual='sim'`, o cron `constelacao-watchdog` (hora cheia) **não** vai despausar
sozinho — ele só despausa quando essa chave não está em `sim`. É trava proposital, e está
funcionando como projetado.

**Religar exige, nesta ordem:**

1. confirmar no painel do Evolution que a instância está conectada (reparear o QR se for o
   caso) — sem isso, religar só transforma pendente em erro;
2. `update constelacao.config set valor='nao' where chave='pausa_manual';`
3. `update constelacao.fila_config set pausado=false where id=2;`
4. observar a primeira rodada: 2 mensagens, 8s entre elas. Se o vigia pausar de novo em 15
   minutos, a instância não está boa — não insista.

Considere baixar a quota antes de religar: são 566 pendentes e o teto é 40/dia. Retomar no
teto depois de quatro dias parado é exatamente o padrão que faz o WhatsApp restringir um
número.

## O que este canal ainda não tem

- **Nada equivalente ao `instancia_ghl.pausada_em` da Nitron**: a pausa é um booleano em
  `fila_config`, sem histórico. Não dá para responder "quantas vezes a instância caiu este
  mês" — só "está pausada agora".
- **Nenhum registro de qual provedor mandou cada mensagem.** Se o Evolution for trocado,
  as 469 mensagens já enviadas não dizem por onde saíram.
