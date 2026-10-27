# copiloto-lead — historico de versoes (v4 a v16)

Tirado do cabecalho de `supabase/functions/copiloto-lead/index.ts` em 26/10/2026. Nada aqui foi
reescrito: e o texto como estava no fonte. Saiu do codigo porque o cabecalho passou de 180 linhas
e o arquivo inteiro precisa ser reenviado a cada deploy — mas **nao e descartavel**: cada bloco
explica um erro que ja custou caro e a razao de uma trava que ainda esta la. Antes de desfazer
qualquer coisa nessa funcao, leia a versao que a introduziu.

As versoes vivas (v17 e v18) continuam no cabecalho do proprio fonte.

---

v16 — O TOQUE DE SEGUIMENTO PASSA A CONTORNAR, NAO A SE DESPEDIR. Ordem do
gestor em 22/10: "a todos os leads que morrem, precisamos contornar, ou falando do desconto que
ja tem, ou falando que escolhendo os itens que precisam eles podem receber uma condicao especial
diferente, basta concluir o pedido que a Nina passara para um dos nossos vendedores onde podem
abrir mais opcoes de tabelas, descontos e tudo mais".
As licoes 347 e 348 entraram primeiro, sem deploy — e NAO bastaram. Na previa dos tres primeiros
toques a Nina escreveu mensagens corretas e genericas ("me conta o que mais vende que eu te
aponto o mix"), sem citar desconto nem vendedor. O motivo estava no proprio prompt: ele dava um
CARDAPIO do que oferecer ("o link do catalogo, uma sugestao pelo tipo de loja dele, dizer que
pode mandar so o que interessa") e ela escolhia dali. Licao nao vence instrucao concreta do
prompt quando as duas falam do mesmo assunto.
Agora o cardapio e o contorno, o catalogo saiu dele (nao tem preco) e o ultimo toque deixou de
ser uma despedida.

v15 — A NINA FECHA; `passar_comercial` DEIXA DE SER A SAIDA. Em 21/10 o gestor
repetiu a ordem olhando os leads que chegaram: "nao vai passar mais, vai fazer o combinado da
Nina fechar". O leak estava aqui: o `passar_comercial` continuava sendo o fim natural da
qualificacao, e ele fazia duas coisas ruins de uma vez — abria tarefa para o comercial E gravava
status='passado', que TIRA o lead da lista do seguimento (`seguir` so olha qualificando e
qualificado). O lead parava de ser trabalhado por todo mundo ao mesmo tempo.
Custou o Levi Reis (lead 466): quente, CNPJ dado, pedido minimo aceito, querendo montar pedido —
e as 09:03 de 21/10 ele virou a tarefa 413 ("gerar e enviar o link, urgente") porque a Nina ainda
nao tinha como montar link nenhum. Ele estava "cobrando retorno ha dias".
Agora: a ferramenta se chama a mesma coisa (para nao quebrar conversa em curso) mas e o PEDIDO DE
ATENDIMENTO HUMANO, nao o fim da qualificacao. Ela abre a tarefa — que e a porta que o
nina-passar-monica exige — e deixa o lead em 'qualificado', entao a Nina continua com ele ate
alguem assumir de verdade. Quem nao pode ser o destino, nunca: representante.

v14 — A NINA MANDA O LINK DA PAGINA DE PEDIDO. Ordem do gestor em 20/10, ao
religar as campanhas do META: "nao passar para o representante e agora vamos testar o link com
todos que chegarem". Ate aqui o link so existia na mao (app/pedido/ponte.sh), montado por uma
pessoa, um lead por vez — e por isso so 11 lojistas tinham recebido. A ferramenta `link_pedido`
monta o endereco da cesta certa (regiao pela UF + ramo que a Nina escolhe pela conversa), grava
que o link saiu (link_em / link_seg / link_url / link_vezes) e devolve a URL ja com a marca
~L<id>, que e o que torna "abriu a pagina" atribuivel A PESSOA no pedido_visita.

Por que o RAMO vem da conversa e nao do CNAE: o CNAE e o que o contador escreveu na abertura da
empresa, e a propria ponte.sh ja dizia que "o que ele DISSE vence o CNAE quando discordam". A
Nina sabe o que ele acabou de contar que vende; o CNAE exigiria uma chamada externa que cai.

O que a ferramenta NAO faz: nao promete prazo, frete nem tabela. O desconto que ela pode citar e
o POR VOLUME, que esta impresso na propria pagina (10% a partir de R$ 5.000 — faixa unica)
— o desconto ligado ao CNPJ continua sendo do comercial, e a licao 319 continua valendo.

v13 — A INSTANCIA CAIU E ELA FALOU SOZINHA 200 VEZES. Em 02/10 o Zaptos da Nina
caiu as 08:02 e o copiloto continuou tocando de 5 em 5 minutos ate as 12:30: 200 envios recusados,
8 conversas, e no lead Martins 41 mensagens DIFERENTES escritas pelo modelo, uma por passada. O
lead recebeu UMA e depois silencio; as outras 40 ficaram no CRM sem sair — mas quem abrisse a
conversa veria a Nina monologando. Tres causas, todas corrigidas aqui:
  1. O contador de toques so avancava DEPOIS do envio dar certo (`if (!env?.ok) continue` antes do
     update). Com a instancia morta ele ficava em 0 para sempre, entao "esta na hora de tocar?"
     dava sim em TODA passada. O teto de 2 toques nunca chegava a valer.
  2. Nada parava a instancia. O `pausada_em` e escrito por quem passa pela FILA (fila-processar,
     fila-acao, copiloto-repasse, copiloto-feedback); a resposta ao lead chama o campanhas-enviar
     direto e nunca encostava nessa coluna. O caminho que a Nina mais usa era o unico sem trava.
  3. O `pausada_em` tambem nao era LIDO aqui: o campanhas-enviar filtra por `ativa`, nao por pausa.
Agora: a primeira queda pausa a instancia e ABORTA a rodada; a rodada seguinte nem comeca; e um
envio recusado por qualquer motivo poe o lead de molho por `lead_erro_espera_min` antes de tentar
de novo. O aviso ao gestor nao mora aqui — e do vigia-instancia, que cobre TODAS as instancias.
copiloto-lead (v12) — O LEAD DO GOOGLE SE IDENTIFICA SOZINHO. A landing "Acelera Nitron" (a
campanha de Search) nao grava NADA: nao cria contato, nao escreve `source` no contato e nao manda
gclid nem UTM. O formulario monta um texto e abre o wa.me da Nina — entao o unico lugar onde
existe a prova de que o lead veio do Google e a PRIMEIRA MENSAGEM dele. Ate aqui, contar lead do
Google era varrer conversa a mao (25, 28 e 29/09), e o nome, o CNPJ e o e-mail que ele digitou
no formulario morriam no texto: a Nina pedia tudo de novo — o erro da Natalie, de novo. Agora a
assinatura da landing e reconhecida e vira origem='google-acelera' no registro, com o CNPJ e o
nome aproveitados. Nao muda nada para quem vem do META nem para quem chega sem assinatura.
copiloto-lead (v11) — NOME E SOBRENOME, confirmados com a pessoa, e gravados NO CRM. Ordem do
gestor em 22/09: o nome que a Nina usava vinha do perfil do WhatsApp — apelido, emoji ("🙂",
"😜"), versiculo ("Deus E Fiel") ou o nome da loja. O consultor recebia o lead sem saber com quem
ia falar. Agora ela pergunta o nome completo uma vez, cedo, e so grava como confirmado o que a
PESSOA escreveu (nomePlausivel: duas palavras, sem numero, sem emoji). Com o nome confirmado, o
contato do CRM e atualizado (firstName/lastName) — nao adianta a Nina saber e o CRM continuar
mostrando o apelido para quem for atender. E o nome confirmado nao e mais sobrescrito pelo do
perfil na rodada seguinte: era o mesmo vao que fazia o status voltar atras na v4.
copiloto-lead (v10) — O TELEFONE DO LEAD ERA GRAVADO DECAPITADO. d10() guardava os ultimos 10
digitos de um numero que vem do CRM com DDI, entao "+5511982408982" virava "1982408982": o 55 saiu
levando junto o primeiro digito do DDD, e o nono digito do celular tomou o lugar dele. O numero
gravado vira de outra praca — as vezes um numero que EXISTE, de um desconhecido. Cinco dos oito
leads repassados foram entregues a representante com numero inexistente, e esses leads ficaram
esperando. Agora grava o nacional inteiro (foneNac) e a busca aceita as duas formas, para os
registros antigos de 10 digitos nao virarem lead duplicado.
copiloto-lead (v9) — NUMERO DE CASA nunca e lead. O resumo do encerramento passou a sair pelo
Zaptos da Nina para o gestor, e o contato dele no CRM tem `source` preenchido ("Form 38"): sem
trava, a resposta dele entraria pela porta da frente e a Nina tentaria qualificar o proprio
gestor. Os numeros vem de copiloto_responsaveis.fone, ao lado da trava que ja existia para
representante.
copiloto-lead (v8) — o seguimento tambem pega a conversa cuja ultima mensagem e do lead mas e
ROBO DELE (autoresposta da propria loja). A Natalie caiu nesse vao: o inbound pulava por ruido e
o seguimento pulava por "ele respondeu", e ninguem falava com ela.
copiloto-lead (v7) — SEGUNDO TOQUE. Ate aqui a Nina so falava quando o lead falava: quem nao
respondia a primeira mensagem morria ali, e "aquecer" nao existia. Agora, passados
lead_seguir_min (180) minutos sem resposta, ela da um toque leve — de outro angulo, no maximo
lead_toques_max (2) vezes, so em horario comercial de SP (lead_toque_horario) — e quem nao
responde nem assim fica 'frio', sem virar trabalho pro comercial. No canal oficial ha uma
ultima chance: se a janela de 24h da Meta vai fechar dentro de lead_janela_aviso_min (90) e o
lead nunca foi tocado, o toque sai na hora, porque depois so template passa.
?acao=inbound|seguir|tudo (padrao tudo) separa as duas passadas.
copiloto-lead (v6) — filtro de ruido pega tambem a autoresposta no plural ("nao estamos disponiveis", "responderemos assim que possivel", "agradecemos sua mensagem"): a loja do proprio lead tem robo, e a Nina quase respondeu ao dele. Padrao extra passa a vir de copiloto_config.lead_ruido_extra, sem deploy.
copiloto-lead (v5) — v4 desfazia o proprio trabalho: o upsert de depois do envio reescrevia o status com o valor lido ANTES das ferramentas rodarem, e um lead descartado (ou passado pro comercial) voltava a "qualificando". O patch de depois do envio nao toca mais em status.
copiloto-lead (v4) — a Nina atende o LEAD DE CAMPANHA, qualifica e passa pro comercial fechar.

v4: DOIS CANAIS e origem lida do CRM. Os leads da landing "Atacado Nitron PRO" nao chegam pelo
    Zaptos: chegam pelo WhatsApp NATIVO do GHL (numero oficial da conta, type 19), sem marcador
    de instancia — a v3 os ignorava. Responder pelo Zaptos faria o lead receber mensagem de um
    numero estranho e partiria a conversa em duas, entao o envio agora sai pelo MESMO canal em
    que ele escreveu. Vem com tres consequencias praticas:
      - JANELA DE 24h DA META: no canal nativo, passadas ~24h da mensagem do lead, texto livre e
        recusado. A Nina nao gasta a tentativa: abre tarefa p/ o comercial (template ou ligacao).
      - ORIGEM: o `source` do contato (escrito pelo formulario da landing) diz de que campanha
        ele veio, e vale como sinal de lead tanto quanto a tag "ads". Quando a origem nao e o
        anuncio conhecido, o prompt PROIBE a Nina de adivinhar oferta ou valor anunciado.
      - CNPJ QUE ELE JA DEU: o formulario grava o CNPJ no contato. A Nina nao pede de novo (a
        sugestao automatica do CRM pedia, e o lead ja havia informado), e o codigo confere se
        esse CNPJ ja tem cadastro antes de tratar como lead novo.

v3: o sinal de que a conversa e de anuncio passou a ser a TAG do CRM ("ads"), com o regex da
    primeira frase apenas como rede: o texto que o META pre-enche no clique muda no gerenciador
    a qualquer momento, a tag nao.
v2: a v1 cortava a lista em `limite` ANTES de filtrar a instancia. Num dia normal de operacao as
    conversas de representante enchiam a fila e o lead do anuncio nunca era olhado (as 20
    primeiras eram todas de outra instancia ou ja respondidas). Agora filtra pela instancia —
    que a propria busca devolve no rodape da ultima mensagem — e so depois corta.

POR QUE ESTA FUNCAO EXISTE, e nao um caminho novo dentro do copiloto-conversa: o cerebro do
copiloto atende quem TEM cadastro — representante (carteira, meta, pedidos) ou cliente (codparc,
tabela de preco, boleto, entrega). O lead do anuncio nao tem nada disso: nao ha codparc, entao
preco/boleto/entrega nao existem, e a conversa e outra (qualificar e aquecer, nao resolver). Ate
10/09/2026 esse lead nao tinha caminho nenhum: chegava na instancia da Nina, o copiloto-conversa
nao achava rep e devolvia "escalonar" sem responder. O primeiro lead do anuncio (10/09, 00:10 BRT)
ficou 12 horas sem resposta.

COMO ELA ACHA O LEAD: nao depende de webhook. Pergunta ao GHL quais conversas tem a ULTIMA
mensagem inbound (`lastMessageDirection=inbound` = ninguem respondeu ainda), fica so com as que
chegaram pela instancia de copiloto_config.lead_inst e filtra o resto. Assim um humano que pega a
conversa antes ganha: com uma resposta dele, a conversa sai da lista sozinha.

O HISTORICO E O DO GHL, nao um espelho nosso: ela le a conversa como ela esta, inclusive o que
pessoa de verdade escreveu no meio. Espelho proprio ja mostrou divergir do CRM.

GATES (copiloto_config, nao constante no codigo): lead_ativo ('nao' = monta e nao manda),
lead_inst ('Nina'), pedido_minimo (2500), lead_espera_min (2 = da tempo de um humano pegar
primeiro), lead_ate_horas (48). ?dry=1 monta a resposta sem mandar e sem gravar nada.

---

## v18 e v17 (movidas do cabecalho em 27/10, quando a v20 entrou)

O cabecalho do `index.ts` so cabe as versoes recentes — publicar a funcao exige passar o arquivo
inteiro numa chamada, e ele ja estava no limite. A regra do arquivo e a mesma de 26/10: o historico
vem para ca, inteiro, sem corte.

```
// v18 — O LINK SO SAI COM CNPJ E ENDERECO, E A MARGEM ERA DE 1% A MENOS.
// Ordem do gestor em 26/10, duas coisas no mesmo dia.
//
// 1) A CONTA DA MARGEM ESTAVA ERRADA, e foi ele quem pegou: "se eu colocar 10% em um produto de
//    100, vai dar 110. Mas se eu tirar 10% do produto de 110 o produto vai ficar 99". Exato —
//    x1,10 seguido de -10% devolve 99, nao 100. Cada item estava saindo 1% ABAIXO da 194 quando o
//    desconto entrava. O certo e dividir por 0,90 (+11,11%): 100 -> 111,11 -> 100,00. A pagina ja
//    foi corrigida e republicada; conferido nos 1.104 produtos, todos voltam ao centavo.
//
// 2) O LINK DEIXA DE SAIR SEM CNPJ E SEM ENDERECO. Ate ontem o prompt mandava o CONTRARIO —
//    "mande o link, nao espere ele pedir e nao espere o CNPJ" (ordem de 20/10) — e a Nina obedeceu
//    a risca: o Luis Carlos (lead 529) pediu "catalogo com os precos", recebeu o link, abriu e
//    mandou um pedido de R$ 10.168,99 em 10 segundos; o CNPJ dele so chegou 6 minutos DEPOIS.
//    Agora sao dois dados obrigatorios, e cada um resolve uma coisa diferente:
//      - CNPJ -> o CNAE escolhe o MIX (que lista de produtos abre)
//      - ENDERECO -> a praca escolhe o PRECO (existem tabelas CIF por regiao no Sankhya: 168
//        Nordeste, 172 Sul, 30 ES, 32 MG, 98 Nordeste especial)
//    A trava mora na FERRAMENTA, nao no prompt: link_pedido recusa e devolve o que falta pedir.
//    Texto no prompt o modelo pondera; recusa da ferramenta ele nao contorna — e a licao de 22/10
//    ("licao nao vence instrucao concreta do prompt") aplicada ao contrario, a favor.
//    Afrouxar nao exige deploy: copiloto_config.link_exige_cnpj / link_exige_endereco = 'nao'.
//
// 3) PAGAMENTO: a Nina passa a perguntar como ele pretende pagar e a dizer o que existe na
//    PRIMEIRA COMPRA — a vista ou 6x no cartao sem juros. Nada alem disso.
//
// Colunas novas em copiloto_lead: endereco, cep, pagamento.
//
// v17 — O DESCONTO VIROU UMA FAIXA SO. Ordem do gestor em 23/10, junto com a
// virada de preco da pagina (os valores sairam da tabela padrao e passaram a sair da TABELA GESTOR
// do Sankhya, CODTAB 194, com +10%): "quando o cliente pedir no minimo os 5 mil vai poder ter o
// desconto de 10% tambem, nao vai ter mais desconto quando pedir acima disso".
// A faixa de 15% acima de R$ 15.000 deixou de existir na pagina (discountRate do order_app.html).
// Aqui ela aparecia em TRES lugares — o cabecalho, o DESCONTO_PAGINA que a ferramenta link_pedido
// devolve, e o contorno do toque de seguimento. Deixar qualquer um deles para tras faria a Nina
// prometer de boca um numero que a tela nao faz: e a doenca de 16/09, em escala menor.
// As licoes 326, 335 e 347 foram corrigidas junto, e a 357 e nova (o lojista que volta com um
// print do preco antigo).
//
```

---

## v19 (movida do cabecalho em 27/10, no mesmo dia em que entrou)

```
// v19 — O FRETE CIF ENTRA NO PRECO DA PAGINA, E QUEM DIZ A PRACA E O CEP.
// Fecha a ordem do gestor de 26/10: "tinha que mostrar ja no valor final".
//
// A pagina ja sabia fazer isso desde 26/10: a marca ~F<perc> no link multiplica o preco de CADA
// item uma vez so, no carregamento, e por isso tela, PDF, texto do WhatsApp, pedido gravado e
// planilha anexa dizem o mesmo numero. So que NINGUEM punha a marca no link — a Nina mandava
// `#Sudeste-R01~L562` e o lojista via o preco SEM frete, que nao e o que a gente fatura. A ordem
// estava meio cumprida: a metade que aparecia na tela do gestor funcionava, a metade que chega ao
// cliente nao existia.
//
// COMO A PRACA VIRA PERCENTUAL (freteCIF): CEP -> ViaCEP -> COD_IBGE -> pedido_frete_cidade, que
// tem as 5.569 cidades, cada uma ja com o perc_cif da regiao. A CHAVE E O IBGE, nunca o nome: a
// base do Sankhya tem "Guarulhoss" sem IBGE e nomes com e sem acento, e casar por nome erra calado
// — e erra no preco. O nome da cidade e so a segunda opcao, e vale apenas quando devolve UMA linha
// na UF; duas linhas e ambiguidade, e ambiguidade nao vira preco.
//
// SEM PRACA RESOLVIDA, O LINK NAO SAI (link_exige_frete='sim'). Pedir o CEP custa uma mensagem;
// mandar um preco que a gente nao cumpre custa o pedido e a confianca — e o erro so aparece no
// faturamento, quando ja e tarde. Afrouxar e UPDATE, sem deploy.
//
// perc 0 nao leva marca: SP capital, metropolitano, litoral, Campinas, ABC, Sorocaba e S.J. Campos
// sao 0%, e a pagina ja trata F0 como "sem frete".
//
// O QUE A NINA PODE DIZER: que o preco da tela ja e o final para a cidade dele, com entrega.
// O QUE ELA NAO DIZ NUNCA: o percentual, quanto do preco e frete, ou prazo de entrega. E a mesma
// regra do CNPJ e do preco — ela REFLETE o que o sistema calculou, nao abre a conta.
//
// De brinde, o ViaCEP devolve cidade e UF: quando o lead nao as tinha ditas, sao gravadas. O
// repasse precisa da praca para sortear o representante, e ate aqui ela so existia se o lead
// tivesse escrito a cidade com todas as letras.
//
```
