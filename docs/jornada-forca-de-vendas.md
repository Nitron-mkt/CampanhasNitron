# A jornada do lead até o pedido no Força de Vendas (17/11/2026)

Desenhada com o gestor em 17/11, depois de o fluxo rodar de verdade pela primeira vez
(pedido **1711837**, lead da landing). O que está aqui é **medido ou decidido**, não suposto.

## O caminho

```
campanha META / Google
        │
        ├──► LANDING (campanhas.nitron.com.br) ──┐
        │                                        │
        └──► Nina (WhatsApp) ────────────────────┤
                 │                               │
                 │ intenção principal: mandar    │
                 │ o lead para a landing         │
                 │                               │
                 └─ se o lead quiser seguir no   │
                    WhatsApp, ela colhe os       │
                    dados ela mesma ─────────────┤
                                                 ▼
                                    cadastro → FORÇA DE VENDAS
                                    (vendas.nitron.com.br)
                                                 │
                                    pedido no ERP + link
                                                 │
                                    enrolar ~4 min com conteúdo útil
                                                 │
                                          manda o link
                                                 │
                                    45 min sem resposta e sem
                                    pedido identificado → cutuca
```

## Decisões do gestor (17/11)

| tema | decisão |
|---|---|
| Mix dos itens | **o Força monta**. Não mandamos `itens[]` — dispensa o de-para CODPROD→REFERENCIA |
| `email` na API | **obrigatório, não negociável** — "até para cadastrar no CRM" |
| Desconto PIX 5% | **existe até 21/11**, pode voltar depois. **Não há tela que cumpra**: o PIX com desconto é gerado À MÃO |
| Convivência | a página de pedido de hoje continua no ar |
| Mínimo que a Nina fala | R$ 3.500, como em 26/10 |

## O pedágio do e-mail, medido

A API exige `email`. A Nina não tem:

| | |
|---|---|
| leads da Nina | 658 |
| com CNPJ | 268 |
| com CEP | 75 |
| **com e-mail na nossa tabela** | **0** |
| **contatos de anúncio com e-mail no CRM** | **5 em 100** |

Então ela passa a pedir **três** dados: CNPJ, CEP e e-mail. O custo é conhecido e está medido no
`CLAUDE.md`: link em **49%** dos leads sem trava, **40%** com CNPJ+endereço, **22%** com CEP junto.
Cada campo a mais derruba a conversão — o Cassio (lead 617) foi embora exatamente assim.

**Mitigação:** pedir os três NUMA FRASE SÓ, como a v21 já faz com dois. O que derrubou o Cassio não
foi a quantidade de dados, foi a **volta** — pedir um, depois outro, depois o endereço de novo.

## Os 5% do PIX: uma promessa com data e sem tela

É o item mais perigoso do desenho, por dois motivos independentes.

**1. A promessa vence em 21/11 e a IA não esquece sozinha.** Percentual escrito no prompt continua
sendo dito no dia 22. Por isso ele mora no banco, com data:

| chave | valor | para quê |
|---|---|---|
| `pix_desconto_ativo` | `nao` | nasce desligada |
| `pix_desconto_pct` | `5` | o percentual |
| `pix_desconto_ate` | `2026-11-21` | **a Nina só fala enquanto hoje ≤ esta data** |
| `pix_desconto_min` | `5000` | o pedido, já com os 10%, tem de passar disso |

Voltando a promoção, é um UPDATE na data. Sem deploy, sem alguém lembrar.

**2. A tela NÃO aplica os 5%.** Conferido na página do pedido 1711837: ela menciona PIX, mas não
há "5%" em lugar nenhum; o −10% aparece por item. O PIX com desconto é gerado à mão por uma pessoa.

Isso significa que **a fala da Nina cria uma obrigação manual**. Se ninguém for avisado, o cliente
paga o valor cheio e a Nina terá mentido — é o erro de 16/09, agora com dinheiro no meio.

**Regra: toda vez que a Nina citar os 5%, isso vira aviso ao gestor.** Não pode ficar só na
conversa. Decidido com o gestor: "se acontecer me avise daí vemos o que vai acontecer".

## O que os 10% podem ser ditos

Os **10% acima de R$ 5.000** estão confirmados na tela (aparecem como `-10,00%` nas linhas de item
do pedido 1711837). Esses a Nina pode anunciar sem risco.

## O gancho dos 45 minutos — e o sinal que passou a existir

Hoje a `nina-poslink` cutuca em 3h e **não sabe se o cliente pediu**: a página antiga não devolve
sinal nenhum.

Com o Força isso muda: o pedido existe no ERP com número, e o **`AD_STATUFORCA`** diz a etapa
(`ELAB_CLIENTE` = o lojista ainda está montando; qualquer outra = ele enviou). Pela primeira vez dá
para cutucar **só quem parou de verdade**, em vez de incomodar quem já comprou.

## Pipeline proposto — aguardando aprovação do gestor

Regra do desenho: **só existe etapa que algum sinal move sozinho.** Etapa que depende de alguém
arrastar card morre em duas semanas.

| # | etapa | o que move o card | sinal existe? |
|---|---|---|---|
| 1 | Lead novo | linha em `copiloto_lead` | sim |
| 2 | Dados completos | CNPJ + e-mail na mão | sim |
| 3 | Pedido aberto no Força | `forca_pedido` preenchido | sim |
| 4 | Link entregue | mensagem com o link enviada | quando construirmos |
| 5 | Montando o pedido | `AD_STATUFORCA = ELAB_CLIENTE` | sim, Sankhya |
| 6 | Pedido enviado | saiu de `ELAB_CLIENTE` | sim, Sankhya |
| 7 | Ganho — faturado | virou nota (`TIPMOV='V'`) | sim, Sankhya |

**Duas saídas que NÃO são perda** e não podem cair no mesmo balde:

| etapa | quando | por quê separado |
|---|---|---|
| Devolvido ao representante | `CLIENTE_COM_REPRESENTANTE` | o sistema funcionou: protegeu o rep |
| Devolvido ao Clube | `CLIENTE_CLUBE` | idem |

Nos quatro testes com cliente antigo, **4 de 4** caíram nessas duas. Jogá-los em "perdido"
esconderia que a trava funciona.

**Em aberto:** a página do Força avisa quando o lojista a abre? Se avisar, cabe uma etapa
"Abriu o link" entre a 4 e a 5 — o sinal mais quente que existe. Se não avisar, não se inventa a
etapa.

## O que falta para a jornada rodar sozinha

| falta | onde | esforço |
|---|---|---|
| cron da `forca-cadastro` | SQL | 1 linha |
| a Nina pedir o e-mail junto com CNPJ e CEP | `copiloto-lead` | função que está atendendo |
| a Nina mandar o `forca_link` | `copiloto-lead` | idem |
| mensagem de espera (~4 min) | `copiloto-lead` | idem |
| cutucada de 45 min com sinal do ERP | função nova | separada, como a `nina-poslink` |
| número e complemento na landing | Replit | aguardando publicação |
| aviso ao gestor quando a Nina citar os 5% | onde a fala sair | junto com a mensagem |
