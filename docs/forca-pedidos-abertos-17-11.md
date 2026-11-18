# Os 22 orcamentos abertos no Forca de Vendas em 17/11 — para cancelar a mao

Pedido do gestor em 18/11: "nao sei se consegue apagar os testes que foram feitos no ERP, se sim,
apague todos que fizeram."

**Eu nao consigo apagar.** As duas portas que tenho sao de leitura ou de criacao, nunca de exclusao:

| porta | o que ela permite |
|---|---|
| MCP do Sankhya | SOMENTE LEITURA — "Comandos de escrita/DDL sao bloqueados" |
| API do Forca de Vendas (`vendas.nitron.com.br`) | `POST /api/crm/auth`, `POST /api/crm/orcamento`, `GET /api/crm/orcamento/{protocolo}`. Nao ha endpoint de cancelar nem de apagar |

Entao a lista abaixo e para alguem cancelar dentro do Forca / do Sankhya.

## O que existe DE VERDADE como pedido de venda no ERP: so UM

Conferido em `AD_VW_COM_PEDIDOS` com os 22 numeros:

| NUNOTA | parceiro | vendedor | situacao | itens | valor |
|---|---|---|---|---|---|
| **1711837** | 230368 — COSTA & SILVA | 67 — AUTO ATEND. | **PENDENTE** | 56 | **R$ 10.071,44** |

Os outros 21 numeros **nao aparecem** nessa view, que cobre todo pedido de venda desde janeiro do
ano passado, faturado ou nao. O mais provavel e que continuem como orcamento em elaboracao
(`AD_STATUFORCA = ELAB_CLIENTE`) do lado do Forca — mas **isso eu nao consigo confirmar daqui**:
edge function nao alcanca o Sankhya e a coluna `AD_STATUFORCA` nao esta em nenhuma view liberada.
Quem abrir o Forca ve o estado real de cada um.

## Ninguem recebeu link

Os 22 leads estao com `forca_link_em` VAZIO: o pedido foi aberto no ERP, o link **nao** foi
entregue a nenhum lojista. Nenhuma mensagem saiu por causa destes orcamentos.

## A lista inteira

```
pedido   quando        CNPJ                  loja
1711837  17/11 09:51   65.117.810/0001-78    COSTA & SILVA CONFECCOES E DISTRIBUIDORA LTDA
1712245  17/11 16:55   60.784.467/0001-00    VKBI UTILIDADES E VARIEDADES LTDA
1712243  17/11 16:55   19.309.393/0001-48    VIANA DISTRIBUICAO LTDA
1712242  17/11 16:56   68.811.895/0001-88    Gabriel Vicente
1712264  17/11 17:10   07.023.125/0001-86    NEWS COMERCIAL DISTRIBUIDORA ATACADISTA E SERVICOS LTDA
1712263  17/11 17:10   69.247.876/0001-33    69.247.876 JOSE IVO DA SILVA
1712262  17/11 17:10   39.926.448/0001-76    39.926.448 ERISVALDO DOS SANTOS THOMAZ
1712283  17/11 17:20   69.505.623/0001-12    69.505.623 ADRIANA FERRAZ DA SILVA
1712282  17/11 17:20   43.519.855/0001-36    43.519.855 LUCICLAUDIA LIMA ALMEIDA
1712279  17/11 17:20   65.283.463/0001-53    65.283.463 CAIO VINICIUS CRISPIM COSTA
1712297  17/11 17:30   66.963.532/0001-32    66.963.532 CAMILY OLIVEIRA GUIMARAES
1712306  17/11 17:31   42.121.512/0001-56    42.121.512 EDIMARY SANTOS BATISTA
1712299  17/11 17:35   22.782.475/0001-10    POLYPUS DIGITAL LTDA
1712331  17/11 17:45   66.615.438/0001-92    HG DISTRIBUIDORA COMERCIO VAREJISTA DE EQUIP. DE TELEFONIA E COMUNICACAO LTDA
1712335  17/11 17:45   68.164.603/0001-62    68.164.603 DOUGLAS RONY FERNANDES RODRIGUES
1712336  17/11 17:50   55.234.241/0001-97    AGRO FERRAGEM DA ROSA LTDA
1712350  17/11 17:55   52.397.359/0001-48    52.397.359 ROBERTA DE ALMEIDA FRANCO
1712355  17/11 17:55   69.882.417/0001-21    Everton Marcelino
1712356  17/11 18:00   69.921.509/0001-73    NAIANE MATOS OLIVEIRA
1712359  17/11 18:05   69.693.269/0001-05    JUAN ZAGO
1712386  17/11 18:10   69.935.242/0001-73    Rogerio Passos
1712407  17/11 18:10   61.242.108/0001-85    61.242.108 GETULIO JOSE BATISTA
```

## Importante antes de apagar tudo

**Nenhum destes e um CNPJ inventado.** Sao leads reais da landing do Google (`nitron-direto-lp`),
que se cadastraram entre 13 e 17/11. O que foi "teste" foi a RODADA — o cron abriu o orcamento de
todos eles de uma vez. Apagar o orcamento nao apaga o lead nem o contato: eles continuam no CRM e
na `copiloto_lead`, e quando voltarem a falar com a Nina o fluxo novo roda de novo.

**O 1711837 merece olhar antes.** Ele tem 56 itens e R$ 10.071,44 — nao e uma casca vazia. O lead
(688, Lucas Gabriel Costa silva) esta marcado como descartado aqui, mas o pedido ficou PENDENTE no
nome do AUTO ATEND. (codvend 67). Se alguem cancelar sem olhar, cancela um pedido montado.

Depois de cancelar, me diga quais sairam que eu limpo `forca_pedido`/`forca_protocolo` na
`copiloto_lead` — senao a varredura continua achando que aqueles leads ja tem pedido aberto.
