-- View da audiencia da reativacao por e-mail. Aplicada em 15/09/2026.
-- O texto integral e o raciocinio estao em 20260915_reativacao_email.sql.
create or replace view reativacao_email_apto as
with internos as (
  select lower(trim(e)) as email from (
    select email from snap_rep union all select email_crm from snap_rep union all select email_parc from snap_rep
    union all select email from copiloto_responsaveis
  ) x(e) where e is not null and trim(e) <> ''
),
cand as (
  select ce.codparc, ce.nomeparc, ce.cnpj, ce.praca, ce.canal, ce.ramo, ce.codvend,
         ce.ult_fat, ce.dias_sem_compra, ce.num_compras, ce.faturamento_12m, ce.ticket_medio,
         ce.compra_linhas, ce.classe_abc, ce.situacao, ce.resumo, ce.giro,
         lower(trim(g.email)) as email, g.nome as contato_nome, g.ghl_id, g.fone,
         row_number() over (partition by lower(trim(g.email)) order by ce.dias_sem_compra asc, ce.codparc) as rn,
         count(*) over (partition by lower(trim(g.email))) as lojas_no_email
  from contato_enriquecido ce
  join ghl_contato g on g.codparc = ce.codparc
  where ce.dias_sem_compra >= 180
    and coalesce(ce.inapto, false) = false
    and coalesce(ce.titulos_vencidos, 0) = 0
    and ce.ult_fat is not null
    and g.email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$'
    and lower(trim(g.email)) not in (select email from internos)
)
select c.codparc, c.nomeparc, c.cnpj, c.praca, c.canal, c.ramo, c.codvend,
       c.ult_fat, c.dias_sem_compra, c.num_compras, c.faturamento_12m, c.ticket_medio,
       c.compra_linhas, c.classe_abc, c.situacao, c.resumo, c.giro,
       c.email, c.contato_nome, c.ghl_id, c.fone, c.lojas_no_email,
       sr.rep as rep_nome,
       case when c.dias_sem_compra < 365 then '180-364d'
            when c.dias_sem_compra < 730 then '1-2 anos'
            when c.dias_sem_compra < 1095 then '2-3 anos'
            else '3 anos+' end as faixa
from cand c
left join snap_rep sr on sr.codvend = c.codvend
where c.rn = 1;
