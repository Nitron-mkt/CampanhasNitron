# Nina — Autoatendimento da Teak

> **Outros nomes do mesmo projeto:** Nina da Teak · Autoatendimento Teak · atendimento
> virtual da Teak · "a IA que responde os leads da Teak" · instância `Autoatendimento`.
> Se você chegou aqui procurando por qualquer um desses, é isto.

Foto do estado em **08/10/2026**. Levantado lendo o GHL e as Routines, não por memória.

---

## 1. O que é (e o que NÃO é)

O autoatendimento da Teak **não é edge function, não é cron, não é tabela no Supabase**.
É uma **sessão do Claude mantida viva por uma corrente de Routines**, que age dentro do
GHL pelo conector MCP.

Isso é importante porque existem **duas coisas diferentes chamadas "Nina"** neste banco:

| | Nina da Teak (esta) | Nina do Supabase |
|---|---|---|
| o que é | sessão do Claude + Routines | edge function `emp-copiloto-responder` |
| onde roda | fora do Supabase, via MCP do GHL | Supabase, cron `roga-responder-3min` |
| quem usa | **Teak** | **Roga Village** |
| latência | ~1 hora (varredura em lote) | ~3 minutos |
| está no ar? | **sim, respondendo lead** | sim — mas **nunca ligada para a Teak** |

Confundir as duas já custou um diagnóstico errado. Quando alguém disser "a Nina da Teak",
é a de cima.

## 2. Identidade — como achar

| peça | valor |
|---|---|
| sessão persistente | `session_018p5VgFu7232CT4sLsikHdP` — título **"Nina — Autoatendimento da Teak (motor em produção)"** |
| nascida em | 04/09/2026, pelo app desktop |
| branch dela | `claude/ghl-teak-brazil-connection-hn2nzq` (mesmo repositório) |
| subconta GHL (Teak) | location `DRhJc78pTfF9dlaH5NK9` |
| assinatura no GHL | app de marketplace `lc-mcp - Anthropic` (appId `6a3e39daceb2ab00111df10c`) |
| provedor de saída | `6aa320fd652d120992c7a592` (Hyak WhatsApp SMS) |
| Routines | `mcp__Claude_Code_Remote__list_triggers` — prefixo **`Nina — Autoatendimento da Teak`** |

Para ver o que ela está fazendo agora: `list_triggers` e procure a Routine habilitada
apontando para essa sessão; o `prompt` dela **é o manual de operação do dia**.

## 3. Como ela funciona

1. Uma Routine dispara e reata a sessão persistente.
2. A sessão varre o GHL: `export-messages-by-location`, location da Teak, desde o fim
   da varredura anterior.
3. Para cada mensagem a responder: posta `#contact_instance: <instância>` como type **SMS**
   (nunca type WhatsApp), pelo provedor de saída, e **só então** a mensagem.
4. Reporta a três destinos internos (gestor, Marcelo pessoal, instância do Marcelo),
   sempre marcando `#contact_instance: Autoatendimento`.
5. **Cria a próxima Routine** com o resumo do que já fez — e é assim que a corrente anda.

### As duas instâncias — não confundir

- **`Autoatendimento`** → só relatório interno. Nunca fala com cliente.
- **`Marcelo`** → é por onde ela fala com **lead**. Ela lê o `Instance Source` do inbound e
  responde **pela instância que originou a conversa**, para não atropelar o vendedor.

### Cadência real (medida)

Não é tempo real. Em 06/10 ela disparou às 10h25, 11h15, 12h10, 13h10, 14h10, 15h20,
16h40 e 18h — **cerca de 1 em 1 hora**, cada uma reagendando a seguinte.

Latência medida de três respostas a lead em 07/10, do último inbound até a resposta:
**659 min, 636 min e 277 min.** Lead que chega de madrugada espera a varredura da manhã.

### Volume medido (06/10 19h02 → 07/10 20h05, 200 mensagens)

| | |
|---|---|
| humano (Marcelo) | 79 |
| entradas de cliente | 48 |
| **IA autoatendimento** | **27** |
| binds `#contact_instance` | 23 (18 `Autoatendimento`, 5 `Marcelo`) |
| avisos `[System]` **entregues** | 23 — **5 deles para cliente real** |

## 4. As regras que ela obedece (moram no prompt da Routine, não no banco)

- **NÃO anuncia condição comercial** — preço, frete, mínimo, prazo, regra de venda,
  condição de exportação. Já errou inflando o mínimo e perdeu um lead por isso. Quem
  anuncia é o Marcelo.
- **Não deduz segmento, nome nem gênero** pelo perfil ou pelo cadastro.
- **Nunca age pelo campo do CRM** — lê a conversa real.
- **Não atropela o Marcelo**: lista de ~26 contatos que são dele e ela não encosta.
- **Não diz "fechou"** enquanto material, medidas, fixação, prazo e pagamento não
  estiverem todos aceitos.
- **Não lê áudio, vídeo nem PDF-imagem** — diz isso em vez de fingir. Imagem inbound tem
  de ser baixada na hora: os links do bridge expiram em poucas horas.
- Tem uma lista fechada do que **pode afirmar** sobre produto (medidas de painel, deck,
  forro, serrada, FSC, serraria em Ouro Preto do Oeste/RO, CD em Guarulhos).

## 5. Fragilidades conhecidas — onde isso quebra

1. **A corrente depende dela mesma.** Cada Routine é one-shot e a próxima só existe se a
   sessão a criar. Se uma rodada falhar sem reagendar, **o autoatendimento morre em
   silêncio** — nada avisa. Não há cron de segurança.
2. **A memória mora em scratchpad volátil** (`respondidos.txt` e `ACHADOS.md`, no container
   de outra sessão). O próprio prompt já prevê ter de se reconstruir se sumir.
3. **Latência de ~1h**, por desenho. Para cair a minutos, o caminho é migrar para a Nina do
   Supabase (seção 6).
4. **Contexto da sessão**: já usou 534k de 1M tokens. Quando encher, a corrente precisa
   renascer — e o manual mora no prompt da Routine, não aqui.
5. **O `[System]: Contact Instance Updated!` continua sendo entregue** ao aparelho. Não é
   culpa dela: é o bridge. Ver a regra no `CLAUDE.md`, seção do Hyak WhatsApp.

## 6. Se um dia for migrar para a Nina do Supabase

Cinco peças faltam, e **a quinta é armadilha**:

| | falta |
|---|---|
| a | `teak.copiloto_config` está **vazia** (Roga tem 49 linhas) — falta `copiloto_ativo='sim'` |
| b | `teak.copiloto_skills` **vazia** (Roga tem 15 ativas) |
| c | não existe cron chamando `emp-copiloto-responder?empresa=teak` |
| d | não existe a tabela `teak.handoff` |
| e | `public.empresa` TEAK está `ativa=false`, `pronto=false`, `canal_wpp='ghl_nativo'` — mas a realidade é o gateway Hyak WhatsApp |

**Armadilha:** `teak.conversa_estado` hoje é a tabela do **classificador**
(`conversation_id`, `etapa`, `confianca`, `classificado_em`) e **não tem** as colunas que o
respondedor grava (`conversa_id`, `assumida_em`, `humano_ate`, `decidido_em`). Ligar sem
resolver isso **quebra**. Não reaproveitar a mesma tabela sem pensar.

Modo rascunho existe: sem `copiloto_ativo='sim'` o motor só redige; `?previa=1` força.

## 7. O que roda no Supabase do lado da Teak (e funciona)

Não é o autoatendimento, mas alimenta o CRM que ela lê:

| cron | o quê |
|---|---|
| `teak-conversas-10min` | `emp-conversas-classificar` — classifica etapa e marca `aguardando-nossa-resposta`. 78 execuções/24h, 0 falhas |
| `teak-sync-contatos-2h` | `teak.sincronizar_contatos()` |
| `ghl-leads-refresh-teak-2h` | leads do GHL |
| `cache-refresh-teak-3h` / `teak-erp-refresh-diario` | cache e ERP |

`teak.conversa_estado` tinha 449 linhas em 07/10, **273 com `esperando_nos=true`**. A Nina
da Teak **não lê essa tabela** — ela lê o GHL direto. Os dois mundos não se falam.

## 8. Pendências desta frente (08/10/2026)

1. **Exportação: atendemos ou não?** Dois compradores parados esperando decisão do gestor
   (Bangladesh e Paquistão). Já cobrado 4× ao Marcelo e 3× ao gestor.
2. **Ligar a Nina do Supabase para a Teak?** Decisão do gestor. Só com ordem expressa, e
   em modo rascunho primeiro.
3. **`nina-wpp-loop` tem JWT `service_role` literal no fonte** — mesma classe que saiu de
   3 funções em 31/08. Basta apagar o fallback; ela já faz `Deno.env.get("SRV_JWT") || SRK`.
   Não republicar sem ok: roda a cada 3 min atendendo cliente da Nitron.
4. **Correção do `[System]` no bridge** não aplicada — depende do Ricardo (sem SSH daqui).
