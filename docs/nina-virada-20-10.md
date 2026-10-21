# A virada da Nina — 20/10/2026

Tres ordens do gestor no mesmo dia, e o que foi feito de cada uma.

## 1. Nenhum lead vai mais para representante

**Feito, sem deploy.** O `copiloto-repasse` decide rep × venda interna por um regex de
configuracao, `copiloto_config.repasse_online_re`: o que casa vai para VENDA INTERNA, o que nao
casa vai para representante.

```
antes:  e-?commerce|ecommerce|marketplace|market
agora:  ^|TUDO-PARA-VENDA-INTERNA-ORDEM-DO-GESTOR-2026-10-20
```

O `^` casa com qualquer coisa, inclusive string vazia — entao **tudo** vira venda interna. O resto
da alternancia nao casa nada: esta ali para quem abrir essa linha daqui a tres meses saber por que
ela esta assim.

Por que o regex e nao um deploy: o `copiloto-repasse` e a funcao que atende lead ao vivo. Trocar
uma linha de configuracao vale na proxima passada, e desfazer e um UPDATE. Testado em seis frases
(loja fisica, bazar, mercearia, vazio, e-commerce, material de construcao): **todas caem em venda
interna**. Nao havia lead pendente no momento da troca.

**Para voltar:** devolver o valor antigo na mesma chave.

## 2. A ultima mensagem aos representantes — tres textos, nao um

Levantamento dos 55 representantes que receberam lead:

| grupo | reps | leads | o que sabemos |
|---|---|---|---|
| **A** | 15 | 22 | o **cliente disse** que nao foi procurado |
| **B** | 5 | 13 | o **cliente confirmou** que foi atendido |
| **C** | 35 | 53 | nada: o cliente nao respondeu ou nunca foi perguntado |

**O dado que mudou a decisao:** a regua que cobra o representante no 3º dia (`rep_cobra_ativo`)
nasceu desligada e nunca foi ligada. Por isso a coluna "o rep respondeu algo" esta **zerada nos
55** — os 18 "nao atendeu" sao a palavra do cliente, so. E o EDSON, a unica vez que foi perguntado
(21/09), respondeu *"tentei e nao atenderam, deixei recado"*.

Mandar "voce nao respondeu os ultimos leads" para os 55 seria dizer uma coisa falsa a cinco pessoas
que o proprio cliente confirmou que atenderam, e acusar 35 sem evidencia nenhuma. Levado ao gestor,
ele decidiu os tres caminhos:

| grupo | o que recebe |
|---|---|
| A | o gelo: nao recebe mais leads por enquanto, **com a lista dos clientes e o CNPJ em linha propria**, e a porta aberta — "se voce falou e a gente nao soube, me responde que eu corrijo" |
| B | **pesquisa de satisfacao**: foi atendido e mesmo assim nao fechou — o que pegou? Preco, minimo, prazo, mix? |
| C | **retomada**: o que aconteceu com esse lead? Falou? Se nao deu, por que? "A gente quer entender, nao cobrar" |

Cadencia: `rep-aviso-enviar` manda 4 por chamada com 25s entre uma e outra — abaixo do teto de 2
por minuto por instancia (`fila_config.wpp_max_min`). Sai pela instancia **dona do contato**
(`usar_dono`), que e a assistente de cada rep: e o `assignedTo` que define o numero de saida, e de
quebra espalha a carga em vez de empilhar tudo na Camyla.

## 3. A Nina passa a fechar — licoes 318 a 321

Nada de deploy: licao entra no prompt na proxima mensagem.

| licao | regra |
|---|---|
| **318** | **CNPJ logo no comeco**, com o porque: o desconto so se aplica com CNPJ informado, e e com ele que conferimos o cadastro e montamos o link certo para o ramo da loja. Se ele nao quiser dar, **seguir normalmente** — nao insistir, nao travar, nao condicionar o atendimento |
| **319** | sobre esse desconto: diz **que existe**, nunca **quanto**. Percentual e condicao sao do comercial |
| **320** | pedido minimo de R$ 2.500 segue igual: cedo e natural |
| **321** | a Nina **leva ao fechamento**, nao so qualifica. O destino da conversa e a pagina de pedido. **Nunca mais prometer "um representante vai te ligar"** |

E as tres de mais cedo, do lancamento: **315** (o que e a linha Nitron-Mob e os 13 itens),
**316** (confirma o preco do e-mail, nao negocia) e **317** (quem veio do botao ja clicou em
comprar: atende primeiro, qualifica depois).

## 4. A fila de reativacao — view `lead_reativar`

Os 465 leads de campanha, ordenados por quanto devemos a eles e quanto ja sabemos:

| # | motivo | leads | com CNPJ | ja viram o link | dias parados |
|---|---|---|---|---|---|
| 1 | o cliente disse que ninguem o procurou | **18** | 18 | 0 | 29 |
| 2 | foi ao representante, atendimento nunca confirmado | **19** | 19 | 9 | 30 |
| 3 | foi ao representante, nunca medido | **45** | 41 | 13 | 17 |
| 4 | venda interna, esfriou | **61** | 60 | 0 | 20 |
| 5 | nunca repassado, mas informou CNPJ | **41** | 41 | 7 | 24 |
| 6 | conversou com a Nina, sem CNPJ | **257** | 0 | 0 | 22 |
| 7 | nunca respondeu | 2 | 0 | 0 | 31 |
| 8 | descartado | 22 | — | — | — |

**Os 118 das faixas 1 a 4 sao o filao**: todos com CNPJ, todos ja conversaram com a Nina, todos
qualificados, e **nenhum deles foi perdido por falta de interesse** — foram perdidos no vao entre
o repasse e o fechamento. A faixa 1 e divida nossa: o cliente disse em voz alta que ninguem o
procurou e ficou 29 dias esperando.

A faixa 6 (257) e a maior e a mais fraca: conversou e nunca deu CNPJ. Com a licao 318 pedindo o
CNPJ no comeco, a proxima leva nao deve repetir esse buraco — e esses 257 sao justamente o teste
de quanto a mudanca vale.

## Correcao e ajustes da segunda rodada (ainda 20/10)

### A Valeria ja estava fora — o erro foi meu

Eu escrevi "venda interna (Monica/Valeria)" e "Monica e Valeria carregam 1.114 conversas", como se
as duas estivessem recebendo lead. **Nao estavam.** `copiloto_venda_interna` mostra a Valeria com
`ativo=false` desde **15/10**, com a observacao "DESLIGADA por ordem do gestor: repasse de venda
interna vai so para a Monica". Nenhum lead foi para ela depois dessa data. As 495 conversas dela
sao historico de carteira, nao fila de lead.

### A porta para a Monica fechou, e so o CLIENTE abre

`copiloto_config.repasse_ativa = 'nao'`. **Nada mais cai na Monica por decisao de maquina.**

A ordem do gestor: passa "quando a nina perguntar se pode seguir com o atendimento ou quer um
atendimento humano, porem so depois que qualificar o lead, isso e, quando o lead falar o CNPJ,
saber do pedido minimo e disser que realmente quer comprar".

Virou `nina-passar-monica` (cron 199, `*/10 11-22 * * 1-6`), que so passa quando **as tres**
respondem sim:

1. existe tarefa da Nina registrando que o cliente pediu atendente humano;
2. o lead tem CNPJ de 14 digitos;
3. consta que ele sabe do pedido minimo.

Faltando uma, nao passa **e diz qual faltou**. "So depois que qualificar" aqui tem definicao, nao
opiniao. Testado: recusou corretamente um lead que ja tinha sido repassado.

O `copiloto-repasse-15min` (cron 150) continua ligado de proposito — com `repasse_ativa=nao` ele
nao faz nada, e sao duas travas em vez de uma.

### Licoes 322 a 325

| licao | regra |
|---|---|
| **322** | quem fecha e a Nina; a unica passagem possivel e para a **Monica**; a Valeria nao recebe lead desde 15/10 — nunca citar o nome dela, nunca prometer representante |
| **323** | qualificado sao **tres coisas juntas**: informou CNPJ, sabe do minimo e nao recuou, e disse com clareza que quer comprar. Faltando uma, a Nina **continua atendendo e nao passa**. "Vou ver" nao e lead qualificado |
| **324** | so depois disso ela **pergunta**: "posso seguir te atendendo por aqui mesmo, ou voce prefere falar com uma atendente?". "Pode seguir" → ela fecha pela pagina de pedido. "Prefiro atendente" → abre a tarefa e para de conduzir. **A escolha e do cliente** |
| **325** | a Nina **nao atende representante** — rep ja tem a assistente dele |

### As mensagens aos representantes passam a se identificar

O gestor mandou: pode sair pelo numero das meninas, mas tem de ficar claro que **quem fala e a
Nina** e que **e uma pesquisa**. As 46 que ainda nao tinham saido foram reescritas:

> Oi Fulano! Aqui e a **NINA**, da Nitron.
> Estou escrevendo pelo numero da assistente que te atende, mas quem fala aqui sou eu.
>
> E uma **pesquisa rapida** sobre os leads de anuncio que te passamos.

No grupo A, que e aviso e nao pesquisa, a linha e "E um aviso sobre os leads de anuncio, e tambem
uma conferencia" — dizer "pesquisa" ali seria falso.

**As 9 primeiras sairam sem essa identificacao** (CARLOS ALFAYA, e mais 8). Fica registrado.

## O envio aos representantes parou — e nao e o texto, e o ZaptosWPP

Das 55 mensagens, **14 sairam** e **41 estao presas**. Vale registrar o caminho ate a causa, porque
eu errei duas vezes antes de achar.

**Primeiro erro meu:** vi 24 recusas de "troca de instancia nao confirmada" e chamei de transitorio.
Devolvi tudo a fila e tentei de novo. **Falhou nos mesmos.** Nao era transitorio.

**Segundo erro meu:** concluí que era lentidao do ack do `#contact_instance` sob rajada, alarguei a
janela de 25s para 55s e mandei um. **Falhou igual.** Tambem nao era pressa.

**A causa real** estava escrita na propria conversa, que e sempre onde ela esta nesta casa. No
contato do DIVINO e no do LUCIO:

```
[System]: The specified instance does not exist.
```

Nao e queda de sessao (`instance is disconnected`), que e o sinal que a gente ja conhecia. E outra
coisa: **o token da instancia nao existe mais no aplicativo**. Confirmado em duas — **Isadora** e
**Beatriz** — e as duas sao exatamente as que o CLAUDE.md registra como "reativadas em 19/10/2026".
Reativar a linha na nossa tabela nao recriou a instancia no ZaptosWPP.

E a tabela `instancia_ghl` dizia `ativa=true, pausada_em=null` para as duas. **O nosso registro
estava mentindo sobre as duas ha pelo menos um dia.**

### Quem esta preso

Dos 41 que faltam, por dona do contato no CRM:

| instancia | reps presos | estado |
|---|---|---|
| **Isadora** | 17 | token nao existe no app |
| **Beatriz** | 16 | token nao existe no app |
| Juliete | 6 | funciona (o primeiro envio do dia saiu por ela) |
| Nina | 1 | funciona |
| sem dono | 1 | — |

**33 dos 41 dependem de duas instancias que nao existem.** Pausei as duas (`pausada_em`), que e a
unica acao automatica que o CLAUDE.md autoriza sem perguntar — e aqui ela so evita queimar
tentativa, porque o `campanhas-enviar` ja estava recusando corretamente em vez de mandar pelo
numero errado.

### O alarme que ja existia e ninguem leu

Na mesma varredura apareceu, na conversa do Renato, um e-mail automatico:

> "O numero da Bianca continua fora do ar ha 26h30. A cobranca PAROU de enviar por WhatsApp —
> nenhum numero de pe."

Ou seja: **tres instancias de cobranca fora** (Bianca, Karla, Nina Financeiro), mais Isadora e
Beatriz inexistentes, mais a Campanhas Nitron restringida desde agosto. Sobram de pe: Camyla,
Estevany, Juliete, Monica, Nina e Valeria.

### O que isso diz sobre o `vigia-instancia`

Esta e a terceira vez registrada neste repositorio que uma instancia cai e a gente descobre tarde
(02/10 com a Nina, 19/10 com a Bianca, agora). O `vigia-instancia` esta **escrito e nunca
publicado** (`vigia_inst_ativo='nao'`). E ele hoje so procura `instance is disconnected` — **nao
reconheceria** `The specified instance does not exist`, que e o caso de agora. Precisa dos dois
padroes.

## Onde a Isadora e a Beatriz ainda aparecem — varredura de 20/10

O gestor avisou que as duas sairam e que **Sankhya e CRM ja foram atualizados**, e pediu o resto.
Varri as tabelas com coluna de instancia/dono/assistente e contei no CRM.

### O achado que explica tudo: o aparelho existe, o nome mudou

Numa conversa atribuida ao usuario da "Beatriz", a ultima mensagem traz:

```
Instance Source: Elaine Kitahara
```

Ou seja: **o aparelho esta de pe e mandando** — so que o token dele no ZaptosWPP agora se chama
**"Elaine Kitahara"**, nao "Beatriz". O `#contact_instance:Beatriz` falha porque esse token nao
existe mais, exatamente como o app respondeu. **Nao e instancia caida: e o nosso registro com o
nome velho.**

Isso tambem corrige o que eu escrevi antes: eu disse "a instancia nao existe", e a frase certa e
"o token com AQUELE nome nao existe".

### No CRM (GoHighLevel)

Os usuarios nao foram apagados — passaram de dono, como o proprio CLAUDE.md ja registrava:

| usuario do CRM | quem e hoje | conversas atribuidas |
|---|---|---|
| `WlHZT90d36qnnXFbKzbl` (era Isadora) | **Mara Oliveira** | **2.245** |
| `qZXd7wbATAFdznMpRPze` (era Beatriz) | **Elaine Kitahara** | **79** |

**Nenhum contato ficou sem dono.** Mas todo WhatsApp de saida para essas 2.324 conversas tenta
amarrar num token que nao existe — e por isso e recusado.

### No nosso banco

| onde | o que ainda tem | quantos |
|---|---|---|
| `instancia_ghl` | as duas linhas, com o nome antigo servindo de token | 2 |
| `assistente_instancia` | Beatriz (5511958246668) e Isadora (5511964530909) | 2 |
| `instancia_alias` | `beatriz`→Beatriz e `isadora`→Isadora | 2 |
| **`snap_rep.assistente`** | **43 representantes** — 22 na Beatriz, 21 na Isadora | 43 |
| **`rep_carteira.assist_idcrm`** | **67 linhas** — 31 e 36 | 67 |
| `fila_envio` pendente | 1 linha presa na Beatriz | 1 |
| `fila_envio` historico | 1.030 Isadora + 141 Beatriz | — |

`snap_rep` e `rep_carteira` sao **fotos** do Sankhya/CRM: se a origem ja mudou, elas se corrigem no
proximo refresh. As outras quatro sao nossas e precisam da mao.

### O que falta para destravar

O conserto nao e trocar dono de contato — e **o nome do token**. Sei o da Beatriz porque o app
escreveu (`Elaine Kitahara`); o da Isadora/Mara eu **nao** vi e nao vou adivinhar: o
`campanhas-enviar` confere o nome contra o token e recusa se divergir, entao chutar aqui so troca
uma recusa por outra.

## 20/10 (17h) — os dois tokens vieram do gestor, e o bind voltou

Ele mandou as duas telas do ZaptosWPP:

| numero | token (nome da instancia) | sessao |
|---|---|---|
| 5511964530909 | **Mara** | connected |
| 5511958246668 | **Elaine Kitahara** | connected |

Renomeado em cinco lugares, com o `usuario_ghl_id` **intacto** (e ele que define o numero de saida:
`WlHZT90d36qnnXFbKzbl` para a Mara, `qZXd7wbATAFdznMpRPze` para a Elaine):

| onde | o que mudou |
|---|---|
| `instancia_ghl` | as duas linhas passaram a se chamar `Mara` e `Elaine Kitahara`; `pausada_em` limpo |
| `assistente_instancia` | idem |
| `instancia_alias` | `isadora`→Mara e `beatriz`→Elaine Kitahara (os apelidos velhos **continuam resolvendo**), mais `mara`, `elaine kitahara` e `elaine` |
| `snap_rep.assistente` | 43 linhas |
| `fila_envio` pendente | 1 linha |

Conferido depois: **zero** referencia a "Isadora" ou "Beatriz" nos cinco lugares. O teste foi o
DIVINO (dono Mara, que tinha falhado tres vezes seguidas por `troca de instancia nao confirmada`):
passou de primeira.

`rep_carteira.assist_idcrm` ficou como estava de proposito — guarda id de usuario do CRM, que nao
mudou.

### A fila dos representantes, depois do conserto

Grupo A (os que nao chamaram os leads) saiu inteiro: **15 de 15 entregues**. B e C seguem saindo a
2 por rodada. A unica recusa que sobra nao e de bind: **ARY CARVALHO, telefone fixo (sem WhatsApp)**.

## 20/10 (17h45) — Bolsao 10: "nao compro no escuro" nao e fim de conversa

O lead 254 (Ed Carlos, **Bolsao 10**, CNPJ 68.687.822/0001-26, Cubatao/SP), repassado ao MILTON em
28/09, respondeu a pesquisa de hoje assim: *"Formato de vcs nao me interessa. Escolho produto para
depois saber preco nao e algo legal de se fazer. Nunca comprei algo no escuro."*

A Nina abriu a tarefa #403 com a decisao em aberto. **O gestor decidiu: mandar o link e dizer que
tem preco sim.** Feito — `#Sudeste-R01~L254`, pela instancia Nina, entrega confirmada.

A objecao dele era contra o catalogo sem preco, nao contra a Nitron: a pagina de pedido mostra o
preco de cada produto, soma o total na tela e aplica o desconto sozinha (10% acima de R$ 5.000, 15%
acima de R$ 15.000). Isso virou `copiloto_licoes` **#326** — entra no prompt sem deploy, entao vale
para o proximo lead que disser a mesma coisa, e nao so para este.

Tarefa #403 marcada como resolvida com o motivo no corpo.

## 21/10 (manha) — as campanhas voltaram, e o link agora sai sozinho

O gestor religou as campanhas do META e deu a regra da rodada:

> "não passar para o representante e agora vamos testar o link com todos que chegarem"

A primeira metade ja estava de pe (`repasse_ativa=nao`, mais as licoes 321–325). A segunda nao
existia: o link so era montado **a mao**, pelo `app/pedido/ponte.sh`, uma pessoa de cada vez — e por
isso so 11 lojistas tinham recebido ate aqui.

### A ferramenta `link_pedido` (copiloto-lead v14)

A Nina ganhou uma ferramenta que devolve a URL pronta:

```
https://pedido-nitron.marketing-da5.workers.dev/#<Regiao>-<Ramo>~L<id do lead>
```

| peca | de onde vem | por que assim |
|---|---|---|
| **Regiao** | UF do lead (`copiloto_lead.uf`) | e so o que a cesta precisa saber; cidade nao entra |
| **Ramo** | a **Nina escolhe**, entre as 10 cestas | o CNAE e o que o contador escreveu na abertura; a `ponte.sh` ja dizia que "o que ele DISSE vence o CNAE". E consultar CNAE exigiria chamada externa, que cai |
| **~L\<id\>** | o id do lead | e o que torna "abriu a pagina" atribuivel A PESSOA no `pedido_visita`. O lojista nao ve: a pagina limpa a URL no primeiro carregamento |

Sem cesta exata, cai na mesma cadeia da `ponte.sh`: mesmo ramo no Sudeste → R01 da regiao → cesta
geral. Cada envio grava `link_em`, `link_seg`, `link_url` e `link_vezes`, e as duas pontas do prompt
(resposta e toque de seguimento) leem isso para **nao mandar duas vezes**.

**Quando ela manda:** assim que souber o tipo de loja. Nao espera ele pedir e **nao espera o CNPJ** —
o CNPJ continua sendo pedido cedo, porque e com ele que se confere o cadastro, mas o link nao depende
disso. O toque de seguimento tambem pode levar o link, que e muito melhor do que repetir a pergunta.

**O que a ferramenta nao deixa prometer:** prazo, frete e percentual de tabela. O unico desconto que
ela pode citar e o **por volume**, porque ele esta impresso na propria pagina e soma na tela. Isso
virou a licao **335**, que separa os dois descontos — o da pagina (pode dizer quanto) e o do CNPJ
(diz que existe, nunca quanto, licao 319).

### O deploy trouxe junto a v12 e a v13, que nunca tinham subido

O publicado era a **v11**. As duas versoes seguintes existiam so no repositorio:

| versao | o que entra agora no ar |
|---|---|
| v12 | le a assinatura da landing "Acelera Nitron" e marca `origem='google-acelera'`, aproveitando nome, CNPJ e e-mail que o lead digitou no formulario |
| v13 | **pausa a instancia na primeira queda e aborta a rodada**; le `pausada_em` antes de tentar qualquer coisa; poe o lead de molho depois de qualquer recusa — e a correcao do 02/10, quando a Nina escreveu 41 mensagens diferentes para o mesmo lead com o Zaptos morto |

Conferido antes de publicar: nao havia nada no publicado que nao estivesse no repositorio (zero
simbolos a perder), e nenhuma chave de servico chumbada. Conferido depois: o fonte publicado e
**byte a byte identico** ao arquivo local (76.641 caracteres nos dois).

### A fila dos representantes terminou (ainda em 20/10)

55 mensagens, **54 entregues**. A unica recusa nao e de instancia: **ARY CARVALHO, telefone fixo,
sem WhatsApp**.

**Nota de data:** o cabecalho do `copiloto-lead` e a linha do prompt dizem "ordem do gestor em
20/10". O pedido do link veio na manha de **21/10**; 20/10 e a data da virada (Bolsao 10, fila dos
representantes, rename das instancias). Ficou como esta de proposito: o fonte publicado e o do
repositorio sao byte a byte identicos, e nao vale um redeploy de funcao que esta atendendo so para
corrigir um numero em comentario. Na proxima publicacao por motivo funcional, acerta-se junto.

## 21/10 (meio-dia) — o vazamento que ainda mandava lead embora

O gestor repetiu a ordem olhando os leads do dia:

> "esses da campanha que chegaram de ontem pra hoje (...) não vai passar mais, vai fazer o
> combinado da Nina fechar, se tiver alguma dificuldade em continuar, pode me informar"

Representante ja nao recebia nada (`repasse_ativa=nao`). **Mas havia outra porta, e ela estava
aberta:** a ferramenta `passar_comercial` continuava sendo o fim natural da qualificacao, e fazia
duas coisas ruins de uma vez — abria tarefa para o comercial **e** gravava `status='passado'`.
Esse status tira o lead do seguimento (`seguir` so olha `qualificando`/`qualificado`), entao o lead
saia da mao da Nina e entrava numa fila que alguem precisa abrir. Ninguem ficava com ele.

### O caso que mostrou isso: Levi Reis (lead 466)

Marketplace de variedades em SP, **CNPJ informado**, **pedido minimo aceito**, temperatura
**quente**, querendo potes, organizacao, cozinha e lixeiras. As 09:03 de 21/10 a Nina abriu a
tarefa **413** com este texto:

> "Esta pronto para montar pedido mas o link da pagina de pedido nao foi gerado corretamente — ja
> tentamos duas vezes e ele esta **cobrando retorno ha dias**."
> Falta: "Gerar e enviar o link da pagina de pedido com o CNPJ dele certinho, **urgente**"

Ela nao tinha como montar link nenhum: a `link_pedido` so foi ao ar as 09:34. O lead mais quente do
dia virou tarefa de outra pessoa por falta de ferramenta.

**Resolvido na mao:** link `Sudeste-R01~L466` enviado pela instancia Nina, entrega confirmada, com
o pedido de desculpa pela demora. Lead de volta para `qualificado` (a Nina segue com ele) e tarefa
413 fechada.

### A correcao (v15)

| antes | agora |
|---|---|
| `passar_comercial` = "terminei de qualificar, entrego pra outro" | = **pedido de atendimento humano**, e so em tres casos: ele pediu uma atendente; o CNPJ ja tem cadastro (ja tem consultor); ou a Nina esta travada em algo que so pessoa resolve |
| gravava `status='passado'` | **nao grava** — fica `qualificado`, e a Nina continua com ele ate alguem assumir de verdade |
| o `aviso` mandava ela se despedir ("um consultor assume daqui") | manda o contrario: continue na conversa, siga montando o pedido |

E o prompt ganhou a ordem por extenso: *"QUEM FECHA E VOCE (...) nenhum lead vai para
representante (...) so existe UMA passagem possivel, e e para a venda interna (Monica), quando ele
PEDIR atendimento humano e ja estiver qualificado."*

A tarefa continua sendo aberta de proposito: ela e a porta que o `nina-passar-monica` **exige**
para deixar passar (`copiloto_tarefas` + CNPJ + `sabe_minimo`). Tirar a tarefa quebraria o unico
caminho legitimo.

### O unico passo que a Nina nao faz sozinha

Montado o pedido, a pagina chama o `nina-pedido-recebido`: o pedido vira linha de tabela, sai por
e-mail completo para a **Camyla** e para o marketing, e um aviso curto por Zaptos para quem
acompanha. **Quem digita no Sankhya e uma pessoa.** Isso nao e "passar o lead" — e a unica etapa
que nao tem como ser nossa.

## 21/10 (11h) — primeira conferida: o link esta sendo aberto

| lead | cesta | enviado | aberturas |
|---|---|---|---|
| Levi Reis (466) | Sudeste-R01 | 10:34, a mao | **3** — 10:34, 10:49, 10:55 |
| Brendo Santana (469) | Sudeste-R01 | 10:00, pela Nina | **1** — 10:03, tres minutos depois |
| Gabriela Nunes (472) | Sudeste-R01 | 09:41, pela Nina | ainda nao |

Os tres sao SP e variedades/preco unico, entao `Sudeste-R01` e a cesta certa nos tres; a regiao bate
com a UF. A abertura do Brendo tres minutos depois do envio e a prova de que a URL chegou inteira e
clicavel — a `~L469` veio junto no `pedido_visita`, que e o que torna a visita atribuivel a ele.

**Nenhum lead foi para representante.** O ultimo repasse a rep foi **19/10 as 16:02** (Cheila da
Silva → PAULO DRESCH), antes da ordem. Os 12 leads que aparecem como `passado` nas ultimas 24h sao
antigos, mexidos pela regua de feedback — nao sao passagem nova.

## 21/10 (14h40) — sete aberturas, cinco pessoas, zero pedidos

| lead | link em | aberturas |
|---|---|---|
| Levi Reis (466) | 10:34 | 10:34, 10:49, 10:55 |
| Brendo Santana (469) | 10:00 | 10:03 |
| **Ed Carlos / Bolsao 10 (254)** | 20/10 17:44 | **12:23 do dia seguinte** |
| Gabriela Nunes (472) | 09:41 | 12:48 |
| **Marcos Santos (402)** | **13:15** | **13:58** |

O **Marcos Santos** e o caso mais interessante: lead de Sumare/SP marcado `frio` desde 09/10 (dois
toques, sem resposta). Ele voltou a escrever sozinho hoje as 13:15, a Nina respondeu com o link na
mesma passada, e ele abriu **43 minutos depois**. Lead morto que o link trouxe de volta.

**Nenhum pedido montado.** O `pedido_recebido` continua so com os quatro testes de 15–16/10.

### O buraco que isso revelou: quem ABRE e some fica invisivel

Dois dos cinco que abriram **nao recebem seguimento nenhum**, e o motivo e o status:

- **Ed Carlos (254)** estava `passado` — e `seguir` so olha `qualificando` e `qualificado`.
- **Marcos Santos (402)** esta `frio` e com `toques=2`, o teto.

Os dois abriram a pagina e calaram. Se nao escreverem, ninguem fala com eles de novo. **Abrir a
pagina e o sinal mais quente que esse funil produz** — e hoje nada le o `pedido_visita` para agir
sobre ele. O 254 foi reaberto a mao (volta para `qualificado`, com o link registrado para a Nina nao
mandar de novo, e `toques=0`, entao ela da um toque leve). O 402 fica como esta: ja levou os dois
toques, e insistir um terceiro e o que o proprio prompt proibe.

**O conserto certo nao e mexer em linha:** e uma regra que leia `pedido_visita`, e quando alguem
abriu e nao escreveu em algumas horas, a Nina volte perguntando se ficou alguma duvida no que ele
viu. Isso e falar sozinho de um jeito novo — decisao do gestor, nao minha.

## 21/10 (17h15) — fechamento do dia: 6 links, 9 aberturas, 0 pedidos

A Nina mandou **6 links sozinha** no primeiro dia (mais o do Ed Carlos, que saiu a mao em 20/10):

| lead | praca | cesta | link | abriu |
|---|---|---|---|---|
| Gabriela Nunes (472) | Guarulhos/SP | Sudeste-R01 | 09:41 | 12:48 |
| Brendo Santana (469) | São Paulo/SP | Sudeste-R01 | 10:00 | 10:03 |
| Levi Reis (466) | São Paulo/SP | Sudeste-R01 | 10:34 (a mao) | 10:34, 10:49, 10:55 |
| Marcos Santos (402) | Sumaré/SP | Sudeste-R01 | 13:15 | 13:58 |
| Luccas Abramo (475) | São Paulo/SP | Sudeste-R01 | 15:56 | 16:44 |
| **Fabio Garcia (477)** | **Mandaguari/PR** | **Sul-R01** | 16:15 | **16:16** |
| Ed Carlos (254) | Cubatão/SP | Sudeste-R01 | 20/10 17:44 | 12:23 |

**O Fabio Garcia e a prova de que a regiao generaliza:** primeiro lead fora do Sudeste, PR virou
`Sul-R01` sozinho, e ele abriu **um minuto** depois de receber.

**Zero pedidos montados.** Sete lojistas abriram a pagina, nenhum chegou ao fim. Com uma amostra
desse tamanho ainda nao da para dizer se e a pagina ou se e so cedo — mas se amanha a conta
continuar 0 com dez ou mais aberturas, o problema deixa de ser do funil e passa a ser da pagina: o
passo de fechar o pedido pode nao estar obvio para quem chega nela sem ninguem explicando.
