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
