# Fluxo Força de Vendas — o estado em 19/11/2026, para voltar a ele depois do teste

Feito a pedido do gestor em 19/11: *"quero que guarde o que fizemos até agora (…) vamos fazer um
breve teste e depois vamos voltar ao normal como estávamos antes."*

Este arquivo é a **linha de retorno**. Tudo abaixo foi lido do que está no ar hoje, não de memória.

---

## 1. Verificação pedida: nenhum lead entrou no fluxo desde 18/11

**Zero.** Confirmado por dois caminhos independentes.

| marco em `copiloto_lead` | última ocorrência | linhas no total |
|---|---|---|
| `forca_pedir_em` (a Nina chamou `link_pedido`) | **nunca** | 0 |
| `forca_em` (pedido aberto no ERP) | **17/11 18:10** | 29 |
| `forca_link_em` (link entregue) | **nunca** | 0 |
| `forca_aviso_em` (resposta da Inscrição Estadual) | **nunca** | 0 |
| `forca_cutuca_em` (cutucada de 45 min) | **nunca** | 0 |

As 29 linhas de `forca_em` são todas de **17/11, entre 09:51 e 18:10**: 22 viraram pedido, 4 pararam
em `ERRO_ERP: Insc. Estadual`, 3 em `sem e-mail`. É exatamente a rodada de teste registrada em
`docs/forca-pedidos-abertos-17-11.md`. **Depois das 18:10 de 17/11 nada mais entrou.**

**E não foi por máquina parada.** Os três crons rodaram o tempo todo, sem uma falha:

| cron | jobid | rodadas desde 18/11 | última | status |
|---|---|---|---|---|
| `forca-cadastro-5min` | 258 | 460 | 19/11 14:25 | todas `succeeded` |
| `forca-cutucar-15min` | 260 | 55 | 19/11 14:15 | todas `succeeded` |
| `forca-avisar-20min` | 261 | 31 | 19/11 14:20 | todas `succeeded` |

**Por que ninguém entrou, então.** O portão é `origem` da landing **ou** `forca_pedir_em` marcado
pela Nina (`filtro()` da `forca-cadastro`). Dos 11 leads tocados desde 18/11, **um só tem e-mail**
(o 686, VIANA DISTRIBUIÇÃO) e nenhum veio da landing. Sem e-mail a Nina não chama o `link_pedido`
(`link_exige_email='sim'`), então ninguém marca `forca_pedir_em` e a fila fica vazia de verdade.
Não é defeito: é a trava funcionando. O gargalo do fluxo continua sendo **o e-mail**.

---

## 2. O que está ARMADO agora — e por que isso importa antes do teste

**O fluxo está ligado e apontando para o ERP de produção.** Se um lead entregar CNPJ, e-mail e CEP
hoje, a Nina chama o `link_pedido`, o cron de 5 min abre **pedido de verdade** e o link sai por
Zaptos — sem ninguém mandar.

### Chaves em `copiloto_config`

| chave | valor hoje |
|---|---|
| `forca_ativo` | **sim** |
| `forca_link_enviar` | **sim** |
| `forca_cutuca_ativo` | **sim** |
| `forca_aviso_ativo` | **sim** |
| `forca_aviso_gestor` | **sim** |
| `forca_email_obrigatorio` | sim |
| `forca_origens` | `nitron-direto-lp%,lp-nitron%` |
| `forca_lote` / `forca_link_lote` / `forca_cutuca_lote` / `forca_aviso_lote` | 3 |
| `forca_link_janela_h` / `forca_aviso_janela_h` | 36 |
| `forca_cutuca_janela_h` / `forca_cutuca_min` / `forca_cutuca_max` | 48 / 45 / 1 |
| `forca_aviso_desde` | `2026-11-18T18:09:05Z` |
| `forca_link_instancia` | Nina |
| `link_exige_cnpj` / `link_exige_email` / `link_exige_endereco` / `link_exige_frete` | sim |
| `link_pagina_antiga` | **nao** |
| `pix_desconto_ativo` | **nao** |
| `pedido_minimo` | 3500 |

### Funções no ar (conferidas em 19/11)

| função | versão | `verify_jwt` | fonte no repositório |
|---|---|---|---|
| `copiloto-lead` | **v34** | true | **idêntico** — 98.161 bytes, md5 `967a027b1b555f7c5f7467e4865636d9` |
| `forca-cadastro` | v6 | true | sim |
| `forca-avisar` | v4 | true | sim |
| `forca-cutucar` | v2 | true | sim |
| `camp-pipeline` | v6 | true | sim |
| `nina-pedido-recebido` | v14 | **false** (a página de pedido é pública — nunca publicar sem isso) | sim |
| `pedido-visita` | v12 | false | sim |
| `forca-teste` | v2 | true | **NÃO EXISTE no repositório** |

**Sobre a v34 do `copiloto-lead`:** o registro fechava em v33, e o ar está uma versão à frente.
Conferido byte a byte — **são idênticos**. Foi republicação do mesmo conteúdo, não divergência.

**Sobre a `forca-teste`:** é uma função temporária de 27 linhas que só confere se o
`CRM_PEDIDO_SECRET` autentica em `/api/crm/auth`. **Não abre pedido nenhum.** O comentário dela diz
"apagar depois" e ela nunca foi commitada aqui.

---

## 3. O que precisa ser decidido ANTES do teste em ambiente de homologação

**O ambiente do Força está CHUMBADO no código, não em configuração:**

```ts
const FORCA_BASE = "https://vendas.nitron.com.br";   // linha 79
const FORCA_ID   = "crm-nitron";                      // linha 80
```

Do jeito que está, **apontar para homologação e voltar exige publicar a função duas vezes** — e
publicar é justamente o passo caro e arriscado deste projeto (a função está atendendo lead). Isso
briga de frente com "um breve teste e depois voltar ao normal".

**O conserto que torna o plano seguro** é ler as duas de `copiloto_config` (`forca_api_base`,
`forca_api_id`), com os valores de produção como padrão, e deixar o segredo de homologação numa
segunda variável. Aí ir para o teste é um UPDATE e voltar é outro UPDATE — sem deploy, sem janela
de risco, e sem depender de alguém lembrar de desfazer.

É um deploy só, agora, para não precisar de dois depois. **Decisão do gestor.**

### A outra porta de teste que já existe

`forca-cadastro?acao=avulso&cnpj=…&contato=…&email=…&whatsapp=…` chama a API com um CNPJ qualquer,
fora da fila de leads, e grava o resultado na tabela `forca_teste`. **Atenção: é chamada de
verdade** — se a API não recusar, nasce pedido no ERP. Foi por ela que se mediu que
`CLIENTE_COM_REPRESENTANTE` e `CLIENTE_CLUBE` barram 4 em 4 clientes antigos.

---

## 4. Para voltar ao normal depois do teste — a lista

1. `copiloto_config`: devolver as chaves da seção 2 aos valores da tabela.
2. Se o ambiente virar configuração: `forca_api_base` = `https://vendas.nitron.com.br` e
   `forca_api_id` = `crm-nitron`.
3. Crons 258, 259, 260 e 261 **ativos** (`select cron.alter_job(<id>, active := true);` —
   `update cron.job` dá `permission denied`).
4. Limpar de `copiloto_lead` o que o teste tiver escrito: `forca_pedido`, `forca_protocolo`,
   `forca_link`, `forca_validade`, `forca_link_em`, `forca_erro`, `forca_pedir_em`. Senão a
   varredura segue achando que aqueles leads já têm pedido aberto.
5. Apagar as linhas de teste de `forca_teste`.
6. Conferir que `copiloto-lead` continua com md5 `967a027b1b555f7c5f7467e4865636d9`.
7. Os 22 orçamentos de 17/11 **continuam abertos no ERP** e não dá para apagar daqui: o MCP do
   Sankhya é somente leitura e a API do Força não tem endpoint de cancelar. É tarefa humana.
