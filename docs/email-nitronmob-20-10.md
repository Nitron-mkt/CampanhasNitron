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
