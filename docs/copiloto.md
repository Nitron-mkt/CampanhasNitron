# Copiloto (Nina) — a IA comercial que atende, vigia e cobra

A Nina é o copiloto comercial da Nitron: oito Edge Functions no mesmo projeto
`integracao-crm-sankhya` (`bwbeieumxcuomtrvlqxs`) que atendem representante e cliente no
Zaptos e no telefone, consultando o **Sankhya ao vivo**.

**Por que este arquivo existe:** até 10/09/2026 o copiloto **não estava em nenhum
repositório** — só existia publicado. Quem publicasse por cima não teria de onde voltar.
O código foi trazido para `supabase/functions/copiloto-*` neste dia; o `CLAUDE.md` dizia
que `copiloto-*` era "de outras empresas do grupo", e não é: é Nitron (Sankhya, `snap_rep`,
`ghl_cliente`, `campanhas`). O que é de outra empresa é o `emp-copiloto-responder`
(Roga Village) — esse continua fora daqui.

## As nove funções

| função | v | verify_jwt | o que faz |
|---|---|---|---|
| `copiloto-conversa` | 58 | não | O cérebro. Recebe a mensagem do GHL, identifica quem falou, chama as ferramentas e responde. Sonnet 5 responde tudo (o Haiku saiu do caminho principal por ser inconsistente). |
| `copiloto-voz` | 25 | não | Discador + webhook da Vapi. Monta o dossiê do cliente, liga, e na volta da ligação aplica a cadência (não atendeu → +1d, até 4 tentativas; interesse → +3d; sem interesse → perdido; senão +7d) e move a oportunidade no funil do GHL. |
| `copiloto-voz-tool` | 1 | não | Executor de ferramentas da voz. A Vapi roda a IA nativamente (fluida) e chama esta função só quando precisa do Sankhya. |
| `copiloto-vigia` | 9 | sim | Varre as conversas do dia, acha cliente que perguntou e **ficou sem resposta** (ou levou "vou verificar"), manda a pendência para o cérebro resolver e entrega a resposta pronta à assistente. |
| `copiloto-tarefas` | 4 | não | A **Fila de Execução**: painel HTML + API. O que a Nina tria das conversas vira tarefa por área (financeiro, execução, cadastro, logística, faturamento, TI, comercial, gestor). |
| `copiloto-aprender` | 4 | sim | Transforma tropeço em regra: falhas viram lição automática; amostra de conversas reais do GHL vira **proposta** de conhecimento e de skill, com gate humano. |
| `copiloto-lead` | 9 | sim | **O lead do anuncio META.** Pergunta ao GHL quais conversas da instancia da Nina estao sem resposta, qualifica pelo playbook, anota em `copiloto_lead` e passa pro comercial com tarefa aberta. |
| `copiloto-entrega` | 3 | sim | **A tarefa que o humano vê.** Pega toda tarefa recém-gravada pelo copiloto, abre a tarefa correspondente **no CRM, no contato** (dono no `assignedTo`, quem acompanha nomeado no corpo), marca os dois como **seguidores** do contato e manda o resumo para quem `copiloto_responsaveis` diz que tem de saber. Fila com retentativa. |
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
| `copiloto_responsaveis` | as 8 áreas × `papel` (`dono` \| `acompanha`) e quem responde por elas — o `dono` vira o `assignedTo` da tarefa no CRM, quem `acompanha` vai nomeado no corpo, e `avisar=true` recebe o resumo |
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
- **`lead_ativo=sim` desde 10/09** — a Nina atende os leads do anúncio de 5 em 5 minutos.

## O lead do anuncio (META -> Zaptos da Nina)

Campanha em video no META (o lojista que tenta descansar na praia e a loja chama de volta), com
clique para o WhatsApp. O clique cai na **instancia da Nina** e o CRM marca o contato com a tag
`ads`. O objetivo e **qualificar e aquecer**; quem fecha e o comercial.

**Era um vazamento, nao um recurso pela metade:** de 09 a 10/09 chegaram tres leads e **nenhum foi
respondido**. O primeiro escreveu 00:10 e esperou 12 horas. Motivo: o `copiloto-conversa` exige
representante ou cadastro; sem os dois ele devolvia `escalonar` e nao respondia nada.

O que faltava — e onde cada peca ficou:

| peca | onde |
|---|---|
| a Nina como instancia de envio | `instancia_ghl`, escopo **`lead`** (de proposito: `cliente` a elegeria para as campanhas ao cliente, `rep` a jogaria no rodizio de assistente) |
| a persona | `assistente_instancia` (sem essa linha ela se apresenta como "o time comercial", sem nome) |
| onde anotar o lead | `copiloto_lead` (status: qualificando → qualificado → passado \| descartado) |
| o roteiro de venda | `copiloto_skills` nome `lead` — **editavel por UPDATE, sem deploy** |
| pedido minimo | `copiloto_config.pedido_minimo` = **2500** |
| a entrega ao comercial | tarefa em `copiloto_tarefas` area `comercial`, tipo `lead-anuncio`, com o texto montado **em codigo** |

**Como ela acha o lead, sem webhook:** pergunta ao GHL quais conversas tem a ultima mensagem
*inbound* (`lastMessageDirection=inbound` = ninguem respondeu), filtra pela instancia — que vem no
rodape da propria mensagem, `Instance Source: Nina` — e so entao busca as mensagens. **Se um humano
responder primeiro, a conversa sai da lista sozinha.** O historico usado no prompt e o do GHL, nao
um espelho nosso: ela le tambem o que pessoa de verdade escreveu no meio.

Tres filtros que existem por motivo concreto:
- **tag `ads` do CRM** decide se e lead, com o regex da primeira frase apenas como rede. O texto que
  o META pre-enche ("Ola! Posso ter mais informacoes sobre isso?") muda no gerenciador; a tag nao.
- **ruido**: codigo de confirmacao do Facebook, `[Undecryptable]` e autoresposta de outra empresa.
  Chegaram mais de 20 dessas em 10 dias — sem o filtro a Nina conversa com robo alheio.
- **numero de representante** cai fora: quem atende rep e o `copiloto-conversa`.

O que ela **nao** faz, e diz que nao faz: preco de produto (o lead nao tem tabela), prazo, condicao
de pagamento, desconto, frete, promessa de visita ou data. Catalogo vai como **link**
(`copiloto_config.catalogo_url`, ja hospedado no Storage), nunca como arquivo de 16 MB.

**Ruído que a operação vai encontrando:** muitos leads são números comerciais com resposta
automática própria — a loja da Nátalie respondeu à Nina em 10/09 com "não estamos disponíveis…". O
filtro embutido cobre os formatos conhecidos e `copiloto_config.lead_ruido_extra` aceita um regex
extra, para o próximo formato entrar por UPDATE, sem deploy.

**Gates:** `lead_ativo` (nasce `nao`), `lead_inst`, `lead_espera_min` (2 — da tempo de um humano
pegar antes), `lead_ate_horas` (48). `?dry=1` monta a resposta **sem mandar e sem gravar** (as
ferramentas de escrita viram simulacao na previa).

**Cuidado ao ligar:** com `lead_ativo=nao` a funcao **ainda chama o modelo** e devolve o rascunho —
e assim de proposito, para conferir texto. Logo o cron so deve existir junto com `lead_ativo=sim`,
senao sao ~480 rodadas por dia gastando modelo para jogar rascunho no lixo.

## Dois canais de entrada, e eles não se misturam

Descoberto em 10/09 ao investigar dois leads que ninguém havia respondido:

| canal | como reconhecer | como responder |
|---|---|---|
| **Zaptos** (instâncias Nina, Juliete, Isadora…) | a mensagem traz `Instance Source: <instância>` no rodapé; `TYPE_SMS` | `campanhas-enviar` com `instancia` — ele amarra o contato (`#contact_instance:`) e o número de saída é o do dono |
| **WhatsApp oficial do GHL** (número 11 94793-4107) | `TYPE_WHATSAPP` / `type: 19`, **sem** marcador de instância | `POST /conversations/messages` com `type:"WhatsApp"` — sem instância, sem dono, sai pelo WABA da conta |

**Responder pelo canal errado é pior que não responder:** o lead escreveu para um número e receberia
resposta de outro, e a conversa se parte em duas. Por isso o `copiloto-lead` decide o canal pela
própria mensagem.

**A janela de 24 horas da Meta só existe no canal oficial.** Passadas ~24h da última mensagem do
lead, texto livre é recusado — só template aprovado passa. A Nina não gasta a tentativa: grava
`status='janela_fechada'` e abre tarefa no comercial (template ou ligação). O limite mora em
`copiloto_config.lead_janela_h` (**23,5** — meia hora de margem). Os dois leads de 09/09 foram
respondidos com 19,7h e 20,4h: era a última janela.

**A campanha do lead vem do CRM, não de adivinhação.** `contact.source` é escrito pelo formulário da
landing (ex. `Atacado Nitron Pro`) e `attributionSource.url` guarda a página e a origem da sessão.
Quando a origem **não** é o anúncio conhecido, o prompt proíbe a Nina de supor oferta, valor ou
condição que possa ter sido anunciada — ela pergunta o que ele viu antes de confirmar qualquer coisa.

**O CNPJ que o lead já digitou.** O formulário grava o documento no contato (campo
`TLRZeTrxxPBsMNRqbdHO`). A Nina não pede de novo, e o código confere antes se esse CNPJ já tem
cadastro — se tiver, ele não é lead novo, é cliente, e vai direto pro comercial.

## O segundo toque (quem não responde)

Até 10/09 a Nina só falava quando o lead falava: quem não respondia à primeira mensagem morria ali,
e "aquecer" não existia de fato. Agora, passados `lead_seguir_min` (**180 min**) sem resposta, ela dá
um toque leve — **de outro ângulo**, no máximo `lead_toques_max` (**2**) vezes, e só em horário
comercial de São Paulo (`lead_toque_horario`), porque o toque é iniciativa nossa. Quem não responde
nem assim fica `status='frio'` **sem virar tarefa**: lead que nunca falou não é trabalho para o
comercial.

O prompt do toque proíbe repetir a pergunta anterior, pressa, escassez e cobrança de resposta; no
último toque ela deixa a porta aberta e encerra.

**Última chance antes da janela:** no canal oficial, se a janela de 24h da Meta vai fechar dentro de
`lead_janela_aviso_min` (**90 min**) e o lead nunca foi tocado, o toque sai na hora — depois dela só
template passa.

**Um lead pode ficar entre as duas passadas, e isso é um bug já corrigido:** se a última mensagem da
conversa é dele mas é o **robô da loja dele**, a passada de inbound pula por ruído e a de seguimento
pularia por "ele respondeu". Aconteceu com a Nátalie em 10/09. O seguimento agora reconhece
autoresposta como não-resposta.

## Quando a Nina termina: a tarefa que o humano vê

Em 10/09 o gestor abriu o painel do contato do lead que a Nina acabara de qualificar (Kasamais, São
Luís/MA) e leu **"Ainda não há tarefas"**. A tarefa existia — em `copiloto_tarefas`, a *nossa* fila —
e **a nossa fila não avisa ninguém**: é uma tabela que alguém precisa abrir. "Isso não pode passar de
jeito nenhum". Então o encerramento passou a ter duas pontas, e quem as executa é o
`copiloto-entrega`:

1. **Tarefa no CRM, no contato** (`POST /contacts/{contactId}/tasks`), com `dueDate` em
   `entrega_prazo_h` (4h), o **dono no `assignedTo`** e quem acompanha **nomeado no corpo** — uma
   tarefa do GHL aceita **um** `assignedTo`. Hoje: dona **Camyla Castro**
   (`CPmJ2iQ1eFHwS15bIxNJ`), acompanha **Leonardo Lucas** (`Yoq6cL8mRr3ICN4EK3st`).

   **Ser avisado não é ser dono.** A primeira versão pôs o gestor como dono da tarefa e ele
   corrigiu na hora: "marcar o Leonardo" era para ele **ficar sabendo**, e quem fecha é o comercial.
   Daí a distinção `papel='dono'` (vira o `assignedTo`) × `papel='acompanha'` (nomeado no corpo e
   seguidor, nunca dono).
2. **Dono e acompanha marcados como seguidores do contato** (`POST /contacts/{contactId}/followers`).
   No GHL é assim que se marca alguém: seguidor vê o contato e recebe notificação. A tarefa em si
   só tem lugar para um. Falhar aqui **não** derruba a entrega — é secundário, e reabrir a tarefa
   por causa disso mandaria o aviso duas vezes.
3. **O resumo por mensagem** para quem tem `avisar=true` — o texto da tarefa inteiro, do jeito que o
   gestor pediu ("como se fosse uma tarefa também"): título, responsável, acompanha, loja, CNPJ,
   praça, o que quer, como compra hoje, se sabe do mínimo, temperatura, o resumo da conversa e o
   link da conversa no CRM. A mesma pessoa em duas áreas recebe **uma** mensagem.

**Por que fora do `copiloto-lead`:** assim a entrega é uma fila, com retentativa, e independe de qual
caminho gravou a tarefa (encerramento com `passar_comercial`, janela de 24h que fechou antes da
primeira resposta, e o que vier). Se o GHL recusar, a tarefa não se perde calada: a rodada seguinte
tenta de novo até `entrega_tentativas_max` (3) e o motivo fica em `copiloto_tarefas.entrega_erro`.
E o lead não espera criação de tarefa e e-mail dentro do turno da conversa dele.

**`entrega_canal` é uma cadeia, não um canal.** Para no primeiro que entrega. O WhatsApp interno
depende de quem é o dono do contato no CRM — o número de saída do Zaptos é o `assignedTo` do
contato, e o `campanhas-enviar` **recusa** quando o dono divirja da instância pedida (com razão:
senão a mensagem sai por outro número, ou por instância pausada, e vira "enviado" sem chegar).

**E não há como contornar isso sem tocar no contato:** o GHL **recusa contato duplicado** nesta
location — `"This location does not allow duplicated contacts"`, testado ao tentar pôr o número do
gestor num contato dedicado —, então o número dele só pode viver no contato que já existe. Esse
contato era da **Isadora**, cuja instância está desconectada desde 03/09 (nada enviado desde então,
61 linhas paradas na fila): o primeiro envio real, 10/09 17:02 UTC, foi recusado com "o contato é da
Isadora no CRM" e **caiu para o e-mail** — que é exatamente o que a cadeia existe para fazer.
Passado o contato `WM5WMybpxqmGP7zoqwZt` para a **Nina**, o envio de 17:26 UTC saiu pelo Zaptos.
Reverter é um campo: `assignedTo` = `WlHZT90d36qnnXFbKzbl`.

**Consequência disso, e ela é séria:** o Zaptos da Nina passou a falar com um contato que tem
`source` preenchido no CRM ("Form 38"). Sinal de lead tão bom quanto a tag `ads` — a resposta do
gestor entraria pela porta da frente e a Nina tentaria qualificar o próprio gestor. Por isso a
`copiloto-lead` v9 tem a trava de **número de casa** (de `copiloto_responsaveis.fone`), ao lado da
que já existia para representante.

| chave | valor | para quê |
|---|---|---|
| `entrega_ativa` | `sim` | liga a fila |
| `entrega_origens` | `nina-lead` | só as tarefas de lead. As `nina-rep` (logística, faturamento) ainda **não têm responsável cadastrado** — entregar sem dono é abrir tarefa que continua invisível |
| `entrega_canal` | `whatsapp,email` | a cadeia, em ordem |
| `entrega_prazo_h` | `4` | vencimento da tarefa no CRM |
| `entrega_janela_h` | `12` | não entrega tarefa velha (a tabela tem meses de histórico) |
| `entrega_tentativas_max` | `3` | quantas rodadas tentam antes de desistir |
| `entrega_aviso_gestor` | `sim` | além da área da tarefa, avisa quem responde por `gestor` |

Endpoints: `?dry=1` mostra o que sairia sem abrir nem mandar nada; `?tarefa=<id>` entrega uma tarefa
específica (mesmo velha ou já tentada) — é o caminho de conserto; `?so_aviso=1` manda o resumo sem
abrir tarefa no CRM. E `crm_task_id` já preenchido **nunca** abre uma segunda tarefa no mesmo
contato: duas tarefas iguais é pior que nenhuma.

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
| `copiloto-entrega-5min` | `1-59/5 * * * *` | `copiloto-entrega` (jobid 148, criado 10/09 17:05 UTC — um minuto **depois** da `copiloto-lead`, para a tarefa recém-gravada já estar lá) |

(Horários em UTC, como todo cron do projeto.)

| `copiloto-lead-5min` | `*/5 * * * *` | `copiloto-lead` (jobid 147, criado 10/09 13:08 UTC) |

**Ligado em 10/09 13:08 UTC** (`lead_ativo=sim` + o cron acima), por decisão do gestor. Na primeira
rodada (13:10) os três leads represados foram respondidos e entregues (`delivered`), cada um pelo
número da Nina — o `#contact_instance:Nina` aparece na conversa antes do texto.

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
5. **O `copiloto-conversa` esta aberto na internet**: `verify_jwt=false` e `COPILOTO_SECRET` nao
   esta definido (conferido em 10/09 — um POST sem cabecalho nenhum e aceito). Quem descobrir a URL
   fala com o cerebro da Nina. Definir o secret exige acertar o cabecalho no fluxo do GHL no mesmo
   passo, senao a entrada para de chegar.
6. **Quatro instancias de representante estao pausadas por queda desde 03/09** (Isadora, Juliete,
   Monica, Valeria) e a "Campanhas Nitron" segue restringida. A da Nina esta de pe.
7. **O anúncio promete R$ 5.000 e a Nina diz R$ 2.500.** O texto do próprio anúncio fica gravado
   no contato (campo `I1sjzcYllikwZzPpQaeT`): *"Atendimento para empresas com CNPJ. Pedidos a partir
   de R$ 5.000."* O gestor instruiu R$ 2.500 em 10/09, e é isso que está em
   `copiloto_config.pedido_minimo`. Ainda há um terceiro número na casa: R$ 3.500, o mínimo da
   Tabela Gestor no regulamento da Campanha Gestor de Carteira. Um UPDATE resolve quando ele decidir
   qual vale.
8. **O texto do anúncio já vem no contato e a Nina não lê.** Ela usa a descrição do vídeo que o
   gestor passou no chat, transcrita à mão na skill `lead`. O contato traz o copy exato que o lead
   viu, o link do post e o id do anúncio — ler dali é mais fiel e sobrevive a troca de criativo.
9. **`copiloto_debug` guarda o payload cru** de toda mensagem recebida, sem expurgo.
