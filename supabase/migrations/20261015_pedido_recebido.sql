-- Onde o pedido montado na pagina fica registrado. O WhatsApp passa a levar so o codigo.
create table if not exists public.pedido_recebido (
  id bigserial primary key, codigo text unique, criado timestamptz not null default now(),
  segmento text, loja text, cnpj text, cidade text, fone text,
  contact_id text, lead_id bigint,
  itens jsonb not null default '[]'::jsonb,
  qtd_itens int, qtd_fardos int, qtd_pecas int,
  subtotal numeric(12,2), desconto numeric(12,2), total numeric(12,2),
  origem text default 'pagina', status text not null default 'novo', dono text,
  email_para text, email_ok boolean, email_em timestamptz, email_erro text
);
create index if not exists pedido_recebido_criado_idx on public.pedido_recebido (criado desc);
create index if not exists pedido_recebido_cnpj_idx   on public.pedido_recebido (cnpj);
create index if not exists pedido_recebido_status_idx on public.pedido_recebido (status);
insert into copiloto_config (chave, valor) values
  ('pedido_email_para','camyla.castro@nitron.com.br'),
  ('pedido_dono','Camyla Castro'),
  ('pedido_aviso_ativo','sim')
on conflict (chave) do nothing;
