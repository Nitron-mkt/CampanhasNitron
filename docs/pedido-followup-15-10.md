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
