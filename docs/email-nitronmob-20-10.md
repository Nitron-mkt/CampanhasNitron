# E-mail Nitron-Mob — o que quebrou e como ficou (20/10/2026)

Tres envios para `leonardo.lucas@hyakgroup.com.br`, mesmo dia, todos conferidos **na mensagem
entregue** (`nina-email-arte?conferir=<messageId>`), nunca no "201 Email queued successfully".

| # | hora SP | remetente entregue | rodape entregue | maior sequencia sem espaco | como renderizou |
|---|---|---|---|---|---|
| 1 | 09:56 | `marketing@nitron.com.br` ❌ | "Para deixar de receber essas mensagens: " **(vazio)** | normal | **certo** |
| 2 | 14:35 | `comercial@crm.nitron.com.br` ✅ | a **URL CRUA** de descadastro, ~430 caracteres | a propria URL | **encolhido** |
| 3 | 17:50 | `comercial@crm.nitron.com.br` ✅ | "…, **clique aqui**." | CSS, 82 | **certo** |

## Por que o e-mail encolheu no envio 2

O gestor consertou o descadastro no modelo as 10h57, trocando um marcador que renderizava vazio
por `{{email.unsubscribe_link}}` **solto no texto**:

```html
Para deixar de receber essas mensagens: {{email.unsubscribe_link}}
```

Esse marcador devolve a **URL inteira**, com token JWT: cerca de **430 caracteres sem um unico
espaco**. Uma sequencia assim **nao quebra linha**. Ela obriga a celula — e portanto a tabela, e
portanto o e-mail — a ter largura minima de alguns milhares de pixels. O Outlook entao **reduz a
mensagem inteira** para caber no painel. Dai a letra minuscula da segunda imagem.

Nao foi o remetente novo, nao foi o subdominio, nao foi o GHL. **Foi o conserto do descadastro.**

## O conserto

Duas linhas, no rodape do modelo:

```html
<!-- ANTES -->
Para deixar de receber essas mensagens: {{email.unsubscribe_link}}

<!-- DEPOIS -->
Para deixar de receber essas mensagens,
<a href="{{email.unsubscribe_link}}" style="color:#7a888d;text-decoration:underline;">clique aqui</a>.
```

A URL continua inteira — mas dentro do `href`, onde **nao ocupa largura**. O que aparece e
"clique aqui".

E, na celula do rodape, a rede de seguranca para que isso nao possa se repetir:

```html
style="...;word-break:break-word;overflow-wrap:break-word;"
```

O arquivo pronto esta em `app/email/nitronmob-rodape-corrigido.html` (a versao "Att" do gestor com
essas duas mudancas). Confirmado no corpo entregue do envio 3: o GHL **substitui o marcador
normalmente dentro do `href`**.

## O que o gestor ja tinha consertado na versao "Att"

- o `alt` do logo do rodape (estava `width="350" ="Nitron. Toda casa tem."`);
- o `utm_source=chatgpt.com` colado na URL do botao de WhatsApp;
- e reconstruiu a estrutura com condicionais `mso` e cartoes `inline-block` — bem mais robusta que
  a primeira versao.

## A regra que fica

**Nenhuma palavra visivel de um e-mail pode passar de ~80 caracteres.** Link, token, codigo de
rastreio, CNPJ sem pontuacao: se aparecer como texto, vira largura. Por isso o
`?conferir=<messageId>` devolve `maior_palavra_visivel` — e o numero a vigiar antes de qualquer
disparo em massa.

## Antes de ir para a base toda

1. **`crm.nitron.com.br` e um dominio NOVO, com reputacao zero.** Disparar ~6.000 e-mails de uma
   vez num dominio que nunca mandou nada e o caminho curto para throttle e caixa de spam. Rampa
   sugerida: ~300, ~800, ~2.000, resto — olhando entrega e reclamacao entre as etapas.
2. `email.nitron.com.br` **nao existe mais** (NXDOMAIN em dois resolvedores). Nada no codigo nem no
   banco aponta para ele, mas fluxo montado na mao no GHL pode apontar.
3. Conferir o envio real com `?conferir=`, nao com a resposta da API.

## Envio 4 (TESTE 3) — a escala

Depois do conserto do rodape o e-mail voltou ao tamanho normal, mas **empilhado**: o hero virou
titulo em cima e foto embaixo, e os cartoes foram um por linha. Nao e defeito do modelo — e o
painel de leitura do gestor, que tem **cerca de 555 px**.

A versao "Att" usa a tecnica de colunas fluidas (`display:inline-block` com `max-width`). O hero
pede 340 + 300 = **640 px**; os cartoes pedem 2 x 300 = 600 px. Num painel de 555 px nada disso
cabe, entao tudo quebra para uma coluna — e, em uma coluna, cada bloco ocupa a largura inteira e
parece grande. O envio da manha nao empilhava porque usava tabela de largura fixa: em vez de
quebrar, ele era **cortado** (na imagem do gestor o "NI" de NITRON estava fora da tela).

Conserto: **escala de 640 para 560** (fator 0,875) aplicada a todas as larguras —
shell 640→560, hero 340/300→298/252, cartoes 300→262, imagem do cartao 286→250, logo do rodape
350→306, tabelas `mso` 600→525 — e a tipografia do hero na mesma proporcao (44/68 → 38/59).

Agora hero (298+252 = 550) e cartoes (2 x 262 = 524 + folga) **cabem em 555 px**: volta a duas
colunas no painel do gestor, continua certo em tela larga e continua empilhando no celular.

Arquivo: `app/email/nitronmob-560.html`.

## Envio 5 (TESTE 4) — escala 500, e a conta que faltava

O TESTE 3 (escala 560) **nao mudou nada na tela do gestor**, e a conta explica:

```
painel de leitura          ~555 px
padding da celula externa   -16 px  (8px de cada lado)
largura util               ~539 px
hero na escala 560          550 px  (298 + 252)   -> NAO CABE por 11 px
```

Faltavam onze pixels. Por isso continuou empilhando, e empilhado tudo ocupa a largura inteira.

Escala 500: hero 266+234 = **500 px**, dois cartoes 2 x (234+12) = **492 px**. Folga de ~40 px
sobre os 539 uteis. Arquivo: `app/email/nitronmob-500.html`.

## O modelo no GHL nao mudou

Em 20/10, depois de o gestor dizer "arrumei uma coisa no codigo", conferi:

- `updatedAt` da "Lançamento NitronMob Att" continua **2026-10-20T15:32:20Z**;
- o HTML servido pelo `previewUrl` e **byte a byte identico** ao que eu havia baixado antes
  (md5 `88463cc03eb188723bdf6233451b46b6` nos dois);
- nenhum modelo novo apareceu na location.

Ou seja: a edicao **nao salvou no GHL**, ou foi feita num arquivo fora dele. Os testes 2, 3 e 4
foram enviados com o HTML corrigido por fora — **o modelo que esta no GHL ainda tem o
`{{email.unsubscribe_link}}` solto no texto**, e vai encolher de novo se for disparado assim.

## Envio 6 (TESTE 5) — eu estava consertando a doenca errada

O gestor mandou comparar com o da manha. Era a pergunta certa. **A diferenca nao e largura, e a
tecnica de colunas:**

| | o da manha (renderizou certo) | a versao "Att" (empilha) |
|---|---|---|
| hero | `<td class="hero-col" width="57%">` e `width="43%"` | `<div style="display:inline-block;max-width:340px">` |
| cartoes | `<td class="card-cell" width="50%">` (12 celulas) | `<div style="display:inline-block;max-width:300px">` |
| empilha quando | so pela media query (<=660px) | **sempre que o container for menor que a soma** |

Celula de tabela com largura em **porcentagem** nunca empilha sozinha — 57% e 43% de qualquer
largura continuam lado a lado. `inline-block` com `max-width` em **pixels** depende de caber, e o
cliente do gestor nao estava colocando esses divs lado a lado de jeito nenhum.

Por isso reduzir a escala (560, depois 500) **nao mudou nada**: eu estava tratando sintoma de outra
doenca. Duas rodadas gastas.

**O envio 6 e o HTML da manha** — as 12 celulas de cartao e as 2 colunas de hero intactas, zero
`inline-block` fora do botao do CTA — **com as tres correcoes por cima**:

1. `alt` do logo do rodape (estava `width="350" ="Nitron. Toda casa tem."`);
2. `&utm_source=chatgpt.com` removido da URL do botao;
3. descadastro como **link** (`clique aqui`) + `word-break` na celula.

Arquivo: `app/email/nitronmob-FINAL.html`. As versoes em escala 560 e 500 foram apagadas — nao
serviam.

**Nota sobre o `maior_palavra_visivel` do `?conferir=`:** no envio 6 ele devolve 120, mas e CSS de
dentro do `<style>`, nao texto visivel — o extrator tira tags, nao o conteudo de `<style>`. O da
manha dava o mesmo 120 e renderizava bem. O indicador so vale quando a sequencia longa aparece
tambem no campo `rodape`.

## O disparo para a base — `nitronmob-disparar` (20/10, aprovado pelo gestor)

Aprovado o TESTE 5, o gestor mandou comecar: **100 hoje**, validando antes de abrir.

### Por que uma funcao nova, e nao o `campanhas-enviar`

| | `campanhas-enviar` | `nitronmob-disparar` |
|---|---|---|
| remetente | **nao informa `emailFrom`** (linha 259) → sairia por `marketing@nitron.com.br` | `comercial@crm.nitron.com.br` |
| arte | so por `templateId` do construtor — e o modelo de la ainda encolhe | o HTML aprovado, de `app/nitronmob.html` no storage |

Mexer no `campanhas-enviar` para isto seria risco desproporcional: dele dependem todas as
campanhas. O raio de alcance desta funcao nova e so o lancamento.

### A audiencia: view `nitronmob_apto`

Tira, por regra escrita na view e nao na funcao:

- **representante** (`snap_rep.email`, `email_crm`, `email_parc`) — a licao do `rep_contato_extra`;
- **time interno** (`copiloto_responsaveis`, `@nitron.com.br`, `@hyakgroup.com.br`);
- **cadastro poluido** (`contato_cadastro_poluido`);
- e-mail que aparece em **mais de 3 clientes** — e contador ou agencia, nao lojista;
- **caixa que nao decide compra**: `contasapagar@`, `financeiro@`, `fiscal@`, `nfe@`, `cobranca@`,
  `sac@`, `noreply@`… Isto saiu da **previa do lote 1**, que trouxe `contasapagar@modenuti.com.br`
  e `contasapagar@campineiraud.com.br`. Lancamento de produto para o financeiro nao vende e custa
  reclamacao — e reclamacao em dominio novo vale caro;
- **quem ja recebeu** (`nitronmob_envio`, indice unico em `lower(email)`).

Sobram **5.375 aptos**, dos quais **251 engajados** (Em dia + Giro a vencer).

### A ordem importa mais que o numero

A view devolve ordenado por `prioridade`: Em dia → Giro a vencer → Giro vencido → Reativacao →
Perdido. **Dominio novo se aquece com abertura**, e quem abre e quem compra. Comecar pelos 4.136 da
reativacao seria o jeito mais rapido de queimar `crm.nitron.com.br` antes de ele ter reputacao.

### Teto de 40 por chamada

Cada envio custa ~1,5s (lookup + GHL) mais a pausa de 1s. 100 numa chamada so estouraria o limite
de tempo da edge function. 40 cabe com folga; 100 sao tres chamadas. E a mesma conta que fez o lote
da reativacao ser 12.

### Grava antes de mandar

A linha em `nitronmob_envio` e criada **antes** do envio. Se a funcao morrer no meio, o que saiu
fica registrado e a proxima chamada nao repete. O preco disso e um terceiro estado: `ok=false` com
`erro` vazio significa **interrompido — nao da para saber se saiu**. O `?status=1` conta isso em
coluna propria (`desconhecidos`) em vez de mentir dizendo "falhou".

### Lote 1 fechado — 100 enviados, e o que ele ensinou

| | |
|---|---|
| aceitos pelo GHL | **100** |
| recusados na hora | **8** — todos `contact's e-mail is invalid` |
| linhas gravadas | 108 |
| duracao | 15h20 as 15h32 (SP), ~3,8s por envio |

Os 8 recusados foram **repostos** com outros 8 da mesma fila, para fechar os 100 que o gestor
pediu. Eles ficam gravados com `ok=false` e, pelo indice unico, nunca mais entram — o que esta
certo enquanto o cadastro nao for corrigido:

| cliente | e-mail | o que ha de errado |
|---|---|---|
| OMEGA PRESENTE | `anabellyperfumaria@yahoo.com.nr` | `.nr` no lugar de `.br` |
| NIAZI CHOHFI | `compras.ud@niazi.com.br` | dominio nao aceita |
| FR COMERCIO | `frcomercio@outlook.com.br` e `@outlook.com` | as duas formas no cadastro, nenhuma valida |
| RMI ARTIGOS | `rmiminoro@outlook.com` | |
| AKI TEM UTILIDADES | `loja43itupeva@akitem.com` | |
| ZHEN MIAOYUN | `bazar.estrela@terra.com.br` | |
| PRADOLAR | `welonprado0980@gmail.com` | |

E a mesma doenca da pendencia 3 do CLAUDE.md ("21 e-mails de representante que o GHL recusa"),
agora medida tambem no cadastro de cliente.

### "Aceito pelo GHL" nao e "chegou" — de novo

Mesma licao de 26/08 com o Zaptos, agora no e-mail. Numa amostra de 12 mensagens do lote 1:
**9 `delivered`, 1 `opened`, 1 `sent`, 1 `failed`**. Uma rejeicao em doze e alto demais para deixar
por conta de amostra — num dominio virgem a taxa de rejeicao e o que decide se a rampa continua ou
para. Dai o `?entrega=1`, que varre os `message_id` gravados e pergunta ao GHL o estado real de
cada um, e o `?status=1`, que passa a mostrar `entrega_real` e `taxa_rejeicao` ao lado dos aceites.

### Entrega real do lote 1 — os 100 conferidos um a um

| estado no GHL | quantos |
|---|---|
| `delivered` | **86** |
| `opened` | **8** |
| `sent` (ainda em transito) | 5 |
| `failed` | **1** (`jefferson.borges@grupocvlb.com.br`, CVLB BRASIL) |

**Taxa de rejeicao: 1%.** Para dominio virgem e bom — o perigo com Gmail e Outlook comeca acima de
5%. A amostra de 12 que eu tinha olhado antes dava 1 em 12 (8%) e teria levado a uma conclusao
errada; por isso o `?entrega=1` varre os 100, e nao uma amostra.

**8 aberturas em ~40 minutos**, todas de cliente `Em dia` — ATEF, BIG BAM, CENTERLAR, PAGUE MENOS,
PALACE, SANTORO HOME, SOSIL, WP3. E a evidencia de que comecar a rampa pelos engajados estava
certo: abertura cedo e o que constroi reputacao de dominio novo.

**Verde para o lote 2.** Restam 5.267 aptos, 143 deles engajados.
