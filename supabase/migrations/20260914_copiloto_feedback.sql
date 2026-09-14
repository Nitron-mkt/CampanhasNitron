-- O RETORNO TEM DE VIR DO CLIENTE, porque do representante nao vem.
--
-- O gestor apontou o buraco em 14/09: quando o lead vai para representante, a conversa continua no
-- WhatsApp PESSOAL dele, fora do nosso CRM. Nao temos como ver se ligou, se marcou, se vendeu.
-- Entao a unica fonte de verdade e o proprio cliente — e a pergunta se faz a ele, 3 a 5 dias depois
-- do repasse. Quem executa e a funcao copiloto-feedback.
--
-- Por que 3 a 5 dias, e nao no dia seguinte: o representante precisa de tempo para ligar, e o
-- cliente precisa de tempo para ter o que contar. Antes disso a resposta e sempre "ainda nao".

alter table copiloto_lead add column if not exists feedback_em          timestamptz;
alter table copiloto_lead add column if not exists feedback_tentativas  integer not null default 0;
alter table copiloto_lead add column if not exists feedback_resposta    text;
alter table copiloto_lead add column if not exists feedback_resp_em     timestamptz;
alter table copiloto_lead add column if not exists feedback_resultado   text;
alter table copiloto_lead add column if not exists feedback_detalhe     text;
alter table copiloto_lead add column if not exists feedback_erro        text;

comment on column copiloto_lead.feedback_em        is 'quando perguntamos ao CLIENTE se o representante falou com ele';
comment on column copiloto_lead.feedback_resultado is 'atendido | nao_atendido | comprou | sem_interesse | indefinido | sem_resposta — lido da resposta dele.';
comment on column copiloto_lead.feedback_detalhe   is 'o que a resposta dizia, em uma linha, para o gestor ler sem abrir a conversa.';

create index if not exists copiloto_lead_feedback_ix on copiloto_lead (repasse_em) where repasse_ok and feedback_resultado is null;

-- ---------------------------------------------------------------- parametros
-- feedback_tipos comeca so com 'fisica' de proposito: quando o lead vai para a venda interna, a
-- conversa acontece nas NOSSAS instancias e da para ver no CRM — perguntar ali e redundante e
-- incomoda o cliente. Para o representante e o oposto: e a unica janela que temos.
insert into copiloto_config (chave, valor) values
  ('feedback_ativo',       'sim'),
  ('feedback_tipos',       'fisica'),
  ('feedback_dias',        '3'),
  ('feedback_dias_limite', '5'),
  ('feedback_reforco_h',   '48'),
  ('feedback_toques_max',  '2'),
  ('feedback_limite',      '3'),
  ('feedback_desistir_h',  '96')
on conflict (chave) do nothing;

-- ---------------------------------------------------------------- os crons
-- Perguntar uma vez por dia, de manha (10:20 de SP), so em dia util: e pergunta de cobranca gentil,
-- nao precisa de cadencia fina e nao cabe no sabado. Ler a resposta a cada 30 min, porque a resposta
-- chega quando o cliente quiser. Aplicados em 14/09 reaproveitando o header da job da copiloto-lead:
--   select cron.schedule('copiloto-feedback-perguntar', '20 13 * * 1-5', replace(...,'copiloto-lead?limite=10','copiloto-feedback?acao=perguntar'));
--   select cron.schedule('copiloto-feedback-ler',       '5,35 11-22 * * 1-6', replace(...,'copiloto-lead?limite=10','copiloto-feedback?acao=ler'));
