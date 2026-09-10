# Copiloto (Nina) — a IA comercial que atende, vigia e cobra

A Nina é o copiloto comercial da Nitron: sete Edge Functions no mesmo projeto
`integracao-crm-sankhya` (`bwbeieumxcuomtrvlqxs`) que atendem representante e cliente no
Zaptos e no telefone, consultando o **Sankhya ao vivo**.

**Por que este arquivo existe:** até 10/09/2026 o copiloto **não estava em nenhum
repositório** — só existia publicado. Quem publicasse por cima não teria de onde voltar.
O código foi trazido para `supabase/functions/copiloto-*` neste dia; o `CLAUDE.md` dizia
que `copiloto-*` era "de outras empresas do grupo", e não é: é Nitron (Sankhya, `snap_rep`,
`ghl_cliente`, `campanhas`). O que é de outra empresa é o `emp-copiloto-responder`
(Roga Village) — esse continua fora daqui.

## As sete funções

| função | v | verify_jwt | o que faz |
|---|---|---|---|
| `copiloto-conversa` | 58 | não | O cérebro. Recebe a mensagem do GHL, identifica quem falou, chama as ferramentas e responde. Sonnet 5 responde tudo (o Haiku saiu do caminho principal por ser inconsistente). |
| `copiloto-voz` | 25 | não | Discador + webhook da Vapi. Monta o dossiê do cliente, liga, e na volta da ligação aplica a cadência (não atendeu → +1d, até 4 tentativas; interesse → +3d; sem interesse → perdido; senão +7d) e move a oportunidade no funil do GHL. |
| `copiloto-voz-tool` | 1 | não | Executor de ferramentas da voz. A Vapi roda a IA nativamente (fluida) e chama esta função só quando precisa do Sankhya. |
| `copiloto-vigia` | 9 | sim | Varre as conversas do dia, acha cliente que perguntou e **ficou sem resposta** (ou levou "vou verificar"), manda a pendência para o cérebro resolver e entrega a resposta pronta à assistente. |
| `copiloto-tarefas` | 4 | não | A **Fila de Execução**: painel HTML + API. O que a Nina tria das conversas vira tarefa por área (financeiro, execução, cadastro, logística, faturamento, TI, comercial, gestor). |
| `copiloto-aprender` | 4 | sim | Transforma tropeço em regra: falhas viram lição automática; amostra de conversas reais do GHL vira **proposta** de conhecimento e de skill, com gate humano. |
| `copiloto-proativo` | 5 | sim | O plano de hoje do representante, montado **aplicando as campanhas ativas do Gestor** na carteira dele. Editar campanha no painel muda o plano sem tocar em código. |

### Ferramentas que a Nina tem na mão

`buscar_cliente`, `pedido_cliente`, `pedidos_pendentes`, `boleto_cliente`,
`cobranca_cliente`, `saldos_cliente`, `credito_cliente`, `preco_produto`,
`estoque_produto`, `entrega_cliente`, `produtos`, `minha_carteira`,
`gerar_planilha_carteira`, `consultar_conhecimento`, `consultar_sankhya`,
`abrir_tarefa`.

Duas travas que valem a pena conhecer:

- **Preço é da tabela DO cliente** (`TGFEXC` na `CODTAB` dele), não de tabela geral. E
  **representante vê preço; cliente final não.**
- **`consultar_sankhya` é só SELECT** e recusa RH/folha/salário, produção/apontamento,
  contas a pagar/tesouraria (`checarSql()`), com teto de 20 linhas.

## Onde moram os dados

| tabela | para quê |
|---|---|
| `copiloto_config` | as chaves de liga/desliga (`chave`/`valor`) |
| `copiloto_piloto` | **quem a Nina atende** — fora do piloto ela não responde |
| `copiloto_skills` | 7 playbooks ativos: campanhas, cobranca, logistica, relatorio-contexto, representante, vendas, voz |
| `copiloto_licoes` | 106 lições ativas (treino por Zaptos + auto-aprendizado) |
| `copiloto_pendencias` | 193 linhas do vigia (detectada / resolvida / escalar / precisa_info / fechada_humano) |
| `copiloto_tarefas` | 68 tarefas da Fila de Execução |
| `copiloto_aprend_proposta` | 180 propostas **pendentes** de aprovação |
| `copiloto_responsaveis` | as 8 áreas e quem responde por elas |
| `copiloto_alertas` | 33 alertas (lookup_falhou, esquiva, cliente_desconfiou) |
| `copiloto_aprendizado`, `copiloto_debug`, `copiloto_treino_estado` | histórico, payload cru e o estado do modo treino |

## Como está regulada hoje (10/09/2026)

- `copiloto_ativo=sim`, `copiloto_nivel=4`, assistente `Nina`.
- **`piloto_apenas` não está na config, e o padrão do código é `sim`** — ou seja, a Nina
  só responde a quem está em `copiloto_piloto`. Hoje é MILTON (codvend 17), nos dois
  números. Todo o resto cai em "fora do piloto".
- `proativo_ativo=nao` — o plano de hoje só sai com `?dry=1` ou `fone` explícito, mesmo
  com o cron `copiloto-proativo-diario` rodando.
- `vigia_ativo=sim` mas `vigia_avisar=nao` — a resposta pronta **não** vai para a
  assistente; vai para o `vigia_teste_fone` marcada como teste.
- `alerta_ativo=nao` — os alertas são gravados, não avisados.
- `aprendizado_ativo=sim` — daí as 180 propostas esperando OK.
- A Fila de Execução é servida pela própria função, com gate por token em
  `copiloto_config.tarefas_token` (`?k=<token>`). O token **não** está neste repositório.

## Crons

| job | quando | função |
|---|---|---|
| `voz-discador` | `*/2 * * * *` | `copiloto-voz` |
| `vigia-detectar` | `0 11-22 * * 1-6` | `copiloto-vigia` |
| `vigia-resolver` | `5,20,35,50 11-22 * * 1-6` | `copiloto-vigia` |
| `vigia-avisar` | `10,25,40,55 11-22 * * 1-6` | `copiloto-vigia` |
| `vigia-digest` | `30 21 * * 1-6` | `copiloto-vigia` |
| `copiloto-aprender-diario` | `0 11 * * *` | `copiloto-aprender` |
| `copiloto-proativo-diario` | `30 10 * * 1-6` | `copiloto-proativo` |

(Horários em UTC, como todo cron do projeto.)

## O que este repositório mudou em relação ao que está publicado

**Havia chave `service_role` chumbada no fonte de cinco das sete funções** —
`copiloto-conversa` (duas vezes: a constante e um `Authorization: Bearer` literal na
chamada ao `copiloto-aprender`), `copiloto-tarefas`, `copiloto-aprender`,
`copiloto-proativo` e `copiloto-voz-tool`; em `copiloto-vigia` e `copiloto-voz` ela era o
fallback do `SRV_JWT`. É um JWT de administrador do banco, válido até 2036. Mesmo caso do
que saiu de `campanhas-saldo`, `campanhas-keyaccounts` e `cross-sell-abc` em 31/08.

Aqui todas usam a variável, como o resto do projeto:

```ts
Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
```

**Consequência:** o fonte deste repositório e o que está no ar **divergem nessa linha até
alguém publicar**. Publicar é decisão do gestor — mexe em IA que está atendendo. Quando
for: as sete de uma vez, e vale conferir que o secret `SRV_JWT` continua preenchido
(sem ele o `SUPABASE_SERVICE_ROLE_KEY` vem `sb_secret_` e o PostgREST recusa com
PGRST303 — é a queda de 23/08).

**Pegadinha do deploy:** o `copiloto-aprender` está publicado com o arquivo na **raiz**
(`index.ts`), não em `supabase/functions/copiloto-aprender/index.ts` como as outras. Aqui
ele está na pasta, igual ao resto do repositório — quem publicar precisa apontar o
entrypoint certo.

## Pontas soltas

1. **180 propostas de aprendizado pendentes.** O `copiloto-aprender` roda todo dia e
   empilha; aprovar é por Zaptos (`aprovar 12,15`) ou
   `copiloto-aprender?acao=aprovar&ids=...`. Ninguém aprovou nada até agora.
2. **O vigia acha e resolve, mas não entrega.** `vigia_avisar=nao` desde o começo: as
   respostas prontas param no telefone de teste. Ligar é uma decisão, não um conserto.
3. **A Nina atende uma pessoa.** Com `piloto_apenas` no padrão, os demais
   representantes não têm copiloto. Alargar é povoar `copiloto_piloto`.
4. **`copiloto-voz` disca a cada 2 minutos** contra a fila que o comentário da v21 dimensiona em ~3.178 clientes
   (reativação + giro vencido + giro a vencer + autoatendimento codvend 67). É a função
   mais caríssima de errar: ela liga de verdade.
5. **`copiloto_debug` guarda o payload cru** de toda mensagem recebida, sem expurgo.
