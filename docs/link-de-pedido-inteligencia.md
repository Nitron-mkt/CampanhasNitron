# Como a Nitron decide o link de pedido que vai para o lojista

Documento para quem vai implementar algo equivalente noutro projeto. Descreve a máquina que
transforma **duas informações que o lojista digita no WhatsApp — CNPJ e CEP — num link de página de
pedido em que cada produto já aparece com o preço final da praça dele.**

Está escrito na ordem em que as coisas acontecem, e cada decisão traz o motivo. Onde há um número
ou uma regra que parece arbitrária, quase sempre ela veio de um erro que custou um lead — esses
casos estão marcados com **"por que"**, porque são o que não se adivinha lendo só o código.

Stack de referência: Supabase (Postgres + Edge Functions em Deno/TypeScript) + GoHighLevel como CRM
e canal de WhatsApp + um modelo de linguagem com *tool use*. Nada disso é essencial: o desenho
funciona com qualquer banco, qualquer canal e qualquer modelo que aceite ferramentas.

---

## 1. O problema que isso resolve

O lojista chega pelo anúncio e pede "o catálogo com os preços". Mandar um PDF de catálogo não
resolve, por dois motivos:

1. **O preço não é único.** Ele muda com o ramo do cliente (a cesta de produtos é outra) e com a
   praça (o frete CIF varia de 0% a 17% conforme a região).
2. **Catálogo sem preço não fecha venda.** O lojista olha, não vê valor, e vai embora.

A saída foi uma **página de pedido parametrizada por link**. O link carrega três coisas:

```
https://<host>/#Sudeste-R01~L562~F6.8
                 │         │     └── F<perc> = frete CIF da praça dele, em %
                 │         └──────── L<id>   = o id do lead, para o pedido chegar identificado
                 └────────────────── <Região>-<Ramo> = qual cesta de produtos mostrar
```

Montar esse link é todo o trabalho descrito aqui.

---

## 2. Visão geral do fluxo

```
lojista escreve no WhatsApp
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│ A. CAPTURA (código, não modelo)                             │
│    varre o que o lojista escreveu e grava CNPJ e CEP        │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│ B. ENRIQUECIMENTO (uma vez por lead)                        │
│    CNPJ → Receita (BrasilAPI) → CNAE → tabela → ramo R01..R10│
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│ C. O MODELO conversa e chama a ferramenta `link_pedido`     │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│ D. A FERRAMENTA decide, e pode RECUSAR                      │
│    1. falta CNPJ ou CEP?  → recusa e devolve o que pedir    │
│    2. CEP → ViaCEP → IBGE → tabela de frete → perc_cif      │
│    3. praça + ramo → escolhe a cesta                        │
│    4. monta a URL                                           │
└─────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│ E. A PÁGINA aplica o frete no preço de CADA item            │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Etapa A — capturar o dado, em código, não no modelo

**O problema.** O modelo tem uma ferramenta `salvar_lead` para anotar o que apurou. Mas ele esquece
de chamá-la. Num caso real a IA respondeu ao lojista *"Peguei seu CEP aí!"* e a coluna `cep` ficou
**vazia**. Como a trava do link lê a coluna, ela ia pedir o mesmo dado para sempre. O lojista
respondeu *"Meu Deus / pode deixa / obrigado"* e foi embora — depois de já ter entregado quatro
dados.

**A regra que saiu disso: o que o usuário escreveu vale mais do que a memória do modelo.** Antes de
montar o prompt, o código varre **todas as mensagens inbound da conversa** e extrai os dados por
regex. Se o campo ainda estiver vazio, grava.

```ts
const dele = msgs.filter(m => m.direction === "inbound").map(m => limpa(m.body)).join("\n");
const cepDito  = cepDoTexto(dele);
const cnpjDito = cnpjDoTexto(dele);

const auto: any = {};
if (cepDito  && !String(leadRow?.cep || "").trim())        auto.cep  = cepDito;
if (cnpjDito && digits(leadRow?.cnpj || "").length !== 14) auto.cnpj = cnpjDito;
if (Object.keys(auto).length) await upsertLead(sb, ctx, auto);
```

Os extratores são tolerantes de propósito — o lojista manda o CEP no meio do endereço, e o CNPJ com
ou sem pontuação:

```ts
// 01310-100, 01310100, "rua tal, 123 - 01310100"
function cepDoTexto(s: any): string {
  const m = /(\d{5})[-.\s]?(\d{3})(?!\d)/.exec(String(s || ""));
  return m ? m[1] + m[2] : "";
}

// 12.345.678/0001-99, 12345678000199, "cnpj 12 345 678 0001 99"
function cnpjDoTexto(s: any): string {
  const m = String(s || "").match(/(\d{2})[.\s]?(\d{3})[.\s]?(\d{3})[\/\s]?(\d{4})[-\s]?(\d{2})(?!\d)/);
  return m ? (m[1]+m[2]+m[3]+m[4]+m[5]) : "";
}
```

> **Princípio transferível:** todo dado que vira **trava** tem de ser extraído por código. Se a
> única forma de ele chegar ao banco é o modelo lembrar de chamar uma ferramenta, a trava vai
> disparar contra usuários que já responderam.

Note o `(?!\d)` nas duas regex: sem ele, um número maior é truncado e vira um CEP ou CNPJ falso.

---

## 4. Etapa B — o CNPJ decide o mix, via CNAE

### O que estava errado antes

Durante um mês o CNPJ era pedido e **jogado fora** para esse fim: servia só para checar se já havia
cadastro. A cesta de produtos saía do **palpite do modelo na conversa**.

O custo, medido em dois casos reais:

| loja | o que o modelo deduziu | CNAE real | ramo certo |
|---|---|---|---|
| Villa Nova | R01 (utilidades) | 4713-0/02 | **R02** — magazine |
| Cassio | R01, porque ele disse "variedades" | 4729-6/99 | **R04** — mercearia |

**Pedir um dado e não usar é o pior dos mundos: tem o custo da pergunta e nenhum benefício.**

### A cadeia

```
CNPJ (14 dígitos)
  → GET https://brasilapi.com.br/api/cnpj/v1/{cnpj}
  → campo `cnae_fiscal` (7 dígitos)
  → SELECT ramo_sigla FROM cnae_ramo WHERE cnae7 = <cnae>
  → R01..R10
```

`cnae_ramo` tem **258 linhas** e foi montada a partir da base real de clientes — não de uma
classificação teórica. Os ramos com cesta montada:

| ramo | o que é |
|---|---|
| R01 | casa de utilidades, variedades, bazar, 1,99, armarinho |
| R02 | loja de departamento, magazine |
| R03 | joalheria, bijuteria, presentes, festa |
| R04 | supermercado, mercearia, atacarejo |
| R05 | cama, mesa, banho, tecidos |
| R06 | vestuário, calçados, moda |
| R07 | papelaria, livraria |
| R08 | material de construção, ferragem |
| R09 | farmácia, perfumaria, cosméticos |
| R10 | esporte, brinquedo, lazer, pet |

### Os três retornos — e por que não podem ser dois

Esta é a parte mais fácil de errar. A API pública **limita chamada**: 25 CNPJs em sequência e os
últimos vieram **HTTP 429**.

Na primeira versão, qualquer falha gravava `cnae_em` (o carimbo de "já consultei"). Um 429 marcava
o lead como consultado **para sempre**, e a cesta dele voltava ao palpite — exatamente o defeito que
a versão tinha vindo consertar.

```ts
type Ramo = { ramo: string; cnae: string; desc: string; razao: string; cidade: string; uf: string };

async function ramoDoCnpj(sb, cnpj): Promise<Ramo | { fim: true } | null> {
  const d = digits(cnpj);
  if (d.length !== 14) return { fim: true };
  try {
    const r = await fetch("https://brasilapi.com.br/api/cnpj/v1/" + d,
                          { signal: AbortSignal.timeout(9000) });
    if (r.status === 404) return { fim: true };
    if (!r.ok) return null;            // 429 e 5xx são "pergunte de novo", não "não existe"
    const v = await r.json();
    const cnae = String(v?.cnae_fiscal || "").replace(/\D/g, "");
    if (!cnae) return { fim: true };
    const { data } = await sb.from("cnae_ramo").select("ramo_sigla").eq("cnae7", cnae).maybeSingle();
    const sig = String(data?.ramo_sigla || "").toUpperCase();
    return { ramo: TEM_CESTA.test(sig) ? sig : "", cnae, desc: v?.cnae_fiscal_descricao,
             razao: v?.razao_social, cidade: v?.municipio, uf: v?.uf };
  } catch { return null; }             // timeout, rede: idem
}
```

| retorno | significa | o que o chamador faz |
|---|---|---|
| objeto | a Receita respondeu | grava ramo + `cnae_em` |
| `{ fim: true }` | 404, ou sem CNAE | grava **só** `cnae_em` (encerra, não pergunta de novo) |
| `null` | 429 / 5xx / timeout | **não grava nada** — tenta na próxima passada |

> **Princípio transferível:** num enriquecimento por API externa, "falhou" e "não existe" são
> estados **diferentes**. Colapsar os dois num só faz o sistema desistir de dados que ele teria
> conseguido na segunda tentativa.

A consulta roda **uma vez por lead**, e só no lead que está sendo atendido naquela passada — por
isso não vira martelada na API pública, mesmo com um cron de 5 em 5 minutos.

### A praça do cadastro entra como rede, nunca por cima

A Receita também devolve município e UF. Eles são gravados **só se o lead ainda não tiver dito os
dele**:

```ts
cidade: String(leadRow?.cidade || "").trim() ? null : (rc.cidade || null),
uf:     String(leadRow?.uf     || "").trim() ? null : (rc.uf     || null),
```

**Por que:** quem vende online fatura num endereço e entrega noutro. Um lead real tinha CNPJ em
Quirinópolis/GO e mandou CEP de Uberlândia/MG. O endereço de entrega é o que manda no frete.

---

## 5. Etapa C — a ferramenta, e por que a trava não mora no prompt

O modelo recebe uma ferramenta `link_pedido`. A descrição dela **ensina a regra**, em vez de só
declarar parâmetros:

> *"PRECISA DE DOIS DADOS, E SÓ DOIS: o CNPJ e o CEP. O CNPJ escolhe o MIX — o sistema consulta o
> CNAE dele na Receita e monta a cesta do ramo certo, então você NÃO precisa adivinhar o ramo. O CEP
> escolhe o PREÇO: o frete CIF da praça dele entra no preço de CADA item da página. NÃO precisa de
> rua, número nem bairro. Se faltar o CNPJ ou o CEP, ela recusa e te diz o que pedir; com os dois,
> chame e mande o link na sequência, sem mais perguntas."*

O parâmetro `ramo` existe, mas é **palpite de reserva**: só é usado se a Receita não resolver.

### A decisão de arquitetura que mais importa neste documento

**A trava mora na ferramenta, não no prompt.**

Houve uma fase em que a instrução era "mande o link — não espere o CNPJ", e o modelo obedeceu à
risca: um lojista pediu o catálogo, recebeu o link, abriu e mandou um pedido de R$ 10.168,99 em
10 segundos — o CNPJ dele chegou **6 minutos depois**. Quando a ordem inverteu, pôr "agora espere o
CNPJ" no prompt não bastaria.

> **Texto no prompt o modelo pondera. Recusa de ferramenta ele não contorna.**

A ferramenta recusa e devolve um objeto que diz **o que fazer**, não só o que falta:

```ts
const falta: string[] = [];
if (ctx.exigeCnpj && String(L?.cnpj || "").replace(/\D/g,"").length < 14)
  falta.push("o CNPJ da loja (14 digitos)");
if (ctx.exigeEndereco && !String(L?.cep || "").trim() && !String(L?.endereco || "").trim())
  falta.push("o CEP de entrega da loja");

if (falta.length) return {
  ok: false, link_nao_enviado: true, falta,
  o_que_fazer: "NAO mande link agora. Peca " + falta.join(" e ") + " NA MESMA MENSAGEM, "
    + "em uma frase leve, dizendo para que serve cada um: o CNPJ e para o sistema ver o tipo da "
    + "empresa e montar a lista certa de produtos; o CEP e para saber para onde vai a mercadoria "
    + "e ja mostrar o preco com a entrega inclusa. NAO peca rua, numero nem bairro — o CEP basta. "
    + "Assim que ele responder, chame esta ferramenta de novo e MANDE o link, sem mais nenhuma pergunta.",
  ja_tenho: { cnpj: !!String(L?.cnpj||"").trim(), cep: !!String(L?.cep||"").trim() },
};
```

Repare em três coisas:

1. **Os dois dados são pedidos JUNTOS, numa mensagem só.** Pedir um, esperar, pedir o outro é a
   "volta" que faz o lojista desistir.
2. **O CEP basta — rua, número e bairro não são pedidos.** O CEP já traz tudo isso. Foi essa volta
   que fez o Cassio ir embora depois de já ter dado quatro dados.
3. **A recusa explica para que serve cada dado.** O lojista entrega mais fácil quando sabe o porquê.

### Toda trava tem uma chave de configuração

```
link_exige_cnpj      = sim | nao
link_exige_endereco  = sim | nao
link_exige_frete     = sim | nao
```

Ficam numa tabela chave/valor lida a cada execução. Afrouxar é um `UPDATE`, **sem deploy** — porque
publicar código mexe numa IA que está atendendo gente naquele momento.

### O custo da trava, medido antes de ligar

| regra | leads que receberam link |
|---|---|
| sem trava | 49% |
| exigindo CNPJ + endereço completo | 40% |
| exigindo CNPJ + **CEP** | **22%** |

E dos leads sem link, **28 de 33 estavam travados no CNPJ**.

Esses números não foram motivo para não ligar a trava — foram motivo para **saber o preço da
decisão**. Link sem CNPJ é mix errado; link sem CEP é preço que a empresa não cumpre, e o erro só
aparece no faturamento. Mas quem liga uma trava dessas sem medir não sabe o que está trocando.

---

## 6. Etapa D — do CEP ao percentual de frete

### A chave é o código IBGE, nunca o nome da cidade

```
CEP → ViaCEP → campo `ibge` → SELECT ... FROM pedido_frete_cidade WHERE cod_ibge = <ibge>
```

A tabela tem **5.569 cidades**, cada uma já com o `perc_cif` da região dela (94 regiões).

**Por que não o nome:** a base de origem tem `"Guarulhoss"` sem código IBGE, e nomes com e sem
acento. Casar por nome **erra calado, e erra no preço**.

### O nome é a segunda opção, e só quando é inequívoco

O ViaCEP sai do ar e limita chamada — por isso existe um caminho alternativo. Mas ele só vale
quando a busca normalizada devolve **uma** linha na UF:

```ts
const { data } = await sb.from("pedido_frete_cidade")
  .select("cidade, uf, regiao, perc_cif")
  .eq("uf", uf).eq("cidade_busca", cid).limit(2);

if (achou.length === 1) return { perc: Number(achou[0].perc_cif) || 0, ... };
if (achou.length > 1)
  return { erro: "existe mais de uma " + L.cidade + " em " + uf + " — só o CEP desempata" };
```

`cidade_busca` é uma coluna pré-normalizada (minúscula, sem acento, sem pontuação). A função de
normalização do código tem de produzir **exatamente** esse formato, senão o desempate nunca casa:

```ts
const semAcento = (s: any) => String(s || "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
```

> **Duas linhas = ambiguidade = não resolve.** Melhor não mandar link do que mandar preço de outra
> praça.

### Sem praça resolvida, o link não sai

```ts
const f = await freteCIF(sb, L);
if (f?.erro && ctx.exigeFrete) return {
  ok: false, link_nao_enviado: true, falta: ["o CEP da loja"], por_que: f.erro,
  o_que_fazer: "NAO mande link agora. Peca o CEP da loja, de leve, explicando que e com ele que "
    + "o sistema aplica a tabela certa da praca dele — assim o preco que ele ve na tela ja e o "
    + "preco final, sem surpresa depois.",
};
```

**Pedir o CEP custa uma mensagem. Mandar um preço que a empresa não cumpre custa o pedido.**

---

## 7. Etapa D — escolher a cesta

### A praça vem primeiro, e decide as duas coisas

```ts
// ordem das pistas: o que o CEP resolveu > o que está salvo > o que o modelo mandou > o DDD
const uf  = ((!f?.erro && f.uf) || L?.uf || ufIn || ufDoDdd(L?.fone) || "").toUpperCase().slice(0,2);
const reg = UF2REG[uf] || "Sudeste";
const pracaAdivinhada = !UF2REG[uf];
```

**Por que nessa ordem:** numa versão anterior a cesta era escolhida **antes** do frete, usando só a
UF salva. Um lead com CEP de Pernambuco podia levar o percentual certo numa cesta do Sudeste. E
quando a UF era desconhecida, o `|| "Sudeste"` resolvia **calado** — sete leads receberam cesta do
Sudeste por isso, um deles com DDD 81.

Hoje, quando a praça não foi apurada, o retorno **diz isso ao modelo** em vez de fingir:

```ts
praca: pracaAdivinhada
  ? "NAO APURADA — a cesta caiu no Sudeste por falta de UF. Confirme a cidade dele antes de falar de mix."
  : uf + " (" + reg + ")",
```

### O CNAE manda; o palpite só entra se a Receita não resolveu

```ts
let ramo = String(input?.ramo || "").toUpperCase().trim();
if (!/^R\d{2}$/.test(ramo)) ramo = "R01";

const ramoCad = String(L?.ramo_cnae || "").toUpperCase();
let ramoVeioDe = "o que voce avaliou na conversa";
if (TEM_CESTA.test(ramoCad)) {
  ramo = ramoCad;
  ramoVeioDe = "o CNAE do CNPJ dele na Receita";
}
```

`TEM_CESTA` é `/^R(0[1-9]|10)$/`. CNAE que cai num ramo sem cesta montada (R22, R25…) devolve vazio
**de propósito** — melhor a cesta geral do que apontar para uma cesta que não existe.

### A degradação é explícita e nomeada

As cestas vivem numa tabela (`pedido_base`, 40 combinações região×ramo). Nem toda combinação existe.
A busca tem fallback em cascata, e **cada degrau tem nome**:

```ts
let alvo = reg + "-" + ramo; let como = "exato";
if (!por.has(alvo)) {
  for (const [c, r] of [
    ["Sudeste-" + ramo, "mesmo ramo, cesta do Sudeste"],
    [reg + "-R01",      "R01 da regiao"],
    ["Sudeste-R01",     "cesta geral"],
  ]) if (por.has(c)) { alvo = c; como = r; break; }
}
if (!por.get(alvo)) return { erro: "nenhuma cesta montada — nao mande link nenhum" };
```

O nome do degrau volta no retorno (`escolha: como`). O modelo sabe se recebeu a cesta exata ou um
genérico, e fala de acordo.

> **Princípio transferível:** fallback silencioso é dívida. Se o sistema não achou o ideal, quem
> consome o resultado precisa saber **qual** aproximação recebeu.

---

## 8. A URL

```ts
const perc = f?.erro ? 0 : Math.max(0, Math.min(50, Number(f.perc) || 0));
const url  = PEDIDO_URL + "/#" + alvo
           + (L?.id  ? "~L" + L.id : "")
           + (perc>0 ? "~F" + String(perc) : "");
```

- `perc` é **limitado a [0, 50]** — um dado ruim na tabela não pode dobrar o preço da página.
- **`perc = 0` não leva marca.** Várias praças são 0% (capital, metropolitana, litoral e algumas
  regiões de SP); a página já trata ausência como "sem frete".
- A marca do lead (`~L<id>`) sai mesmo que falhe tudo o mais: **melhor um link sem atribuição do que
  um lead sem link.**

E o retorno aproveita um brinde do ViaCEP:

```ts
// cidade e UF vêm de graça na resposta do CEP. O repasse ao representante precisa da praça,
// e até aqui ela só existia se o lead a tivesse escrito com todas as letras.
if (!String(L.cidade||"").trim() && f.cidade) patch.cidade = f.cidade;
if (!String(L.uf    ||"").trim() && f.uf)     patch.uf     = f.uf;
```

---

## 9. Etapa E — a página aplica o frete no dado, não na soma

Esta é a parte que parece detalhe e não é.

```js
var FRETE = (function(){
  var m = pedacoMarca(/^F(\d{1,2}(?:[.,]\d{1,2})?)$/i);  // aceita 8.9 e 8,9
  if (!m) return 0;
  var v = Number(String(m[1]).replace(",", "."));
  return (isFinite(v) && v >= 0 && v <= 50) ? v : 0;
})();

(function aplicaFreteCIF(){
  if (!(FRETE > 0)) return;
  var f  = 1 + FRETE/100;
  var r2 = function(v){ return Math.round((Number(v)||0) * f * 100) / 100; };
  (D.catalogo || []).forEach(function(it){ it.preco = r2(it.preco); });
  Object.keys(D.segs || {}).forEach(function(k){
    (D.segs[k].itens || []).forEach(function(it){ it.preco = r2(it.preco); });
  });
})();
```

**Multiplica o `preco` de cada item, uma vez só, no carregamento.** Não em cada lugar que soma.

**Por que:** a mesma cesta é somada em cinco lugares — a tela, o PDF, o texto que vai para o
WhatsApp, o pedido gravado no banco e a planilha anexa do e-mail. Mexer no **dado** é o que garante
que os cinco digam o mesmo número. Qualquer outra abordagem acaba com dois deles discordando.

### O arredondamento é POR ITEM, não no subtotal

Numa cesta real com 8,9%: calculando item a item o total é **R$ 7.299,95**; calculando pelo subtotal
(`7.448,63 × 1,089`) dá **R$ 7.300,40** — 45 centavos a mais. O certo é o da tela, que é o que o
lojista paga linha a linha.

### A ordem da conta importa — e já erramos

O preço na base é a tabela de referência **dividida por 0,90** (+11,11% de margem). O desconto por
volume é de 10% a partir de um valor.

```js
function discountRate(sub){ return sub >= 5000 ? .10 : 0; }
```

- `tabela / 0,90 × (1 + perc)` seguido de −10% devolve `tabela × (1 + perc)`: **o frete chega
  inteiro e quem leva o desconto é o produto.** ✅
- `tabela × (1 + perc)` e depois −10% **comeria parte do frete**. ❌

Houve antes um erro irmão: a margem era `× 1,10` em vez de `/ 0,90`. Tirar 10% de quem recebeu 10%
não devolve o original (100 → 110 → 99), então cada item saía **1% abaixo da tabela** assim que o
desconto entrava. Com `/0,90`: 100 → 111,11 → 100,00, conferido em 1.104 produtos, todos voltando ao
centavo.

> **Princípio transferível:** quando há margem e desconto na mesma conta, escreva no código qual
> das duas tem de sobreviver intacta — e prove com um caso numérico no comentário.

### A marca do lead vai separada

```js
var MARCA      = /* tudo depois do primeiro ~ */;
var MARCAS     = MARCA ? MARCA.split("~") : [];
var MARCA_LEAD = (function(){ var m = pedacoMarca(/^L(\d{1,9})$/i); return m ? m[0] : ""; })();
```

**Duas armadilhas reais:**

1. A marca é lida **uma vez, no topo do arquivo**, antes de qualquer outra coisa. A rotina que
   carrega o segmento reescreve o hash (`history.replaceState`), então quem ler depois não acha
   nada. A primeira versão do registro de visita mandava marca vazia exatamente por isso.
2. O endpoint de visita só entende a marca quando ela é **exatamente** `L<id>`. Por isso a página
   manda `MARCA_LEAD`, não a marca inteira. Sem esse cuidado, as visitas passariam a gravar
   `lead_id` vazio — e era justamente a visita que resgatava a identidade dos pedidos de quem estava
   com a página antiga em cache.

---

## 10. O que a IA pode e não pode dizer sobre preço

O retorno da ferramenta termina com uma instrução de uso:

> *"Mande a URL EXATAMENTE como está, sozinha numa linha, sem encurtar e sem colar texto nela. Diga
> que cada produto aparece COM O PREÇO e que o total soma na tela. O preço da tela JÁ É o preço
> final para a praça dele, com a entrega inclusa — pode dizer isso, e é uma boa notícia. O que você
> NÃO faz é abrir a conta: nunca diga o percentual do frete, nem quanto dele é frete, nem prometa
> prazo de entrega."*

**Ela reflete o resultado; não abre a conta.** O mesmo vale para o CNPJ: a IA nunca escreve um
documento — um dígito trocado manda o vendedor para outra empresa.

Isso vem de um incidente: a IA respondeu a um vendedor *"Sim, pode retirar amanhã, já está
faturado"* lendo um campo de status de cadastro. A entrega era sexta, e um humano teve de desmentir
três horas depois. A regra que saiu: **status ela reflete; compromisso vira tarefa para um humano.**

---

## 11. Modelo de dados mínimo

```sql
-- o lead e o que já se sabe dele
copiloto_lead (
  id            bigserial primary key,
  contact_id    text,           -- id no CRM
  fone          text,
  cnpj          text,
  cep           text,
  endereco      text,
  cidade        text,
  uf            text,
  cnae          text,           -- 7 dígitos, como veio da Receita
  cnae_desc     text,
  ramo_cnae     text,           -- R01..R10, ou vazio
  razao_social  text,
  cnae_em       timestamptz,    -- carimbo de "a consulta foi RESPONDIDA"
  link_em       timestamptz,
  link_seg      text,           -- a cesta que ele recebeu
  link_url      text,
  link_vezes    integer,
  atualizado    timestamptz
);

cnae_ramo           (cnae7 text primary key, ramo_sigla text);        -- 258 linhas
pedido_base         (pedido_id text primary key, ramo_nome text, n_itens int);  -- 40 cestas
pedido_frete_regiao (regiao text primary key, perc_cif numeric, venda_min_cif numeric);  -- 94
pedido_frete_cidade (cod_ibge int primary key, cidade text, cidade_busca text,
                     uf text, regiao text, perc_cif numeric);         -- 5.569
```

Duas colunas merecem atenção:

- **`cnae_em`** carimba que a pergunta foi **respondida**, nunca que ela falhou. É o que permite os
  três retornos da seção 4.
- **`cidade_busca`** é a versão normalizada do nome, pré-calculada. Normalizar na consulta impediria
  o uso de índice e, pior, deixaria a normalização em dois lugares.

---

## 12. Resumo dos princípios

Em ordem de quanto custaram para aprender:

1. **Trava que importa mora na ferramenta, não no prompt.** Texto o modelo pondera; recusa ele não
   contorna.
2. **Dado que vira trava é extraído por código.** Se depende do modelo lembrar de salvar, a trava
   vai disparar contra quem já respondeu.
3. **"Falhou" ≠ "não existe"** num enriquecimento externo. Três estados, não dois.
4. **Chave estrangeira estável, nunca nome.** IBGE, não nome de cidade. Nome erra calado.
5. **Ambiguidade não se resolve no chute.** Duas linhas candidatas = não resolve, e diz por quê.
6. **Fallback tem nome e volta no retorno.** Quem consome precisa saber qual aproximação recebeu.
7. **Aplique a transformação no dado, uma vez**, não em cada lugar que consome.
8. **Toda regra de negócio tem chave de configuração**, para afrouxar sem deploy — publicar mexe em
   algo que está atendendo gente agora.
9. **Peça os dados juntos e diga para que servem.** Cada ida e volta a mais perde lojista.
10. **Meça o custo da trava antes de ligar.** 49% → 22% de links é uma troca legítima, mas só se
    for uma escolha e não uma surpresa.
11. **A IA reflete o resultado; não abre a conta** nem assume compromisso.
