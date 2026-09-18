# Campanhas, idiomas e o que a IA pode dizer

## As 28 campanhas

Quatro nomes × dois canais × sete idiomas, ativos todos:

| nome | canal | idiomas | papel |
|---|---|---|---|
| `Onda1` | email | EN, NL, DE, FR, ES, IT, PT | a abordagem fria (~700–760 caracteres) |
| `Onda1-FU1` | email | os mesmos 7 | follow-up de quem **abriu** e não respondeu (~400–440) |
| `Onda1` | whatsapp | os mesmos 7 | abordagem fria por WhatsApp (~350–400) |
| `Onda1-WA2` | whatsapp | os mesmos 7 | reforço para quem abriu o e-mail e tem telefone (~330–390) |

O texto é o mesmo argumento em todos os idiomas: produtor-exportador brasileiro de limão
Taiti (Persian lime), abastecendo atacadistas na Europa direto, com entrega semanal, e a
pergunta de fechamento sobre calibre e paletes. Não é tradução automática na hora de
enviar — são 28 textos escritos e guardados.

### O idioma vem do país, e o fallback é inglês

```
NL          → NL
DE, AT, CH  → DE
FR, BE      → FR
ES → ES     IT → IT     PT → PT
qualquer outro / vazio → EN
```

Consequência prática: um contato belga francófono e um flamengo recebem os dois em
francês; um suíço italiano recebe em alemão. Com 44 contatos NL e 822 FR na base, a regra
paga o que custa — mas é uma regra de país, não de idioma, e um dia vai errar com alguém.

### Variáveis nos textos

`{{empresa}}`, `{{remetente_nome}}`, `{{remetente_contacto}}`, `{{remetente_email}}`,
`{{remetente_site}}` e `{{chegada}}`.

**`{{chegada}}` não sai da tabela.** É calculado no momento do envio:
`hoje + chegada_dias_ini` a `hoje + chegada_dias_fim` (25 a 29 dias), formatado como
`23 Oct – 27 Oct`. A mensagem nunca envelhece sozinha — mudar a janela é um `update` em
duas chaves de `config`, sem deploy e sem reescrever 28 textos.

`{{remetente_site}}` está **vazio** hoje: onde o texto usa a variável, sai um buraco.

## As ondas — quem recebe o quê, e quando

```
enfileirar (tag "frutas europa")
        │
        ▼
   Onda1 e-mail ──── abriu? ──não──> fim da linha (fica em delivered)
        │                 │
        │                 └──sim──> Onda1-FU1 (e-mail)  +  Onda1-WA2 (WhatsApp, se tiver fone)
        ▼
   respondeu ──> constelacao-atende assume a conversa
```

O gatilho do segundo toque é **abertura**, não tempo: `constelacao-refill` procura
`status_ghl='opened'` e enfileira FU1 e WA2 de uma vez, para quem ainda não respondeu. Quem
já respondeu nunca recebe follow-up — a condição `not exists (atendimento_log com direcao='in')`
está nas duas consultas.

Os dois processadores põem o segundo toque **na frente** da fila fria. Quem demonstrou
interesse é atendido antes de quem nunca ouviu falar da gente.

## A IA que responde — `constelacao-atende`

Modelo **claude-sonnet-5**, chamado direto na API da Anthropic (`ANTHROPIC_API_KEY` no
ambiente das funções). Ela escreve como **"o Felipe, da Constelação das Frutas"**, e o
prompt é curto e severo:

**Pode:**
- responder sempre no idioma do cliente (o do cadastro, ou o que o cliente usou);
- WhatsApp em 2 a 5 frases, e-mail curto;
- dar preço por calibre, em EUR/caixa, **só** da tabela que recebe do `preco-cotacao` do
  projeto `hyak-limao-mercado`, e com confiança ("Calibre 48: 7,00 EUR/caixa");
- pedir o próximo passo concreto: calibre + paletes por semana;
- assinar "Felipe — Constelação das Frutas".

**Não pode:**
- explicar como o preço é calculado; mencionar Tricop, "mercado", percentagens, médias ou
  mínimos — a lógica de precificação não sai de casa;
- dar previsão de chegada por iniciativa própria (só se perguntarem);
- negociar desconto, prazo, contrato ou logística;
- fechar pedido;
- inventar condição.

**Handoff obrigatório** — a IA abre a resposta com a etiqueta `[[HUMANO:motivo]]`, que o
código tira do texto antes de enviar, quando o cliente: quer negociar ou fechar; é conta
grande, rede ou importador direto; pede falar com pessoa ou ligação; reclama. Aí a
conversa entra em `humano`, a oportunidade vai para o estágio de **negociação** e o
`constelacao-alerta` avisa a equipe em até 5 minutos.

Uma vez em `humano`, **a IA não volta a responder aquela conversa** — nem depois do
handoff resolvido. Não existe hoje um jeito de devolver a conversa para a IA a não ser
apagando a linha.

### O movimento no pipeline

Oito estágios, com ordem — nada retrocede:

| ord | estágio | quem coloca |
|---|---|---|
| 1 | novo | — |
| 2 | abordado | `pipe-sync`, ao receber `Onda1` |
| 3 | follow-up | `pipe-sync`, ao receber `Onda1-FU%` |
| 4 | respondeu | `atende`, resposta sem cotação |
| 5 | qualificado | — |
| 6 | cotação | `atende`, quando a resposta menciona €, calibre ou valor |
| 7 | negociação | `atende`, no handoff |
| 8 | ganho | manual |

Os estágios 1 e 5 não são escritos por nenhuma função, e o 8 nunca é marcado
automaticamente: **o funil não sabe dizer se algum negócio fechou.** Isso é decisão de
produto, não bug — mas é a razão de não existir taxa de conversão neste projeto.

## A revisão do dia — `constelacao-conversas-dia`

Pega quem interagiu nas últimas 24h (até 30 contatos, ignorando auto-respostas), manda até
12 mensagens de cada conversa para a IA e recebe de volta JSON com `resumo`, `acao` e
`prio`. Devolve um markdown ordenado por prioridade:

- 🔴 **alta** — handoff, negociação, pedido de ligação, reclamação, pronto para comprar
- 🟠 **média** — interessado, pediu ou recebeu preço, decidindo
- ⚪ **baixa** — só recebeu, sem resposta de verdade

É a melhor ferramenta de acompanhamento que o projeto tem — e **não tem cron**: só roda
quando alguém a chama. Ligá-la a uma entrega diária é das coisas mais baratas e mais úteis
da lista de pendências.

> Nota de escrita: os textos das campanhas e os prompts estão em **português de Portugal**
> ("contacto", "ficheiro", "a decidir"). É a voz do Ricardo e está consistente com o
> mercado europeu. Manter — misturar pt-PT e pt-BR na mesma conversa é o tipo de detalhe
> que um cliente nota.
