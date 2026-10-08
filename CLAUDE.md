# Máquina de Vendas Nitron — o que qualquer sessão precisa saber antes de mexer

Projeto Supabase `integracao-crm-sankhya` (`bwbeieumxcuomtrvlqxs`).
Painel do gestor: https://gestordecampanhas.marketing-da5.workers.dev/ (arquivo `app/gestor.html`).

## Vocabulário — não é preferência, é precisão

**O canal de saída chama-se ZAPTOS, não WhatsApp.** A Nitron não usa o WhatsApp Business
diretamente: manda pelo ZaptosWPP, acoplado ao GHL. Ao falar de mandar comunicação — no chat, nos
rótulos da tela, nos textos que a operação lê — o canal é **Zaptos**.

Continua sendo "WhatsApp" só onde é verdade que se fala da plataforma ou do aparelho de quem
recebe, e trocar seria mentira:

| diz WhatsApp | por que |
|---|---|
| "número fixo — sem WhatsApp" | é o app do destinatário que não existe num fixo |
| "template aprovado pela Meta para WhatsApp frio" | quem aprova template é a Meta |
| "a Teak usa o WhatsApp nativo do GHL" | outro canal, não o Zaptos |
| "revalidar WhatsApp/e-mail/Instagram do contato" | são os canais do contato |

Os valores internos seguem `whatsapp` (coluna `fila_envio.canal`, `fila_config.wpp_ativo`,
`wpp_max_min`). **Não renomeie isso**: são dados e chaves de configuração, com histórico gravado —
renomear exigiria migrar linhas e funções sem ganho para quem lê a tela.

## Regras permanentes da operação (o gestor pediu, valem até ele desdizer)

1. **A chave de e-mail (`fila_config.email_ativo`) NUNCA é desligada.** Nem "por segurança", nem
   durante investigação, nem ao parar uma campanha de Zaptos.
2. **Não desligar a chave de Zaptos (`wpp_ativo`) por hábito.** Ela não é ferramenta de
   diagnóstico. Quando algo precisa parar, pare *o que está errado* — a campanha, a instância —
   não a fila inteira.
3. **NÃO travar campanha no painel.** Dito em 28/08: não cancelar linha, não desligar chave, não
   marcar campanha como inativa por conta própria. Achou problema? **Reporta e deixa correndo** —
   quem decide parar é o gestor. Continuam automáticos e permitidos apenas: a trava de duplicidade
   no enfileirar e a pausa da instância que cai (o GHL aceita e o Zaptos não entrega — sem isso a
   linha viraria "enviado" mentindo).
4. **Campanha de cliente não vai para representante.** A aba aberta manda no público
   (`publicoAtivo()`); nenhum representante nasce marcado.
5. **Teto de 2 mensagens por minuto por instância** (`fila_config.wpp_max_min`).
6. **Horários da tela são de São Paulo**, fixo, não do navegador (`hl()`).

## Coisas que já custaram caro — não redescubra

- **"Aceito pelo GHL" ≠ "entregue".** O GHL responde `status: sent` e o ZaptosWPP escreve
  `[System]: <instância> - The instance is disconnected.` na conversa 2–8s depois. Esse é o
  **único** sinal observável: não há campo no CRM nem status de contato. `campanhas-enviar` espera
  ~12s e checa (`ENTREGA_CHECK_MS`); em 26/08, sem isso, 8 mensagens viraram "enviado" sem chegar.
- **O número de saída é o `assignedTo` do contato.** `fromNumber` **não funciona** (testado 26/08).
  `#contact_instance:<token>` governa só a entrada. Sem dono, a mensagem não sai.
- **`SUPABASE_SERVICE_ROLE_KEY` vem com valor `sb_secret_`** que o PostgREST recusa (PGRST303).
  Toda função usa `const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";`
- **Chave de serviço escrita no código: já não há em `campanhas-saldo`, `campanhas-keyaccounts` nem
  `cross-sell-abc`.** As duas carregavam um JWT `service_role` literal como fallback do
  SRV_JWT — chave de administrador do banco, no fonte, válida por anos. Retiradas em 31/08; as duas
  usam `srvKey()` como todo o resto. Se aparecer outra, tire: a variável SRV_JWT existe e funciona.
- **Publicar o painel:** `POST host-upload?path=gestor.html` com o **HTML cru no corpo** e o caminho
  na query — não JSON. **Confira o md5 publicado antes de subir:** há outro chat editando o mesmo
  arquivo, e sobrescrever o trabalho dele já aconteceu.
- **Contato de teste em `rep_contato_extra` sai caro.** Números e e-mails internos foram cadastrados
  a mão (`rotulo='manual'`) em 11–24/08 e ficaram ativos: toda campanha ao rep mandava também para
  eles. Em 27/08, 6 dos 10 Zaptos e 4 dos 11 e-mails do Clube a vencer foram para contato interno.
  Regra que os identifica: **o mesmo valor em mais de um rep não é contato daquele rep.** Todos os
  manuais estão desligados desde 28/08.
- **Todo cliente citado ao representante leva o CNPJ, em linha própria.** Pedido do gestor em
  28/08: por nome fantasia ou razão social o rep não acha o cliente no sistema dele; pelo CNPJ acha.
  Vale em **toda** comunicação interna, não só nas campanhas — o gestor cobrou isso explicitamente
  ("em todas as comunicações que mandamos para os representantes"). Onde está: `campanhas-disparar`
  (Clube, voucher, giro, motor), `campanhas-roteiro`, `campanhas-preview` (a prévia da tela),
  `campanhas-bulk` (os cinco pipes operáveis), `campanhas-saldo`, `campanhas-prep`,
  `campanhas-cobranca`, `campanhas-retorno`, `campanhas-agendar`, `campanhas-redes` e
  `campanhas-keyaccounts`. **Na mensagem AO CLIENTE não entra**: ali seria o documento dele mesmo.
  O documento vem de `contato_enriquecido.cnpj` (ou `roteiro_cliente_apto.cnpj` / `ghl_cliente.cnpj`)
  — 14 dígitos crus, alguns cadastros são CPF e um cliente do Uruguai tem RUT de 12; `fmtDoc()`
  rotula cada caso e omite a linha quando não há documento.
- **A IA NUNCA escreve o CNPJ, e não escreve mais a lista de clientes.** Onde a mensagem era escrita
  inteira pela IA a partir do contexto (cobrança, retorno, agendar), ela reescrevia nome, valor e
  número de pedido — com CNPJ isso passa a ser inaceitável: um dígito trocado manda o rep para outra
  empresa. Agora a IA escreve só o texto em volta e o marcador `[LISTA]`; a lista entra depois,
  montada em código, e sem o marcador cai no modelo fixo. Efeito colateral bom: os nomes das lojas
  pararam de sair abreviados ("Suzano" onde é "SUPER SHOPPING DA UTILIDADE SUZANO"). No
  `campanhas-keyaccounts`, que é texto corrido sobre uma conta só, a identificação vai **anexada** no
  fim e o prompt proíbe a IA de escrever documento.
- **A prévia da tela e a mensagem leem a MESMA regra.** Em 31/08 o gestor conferiu a prévia e não viu
  CNPJ: a mensagem já trazia, mas a prévia monta a lista com regra própria (`bulletEx()` no painel) e
  o `campanhas-preview` não devolvia o dado. Agora o preview devolve `doc` **pronto** — máscara e
  sufixo incluídos — e a tela só imprime. Se o sufixo mudar na função, a tela acompanha sozinha.
- **Nome e CNPJ são sempre da mesma loja.** As listas consolidam por matriz, mas a matriz nem sempre
  está na lista (5 dos 13 grupos do giro vencido): usar o codparc da matriz dava nome de uma loja com
  o documento de outra. Quando a linha resume mais de uma loja, o texto marca `(desta loja)`. No
  Clube o CNPJ é o da **matriz do contrato**, e esse sufixo só aparece nos 18 dos 68 grupos que de
  fato têm mais de uma loja — dizê-lo nos outros 50 mandaria o rep procurar uma rede que não existe.
- **Cada campanha de produto tem sua PRÓPRIA fonte.** O `crosssell` do `cross-sell-abc` sempre foi
  uma mistura: curva A do canal que o cliente não compra **+** lançamentos marcados
  `(lançamento)`. Isso fez "Sugestão de produtos p/ a visita" e "Lançamentos — produtos novos"
  mandarem a mesma mensagem, com os mesmos produtos: dos 529 clientes da audiência (`situacao='Em
  dia'`), **528 não tinham nenhuma curva A em falta** — já compram tudo o que o canal deles compra.
  Sobrava só lançamento nas duas. Agora:
  | campanha | campo | audiência |
  |---|---|---|
  | Sugestão de produtos p/ a visita (`rep_sugestao_produto`) | `ghl_cliente.curva_a` | 149 clientes, 35 reps |
  | Lançamentos — produtos novos (`recompra_novo_produto`) | `ghl_cliente.novidades`, cada linha marcada `(Lançamento)` | 528 clientes, 51 reps |
  | Aumento de ticket — cross-sell (`recompra_cross_sell`) | `ghl_cliente.crosssell` (a mistura) | 529 clientes |
  `curva_a` é escrito pelo `cross-sell-abc` (é o `abcGap` que já existia lá dentro, agora gravado em
  vez de só concatenado). **`recompra_cross_sell` é hoje a união das outras duas** — se voltar a
  incomodar, é decisão de negócio: ou vira só curva A, ou é retirada.
- **O texto da campanha de lançamentos é o formato que o gestor aprovou em 01/09.** Ele comparou as
  duas mensagens e preferiu a da sugestão: levantamento para a visita, benefício pelo lado do
  lojista, "nada é obrigatório — você decide", de onde saiu a sugestão, oferta concreta (material de
  PDV, amostra, argumento, informação antes do contato) e pergunta aberta no fim. O `CTX` da
  `recompra_novo_produto` pede esse roteiro em seis passos. E **proíbe o ângulo de concorrência**: a
  IA escreveu "chegar antes da concorrência", que o `TOM_REP` já vetava — agora está vetado também
  no contexto da campanha, nome por nome ("sair na frente", "antes que outro leve").
- **O bloco de contatos do representante é UM só, e mora no painel.** `repContatosHTML()` monta
  telefone e e-mail agrupados por canal, com rótulo de origem (Sankhya, CRM, CRM·casado, manual),
  ✕ para excluir o manual e "+ telefone / + email". Ele se alimenta de
  `{telefones:[{valor,rotulo}], emails:[...]}` — formato que só o `campanhas-preview` devolvia, e por
  isso o roteiro de visitas tinha uma listinha própria e pobre. O `campanhas-roteiro` passou a
  devolver o mesmo formato (as três funções são cópia deliberada do preview: mesma fonte, mesmos
  rótulos). **O container tem de se chamar `repct-<codvend>`** — é nele que `removeRepContato()`
  redesenha o bloco depois de excluir um contato manual.
- **A fila barra duplicidade** (`fila-enfileirar` v18): mesmo `(campanha, canal, destino)` no mesmo
  pedido, ou já pendente/entregue nas últimas `ANTI_DUP_HORAS` (12). O destino é normalizado —
  `11970399053` e `+5511970399053` são o mesmo WhatsApp. Antes, três cliques mandavam três vezes.
- **Parâmetro de negócio mora no banco, não em constante.** Janela do Clube a vencer:
  `campanhas.filtros_padrao->>'clube_venc_dias'`. Textos de trava: tabela `fila_trava_motivo`.
  Motivo: mudaram duas vezes num dia, e duplicar em duas funções deixa tela e disparo discordando.

## Roteiro de visitas — regras que vieram da operação

- **Uma semana, no máximo** (`DIAS_SEMANA = 5`). **4 a 6 visitas/dia** — `MIN_VIS_DIA = 4` é piso:
  dia com menos de 4 não vira dia. Rota de 20 dias ninguém executa; viagem por 2 clientes também não.
- **O dia se enche pelos MAIS PRÓXIMOS, não pelos mais valiosos.** A prioridade decide *para onde ir*
  (a semente/região); chegando lá, visita-se quem está ao lado. Preencher por prioridade dava dias
  cheios e horríveis: 6 visitas espalhadas em 150km. Depois da mudança, raio médio em SP caiu de
  ~135km para 4–6km.
- **Rep sem cluster de 4 não recebe rota** (`rota_possivel:false` + `aviso`, mensagem vazia). São 32
  dos 84 reps — a carteira apta existe mas está espalhada. Para eles visita não é o instrumento.
  O painel mostra o motivo e **não** oferece caixa de texto nem botão de envio.
- **Os números da rota moram no banco**, não em constante: `campanhas.filtros_padrao` de
  `rep_roteiro_visitas` → `roteiro_max_km` (raio do dia, **100**), `roteiro_min_dia` (4),
  `roteiro_vis_dia` (6), `roteiro_dias_semana` (5), `roteiro_raio_semana_km` (300). Ajustar por
  UPDATE, sem deploy. O raio já mudou de 150 → 100 e o piso nasceu inexistente: é parâmetro de
  operação. Corte 150→100km custou 1.236→1.127 pontos com dia viável e 52→50 reps.
- **DENIZE (codvend 116) é agência de representantes, não rep de rua.** O objetivo com ela é
  levantar informação de cliente sem compra e repassar — não montar rota. Deixar como está; não
  "consertar" as contas dela que ficam fora da região.
- **A semana mora numa região só**: mesma UF e dentro de `RAIO_SEMANA_KM` da âncora, e cada dia
  começa onde o anterior terminou. Segunda em SP, terça no RJ e quarta em SP de novo não é rota.
- **A âncora é o centro da melhor semana, não o maior cliente.** Escolher pelo faturamento dava
  semana de 9 visitas para quem tem carteira espalhada (DENIZE: 181 contas em 19 UFs).
- **Quem entra é quem fechou o PRÓPRIO ciclo** (`dias >= contato_enriquecido.giro`, 30 a 90 dias
  conforme o cliente) — não um limite fixo. Fora: pedido em aberto (`saldo_entregar > 0`),
  inadimplente, título vencido e **bloqueado no Sankhya** (`parc_bloqueado`, de `TGFPAR.BLOQUEAR`).
- **PEDIDO conta como compra, não só o faturamento.** O `dias` do snapshot vinha só de nota emitida
  (`TGFCAB` `TIPMOV='V'`, `STATUSNOTA='L'`): quem *pediu* e ainda não foi faturado aparecia como quem
  parou de comprar — 163 dos 2.071 aptos tinham pedido no sistema, **142 com o pedido travado
  aguardando liberação interna nossa**, e o rep ia visitar quem acabou de comprar. O filtro que
  existia (`ce.saldo_entregar > 0`) não pega esses: `saldo_entregar` só é preenchido quando o pedido
  foi *parcialmente* entregue; nos 163 vinha NULL. Agora `roteiro-refresh` grava `ult_pedido` e
  `dias_pedido` (`TIPMOV='P'`, faturado ou não, 24 meses) e a view expõe `dias` como o **menor entre
  faturamento e pedido** — faturar é etapa nossa, não dele. `dias_fat` continua exposto para
  auditoria. **Conta todo tipo de pedido de venda, inclusive bonificado e troca** (198 e 179 notas em
  60 dias) — se o gestor quiser tirar esses dois, é filtro de `CODTIPOPER` nas subqueries `ped`/`ab`.
- **Pedido EM ABERTO recente também exclui.** `pedido_aberto_dias` (o `TIPMOV='P'` com `PENDENTE='S'`
  mais recente) tem de ser >= `filtros_padrao->>'roteiro_pedido_aberto_dias'` (**120**). Sem isso
  sobravam 32 clientes com pedido parado há ~1 mês: pediram, está travado na liberação, e o ciclo
  venceu de novo. Acima de 120 dias o pedido é abandonado, não compra — por isso 282 dos aptos ainda
  têm pedido em aberto. Efeito das duas regras: **2.065 → 1.790 aptos** e 50 → 47 reps com rota.
- **`roteiro_cliente.uf` é o CODUF numérico do Sankhya** (1=SP, 2=MG, 7=RJ, 9=PA…), não a sigla.
- O filtro mora na **view** `roteiro_cliente_apto`, não na função, para tela e disparo contarem a
  mesma audiência.
- **Tom ao representante:** ele já atende esses clientes e conhece a praça melhor que nós. A
  mensagem se apresenta como sugestão montada de fora, diz que ele pode ignorar, e oferece apoio.
  Nunca cobra visita, prazo ou resultado.

## Segurança — restrições dadas pelo gestor

- **Nunca colar chave de API no chat.**
- **Nunca clicar "Disable JWT-based API keys"** em Settings → API Keys → Legacy: o painel depende
  da anon key legada embutida no HTML.
- Não regenerar nem apagar chaves; não trocar senhas.

## Estado conhecido (28/08/2026)

- **Zaptos da instância "Campanhas Nitron" está RESTRINGIDO pelo WhatsApp.** Sem previsão. A fila
  segue LIGADA; a restrição está registrada como pausa dessa instância (`instancia_ghl.pausada_em`).
  As outras seis instâncias trabalham normalmente.
- **Clube a vencer / distrato está em STAND BY** (`ativa=false`) desde 28/08, por decisão do gestor.
- **Reativação 180 dias** só volta quando o gestor mandar; as 43 linhas restantes estão canceladas.
- 9 das 13 campanhas ativas são só Zaptos; 4 aceitam e-mail. 77 de 79 representantes têm e-mail,
  e 5.969 clientes também.

## Onde o repositório mora (e por que há dois rótulos na barra lateral)

O repositório é **`Nitron-mkt/CampanhasNitron`** — foi renomeado de `whatsapp` em 03/09. O GitHub
mantém redirecionamento, então sessões antigas com a URL `.../whatsapp` gravada continuam
empurrando certo, e é só por isso que a barra lateral mostra os dois nomes: o grupo é montado pelo
nome da URL que a sessão guardou ao nascer, não pelo repositório de verdade. **Não há repositório
duplicado.** A branch padrão é `claude/supabase-access-8190et`.

**Uma sessão de cada vez editando `app/gestor.html`.** Duas já sobrescreveram trabalho uma da outra.
Ao abrir sessão nova, encerre as antigas.

## Hyak WhatsApp — o gateway que substitui o Zaptos

O **Hyak WhatsApp** não é uma campanha nem um schema: é o **gateway de WhatsApp do grupo** —
Evolution API (Baileys) + um bridge em Node numa VPS, ligado ao GHL como provedor de SMS. Dois
provedores convivem no app e **a distinção importa**:

| provedor | id | papel |
|---|---|---|
| Hyak WhatsApp **SMS** | `6aa320fd652d120992c7a592` | **entrega** — é o provedor padrão da subconta, por onde a Nina e as campanhas saem |
| Hyak WhatsApp | `6aa2d8476548eab979ff881e` | **entrada** — por onde o cliente chega, e por onde o bridge espelha o que foi digitado no celular |

**Quem usa (varrido nas 43 subcontas do GHL em 29/09):** Teak, Roga e Constelação têm o gateway
como padrão. Nitron, Hyak International e Mood Distribuidora têm instalado mas ainda não usam
(a Mood sem padrão nenhum definido). O resto segue na Zaptos ou sem provedor.

**Mensagem digitada no celular aparece no CRM** desde 02/10. Antes, o webhook do bridge
descartava todo `fromMe` e o CRM só mostrava metade da conversa — a IA achava que ninguém tinha
respondido ao cliente e respondia por cima.

**Quem escreveu uma mensagem NÃO se descobre pelo `source`.** Toda mensagem postada por API no
GHL chega com `source: "api"` — a da IA, a que a pessoa digita no CRM e o espelho do celular.
O que separa é `userId` + `conversationProviderId`:

- **com `userId`** → pessoa digitando no CRM;
- **sem `userId` e pelo provedor de ENTRADA** → pessoa digitando no app do WhatsApp;
- **sem `userId` e pelo provedor de SAÍDA** → IA/campanha.

É assim que a `emp-copiloto-responder` (v14, 29/09) monta o histórico. Antes ela usava `source`
e lia mensagem de humano como se fosse dela.

**Cada subconta tem um atendente diferente, e isso não é óbvio:** a **Roga** é atendida pela
`emp-copiloto-responder` no Supabase; a **Teak**, por uma sessão do Claude via MCP do GHL
(`meta.marketplace.appName: "lc-mcp - Anthropic"`). Correção em uma não vale para a outra.

**`The instance is disconnected.` entra como mensagem de ENTRADA**, com o telefone do cliente no
`from`. Na caixa (e para a IA) parece fala do cliente — foi o que atrasou o diagnóstico da queda
da instância "Marcelo" em 02/10.

### Aviso de sistema NUNCA chega ao WhatsApp de ninguém (regra do gestor, repetida em 05/10)

O `#contact_instance:<instância>` é **comando, e só comando**. O que ele produz — o ack
`Contact Instance Updated!`, o `The instance is disconnected.`, o `The specified instance does not
exist.` — é conversa entre sistemas e **mora apenas no CRM**. Não vai para o aparelho do cliente,
e não vai para o número interno.

Em 05/10 o gestor recebeu no próprio celular `[System]: Contact Instance Updated!`. Como **toda**
mensagem do `emp-enviar` é precedida de um bind, se o ack é entregue, *todo* destinatário recebe
esse texto antes da mensagem de verdade.

Duas regras, as duas valem para qualquer bridge (Zaptos, Hyak WhatsApp ou o que vier):

1. **O ack e os avisos de sistema são postados pelo endpoint que REGISTRA, nunca pelo que ENVIA.**
   `POST /conversations/messages/inbound` grava na conversa sem entregar;
   `POST /conversations/messages` ("Send a new message") **entrega pelo provedor**. Trocar um pelo
   outro é o que faz o aviso vazar para o cliente. Na versão do bridge de 21/09 o ack ia pelo
   endpoint certo e sem o prefixo `[System]:`; a versão no ar em 05/10 tem o prefixo e chegou ao
   celular — o caminho mudou junto.
2. **No `/ghl/outbound`, texto que comece com `[System]:` nunca é entregue** — a mesma trava que
   já existe para o `#contact_instance`. Marca como entregue para o GHL não repetir, e descarta.
   É cinto de segurança: mesmo que alguém poste pelo caminho errado, não vaza.

E o aviso de sistema, quando gravado no CRM, **é nosso, não do cliente**: hoje entra como mensagem
de ENTRADA com o telefone do cliente no `from`, e passa a impressão (para quem lê a caixa e para a
IA) de que foi o cliente que disse aquilo. No Zaptos aparecia como originado do próprio número.
Deve ser gravado como saída/nota nossa.

A configuração completa do gateway (VPS, app do Marketplace, roteamento, runbook de migração e
troubleshooting) é mantida pelo Ricardo em `CONFIGURACAO-HYAK-WHATSAPP.md`. **Esse arquivo não
está neste repositório** — ele traz IP da VPS, endpoints e identificadores do app, e o repositório
é público. Peça a ele, ou veja `docs/whatsapp-gateway/` do lado dele.

## Nina — Autoatendimento da Teak

*(mesma coisa, outros nomes: **Nina da Teak**, **Autoatendimento Teak**, atendimento virtual da
Teak, "a IA que responde os leads da Teak", instância `Autoatendimento`. Manual completo em
[`docs/nina-teak/`](docs/nina-teak/README.md).)*

**Existem DUAS coisas chamadas "Nina" e elas não são a mesma.** Confundir já custou um
diagnóstico errado em 07/10:

| | Nina **da Teak** | Nina **do Supabase** |
|---|---|---|
| o que é | sessão do Claude + corrente de Routines, agindo no GHL pelo MCP | edge function `emp-copiloto-responder` |
| quem usa | **Teak** | **Roga Village** (`roga-responder-3min`) |
| latência | ~1 hora, varredura em lote | ~3 minutos |
| estado | **no ar, respondendo lead sozinha** | funciona — mas **nunca foi ligada para a Teak** |

A da Teak **não é edge function, não é cron, não é tabela**. Procurar por ela no Supabase não
acha nada: ela mora nas Routines.

**Onde ela está:** sessão `session_018p5VgFu7232CT4sLsikHdP` ("Nina — Autoatendimento da Teak"),
subconta GHL `DRhJc78pTfF9dlaH5NK9`, assinando como app `lc-mcp - Anthropic`
(`6a3e39daceb2ab00111df10c`) pelo provedor de saída `6aa320fd652d120992c7a592`. As Routines
levam o prefixo `Nina — Autoatendimento da Teak`; **o `prompt` da Routine habilitada é o manual
de operação do dia** — é ali que se mexe, não no banco.

**Duas instâncias, dois papéis:** `Autoatendimento` só fala com interno (relatório ao gestor e
ao Marcelo); `Marcelo` é por onde ela fala com lead — ela lê o `Instance Source` do inbound e
responde **pela instância que originou a conversa**, para não atropelar o vendedor.

**A corrente depende dela mesma.** Cada Routine é one-shot e a seguinte só existe se a sessão a
criar. Se uma rodada falhar sem reagendar, **o autoatendimento morre em silêncio** — não há cron
de segurança, nada avisa. É a fragilidade nº 1. A memória dela (`respondidos.txt`, `ACHADOS.md`)
vive em scratchpad volátil de outro container.

**O que ela nunca faz** (regras do prompt, não do banco): não anuncia condição comercial (preço,
frete, mínimo, prazo, exportação) — já errou inflando o mínimo e perdeu um lead; não deduz
segmento, nome nem gênero; não age pelo campo do CRM, lê a conversa real; não encosta nos ~26
contatos que são do Marcelo; não diz "fechou" antes de material, medidas, fixação, prazo e
pagamento aceitos; não lê áudio, vídeo nem PDF-imagem — diz isso em vez de fingir.

**Ligar a Nina do Supabase para a Teak** (se o gestor mandar) tem cinco peças faltando e uma
armadilha: `teak.conversa_estado` hoje é a tabela do **classificador** (`conversation_id`,
`etapa`, `classificado_em`) e **não tem** as colunas que o respondedor grava (`conversa_id`,
`assumida_em`, `humano_ate`, `decidido_em`) — ligar sem resolver isso **quebra**. As outras
quatro e o modo rascunho estão no doc.

## Constelação das Frutas (ex-Hyak) — o outro inquilino do mesmo banco

O projeto que o Ricardo chamava de **Hyak WhatsApp** existe, está rodando e mora no
**mesmo projeto Supabase**, em schema próprio: **`constelacao`**. Nasceu como gaveta
`hyak` em 19/08 e foi renomeada 79 minutos depois (migrações `hyak_gaveta_estrutura` e
`renomear_hyak_para_constelacao`) — por isso não se acha nada procurando por "Hyak".
É prospecção fria multilíngue vendendo limão Taiti a atacadistas europeus.

O que qualquer sessão precisa saber antes de encostar:

- **É outro inquilino, não outra campanha.** RLS ligado, `anon`/`authenticated` revogados,
  não lê nem escreve no `public`. Mexer na Máquina de Vendas da Nitron não afeta a
  Constelação, e vice-versa. As 13 funções `constelacao-*` são dela; as `campanhas-*`,
  `pipe-*`, `nina-*` e `motor-*` são da Nitron.
- **O canal de WhatsApp dela NÃO é o Zaptos — é o Evolution**, acoplado ao GHL pelo canal
  de SMS (a mensagem sai com `type: "SMS"`). Os dois provider ids convivem em
  `constelacao.config`. Não confunda com o vocabulário da Nitron, onde o canal é Zaptos.
- **A fila de WhatsApp dela está pausada desde 14/09** (`fila_config#2.pausado=true` +
  `config.pausa_manual='sim'`), com 566 pendentes. É trava proposital: o cron
  `constelacao-watchdog` só despausa quando `pausa_manual` não for `sim`. Religar é
  decisão, e exige a instância do Evolution conectada antes.
- **`hyak-contatos-sync` é entulho**: função ativa apontando para o schema `hyak`, que não
  existe mais. Nenhum cron a chama.
- **As funções da Constelação não estão versionadas** neste repositório — vivem só no
  Supabase. É a pendência nº 2 da lista dela.

Documentação completa em [`docs/constelacao-ue/`](docs/constelacao-ue/README.md), com a
foto do estado em 18/09/2026 como ponto de partida.

## Campanha Gestor de Carteira (arquivada em 03/09)

Regulamento rev5 + apresentação final em `docs/campanha-gestor-de-carteira/` (originais, texto
extraído e o relatório de validação no `README.md`). Mecânica: o rep recebe a Tabela Gestor (prazo
médio 45d, 60 no N/NE, pedido mínimo R$ 3.500) e a mantém positivando **50% da carteira congelada**
e atingindo **90% da meta**, as duas juntas, por ciclo de 4 meses. Ciclo 1 = 01/09 a 31/12/2026, o
único confirmado.

O que isso cobra de nós (item 10 do regulamento: apuração automática do Sankhya, painel mensal):
- **A foto da carteira de 01/09/2026 não existe.** O prazo de 30 dias de contestação já corre.
- **`rep_carteira` usa as mesmas palavras com outra conta** — `clientes` é a base inteira do rep
  (869 na DENIZE), não a carteira de 12 meses do regulamento (263). Painel sobre ela mentiria.
- O regulamento consolida por **CNPJ raiz**; o pipeline agrupa por `parc_matriz`. Discordam sempre
  que o cadastro não amarrou a filial.
- **Key Account tem de sair do numerador e do denominador** (`ka_grupo`, 128 grupos / 1.221 CNPJs).
  Nenhuma função de campanha usa essa exclusão hoje.
- `67` (AUTO ATEND.) e `116` (DENIZE, agência) não são reps de rua e não deveriam entrar na apuração.

**Backtest da régua no ciclo anterior (mai–ago/2026), pela definição do próprio regulamento:
positivação mediana de 16,1% e ZERO dos 45 reps com carteira ≥15 bateria os 50%.** 34 dos 45
precisariam dobrar. Reportado ao gestor; a régua é decisão dele.

## Pendências esperando decisão do gestor (03/09/2026)

1. **Bonificado e Troca contam como compra no roteiro?** O filtro novo conta **todo** `TIPMOV='P'`,
   inclusive Pedido Bonificado (198 notas em 60 dias) e Pedido de Troca (179). Se não devem valer
   como compra, é filtro de `CODTIPOPER` nas subqueries `ped`/`ab` do `roteiro-refresh`.
2. **Anon key com permissão de escrita.** A chave anônima embutida no painel tem
   INSERT/UPDATE/DELETE em 188 de 197 objetos, 145 deles sem RLS. Medido: o painel **só lê** — tirar
   a escrita é invisível para a tela e reversível. É a recomendação de maior retorno da lista.
3. **21 e-mails de representante que o GHL recusa** — endereço malformado ou domínio morto.
4. **Atribuição envio → pedido** não existe: não sabemos qual campanha gerou venda.
5. **`parc_bloqueado` está congelado em 28/08** — nenhum dos 74 crons atualiza a tabela.
6. **O painel lê `erro`, mas o motivo da trava está em `resultado`** — a tela mostra vazio.
7. **`recompra_cross_sell` é hoje a união das outras duas campanhas de produto** — decisão de
   negócio: ou vira só curva A, ou é retirada.
8. **Audiência da "Sugestão de produtos p/ a visita" é pequena** (149 clientes, 35 reps) — alargar ou
   deixar.
9. **DENIZE (codvend 116)**: entregar lista de clientes sem compra em vez de rota. Combinado que
   fica como está até o gestor pedir.
