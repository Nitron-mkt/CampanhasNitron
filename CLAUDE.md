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
7. **A instância só caiu se a mensagem NOMEAR ela.** O único sinal de queda é
   `[System]: <instância> - The instance is disconnected.` escrita na conversa — e o nome importa:
   a linha diz *qual* instância caiu, que nem sempre é a que está mandando. Antes de concluir queda,
   leia o nome. **Nas campanhas da NINA isso é para conferir sempre**: a Nina é o escopo `lead`, e se
   ela travar não conseguimos continuar. Apareceu o nome dela: reporta ao gestor na hora.
9. **Disparo não para por mais nada.** Dito em 15/09: "não tem que parar os disparos a não ser que
   veja aquela mensagem sobre a instância desconectada". Achou qualquer outro problema — reporta e
   deixa correndo. E **quando uma instância cair, o gestor é avisado no celular**: o `fila-processar`
   v25 manda um Zaptos para `fila_config.alerta_fone` (11970399053) no mesmo momento em que grava a
   pausa, uma vez por queda. Esvaziar a coluna desliga o aviso sem deploy.
   *Limite conhecido:* o número de saída é o dono do contato no CRM, então o aviso sai pela instância
   dona do contato do gestor (hoje a **Nina**). Se for justamente ela que cair, o aviso não chega — a
   resposta da rodada traz `alerta` com o motivo e o log registra. Para cobrir esse caso, o contato
   dele teria de ser de uma instância de rep; é decisão dele.
8. **Instância que atende o representante segue o Sankhya.** Hoje (15/09) os disparos ao rep saem
   pela **Juliete** e pela **Camyla** — a Camyla provavelmente usando o usuário da Isadora. Se o rep
   trocar de assistente no Sankhya **e** no CRM, mande pela instância da pessoa que cuida dele
   **segundo o Sankhya**.

## Coisas que já custaram caro — não redescubra

- **"Aceito pelo GHL" ≠ "entregue".** O GHL responde `status: sent` e o ZaptosWPP escreve
  `[System]: <instância> - The instance is disconnected.` na conversa 2–8s depois. Esse é o
  **único** sinal observável: não há campo no CRM nem status de contato. `campanhas-enviar` espera
  ~12s e checa (`ENTREGA_CHECK_MS`); em 26/08, sem isso, 8 mensagens viraram "enviado" sem chegar.
- **A linha de queda nomeia a instância caída, e não é sempre a remetente.** Em 03/09 quatro
  conversas receberam `[System]: **Nina** - The instance is disconnected.` enquanto o envio saía pela
  Isadora, Juliete, Mônica e Valeria. A detecção só procurava a frase, então condenou as quatro
  linhas, pausou as quatro instâncias — sadias, e mandando normalmente o tempo todo — e deixou a
  Nina, a que caíra de verdade, trabalhando. **174 mensagens ficaram presas 12 dias** (rep_sem_comprar
  73, giro a vencer 43, roteiro 36, clube_saldo 19, giro vencido 3) e o gestor via na tela o contrário
  do que via nos aparelhos. Canceladas em 15/09 a pedido dele. Corrigido em `campanhas-enviar` v31
  (lê o nome; `instancia_caiu` só quando é a remetente, senão devolve `queda_outra`) e `fila-processar`
  v24 (pausa a instância **nomeada**, sem interromper o lote de quem estava mandando). Em 27/08, nas
  quedas reais, a linha nomeava a própria remetente — é esse o caso que condena a mensagem.
- **O número de saída é o `assignedTo` do contato.** `fromNumber` **não funciona** (testado 26/08).
  `#contact_instance:<token>` governa só a entrada. Sem dono, a mensagem não sai.
- **`SUPABASE_SERVICE_ROLE_KEY` vem com valor `sb_secret_`** que o PostgREST recusa (PGRST303).
  Toda função usa `const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";`
- **Chave de serviço escrita no código: já não há em `campanhas-saldo`, `campanhas-keyaccounts`,
  `cross-sell-abc` nem `campanhas-artes`** (esta última achada e retirada em 14/09 — o fallback do
  `srvKey()` era um JWT `service_role` literal, válido até 2101; conferido depois que a função
  continua listando as 12 artes pelo SRV_JWT). **Nunca varremos as 142 funções publicadas atrás de
  outras**: o repositório tem 26, então as achadas até aqui foram as que alguém abriu por acaso. As duas carregavam um JWT `service_role` literal como fallback do
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

## Estado conhecido (15/09/2026)

- **Zaptos da instância "Campanhas Nitron" está RESTRINGIDO pelo WhatsApp.** Sem previsão. A fila
  segue LIGADA; a restrição está registrada como pausa dessa instância (`instancia_ghl.pausada_em`).
  É a **única** instância pausada — Isadora, Juliete, Mônica e Valeria foram liberadas em 15/09,
  depois de se descobrir que a pausa delas era falso positivo (ver a armadilha da linha de queda).
- **A fila está vazia**: as 174 linhas pendentes foram canceladas em 15/09 a pedido do gestor. Elas
  estavam paradas desde 03–11/09 pelas pausas erradas, e o texto de cada uma já estava velho.
- **O contato de teste do gestor (11970399053) é da Nina** no CRM desde 15/09 — estava da "Campanhas
  Nitron", que é restringida, e por ali o teste não sairia. Trocado com autorização dele.
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

## Comunicado aos clientes (criado em 09/09)

Campanha `cliente_comunicado`, pipe `inteligencia` (ao lado do "IA propõe"), **só e-mail**, público
`cliente`. É o irmão do `rep_comunicado`: recado livre da gestão, texto escrito na tela, sem gatilho
e sem IA. Função `campanhas-comunicado-cliente`, tela `abrirComunicadoCliente()` no painel.
`cadencia = ['avulso']` — o `campanhas-cron` compara cadência com o dia da semana, então 'avulso'
nunca casa e **nada dispara sozinho** (mesma convenção do `rep_comunicado`).

Três decisões de desenho que vieram do tamanho da audiência e do disparo não autorizado de 03/09:

- **Quem enfileira é a função, não a tela.** O comunicado ao rep são ~98 destinatários e o navegador
  monta o payload; aqui são ~6.000 e o mesmo desenho geraria um POST de ~11 MB. Pior, foi esse
  caminho (a tela compondo tudo e mandando de uma vez) que pôs 231 mensagens na fila num clique. A
  tela manda **texto + filtros**; a audiência é resolvida na função e vai ao `fila-enfileirar` em
  lotes de 400, que é quem tem a trava de duplicidade.
- **Duas travas no envio.** `confirmar:true` e `total_esperado` — a função **recusa o lote** se a
  audiência mudou desde a contagem que a tela mostrou. Tela velha não dispara lote novo. A recusa
  volta como HTTP 200 com `ok:false` de propósito: o `postJSON` do painel descarta o corpo quando o
  status não é 2xx, e a tela mostraria "status 409" em vez do motivo.
- **Sem Zaptos.** A função recusa `canal=whatsapp`. 6.000 mensagens a 2/min por instância são ~8h de
  disparo, com o número da Campanhas Nitron restringido pelo WhatsApp desde 27/08.

Audiência (medida em 09/09), de `ghl_contato` — um destinatário por **e-mail**, não por loja:

| filtro | destinatários |
|---|---|
| todos os clientes do CRM | 6.042 |
| tirando bloqueado no Sankhya (padrão da tela) | **5.891** · 5.716 clientes |
| tirando bloqueado + inadimplente | 5.769 |

Cortes do padrão: 153 **representantes** (regra: campanha de cliente não vai para rep), 460 sem
e-mail, 151 bloqueados, 81 e-mail repetido, 1 inválido. A tela mostra cada corte com o número — não
só o total, senão a diferença entre "a base tem 6,7 mil" e "vão 5,8 mil" some.

**Sem CNPJ e sem `(N lojas)`** na mensagem: documento é regra da comunicação ao *representante*; ao
cliente seria o documento dele mesmo. E o sufixo `lj()` é marcador interno das listas ao rep — vazou
para o cliente em 03/09 ("Ola DIEGO FAZZANI (2 lojas)!"). Aqui **não há consolidação por matriz**:
cada contato recebe com o nome da própria loja, então o erro de casar nome de uma loja com o contato
de outra (24 e-mails em 03/09) não existe neste caminho. `nomeLimpo()` tira lixo de cadastro da
saudação (`": Atacadão…"`, `"004 - AUSTIM…"`) — mexe em 5 dos 5.700 nomes, e só corta código de loja
quando vem seguido de separador, para "3 IRMAOS" e "24 HORAS" ficarem intactos.

A biblioteca de comunicados agora separa por público: `comunicado.publico` ('rep' é o default, então
nenhuma linha antiga muda de sentido).

**`/functions/v1/gestor` serve HTML velho por um tempo depois de publicar.** Ele faz `fetch` do
Storage sem cache-buster e o CDN entrega bytes antigos com ETag novo. O painel de verdade
(`gestordecampanhas.marketing-da5.workers.dev`) atualiza na hora — confira o md5 por lá, não por
essa rota, que é só o caminho de download.

## Imagem no comunicado (criado em 14/09)

As duas telas de comunicado (representante e cliente) sobem imagem. Bucket **público**
`comunicado-midia` (PNG/JPG/WEBP/GIF, 5 MB, até 8 por comunicado), função `comunicado-midia`,
widget único `midiaHTML()/midiaLigar()` no painel. Guardadas em `comunicado.imagens` (biblioteca) e
em `fila_envio.imagens` (a linha que vai sair).

**O upload passa pela função, não do navegador direto para o Storage.** A pendência 2 quer TIRAR a
escrita da anon key — tela que dependesse dela quebraria no dia em que isso acontecer.

**Dois caminhos, porque os canais são diferentes:**

| canal | como a imagem vai | quem monta |
|---|---|---|
| e-mail | `<img>` no fim do corpo | `fila-processar` (`blocoImagens()`), porque o corpo chega ao GHL como HTML cru |
| Zaptos | `attachments` no **próprio POST do texto** — uma mensagem só, imagem com legenda | `campanhas-enviar` v30 |

O Zaptos numa mensagem só é o ponto: mandar imagem e texto separados dobraria o consumo do teto de
2/min por instância. O anexo **nunca** vai no bind `#contact_instance:<x>`, que é linha de serviço.

**A entrega no Zaptos foi conferida no aparelho em 14/09, antes de a tela oferecer isso** — envio
real para 11970399053 pela instância Nina (dona do contato no CRM), GHL 201, troca confirmada em
2,8s, imagem chegou com o texto. Isso importa porque o GHL aceitar `attachments` não prova que o
**ZaptosWPP** renderize: é a mesma armadilha do `status: sent` que em 26/08 marcou oito mensagens
como entregues sem nada chegar. **Nunca ligue anexo novo no Zaptos sem repetir esse teste.**

**A mudança no `campanhas-enviar` foi deliberadamente mínima: cinco linhas.** Ele carrega a trava de
instância, a confirmação de troca e a checagem de entrega, e o deploy aqui exige transcrever o
arquivo inteiro à mão. O procedimento que deu certo: conferir o publicado contra o repositório antes
(idênticos, servindo de rollback), aplicar o mínimo, e testar sem enviar nada — `diag`, `previa`,
recusa por instância ausente, recusa por instância fora do cadastro e recusa por telefone fixo.

Na tela do rep o widget fica **fora** da caixa de e-mail: a imagem vale para os dois canais, então
esconder atrás do "mandar também por e-mail" escondia metade da função. Na tela do cliente o texto
diz "só e-mail", porque aquela campanha recusa `canal=whatsapp`.

**A biblioteca de comunicados agora filtra por público** (`campanhas-comunicado` v5). Desde 09/09 a
tabela é compartilhada, e a tela do rep estava listando também os comunicados escritos para cliente.

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
10. **`rep_instancia` resolve divergência pelo CRM, e a regra 8 diz Sankhya.** São 11 reps onde ERP e
    CRM discordam: 5 vão para a Camyla (ERP diz Juliete/Isadora), 5 para a Juliete (ERP diz Isadora)
    e 1 para a Nina (ERP diz Juliete). Trocar a fonte para o ERP **tira a Camyla inteira do roteamento**
    — os 5 reps dela só existem pelo CRM — e o gestor disse em 15/09 para continuar mandando por
    Juliete e Camyla. As duas coisas não cabem juntas: ou a Camyla é exceção reconhecida (ela usa o
    usuário da Isadora), ou a divergência se resolve pelo Sankhya e ela sai. **Não mexer até ele
    decidir.**
