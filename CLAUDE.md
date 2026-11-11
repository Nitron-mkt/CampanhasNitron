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
   **O aviso sai por qualquer instância de pé**, na ordem que ele deu em 15/09: Camyla, Nina, depois
   qualquer outra — nunca a que caiu. Como o número de saída é o dono do contato, avisar por outra
   exige trocar o `assignedTo`: ele autorizou ("pode usar qualquer instância para me avisar"), e o
   `campanhas-enviar` v32 faz essa troca sozinho quando o pedido vem com `alerta: true`.
   **A troca de dono é o ÚLTIMO recurso, não o primeiro** (`campanhas-enviar` v33): se o dono atual
   for uma instância viva, o aviso sai por ele e o contato não é tocado. A v32 trocava sempre, e em
   15/09 um teste do aviso deixou o contato do gestor com a Camyla — como o aviso de lead sai pela
   **Nina** (`copiloto_config.lead_inst`), a trava de dono passou a recusar todo aviso de lead por
   Zaptos e ele só recebia por e-mail. Levou dois dias para aparecer. O estado da instância é lido
   **na hora**, sem o cache de 5 min, senão a caída ainda pareceria viva.
   **Essa é a ÚNICA exceção à regra de nunca mexer no `assignedTo`**, e é estreita de propósito: a
   função confere o telefone contra `fila_config.alerta_fone` no momento do envio e ignora o pedido
   para qualquer outro número. Conferido em 15/09 com envio real — contato era da Nina, aviso pedido
   pela Camyla, `dono_forcado: true`, GHL 201, mensagem no aparelho.
10. **Instância caída não é decisão minha.** Dito em 15/09: o aviso chega no celular dele, e **ele**
    devolve a instrução — trocar de instância, esperar, reatribuir. Até essa instrução chegar, o que
    vale é o automático: a caída fica pausada, as linhas dela esperam, e todas as outras seguem
    enviando. Não desviar campanha de instância por conta própria.
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
  **Corolário que custou dois dias:** trocar o dono de um contato muda, em silêncio, todo aviso que
  saía por outra instância para ele. Quem troca dono tem de perguntar antes "que outra coisa manda
  mensagem para esse contato?" — no do gestor a resposta era: os avisos de lead, pela Nina.
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
- **O contato do gestor (11970399053) é da NINA no CRM, e tem de continuar sendo.** É por ela que
  saem os avisos de lead novo (`copiloto_config.lead_inst = Nina`). Ficou com a Camyla de 15 a 17/09
  por um teste do aviso de queda, e nesses dois dias os avisos de lead só chegaram por e-mail.
  Devolvido à Nina em 17/09; a v33 do `campanhas-enviar` impede que isso se repita.
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

## Cobrança automática do PIX antecipado (criada em 25/09)

Pipe **`cobranca_auto`** — "🔔 Cobrança automática", **na área COMERCIAL**, não na /cobrança do
financeiro: o gestor pediu explicitamente que ficasse no comercial. Dois quadros irmãos:
`cobranca_pix_rep` (avisar representante) e `cobranca_pix_cliente` (cobrar cliente).

**O título é o `CODTIPTIT = 57`, "PIX – Antecipado"** do Sankhya. Em aberto = `TGFFIN.DHBAIXA` nula,
`RECDESP=1`, `PROVISAO='N'`. Caminho: `cobranca-pix-refresh` (lê o Sankhya) → tabela `cobranca_pix`
→ view **`cobranca_pix_apto`**, que é a fonte única da tela E do disparo.

Duas descobertas da consulta que definiram o desenho:

- **O vendedor vem do PARCEIRO, não do título.** `TGFFIN.CODVEND` veio **0 em 6 dos 9** títulos
  abertos — e justamente nos maiores (R$ 12.235, R$ 5.733, R$ 3.640). Quem sabe de quem é o cliente
  é `TGFPAR.CODVEND`. Usar o do título deixaria a maior parte da cobrança sem representante.
- **`TGFVEN.TIPVEND` separa representante de loja.** `R` é representante de rua (tem assistente,
  entra); `V` é venda de balcão (ROBERTA LOJA, VALERIA) — sem assistente e com valores de R$ 24,
  R$ 22, R$ 0,01. A view filtra `TIPVEND='R'`, e por isso **9 títulos viram 5**.

**A assistente sai do SANKHYA (`rep_instancia.instancia_erp`), não do CRM.** O gestor definiu isso
com o exemplo dele em 25/09: "o REPRESENTANTE É O EDSON, A ASSISTENTE DELE É A JULIETE". No cadastro,
EDSON (93) tem `instancia_erp = Juliete` e `instancia_crm = Camyla` — ou seja, ele quer o ERP. Isso
**resolve na prática a pendência 10 para esta campanha**; nas outras a regra segue como estava.

**Janela de 7 dias (25/09).** Só entra PIX aberto há **até 7 dias**, contados da geração (`DTNEG`).
Passou de 7, sai dos dois quadros — a condição especial acabou e cobrar vira ruído. O número mora em
`campanhas.filtros_padrao->>'pix_janela_dias'`, não em constante. **O corte é grande: de 5 aptos
para 2.** Ficam de fora AMILTON (36 dias), MUNDO BABY (24) e BEST BAG (16) — e são justamente os
valores altos, R$ 18,8 mil. Vale revisar se a régua é essa mesma.

**Valeria e Mônica entram como quem vende** (25/09). No Sankhya elas são `TIPVEND='V'`, então o
filtro de representante as excluía. Para elas a assistente é **ela mesma**: a view cai em
`copiloto_venda_interna.instancia`. Hoje nenhuma das duas tem PIX aberto na janela.

**O código PIX vem do Sankhya.** `AD_HYAKRECEBIMENTOSPIX.QRCODE`, chaveado pelo **mesmo NUFIN** do
título; quando há mais de uma geração para o mesmo título fica a mais recente com código. Dos 9
títulos abertos, 5 têm código — os que não têm são os antigos, e esses já não passam da janela.
A mensagem ao cliente leva o copia-e-cola e **os dias que faltam da condição**, não os dias corridos.

**E esse campo vem em BASE64 — não é o copia-e-cola** (achado em 28/09, ao montar a mensagem de teste
para o gestor antes de mandar). O `QRCODE` guarda 240 caracteres começando em `MDAwMjAxMDEwMjEy…`; o
que o cliente cola no banco é o conteúdo **decodificado**: `00020101021226820014br.gov.bcb.pix…`,
~180 caracteres, CRC16 conferido, beneficiário NITRONPLAST INDUSTRIA E C / SAO PAULO, PSP
qr.bankly.com.br, moeda 986, **sem tag de valor** (é QR dinâmico, o valor mora na URL do PSP).
Mandar o base64 seria mandar um blob que nenhum aplicativo aceita — o cliente leria "segue o código
PIX" e não conseguiria pagar, e ninguém descobriria olhando a tela. É a mesma família do
`status: sent` de 26/08: o campo existia e parecia certo, só não era o que a pessoa do outro lado
usa. Corrigido no `cobranca-pix-refresh` **v4**, que decodifica antes de gravar; se o valor não virar
um BR Code de verdade (começa em `000201`) grava **NULL** e conta em `qrcode_ilegivel` na resposta —
a tela então mostra "sem código PIX" e a mensagem cai no "peça a 2ª via com a gente", que é honesto.
**Nunca mande código PIX novo sem colar o texto num aplicativo de banco antes.**

**Cadência manhã/tarde** (`filtros_padrao` do `cobranca_pix_cliente`): `pix_turnos = [tarde, manha]`,
começando pela **tarde**, com `pix_manha_hora=9` e `pix_tarde_hora=15`. É alternância estrita — o
exemplo que o gestor deu repetia a tarde dois dias seguidos, e isso foi tratado como lapso da fala.
Ainda **não há cron**: os parâmetros estão gravados esperando o "pode ligar".

**Nada dispara sozinho:** as duas nasceram com `cadencia = ['avulso']`, que o `campanhas-cron` nunca
casa com dia da semana. Ligar é trocar a cadência, sem deploy — e só quando ele mandar.

O texto é montado **em código**, no painel (`pixTexto()`), sem IA: ao representante o CNPJ vai em
linha própria (regra de 28/08); ao cliente **não** vai, porque ali seria o documento dele mesmo.

Audiência medida em 25/09: **9 títulos PIX abertos / R$ 30.420,50**, dos quais **5 de representante
(R$ 30.286,03)** — ARNESTO, DENIZE, INACIO e MARCIO (2). Para comparação, a carteira aberta de
clientes de representante inteira é de 15.454 títulos e R$ 35,5 mi, com 1.587 vencidos (R$ 3,66 mi):
o PIX antecipado é um recorte pequeno e de alto sinal, não o volume da cobrança.

## Motivo de recusa do pedido (criado em 25/09)

Terceiro quadro do pipe `cobranca_auto`: **`cobranca_recusa_rep`** — avisa o representante dos
pedidos dele reprovados na liberação, com o motivo que o liberador escreveu.

**Onde a recusa vive, e onde NÃO vive.** O caminho óbvio é `AD_MOTIVOCANCELAPEDIDO` (16 motivos,
apontada por `TGFCAB_EXC.AD_NUCANC`) — e ele está **morto**: 40 pedidos no total, todos de 2020/2021,
e em `TGFCAB_EXC` o motivo vem nulo em **649 de 649** exclusões dos últimos 90 dias. A recusa viva é
a da **liberação**: `TSILIB` com `REPROVADO='S'` e `TABELA='TGFCAB'`, onde `OBSLIB` (observação de
quem reprovou) é o motivo e vem preenchido em 100% dos casos.

**Um pedido tem VÁRIAS linhas de liberação reprovadas** (eventos/sequências da mesma nota). O
snapshot consolida por `NUNOTA` e fica com a reprovação mais recente — sem isso o mesmo pedido
aparece duas vezes na tela e duas vezes na mensagem.

**O vendedor prefere o do PEDIDO** (`TGFCAB.CODVEND`) e cai no do parceiro quando vier zerado —
mesma armadilha do PIX antecipado.

Caminho: `cobranca-recusa-refresh` (guarda 30 dias) → `recusa_pedido` → view **`recusa_pedido_apto`**
(janela de 7 dias em `filtros_padrao->>'recusa_janela_dias'`, representante **ou** venda interna).

Medido em 25/09: **30 pedidos no quadro, R$ 501.184,67**, 9 vendedores, 1 de venda interna (Valeria),
nenhum sem assistente. O motivo mais comum é variação de "EM ATRASO COM NITRON". A recusa mais
recente era das 10h37 do próprio dia — é dado vivo, não histórico.

**Os dois refresh têm cron de hora em hora** (`cobranca-pix-refresh-1h` aos :07,
`cobranca-recusa-refresh-1h` aos :12). Eles **só leem o Sankhya e gravam o snapshot** — não
enfileiram e não enviam nada. O disparo continua sendo o botão.

## Seleção em lote, modelo da mensagem e o relógio (25/09)

Os três quadros de cobrança ganharam o mesmo mecanismo das outras campanhas, pedido pelo gestor:
caixa com a mensagem, seleção de quem recebe, botão de envio habilitado pela seleção.

- **A caixa é um MODELO, não um texto fixo** (`PIXTPL` + `pixMontar()`), porque cada destinatário tem
  valor, dias e código PIX próprios. Marcadores: `[NOME]`, `[VALOR]`, `[DIAS]`, `[PRAZO]`, `[PIX]`,
  `[LISTA]`, `[ABERTURA]`. É a mesma convenção do `BULKTPL` do resto do painel.
- **A lista e o documento entram em código**, dentro do `pixMontar()` — a regra de 28/08 (a IA nunca
  escreve CNPJ) vale igual quando quem escreve é a tela. Ao representante o CNPJ vai em linha
  própria; ao cliente não vai.
- **A prévia usa o MESMO caminho do envio.** `pixPrevia()` chama `pixMontar()` com o modelo que está
  na caixa, e nomeia de quem é ("como vai sair — FULANO (primeiro marcado)"). Prévia que monta por
  outro caminho mente — foi o que aconteceu em 31/08 com o CNPJ no `bulletEx()`.
- **`pixEnviarLote()` enfileira tudo num POST só** ao `fila-enfileirar`, que é quem tem a trava de
  duplicidade. Busca os contatos de cada alvo pelo `campanhas-cobranca` (mesma fonte das outras telas
  de cobrança) e reporta quem ficou sem contato em vez de engolir.
- **O relógio (`pixRelogio()`) lê a própria campanha**, não uma constante: enquanto `cadencia` for
  `['avulso']` ele escreve em amarelo "⏱ Disparo automático: DESLIGADO. Hoje só sai clicando no
  botão", e mostra qual cadência está guardada esperando (`pix_turnos`, manhã 9h / tarde 15h). No dia
  em que a cadência mudar, a mesma caixa fica verde sozinha — sem deploy e sem alguém lembrar de
  editar a tela.
- **"Fora da janela" (`pixFora()`) existe por causa da Valeria e da Mônica.** O gestor não as via na
  tela e concluiu que estavam de fora; elas estão ligadas (a view aceita `copiloto_venda_interna`),
  só não têm nada dentro dos 7 dias. Em vez de sumirem, a seção lê o snapshot inteiro
  (`cobranca_pix` / `recusa_pedido`) e diz, nome por nome, o que cada venda interna tem e por que não
  entrou. Medido em 25/09: **Mônica sem nada em aberto; Valeria com 1 PIX de 101 dias (fora) e 1
  pedido recusado dentro da janela — esse aparece normalmente no quadro de recusa.** A seção **não**
  tem caixa de marcar de propósito: o que está fora da janela não é para enviar.
- Números do dia: PIX **2 na janela / R$ 11.467,70** (de 9 e R$ 30.420,50 no snapshot); recusa
  **30 na janela / R$ 501.184,67** (de 33 e R$ 568.556,87).

## Botão "Atualizar do Sankhya" nos quadros de cobrança (28/09)

Pedido do gestor: antes de disparar no manual, reler o Sankhya. **O que muda de um dia para o outro
é justamente o que vai dentro da mensagem** — os dias em aberto (que viram "faltam Nd da condição") e
o código PIX. Disparar em cima do snapshot da última passada do cron manda o número de ontem, e o
título pode já ter sido pago.

- O botão fica **no topo do quadro de baixo**, antes dos cards, com um segundo atalho dentro da caixa
  de envio (`🔄 Atualizar antes de enviar`), ao lado do botão de disparo. Os dois chamam a mesma
  função.
- **Chama o MESMO refresh que o cron chama** (`cobranca-pix-refresh` / `cobranca-recusa-refresh`) —
  não existe caminho paralelo que pudesse divergir. Elas **só leem** o Sankhya e gravam o snapshot:
  não enfileiram e não enviam nada. Leva ~4s.
- Depois de atualizar, **o quadro é reaberto**, senão a tela continuaria mostrando o retrato velho
  embaixo de um "atualizado".
- A linha do lado do botão diz **quando o Sankhya foi lido** ("há 12 min"), em laranja se passou de
  75 min — o cron é de hora em hora, então mais que isso significa que alguma passada não rodou.
- **`cobranca-pix-refresh` v3 e `cobranca-recusa-refresh` v2:** erro passa a voltar como **HTTP 200
  com `ok:false`**. O `postJSON` do painel descarta o corpo quando o status não é 2xx, então um 500
  aparecia na tela como "status 500" e escondia o motivo — justo num botão cuja razão de existir é
  ele saber se deu certo antes de disparar. Mesma convenção do `campanhas-comunicado-cliente`.
  Na v3 também foi corrigido o `valor_no_quadro`, que somava `s + 0` e dava sempre 0.
- **As duas funções não estavam no repositório** (só publicadas). Entraram agora em
  `supabase/functions/`.

**Teste no aparelho em 28/09**, a pedido do gestor, antes de qualquer disparo real: a mensagem ao
cliente (a do PIX, com valor, prazo e copia-e-cola) foi enviada ao 11970399053 pela **Nina**, que é a
dona do contato — `dono_crm: Nina`, nada tocado no `assignedTo`, GHL 201, troca confirmada em 1,9s,
sem linha de queda na checagem de entrega. Foi esse teste que descobriu o base64 do QRCODE.

**`instancia_erp` em branco não é divergência, é buraco — e apareceu custando caro.** Na leitura de
28/09 o quadro de recusa veio com **14 pedidos sem assistente**, de 3 representantes: INACIO
(9 pedidos, R$ 181.667,53), CARLINHOS (3, R$ 21.464,36) e MILTON (2, R$ 7.068,63). Os três têm
`rep_instancia.instancia_erp = NULL` e `instancia_crm = Nina`. A view lê só o ERP (regra 8: o Sankhya
manda), então eles ficam sem caminho de saída — não é o caso da pendência 10, onde ERP e CRM
discordam; aqui o ERP simplesmente não foi preenchido. Duas saídas: preencher o cadastro no Sankhya,
ou a view cair no CRM **quando o ERP estiver vazio** (sem mexer no caso de divergência). **Decisão do
gestor — não mexer até ele dizer.**

## O contato dos quadros de cobrança não vem da tela da duplicata (28/09)

**Sintoma:** "nenhum contato encontrado" nos dois quadros do PIX, no do representante e no do cliente.

**Causa:** os três quadros pediam o contato ao `campanhas-cobranca` (`?msg=<codparc>&publico=…`), que
é a tela da **duplicata vencida** e só responde por quem está na audiência dela. Cliente sem título
**vencido** recebe `{"erro":"grupo sem vencido"}` — e o PIX antecipado é exatamente o caso oposto:
título aberto, ainda **dentro** do prazo. Os dois quadros do PIX nunca iam funcionar por ali. O de
recusa funcionou **por acaso**, nos clientes que também tinham vencido.

**Correção:** função nova **`cobranca-contatos`** — só contatos, sem IA, sem audiência, sem
consolidação por matriz. `?publico=rep&codvends=51,19` lê `snap_rep`; `?publico=cliente&codparcs=…`
lê `snap_contato` + `ghl_contato`. **Mesma fonte e mesmos rótulos do `campanhas-cobranca`**, de
propósito. Não lê `rep_contato_extra` (os manuais de lá são internos e estão desligados desde 28/08).
Sem consolidar por matriz porque aqui o título é de **uma loja** e o nome tem de ser o dela.

A chave do contato passou a ser o **`codvend`** ao representante (antes ia o codparc de um cliente
dele) e o **`codparc` da loja** ao cliente. O envio em lote faz **uma** chamada para o lote inteiro.

**O lote agora recusa antes o que a fila recusaria depois**, nomeando quem e por quê: Zaptos sem
assistente no Sankhya (o e-mail continua indo) e telefone fixo. Visto ao vivo em 28/09 — CARLINHOS
sem `instancia_erp`, e a VALERIA com `11 00000000` no `snap_rep`.

## Quem do CLIENTE recebe a cobrança (28/09)

Pergunta do gestor: *"você está mandando para o cliente ou para o contato do financeiro dele no
Sankhya?"*. A resposta honesta era **nenhum dos dois de propósito** — ia para **todos** os contatos
cadastrados, sem distinguir função, inclusive **Expedição e Fiscal**.

**O caminho, do título ao aparelho:**

1. `cobranca_pix_apto` dá o **codparc da loja do título** (sem consolidar por matriz — o título é de
   uma loja só).
2. `cobranca-contatos?publico=cliente&codparc=…` lê **`snap_contato`** (Sankhya, com a coluna
   `funcao`) e **`ghl_contato`** (CRM).
3. A tela lista os contatos; o gestor marca.
4. Sai pela instância da **assistente do representante daquele cliente**, pelo Sankhya.

**A função do contato passou a mandar** (`cobranca-contatos` v2):
`FINANCEIRO` → `PRINCIPAL` → `COMPRAS` → contato do CRM. **Expedição e Fiscal saem da cobrança** e
voltam em `ignorados`, para sumirem do envio **sem sumir da vista** de quem opera. Só o primeiro de
cada canal nasce marcado (`preferido`); os outros ficam a um clique. **No envio em lote vai só o
preferido** — 1 Zaptos e 1 e-mail por cliente: cobrar o financeiro, o principal e o de compras ao
mesmo tempo é assédio, não insistência.

A ordenação acontece **antes** da deduplicação, então o mesmo número cadastrado em duas funções fica
com a melhor (cliente 15: o telefone da Expedição é o mesmo do Financeiro, e aparece como Financeiro).

**Por que é preferência e não exigência.** Na base de 28/09: **1.740** clientes têm `PRINCIPAL`,
**546** `COMPRAS`, só **87** têm `FINANCEIRO`, 45 `EXPEDICAO` e 37 `FISCAL`. E entre os **619**
clientes com título vencido, apenas **6** têm financeiro cadastrado. Exigir financeiro apagaria a
campanha. **Nenhum dos 9 clientes com PIX antecipado tem financeiro** — 2 têm Principal, 4 só o
contato do CRM e 4 não têm contato nenhum.

**A mesma regra vale para a tela da duplicata vencida** (`campanhas-cobranca`), que continua sem esse
filtro — hoje sem consequência (0 dos 619 têm Expedição/Fiscal), mas é a mesma dívida.

**Ao REPRESENTANTE nada muda, e está certo assim.** Ele não tem "contato de cobrança": vai para o
telefone e o e-mail dele mesmo, de `snap_rep` (`celular`, `fone_parc`, `email`, `email_crm`) — os
mesmos números que todas as outras campanhas ao rep já usam. Confirmado pelo gestor em 28/09: "é mais
para avisá-los mesmo".

## Primeiro disparo real do PIX ao cliente (28/09) — e a regra final de contato

O gestor fechou a regra **desta campanha**: *"o ideal é mandar sempre para o financeiro, mas no caso,
às vezes por ser PIX, pode mandar diretamente para o vendedor ou qualquer número que esteja
disponível"*. Então **nada é descartado** (`cobranca-contatos` v3): a função só decide a **ordem** —
`FINANCEIRO` → `PRINCIPAL` → `COMPRAS` → contato do CRM → **expedição/fiscal como último recurso**,
marcados como tal na tela. A v2 jogava expedição/fiscal fora, o que em cliente sem outro contato
virava "sem contato" — pior do que mandar para o telefone da expedição, que ao menos é a empresa
certa. Continua **1 contato por canal** no lote.

**O disparo, registrado em `agenda_campanha` (28/09, `cobranca_pix_cliente`):**

| | |
|---|---|
| Sankhya relido antes | 9 títulos abertos · 2 na janela · R$ 11.467,70 |
| SUPER LOJAO (R$ 5.733,85, 5d, faltam 2d) | e-mail **entregue** 11h53 · Zaptos **pendente** |
| SUPER MINNIE (R$ 5.733,85) | **não recebeu** — sem telefone e sem e-mail, no Sankhya e no CRM |
| fora da janela | 7 títulos, R$ 18,9 mil |

**O Zaptos ficou pendente porque a assistente do MARCIO é a Isadora, que caiu às 10h43.** A linha
espera e sai sozinha quando ela voltar — não se desvia de instância por conta própria (regra 10).

**A rodada automática da fila não pegou a linha nos dois minutos seguintes; foi preciso chamar o
`fila-processar` na mão** (respondeu `emails: 1` e o e-mail saiu). O cron `fila-processar-1min`
dispara todo minuto e o `cron.job_run_details` diz `succeeded`, então o problema não é o agendador: em
`net._http_response` há chamadas do `pg_net` morrendo com **`Timeout of 5000 ms … DNS time:
5001 ms`**. Como o `pg_net` tem timeout de 5s e a função demora mais (ela espera ~12s pela checagem
de entrega), o timeout em si é esperado e inofensivo — a função roda até o fim do lado de lá. O que
**não** é normal é o erro ser de **DNS**: aí a requisição nem chega a sair. **Não está diagnosticado**
— fica para observar se a fila voltar a atrasar sem instância pausada explicando.

## Disparo de teste do quadro de recusa (28/09) — o que ele mostrou

O gestor disparou o quadro de pedido recusado às 13h42: 8 linhas, 3 representantes.

| resultado | linhas |
|---|---|
| e-mail entregue | 3 (VALERIA, JOSÉ FERNANDO, CARLINHOS) |
| **Zaptos: `[System]: Isadora - The instance is disconnected.`** | 1 |
| pendente, esperando a Isadora voltar | 1 |
| `sem instancia (Zaptos nao roteavel)` — CARLINHOS | 2 |
| `telefone fixo (sem WhatsApp)` — VALERIA, `11 00000000` | 1 |

A **Isadora caiu de verdade** (a linha nomeia ela, que era a remetente) e foi pausada sozinha às
13:43:21 — o automático funcionou como desenhado.

**E há 50 mensagens paradas na "Nina Financeiro", que caiu em 25/09 às 13h56** e continua pausada:
`cobranca_toque2` 23, `cobranca_vencido` 16, `cobranca_resposta` 9, `cobranca_toque3` 2. A queda foi
real e bem detectada (a linha nomeia ela). O problema é o que veio depois: **os crons continuaram
enfileirando para uma instância pausada por três dias** — é o mesmo acúmulo silencioso das 174 linhas
de setembro, só que agora por queda legítima. Pela regra 10 a instrução é do gestor; nada foi
mexido. Vale um alerta quando a fila de uma instância pausada passar de X linhas ou Y horas.

## A FILA ESTÁ DESLIGADA desde 15/10 (achado em 19/10)

`fila_config.wpp_ativo = false` **e** `email_ativo = false`, gravados em **15/10 17:14:52**. O último
envio de todos foi às 17h do mesmo dia. Desde então **nada sai** — nem Zaptos nem e-mail — e a fila
só acumula. **285 linhas pendentes** quando isso foi descoberto, 4 dias depois:

| campanha | canal | linhas | desde |
|---|---|---|---|
| cobranca_vencido | Zaptos | 39 | 15/10 |
| rep_roteiro_visitas | e-mail / Zaptos | 37 / 35 | 16/10 |
| rep_comunicado | Zaptos | 32 | 15/10 |
| reativacao_email_cliente | e-mail | 29 | 16–19/10 |
| cobranca_toque2/3/4/5 + resposta | Zaptos | 54 | 15–19/10 |
| cobranca_alerta (interno) | e-mail + Zaptos | 38 | 15–19/10 |
| rep_sugestao_produto / clube_saldo | Zaptos | 21 | 05–13/10 |

**Desligar o `email_ativo` contraria a regra permanente nº 1**, que diz que essa chave NUNCA é
desligada. O banco não guarda quem desligou nem por quê. **Não religado por conta própria**: religar
despeja ~285 mensagens de uma vez, muitas com texto de 4 dias atrás (as de cobrança carregam valor e
prazo que já mudaram). A ordem tem de vir do gestor, e antes dela vale revisar o que ainda faz
sentido sair.

**Isadora continua pausada desde 28/09** — 21 dias — com 66 linhas presas (comunicado, roteiro,
sugestão de produto, clube). Ele disse em 28/09 "estou vendo e resolvendo"; não foi resolvido. Karla
pausada desde 15/10 e Nina Financeiro desde 25/09.

## Por que o comunicado "não pega todos os representantes" (19/10)

A rede vem **completa**: `campanhas-comunicado` lê `rep_carteira`, que tinha **103 reps ativos do
ERP** atualizados às 05h55 do próprio dia. O furo é na tela: um rep podia estar **marcado** e mesmo
assim não gerar **nenhuma** linha, em silêncio.

Duas causas, medidas no comunicado de 14–15/10 — **19 dos 103 não receberam nada**:

1. **Sem dono no CRM (14 reps).** `comInst()` usa só `instancia_crm` quando `crm_lido` é true; sem
   dono no GHL ela devolve null e o `comItens()` descarta a linha de Zaptos ("sairia pelo número
   errado"). Como a caixa "mandar também por e-mail" **nasce desligada**, o rep fica com zero linhas.
   Entre eles: **JOSÉ ALVES (306 clientes), PAULO HENRIQUE (165), WALDEMAR (159), LUCIANE VOGEL
   (153), MORAES (152), MAURO (119), ROBERTO (41)**.
2. **Só telefone fixo ou de rótulo duvidoso (5 reps).** `comTelForte()` descarta fixo e
   `CRM·empresa`/`CRM·casado`, e não sobra nada para marcar: WALDEMBERG, OSCAR PIMENTEL, JOSE MANUEL,
   MARCELO BEZERRA.

**Todos os 19 têm e-mail cadastrado** — o buraco é de roteamento, não de cadastro de contato.

A tela agora mostra, **antes de enviar**, um bloco amarelo com quantos ficam de fora, o motivo e os
nomes, e um botão **"✉ Mandar por e-mail para N deles"** que liga o e-mail só de quem ficaria sem
nada (não duplica para quem já tem Zaptos). O aviso **mostra e oferece** — quem decide é o gestor.
O "N sem instância, fora" que existia aparecia só **depois** do envio, quando já não dava para agir.

**O que isso deixa em aberto:** 14 representantes sem dono no CRM é problema de cadastro, e o ERP
sabe quem deveria atendê-los (`rep_carteira.assist_idcrm`). Corrigir o `assignedTo` no GHL resolveria
de vez — mas mexer em dono de contato é a regra que custou dois dias em 15/09. **Decisão do gestor.**

## O Sankhya ainda aponta 31 representantes para a BEATRIZ, que saiu (19/10)

O gestor autorizou em 19/10 marcar a assistente do ERP como dona do contato de quem está sem dono no
CRM. A função **`rep-dono-crm`** faz isso, com `?seco=1` por padrão e `{"aplicar":true}` para
escrever. Ela é estreita de propósito: **só escreve em contato que está HOJE sem dono** (trocar dono
existente foi o que custou dois dias em 15/09 — esses vão para `ja_tinham_dono` e são pulados), só
toca o telefone que o comunicado usaria, e só aceita assistente cadastrada em `instancia_ghl`.

**O plano seco de 19/10 derrubou o diagnóstico anterior.** Dos 103 reps:

| | |
|---|---|
| realmente sem dono no contato que o comunicado usa | **3** |
| têm dono, mas o **ERP discorda** do CRM | **44** |
| sem celular confiável / telefone fora do CRM | 20 |

E o ERP, nesses 44, aponta: **Juliete 18, Beatriz 21, Isadora 5**. Somando os sem dono,
**31 representantes têm a Beatriz como assistente no `rep_carteira.assist_idcrm`** — e a Beatriz
está `ativa=false` no `instancia_ghl` e **não envia nada desde 25/08**. Seguir o ERP ao pé da letra
hoje entregaria 31 reps a quem não atende mais.

**Nada foi aplicado.** Os 3 sem dono cairiam em: LUCIANE VOGEL (153 clientes) → Beatriz,
CICERO (3) → Beatriz, JOÃO CARLOS (**413 clientes**) → Isadora, que está pausada há 21 dias. Ou seja,
os três continuariam sem receber. **A pergunta que destrava isso é quem substituiu a Beatriz** — e é
do gestor.

**Correção de cadastro, não de código:** `rep_carteira.assist_idcrm` vem do `AD_IDCRM` do gerente no
Sankhya. Enquanto o ERP não for atualizado, qualquer regra que "siga o Sankhya" (regra 8) manda para
uma pessoa que saiu.

**Também achado:** 12 dos 14 reps que a tela mostra sem instância na verdade **não têm celular
confiável nenhum** — só fixo ou rótulo `CRM·empresa`/`CRM·casado`. Para eles o caminho é o e-mail,
que o botão novo da tela já oferece. Entre eles JOSÉ ALVES (306 clientes), MORAES (152), WALDEMAR
(159), MARIA JULIA (82), NELSON (50), WALDEMBERG (43).

**As 32 linhas do comunicado de 15/10 foram canceladas em 19/10 a pedido do gestor** — nunca tinham
saído (a fila está desligada desde 15/10 17h14, e o último envio do comunicado foi 17h09).

## As CONTAS do CRM foram transferidas: Elaine herdou a da Beatriz, Mara a da Isadora (19/10)

O gestor mostrou a tela **Vendedores/Compradores** do Sankhya, coluna **"Apelido (Gerente)"**, já com
**JULIETE, MARA e ELAINE KITAHARA**. Ele estava certo: **o Sankhya está atualizado.** O que estava
velho era o **nosso** `instancia_ghl`.

Conferido usuário por usuário no GHL (`/users/search`):

| `usuario_ghl_id` | como chamávamos | quem É hoje no CRM | e-mail |
|---|---|---|---|
| `qZXd7wbATAFdznMpRPze` | "Beatriz" (`ativa=false`) | **Elaine Kitahara** | beatriz.farias@nitron.com.br |
| `WlHZT90d36qnnXFbKzbl` | "Isadora" (pausada) | **Mara Oliveira** | vendas15@nitron.com.br |
| `SajXOmyjd7MdoMLmbQ8D` | Juliete | Juliete Silva | vendas7@nitron.com.br |

**As contas foram passadas para quem assumiu a carteira** — a Elaine herdou o login da Beatriz (o
e-mail ainda é o dela) e a Mara herdou o da Isadora. Por isso o `AD_IDCRM` do gerente no Sankhya
**nunca precisou mudar e sempre bateu**: o id é o mesmo. O que estava errado era só o **nome** que
dávamos ao usuário — e o `ativa=false` posto quando a Beatriz saiu, que estava barrando **22
representantes que hoje são da ELAINE**.

**Lição que vale além deste caso:** quando alguém sai, a empresa **transfere a conta**, não cria
outra. Então `instancia_ghl` tem de ser lida como "o usuário do CRM", não como "a pessoa". Antes de
concluir que o ERP está desatualizado, **confira o `usuario_ghl_id` contra o `/users/search` do
GHL** — foi o que desfez o diagnóstico errado de que o Sankhya apontava 31 reps para quem saiu.

Corrigido por migração em 19/10: a instância virou **Elaine Kitahara** (`ativa=true`) e **Mara
Oliveira**. Renomear foi seguro justamente nesse momento porque a fila estava vazia — as 285 linhas
pendentes tinham acabado de ser canceladas, então nenhuma linha em aberto apontava para os nomes
antigos; `rep_instancia` e `snap_rep` são derivadas e voltam no próximo refresh.

**A pausa da ex-"Isadora" NÃO foi tocada.** Ela é de 28/09 e se refere ao **número** que caiu; trocar
o nome não prova que o aparelho voltou. Hoje: Mara Oliveira 36 reps (**pausada**), Juliete 35,
Elaine Kitahara 31, 1 sem instância cadastrada.

## A "assistente" do representante é o GERENTE dele no Sankhya (19/10)

O gestor perguntou se o acesso ao Sankhya estava funcionando, por achar que já tinha ajustado as
assistentes por lá. **O acesso funciona** — o `rep-refresh` foi rodado à mão às 14h51 de 19/10 e
trouxe os 103 reps. O que mudou foi entender **qual campo** estamos lendo:

```sql
SELECT v.CODVEND, v.APELIDO, v.CODPARC, v.AD_IDCRM, vg.AD_IDCRM, v.AD_CELULAR, v.EMAIL
  FROM TGFVEN v LEFT JOIN TGFVEN vg ON vg.CODVEND = v.CODGER
 WHERE v.TIPVEND='R' AND v.ATIVO='S'
```

`rep_carteira.assist_idcrm` é o **`AD_IDCRM` do GERENTE do representante** — o gerente é o
`TGFVEN.CODGER` do próprio vendedor. **Não existe um campo "assistente"**: quem define quem atende o
rep é o **Gerente** no cadastro dele. O `cache-refresh` lê o mesmo caminho (`a.CODVEND = v.CODGER`).
Então, para trocar a assistente de um rep no Sankhya, muda-se o **gerente** daquele vendedor. Mexer
em qualquer outro campo não chega até aqui.

**Depois da releitura de 19/10 às 14h51, a divisão continua:**

| assistente pelo ERP | reps | estado no CRM |
|---|---|---|
| Isadora | 36 | **pausada desde 28/09** |
| Juliete | 35 | ativa |
| **Beatriz** | **31** | **`ativa=false`, não envia desde 25/08** |
| (id fora do `instancia_ghl`) | 1 | — |

Os 31 da Beatriz, por carteira: MILTON, HELENA SANTOS S, CARLINHOS, INACIO, PAULO HENRIQUE, LUCIANE
VOGEL, MORAES, MAURO, MARIA JULIA, ADÃO, HERMES, GIOVANE, FABIO, LUCIO, REGINALDO, MARCELO, FRANCIEL,
FIGUEROA, JUNIOR, MAURI CONCI, PLINIO, JOÃO ANTONIO, RONALDO JR, JUSTINO AUGUSTO, JOSE MANUEL,
CICERO, PAULO LACERDA, RAFAEL C, GEORGE SERRA, MICHELLA, ALESANDRA Q.

**Nada de dono foi aplicado**: aplicar o ERP hoje entregaria 31 reps à Beatriz, que saiu, e 36 à
Isadora, que está pausada — ou seja, 67 dos 103 continuariam sem receber. O passo que destrava é no
**cadastro do Sankhya** (gerente do vendedor), não no código.

## Fila zerada a pedido do gestor (19/10)

"Desse painel pode cancelar tudo que está pendente, depois que ajustarmos, colocamos para reenviar as
comunicações." **285 linhas canceladas** — as 32 do `rep_comunicado` de 15/10 e as outras 253
(cobrança 93, roteiro 72, reativação 29, alerta interno 38, sugestão/clube 21). Nenhuma tinha saído:
a fila está desligada desde 15/10 17h14. **As chaves continuam desligadas** — religar é decisão dele,
e a combinação é reenviar depois do acerto.

## `instancia_ghl.instancia` é um TOKEN do ZaptosWPP, não o nome da pessoa (19/10)

Erro cometido e desfeito no mesmo dia: renomear a coluna `instancia` para "Elaine Kitahara" /
"Mara Oliveira". **Essa coluna não é rótulo, é token.** O `campanhas-enviar` monta
`#contact_instance:${instancia}`, espera o ZaptosWPP **confirmar a troca na conversa** e só então
manda o texto — token que o app não reconhece nunca recebe ack, e a mensagem **não sai**
("troca de instancia nao confirmada — texto nao enviado"). O nome é o do **aparelho no ZaptosWPP**,
não o de quem opera.

A prova está nas linhas que o próprio app escreveu, gravadas em `fila_envio.resultado`:
`[System]: Isadora - The instance is disconnected.` (28/09), `[System]: Nina Financeiro - …`,
`[System]: Juliete - …`, `[System]: Campanhas Nitron - …`.

Então o token voltou a ser `Isadora` e `Beatriz`, e **a pessoa foi para `usuario_ghl`**:
"Mara Oliveira (aparelho/instancia \"Isadora\")" e "Elaine Kitahara (aparelho/instancia \"Beatriz\")".
Se os aparelhos forem renomeados no ZaptosWPP, aí sim o token muda — isso se confere **no app**, não
se adivinha aqui.

## Propriedade dos representantes passada para a assistente do Sankhya (19/10)

O gestor: *"para mim a instância das duas estão ativas e operantes, antes de enviar as mensagens
mande a mensagem de passar a instância para elas e começe o disparo normal como sempre combinado no
CRM"*. Feito, nesta ordem:

1. **Pausa liberada** no aparelho "Isadora" (hoje da Mara) — era de 28/09 e ele confirmou que está
   operante.
2. **`rep-dono-crm` v2** com `{"aplicar":true,"mover":true}`: **46 contatos**, 0 falhas —
   3 que estavam sem dono e **43 movidos** para a assistente que o Sankhya manda.

| de | para | reps |
|---|---|---|
| Nina | Beatriz *(Elaine)* | 15 |
| Nina | Juliete | 12 |
| Isadora *(Mara)* | Juliete | 5 |
| Juliete | Beatriz *(Elaine)* | 4 |
| Nina | Isadora *(Mara)* | 3 |
| (sem dono) | Beatriz / Isadora | 2 / 1 |
| Isadora | Beatriz | 2 |
| Bianca → Juliete · Juliete → Isadora | | 1 · 1 |

**Mover dono é a operação que custou dois dias em 15/09**, então a v2 é opt-in (`mover`) e **grava
cada troca em `rep_dono_log` ANTES de chamar o GHL**, com o dono anterior — o GHL não guarda
histórico de `assignedTo`, e sem esse log não haveria marcha a ré. Conferido antes de aplicar que o
contato do gestor (11970399053) **não** estava na lista: ele continua da Nina, como tem de ser.

**A "mensagem de passar a instância" é automática**: o `campanhas-enviar` manda
`#contact_instance:<instância>` antes de cada texto e só envia depois do ack do app. Não é um passo
separado.

**Resultado na tela do comunicado: 89 dos 103 com Zaptos roteável** (Isadora/Mara 31, Juliete 30,
Beatriz/Elaine 27, Camyla 1) e os outros 14 pelo e-mail, que o botão novo oferece. Antes, no
comunicado de 14–15/10, 19 não recebiam nada.

**Fila religada** (`wpp_ativo` e `email_ativo` = true, 19/10 16h12), com a fila vazia: o UPDATE só
passa se `pendentes = 0`, justamente para não despejar backlog velho ao religar.

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

## Nitron Conecta — consultoria presencial na fábrica (criado em 09/11)

Pipe e campanha **`nitronconecta`**, na área COMERCIAL. Bate-papo/consultoria interna na Nitron para
clientes de representante **e** para os próprios representantes. Como é presencial, só entra cliente a
até **60 km** da fábrica (`filtros_padrao.conecta_raio_km`, com `conecta_lat/lng` do CEP 07250-150 —
Rua Uruçuí 600, Guarulhos, geocodificado pela BrasilAPI em -23.46278 / -46.53333).

A tela é uma **árvore: representante → clientes dele dentro do raio**, como o gestor pediu. Fonte
única da tela e do disparo: a view **`nitronconecta_apto`**.

**Duas comunicações, duas seleções, duas instâncias** — e é esse o ponto do pedido:

| público | sai por | por quê |
|---|---|---|
| cliente | instância **Nina** (`conecta_inst_cliente`) | quem convida é a fábrica, não o representante |
| representante | assistente dele no Sankhya (`rep_instancia.instancia_erp`) | como toda campanha ao rep |

**O ritmo não é escolha da tela.** A fila já solta 2 Zaptos/min por instância, então os 940 clientes
numa instância só são **~8h de disparo**. A caixa de envio mostra a estimativa antes do clique e a
confirmação repete; nada sai de uma vez. O lote vai em blocos de 250 ao `fila-enfileirar` (um POST de
940 mensagens passaria de 1 MB) e a busca de contato em blocos de 120 (941 codparcs não cabem numa
URL). Dividir não enfraquece a trava de duplicidade, que é por `(campanha, canal, destino)`.

Contato do cliente vem do `cobranca-contatos` com **`ordem=convite`** (v4): PRINCIPAL → COMPRAS → CRM
→ FINANCEIRO, expedição/fiscal como último recurso. Convite vai para quem **decide**, não para quem
paga — o contrário da cobrança. Vai **1 contato por canal**.

CNPJ: na lista **ao representante**, em linha própria (regra de 28/08), montada em código pelo
`cnMontarRep()`. Na mensagem **ao cliente não vai** — ali seria o documento dele mesmo.

Audiência medida em 09/11: **940 clientes, 29 representantes, R$ 31,6 mi de faturamento 12m**.
218 clientes ficam de fora por **não ter CEP geocodificado** (não é que estejam longe: não dá para
medir) — a tela diz isso, com o número, em vez de escondê-los.

**A própria Nitron estava na audiência.** `codparc 1` (NITRONPLAST IND COM LT), 0,0 km, sob o codvend
67. Sai por **lista** em `filtros_padrao.conecta_excluir_codparc`, não por um `codparc <> 1` no
código: o grupo tem 23 empresas e as outras aparecem quando o cadastro mudar. `TSIEMP` **não está
liberada** para o nosso perfil no Sankhya (só as 15 `AD_VW_COM_*`), então não dá para derivar a lista
sozinho. **Primeira tentativa de exclusão passou batida em silêncio:** `'[1]'::jsonb ? '1'` é FALSE —
o operador `?` procura chave de **texto** e o array guarda o número 1. 941 continuou 941. Agora
compara elemento a elemento convertido.

**91 dos 940 são `atendimento_direto`** (codvend 67 AUTO ATEND. e 116 DENIZE): clientes de verdade e
perto, mas sem representante de rua — e a árvore é "rep → clientes dele". **Não são descartados**,
ficam marcados na tela para o gestor decidir.

## `cep_geo` é coordenada de CIDADE, não de rua (achado em 09/11)

Custou um diagnóstico errado na hora: a árvore do Conecta mostrava **todo cliente de Guarulhos a
"0,0 km"**, com CEPs diferentes. Não era bug de cálculo.

**427 CEPs dividem a mesma coordenada de São Paulo** (-23.5475 / -46.63611), **81** a do Rio, **48** a
de Guarulhos — e a de Guarulhos é, por coincidência, a mesma da fábrica. Dos 940 clientes no raio,
**799 usam coordenada de cidade e só 141 têm coordenada própria do CEP**. A BrasilAPI devolve
coordenada de rua só para parte dos CEPs e cai no centro do município no resto; regeocodificar não
melhora.

Para um corte de 60 km isso serve — o que importa é se a **cidade** é perto. Para dizer a distância da
porta da loja, não serve. A view expõe **`km_fonte`** ('cep' ou 'cidade') e a tela imprime "~14,1 km
(cidade)" quando é centroide, com o aviso no bloco de cobertura.

**Isso põe em dúvida o número do roteiro de visitas.** O "raio médio em SP caiu de ~135 km para
4–6 km" vem da mesma fonte: dentro de uma cidade a distância entre dois clientes dá ~0 por construção,
então o 4–6 km mede quase só a troca de cidade. O agrupamento por proximidade continua fazendo
sentido (cidade é a unidade real), mas o número não é raio de rua. **Não mexido — fica registrado.**

## A tabela `campanhas` não é legível pela anon key (achado em 09/11)

`GET /rest/v1/campanhas` devolve `[]` para a anon key — **sempre devolveu**, em qualquer campanha.
Consequência achada ao ligar o relógio do Conecta: o **`pixRelogio()` nunca apareceu na tela**. Ele
fazia `GET /campanhas?codigo=eq...&select=cadencia,filtros_padrao` e, com a resposta vazia, só dava
`return` — então a caixa "⏱ Disparo automático: DESLIGADO" não existe na tela desde 25/09, embora o
código esteja lá e correto.

Criada a view **`campanha_config`** (codigo, nome, pipe, ativa, cadencia, canais, publico,
filtros_padrao), liberada para anon. `pixRelogio()` e o Conecta passaram a ler dela. **Qualquer tela
que precise de cadência ou parâmetro de negócio tem de ler `campanha_config`, não `campanhas`.**

## Formulário de inscrição do Conecta — agenda de 3 dias (09/11)

Pedido do gestor: 16, 17 e 18/11, das 9h às 17h, **15 empresas por dia**, com os campos Contato
Principal, WhatsApp, E-mail, CNPJ, Razão Social, Nome do Representante e **quem vem junto**.

Entregue em `docs/nitronconecta-formulario/` — `index.html` funcional (pode ser reestilizado) e
`README.md` com o contrato da API. O desenvolvedor mexe no visual; o contrato é o que não muda.

- **Endpoint único `conecta-form`.** `GET` devolve datas, horário, local, vagas por dia e o **texto da
  chamada**; `POST` grava. Escrita **não** passa pela anon key: as duas tabelas estão com RLS ligada e
  **sem policy**, e quem escreve é a função, pela service role. Front que escrevesse direto quebraria
  no dia em que a pendência 2 tirar a escrita da anon.
- **Data, horário, local, capacidade e o texto moram no banco** (`filtros_padrao`: `conecta_datas`,
  `conecta_vagas_dia`, `conecta_horario`, `conecta_local`, `conecta_texto`, `conecta_form_url`).
  Virar 4 dias ou 20 empresas/dia é UPDATE, sem pedir deploy ao dev.
- **O limite de 15 é garantido pelo BANCO**, não pela tela: `public.conecta_inscrever(jsonb)` conta a
  vaga e grava **na mesma transação**, com `pg_advisory_xact_lock` por dia. Sem isso dois cliques
  simultâneos na última vaga fecham o dia com 16.
- **"15 empresas" conta por CNPJ**, não por inscrição: a mesma empresa preenchendo de novo
  **atualiza** (`atualizado:true`) em vez de ocupar outra vaga. É assim que a pessoa corrige o número
  de convidados sem ligar para ninguém.
- **A quantidade de pessoas é contada pelos NOMES**, não digitada à parte. Campo de quantidade separado
  da lista sempre acaba discordando dela ("5 pessoas", 2 nomes) — e esse número vira almoço e coffee
  break encomendados. `pessoas = acompanhantes + 1`.
- **Erro volta como HTTP 200 com `ok:false`** (mesma convenção do `campanhas-comunicado-cliente` e dos
  refresh de cobrança): o motivo *é* a resposta ("dia lotado, escolha outro"), e cliente que descarta
  corpo em status != 2xx mostraria "status 409".
- Sucesso e recusa trazem **`dias` atualizado**, para a página redesenhar a agenda sem segundo pedido:
  alguém pode ter pego a última vaga enquanto a pessoa preenchia.

Conferido em 09/11 contra o endpoint real: GET com as 3 datas; POST válido; **mesmo CNPJ não consome
segunda vaga**; CNPJ de 3 dígitos recusado pelo campo certo; e, com o dia 16 cheio na mão (15 empresas
inseridas), a 16ª recusada com `dia lotado` e `aberta:false`. As inscrições de teste foram apagadas —
sem isso a agenda mostraria 16/11 lotado sem ninguém inscrito.

Tabelas: `conecta_convite` (token do link pessoal, para pré-preencher), `conecta_inscricao` (respostas),
views `conecta_vagas` (ocupação por dia) e `conecta_inscricao_painel` (inscrição + dados do convite).
O quadro do painel mostra a agenda com a ocupação de cada dia, as pessoas por dia (para comida e
bebida) e a lista de quem já se inscreveu.

**`conecta_form_url` está vazio** — assim que a página do dev subir, grave o endereço lá e o marcador
`[LINK]` das duas mensagens passa a sair preenchido sozinho.

## Pipeline "Nitron Conecta" no CRM (09/11)

O gestor criou no GHL o pipeline **Nitron Conecta** (`wqarKxvvO5Z5fYBXMQMc`) com quatro etapas:
Convite enviado → Formulário preenchido → Confirmado → Compareceu. Pedido: o lead selecionado que
recebe a mensagem tem de aparecer na primeira etapa, e **quem responde o formulário atualiza o lead
que já estava lá**, não cria outro.

Função **`conecta-pipeline`**. Os ids de pipeline e etapa moram em `filtros_padrao`
(`conecta_pipeline_id`, `conecta_etapas`, `conecta_etapa_ordem`) — renomear ou reordenar etapa no CRM
não exige deploy. Dois pontos de entrada: o painel chama `acao:"convite"` depois de enfileirar (em
blocos de 25, porque cada alvo custa 1 ou 2 chamadas ao GHL), e o `conecta-form` v2 chama
`acao:"formulario"` logo após gravar a inscrição.

**NUNCA ANDA PARA TRÁS.** Compara a posição da etapa atual com a de destino e só avança; quem já está
em "Formulário preenchido" e recebe um segundo convite fica onde está (`ja_adiante`). Sem isso um
reenvio de lote desfaria, em silêncio, o trabalho de quem já respondeu — e ninguém veria, porque **o
GHL não guarda histórico de etapa de oportunidade**. Pelo mesmo motivo toda movimentação vai para
`conecta_crm_log` com a etapa de origem: é a lição do `rep_dono_log` de 19/10.

**A busca de oportunidade do GHL é INDEXADA e não devolve o que acabou de ser criado.** Isto custou um
teste e seria um desastre em produção: em 09/11 o convite criou a oportunidade e, **no mesmo minuto**,
`GET /opportunities/search?contact_id=…` pelo MESMO contato voltou vazio — então o formulário criou
uma **segunda** oportunidade em vez de mover a primeira, e a empresa ficou com dois cards. Como o
convite sai e o formulário pode ser respondido minutos depois, esperar o índice não é opção. Corrigido
na **v3**: o vínculo empresa → oportunidade é gravado em `conecta_oportunidade` (chave `c:<codparc>` /
`r:<codvend>`) na criação, e a busca do GHL virou **plano B**, só para quem ainda não tem vínculo. Se
a oportunidade for apagada no CRM, o `GET /opportunities/{id}` devolve 404 e o vínculo velho é
removido sozinho.

**Um codparc tem vários contatos no CRM** (o 15 tem 3). A escolha do contato passou a ser
determinística (menor `ghl_id`), senão "o primeiro que vier" muda de uma chamada para outra.

**Os filtros da busca são snake_case** (`pipeline_id`, `contact_id`). Com camelCase a API devolve 422
`"property pipelineId should not exist"` — e, como a busca falhava, nenhuma oportunidade era achada.
O MCP do GHL aceita camelCase porque traduz; a API crua, não.

**Só os CLIENTES vão para o pipeline.** As colunas são de empresa convidada ("Compareceu" é a loja que
veio); o aviso ao representante é interno. Mudar isso é uma linha no `cnEnviar()`.

**"Convite enviado" significa "convite na fila", não "entregue".** O painel move a etapa logo depois de
enfileirar, não depois de o ZaptosWPP confirmar. Com a fila a 2/min por instância, um lote grande leva
horas, e linha de instância caída fica pendente — então o pipeline vai estar à frente da entrega real.
Enganchar no `fila-processar` resolveria; não foi feito porque mexer no `campanhas-enviar` exige
transcrever o arquivo inteiro (ver a nota de 14/09). **Decisão do gestor.**

Testado de ponta a ponta em 09/11, com as oportunidades de teste apagadas depois: convite cria na 1ª
etapa; formulário no mesmo minuto **move a mesma** oportunidade para a 2ª; convite repetido devolve
`ja_adiante` sem tocar em nada; e o quadro ficou zerado.

O prompt para o desenvolvedor está em `docs/nitronconecta-formulario/PROMPT-DESENVOLVEDOR.md` — o
gestor pediu o briefing em vez do código, e a implementação de referência (`index.html`) ficou como
ponto de partida opcional.

## O Conecta vai por Zaptos E por e-mail, com imagem (09/11)

Pedido do gestor: *"além dos contatos de whatsapp, a comunicação tem que ser mandada pelo email
também… o template a enviar pra eles tem que ser o mesmo que mandei antes, mesma informação, só tem
que ter um botão lá para cadastrar a imagem"*.

- **O texto do cliente é o que ele escreveu, palavra por palavra** (a chamada da Reforma Tributária).
  A única coisa não literal é o "FALTAM 7 DIAS": virou `[DIAS]`, calculado da primeira data do evento.
  Número escrito na mão envelhece — mandar "faltam 7 dias" na véspera seria mentira na cara do
  cliente. Negrito no padrão do WhatsApp (`*assim*`).
- **O e-mail leva a MESMA mensagem, só vestida.** `cnEmailHTML()` monta a partir do próprio texto do
  Zaptos: mesmos parágrafos, mesma ordem, mesmas palavras, mais um cabeçalho, o bloco de
  data/hora/local destacado e um botão para o formulário. Não se reescreve o texto do gestor ali.
  **O HTML sai em UMA LINHA SÓ**: o `campanhas-enviar` envolve o corpo num `<div>` e troca `\n` por
  `<br>`, então qualquer quebra viraria `<br>` extra entre as tags.
- **Imagem: o widget é o mesmo dos dois comunicados** (`midiaHTML`/`midiaLigar`, contexto `conecta`),
  subindo para o bucket `comunicado-midia`. As URLs viajam no campo `imagens` das duas linhas: no
  e-mail viram `<img>` no fim do corpo (`fila-processar`), no Zaptos vão como `attachments` no próprio
  POST do texto, uma mensagem só (`campanhas-enviar` v30). Mesmo mecanismo conferido no aparelho em
  14/09 — não é anexo novo.
- Assunto do e-mail é campo editável na tela; a prévia do e-mail monta pelo **mesmo** `cnEmailHTML()`
  do envio, com as imagens, para não repetir o erro da prévia que diverge da mensagem.

### E aqui está o que derruba a premissa do "sai pela Nina"

O gestor pediu que o convite ao cliente saísse pela instância da Nitron. **A fila não deixa isso
acontecer, e não por bug:** o número de saída é o `assignedTo` do contato, e o `fila-processar` v17
manda campanha de **cliente** com `usar_dono: true` — ou seja, quando o dono diverge da instância
pedida, ele **troca para a dona de fato** em vez de recusar (nas de representante é o contrário:
recusa, porque divergência ali é aviso para a gestão).

Medido em 09/11 numa amostra de 9 clientes do raio, com `campanhas-enviar?lookup`:

| dono do contato | clientes |
|---|---|
| **sem dono** | 6 |
| outra instância (Bianca, Mônica, Karla) | 3 |
| Nina | 0 |

Ou seja: pedir `instancia: Nina` nas 940 linhas **não faz o Zaptos sair pela Nina**. Sai pela dona de
cada contato, e **contato sem dono costuma não sair** ("sem dono, a mensagem não sai").

**O e-mail não depende de instância e chega para todos** — por isso o pedido de mandar também por
e-mail é, sem querer, o que salva a campanha.

Pôr a Nina como dona dos 940 contatos resolveria o Zaptos, mas é exatamente a operação que custou dois
dias em 15/09: trocar dono muda, em silêncio, todo aviso que saía por outra instância para aquele
contato. **Não mexido — decisão do gestor.** A tela mostra esse aviso em vermelho, com os números,
antes do botão de envio, em vez de prometer uma instância que não vai ser usada.

**Achado de passagem, não relacionado:** a `cobranca_alerta` (alerta interno) acumula **166 linhas em
erro desde 19/10**, a última hoje às 16h, todas com o mesmo motivo — o contato é da **Nina Financeiro**
(pausada desde 25/09) e a linha pede Nina. Toda hora o cron enfileira de novo e erra de novo. Não
mexido.

## REGRESSÃO: o `campanhas-enviar` publicado estava na v30 de outra linha (achado em 09/11)

Achado ao abrir a função para acrescentar o `#switch`. **O publicado era v30; o repositório, v33.**
Em **26/10** outra sessão partiu da **v29** e acrescentou anexo de e-mail (`anexos`), publicando por
cima. Com isso **sumiram da produção** três versões que estão no repositório e descritas neste arquivo:

| versão | o que fazia | efeito de não estar em produção |
|---|---|---|
| v30 (repo) | imagem no Zaptos via `attachments` no POST do texto | **`imagens` no Zaptos não fazia nada** — a imagem só ia no e-mail |
| v31 | queda de instância passou a ler o **NOME** na linha do app | **voltou a condenar a instância errada** — é o bug que prendeu 174 mensagens por 12 dias em 03/09 |
| v32/v33 | modo aviso (`alerta: true`), troca de dono como último recurso | o aviso de queda no celular do gestor não consegue sair por outra instância |

**Nenhuma das duas linhas foi descartada.** A **v34** é a mescla: v33 do repositório **+** o `anexos`
de e-mail de 26/10, que é útil e foi pedido pelo gestor.

**Lição de processo:** `get_edge_function` **antes** de qualquer deploy, e comparar com o repositório.
O CLAUDE.md já mandava conferir o md5 do `gestor.html` publicado pelo mesmo motivo — a regra vale
igual para as Edge Functions, e aqui ela não tinha sido seguida por ninguém. Duas sessões mexendo no
mesmo arquivo é o problema de fundo (ver "Uma sessão de cada vez").

## `#switch:<instância>` — a troca de instância de SAÍDA (09/11)

O gestor informou: *"pode usar para mandar apenas essa mensagem um codigo que muda a instancia pelas
proximas mensagens, que é o #switch:Nina"*. Isso é **diferente** do `#contact_instance:<x>`, que
governa a **entrada**. Se funcionar, é o que resolve o Conecta: o convite ao cliente precisa sair pela
Nina, mas o número de saída é o `assignedTo` e a fila manda campanha de cliente com `usar_dono`.

Implementado na **v34** como `forcar_switch: true`, que faz duas coisas **juntas**:
1. a instância **pedida** prevalece — não cai para a dona do contato nem recusa por divergência;
2. manda `#switch:<instância>` como linha de serviço **antes** do conteúdo.

O `#switch` vai logo **depois do bind**, de propósito: assim a espera do ack e a margem de 20s que já
existem (e que em 24/08 provaram ser necessárias — com 1,7s a mensagem saiu pela instância antiga)
valem para os dois comandos, sem somar outra espera. **Não toca em `assignedTo`.**

O gestor descreveu mandar o código antes da imagem e de novo antes do texto; aqui **imagem e texto são
UMA mensagem só** (attachments no POST do texto), então um `#switch` basta. `switch_duplo: true`
repete antes do conteúdo para quem quiser o comportamento literal, com a mesma margem.

**O `#switch` NÃO TEM TRAVA, e isso é o ponto frágil.** Não se conhece linha de ack para ele na
conversa — ao contrário do `#contact_instance`, que o app confirma com "Contact Instance Updated!".
Então, se o app ignorar o comando, a mensagem sai pela instância de antes e **só o aparelho de quem
recebe mostra isso**. É a mesma família do `status: sent` de 26/08. Por isso `forcar_switch` é opt-in
e **não deve ser ligado em lote sem teste em aparelho**.

### Teste do `#switch` no aparelho do gestor (09/11, autorizado por ele)

Feito direto pela API, **sem publicar código** — justamente para não mexer na função mais crítica por
causa de um comando ainda não provado. Sequência na conversa `xXzFWU0Kt5Bfs9kTxM8U`:

| hora | o que foi mandado | status |
|---|---|---|
| 17:42:51 | `#switch:Camyla` (linha de serviço) | delivered |
| 17:43:32 | TESTE 1 — texto | **delivered** |
| 17:43:38 | `#switch:Nina` (devolve) | sent |
| 17:43:56 | `[System]: Nina - Unable to send the message.` | escrito pelo app |
| 17:44:13 | TESTE 2 — texto | **delivered** (28s depois) |

Duas coisas ficaram provadas pela própria conversa, independentemente de qual número apareceu no
aparelho:

1. **O `#switch` NÃO tem linha de confirmação.** O `#contact_instance:` sempre responde
   `[System]: Contact Instance Updated!` — e as duas linhas desse mesmo dia, às 16:21 e em 06/11,
   estão lá para comparar. O `#switch` não gerou nada parecido. Então **não há como travar**: se o app
   ignorar o comando, a mensagem sai pela instância de antes e nada no CRM mostra isso.
2. **Existe uma segunda linha de sistema que a checagem de entrega NÃO conhece:**
   `[System]: <instância> - Unable to send the message.` A nossa `ehQueda()` só procura
   "instance is disconnected". **E está certo não procurar esta**: aqui ela apareceu nomeando a Nina e
   a mensagem foi **entregue 28s depois** — tratá-la como erro marcaria como falha uma linha que
   chegou. Fica registrado como sinal **transitório**, não como queda.

Qual número apareceu em cada mensagem só o aparelho diz — é a pergunta devolvida ao gestor.

### O `#switch` FUNCIONA — e precisa de ~80s, não de 20s (provado em 09/11)

O primeiro teste deu falso negativo e quase fez a gente descartar o comando. Com **41s** entre o
`#switch:Camyla` e o texto, **o texto ainda saiu pela Nina** (a dona do contato) e quem pegou a troca
foi a **mensagem de serviço seguinte** — por isso apareceu uma linha no número da Camyla sem o texto
do teste junto. Reaproveitar a margem de 20s do bind era exatamente o erro.

Segundo teste: comando isolado, **80s de espera**, uma única mensagem depois. Um inbound do gestor
chegou com `Instance Source: Camyla` e eu li isso como prova. **ERRADO, e ele corrigiu:** a Camyla
(pessoa) tinha mandado mensagem para ele no meio do teste e ele respondeu *a ela*, por outra conversa.
O `Instance Source: Camyla` era dessa troca, não do teste. **A prova não existia.**

Lição: `Instance Source` diz por qual instância aquele inbound entrou, e nada mais. Num teste onde o
sujeito usa WhatsApp o tempo todo, qualquer inbound pode ser de outra conversa. A prova boa é a
**thread em que a mensagem de saída caiu**, vista no aparelho — ou um inbound que seja **resposta à
mensagem do teste**, no mesmo balão.

| espera entre `#switch:X` e o conteúdo | resultado |
|---|---|
| 41 s | saiu pela **dona** (Nina) — as duas mensagens caíram na thread da Nina |
| 100 s | saiu pela **dona** (Nina) — ver o TESTE 4 abaixo |

**VEREDITO: o `#switch` NÃO troca a instância de saída no nosso caminho de envio.** No TESTE 4 o
comando foi mandado sozinho, esperou-se **100 s** e mandou-se **uma única** mensagem. O gestor
respondeu "QUATRO" no mesmo balão e o inbound entrou com **`Instance Source: Nina`** — ou seja, ele
digitou na thread da **Nina**, que é onde o TESTE 4 tinha caído. Dois testes independentes (41 s e
100 s) deram o mesmo resultado.

Isso é coerente com tudo o que já estava escrito aqui: **o número de saída é o `assignedTo`**, o
`fromNumber` não funciona (26/08) e o `#contact_instance` governa só a entrada. O `#switch` deve
pertencer à mesma família — mexe no roteamento de entrada ou é comando do lado do operador, não do
remetente de API.

*Ressalva honesta:* a leitura depende de o gestor ter respondido na mesma thread em que a mensagem
caiu, como foi pedido. O `#switch:Nina` de restauração foi mandado 2 min antes da resposta dele, mas
isso não move as threads do WhatsApp dele — um inbound chega no aparelho em que ele digitou.

O `forcar_switch` continua na v34, opt-in e desligado: não custa nada e documenta o que foi testado.
**Não use.** O caminho para o Zaptos sair pela Nina é o `assignedTo`, e há uma forma segura de fazer
parte disso — ver abaixo.

### O que dá para fazer sem repetir o erro de 15/09

Da amostra de 9 clientes do raio: **6 sem dono nenhum** e **3 de outra instância**. São dois casos
diferentes e merecem tratamento diferente:

- **Sem dono** — pôr a Nina como dona é **seguro**: não existe aviso saindo por outra instância para
  aquele contato, então não há o que quebrar em silêncio. É exatamente o que o `rep-dono-crm` já faz
  para representante (só escreve onde não há dono), com log em tabela antes de chamar o GHL. E resolve
  o caso maior: hoje esses contatos provavelmente **não recebem Zaptos nenhum**.
- **Com dono de outra assistente** — deixar como está. O Zaptos sai pela assistente dela, que é o
  comportamento normal de toda campanha de cliente. Mover é a operação que custou dois dias.

**Nada aplicado — decisão do gestor.**

Por isso a v34 tem **margem própria** (`SWITCH_MARGEM_MS`, 80.000 ms), somada — não a do bind.
Ajustável por variável de ambiente e por `switch_margem_ms` no corpo.

**A conta de tempo muda, e muda muito.** Por mensagem de Zaptos com `forcar_switch`: bind + ack (~22s)
+ switch (80s) + checagem de entrega (12s) ≈ **115s**. A fila já espaça 30s por instância (2/min),
então o gargalo passa a ser a função: **~1 mensagem a cada 2 min por instância**. Os 940 clientes do
Conecta numa instância só deixam de ser ~8h e viram **~31h**. Caminhos possíveis, nenhum aplicado:
mandar os `#switch` de todo o lote numa passada e os textos na seguinte (desacopla as esperas);
usar o switch **só** em quem precisa (dono diferente ou sem dono); ou medir se 60s bastam.

**Duas coisas ainda não conferidas, e as duas podem inviabilizar o lote:**
1. **O cliente vê o texto `#switch:...`?** A Camyla (pessoa) perguntou "o que significa?" durante o
   teste, o que sugere que a linha aparece para alguém. O `#contact_instance:` roda em produção há
   meses sem reclamação, então ele é consumido pelo app — mas não está provado que o `#switch` também
   seja. Perguntado ao gestor.
2. **`[System]: Nina - Unable to send the message.` apareceu DUAS VEZES, sempre logo após
   `#switch:Nina`** (17:43:56 e 17:50:46). Nas duas a mensagem seguinte foi entregue, então é
   transitório — mas voltar para a Nina parece custar uma tentativa. A Nina é a instância do convite
   ao cliente e a dos avisos de lead: vale observar.


## Teste de ponta a ponta do Conecta (09/11) — funcionou

O gestor pediu um teste do começo ao fim: mandar a mensagem, receber por e-mail, se inscrever, escolher
um dia e ver o pipeline atualizar. Feito, com o destinatário desviado para ele — **nenhum cliente real
recebeu nada**.

| etapa | resultado |
|---|---|
| Zaptos | `fila_envio` 14003 **enviado** pela Nina — `ok fone:+5511970399053` |
| E-mail | `fila_envio` 14004 **enviado** para marketing@nitron.com.br |
| Pipeline, no convite | card **criado** em "Convite enviado" às 18:26:47 (`V2wXIpFS7rnAvsvZxEpS`) |
| Inscrição | 16/11, **3 pessoas** (Leonardo + Maria + Dan), consentimento anexado na observação |
| Pipeline, no formulário | **o MESMO card movido** para "Formulário preenchido" às 18:36:12 |
| Agenda | 16/11 passou a 1 de 15 empresas · 3 pessoas para comida e bebida |

No CRM o pipeline tem **`total: 1`** — um card, não dois. `createdAt 18:26:47` e
`lastStageChangeAt 18:36:12` provam que é a mesma oportunidade, criada na 1ª etapa e movida na 2ª.
Era exatamente o cenário que a v3 do `conecta-pipeline` corrigiu (o índice do GHL não devolve
oportunidade recém-criada), agora confirmado com 10 minutos entre uma coisa e outra.

**A mensagem foi montada pelas funções do próprio painel** (`cnMontarCli` e `cnEmailHTML`, lidas do
`gestor.html`), não por um texto paralelo — senão o teste provaria outra coisa que não o que o botão
faz.

**O teste pagou por si: achou um bug.** O primeiro `conecta-pipeline` devolveu `sem_contato` para um
contato que existe, com o telefone certo. A busca por telefone tentava **um formato só**
(`contains_set` com o número sem o 55), e o cadastro guarda `+5511...`, `5511...` e `11...` misturados.
Isso quebraria **o passo do formulário**, que chega na função só com nome e telefone quando o documento
não casa com nenhum codparc. Corrigido na **v4**: tenta as três variantes e, por último, a busca por
texto que o `campanhas-enviar` usa há meses; também aceita `contact_id` direto.

**O documento de teste foi escolhido para não encostar em cliente real** (`77.777.777/0001-77`, ausente
de `contato_enriquecido`). O gestor preencheu com um **CPF** (`457.888.348-56`) — que o formulário
aceita de propósito, porque há cliente pessoa física na base — e esse CPF também não casou com ninguém,
então nenhum card de cliente foi tocado. **Em teste, conferir o documento contra `contato_enriquecido`
ANTES**: documento que case com cliente real moveria o card dele.

**O site do desenvolvedor está no ar e conectado** (`nitron-agenda-conecta.replit.app`), e
`conecta_form_url` aponta para ele. A conferência tem de ser feita **num navegador de verdade**
(Playwright) — o deployment fica atrás do `__replshield` do Replit, que devolve 307 para `curl`. O
token pré-preencheu CNPJ, razão social, representante e contato, e a agenda veio da nossa API com
"15 de 15 vagas".

Resta limpar quando o gestor mandar: o card `V2wXIpFS7rnAvsvZxEpS`, a inscrição id 3, o vínculo
`r:undefined` em `conecta_oportunidade` e o convite `teste-gestor-0911`.


## Nem o `#switch` nem o bind trocam o remetente — só o `assignedTo` (fechado em 09/11)

Três tentativas, todas no aparelho do gestor, todas negativas. Fica aqui para ninguém gastar outro dia
nisto.

| tentativa | o que foi feito | resultado |
|---|---|---|
| `#switch:X` com 41 s | comando + texto | saiu pela **dona** |
| `#switch:X` com 100 s | comando sozinho, uma mensagem só depois | saiu pela **dona** |
| `#contact_instance:Nina` + `ignorar_dono:true` | dono do contato na **Camyla**, bind na Nina, ack confirmado em 2,0 s, margem de 20 s | **saiu pela CAMYLA** |

O terceiro é o que encerra o assunto: o bind foi aceito, o app confirmou com
`[System]: Contact Instance Updated!`, a margem de 20 s foi respeitada — e a mensagem **ainda** saiu
pela dona. O ZaptosWPP prefixa cada mensagem com o nome de quem mandou, e o TESTE 5 chegou como
`Camyla: TESTE 5 — …`.

**Então o comentário da v25 do `campanhas-enviar` estava certo o tempo todo:** o `#contact_instance`
governa a **entrada**, o `fromNumber` não funciona (26/08), e o número de saída é o **`assignedTo`**.

Isso também corrige uma leitura errada que eu quase gravei aqui: o gestor relatou que, depois de
devolver o bind para a Nina, recebeu "pela Nina". A tela do WhatsApp dele mostra que aquelas linhas
(`Nina: 14:48`, `Nina: 15:00`) estavam na conversa do número da **Camyla**, com o nome prefixado —
não eram mensagens vindas do número da Nina.

**Consequência para o Conecta:** fazer o convite sair pela Nina exige mexer no `assignedTo` — trocar o
dono para a Nina, mandar, e devolver o dono para quem era antes. É a mesma máquina que o modo aviso
(`alerta: true`) já usa, e é a operação que custou dois dias em 15/09. Alternativa sem risco nenhum:
deixar o Zaptos sair pela assistente que já atende aquele cliente (é o que acontece hoje, sozinho) e
contar com o e-mail para o alcance. **Decisão do gestor.**

A função **`conecta-rebind`** foi escrita e publicada para o passo de devolver o bind, mas **não serve
mais ao propósito original** — o bind não desvia a saída. Ela continua útil para devolver o
roteamento de **entrada** depois de qualquer bind nosso, que é um efeito real: contato amarrado na
Nina faz a resposta do cliente cair na conversa da Nina, e a assistente dele para de ver o cliente.

**ATENÇÃO, estado deixado pelo teste:** o contato do gestor (11970399053) está com **Camyla** como
proprietária — ele trocou para testar. Enquanto estiver assim, **os avisos de lead novo não chegam
por Zaptos**, porque eles saem pela Nina (`copiloto_config.lead_inst`) e a trava de dono recusa. É
exatamente a falha que levou dois dias para aparecer em 15/09. Tem de voltar para a **Nina**.


### Decisão do gestor em 09/11: o Zaptos do Conecta sai pela assistente de cada cliente

Com as três tentativas negativas, as opções eram: trocar o dono e devolver (arriscado), dar dono Nina
só a quem não tem, ou deixar como está. **Ele escolheu deixar como está** — nenhum `assignedTo` é
tocado, o Zaptos sai pela assistente dona de cada contato e o **e-mail** é o canal que garante o
alcance. O painel passou a dizer exatamente isso, em azul (informação), no lugar do aviso vermelho que
prometia a Nina.

E a estimativa de tempo mudou de sentido: como o lote se divide entre várias instâncias, o "~8h numa
instância só" deixou de valer. A tela agora diz que o Zaptos sai a 2/min **por instância** e que o
e-mail não tem fila de instância, em vez de cravar um número que superestimaria.

**Contato do gestor devolvido para a NINA** (09/11 18:58, autorizado por ele), com a troca gravada em
`rep_dono_log` id 48 **antes** de chamar o GHL — `codvend 0` porque a coluna é NOT NULL e ele não é
representante. Os avisos de lead voltam a sair por Zaptos.


## Fila cancelada de novo em 11/11 — e o motivo era a chave desligada outra vez

*"Não sei o que está travado no painel, mas pode cancelar tudo!!!"* — gestor, 11/11.
**1.133 linhas canceladas.**

| campanha | canal | linhas | desde |
|---|---|---|---|
| nitronconecta | e-mail | 674 | 09/11 |
| nitronconecta | Zaptos (Nina 350, Elaine 7, Mara 6, Juliete 4) | 367 | 09/11 |
| rep_comunicado | Zaptos (Mara 31, Juliete 26, Elaine 20, Nina 5, Karla 2) | 84 | 10/11 |
| reativacao_email_cliente | e-mail | 8 | 10–11/11 |

**A causa: `fila_config.wpp_ativo = false` E `email_ativo = false`.** De novo. A primeira vez foi
15/10 (descoberta 4 dias depois, 285 linhas presas); esta é a segunda, com **1.133**.

**E desta vez a fila parecia viva**, o que é pior: desde a v35 a cobrança obedece
`cobranca_config.ativo`, que está `true` — então 262 mensagens saíram nas últimas 48h e o painel não
parecia parado. O que denuncia é o recorte: último Zaptos de campanha **não-cobrança** em
**09/11 19:21**, último e-mail de cobrança em **11/11 11:31**.

Ou seja: o gestor **disparou o Conecta em 09/11** e o lote morreu na chave, não no código.

**O banco não guarda quem desligou nem quando.** Duas vezes em menos de um mês é padrão, não acidente:
vale uma coluna de carimbo (`desligado_em`, `desligado_por`) em `fila_config` e um alerta quando
houver linha pendente com a chave do canal em `false`.

### O que o cancelamento deixou torto no CRM

O lote de 09/11 **criou 635 cards em "Convite enviado"** (mais 302 `sem_contato` e 4 falhas) antes de
a fila morrer. Esses 635 clientes **nunca receberam nada** — o pipeline está afirmando um convite que
não saiu. Num reenvio isso não atrapalha (o card já está na etapa certa e volta `ja_adiante`), mas
enquanto ninguém reenviar o quadro mente. **Não mexido — apagar 635 cards é decisão do gestor.**

### Três inscrições REAIS já entraram pelo formulário

E isso é a notícia boa: mesmo com a fila desligada, o site do Replit está recebendo.

| quando | empresa | dia | pessoas |
|---|---|---|---|
| 10/11 13:04 | sandra bevilaqua | 18/11 | 1 |
| 10/11 13:05 | leonildo bevilaqua da silva | 18/11 | 2 |
| 11/11 08:50 | Caires comércio de Utilidades doméstica (Wagner fernando) | 16/11 | 2 |

**Duas delas vieram com o telefone no campo do nome** e o nome da pessoa na razão social (ids 4 e 5).
Não é erro do contrato — é a pessoa preenchendo trocado, ou o rótulo do campo induzindo. Vale olhar a
ordem e os rótulos da primeira seção do formulário antes do convite em massa.

A inscrição de teste (id 3, "NITRON CONECTA - TESTE", 16/11, 3 pessoas) **continua ocupando vaga e
contando 3 pessoas para a comida** na agenda real. Apagar quando o gestor mandar.
