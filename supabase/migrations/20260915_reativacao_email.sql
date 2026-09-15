-- 15/09/2026 — REATIVACAO POR E-MAIL AO CLIENTE PARADO HA 180+ DIAS.
--
-- Pedido do gestor: "tentei primeiro pelo WhatsApp, mas nao deu muito certo, vamos comecar a fazer
-- campanha de emails mais assertiva". O disparo entende o contexto do que estava acontecendo com
-- aquele cliente e retoma o contato; quem responder e assumido pela Nina.
--
-- 1) A AUDIENCIA MORA NUMA VIEW (reativacao_email_apto) — ver 20260915_reativacao_email_apto.sql.
--    Travas: um e-mail so recebe UMA vez mesmo atendendo varias lojas do grupo; e-mail de
--    representante nunca entra (a licao do rep_contato_extra em agosto, quando 6 dos 10 Zaptos do
--    Clube foram para contato interno); titulo vencido fica de fora — reativar quem nos deve e
--    conversa de cobranca; e so quem JA comprou alguma vez.
--
-- 2) O QUE A APURACAO REVELOU, e que decide a ordem do disparo:
--
--      faixa       clientes  com contexto do que comprava
--      180-364d        495   489
--      1-2 anos      1.098     0
--      2-3 anos        880     0
--      3 anos+       2.341     0
--
--    `contato_enriquecido` calcula compra_linhas, ticket_medio e faturamento em janela de 12 MESES.
--    Para quem esta parado ha mais de um ano essas colunas vem VAZIAS: a unica coisa que sabemos e a
--    data da ultima nota. Logo "um disparo entendendo o contexto" so e possivel hoje na primeira
--    faixa. Para as outras seria preciso puxar historico de 24-36 meses do Sankhya (o roteiro-refresh
--    ja faz isso para TGFCAB) e gravar as linhas compradas — trabalho separado, ainda nao feito.
--
-- 3) A AGENDA NAO PRECISOU DE CODIGO NOVO: o painel le o realizado da view `agenda_realizado`, que
--    e um group by de fila_envio por (dia local, campanha). Enfileirar com
--    campanha='reativacao_email_cliente' ja faz a campanha aparecer no dia com total/enviado/erro/
--    pendente ao vivo. A funcao so grava a linha de `agenda_campanha` (objetivo, alvo, status
--    'rodando'), para o dia nao mostrar um numero sem dono.
--
-- 4) A IA ESCREVE O TEXTO EM VOLTA E MAIS NADA. Proibido preco, desconto, prazo, frete, condicao de
--    pagamento, promocao, brinde, escassez e o angulo de concorrencia — nada disso foi autorizado, e
--    um numero inventado num e-mail de retomada vira discussao comercial depois. Ha uma rede de
--    seguranca em regex (PROIBIDO) que BARRA a linha se o texto escapar: melhor perder um e-mail do
--    que mandar condicao que ninguem autorizou.

insert into campanhas (codigo, pipe, nome, objetivo, publico, canais, fonte_msg, prioridade, ativa,
                       status_dados, criada_por, filtros_padrao, observacao, empresa)
values ('reativacao_email_cliente','reativacao','Reativação por e-mail — cliente 180+ dias',
 'Retomar contato com quem parou de comprar, por e-mail, com o contexto do que ele comprava. Quem responder é assumido pela Nina.',
 array['cliente'], array['email'], 'ia', 28, true, 'pronto', 'humano',
 '{"reativ_dias":"180","reativ_lote":"12","reativ_faixa_1":"180-364d"}'::jsonb,
 'Pedido do gestor em 15/09. Audiencia na view reativacao_email_apto. Contexto real so existe na faixa 180-364d.',
 'nitron')
on conflict (codigo) do update set ativa = excluded.ativa, nome = excluded.nome,
 objetivo = excluded.objetivo, filtros_padrao = excluded.filtros_padrao, observacao = excluded.observacao;

-- reativ_lote = 12 e limite de INFRAESTRUTURA, nao de negocio: cada e-mail custa uma chamada ao
-- modelo (~4s) e a edge function corta em 150s de ociosidade. Com 40 por rodada a funcao morria no
-- meio sem enfileirar nada. 12 cabe com folga.

-- HORARIO DA NINA (pedido do mesmo dia): ela e 24h, mas so fala em horario comercial; se o lead
-- responder fora disso ela pode continuar, respeitando das 6h as 22h de Sao Paulo. O toque de
-- iniciativa dela ja tinha trava propria (foraHorarioComercial(), 8-18 seg-sex e 8-13 sab). Faltava
-- o limite externo, e ele entrou no CRON — nao no codigo — porque assim vale para as duas passadas
-- sem publicar funcao que esta atendendo:
--   select cron.alter_job(147, schedule := '*/5 0,9-23 * * *');   -- 06:00-22:00 em Sao Paulo
