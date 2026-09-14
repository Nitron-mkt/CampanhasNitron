-- REPASSE DO LEAD QUALIFICADO PARA QUEM VENDE.
--
-- Ate aqui a Nina qualificava, abria tarefa no CRM e avisava o gestor — e parava ali: quem ia falar
-- com o lead era decidido a mao, e o lead ficava esperando sem saber que estava esperando. O gestor
-- pediu em 14/09 que isso vire rotina: saudar o lead na hora, dizer que um representante fala com
-- ele HOJE, e escolher quem atende — sorteio entre os representantes da praca quando e loja fisica,
-- sorteio entre as vendedoras internas quando e e-commerce/marketplace (que nao tem praca).
-- Quem executa e a funcao copiloto-repasse (cron */15 11-22 * * 1-6).

-- ---------------------------------------------------------------- 1) o rastro no proprio lead
alter table copiloto_lead add column if not exists saudacao_em        timestamptz;
alter table copiloto_lead add column if not exists repasse_tipo       text;
alter table copiloto_lead add column if not exists repasse_codvend    integer;
alter table copiloto_lead add column if not exists repasse_para       text;
alter table copiloto_lead add column if not exists repasse_fone       text;
alter table copiloto_lead add column if not exists repasse_em         timestamptz;
alter table copiloto_lead add column if not exists repasse_ok         boolean;
alter table copiloto_lead add column if not exists repasse_erro       text;
alter table copiloto_lead add column if not exists repasse_tentativas integer not null default 0;
alter table copiloto_lead add column if not exists repasse_historico  jsonb not null default '[]'::jsonb;

comment on column copiloto_lead.saudacao_em       is 'quando a Nina avisou o lead de que um representante fala com ele hoje';
comment on column copiloto_lead.repasse_tipo      is 'fisica = loja de rua, vai para representante da praca; online = e-commerce/marketplace, vai para venda interna';
comment on column copiloto_lead.repasse_historico is 'todo repasse ja feito deste lead, inclusive os que falharam ou foram trocados — para nao sortear duas vezes o mesmo.';

-- ---------------------------------------------------------------- 2) as vendedoras internas
-- Quem atende e-commerce/marketplace. Sorteio entre as ativas, com memoria: `repasses` traz para a
-- frente quem recebeu menos. Sem isso o sorteio puro empilha — na primeira previa os tres leads
-- online cairam todos na mesma pessoa.
create table if not exists copiloto_venda_interna (
  nome        text primary key,
  codvend     integer,
  fone        text not null,
  contact_id  text,
  instancia   text,
  ativo       boolean not null default true,
  repasses    integer not null default 0,
  ultimo_em   timestamptz,
  observacao  text,
  atualizado  timestamptz not null default now()
);
comment on table copiloto_venda_interna is 'Vendedoras internas que recebem lead de e-commerce/marketplace (sem loja fisica). Sorteio entre as ativas.';
comment on column copiloto_venda_interna.instancia is 'instancia Zaptos DELA — serve para NAO mandar o aviso pela propria instancia (numero nao conversa consigo mesmo).';

insert into copiloto_venda_interna (nome, codvend, fone, contact_id, instancia, observacao) values
  ('Mônica',  178, '5511946611026', 'QAozvwxO9swtb4qGJBek', 'Mônica',  'Venda interna. Numero da instancia dela no Zaptos.'),
  ('Valeria', 125, '5511946331352', '0PiqqAPiWjm63NWWaQLS', 'Valeria', 'Venda interna. Numero da instancia dela no Zaptos.')
on conflict (nome) do update
  set fone = excluded.fone, contact_id = excluded.contact_id, codvend = excluded.codvend,
      instancia = excluded.instancia, ativo = true, atualizado = now();

-- ---------------------------------------------------------------- 3) de-para UF -> CODUF
-- roteiro_cliente.uf e o CODUF numerico do Sankhya; copiloto_lead.uf e a sigla. Sem este de-para
-- nao da para achar o representante da praca do lead. Valores de TSIUFS (producao).
create table if not exists uf_coduf (
  sigla text primary key,
  coduf integer not null unique
);
comment on table uf_coduf is 'de-para sigla <-> CODUF do Sankhya (TSIUFS). roteiro_cliente.uf usa o CODUF.';
insert into uf_coduf (sigla, coduf) values
 ('SP',1),('MG',2),('DF',3),('GO',4),('MT',5),('BA',6),('RJ',7),('PR',8),('PA',9),('PE',10),
 ('RO',11),('MS',12),('SC',13),('TO',14),('RS',15),('ES',16),('PB',17),('AM',18),('AL',19),('AC',20),
 ('CE',21),('SE',22),('PI',23),('RR',24),('RN',26),('AP',28),('MA',31)
on conflict (sigla) do update set coduf = excluded.coduf;

-- ---------------------------------------------------------------- 4) o sorteio, em SQL
-- Quem pode receber um lead de loja fisica numa praca. Devolve os candidatos JA EMBARALHADOS: o
-- sorteio mora aqui, nao no codigo, para dar para conferir em SQL quem estava no chapeu.
-- Prioridade: quem ja tem cliente NA CIDADE do lead. So quando ninguem tem e que abre para a UF
-- inteira — mandar um lead de Cordeiro/RJ para quem nunca pisou no RJ nao e sorteio, e roleta.
create or replace function repasse_candidatos(p_cidade text, p_uf text, p_excluir int[] default '{}')
returns table (codvend integer, rep text, na_cidade bigint, no_estado bigint, escopo text)
language sql stable as $$
  with cod as (
    select coduf from uf_coduf where sigla = upper(btrim(coalesce(p_uf, '')))
  ),
  base as (
    select r.codvend, r.rep,
           count(*) filter (
             where upper(translate(r.cidade, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
                                             'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
                 = upper(translate(btrim(coalesce(p_cidade, '')), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
                                                                  'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
           ) as na_cidade,
           count(*) as no_estado
      from roteiro_cliente r
     where r.uf = (select coduf from cod)
       and not (r.codvend = any (coalesce(p_excluir, '{}'::int[])))
       and exists (select 1 from snap_rep s where s.codvend = r.codvend)
     group by r.codvend, r.rep
  ),
  tem_cidade as (select count(*) > 0 as ok from base where na_cidade > 0)
  select b.codvend, b.rep, b.na_cidade, b.no_estado,
         case when (select ok from tem_cidade) then 'cidade' else 'uf' end
    from base b
   where ((select ok from tem_cidade) and b.na_cidade > 0)
      or (not (select ok from tem_cidade))
   order by random();
$$;
comment on function repasse_candidatos is 'Representantes elegiveis para um lead de loja fisica, embaralhados. escopo=cidade quando ha rep com cliente na cidade; escopo=uf quando abriu para o estado.';

-- ---------------------------------------------------------------- 5) parametros
insert into copiloto_config (chave, valor) values
  ('repasse_ativa',        'sim'),
  ('repasse_saudacao',     'sim'),
  ('repasse_inst',         'Camyla'),
  ('repasse_inst_alt',     'Nina'),
  ('repasse_troca_dono',   'sim'),
  ('repasse_janela_h',     '120'),
  ('repasse_limite',       '2'),
  ('repasse_rep_excluir',  '0,67,116,125,137,178,223'),
  ('repasse_sorteio',      'cidade'),
  ('repasse_online_re',    'e-?commerce|ecommerce|marketplace|market place|mercado ?livre|magalu|shopee|amazon|shein|loja virtual|loja online|so online|apenas online|venda online|vendas online|site proprio|dropship')
on conflict (chave) do nothing;

-- ---------------------------------------------------------------- 6) o cron
-- A cada 15 min em horario comercial de SP (11-22 UTC), seg-sab. Lote de 2 de proposito: cada envio
-- passa pelo campanhas-enviar, que espera ~12s conferindo a entrega, e lote grande estoura o tempo
-- da funcao. Aplicado em 14/09 reaproveitando o header da job da copiloto-lead, para nao escrever
-- chave em arquivo nenhum:
--   select cron.schedule('copiloto-repasse-15min', '*/15 11-22 * * 1-6',
--     replace((select command from cron.job where jobname = 'copiloto-lead-5min'),
--             'copiloto-lead?limite=10', 'copiloto-repasse?limite=2'));
