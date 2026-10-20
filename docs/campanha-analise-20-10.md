# Por que os leads nao viram venda — analise de 20/10/2026

Continuacao do `campanha-resultado-10-09-a-20-10.md`. Tres perguntas do gestor: da para ligar lead
e venda por telefone/e-mail/nome? Passar para representante e eficiente? Por que a venda interna
nao fechou?

## 1. As outras pontes entre lead e venda

| ponte | da para usar? | por que |
|---|---|---|
| CNPJ | **sim** | foi o que achou a unica venda |
| e-mail | **nao existe** | `copiloto_lead` **nao tem coluna de e-mail**, e nenhuma das 11 views do Sankhya expoe e-mail |
| telefone | **nao chega la** | as views do Sankhya nao tem telefone. A ponte no Supabase (`contato_enriquecido.whatsapp`) esta vazia em 79% da base — e em **20 dos 21** clientes que importam. Zero casamentos |
| nome | **feito, deu zero** | ver abaixo |

### O cruzamento por nome, e o ruido que precisou ser tirado antes

Primeira tentativa: **4.948 clientes novos compraram** no periodo. Numero absurdo para uma fabrica.
Abrindo por vendedor: **4.900 sao E-COMMERCE MRKT** — marketplace, ticket medio **R$ 28**. Nao e o
nosso funil B2B, e cada pedido de consumidor abre um cadastro (dai os 3.000 a 5.000 cadastros novos
por mes no Sankhya).

Tirando isso sobram **48 compradores B2B novos** no periodo — conjunto do tamanho certo. Cruzei os
48 contra os 465 leads por trigrama de nome (`similarity`) mais cidade/UF.

**Resultado: nenhum.** O unico casamento perfeito (1.00) foi **"Ponto do Real"**, e nao e o mesmo:

| | lead 143 | quem comprou |
|---|---|---|
| CNPJ | 64.721.723/0001-55 | 63.857.176/0001-84 |
| cidade | Candido Rodrigues/SP | Santa Isabel/SP |
| vendedor | repassado a HERMES | LUCIANA MITIE |

Ha **6 empresas chamadas "Ponto do Real"** no cadastro, e a que comprou e cliente da LUCIANA desde
2019 — ela ja tinha outra loja do mesmo dono cadastrada. Todo o resto do cruzamento foi ruido:
"Utilidades" e "Variedades" casam com quase tudo.

**Entao 1 venda atribuida continua sendo 1.**

### Mas existe uma ponte pronta que ninguem esta usando

Os contatos no CRM estao **renomeados com o codparc**: `Victor 222988 Hugo`, `THIBINI 224146
Manfio`. Quem cadastra escreve o codigo do Sankhya dentro do nome do contato. **Isso e uma chave de
atribuicao completa, gravada a mao, que hoje nao e lida por nada.** Varrer os contatos atras de
`\b\d{6}\b` no nome liga lead a cliente sem depender de CNPJ — e resolveria tambem os 62% de leads
que nunca informaram CNPJ.

## 2. Passar para o representante e eficiente?

| caminho | leads | cadastros no Sankhya | orcamentos | vendas |
|---|---|---|---|---|
| representante (`fisica`) | 87 | 0 rastreaveis | 0 visiveis | **0** |
| venda interna (`online`) | 60 | 8 | 2 (ambos abandonados) | **1** |

**0 contra 1 nao prova nada sozinho** — e um numero pequeno demais. O que prova e o resto:

- **18 dos 43 clientes que responderam disseram que ninguem falou com eles** (42%).
- A conversa do representante acontece no **WhatsApp pessoal dele**, fora do CRM. Nao da para ver
  se ligou, se cotou, se perdeu. **Nao e que o canal seja pior: e que ele e cego.** O que nao se ve
  nao se corrige.
- No caminho interno da para ver tudo — e foi vendo que achei os buracos abaixo.

## 3. Por que a venda interna nao fechou — li as conversas

### O padrao: o lead diz "vou analisar e retorno", e ninguem retorna

**Lead 62 — A M COMERCIO (Max), e-commerce, SP.** A conversa inteira:

| quando | o que |
|---|---|
| 17/09 17h49 | lead chega, Nina qualifica: e-commerce, CNPJ, compra de fabrica, quer a linha |
| 17/09 18h45 | Nina: "o contato com voce sai ainda hoje" |
| **18/09 16h01** | Valeria: "Oi Max boa tarde, Valeria da Nitron td bem?" — **sem resposta** |
| **21/09 12h30** | **o CLIENTE volta**: "Desculpe nao ter respondido na sexta, estava viajando a trabalho" |
| 21/09 | pede catalogo **com precos**; Valeria manda o PDF |
| 21/09 | cliente pergunta **"como funciona a compra com voces?"**, **"algum desconto"**, **"valor minimo?"** |
| 21/09 | Valeria responde com **DOIS AUDIOS** (.mp3) |
| 21/09 15h42 | cliente: "Ta ok Valeria" / **"Vou analisar o seu catalogo e retorno"** |
| 21/09 16h08 | Valeria: "Tbm Max" |
| — | **fim. 29 dias de silencio.** |

**Lead 375 — Zavora (Deicon Pacheco), SBC/SP.** Ultima mensagem da conversa, ~06/10, **do cliente**:
*"show, vou da uma analisada nos produtos daqui a pouco"*. **14 dias, nenhum retorno.**

Nos dois casos o lead estava comprando: perguntou preco, minimo e desconto. A conversa morreu do
nosso lado.

### Quando ha follow-up, e um toque so e para

- **Kaya Variedades (lead 320)**, ~08/10, Monica: *"Passando para saber se voce ja conseguiu dar uma
  olhadinha no nosso catalogo..."* — sem resposta, sem segunda tentativa.
- **Sao Paulo Trindade (lead 421)**, ~15/10, Monica: *"Te enviei nosso catalogo... me diga quais
  itens..."* — sem resposta, sem segunda tentativa.

### Quando chega a orcamento, o orcamento expira

- **Pro Forte / THIBINI (lead 308)**, cadastrada no Sankhya como codparc 224146. Ultima mensagem,
  ~14/10, da Monica: *"Como nao tive retorno referente ao orcamento solicitado, informo que o
  orcamento sera excluido do sistema, pois os nossos orcamentos possuem validade de 3 dias"*.
  Oportunidade no CRM: **abandoned**.
- **Victor Hugo (lead 83)**, codparc 222988. Oportunidade na etapa **Orcamento**, status
  **abandoned** desde 14/10.

**Validade de 3 dias em lead frio de campanha e perda autoinfligida.** Lojista pequeno nao decide
R$ 2.500 em tres dias.

### O contexto que explica: duas pessoas, 1.114 conversas

| | conversas atribuidas | com o CLIENTE falando por ultimo |
|---|---|---|
| Monica | 619 | 37 |
| Valeria | 495 | 18 |

Elas **nao estao ignorando mensagem** — so 55 de 1.114 estao esperando resposta. O problema nao e
desleixo, e **carga**: os 60 leads de campanha sao 5% do que elas carregam. Lead que disse "vou
analisar" nao tem como ser lembrado por memoria humana nessa escala. **Falta a maquina, nao o
esforco.**

## 4. Os leads da campanha sao bons?

**Sao reais, e sao pequenos.**

A favor:
- 38% informaram CNPJ. 32% qualificaram o bastante para repasse.
- Fazem pergunta de comprador: "como funciona a compra", "valor minimo", "algum desconto".
- 8 chegaram a ser cadastrados no Sankhya — ou seja, o interesse era de verdade.
- R$ 3,87 por lead e barato.

Contra:
- A audiencia pende forte para **e-commerce / Mercado Livre / Shopee** micro. Olhando os 60 da venda
  interna: "revenda Mercado Livre", "loja Shopee", "e-commerce de variedades", "loja virtual".
- A objecao recorrente e **o minimo de R$ 2.500**, dita com todas as letras:
  - lead 121 (Marisa, Artes e Presentes): *"Eu decidi esperar um pouquinho p fazer o pedido pq o
    minimo p mim e muito"*
  - lead 210 (Angelica, Imperatriz/MA): *"eu olhei o catalogo mas pessoalmente eu achei um pouco
    caro porque aqui na minha cidade tem gente que..."*
- 286 (61%) esfriaram sem dar CNPJ.

**Diagnostico:** o anuncio ("Video Dan Varejo") atrai o varejista pequeno. Ele e lead de verdade,
mas bate no minimo. **O problema nao esta na midia — esta entre o repasse e o fechamento.**

## 5. O que melhorar, em ordem de retorno

1. **Cadencia de follow-up para a venda interna.** O maior vazamento, e o mais mecanico: lead que
   disse "vou analisar" e ninguem voltou. D+2 / D+5 / D+10, no CRM. A maquina ja existe
   (`copiloto-feedback`); falta apontar para ca.
2. **Medir a venda interna.** Hoje `feedback_tipos='fisica'` exclui exatamente o canal que vende.
   Melhor que feedback: um **alerta de "a bola esta com a gente"** — conversa em que o cliente falou
   por ultimo ha mais de 24h. Sao 55 agora.
3. **Nunca responder preco, minimo ou desconto em AUDIO.** O unico lead que recebeu essas tres
   respostas por audio sumiu. Audio nao se encaminha para o socio, nao se relê, nao se busca.
4. **Rever a validade de 3 dias do orcamento** para lead de campanha. Esta apagando orcamento de
   gente que ainda esta decidindo.
5. **Usar a pagina de pedido como instrumento da venda interna**, nao so dos 29. Ela responde "como
   funciona", "minimo" e "preco" por escrito, num lugar so — e agora registra quem abriu.
6. **Colher o codparc do nome do contato.** A atribuicao ja esta escrita la dentro, de graca.
7. **Minimo de R$ 2.500 para lead de campanha**: 2 das objecoes registradas sao sobre ele. Decisao
   de negocio, nao minha — mas e o que esta dito nas conversas.
8. **Religar o Meta depois de 1 e 2, nao antes.** R$ 3,87/lead e barato e o lead e bom. Religar com
   o funil do jeito que esta compra mais 465 leads para o mesmo resultado.
