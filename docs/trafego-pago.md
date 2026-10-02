# Tráfego pago da Nitron — estado em 02/10/2026

Briefing para abrir um chat dedicado só a campanhas. Tudo abaixo foi medido, não estimado;
onde há suposição, está marcado como suposição.

---

## 1. O que existe hoje

Duas máquinas de aquisição, as duas despejando no **mesmo lugar**: o WhatsApp da Nina
(`wa.me/5511960390203`), que qualifica e repassa.

| canal | o que é | status |
|---|---|---|
| **Google Ads** | 1 campanha de Search ativa: *"Campanha de Leads - Campanha Acelera Nitron"* | rodando desde 24/09 |
| **META** | conta NITRON (`434365544371468`, BRL), anúncios clique-para-WhatsApp | rodando |
| **Landing "Acelera Nitron"** | SPA hospedada no Replit, formulário → `wa.me` da Nina | rodando, **sem medição** |

Na conta do Google há **20 campanhas**, mas 19 estão zeradas (histórico: "Seja um Revendedor
Nitron", "Campanha 40 anos", "Leads Inside Sale", "Tráfego B2B", etc.). Só a Acelera gasta.

---

## 2. Números — Google, 24/09 a 01/10 (8 dias)

| | |
|---|---|
| Investimento | **R$ 382,59** |
| Impressões | 882 |
| Cliques | 150 |
| CTR | **17,0%** (média do setor B2B: 3–5%) |
| CPC médio | R$ 2,55 |
| Conversões registradas pelo Google | **0** |
| Leads reais | **5** |
| **Custo por lead** | **R$ 76,52** |
| Clique → lead | 3,3% |
| **Vendas** | **0** |

### Dia a dia — a campanha está encolhendo

| | 24/09 | 25/09 | 26/09 | 27/09 | 28/09 | 29/09 | 30/09 | 01/10 |
|---|---|---|---|---|---|---|---|---|
| gasto | 118,06 | 92,53 | 36,84 | 35,54 | 24,08 | 45,95 | **14,88** | **14,70** |
| cliques | 24 | 33 | 20 | 18 | 17 | 20 | 8 | 10 |
| impressões | 132 | 155 | 125 | 80 | 91 | 181 | 62 | 56 |
| CPC | 4,92 | 2,80 | 1,84 | 1,97 | 1,42 | 2,30 | 1,86 | 1,47 |

Gasto −87%, impressões −58%, CPC caindo junto. Padrão de lance reduzido: paga menos,
perde leilão, aparece menos. Nos dois últimos dias (8 e 10 cliques) **não dá para sair lead**
a 3,3% de conversão.

### Os 5 leads do Google

Identificados pela assinatura que a landing escreve na 1ª mensagem
(`Origem: Campanha Acelera Nitron`). Marcados em `copiloto_lead.origem = 'google-acelera'`.

| id | data | loja | CNPJ | destino | estado |
|---|---|---|---|---|---|
| 202 | 25/09 | Nay Móveis | 57.426.260/0001-40 | INACIO | passado |
| 204 | 25/09 | Farmácia Açungui | 63.237.057/0001-29 | MAURI CONCI | passado |
| 233 | 28/09 | Paraíso das Utilidades | 38.257.074/0001-80 | — | esfriou |
| 272 | 29/09 | Padaria e Mercearia 27 | 50.035.735/0001-29 | MILTON | passado |
| 290 | 30/09 | W S Comércio Varejista | 60.004.261/0001-01 | TOM | passado |

**4 de 5 repassados (80%)** — contra 35% da base geral no mesmo período (48 de 139).
O lead do Google qualifica melhor.

**Mas o perfil está errado:** farmácia, padaria, loja de móveis, varejista genérico.
**Só 1 dos 5 era loja de utilidades** — e foi o que esfriou.

---

## 3. Google × META, mesma janela

| | Google | META |
|---|---|---|
| gasto 24/09–01/10 | R$ 382,59 | R$ 396,99 |
| leads | 5 (8 dias) | 56 (apenas 24–28/09) |
| **CPL** | **R$ 76,52** | **~R$ 4,40** |
| custo por lead repassado | R$ 95,65 | ~R$ 12,40 |
| vendas | 0 | 0 |

**O lead do Google custa ~17x mais.** Descontando que ele qualifica 2,3x melhor, o custo por
lead *repassado* ainda é ~8x maior.

Ressalvas: os R$ 396,99 são a conta META inteira (todas as campanhas), não só a de leads — o CPL
real do META é igual ou melhor. Os 56 leads vêm de um snapshot de 28/09, então é piso, não teto.

---

## 4. Os seis problemas

### 4.1 A campanha não mede nada
O Google registra **0 conversões**. Não é que ninguém converteu — 5 converteram. É que **não
existe ação de conversão na landing**.

Consequência real: o lance automático otimiza para o sinal que recebe, e o único sinal é
**clique**. Ele compra o clique mais barato, não o lead mais provável. Os problemas 4.2 e 4.3
são consequência direta disso.

Também não dá para ver quem abriu a landing, preencheu o formulário e **não** mandou o WhatsApp.
Esse buraco é invisível e pode ser o maior do funil.

### 4.2 30% do gasto rastreável vai para busca que não pode virar cliente

Classificação dos 167 termos de busca:

| o que a pessoa buscou | termos | cliques | gasto | % |
|---|---|---|---|---|
| Categoria genérica (atacado/fornecedor) | 79 | 25 | R$ 97,36 | 59,9% |
| **ICP — revenda de verdade** | 12 | 6 | R$ 16,72 | **10,3%** |
| Marca de concorrente | 30 | 6 | R$ 16,55 | 10,2% |
| Produto avulso | 34 | 8 | R$ 13,33 | 8,2% |
| Decoração (fora do mix) | 4 | 3 | R$ 10,80 | 6,6% |
| Genérico sem porte | 8 | 3 | R$ 7,83 | 4,8% |

Os quatro últimos = **R$ 48,51 (30%)** em tráfego impossível de converter:

- **Concorrente**: "mb home atacado" (R$5,68), "praticasa importadora" (R$3,69),
  "plasvale atacado", "distribuidora millenium", "utilimix distribuidora". Quem busca o nome de
  um fornecedor já tem fornecedor.
- **Decoração**: "decoração de casa atacado" (R$5,10) e "loja de decoração atacado" (R$4,02) —
  os **dois CPCs mais caros da conta**, e a Nitron não é decoração.
- **Produto avulso**: "esponja de lavar louça atacado", "pote plástico para tempero atacado",
  "vassoura para revenda", "catálogo de louças para revenda". Quem busca um item não abre conta
  com pedido mínimo de R$ 3.500.
- **Sem porte**: "coisas para revender", "comprar e revender produtos" — revender de casa.

> **Ressalva importante:** o relatório de termos do Google cobre R$ 162,59 dos R$ 382,59 (42%)
> e 51 dos 150 cliques. O resto o Google não revela (limiar de privacidade). Os percentuais
> valem para a parte visível; **não dá para afirmar que os outros 58% se comportam igual.**

### 4.3 O cliente real da Nitron quase não aparece

A família "loja de 1,99 / 10 / 20 reais" — literalmente quem a Nitron abastece:

```
fornecedores para loja de 20 reais utilidades ....  4 impressões
utilidades domésticas atacado para loja de 1 99 ..  5
atacado plásticos 1 99 ...........................  2
fornecedores para loja de dez reais utilidades ...  2
atacadão da casa 20 reais ........................  1
```

**35 impressões e 6 cliques em 8 dias.** Nenhuma das 8 palavras-chave usa essa linguagem —
o Google só achou esses termos tateando. É a causa do perfil torto dos leads (4.1 da seção 2).

### 4.4 Aparece em 17% das buscas, e metade da perda é qualidade

| | |
|---|---|
| Parcela de impressões | **17,2%** |
| Perdida por **orçamento** | 33,9% |
| Perdida por **classificação** | **48,9%** |

Em 83% das buscas relevantes a Nitron não aparece. **Verba resolve só um terço** — quase metade
é ranking, que melhora com relevância entre termo, anúncio e landing. Arrumar 4.2 e 4.3 antes
de pôr dinheiro.

### 4.5 Desktop custa 2,4x mais e converte pior

| | cliques | gasto | CPC | CTR |
|---|---|---|---|---|
| Mobile | 139 | R$ 320,79 | R$ 2,31 | 17,5% |
| **Desktop** | 11 | R$ 61,80 | **R$ 5,62** | 13,9% |
| Tablet | 0 | R$ 0 | — | — |

Desktop: 16% do dinheiro para 7% dos cliques.

### 4.6 Estrutura: 1 grupo, 8 palavras quase idênticas

Grupo único ("Grupo de anúncios 1"):

| palavra-chave | cliques | gasto | CPC |
|---|---|---|---|
| utilidades domésticas no atacado | 44 | **R$ 131,30** | 2,98 |
| fornecedor de utilidades domésticas | 26 | R$ 72,22 | 2,78 |
| utilidades domésticas para revenda | 28 | R$ 52,30 | 1,87 |
| utilidades para casa atacado | 22 | R$ 51,17 | 2,33 |
| produtos para casa atacado | 10 | R$ 39,26 | 3,93 |
| utilidades domésticas atacado | 7 | R$ 13,14 | 1,88 |
| atacado de utilidades domésticas | 8 | R$ 12,93 | 1,62 |
| distribuidor de utilidades domésticas | 5 | R$ 10,27 | 2,05 |

As três de cima em negrito são a mesma busca escrita de três jeitos, competindo no mesmo leilão.
Uma só levou **34% de tudo**.

### Geografia (sem problema aparente)
SP lidera (47 cliques, R$133), seguido de MG (17), RJ (15), PR (11), BA (8). Distribuição
nacional coerente com a malha de representantes. **Não é um ponto de ajuste prioritário.**

---

## 5. O funil inteiro, e onde ele quebra

```
Google Search  ──┐
                 ├──►  landing "Acelera Nitron" (Replit)
META (CTWA)    ──┘           │
                             │  formulário: nome, CNPJ, WhatsApp, e-mail
                             │  ❌ NÃO GRAVA NADA. Só monta um texto e abre o wa.me.
                             ▼
                     WhatsApp da Nina (5511960390203)
                             │
                             ▼
                  copiloto-lead  (qualifica)
                             │
                             ▼
                  copiloto-repasse  (sorteia destino)
                       ├── loja física → representante da praça
                       └── online → venda interna (Mônica / Valeria)
                             │
                             ▼
                  copiloto-feedback  (dia 2 cliente, dia 3 rep, dia 5 gestor)
                             │
                             ▼
                       ❌ ZERO VENDAS
```

**Três quebras, em ordem de impacto:**

1. **A landing não persiste nem marca conversão.** Nem gclid, nem UTM, nem tag, nem banco.
   O único vestígio de que um lead veio do Google é a assinatura no texto do WhatsApp.
2. **O Google otimiza às cegas** (consequência de 1).
3. **Nenhuma venda saiu** de nenhum canal — verificado contra o Sankhya em 30/09:
   dos 114 leads com CNPJ, 13 têm cadastro, só 2 já compraram (ambos **antes** de virarem lead),
   zero pedidos em aberto. 5 leads chegaram a ter **cadastro aberto** no Sankhya
   (codparc 221316, 222927, 222988, 223322, 223845 — o 223845 é o 2º mais novo da base inteira)
   e pararam ali. É o degrau anterior ao primeiro pedido, e é onde vale empurrar.

---

## 6. O que fazer, em ordem de retorno

1. **Tag de conversão + persistência do formulário na landing.**
   Três coisas: (a) gravar o lead em banco; (b) disparar o evento de conversão no Google;
   (c) carregar o `gclid` na URL do `wa.me` para fechar o laço clique→lead.
   ⚠️ **Depende de acesso ao Replit.** É o único item que não dá para fazer daqui.
2. **Lista de palavras negativas** — marcas de concorrente, decoração, produto avulso,
   "revender de casa". Devolve ~30% do orçamento. *(pronto para montar, meia hora)*
3. **Palavras-chave da família "loja de 1,99 / 10 / 20 reais".** *(pronto para montar)*
4. **Lance de desktop −40%.**
5. **Separar em grupos por intenção**: "fornecedor/distribuidor", "atacado",
   "revenda loja popular" — em vez de 8 quase-sinônimos num grupo só.
6. **Não aumentar verba antes de 1–3.** Com 48,9% de perda por classificação, dinheiro a mais
   compra mais do mesmo tráfego ruim.

---

## 7. Onde estão os dados (para o chat novo não redescobrir)

### Google Ads
Via **Windsor.ai**, connector `google_ads`. Funciona bem.
- Campanha/dia: `date,campaign,clicks,impressions,spend,conversions,ctr,cpc`
- Palavras-chave: `campaign,adgroup,keyword_text,clicks,impressions,spend` — use
  **`keyword_text`**, não `keyword` (erro de relatórios incompatíveis)
- Termos de busca: `campaign,search_term,clicks,impressions,spend` — **`search_term`**,
  não `searchterm` (esse volta nulo)
- Parcela de impressões: `search_impression_share`, `search_budget_lost_impression_share`,
  `search_rank_lost_impression_share`
- Dispositivo / geografia: `device` / `region`

### META
- **Windsor NÃO está conectado** para `facebook` ("No facebook accounts are configured").
  Conectar deixaria a comparação de CPL automática — **pendência**.
- Alternativa usada: MCP da Meta, conta `434365544371468` (NITRON, BRL),
  `ads_get_ad_entities` com `level: account` e `time_range`.
- **Como identificar lead do META:** campo personalizado **CTWA Clid**
  (`ejUxYhgrxza53vOsaEqs`) no contato do GHL. É o marcador confiável.
  Outros campos de anúncio: Source ID `bjsEdcDBpeQe8OkgfTzh`,
  Source App `WMS7j6yyEUO93ZeQLWMp`, Source URL `0Bj0Q2s45e4q60uH2Xw5`,
  Título `9dAz9876Z0Yk1dpgDmIv`, Corpo `I1sjzcYllikwZzPpQaeT`.

### Leads
Supabase `integracao-crm-sankhya` (`bwbeieumxcuomtrvlqxs`), tabela **`copiloto_lead`**.
- `origem = 'google-acelera'` marca os leads da landing do Google.
- Contagem: `select origem, count(*) from copiloto_lead group by 1`.

### CRM (GoHighLevel)
Location **`rZ8y7lzqV7fzxsartaX2`**, companyId `p3gbsS3CQ18bboTGdhYR`.
- Para varrer mensagens: `export-messages-by-location` com `startDate`/`endDate`,
  `sortBy: "createdAt"` (só aceita `createdAt` ou `updatedAt`), `limit: 1000`,
  e o **mesmo `cursor`** repetido para paginar. Cursor vale 2 minutos.
- `search-conversation` com `query` **não** filtra texto de mensagem — devolve tudo.

### Sankhya
MCP com 19 relatórios prontos, **todos cortam em 200 linhas** e não aceitam parâmetro.
Úteis: `clientes_novos`, `pedidos_pendentes`, `apuracao_clientes_ano_atual`.
- Para cruzar CNPJ, **não use os relatórios** — use a tabela espelhada no Supabase
  **`contato_enriquecido`** (21.330 cadastros, com `cnpj`, `ult_fat`, `dias_sem_compra`,
  `saldo_pedidos`, `situacao`). `ghl_cliente` é mais estreita (10.512) e **não cobre tudo**.

### Landing
SPA React no **Replit**. O texto do formulário monta:
```
Olá, equipe Nitron! Sou {nome} e quero conhecer a tabela Acelera Nitron para revender. (…)

Origem: Campanha Acelera Nitron
CNPJ: {cnpj}
WhatsApp: {fone}
E-mail: {email}

Podem me orientar sobre os próximos passos?
```
Validação do formulário: CNPJ exige 14 dígitos, telefone 10–11. **Não grava nada.**

⚠️ **"Acelera Nitron" é usado para duas coisas diferentes.** Além da landing, existe uma
campanha interna de adesão para **representantes**, com formulário no
`api.hyaksales.com.br/widget/form/...`. Ao buscar por texto, filtre por
`Origem: Campanha Acelera Nitron`, que só a landing escreve.

---

## 8. Pendências e decisões em aberto

| # | o quê | de quem depende |
|---|---|---|
| 1 | Tag de conversão + persistência do formulário na landing | **acesso ao Replit** |
| 2 | Conectar META no Windsor (CPL automático) | gestor |
| 3 | Publicar `copiloto-lead` v12 — marca `origem='google-acelera'` sozinha, aproveita CNPJ e nome do formulário. Commitada em `claude/trazer-copiloto-6ce4pq`, **não publicada** | gestor (publicar mexe em IA que está atendendo) |
| 4 | Lista de negativadas + palavras novas | pronto para montar |
| 5 | Decidir a verba: Google a R$76/lead vs META a R$4,40 | gestor |
| 6 | Os 5 cadastros abertos no Sankhya sem pedido — cobrar quem está com eles | gestor |

### Como os leads são contados hoje (e por que isso importa)
Enquanto a v12 não for publicada, **contar lead do Google é varredura manual**: foi preciso
varrer 7.441 mensagens do CRM para achar o 5º lead (o 290). Toda análise futura paga esse
custo até o item 3 sair.

---

## 9. Regras da casa que valem para qualquer mexida

- **O canal de saída chama-se ZAPTOS**, não WhatsApp (ZaptosWPP acoplado ao GHL).
  "WhatsApp" só quando se fala da plataforma ou do aparelho de quem recebe.
- **Não travar campanha por conta própria** — não cancelar linha, não desligar chave, não marcar
  campanha como inativa. Achou problema? **Reporta e deixa correndo.** Quem para é o gestor.
- **A chave de e-mail (`fila_config.email_ativo`) nunca é desligada.**
- **Nunca colar chave de API no chat.** Não regenerar nem apagar chaves.
- **Nada fala sozinho** (ordem de 16/09): só as rotinas já combinadas — `copiloto-lead`,
  `copiloto-repasse`, `copiloto-feedback`, `campanhas-reativacao`, `nina_outreach` e o painel.
  Qualquer comunicação nova é sob comando.
- **Todo cliente citado a representante leva o CNPJ em linha própria.**
- **Uma sessão de cada vez editando `app/gestor.html`.**
