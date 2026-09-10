-- Quando a Nina termina de atender, a tarefa tem de EXISTIR onde o humano olha.
--
-- Em 10/09 o gestor abriu o painel do contato do lead que a Nina qualificou (Kasamais, Sao Luis/MA)
-- e leu "Ainda nao ha tarefas". A tarefa existia — em copiloto_tarefas, a NOSSA fila — e a nossa
-- fila nao avisa NINGUEM: e uma tabela que alguem precisa abrir. Ele foi direto ao ponto: "isso nao
-- pode passar de jeito nenhum". Entao passam a acontecer duas coisas no encerramento, e quem as faz
-- e a funcao copiloto-entrega (cron a cada 5 min, um minuto depois da copiloto-lead):
--   1. tarefa NO CRM, no contato, com dono de verdade (assignedTo) e quem acompanha nomeado;
--   2. mensagem para o responsavel com o resumo da conversa e os dados do cliente.
--
-- Quem e o dono e quem fica sabendo mora AQUI, nao em constante no codigo: muda por UPDATE, sem
-- deploy — a mesma regra que vale para os parametros da rota e da fila.

-- ---------------------------------------------------------------- 1) quem responde por cada area
-- A tabela nasceu em 10/09 com as 8 areas e TODOS os campos nulos: ninguem a lia, ninguem a
-- preenchia. Agora ela e a fonte do dono da tarefa e de quem recebe o aviso.
-- papel: o GHL aceita UM assignedTo por tarefa. Entao 'dono' e o responsavel de verdade e quem
-- 'acompanha' aparece nomeado no corpo da tarefa — foi o que o gestor pediu ao mandar marcar
-- "o Usuario do Leonardo, Camyla, tudo nessa tarefa".
alter table copiloto_responsaveis add column if not exists papel      text not null default 'dono';
alter table copiloto_responsaveis add column if not exists email      text;
alter table copiloto_responsaveis add column if not exists avisar     boolean not null default false;
alter table copiloto_responsaveis add column if not exists observacao text;

alter table copiloto_responsaveis drop constraint if exists copiloto_responsaveis_pkey;
alter table copiloto_responsaveis add  constraint copiloto_responsaveis_pkey primary key (area, papel);

comment on column copiloto_responsaveis.papel  is 'dono = responsavel (vira o assignedTo da tarefa no CRM); acompanha = fica nomeado no corpo. Uma tarefa do GHL aceita um assignedTo so.';
comment on column copiloto_responsaveis.avisar is 'true = recebe a mensagem com o resumo quando a Nina encerra o atendimento.';
comment on column copiloto_responsaveis.fone   is 'WhatsApp para o aviso interno. So funciona se o contato desse numero no CRM for da instancia que envia — o numero de saida e o assignedTo do contato.';

update copiloto_responsaveis
   set nome = 'Leonardo Lucas', fone = '5511970399053', email = 'leonardo.lucas@hyaksales.com.br',
       idcrm = 'Yoq6cL8mRr3ICN4EK3st', avisar = true, ativo = true, atualizado = now(),
       observacao = 'Dono das tarefas de lead do anuncio e quem recebe o resumo quando a Nina encerra.'
 where area in ('comercial', 'gestor') and papel = 'dono';

insert into copiloto_responsaveis (area, papel, nome, fone, idcrm, avisar, ativo, observacao)
values ('comercial', 'acompanha', 'Camyla Castro', '551124132253', 'CPmJ2iQ1eFHwS15bIxNJ', false, true,
        'Nomeada no corpo da tarefa. avisar=false: o numero dela e fixo (sem WhatsApp) e ela ja e seguidora dos contatos.')
on conflict (area, papel) do update
  set nome = excluded.nome, fone = excluded.fone, idcrm = excluded.idcrm,
      observacao = excluded.observacao, ativo = true, atualizado = now();

-- ---------------------------------------------------------------- 2) o rastro da entrega
-- entrega_ok fecha so quando as DUAS pontas deram certo (tarefa no CRM e alguem avisado). Enquanto
-- for false a fila tenta de novo, ate entrega_tentativas_max, e entrega_erro diz o que travou —
-- sem precisar ler log de funcao.
alter table copiloto_tarefas add column if not exists crm_task_id        text;
alter table copiloto_tarefas add column if not exists entrega_ok         boolean;
alter table copiloto_tarefas add column if not exists entrega_em         timestamptz;
alter table copiloto_tarefas add column if not exists entrega_tentativas integer not null default 0;
alter table copiloto_tarefas add column if not exists entrega_erro       text;

comment on column copiloto_tarefas.crm_task_id  is 'id da tarefa aberta no GHL no contato (POST /contacts/{id}/tasks). Nulo = so existe na fila interna. Preenchido, a copiloto-entrega NAO abre outra.';
comment on column copiloto_tarefas.entrega_ok   is 'true = tarefa aberta no CRM e responsavel avisado (copiloto-entrega). null/false = a fila ainda vai tentar.';
comment on column copiloto_tarefas.entrega_erro is 'por que a entrega nao fechou — sem precisar ler log de funcao.';

-- ---------------------------------------------------------------- 3) parametros da entrega
-- entrega_canal e uma CADEIA em ordem, e nao um canal so, porque o WhatsApp interno depende de quem
-- e o dono do contato no CRM: o numero de saida e o assignedTo do contato, e o campanhas-enviar
-- recusa quando o dono divirja da instancia pedida (bem: senao a mensagem sai por outro numero, ou
-- por instancia pausada, e vira "enviado" sem chegar). Hoje o numero do Leonardo ja e contato da
-- Isadora — cuja instancia esta pausada desde 03/09 — entao o WhatsApp e recusado e o aviso cai
-- para o e-mail em vez de se perder. Corrigido o dono no CRM, o WhatsApp volta a ser o primeiro da
-- fila sozinho, sem deploy.
-- entrega_origens comeca so com 'nina-lead': as tarefas 'nina-rep' (logistica, faturamento) nao tem
-- responsavel cadastrado ainda, e entregar sem dono e abrir tarefa que continua invisivel.
-- entrega_janela_h (12) evita entregar tarefa velha: a tabela tem meses de historico.
insert into copiloto_config (chave, valor) values
  ('entrega_ativa',          'sim'),
  ('entrega_origens',        'nina-lead'),
  ('entrega_prazo_h',        '4'),
  ('entrega_canal',          'whatsapp,email'),
  ('entrega_janela_h',       '12'),
  ('entrega_tentativas_max', '3'),
  ('entrega_aviso_gestor',   'sim')
on conflict (chave) do nothing;

-- ---------------------------------------------------------------- 4) o cron
-- Um minuto depois da copiloto-lead (*/5), para a tarefa recem-gravada ja estar la.
-- Aplicado em 10/09 assim, reaproveitando o header da job da copiloto-lead para nao escrever chave
-- em arquivo nenhum:
--   select cron.schedule('copiloto-entrega-5min', '1-59/5 * * * *',
--     replace((select command from cron.job where jobname = 'copiloto-lead-5min'),
--             'copiloto-lead?limite=10', 'copiloto-entrega?limite=10'));

-- ---------------------------------------------------------------- 5) correcao do gestor (10/09)
-- Ele conferiu a tarefa no CRM e viu o proprio nome no dono: "nao e para fazer isso, e para mandar
-- uma mensagem resumo desse lead para o Leonardo via sms/Zaptos". Ser avisado nao e ser dono da
-- tarefa — quem fecha o lead e o comercial. Entao o dono da area comercial passou a ser a Camyla, e
-- o Leonardo ficou como 'acompanha' (nomeado no corpo e seguidor do contato) e dono da area
-- 'gestor', que e quem tem avisar=true.
update copiloto_responsaveis set papel = 'tmp'       where area = 'comercial' and papel = 'dono';
update copiloto_responsaveis set papel = 'dono'      where area = 'comercial' and papel = 'acompanha';
update copiloto_responsaveis set papel = 'acompanha' where area = 'comercial' and papel = 'tmp';

update copiloto_responsaveis
   set avisar = (nome = 'Leonardo Lucas'), atualizado = now(),
       observacao = case when nome = 'Leonardo Lucas'
         then 'NAO e dono de tarefa: recebe o resumo do lead por Zaptos e fica marcado (seguidor + nomeado no corpo).'
         else 'Dona das tarefas de lead do anuncio no CRM (assignedTo). Numero fixo, sem WhatsApp: nao recebe aviso.' end
 where area = 'comercial';

-- ---------------------------------------------------------------- 6) o que o Zaptos interno exigiu
-- Fora do banco, e por isso fica registrado aqui: para o resumo sair pelo ZAPTOS (e nao pelo e-mail
-- da cadeia), o contato do numero do gestor teve de mudar de dono. O numero de saida e o assignedTo
-- do contato, e o GHL RECUSA contato duplicado nesta location ("This location does not allow
-- duplicated contacts") — entao o numero so pode viver no contato que ja existe, e ele era da
-- Isadora, cuja instancia esta desconectada desde 03/09.
--   contato WM5WMybpxqmGP7zoqwZt ("TESTE DNITRON") : assignedTo Isadora -> Nina (zEMc7K35JO8eUGghqHMN)
--   reverter e um campo: assignedTo = WlHZT90d36qnnXFbKzbl
-- Consequencia: esse contato tem `source` preenchido ("Form 38"), sinal de lead tao bom quanto a tag
-- ads, e agora a Nina fala com ele. Por isso a copiloto-lead v9 trava numero de casa, lido daqui:
--   select fone from copiloto_responsaveis
