# Pendências e riscos — levantados em 18/09/2026

Lista do que encontrei ao ler o projeto inteiro. Nada aqui foi mexido: a máquina está como
o Ricardo deixou. Ordem é de risco, não de esforço.

## 1. A fila de WhatsApp está parada há 4 dias, com 566 pendentes

Parou em 14/09, `pausa_manual='sim'` trava o watchdog, e as 566 linhas continuam
esperando. **É decisão, não manutenção**: religar sem a instância do Evolution conectada
transforma pendente em erro. O roteiro de religar está em
`02-canal-whatsapp-evolution.md`. Enquanto isso, vale saber que a **ponte
e-mail → WhatsApp continua disparando** (ela não passa por `fila_envio`): se a instância
está caída, essas mensagens falham sem ninguém ver — não entram na fila, o vigia não as
enxerga e ninguém as reenvia.

## 2. As 13 funções não estão versionadas em lugar nenhum

Vivem só no Supabase. Não há cópia em `supabase/functions/`, não há histórico, e um deploy
errado não tem para onde voltar. É o risco mais barato de eliminar e o de maior
consequência se acontecer. Próximo passo: baixar os fontes e commitar em
`supabase/functions/constelacao-*/index.ts`, como o resto do repositório.

## 3. Metade do schema foi criada fora de migração

Só existem duas migrações (19/08). As tabelas `atendido`, `atendimento_log`, `humano`,
`pipe_estado` e a coluna `fila_envio.status_ghl` nasceram por SQL avulso. **O schema não
pode ser recriado do zero hoje** — nem em outro projeto, nem depois de um acidente.
Escrever a migração que descreve o estado atual fecha o buraco.

## 4. Os 573 e-mails sem status podem nunca ganhar um

`constelacao-refill` refresca 80 por rodada **ordenando pelos mais recentes**
(`order by enviado_em desc limit 80`). Como sempre há envio novo, os antigos sem status
ficam no fim da fila para sempre. A `check-opens`, que varre tudo, não tem cron. Efeito
prático: a taxa de abertura real é maior que os 30,5% medidos, e não sabemos quanto.
Conserto de uma linha: alternar a ordem, ou rodar `check-opens` uma vez por semana.

## 5. Contatos da casa estão cravados no código-fonte

`ricardo@hyak.com.br` e `nicoletti.ricardo@gmail.com` aparecem literalmente em três
funções. É a mesma armadilha do `rep_contato_extra` da Nitron, resolvida no lugar errado:
**incluir ou tirar alguém da lista exige deploy**. Deveria ser uma chave em `config` ou uma
tabela `excluido`.

## 6. O remetente não tem o nome da marca

As mensagens assinam **Constelação das Frutas**, mas saem de
`contato@mail.constelacaodetalentos.com` — domínio de *Talentos*. A migração de 19/08
também cadastrou a empresa como "Constelação de Talentos" (a linha foi corrigida depois
para "das Frutas"). Para um atacadista europeu que recebe um e-mail frio, remetente e
assinatura discordando é sinal de golpe — e pesa na entregabilidade. Decisão de negócio:
ou o domínio muda, ou se assume o nome.

## 7. `wa_via` não faz nada

A chave diz `evolution_sms`, mas nenhuma função a lê. Quem decide o provedor é a
configuração da subconta no GHL. Ou a chave passa a valer alguma coisa, ou vira comentário
— do jeito que está, a próxima pessoa vai trocar o valor e achar que mudou o canal.

## 8. `hyak-contatos-sync` é entulho ativo

Publicada, ativa, apontando para um schema que não existe desde 19/08. Nenhum cron a
chama. Apagar — é o que fazia este projeto parecer "o projeto Hyak" para quem procurava.

## 9. Ninguém recebe relatório nenhum

`constelacao-relatorio` e `constelacao-conversas-dia` são boas e **não têm cron**: só
respondem a quem as chama. A revisão do dia (🔴🟠⚪, com o próximo passo de cada conversa)
é a melhor coisa do projeto e hoje ninguém a lê. Um cron diário entregando o markdown por
WhatsApp ou e-mail é a melhoria de maior retorno por linha escrita.

## 10. O funil não sabe dizer se vendeu

O estágio "ganho" nunca é marcado por nenhuma função, e os estágios 1 e 5 não são escritos
por ninguém. Dá para medir enviados, aberturas, respostas e handoffs — **não dá para medir
negócio fechado**. É a mesma lacuna da atribuição envio → pedido na Nitron.

## 11. Handoff é via de mão única

Entrou em `humano`, a IA nunca mais responde aquela conversa — nem depois de resolvida.
Não existe "devolver para a IA" a não ser apagando a linha. Com 5 handoffs ainda é pouco;
com 50 vira trabalho manual permanente.

## 12. O preço depende de outro projeto

`constelacao-atende` busca a cotação em `hyak-limao-mercado` a cada rodada. Se aquele
projeto estiver fora do ar, a IA responde sem tabela — e, obedecendo ao prompt, não cota.
Não há alerta para isso: a conversa simplesmente sai pior.

## 13. Não há histórico de queda da instância

A pausa é um booleano. Não dá para responder "quantas vezes a instância caiu este mês", só
"está pausada agora". Na Nitron isso virou `instancia_ghl.pausada_em` depois de doer.

## 14. Resíduos menores

- `config.chegada = '22–26 Sept'` está parada e não é usada — o envio recalcula a janela.
- `remetente_site` está vazio, e os textos que usam a variável saem com um buraco.
- `alerta_teams_webhook` está vazio: o alerta de handoff depende de um único número de
  WhatsApp — pelo mesmo canal que cai.
- 151 contatos com e-mail inválido no GHL estão parados em `erro`, corretamente. Limpar a
  base é trabalho de CRM, não de código.
