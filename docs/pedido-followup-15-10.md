# Follow-up de 15/10 — os 11 primeiros clientes que receberam a página do pedido

Pedido do gestor: *"pegue alguns clientes recentes que ainda não fecharam e que foram esquecidos
(…) e também alguns que vieram recente de campanha que ainda não foi falado, dai com isso você vai
aplicar o fluxo e amanhã retornaremos para testar o que foi feito"*.

O fluxo aplicado é o manual, o mesmo combinado em 14/10: CNPJ → CNAE → ramo → região → cesta →
link. A ponte é o `app/pedido/ponte.sh`; os textos estão em `app/pedido/followup-15-10.py` e saíram
pelo `app/pedido/enviar-followup.sh`, um a cada 45 s, pela instância da **Nina**.

## Antes de mandar

1. **Dono do contato conferido um por um** (`campanhas-enviar` com `lookup:true`). Dez estavam sem
   dono; o décimo primeiro, a **Zavora (lead 375)**, está com a **Valeria** — instância desligada em
   15/10. Contato de CLIENTE não tem troca de dono (CLAUDE.md), então ele ficou **de fora** e virou
   pendência abaixo.
2. **Número interno nunca entra**: o corte por últimos 8 dígitos contra `snap_rep`,
   `copiloto_venda_interna` e `copiloto_responsaveis` tirou da lista, entre outros, o lead 456 — que
   é o número da própria Mônica.
3. **O que o cliente disse vence o CNAE.** Foi decisivo em quatro dos onze (ver tabela).

## Quem recebeu

### Grupo A — repassados e parados (8 a 10 dias, nenhum fechou)

| lead | loja | praça | estava com | cesta enviada |
|---|---|---|---|---|
| 387 | Agrocamp (Rinaldo) | São Sebastião da Grama/SP | MAURO | Sudeste-R01 |
| 378 | Rubia | Cotia/SP | ADÃO | Sudeste-R01 |
| 372 | Nathalia Queiroz | Santa Maria de Jetibá/ES | CARLOS EDUARDO | Sudeste-R01 |
| 362 | LAR UNNA (Laura Nobre) | Porto Seguro/BA | ADILSON | Nordeste-R01 |
| 333 | Extrema Utilidades (Edimilson) | Extrema/MG | JOSÉ FERNANDO | Sudeste-R02 |

Cada um começa reconhecendo a demora e **perguntando se o representante falou com ele** — é a única
forma de saber, porque a conversa do rep acontece no WhatsApp pessoal dele, fora do nosso CRM.

### Grupo B — vieram da campanha, responderam, e ninguém voltou

| lead | loja | praça | o que ele disse | cesta enviada |
|---|---|---|---|---|
| 446 | Gislene | Santo André/SP | utilidades no Mercado Livre | Sudeste-R01 |
| 443 | Orineide Rodrigues | Cidade Ocidental/GO | mercado | Centro-Oeste-R04 |
| 439 | Shopping das Frutas (Gamaliel) | Campina Grande/PB | mercearia, rede de 5 lojas | Nordeste-R04 |
| 347 | Claudio Amaro | Jundiaí/SP | utilidades, queria frasqueira | Sudeste-R01 |
| 343 | Daniel Balido | Juquiá ou Curitiba | loja de preço único a R$ 12 | Sul-R01 |
| 325 | A. Barboza Alvares (Erika) | Londrina/PR | bazar e papelaria | Sul-R01 |

## Onde o CNAE ia mandar o cliente para o lugar errado

| lead | cesta pelo CNAE | cesta enviada | por quê |
|---|---|---|---|
| 387 | Sudeste-R10 — Esporte, Brinquedo e Lazer | Sudeste-R01 | CNAE 4763604 é de loja de brinquedo; ele vende para casa |
| 378 | Sudeste-R05 — Cama, Mesa e Banho | Sudeste-R01 | ela pediu potes e organização, não tecido |
| 362 | Nordeste-R06 — Vestuário e Calçados, cesta de **R$ 28.157** | Nordeste-R01 | CNAE 4781400; ela vende material de construção e utilidades |
| 325 | Sudeste-R07 — Papelaria, cesta de **R$ 22.804** | Sul-R01 | é bazar com papelaria, e pediu organização e potes |

Duas dessas cestas erradas custariam dez vezes o pedido mínimo. A regra do `LOGICA-NINA.md` — *o que
ele disse vence o cadastro* — não é refinamento: sem ela, quatro dos onze teriam recebido a lista
errada.

## O que apareceu de errado no caminho

- **A Nitron não tem garrafa térmica no catálogo.** São 639 itens e nenhum. O lead 387 (Agrocamp)
  pediu exatamente isso, foi marcado **quente**, qualificado e repassado ao MAURO em 07/10. A
  mensagem que saiu para ele diz a verdade: que não temos, o que temos, e que ele pode pedir para
  sair da lista. Falta a trava: a Nina qualifica interesse em produto que não existe.
- **Zavora (lead 375) está órfã.** O dono do contato é a Valeria, cuja instância foi desligada hoje.
  Como é contato de cliente, não mexi no dono. Decisão sua: ou a passamos para a Mônica (e o
  cliente muda de consultora no CRM), ou fica com a Valeria e nunca mais recebe nada nosso.
- **LAR UNNA (lead 362)**: na Receita o CNPJ está **inapta** e o endereço é Canavieiras/BA, não
  Porto Seguro como ela disse. Vale conferir antes de faturar.
- **Quando eles responderem, a Nina responde.** O `atender()` do `copiloto-lead` não olha o status do
  lead — varre as conversas em que a última mensagem é do contato. Nos cinco do grupo A o status é
  `passado`, e nada impede a Nina de abrir uma **segunda** tarefa ou repassar de novo. É o que eu
  olharia primeiro amanhã.

## O caminho do pedido está testado de ponta a ponta

`PED-0003` saiu hoje às 15:34 UTC pela `nina-pedido-recebido` com 4 produtos, 10 fardos, 168 peças e
R$ 2.065,32, e o e-mail chegou em `camyla.castro@nitron.com.br` (`email_ok: true`). A loja no teste
se chama "TESTE NINA - PODE IGNORAR" de propósito. Os pedidos 1 e 2 são testes anteriores e foram
para `marketing@nitron.com.br`, antes de a chave `pedido_email_para` ser trocada.


---

## 16/10 — o celular nunca foi celular, e duas regras que faltavam na tela

### O erro que o gestor viu, e por que eu nao tinha visto

O gestor abriu a pagina no celular e viu a versao de computador: tres colunas de produto,
letra minuscula, barra do pedido cortada no "ubtotal". A causa nao era o CSS — era uma linha que
nunca existiu no arquivo:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

Sem ela o Chrome do Android assume um viewport de **980px**, encolhe a pagina inteira para caber, e
**nenhuma media query de celular dispara**. Medido: `innerWidth` dava **980** num aparelho de 393px.
Todo o CSS de celular escrito em 15/10 (uma coluna, foto grande, barra empilhada) estava certo e
nunca chegou a rodar.

**Por que passou batido:** eu testei com o Playwright em `viewport:{width:390}`, que define o
viewport de layout **direto**. Ali as media queries disparam e a tela parecia certa. Um celular de
verdade so chega a esse estado se a pagina declarar o meta. O teste era otimista por construcao.

O arquivo tambem nao tinha `<!doctype html>`, `<html>`, `<head>` nem `<meta charset>` — rodava em
quirks mode e dependia so do `charset=utf-8` do header do Worker para os acentos.

Agora, medido com o meta no lugar (`innerWidth` = largura real, zero estouro horizontal, sem erro de
JS):

| largura | colunas | barra do pedido | estouro horizontal |
|---|---|---|---|
| 360px | 1 | 176px | 0 |
| 393px | 1 | 176px | 0 |
| 768px | 3 | 116px | 0 |
| 1366px | 4 | 126px | 0 |

Trava de seguranca junto: `html{overflow-x:hidden}`, `max-width:100%` em `html/body/img/svg`.

### Texto demais empurra produto para fora da tela

Com o celular respondendo, os avisos novos criaram o problema oposto: tres caixas de texto antes do
primeiro produto. Num aparelho de 852px o lojista abria o link e nao via **nenhum** produto. As tres
viraram **um cartao de tres linhas** e a barra foi de 203px para 176px. O primeiro produto agora
comeca em 473px, com ~200px visiveis na primeira tela.

### As duas regras que o gestor mandou deixar claras

1. **Pedido minimo R$ 2.500**, em tres lugares: no cartao do topo, **ao vivo na barra** enquanto o
   pedido nao chega la (`Falta R$ 2.157,76 para o pedido minimo de R$ 2.500,00` — conferido), e numa
   confirmacao se ele tocar em Enviar abaixo do minimo. Antes a barra so falava de desconto, que e
   conversa fora de hora para quem ainda nao pode comprar.
2. **A lista e a media do ramo, nao curadoria**: "Estes 55 produtos sao a media de compra de 262
   lojas do mesmo ramo do CNPJ que voce informou (Casa de Utilidades / Variedades)". Os numeros saem
   de `pedido_base.base_clientes` e do tamanho da cesta — nao sao texto fixo.

Nas mensagens da Nina as duas frases viraram **obrigatorias**: estao no rodape do
`app/pedido/followup-15-10.py` e na **licao 280** do `copiloto_licoes`, que entra no prompt sem
deploy.

### Pedido vai para dois e-mails

`copiloto_config.pedido_email_para` passou a aceitar lista separada por virgula, e a
`nina-pedido-recebido` (v2) manda **um e-mail por destino** — o `campanhas-enviar` resolve um contato
do CRM por endereco e nao tem campo de copia. Hoje:
`camyla.castro@nitron.com.br, marketing@nitron.com.br`. O `email_ok` so e `true` quando **todos**
receberam. Testado: `PED-0004`, R$ 2.234,52, `email_ok: true` nos dois.


## 16/10 (tarde) — a tira de categorias precisava dizer que continua

São **21 categorias em 2.773px de tira** dentro de 393px de tela. Quem abria o link via quatro e
achava que tinha acabado. O gestor propôs duas saídas: uma animação puxando a tira, ou um "+" no fim
da fila abrindo a lista. **Fiz as duas** — resolvem coisas diferentes — com uma correção no desenho
do botão.

| sinal | o que resolve |
|---|---|
| **Degradê na borda** + a categoria cortada ao meio | diz que *existe* conteúdo escondido, e some quando você chega no fim |
| **Balanço de 22px, uma vez só** na primeira abertura | *ensina o gesto* a quem nunca arrastou uma tira. Não é loop: animação que não para vira ruído. Respeita `prefers-reduced-motion` e só dispara se a tira realmente transbordar |
| **Botão "Todas ▾"** abrindo a lista completa com as contagens | atalho para quem *já sabe* o que procura — arrastar até "Frasqueiras" é pior que ler um índice, mesmo sabendo arrastar |

**Duas correções que o teste obrigou:**

1. **O botão não fica no fim da fila, fica fixo na borda.** No fim da fila seria preciso arrastar
   para alcançá-lo — exatamente o que ele existe para evitar.
2. **Ele não some quando a tira chega ao fim.** Na primeira versão sumia (a lógica era "tem mais
   para a direita?"), e quem chegasse lá ficava sem volta rápida para "Meu pedido" a não ser
   arrastando tudo de novo. Agora quem governa o botão é `data-rola` (a tira não cabe?) e quem
   governa os degradês é `data-ini`/`data-fim`. São perguntas diferentes.

Escolher pela lista também **rola a tira até a aba escolhida** (`scrollIntoView` centralizado):
escolher "Frasqueiras" e cair numa tira mostrando "Potes" deixa a pessoa sem saber onde está.

**Medido** (393px, instância da tira com 2.773px):

| estado | degradê esq. | degradê dir. | botão | folga da tira |
|---|---|---|---|---|
| início | off | on (96px) | visível | 84px reservados |
| meio | on | on | visível | 84px |
| fim | on | off | **visível** | 84px |
| desktop 1366px | off | on | visível | ainda transborda 1.665px |

A folga de 2px na conta do fim é de propósito: o scroll fracionário do Android nunca fecha a conta
exata e o degradê ficava aceso no fim da tira. Lista com 22 linhas (as 21 + "Meu pedido"), escolha
por ela testada até o produto certo aparecer, sem erro de JS, zero estouro horizontal nas quatro
larguras.


## 16/10 (fim da tarde) — o link tem nome

`bitter-math-090f.marketing-da5.workers.dev` era o nome que o editor do dashboard sorteou na
primeira publicacao. O `deploy/worker/wrangler-pedido.toml` ja pedia `pedido-nitron` desde o comeco
— o deploy e que nunca passou por ele.

**Agora:** `https://pedido-nitron.marketing-da5.workers.dev/#<Regiao>-<Ramo>`

O fim da URL e o segmento, e sai do CNAE do CNPJ que o cliente informou — o `ponte.sh` monta. Nao e
decoracao: `#Sudeste-R01` e `#Nordeste-R04` entregam cestas diferentes.

Conferido: endereco novo responde 200 com o md5 identico ao que foi publicado, e o painel do gestor
(`gestordecampanhas.marketing-da5...`) ficou intacto — trocar o nome do Worker nao encosta no
subdominio da conta.

### O endereco antigo esta 404, e 11 lojistas tem ele

Renomear moveu a rota workers.dev junto com o nome. Medido logo depois:
`bitter-math-090f.marketing-da5.workers.dev` devolve **404**. Os 11 links que sairam em 15/10 estao
mortos, e nenhum daqueles lojistas tinha aberto a pagina ate aqui.

O conserto e o `deploy/worker/redirect-antigo.js`: um Worker de dez linhas com o nome **antigo**,
que devolve 301 para o novo. O nome ficou livre com o rename, entao da para reivindica-lo. Custa
zero e e melhor do que mandar mensagem de novo para 11 pessoas — pendura dois minutos no dashboard
e os links de ontem voltam a funcionar sozinhos, com o segmento certo de cada um (o fragmento nao
chega ao servidor; o navegador o reanexa no 301).

## 16/10 (noite) — a notificacao, e as tres primeiras respostas

### Quem e avisado, e por que sao DUAS listas

O gestor pediu para ser notificado do status desses contatos no 11970399053, e para incluir o
**Ricardo Fonseca (11 98377-6720)**.

A tentacao era por o Ricardo em `copiloto_responsaveis` com `avisar=true`. **Nao fiz**, e o motivo
importa: aquela flag e lida pelo `copiloto-repasse`, pelo `copiloto-feedback` e pelo
`copiloto-entrega` — quem a tem recebe o espelho de **todo** lead repassado e **toda**
transferencia. Pedir "me avisa dos pedidos" nao e pedir "me manda os 84 avisos de lead".

Entao a notificacao do pedido tem lista propria: `copiloto_config.pedido_avisar_fones`
(`5511970399053, 5511983776720`). Uma palavra do gestor move o Ricardo para a outra lista, se for
isso que ele quiser — mas e decisao dele, nao suposicao minha.

### Duas saidas, porque sao dois momentos

| quando | o que sai | para quem |
|---|---|---|
| **na hora** que um pedido entra | aviso curto por Zaptos: loja, CNPJ, total, quantos produtos | `pedido_avisar_fones` |
| **resumo** (`pedido-status`) | os que pediram, os que responderam, os que estao calados | `pedido_avisar_fones` |

O e-mail com o pedido COMPLETO continua indo para quem fecha (Camyla + marketing). O Zaptos e para
quem acompanha: pedido que entra nao pode esperar alguem abrir a caixa de e-mail.

A lista de contatos do relatorio **nao e chumbada**: sai do filtro jsonb
`repasse_historico=cs.[{"acao":"followup_link"}]`. Quem receber o link amanha entra sozinho.

**O que o relatorio NAO sabe, e diz que nao sabe:** se a pessoa abriu o link. O Worker da
Cloudflare nao registra visita e nao ha pixel na pagina. Entre "mandei" e "mandou pedido" ha um vao
cego.

### Dois erros que a previa pegou antes de o relatorio sair

Rodei com `?dry=1` antes de mandar, e ainda bem:

1. **O relatorio dizia que a Agrocamp mandou pedido.** Nao mandou. O `PED-0003` e o meu teste de
   ponta a ponta, e eu tinha posto o CNPJ da Agrocamp nele so para a linha de identificacao nao sair
   vazia. O casamento por CNPJ fez o resto. Era exatamente o tipo de numero errado que nao pode
   chegar ao gestor.
2. **O `PED-0002` aparecia como pedido de fora da lista** — ele tem `origem='pagina'`, e o filtro so
   tirava quem tem "teste" na origem.

Conserto: os quatro pedidos de teste perderam `cnpj` e `fone` (nao casam mais com lead nenhum) e o
`PED-0002` virou `origem='teste-pagina'`. **Dado de teste com cara de dado real e uma bomba-relogio
num relatorio automatico** — a primeira vez que ela explodiu foi aqui, de graca.

### E as tres primeiras respostas

Os dez disparos de venda sairam 17:43–17:56 UTC. Ate 19:12, **tres responderam** — 25 a 75 minutos
depois:

- **Alex Fernandes (SP)** — *"Boa tarde, é preço final?"*, depois *"Comprando em grande quantidade,
  pagamento à vista, tem algum desconto?"*. Ele **abriu a pagina e leu os precos**: e a primeira
  prova de que alguem abriu. Depois: *"Tenho outro CNPJ com faturamento maior"* e
  *"De qualquer forma o consultor vai ter que entrar em contato para pedidos"*.
- **Maria Socorro (S. J. Rio Preto)** — *"Oi ok vou ver obrigado 😉"* e um 👍 na mensagem seguinte.
- **Marcilio / Isabela Dias (MG)** — respondeu as 18:26.

**A Nina respondeu sozinha aos tres, e respondeu bem.** Ao Alex: *"é o preço de fábrica mesmo, por
peça, é a tabela real. Desconto por quantidade ou à vista quem fecha com você é o consultor — eu não
mexo em preço"*, e repetiu o minimo e a media do ramo. A **licao 280 esta valendo na Nina ao vivo**,
sem deploy, como era a intencao.

**A objecao do Alex e o achado do dia:** *"de qualquer forma o consultor vai ter que entrar em
contato para pedidos"*. Ele viu a pagina, entendeu o preco, e mesmo assim acha que precisa de um
humano para pedir. Ou a mensagem nao convenceu, ou ele **prefere** assim. Com uma resposta so nao da
para saber qual dos dois — e e a pergunta que decide se esta campanha vira canal de venda ou vira um
catalogo bonito.

## 16/10 (fim do dia) — a Nina ASSUME, e o objetivo vira fechar venda

Ordem do gestor, depois de ver o fluxo do Alex Fernandes: lead que esperou tempo demais pelo
representante passa a ser atendido pela Nina **direto**, sem repassar para ninguem. O objetivo dela
deixa de ser qualificar e repassar; passa a ser **fechar o pedido pela pagina**.

### O caso que originou a ordem

Alex Fernandes (lead 239), loja multinicho em Sao Paulo:

| quando | o que |
|---|---|
| 28/09 12:21 | entra pelo anuncio, qualificado, ja sabe do minimo |
| 28/09 13:01 | repassado ao **ADAO** em 40 minutos, `escopo='cidade'`, envio aceito |
| 01/10 13:47 | tarefa 247 aberta no CRM, dona Camyla, entregue |
| ate 16/10 | **18 dias, nenhum contato.** A tarefa segue `status='nova'` |
| 16/10 14:49 | recebe o link, abre a pagina, pergunta se e preco final |

**E a Nina nunca perguntou a ele se o ADAO ligou**, apesar de `feedback_dias=2`. O motivo e uma
fila: o `copiloto-feedback` processa do **mais antigo para o mais novo** com teto de **20 por
rodada**, e hoje ha **56 na fila**. A rodada termina no #224; o Alex e o **#21**. A chave
`feedback_limite` ja esta em 20, que e o teto do codigo (`Math.min(..., 20)`), entao subir no banco
nao resolve.

### O que foi feito

**Alex** recebeu a mensagem de tomada de conta, que teve de desfazer duas coisas: os 18 dias de
silencio, e o que a propria Nina dissera duas horas antes (*"isso e com o consultor mesmo, ele vai
te ligar pra fechar certinho"*). Quem muda de ideia avisa — nao faz de conta.

**Mais oito**, pelo criterio mais indefensavel que existia: repassado a representante ha **21+
dias**, quente, com CNPJ, e **nunca perguntado nada**. Monteiro Casa (28d), Mix 10 (25d), Tamaio
(25d), Bazar da Mana (25d), Rei dos Achados (25d), Ponto do Real (24d), Princesas10 (24d), Minas
Utilidades (21d). O nono (#71 Dona Antoninha) ficou de fora: o contato e da Monica no CRM, humano
na conversa.

Em **6 dos 8** o CNAE mandava a cesta errada outra vez.

### Sobre desconto, o que ficou permitido e o que nao

O gestor autorizou dizer que **pode** haver condicao melhor no fechamento, e **proibiu dizer
quanto**. Entao a mensagem diz: a pagina ja aplica desconto por volume sozinha, e com o pedido bem
montado ainda da para olhar a condicao com mais carinho — *"nao vou prometer numero porque nao sou
eu quem define isso"*. Prazo, pagamento e frete continuam sendo de quem fecha.

Isso virou a **licao 281**, que entra no prompt da Nina ao vivo sem deploy — necessario, porque sem
ela a Nina continuaria dizendo "o consultor vai te ligar", que foi exatamente o que ela disse ao
Alex as 18:22.

### O que ficou em aberto, e e decisao do gestor

1. **Sao 68 leads parados ha 14 dias ou mais** com representante (44 ha 21+ dias). Assumi 8. O
   resto espera o criterio dele.
2. **O representante nao foi avisado de que perdeu o lead.** O fluxo de transferencia que ele
   aprovou em 18/09 sempre avisa o rep e abre a porta ("se voce falou e o cliente nao lembrou, me
   avisa"). Assumir calado quebra isso. Nao avisei ninguem: 8 reps hoje, 68 depois, e uma
   conversa que e dele, nao minha.
3. **A ordem da fila de feedback esta errada para o objetivo.** Perguntar primeiro a quem esperou
   28 dias e perguntar tarde de qualquer jeito. O certo seria priorizar quem **nunca** foi
   perguntado, do mais recente para o mais antigo, e tirar o teto de 20 do codigo.

## 19/10 — a objecao do Alex nao era a que eu achava

Depois da mensagem em que a Nina assumiu (16/10, 16:53), o Alex respondeu **tres minutos depois**
citando uma mensagem de 28/09 — a do catalogo em PDF — com uma frase so:

> *"Gostaria de fazer a pesquisa no catalogo inteiro"*

**A objecao dele nunca foi "preciso de um humano para pedir".** Era *"essa lista e pequena demais
para a minha loja"* — e, olhando so a cesta de 42 itens que abre na tela, ele tem razao. Loja
multinicho nao se abastece com 42 SKUs.

E a pagina **ja tem o catalogo inteiro**: 639 produtos em 21 categorias, na tira de categorias e no
botao *Todas* que entrou na propria sexta. A Nina respondeu oferecendo mandar foto de produto,
porque **nenhuma licao contava isso a ela**. O cliente pediu exatamente o que a ferramenta faz, e a
ferramenta nao soube dizer que fazia.

Virou a **licao 306**, com as palavras exatas: *"toque em Todas, no alto da pagina, que abre o
catalogo inteiro por categoria"*. O PDF continua existindo para folhear — mas quem vai MONTAR
pedido vai pela pagina, porque no PDF nao da para fechar.

**E eu deixei o lead parado de sexta 17:03 ate segunda 16:20 sem voltar.** O objetivo passou a ser
fechar venda e o Alex era o teste; a Nina respondeu a pergunta dele sozinha, mas ninguem fechou o
circuito na coisa que de fato o travava. Erro meu, nao do sistema.
