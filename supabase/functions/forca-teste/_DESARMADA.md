# forca-teste está DESARMADA desde 19/11

O corpo publicado foi esvaziado (responde 410) a pedido do gestor, ao fim da rodada de testes:
*"volte ao estado fora do teste, real mesmo pois vou voltar as campanhas"*.

Ela chegou a ter `?teste=0`, que é chamada **de verdade** contra a API do Força — abre cadastro e
pedido no ERP sem passar por nenhuma das travas da `forca-cadastro`. Deixar isso publicado, mesmo
atrás da chave de serviço, é deixar uma porta aberta.

Não há ferramenta de apagar edge function nesta sessão; por isso o corpo foi substituído em vez de
removido. **O código que rodou os seis casos continua neste arquivo** (`index.ts` no histórico do
git, commit "Teste da API do Forca em modo teste") e o resultado está em
`docs/forca-teste-19-11.md`. Para voltar a usar: recuperar do git e republicar.
