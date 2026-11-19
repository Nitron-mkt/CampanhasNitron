# Os tipos de cliente no fluxo do Força — o que acontece com cada um

Levantado em 19/11/2026 a pedido do gestor, depois de validar nove CNPJs reais contra a API em
modo `"teste": true` (nada foi gravado) e de ler o que o código faz com cada resposta.

Duas fontes, e vale saber qual é qual:
- **o veredito da API** foi medido, CNPJ a CNPJ;
- **o que acontece depois** foi lido no código das funções (`forca-cadastro`, `forca-avisar`,
  `forca-cutucar`, `camp-pipeline`, `copiloto-lead`), não suposto.

---

## O caminho completo, quando dá certo

```
lojista manda CNPJ + CEP + e-mail numa frase só
   ↓  a Nina chama `link_pedido`, que NÃO devolve link: marca `forca_pedir_em`
   ↓  e manda ela dizer "já estou montando o MIX da sua loja"
cron `forca-cadastro-5min`  →  POST /orcamento  →  protocolo gravado ANTES de tudo
   ↓  GET no protocolo (cada consulta empurra o processamento do outro lado)
PEDIDO no ERP: número + link + validade de 7 dias
   ↓  `forca_link_em` gravado ANTES do envio (lição do `toques`)
link entregue por Zaptos, pela instância da Nina, com o pedido mínimo de R$ 3.500,
os 10% acima de R$ 5.000 e a validade — texto escrito em CÓDIGO, não pelo modelo
   ↓  pipeline: Lead Novo → Dados completos → Pedido aberto → Link entregue
45 min sem resposta  →  `forca-cutucar` pergunta UMA vez se conseguiu abrir
```

Do link em diante **o CRM não acompanha** (seção 7 do contrato): o lojista monta na tela do Força
e envia, e a Nitron segue daí. As etapas *Montando / Enviado / Faturado* do pipeline continuam sem
sinal — embora o GET do protocolo agora devolva `situacao`, o que as destravaria.

---

## Os nove tipos

### ✅ 1. Lead novo — CNPJ ativo na Receita, nunca comprou

**Testado:** SOFORT-KAUFEN (Rio de Janeiro/RJ), CNPJ 33254242000160 — o lead 692 da Nina.
**A API diz:** `passaria: true` · `cliente.novo: true` · `codparc: 0` · `cadastro: "cria"` ·
catálogo de 619 produtos.
**De verdade aconteceria:** cria o cadastro (Receita + SEFAZ), abre o orçamento, devolve pedido e
link. O caminho completo acima, do começo ao fim. É o caso para o qual o fluxo foi feito.

### ✅ 2. Cliente inativo há mais de 180 dias — e **com representante no cadastro**

**Testado:** DMX ATACADISTA (João Pessoa/PB), 338 dias sem comprar, representante WALDEMAR.
**A API diz:** `passaria: true` · `cadastro: "aproveita"` — e devolve o vendedor como
**informação**, não como recusa.
**De verdade aconteceria:** aproveita o cadastro que já existe, abre o pedido e entrega o link.
O lojista compra direto.

> **Decisão de negócio, para o gestor.** A trava não é "tem representante" — é "comprou nos
> últimos 180 dias". Todo cliente parado há mais de 180 dias vira público do canal direto, ainda
> que o representante continue dono dele no cadastro. E **o representante não é avisado de nada**:
> não há código que faça isso. Pode ser exatamente o desejado (reativar quem o rep não visita), ou
> não.

### ✅ 3. Cliente inativo em **tabela de preço especial**

**Testados:** TRES RIOS CASA & MODAS (RJ) e MINI PRECO (MG), os dois na PV0004 ESPECIAL RED
(CODTAB 13), parados há 211 e 212 dias.
**A API diz:** os dois `passaria: true` · `cadastro: "aproveita"`. **A tabela do cadastro não entra
na decisão.**
**De verdade aconteceria:** igual ao tipo 2 — só que o preço não é o da tabela dele. Medido em 387
pedidos reais do canal Acelera desde 01/09: o canal troca a tabela do cadastro pela Gestor, e o
critério é **RED × não-RED**, sem exceção.

| tabela gravada | cadastros que caem nela |
|---|---|
| **194** GESTOR VAREJO | 0 padrão · 150 padrão SP · 102 FOB Nordeste · 153 e 155 Clube · 200 Amazon |
| **195** GESTOR RED 194 | 13 ESPECIAL RED · 83 RED 102 Nordeste · 151 CANINDE RED · 159 e 165 Clube RED |

O par que fecha a regra: **102 → 194**, mas **83 (a versão RED da 102) → 195**. Mesma praça; o que
muda é o RED. A 195 é exatamente metade da 194 em valor absoluto — provavelmente construção
fiscal, **mas isso é pergunta para o fiscal, não afirmação minha**.

### ⛔ 4. Cliente ativo (comprou nos últimos 180 dias), com representante

**Testado:** CASA TOP MIX (São Paulo/SP), 59 dias, representante ADÃO.
**A API diz:** `CLIENTE_COM_REPRESENTANTE` · `resolve: "encerrado"` · detalhe *"Comprou nos últimos
180 dias com outro vendedor"* — **com o vendedor identificado**: código, razão social, e-mail e
telefone.
**De verdade aconteceria:** nenhum cadastro, nenhum pedido, nenhum link. A trava funciona.
**E então, hoje, não acontece mais nada** — ver o buraco abaixo.

### ⛔ 5. Cliente de Clube **que comprou há pouco**

**Testado:** MUNDO DAS MENINAS (São Paulo/SP), CODTAB 153, 59 dias.
**A API diz:** `CLIENTE_COM_REPRESENTANTE` — **não** `CLIENTE_CLUBE`.
**Por quê:** a regra dos 180 dias é avaliada **antes** da do Clube, e encerra o caso. Eu previ
CLUBE pela CODTAB e errei; o teste é que mostrou a ordem.

### ⛔ 6. Cliente de Clube **parado há mais de 180 dias**

**Testado:** ARMARINHO MARIA VITORIA (Belo Horizonte/MG), CODTAB 153, 231 dias, rep DIVINO.
**A API diz:** `CLIENTE_CLUBE` · `resolve: "encerrado"` · detalhe *"Tem Clube Nitron ativo"* ·
com o vendedor identificado.
**De verdade aconteceria:** nada é aberto. O Clube protege mesmo o cliente parado — e é por isso
que ele precisa ser testado separado do tipo 5.

### ⚠️ 7. MEI / firma individual sem Inscrição Estadual

**Testado:** ROSELI VERGANI RITTER (Chapecó/SC), CNPJ 64738629000116 — um dos quatro que travaram
de verdade em 17/11.
**A API diz, em modo teste:** `passaria: true`.
**De verdade acontece:** `ERRO_ERP: Insc. Estadual, deve ser informada` — e o pedido **não** abre.

> **O modo teste não pega esse erro.** É a ressalva que o próprio contrato escreve ("o teste não
> garante a última milha"), agora medida num caso de resposta conhecida. **Não dá para usar o modo
> teste para pré-filtrar MEI**, que é justamente o grupo que trava. Hoje são 4 leads parados aí.
>
> Este é o único caso de recusa que **tem resposta**: a `forca-avisar` escreve ao lojista
> perguntando pela IE (sem acusar — dos quatro, três eram empresa de serviço, que legitimamente não
> tem IE) e avisa o gestor e a Camyla, com o CNPJ em linha própria.

### ⛔ 8. Lead sem e-mail

**Visto de verdade:** 3 dos 29 de 17/11. A API exige e-mail e nem chega a ser chamada.
**O que o sistema faz:** procura em três lugares — a linha do lead, o contato do CRM e a
**conversa** (só mensagem recebida). Não achando, grava `forca_erro: "sem e-mail"` e para.
**O lojista ouve:** nada. Mesmo buraco do tipo 4.

### ⛔ 9. Lead sem CNPJ ou sem CEP

A Nina nem chega a acionar a ferramenta: ela recusa e manda pedir os três dados **numa frase só**
(`link_exige_cnpj`, `link_exige_email`, `link_exige_frete`). A recusa mora na ferramenta, não no
prompt — texto no prompt o modelo pondera, recusa de ferramenta ele não contorna.

---

## O buraco: cliente da casa recusado fica em SILÊNCIO

Vale para os tipos **4, 5, 6 e 8** — e é o achado mais importante deste levantamento.

Quando a API recusa por representante ou Clube:

| quem deveria saber | o que acontece hoje |
|---|---|
| o lojista | **nada.** A `forca-avisar` só trata Inscrição Estadual (`RE_IE`) |
| o representante dono | **nada.** A API devolve nome, e-mail e telefone dele, e nenhum código usa |
| o comercial | **nada.** A `forca-cadastro` pula abrir tarefa para essas duas recusas (`RECUSA_ESPERADA`) |
| o gestor | **nada.** O aviso interno vive dentro da `forca-avisar`, que também é só IE |
| o pipeline | **só isto:** o card anda para "Representante ou Clube", uma vez por hora |

**E a Nina não fica sabendo.** O `copiloto-lead` apenas *escreve* `forca_pedir_em`; ele nunca lê
`forca_erro`, `forca_pedido` nem `forca_link_em`. A lição 443 já diz o que ela deve falar quando o
lojista é cliente da casa — *"ele já tem um atendimento dedicado, vou passar seu contato para a
pessoa certa"* — mas **nada a informa de que foi isso que aconteceu**. Ela disse que ia montar o
mix, e o mix nunca chega.

É exatamente a mesma forma do buraco da Inscrição Estadual que o gestor mandou tapar em 18/11, e
atinge o grupo mais comum: nos testes com cliente antigo, **4 de 4** caíram nessas duas recusas.

**Conserto, quando o gestor mandar:** a `forca-avisar` já tem a estrutura inteira — varredura,
janela, corte por data, aviso ao lojista e espelho ao gestor. Falta estender o filtro para as duas
recusas e escrever o texto da lição 443, aproveitando o `vendedor` que a API agora devolve para
dizer **quem** vai falar com ele.

---

## Resumo de uma linha por tipo

| # | tipo | abre pedido? | o lojista é respondido? |
|---|---|---|---|
| 1 | lead novo | **sim** | sim — recebe o link |
| 2 | inativo >180d, com rep | **sim** | sim — recebe o link |
| 3 | inativo >180d, tabela especial | **sim** | sim — mas no preço da tabela Gestor, não na dele |
| 4 | ativo <180d, com rep | não | **não — silêncio** |
| 5 | Clube com compra recente | não | **não — silêncio** |
| 6 | Clube parado >180d | não | **não — silêncio** |
| 7 | MEI sem Inscrição Estadual | não | **sim** — a `forca-avisar` pergunta pela IE |
| 8 | sem e-mail | não | **não — silêncio** |
| 9 | sem CNPJ ou CEP | nem tenta | sim — a Nina pede os três numa frase |
