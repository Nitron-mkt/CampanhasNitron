# API de Pedidos CRM — o que muda nas três frentes (17/11/2026)

Alinhamento pedido pelo gestor em 17/11, a partir do `API-PEDIDOS-CRM.md` entregue pelo time que
montou a `vendas.nitron.com.br`. **Tudo aqui é medido**, não suposto.

## O que a API é, e por que não é a página de hoje

| | página de hoje (`pedido.html`) | API `vendas.nitron.com.br` |
|---|---|---|
| o que produz | link estático com a cesta | **pedido de verdade no ERP** (`pedido: 1711559`) |
| onde o pedido cai | e-mail + CSV ao comercial | **esteira do Força de Vendas** (`AD_STATUFORCA`) |
| cadastro do cliente | não existe | cria, via Receita + SEFAZ |
| trava de representante | **nenhuma** | `CLIENTE_COM_REPRESENTANTE`, `CLIENTE_CLUBE` |
| validade do link | nunca expira | **7 dias** |
| atribuição venda→campanha | impossível | o número do pedido volta na resposta |

**Conferido em 17/11: a API está no ar.** `POST /api/crm/auth` com segredo errado devolve
`401 {"erro":"NAO_AUTORIZADO"}` no formato exato do documento.

## O risco que parecia grande não é

De **295 leads com CNPJ** no `copiloto_lead`:

| | |
|---|---|
| já têm cadastro (`ghl_cliente`) | **15** |
| compraram nos últimos 180 dias | **5** → cairiam em `CLIENTE_COM_REPRESENTANTE` |
| têm Clube vigente | **2** → cairiam em `CLIENTE_CLUBE` |

~2% do fluxo. **Trocar de caminho não quebra a operação de leads.**

E o inverso é a notícia importante: **a página de hoje não tem nenhuma trava de representante.**
Aqueles 5 clientes já têm rep e receberam link de compra direta assim mesmo. A API conserta isso
sem código nosso.

## Frente C — o mix para o Força de Vendas

A API aceita `itens[{referencia, pacotes}]`; sem itens ela usa a cesta do ramo **dela**. A nossa
(`pedido_base` / `pedido_base_item`) é montada por penetração real na base — 40 cestas, 1.861
linhas, **272 produtos distintos**. Queremos mandar a nossa.

**O de-para é a `AD_VW_COM_CADPRODUTOS`** (`CODPROD` → `REFERENCIA`). Auditoria dos 272:

| | |
|---|---|
| resolvem para uma REFERENCIA | **272 de 272** |
| inativos | 0 |
| sem múltiplo de venda | 0 |
| **suspensos** | **20** |
| **referência fora do padrão** | **1** |

### Três armadilhas, todas medidas

1. **`qtd` é PEÇA, `pacotes` é FARDO.** O `pedido_base_item.qtd` guarda peças; a API pede pacotes.
   A lixeira 052.006.003 (codprod 431) tem `qtd=12` e `MULTIPLO_VENDA=6` — são **2 pacotes**, não
   12. Mandar `qtd` direto multiplicaria o pedido pelo tamanho do fardo.
   A conta é `pacotes = qtd / MULTIPLO_VENDA`, e o múltiplo vem da mesma view.

2. **20 produtos das cestas estão SUSPENSOS** e seriam recusados como `ITEM_INVALIDO` — entre eles
   a TABUA POPULAR (019), o CESTINHO PARA PRENDEDOR FLORAL (6554), a linha TECA de caixas flat
   (11591/11592) e os cestos de roupa empilháveis (12068/12069). Precisam sair das cestas, não só
   do envio: se estão suspensos, a página de hoje também os está oferecendo.

3. **Uma referência é código de família, não de SKU.** O codprod 277 (FRASQUEIRA OVAL) tem
   `REFERENCIA = '202'`, três caracteres. Os outros 271 têm 11 ou 12. Essa linha falha sozinha.

   As 15 referências de 12 caracteres (`2570.012.001`, `4030.012.003`) são legítimas — é o padrão
   de família de 4 dígitos. Não mexer.

### O conserto proposto

Materializar o de-para numa tabela local (`pedido_ref_sankhya`: codprod, referencia,
multiplo_venda, suspenso, atualizado), alimentada da `AD_VW_COM_CADPRODUTOS`. Com ela, montar os
`itens[]` é um JOIN, a trava de suspenso é um `WHERE`, e a conferência de divisibilidade
(`qtd % multiplo_venda = 0`) roda em SQL em vez de na mão.

## Frente A — a campanha que manda o link direto (`copiloto-lead`)

O que muda na ferramenta `link_pedido`:

- Ela hoje **monta uma URL**; passaria a **chamar a API** e devolver o `link` que vier.
- Os dois dados que ela já exige (CNPJ e CEP) são exatamente os que a API pede. **Nada muda na
  conversa da Nina** — é a mesma pergunta, o mesmo momento.
- Precisa tratar os três finais (`processando` / `pronto` / `erro`) e os erros de negócio. Em
  `CLIENTE_COM_REPRESENTANTE` e `CLIENTE_CLUBE` a Nina **não manda link**: ela diz que o cliente já
  tem quem o atenda e abre tarefa. É a regra "campanha de cliente não vai para representante"
  passando a valer também aqui.
- O POST responde em ~1 minuto e cada GET empurra o processamento. O `copiloto-lead` roda num cron
  de 5 min e a edge function corta em 150s de ociosidade: a chamada **não pode ser síncrona dentro
  da rodada**. É a mesma lição da ponte da LP — responder primeiro, enriquecer depois.
- Gravar `pedido` e `validade` no `copiloto_lead`. O `pedido` **fecha a pendência #4**: pela
  primeira vez dá para dizer qual campanha gerou venda.

## Frente B — o lead da landing (`lp-lead`)

É a frente mais barata: a ponte **já colhe CNPJ e CEP validados** no formulário, que é exatamente
o que a API precisa. Ela já roda BrasilAPI e ViaCEP em paralelo e já responde antes de enriquecer.

Abrir o pedido entra no mesmo `EdgeRuntime.waitUntil` que hoje faz CNAE + CRM + tags + funil. O
lojista recebe o link do WhatsApp em 3,3s como hoje; o pedido nasce atrás disso.

**Cuidado conhecido:** sem CEP resolvido a `lp-lead` cai no endereço do CNPJ na Receita, que pode
ser outra praça. Para a página isso só errava o repasse; para a API, `entrega.cep` errado erra o
frete **do pedido de verdade**. Nessa frente o CEP do formulário tem de mandar, sempre.

## O fluxo, pelas palavras do gestor (17/11)

> "lá no Força de Vendas, ele vai conseguir ver a interface já com os produtos e do jeito que ele
> mostra, assim como o link de hoje. Vai ser do cadastro pro link"

Ou seja: **cadastro → link**, e o lojista abre a tela já montada e ajusta ali, exatamente como no
link de hoje. A experiência dele não muda; muda o que acontece atrás — o pedido passa a existir no
ERP em vez de virar e-mail ao comercial.

**Consequência para a frente C:** se o lojista vê e ajusta, a conta de fardo deixa de ser crítica
para a corretude do pedido final — ele corrige o que estiver estranho. E a API aceita abrir **sem
`itens[]`**, usando a cesta de ramo dela. Fica a escolha de negócio: a cesta da API, que custa zero
trabalho, ou a nossa, medida por penetração real, que custa o de-para e a conta de fardo. O pedido
do gestor ("gerar o mix correto para o Força de Vendas") aponta para a nossa — **a confirmar**.

## As decisões do gestor (17/11)

1. **Mínimo:** a Nina continua falando **R$ 3.500 para todos**, como decidido em 26/10. Fica
   registrado o efeito: a página da API cobra a `venda_min_cif` da REGIÃO (2.500 em SP metro,
   3.570 no interior paulista, **5.000 no resto do Brasil**), então um lojista do Nordeste ouve
   3.500 e a tela pede 5.000. É divergência conhecida e aceita, não defeito a consertar sozinho.
2. **Convivência:** a página de hoje **não sai de cena**. Os dois caminhos rodam em paralelo.
3. **Segredo:** `CRM_PEDIDO_SECRET` entra como secret do Supabase, pelo gestor. Nunca pelo chat —
   a regra de segurança do projeto é explícita.

## O que falta para começar

| bloqueio | de quem |
|---|---|
| `CRM_PEDIDO_SECRET` salvo no Supabase | gestor |
| mandar a NOSSA cesta ou aceitar a da API | gestor |
| decidir o que fazer com os 20 produtos suspensos nas cestas | gestor |
| `pedido_ref_sankhya` + conferência de divisibilidade | nosso |
| teste da API com um CNPJ real de lead parado | nosso, depois do segredo |
