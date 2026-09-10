# Rotina automatica da Teak Brazil no GHL — autorizada pelo gestor em 10/09/2026
Location Teak: DRhJc78pTfF9dlaH5NK9 | Autoatendimento user: 8KdFUUX0NHzmsMOdeNlM
Marcelo user: nXGAeMtrbxH6b8FKT9OP

## A cada acordar, nesta ordem

### 1. Ver quem respondeu
search-conversation com lastMessageDirection=inbound, sortBy=last_message_date, desc.
Comparar com o que ja foi tratado (respondidos.txt).

### 2. Tratar cada resposta nova
- Autoresposta / robo  -> ignorar, so registrar.
- "nao temos interesse" -> Nina agradece, fecha com elegancia, canal aberto. Sem tarefa.
- Pergunta que a Nina consegue responder (o que fazemos, prazo generico, catalogo)
  -> Nina responde e mantem aquecendo.
- Pedido de PRECO, COTACAO, VOLUME, PRAZO FIRME, ou audio/ligacao
  -> a Nina NAO inventa numero. Vira handoff (passo 3).
- Conversa que ja estava assinada pelo Marcelo (as de e-mail)
  -> a Nina NAO intercepta. Vira handoff direto.

### 3. Handoff (quando um humano precisa entrar)
a) create-task no contato do lead, assignedTo = Marcelo (nXGAeMtrbxH6b8FKT9OP)
b) Zaptos para Marcelo (S4cJhmT94XFQelbgY57U) e Leonardo (qwn25jkcEUNzgkCawPVj)
c) E-mail: to <e-mail do contato S4cJhmT94XFQelbgY57U, ver CRM>,
   cc <e-mail do contato qwn25jkcEUNzgkCawPVj, ver CRM> + autoatendimento@teakbrazil.com.br
Formato fixo: Contato / Telefone / Origem / Dias parada / O que aconteceu / O que falta / link CRM.

### 4. Avisar o gestor no celular (pedido de 10/09)
Toda resposta HUMANA de lead (nao autoresposta) gera aviso Zaptos para
Leonardo (qwn25jkcEUNzgkCawPVj, <telefone do contato qwn25jkcEUNzgkCawPVj, ver CRM>). Curto: quem, o que disse, o que fiz.
Agrupar num aviso so quando cair mais de uma na mesma rodada.

### 5. Lote de e-mail frio
Fonte: fila_final.json (381 contatos, ja validados por MX, sem fornecedor,
sem interno, sem conversa recente <20d). Campo trilha = madeira|brindes.
- Sempre com emailFrom convite@email.teakbrazil.com.br e emailTo explicito.
- RAMPA (dominio novo, nao estourar): 20 hoje, depois ate 40 por acordada,
  teto de 120/dia. Nao passar disso sem o gestor mandar.
- Registrar cada contactId em enviados.txt na mesma rodada.
- Se a taxa de falha de um lote passar de 40%, PARAR o e-mail e reportar.

### 6. Zaptos frio: NAO expandir sozinho
Teto de 2 msg/min por instancia. A instancia Autoatendimento e a unica em uso.
Novos lotes de Zaptos frio so com o gestor pedindo.

## Regras que nao se quebram
- Nunca inventar preco, prazo firme, condicao comercial ou disponibilidade.
- Nunca afirmar que o lead sumiu ou nao respondeu (o CRM antigo da Teak era mal usado;
  a resposta pode ter existido por telefone).
- update-contact SUBSTITUI tags: ler antes, reenviar a lista inteira.
- Respeitar descadastro (CONVERSATIONS_MSG_UNSUBSCRIBED_EMAIL). Nunca contornar.
- Endereco que falhou uma vez nao e retentado.
- Marcador #contact_instance: esperar "[System]: Contact Instance Updated!" antes de mandar.
- Segurados: Walter/teakrc.com (concorrente), Representante Romani (precisa texto proprio).
