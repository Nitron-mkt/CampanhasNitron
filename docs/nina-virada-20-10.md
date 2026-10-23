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

## 22/10 (manha) — 20 aberturas, 0 pedidos, e o porque provavel

Nada chegou durante a noite. O `pedido_recebido` continua com os quatro testes de 15–16/10.

### A pagina NAO esta quebrada — isso foi o primeiro a descartar

Cinco das sete aberturas foram de celular, entao antes de culpar comportamento eu abri a pagina num
iPhone 13 de verdade (Playwright, viewport de telefone):

| conferido | resultado |
|---|---|
| erro de JS | **nenhum** |
| estouro horizontal | **nao** |
| botao "Enviar" | visivel, habilitado, na barra de baixo (top 608 de 664px) |
| minimo de R$ 2.500 | **nao trava**: e um `confirm()` que deixa mandar assim mesmo |

### O que eu acho que trava: a pagina abre com o carrinho CHEIO

`loadSeg()` carrega a cesta inteira no carrinho:

```js
(s.itens||[]).forEach(function(it){ if(it.fardos>0) cart[it.cod]=it.fardos; });
```

No `Sudeste-R01` isso e o que o lojista ve no primeiro segundo, sem ter tocado em nada:

> **41 produtos · 47 fardos · 701 pecas · subtotal R$ 8.959,11 · desconto 10% · total R$ 8.063,20**

A pagina explica ("e um ponto de partida: mude o que quiser") e a conta de onde a cesta saiu esta
la. Mas quem ouviu "pedido minimo R$ 2.500" e abre num **pedido de R$ 8 mil que nao montou** tem
duas saidas: aceitar o que nao escolheu, ou tirar 40 itens na mao. As duas dao trabalho, e a
terceira — fechar a aba — nao da nenhum.

Isso e **decisao de produto, nao bug**, e a pagina e sua. Tres caminhos, em ordem de esforco:
1. Abrir com o carrinho **vazio** e a cesta como sugestao ao lado ("adicionar tudo" num botao).
2. Abrir com uma cesta **menor**, perto do minimo, e oferecer o resto.
3. Deixar como esta e medir mais — 20 aberturas ainda e pouco para condenar.

### A atribuicao esta perdendo quem volta

7 das 20 visitas vieram **sem marca**. O motivo esta no codigo, nao e misterio:

```js
try{ if(location.hash.replace(/^#/,"")!==id) history.replaceState(null,"","#"+id); }catch(e){}
```

No primeiro carregamento a pagina limpa a URL e **a marca `~L<id>` some**. Quem reabrir pelo
historico ou pela aba recente entra sem marca, e a visita fica orfa. Os horarios e os aparelhos
(iPhone 26_6_2 e 18_7, os mesmos das visitas marcadas) sugerem que sao os mesmos lojistas
voltando — mas isso e leitura, nao prova.

Conserto pequeno: guardar a marca no `sessionStorage`/`localStorage` no primeiro carregamento e
mandar junto nas visitas seguintes. Nao muda nada do que o lojista ve.

**Nao mexi na pagina.** Ela esta sendo usada por lead de verdade agora, e as duas mudancas sao
decisao do gestor.

## 22/10 (11h30) — 30 visitas, 0 pedidos, e as cestas novas funcionando

14 leads entraram hoje (478–491), **7 ja receberam link**, e 10 visitas novas so na manha — mais do
que o dia inteiro de ontem. O funil acelerou; o fim dele continua em zero.

Duas cestas novas apareceram sozinhas, e as duas estao certas:

| lead | o que ele disse | cesta |
|---|---|---|
| Cleber (486), Campinas/SP | "ecommerce — produtos de mercado" | **Sudeste-R04** (Supermercado/Mercearia) |
| Daniela Montino (485), Cafarnaú/BA | utilidades/variedades | **Nordeste-R01** |

Ate ontem tudo era `Sudeste-R01` e nao dava para saber se a escolha de ramo funcionava ou se era
so a cesta padrao aparecendo sempre. Agora funcionou nos dois eixos: **ramo** (R04) e **regiao**
(Nordeste).

A mais adiantada e a **Fransciele (478)**, Santa Bárbara d'Oeste/SP, loja no Mercado Livre: CNPJ
informado, pedido minimo aceito, **abriu duas vezes** (09:36 e 09:42). Nao escreveu depois.

### Um numero que nao fecha

A pagina abre o `Sudeste-R01` com **subtotal R$ 8.959,11** (medido no navegador). O `pedido_base`
descreve a mesma cesta como **~R$ 4.706** (`valor_estimado`), e e esse o numero que a `ponte.sh`
imprime para quem monta link a mao. Mesma quantidade de itens (41–42), valor dobrado.

Nao sei qual dos dois esta certo e nao mexi em nenhum — mas sao a mesma cesta descrita por dois
numeros, e o que o lojista ve e o de R$ 8.959. Se alguem internamente citar "cesta de uns R$ 4,7
mil" para um cliente, a conta nao vai bater quando ele abrir.

## 22/10 (tarde) — oito pedidos do gestor, e o que foi feito

### 1. A Nina estava respondendo representante — PARADO

`copiloto_config.piloto_apenas` estava em **`nao`**. Com essa chave em `nao`, o
`copiloto-conversa` responde a **qualquer numero que case com um rep do `snap_rep`** — e foi
exatamente o vao do incidente de 16/09 (477 mensagens de 79 numeros num dia). Ela voltou para
**`sim`**: so os dois numeros do `copiloto_piloto` (MILTON, codvend 17) sao atendidos. 976 chamadas
passaram pela funcao so hoje, entao isso estava valendo o dia inteiro.

**O que ainda falta, e e deploy:** a trava dura em codigo e a mensagem de cortesia fora do horario
("nao temos atendimento agora"). Hoje o comportamento fora do horario e **silencio**, que e o lado
seguro do que o gestor pediu. E o MILTON continua sendo atendido porque e o canal de piloto e de
treino ("modo treino" entra por ali) — se for para calar ele tambem, e so dizer.

### 2, 3 e 7. As tres regras novas entraram sem deploy (`copiloto_licoes`)

| # | licao | o que muda |
|---|---|---|
| 344 | **autoatendimento** | ela se apresenta como "a Nina, o autoatendimento da Nitron", uma vez, e diz que atendimento humano e so pedir, que a gente acompanha em tempo real |
| 345 | **catalogo x link** | o catalogo nao tem preco; a pagina tem. Na duvida vai o LINK. Catalogo so quando ele pedir catalogo com essa palavra, e ainda assim com o link junto |
| 346 | **nao atende representante** | nem com dias sem resposta; comunicacao em massa sai pelo painel do Gestor |

### 4. A troca de instancia para o financeiro — achada, e NAO e do Renato

Duas funcoes nossas mexem em dono de contato. A suspeita obvia, `crm-resposta-roteia`, esta
**inocente**: a ultima vez que ela atribuiu alguma coisa foi **01/10**, ha tres semanas.

A culpada e a **`campanha-dono`**, com um emprestimo que nunca foi devolvido:

| campanha | contatos emprestados | devolvidos | ultimo |
|---|---|---|---|
| **cobranca** | **126** | **0** | 15/10 |
| reativacao_180d | 9 | 2 | 26/08 |
| clube_a_vencer | 1 | 0 | 27/08 |

A funcao "empresta" o dono do contato para a instancia da campanha sair pelo numero certo, e
`devolver` recoloca cada um no lugar — o ledger esta em `campanha_dono_emprestado`. **O devolver da
cobranca nunca rodou.** Os 126 contatos ficaram com Bianca, Karla e Nina Financeiro, tirados de
Nina, Monica, Camyla, Mara e Estevany. Como o numero de saida **e** o dono do contato, toda mensagem
para essas pessoas passou a sair pelo numero do financeiro — que e o que o gestor esta vendo.

Pior: as tres instancias de cobranca estao fora do ar (a propria vigia avisa que "a cobranca PAROU
de enviar por WhatsApp — nenhum numero de pe"). Entao esses 126 contatos estao presos a numeros
mortos.

**Nao rodei o `devolver`.** Sao 126 contatos de CLIENTE, e a regra da casa e que dono de contato de
cliente nao se mexe sem o gestor. A ordem esta pronta para disparar.

### 8. A lista de leads parados — `docs/leads-parados-22-10.md`

**442 leads parados ha mais de 24h. Em 437, ninguem vai falar nada.** A view `lead_parado` ficou
criada e e consultavel a qualquer hora.

### 1 (PDF). O valor ESTA no PDF — o que falta e o nome de quem pediu

Gerei o PDF da pagina publicada, num iPhone 13, e extrai o texto. Ele traz R$/un e total por linha,
e fecha com:

```
41 produtos · 47 fardos · 701 unidades
Subtotal:  R$ 8.959,11
Desconto 10%:  -R$ 895,91
VALOR TOTAL:  R$ 8.063,20
```

Conferido tambem que **nenhum dos 1.861 itens das cestas esta sem preco**, entao nao e um produto
zerado puxando a conta para baixo.

O que o PDF **nao** tem e identificacao: o cabecalho e so "NITRON — Pedido / Casa de Utilidades ·
Sudeste / Emitido em 22/10/2026". Sem loja, sem CNPJ, sem contato — `clientBlock()` sai vazio
quando o lojista nao preencheu quem e. Um PDF desses chega na Camyla sem dizer de quem e.

## 22/10 (15h) — a revisao do fluxo desde que o link comecou

30 leads entraram entre 20/10 e agora (466 a 495). Conferi um por um.

### O que esta certo

- **Nenhum foi para representante.** `repasse_para` vazio nos 30. A ordem esta sendo cumprida.
- **16 dos 30 receberam o link**, e a cesta bateu com o que a pessoa disse em todos:

| cesta | para quem | conferencia |
|---|---|---|
| Sudeste-R01 | variedades/bazar/preco unico em SP | certo |
| **Sudeste-R04** | Cleber, "ecommerce — produtos de mercado" | certo (Supermercado/Mercearia) |
| **Sul-R01** | Fabio Garcia, Mandaguari/PR | certo |
| **Nordeste-R01** | Daniela Montino, Cafarnaú/BA | certo |
| **Norte-R01** | Bruna Daltiba, RO | certo |

Quatro das cinco regioes ja sairam sozinhas, e um ramo fora do R01. A conta de regiao e de ramo
esta funcionando.

- Uma unica tarefa foi aberta no periodo (a 413, do Levi) e ela e **anterior** a v15.

### O que esta errado: o lead morre em meio dia

**13 dos 30 ja estao `frio`.** E o tempo que leva para isso e o problema:

| lead | o que tinha | parado ha | status |
|---|---|---|---|
| Luccas Abramo (475) | CNPJ, razao social, **abriu a pagina** | 7h | **frio** |
| Mônica Mariz (470) | — | 7h | **frio** |
| Andreia (476) | — | 7h | **frio** |
| Gabriela Nunes (472) | CNPJ, **abriu a pagina** | 23h | **frio** |
| Brendo Santana (469) | **abriu a pagina 3 min depois** | 24h | **frio** |

A regua e `lead_seguir_min = 180` (3 horas) e `lead_toques_max = 2`. Ou seja: o lead que nao
responde leva o primeiro toque em 3h, o segundo em 6h, e **e declarado frio no mesmo dia**. Quem
chega as 6h da manha esta morto ao meio-dia.

**Tres dos que ABRIRAM a pagina foram marcados frio.** Sao os mais quentes do funil, e o sistema os
descartou por nao terem escrito de volta em algumas horas.

Hoje, dos 30 leads do periodo, **so 12 ainda tem algum toque pela frente**. Os outros 18 acabaram.

**O conserto e parametro, nao codigo:** espacar os toques (`lead_seguir_min`) faz o lead viver dias
em vez de horas **sem aumentar o numero de mensagens**. Subir de 180 para 600 minutos daria um
toque no fim do dia e outro na manha seguinte — mesma quantidade de fala, vida util dobrada.
**Nao mudei:** mexer na regua muda quando a Nina fala sozinha, e isso e decisao do gestor.

### Um padrao que vale olhar: a maioria e e-commerce

Sete dos 30 se descreveram como loja **online/marketplace** (Fransciele, Luccas, Cleber, Fabio,
Gabriel, Letícia, Carla). Eles recebem a cesta do ramo deles, que e montada com a **media de compra
de lojas fisicas** daquele ramo. Pode ser o mix errado para quem vende em marketplace — nao da para
afirmar com sete casos, mas e a primeira vez que o perfil aparece em volume.

## 22/10 (15h30) — "lead que morre se contorna" (v16)

Ordem do gestor:

> "A todos os leads que morrem, precisamos contornar, ou falando do desconto que já tem, ou falando
> que escolhendo os itens que precisam eles podem receber uma condição especial diferente, basta
> concluir o pedido que a Nina passará para um dos nossos vendedores onde podem abrir mais opções de
> tabelas, descontos e tudo mais."

Isso muda duas coisas de uma vez: o **argumento** do toque e o **momento do repasse** — concluir o
pedido deixa de ser o fim e passa a ser o que chama o vendedor.

### As licoes entraram primeiro, e NAO bastaram

Licoes 347 e 348 gravadas, sem deploy. Rodei a previa dos tres primeiros toques e as mensagens
sairam **corretas e genericas**:

> "Gabriela, deixa eu facilitar: me conta o que mais vende aí na loja hoje que eu já te aponto o que
> colocar no mix primeiro, pra não ficar escolhendo no escuro."

Nenhuma citou desconto nem vendedor. O motivo estava no proprio prompt do toque: ele dava um
**cardapio** do que oferecer — "o link do catalogo, uma sugestao pelo tipo de loja dele, dizer que
pode mandar so o que interessa" — e ela escolhia dali. **Licao nao vence instrucao concreta do
prompt quando as duas falam do mesmo assunto.** Esse e o aprendizado que fica.

### O que a v16 mudou

| antes | agora |
|---|---|
| cardapio: catalogo, sugestao de mix, "mando so o que interessa" | **o contorno**: (a) o desconto que ele ja tem na pagina, ou (b) concluir o pedido poe um vendedor na conversa, com poder de abrir tabela e condicao |
| catalogo era uma das saidas | **proibido como saida** — nao tem preco, e foi essa a reclamacao que custou o Bolsao 10 |
| ultimo toque: "fico a disposicao", encerre com leveza | **o ultimo toque carrega o contorno inteiro**, e nao se despede: "quem se despede perde o lead" |

A trava continua: nunca prometer percentual, tabela ou prazo. Quem abre isso e o vendedor; a Nina
so abre a porta.

### A regua: de 3 para 10 horas entre os toques

`lead_seguir_min` 180 → **600**. Mesma quantidade de mensagens (`lead_toques_max` continua 2), mas
o lead passa a viver mais de um dia util em vez de seis horas. Foi o que a revisao das 14h mostrou
matando os leads, e cumpre a ordem de nao deixar lead parado sem aumentar o quanto a Nina fala.

### Cinco revividos, e tres pegaram a mensagem antiga

Resetei para `qualificando` os cinco que tinham **aberto a pagina** e foram marcados frio: Luccas
Abramo (475), Gabriela Nunes (472), Gislaine (479), Brendo Santana (469) e Marcos Santos (402).

**O cron tocou tres deles as 15:21–15:22, um minuto antes do deploy da v16** — Marcos, Brendo e
Gabriela receberam a versao generica. Nao e prejuizo (as mensagens estao corretas), mas nao
carregam o argumento novo. Os tres ficaram com `toques=1`, entao o **proximo** toque deles e o
ultimo e vai com o contorno inteiro. Luccas e Gislaine ainda nao foram tocados e pegam a v16.

## 23/10 (manha) — o contorno saiu, e saiu certo

Os cinco revividos foram tocados entre 08:04 e 08:31, ja com a v16. O texto real, lido no CRM:

**Luccas Abramo (toque 1)** — o argumento (a), o desconto que ele ja tem:

> "Luccas, oi de novo. Só um detalhe que pode ajudar: enquanto você for montando a lista na página,
> o desconto já entra sozinho — passando de R$ 5.000 cai 10%, passando de R$ 15.000 cai 15%, sem
> precisar negociar nada. É só ir ajustando os itens que fazem sentido pra sua loja."

**Gabriela Nunes (ULTIMO toque)** — os dois argumentos juntos, como o prompt exige no ultimo:

> "(…) na própria página, acima de R$ 5.000 já entram 10% de desconto e acima de R$ 15.000, 15% —
> isso soma sozinho na tela, sem precisar pedir nada. E outra coisa: **quando você concluir o pedido
> por lá, ele cai direto com um dos nossos vendedores, que consegue abrir outras condições que eu
> não libero por aqui.** Monta do seu jeito, só com o que serve pra sua loja, e me manda que eu
> acompanho daqui."

**Brendo Santana (ULTIMO toque)** — mesma estrutura:

> "(…) passou de R$ 5.000 entram 10%, passou de R$ 15.000 entram 15%, automático, sem precisar pedir
> nada. E quando você concluir o pedido por lá, **eu já coloco um vendedor nosso na conversa, que
> consegue abrir outras condições que eu sozinha não libero.**"

Conferido nos tres: citam o desconto **ou** o vendedor (os dois, nos ultimos toques), **nao**
oferecem catalogo, **nao** prometem percentual de tabela nem prazo, e nenhum se despede — todos
terminam com a porta aberta e um motivo concreto.

**A diferenca para 22/10 e o ponto:** com a licao sozinha a mensagem saia "me conta o que mais vende
que eu te aponto o mix". Com o prompt reescrito, saiu o argumento do gestor. **Licao nao vence
instrucao concreta do prompt quando as duas falam do mesmo assunto** — e e isso que fica registrado.

### E um voltou a falar

O **Marcos Santos (402)** respondeu. A Nina esta negociando o minimo com ele:

> "Entendo a ideia de testar antes de ir fundo. Só que esse R$ 2.500 é o mínimo de fábrica mesmo,
> não dá pra baixar — mas com esse valor dá pra montar um mix bem variado pra testar várias linhas
> (…) Me passa o CNPJ da loja?"

E o primeiro lead que estava morto, foi revivido e voltou a conversar.

**Ainda zero pedidos montados** (42 visitas) e zero contatos pelo botao do e-mail.

## 23/10 — a pesquisa "o que faltou para concluir a compra"

Ordem do gestor:

> "Para toda a galera que morreu e também quem clicou e tudo, quero que volte a falar com eles
> pedindo informação sobre o que faltou para concluir a compra conosco."

### A audiencia, e por que ela e dividida em tres

| grupo | quem e | na fila | em espera |
|---|---|---|---|
| **clicou** | abriu a pagina de pedido e nao concluiu | 1 | **18** |
| **rep** | foi encaminhado a representante ou venda interna e morreu la | 144 | 2 |
| **conversou** | falou com a Nina e parou antes de qualquer encaminhamento | 297 | 18 |

**482 pessoas**, com tres perguntas diferentes. Perguntar "ninguem te procurou?" a quem nunca foi
encaminhado inventaria uma falha nossa que nao houve; perguntar "o que achou da pagina?" a quem
nunca a viu e pior. O texto de cada grupo sai **igual para todos do grupo**, montado em codigo e
nao pelo modelo — pesquisa com pergunta variavel nao se soma depois.

**Os 18 que clicaram estao em ESPERA de proposito.** A Nina falou com eles hoje de manha, com o
contorno da v16. Mandar a pesquisa em cima disso seria duas mensagens no mesmo dia e enterraria o
contorno antes de ele ter chance. O cron `nina-pesquisa-liberar` passa cada um para a fila quando
completar 24h sem a Nina falar.

### Quem fica de fora, por trava e nao por preferencia

Representante (`snap_rep`) e numero da casa (`copiloto_responsaveis`) foram filtrados na montagem.
E contato que hoje pertence a um humano no CRM e **pulado**, nao recusado: o `campanhas-enviar`
recusa, e a recusa esta certa — significa que um atendente esta com a pessoa.

### O primeiro lote, e o que ele ja ensinou

Tres envios de teste:

| lead | resultado |
|---|---|
| 254 — Ed Carlos, Bolsao 10 (clicou) | **enviado** |
| 5 | recusado: telefone fixo, sem WhatsApp |
| 6 — Eduardo | **pulado**: o contato e da Mara no CRM |

Os dois que nao sairam sao exatamente os casos que a fila tem de saber distinguir, e soube.

### Cadencia

`nina-pesquisa-5min` (jobid 201): 2 envios a cada 5 min, das 8h as 17h de SP, dias uteis. Da ~216
por dia, entao as 482 terminam em cerca de **dois dias uteis**. O teto do Zaptos e 2 por minuto por
instancia; isto usa 0,4 — sobra folga para as conversas vivas da Nina, que saem pela mesma
instancia.

**Para parar:** `update cron.job set active=false where jobname='nina-pesquisa-5min';`

### O que acontece com as respostas

A resposta volta pela conversa normal e quem atende e a Nina, com o cerebro dela. A **licao 356**
diz o que fazer: escutar primeiro, repetir com as palavras dele, **nao rebater**, e so depois — se
couber — tratar o que ele falou (preco, minimo, mix, momento, ninguem me procurou). Nunca discutir
com a resposta nem pedir para reconsiderar na mesma mensagem.

A coluna `lead_pesquisa.classe` existe para classificar as respostas depois. **Ainda nao ha
classificador**: por enquanto a leitura e manual.

### 23/10 (13h30) — 44% da fila ia ser recusada por um erro meu

Na primeira hora, **31 de 68 envios voltaram "telefone fixo (sem WhatsApp)"**. Olhei antes de deixar
correr, e ainda bem: **212 dos 482 numeros da fila tem 10 digitos**, entao do jeito que estava
**210 pessoas (44%) seriam recusadas**.

Elas nao sao fixo. Separando pelo primeiro digito do numero local:

| comeca com | quantos | o que e |
|---|---|---|
| 9 | 135 | celular antigo, de antes do nono digito |
| 8 | 71 | celular antigo |
| 7 | 4 | celular antigo |
| **3** | **2** | **fixo de verdade** |

Conferi primeiro se nao era o bug do `d10()` de novo: rodei `copiloto-lead?acao=fone_crm&dry=1` e
dos 425 que deu para checar, **425 estavam "ja certo"** — o telefone gravado bate com o do CRM.
Logo o numero curto nao e decapitado, e assim que ele existe na base.

**A causa era minha.** O `campanhas-enviar` trata todo numero de 10 digitos como fixo e recusa
antes de tentar — mas essa checagem so roda no ramo em que ele precisa **achar** o contato pelo
telefone. Eu copiei o `rep-aviso-enviar`, que manda por `fone` de proposito (la o objetivo era
casar o dono do contato), para um caso em que eu **ja tinha o `contact_id` na mao**. Passando o id,
ele pula a checagem e quem resolve o numero e o CRM, que e onde o numero certo mora.

Conserto: `nina-pesquisa` v2 manda por `contact_id`. Os 31 recusados voltaram para a fila e o
**lead 5, que tinha sido recusado como "fixo", foi entregue** na primeira tentativa depois da
correcao. Cron religado (jobid 203).

Fica a licao: **recusa em massa com um motivo so merece ser aberta antes de virar numero.** Se eu
tivesse deixado o cron rodar, teriam sido 210 pessoas marcadas como inalcançaveis — e a conclusao
errada de que quase metade da base nao tem WhatsApp.

---

## 23/10 — O PRECO DA PAGINA SAIU DA TABELA PADRAO E FOI PARA A TABELA GESTOR, +10%

Ordem do gestor, no meio da tarde:

> "tenho uma instrução nova para você mudar no valor dos produtos do link que estamos mandando,
> hoje esta puxando os valores dos itens da tabela padrão, já identificamos que alguns clientes
> perguntaram sobre isso. Então vamos mudar a tabela de valores e você vai buscar os valores dos
> itens para mudar para a **Tabela Gestor do sanckya** e depois adicionar **+10%** no valor, dai
> agora quando o cliente pedir no minimo os **5mil**, vai poder ter o **desconto de 10%** também,
> **não vai ter mais desconto quando pedir acima disso**."

Tres mudancas numa so: a fonte do preco, a margem, e a regua do desconto.

### Qual e a "Tabela Gestor"

**CODTAB 194 — "GESTOR VAREJO - ACELERA NITRON"**, 1.104 produtos com preco.

Tem uma irma que engana: a **CODTAB 195, "GESTOR RED 194"**, que e exatamente **metade** da 194 em
todo produto que conferi. E tabela derivada (reducao de 50%), nao a tabela do gestor. Usar a 195
teria mandado a pagina inteira pela metade do preco.

### O preco de hoje NAO era "a tabela padrao"

O comentario do `order_app.html` dizia "Preço = tabela padrão PV-0003". **Nao era verdade.** O mesmo
produto saia com precos diferentes em cestas diferentes — o codprod 60, por exemplo, aparecia a
6,37 / 6,74 / 6,88 / 7,43 conforme a cesta. O que havia ali era um preco medio praticado, apurado
por segmento quando as cestas foram montadas, e nao uma tabela. Por isso o lojista que comparava
dois links nossos via numeros diferentes para a mesma peca — e e provavelmente parte do "alguns
clientes perguntaram sobre isso".

Agora e tabela de verdade: um produto, um preco, igual em todas as 40 cestas e no catalogo.

### Cobertura: 639 de 639

A pagina tem **639 produtos** — 256 dentro das 40 cestas e 383 so no catalogo, que e de onde o
lojista acrescenta o que quiser. **Todos os 639 tem preco na 194.** Nenhum produto ficou sem preco,
nenhum ficou com preco velho.

A tabela `pedido_base_item` do banco tem **272** codprods, dois a mais do que a pagina: o **277
(FRASQUEIRA OVAL)** e o **7628 (KIT NITRONBOX C/ 3PCS TRAVAS PRETAS)**. Esses dois **nao existem na
194** — eles so tem preco em tabela de conta grande (Leroy, Telhanorte, Petroloucas) e em
obsoletos. Como **nenhum dos dois esta na pagina**, ninguem ve preco errado; ficaram com o preco
antigo no banco e estao marcados aqui para quem for regerar as cestas. Se o gestor quiser esses dois
na pagina, o caminho e cadastrar preco deles na 194 — nao inventar um aqui.

### O efeito: tudo caiu, nada subiu

| | antes | agora |
|---|---|---|
| soma dos 639 precos do catalogo | R$ 13.337,20 | R$ 10.950,02 (−17,9%) |
| subtotal somado das 40 cestas | R$ 529.315,79 | R$ 435.465,34 (−17,7%) |
| produtos que **subiram** de preco | — | **0 de 639** |
| cestas em que o cliente passaria a pagar mais | — | **0 de 40** |

Conferi essa ultima linha de proposito: como a faixa de 15% sumiu, uma cesta grande perde 5 pontos
de desconto, e era preciso saber se a queda de preco cobria isso. Cobre em todas — inclusive na
maior, que ia a R$ 25.331 de subtotal.

Exemplo no Sudeste-R01, a cesta que mais sai:

| | antes | agora |
|---|---|---|
| subtotal | R$ 8.959,11 | R$ 7.375,26 |
| desconto | 10% | 10% |
| **total** | **R$ 8.063,20** | **R$ 6.637,73** |

Quatro das 40 cestas agora abrem **abaixo de R$ 5.000** e por isso abrem sem desconto, mostrando
"Compre mais R$ X e ganhe 10%". Nenhuma abre abaixo do minimo de fabrica de R$ 2.500.

### O desconto virou uma faixa so

```js
// antes
function discountRate(sub){ if(sub>15000)return .15; if(sub>5000)return .10; return 0; }
// agora
function discountRate(sub){ return sub>=5000 ? .10 : 0; }
```

`>=`, nao `>`: o gestor disse "**no minimo** os 5 mil", entao quem monta exatamente R$ 5.000 ganha.

A barra de baixo e o PDF leem o mesmo `discountRate`, entao acompanharam sozinhos. As duas frases
de promocao foram reescritas (sumiu "suba para 15%" e "desconto maximo de 15%").

### Onde mais esse numero estava escrito — e por que isso importa

O percentual nao mora so na pagina: **a Nina repete ele de boca**. Se a tela faz uma coisa e ela
diz outra, e a doenca de 16/09 em escala menor — ela promete o que o sistema nao cumpre. Os lugares:

| onde | o que dizia |
|---|---|
| `order_app.html` — `discountRate` + 2 frases + cabecalho | a regra em si |
| `copiloto-lead` — `DESCONTO_PAGINA` | vai dentro do retorno do `link_pedido`, toda vez que ela manda o link |
| `copiloto-lead` — contorno do toque de seguimento | o argumento que ela usa no lead que esta morrendo |
| licao 326 | "aplica o desconto automatico (10% acima de R$ 5.000, 15% acima de R$ 15.000)" |
| licao 335 | a licao que **separa** o desconto da pagina do desconto do CNPJ |
| licao 347 | o contorno, de novo |

Todos os seis corrigidos. Mais a **licao 357, nova**: o lojista que volta com um print do preco
antigo. Ela manda confirmar que sim, os valores foram revistos e estao **menores**, convidar a abrir
o link de novo, e **nao** inventar explicacao de custo, frete ou promocao por tempo limitado.

As perguntas da pesquisa "o que faltou" nao citam percentual nenhum (conferido: 0 das 85 ja
enviadas e das 354 na fila), entao nada do que ja saiu ficou mentindo.

### O que foi conferido antes de publicar

- O `pedido.html` que estava no ar era **byte a byte** o fonte antigo (md5 `ae8cfbb5…`): ninguem
  tinha editado por fora.
- A `copiloto-lead` publicada era **byte a byte** o fonte do repositorio menos as minhas tres
  edicoes.
- Depois de publicar, o Worker serve exatamente o arquivo que montei (md5 `b6a55c48…`), e a funcao
  publicada e identica ao fonte.
- Chromium headless em 390px: Sudeste-R01 abre em R$ 6.637,73 com "desconto 10% −R$ 737,53";
  Sudeste-R08 (R$ 3.781) abre sem desconto e com "Compre mais R$ 1.218,96"; Nordeste-R01 em
  R$ 10.168,99. **Zero erro de JS** nos tres.
- `copiloto-lead` respondeu a um `?dry=1` depois do deploy: o modulo carrega e a rodada roda.

### Fica como esta, e nao e descuido

**`pedido_base.valor_estimado` nao bate com nada** — nem antes nem agora. No Sudeste-R01 ele diz
R$ 4.706, a soma dos itens do banco da R$ 5.794 e a pagina abre em R$ 7.375. Sao tres numeros de
tres geracoes diferentes (a pagina tem 41 itens nessa cesta, o banco tem outra lista). **Nenhuma
funcao viva le essa coluna** — o `link_pedido` so le `pedido_id`, `ramo_nome` e `n_itens` — entao
nao mexi. Mas e divergencia conhecida, e quem for regerar cesta precisa saber disso antes.

### Onde a tabela ficou guardada

`pedido_preco_gestor` (1.104 linhas): `codprod`, `preco_gestor` (como esta na 194), `preco_novo`
(gestor × 1,10), `codtab`, `puxado_em`. Conferido: **0 linhas** com a margem errada. E dela que
`pedido_base_item.preco_ref` foi atualizado (1.850 linhas).

Quando a 194 mudar no Sankhya, o caminho e repuxar para essa tabela e regerar o `app_data.js` — a
conta do +10% nao precisa ser refeita a mao.
