# Link de pedido personalizado — especificação

Como transformar **duas informações que o cliente digita no chat — CNPJ e CEP — num link de página
de pedido em que cada produto já aparece com o preço final da praça dele.**

O CNPJ resolve **o que mostrar** (o mix). O CEP resolve **por quanto** (o frete embutido). Sem os
dois, o link não sai.

---

## 1. Anatomia do link

Todo o resultado do processamento cabe no fragmento da URL:

```
https://<host>/#Sudeste-R01~L562~F6.8
                 │         │     └── F<perc>  percentual de frete CIF da praça
                 │         └──────── L<id>    id do cliente/lead, para atribuição
                 └────────────────── <Região>-<Ramo>  qual cesta de produtos carregar
```

Separador `~`, pedaços opcionais e em qualquer ordem. O fragmento (`#`) é deliberado: não vai para
o servidor, não aparece em log de acesso e a página o lê no cliente.

---

## 2. Fluxo

```
mensagem do cliente
      │
      ▼
 A. CAPTURA        regex sobre o texto → grava CNPJ e CEP
      │
      ▼
 B. CNPJ           → API da Receita → CNAE → tabela de ramos → R01..R10
      │
      ▼
 C. CEP            → API de CEP → código IBGE → tabela de frete → perc_cif
      │
      ▼
 D. MONTAGEM       região + ramo → cesta;  monta a URL
      │
      ▼
 E. PÁGINA         aplica o frete no preço de cada item, no carregamento
```

As etapas B e C são independentes e podem rodar em paralelo. A etapa D exige as duas concluídas.

---

## 3. Etapa A — capturar CNPJ e CEP do texto

Se o sistema conversa por IA, **não dependa de o modelo chamar uma ferramenta para salvar o dado.**
Extraia por código, varrendo todas as mensagens recebidas, e grave quando a coluna estiver vazia.

Qualquer campo que funcione como **trava** (bloqueia uma ação até estar preenchido) precisa ser
alimentado por código. Caso contrário o sistema volta a pedir um dado que o cliente já deu.

```ts
// CEP: o cliente costuma mandar dentro do endereço, não isolado
//   "01310-100" · "01310100" · "rua tal, 123 - 01310100"
function cepDoTexto(s: string): string {
  const m = /(\d{5})[-.\s]?(\d{3})(?!\d)/.exec(s || "");
  return m ? m[1] + m[2] : "";
}

// CNPJ: com ou sem máscara
//   "12.345.678/0001-99" · "12345678000199" · "cnpj 12 345 678 0001 99"
function cnpjDoTexto(s: string): string {
  const m = (s || "").match(/(\d{2})[.\s]?(\d{3})[.\s]?(\d{3})[\/\s]?(\d{4})[-\s]?(\d{2})(?!\d)/);
  return m ? m[1] + m[2] + m[3] + m[4] + m[5] : "";
}
```

O `(?!\d)` no fim das duas é obrigatório: sem ele um número maior é truncado e vira um CEP ou CNPJ
falso — que passa na validação de formato e leva a cesta e o preço errados.

```ts
const recebidas = msgs.filter(m => m.direction === "inbound").map(m => m.body).join("\n");
const patch: any = {};
const cep  = cepDoTexto(recebidas);
const cnpj = cnpjDoTexto(recebidas);
if (cep  && !lead.cep)                       patch.cep  = cep;
if (cnpj && digits(lead.cnpj).length !== 14) patch.cnpj = cnpj;
if (Object.keys(patch).length) await salvar(lead.id, patch);
```

---

## 4. Etapa B — CNPJ decide o mix

### A cadeia

```
CNPJ (14 dígitos)
  → GET https://brasilapi.com.br/api/cnpj/v1/{cnpj}
  → campo `cnae_fiscal` (7 dígitos)
  → SELECT ramo_sigla FROM cnae_ramo WHERE cnae7 = <cnae>
  → R01..R10
```

A tabela `cnae_ramo` mapeia código CNAE → sigla de ramo. Monte-a a partir da **sua base real de
clientes** (qual CNAE cada cliente tem, e em que cesta ele compra), não de uma classificação
teórica: o que importa é o agrupamento que reflete o seu catálogo.

Exemplo de ramos para varejo de utilidades domésticas:

| ramo | perfil |
|---|---|
| R01 | utilidades, variedades, bazar, armarinho |
| R02 | loja de departamento, magazine |
| R03 | joalheria, bijuteria, presentes, festa |
| R04 | supermercado, mercearia, atacarejo |
| R05 | cama, mesa, banho, tecidos |
| R06 | vestuário, calçados |
| R07 | papelaria, livraria |
| R08 | material de construção, ferragem |
| R09 | farmácia, perfumaria, cosméticos |
| R10 | esporte, brinquedo, pet |

### Três retornos, não dois

APIs públicas limitam chamada. **Uma falha transitória não é uma resposta.** Se o código tratar
HTTP 429 como "este CNPJ não tem CNAE", o registro fica marcado como consultado para sempre e nunca
mais se tenta — o enriquecimento se perde silenciosamente.

```ts
type Ramo = { ramo: string; cnae: string; desc: string; razao: string; cidade: string; uf: string };

async function ramoDoCnpj(db, cnpj: string): Promise<Ramo | { fim: true } | null> {
  const d = digits(cnpj);
  if (d.length !== 14) return { fim: true };
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`,
                          { signal: AbortSignal.timeout(9000) });
    if (r.status === 404) return { fim: true };   // não existe
    if (!r.ok)            return null;            // 429, 5xx: pergunte de novo
    const v = await r.json();
    const cnae = String(v?.cnae_fiscal || "").replace(/\D/g, "");
    if (!cnae) return { fim: true };
    const { data } = await db.from("cnae_ramo")
      .select("ramo_sigla").eq("cnae7", cnae).maybeSingle();
    const sig = String(data?.ramo_sigla || "").toUpperCase();
    return {
      ramo: TEM_CESTA.test(sig) ? sig : "",       // "" = sem cesta própria, usa a geral
      cnae, desc: v?.cnae_fiscal_descricao, razao: v?.razao_social,
      cidade: v?.municipio, uf: v?.uf,
    };
  } catch { return null; }                        // timeout, rede
}
```

| retorno | significa | ação |
|---|---|---|
| objeto | a Receita respondeu | grava ramo **e** o carimbo `cnae_em` |
| `{ fim: true }` | 404, ou sem CNAE | grava **só** `cnae_em` — encerra o assunto |
| `null` | 429 / 5xx / timeout | **não grava nada** — tenta na próxima passada |

O carimbo `cnae_em` significa *"a pergunta foi respondida"*, nunca *"a pergunta foi feita"*.

### Quando consultar

Uma vez por cliente, e só quando ele estiver sendo atendido naquela execução. Com essa condição a
consulta não vira martelada na API, mesmo com um processo rodando a cada poucos minutos.

### A praça do cadastro é rede, não verdade

A consulta devolve também município e UF da inscrição. Grave-os **somente se o cliente ainda não
tiver informado os dele**:

```ts
cidade: lead.cidade?.trim() ? undefined : rc.cidade,
uf:     lead.uf?.trim()     ? undefined : rc.uf,
```

Quem vende online fatura num endereço e recebe noutro. O endereço de entrega é o que manda no frete.

---

## 5. Etapa C — CEP decide o preço

### A chave é o código IBGE

```
CEP → GET https://viacep.com.br/ws/{cep}/json/ → campo `ibge`
    → SELECT ... FROM frete_cidade WHERE cod_ibge = <ibge>
```

Uma linha por município (5.569 no Brasil), cada uma com o percentual da região a que pertence.

**Nunca case por nome de cidade como chave primária.** Bases cadastrais têm grafias divergentes,
acentuação inconsistente e erros de digitação. Casar por nome erra em silêncio — e erra no preço.

### Nome de cidade como segunda opção, e só se for inequívoco

A API de CEP cai e limita chamada; é preciso um caminho alternativo. Ele vale apenas quando a busca
normalizada devolve **exatamente uma** linha na UF:

```ts
const { data } = await db.from("frete_cidade")
  .select("cidade, uf, regiao, perc_cif")
  .eq("uf", uf).eq("cidade_busca", normalizado).limit(2);

if (data.length === 1) return { perc: Number(data[0].perc_cif) || 0, ...data[0] };
if (data.length  >  1) return { erro: `mais de uma ${cidade} em ${uf} — só o CEP desempata` };
```

`cidade_busca` é uma coluna **pré-calculada** (minúscula, sem acento, sem pontuação). Normalizar na
consulta impediria o uso de índice e espalharia a regra de normalização por dois lugares. A função
do código tem de produzir exatamente o mesmo formato da coluna:

```ts
const normalizar = (s: string) => (s || "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")   // tira acento
  .toLowerCase()
  .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
```

### Função completa

```ts
async function freteCIF(db, lead): Promise<{ perc: number; regiao: string; cidade: string;
                                             uf: string; via: string } | { erro: string }> {
  const cep = cepDigits(lead.cep) || cepDoTexto(lead.cep) || cepDoTexto(lead.endereco);

  // 1) CEP → IBGE → linha da cidade. O caminho correto.
  if (cep) {
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`,
                            { signal: AbortSignal.timeout(6000) });
      if (r.ok) {
        const v = await r.json();
        const ibge = Number(String(v?.ibge || "").replace(/\D/g, ""));
        if (ibge) {
          const { data } = await db.from("frete_cidade")
            .select("cidade, uf, regiao, perc_cif").eq("cod_ibge", ibge).maybeSingle();
          if (data) return { perc: Number(data.perc_cif) || 0, regiao: data.regiao,
                             cidade: data.cidade, uf: data.uf, via: "CEP " + cep };
          return { erro: `o CEP ${cep} aponta ${v?.localidade}/${v?.uf}, `
                       + `que não está na tabela de frete` };
        }
      }
    } catch { /* API fora do ar: cai para o nome da cidade */ }
  }

  // 2) nome da cidade + UF, só se for único na UF
  const cid = normalizar(lead.cidade);
  const uf  = String(lead.uf || "").toUpperCase().slice(0, 2);
  if (cid && uf) {
    const { data } = await db.from("frete_cidade")
      .select("cidade, uf, regiao, perc_cif").eq("uf", uf).eq("cidade_busca", cid).limit(2);
    if (data?.length === 1) return { perc: Number(data[0].perc_cif) || 0, regiao: data[0].regiao,
                                     cidade: data[0].cidade, uf: data[0].uf,
                                     via: `cidade ${data[0].cidade}/${data[0].uf}` };
    if (data?.length  >  1) return { erro: `mais de uma ${lead.cidade} em ${uf} — só o CEP desempata` };
  }

  return { erro: cep ? `não resolvi o CEP ${cep} agora` : "sem CEP para achar a praça" };
}
```

**Ambiguidade não se resolve no chute.** Duas linhas candidatas = não resolve, e o erro diz por quê.
Melhor não mandar o link do que mandar preço de outra praça: o erro só apareceria no faturamento.

---

## 6. Etapa D — a trava

### Onde ela mora

Se o fluxo é conduzido por IA com *tool use*, **a exigência dos dados tem de ser uma recusa da
ferramenta, não uma instrução no prompt.**

Texto no prompt o modelo pondera contra o resto do contexto — se o cliente insistir, ele manda o
link assim mesmo. Recusa de ferramenta ele não contorna.

```ts
const falta: string[] = [];
if (exigeCnpj && digits(lead.cnpj).length < 14) falta.push("o CNPJ da loja (14 dígitos)");
if (exigeCep  && !lead.cep?.trim() && !lead.endereco?.trim()) falta.push("o CEP de entrega");

if (falta.length) return {
  ok: false,
  link_nao_enviado: true,
  falta,
  o_que_fazer:
    "NÃO mande link agora. Peça " + falta.join(" e ") + " NA MESMA MENSAGEM, em uma frase leve, "
  + "dizendo para que serve cada um: o CNPJ é para o sistema ver o tipo da empresa e montar a "
  + "lista certa de produtos; o CEP é para saber para onde vai a mercadoria e já mostrar o preço "
  + "com a entrega inclusa. NÃO peça rua, número nem bairro — o CEP basta. Assim que ele "
  + "responder, chame esta ferramenta de novo e MANDE o link, sem mais nenhuma pergunta.",
  ja_tenho: { cnpj: !!lead.cnpj, cep: !!lead.cep },
};
```

Três exigências do texto da recusa:

1. **Os dois dados são pedidos juntos, numa mensagem só.** Pedir um, esperar, pedir o outro
   multiplica as idas e vindas e perde cliente.
2. **O CEP basta — não peça rua, número e bairro.** O CEP já traz tudo isso. Pedir de novo o que a
   API resolve sozinha é a volta que faz o cliente desistir.
3. **A recusa explica para que serve cada dado.** O cliente entrega mais rápido quando entende o
   porquê, e a frase não soa burocrática.

### A descrição da ferramenta ensina a regra

A IA decide quando chamar a ferramenta a partir da descrição dela. Escreva-a como instrução de uso,
não como documentação de parâmetros:

> *"Monta o LINK da página de pedido para ESTE cliente e devolve a URL pronta. Na página cada
> produto aparece COM O PREÇO e o total soma na tela. PRECISA DE DOIS DADOS, E SÓ DOIS: o CNPJ e o
> CEP. O CNPJ escolhe o MIX — o sistema consulta o CNAE dele na Receita e monta a cesta do ramo
> certo, então você NÃO precisa adivinhar o ramo. O CEP escolhe o PREÇO: o frete da praça dele entra
> no preço de CADA item. NÃO precisa de rua, número nem bairro. Se faltar um dos dois, ela recusa e
> te diz o que pedir; com os dois, chame e mande o link na sequência, sem mais perguntas."*

Um parâmetro `ramo` opcional serve de palpite de reserva, usado **apenas** se a Receita não
resolver. Deixe isso explícito na descrição, ou o modelo passa a preenchê-lo sempre.

### Toda trava tem chave de configuração

```
link_exige_cnpj  = sim | nao
link_exige_cep   = sim | nao
link_exige_frete = sim | nao
```

Numa tabela chave/valor lida a cada execução. Afrouxar passa a ser um `UPDATE`, sem publicar código
— o que importa quando o deploy mexe num atendimento que está acontecendo.

---

## 7. Etapa D — escolher a cesta

### A praça vem primeiro, e decide as duas coisas

Resolva o frete **antes** da cesta: o CEP é a fonte mais confiável de UF que existe no fluxo, e
tanto a cesta quanto o percentual dependem dela.

```ts
const f = await freteCIF(db, lead);

if (f.erro && exigeFrete) return {
  ok: false, link_nao_enviado: true, falta: ["o CEP da loja"], por_que: f.erro,
  o_que_fazer: "NÃO mande link agora. Peça o CEP, de leve, explicando que é com ele que o sistema "
             + "aplica a tabela certa da praça dele — assim o preço da tela já é o final.",
};

// ordem das pistas: o que o CEP resolveu > o salvo > o informado > o DDD do telefone
const uf  = ((!f.erro && f.uf) || lead.uf || ufInformada || ufDoDdd(lead.fone) || "")
            .toUpperCase().slice(0, 2);
const reg = UF2REG[uf] || "Sudeste";
const pracaAdivinhada = !UF2REG[uf];
```

Quando a praça não foi apurada, **diga isso no retorno** em vez de deixar o default passar calado:

```ts
praca: pracaAdivinhada
  ? "NÃO APURADA — a cesta caiu no padrão por falta de UF. Confirme a cidade antes de falar de mix."
  : `${uf} (${reg})`,
```

### O CNAE manda; o palpite é reserva

```ts
let ramo = String(input?.ramo || "").toUpperCase().trim();
if (!/^R\d{2}$/.test(ramo)) ramo = "R01";

let ramoVeioDe = "avaliação na conversa";
const doCnae = String(lead.ramo_cnae || "").toUpperCase();
if (TEM_CESTA.test(doCnae)) {           // TEM_CESTA = /^R(0[1-9]|10)$/
  ramo = doCnae;
  ramoVeioDe = "o CNAE do CNPJ na Receita";
}
```

CNAE que cai num ramo **sem cesta montada** devolve vazio de propósito — melhor a cesta geral do que
apontar para uma que não existe.

### Fallback com nome

Nem toda combinação região×ramo tem cesta. Degrade em cascata, e **dê nome a cada degrau**:

```ts
let alvo = `${reg}-${ramo}`, como = "exato";
if (!cestas.has(alvo)) {
  for (const [cand, nome] of [
    [`Sudeste-${ramo}`, "mesmo ramo, cesta da região padrão"],
    [`${reg}-R01`,      "ramo genérico da região"],
    ["Sudeste-R01",     "cesta geral"],
  ]) if (cestas.has(cand)) { alvo = cand; como = nome; break; }
}
if (!cestas.has(alvo)) return { erro: "nenhuma cesta montada — não mande link" };
```

O nome do degrau volta no retorno (`escolha: como`). Quem consome — a IA, um log, um painel —
precisa saber **qual** aproximação recebeu. Fallback silencioso vira dívida invisível.

---

## 8. Montar a URL

```ts
const perc = f.erro ? 0 : Math.max(0, Math.min(50, Number(f.perc) || 0));

const url = BASE + "/#" + alvo
          + (lead.id ? "~L" + lead.id : "")
          + (perc > 0 ? "~F" + String(perc) : "");
```

- **`perc` limitado a [0, 50].** Um dado ruim na tabela não pode dobrar o preço da página.
- **`perc = 0` não leva marca.** Praças com frete zero existem; a página trata ausência como "sem
  frete" e pula a multiplicação.
- **A marca do cliente sai mesmo que o resto falhe.** Melhor um link sem atribuição do que um
  cliente sem link.

Aproveite o retorno do CEP para completar o cadastro, já que vem de graça:

```ts
if (!f.erro) {
  if (!lead.cidade?.trim() && f.cidade) patch.cidade = f.cidade;
  if (!lead.uf?.trim()     && f.uf)     patch.uf     = f.uf;
}
patch.link_em = now(); patch.link_seg = alvo; patch.link_url = url;
```

### O retorno da ferramenta

Devolva contexto suficiente para a IA falar com precisão sem precisar inferir nada:

```ts
return {
  ok: true,
  link: url,
  segmento: alvo,
  cesta: cesta.nome,
  itens: cesta.n_itens,
  escolha: como,                      // "exato" | "cesta geral" | ...
  cesta_escolhida_por: ramoVeioDe,
  praca: pracaAdivinhada ? "NÃO APURADA — ..." : `${uf} (${reg})`,
  frete: f.erro ? `não aplicado (${f.erro})`
                : `já embutido no preço de cada item, praça ${f.regiao} (${f.via})`,
  desconto_da_pagina: DESCONTO,
  pedido_minimo: MINIMO,
  como_mandar:
    "Mande a URL EXATAMENTE como está, sozinha numa linha, sem encurtar e sem colar texto nela. "
  + "Diga que cada produto aparece COM O PREÇO e que o total soma na tela. O preço da tela JÁ É o "
  + "preço final para a praça dele, com a entrega inclusa — pode dizer isso. O que você NÃO faz é "
  + "abrir a conta: nunca diga o percentual do frete, nem quanto dele é frete, nem prometa prazo.",
};
```

**A IA reflete o resultado; não abre a conta.** Ela pode afirmar que o preço é final e já inclui
entrega — isso é verdade e é uma boa notícia. Não pode dizer o percentual, decompor o valor nem
assumir compromisso de prazo: esses viram tarefa para um humano.

---

## 9. Etapa E — a página aplica o frete

### Ler a marca antes de tudo

```js
// Lida UMA VEZ, no topo, antes de qualquer rotina que mexa no hash.
// Se a página reescreve o hash (history.replaceState ao trocar de segmento),
// quem ler depois não encontra mais nada.
var MARCA  = (function(){
  var h = (location.hash || "").replace(/^#/, "");
  var i = h.indexOf("~");
  return i < 0 ? "" : h.slice(i + 1);
})();
var MARCAS = MARCA ? MARCA.split("~") : [];
function pedacoMarca(re){
  for (var i = 0; i < MARCAS.length; i++) { var m = re.exec(MARCAS[i]); if (m) return m; }
  return null;
}

var MARCA_LEAD = (function(){ var m = pedacoMarca(/^L(\d{1,9})$/i); return m ? m[0] : ""; })();

var FRETE = (function(){
  var m = pedacoMarca(/^F(\d{1,2}(?:[.,]\d{1,2})?)$/i);   // aceita 8.9 e 8,9
  if (!m) return 0;
  var v = Number(String(m[1]).replace(",", "."));
  return (isFinite(v) && v >= 0 && v <= 50) ? v : 0;      // revalida no cliente
})();
```

O limite `[0, 50]` é revalidado aqui: o fragmento é editável pelo usuário.

Se outro endpoint (registro de visita, analytics) espera só o id do cliente, mande **`MARCA_LEAD`**,
não a marca inteira — senão ele recebe uma string que não reconhece e grava vazio.

### Aplicar no dado, uma vez

```js
(function aplicaFreteCIF(){
  if (!(FRETE > 0)) return;
  var f  = 1 + FRETE / 100;
  var r2 = function(v){ return Math.round((Number(v) || 0) * f * 100) / 100; };
  (DATA.catalogo || []).forEach(function(it){ it.preco = r2(it.preco); });
  Object.keys(DATA.segs || {}).forEach(function(k){
    (DATA.segs[k].itens || []).forEach(function(it){ it.preco = r2(it.preco); });
  });
})();
```

**Multiplique o preço de cada item uma única vez, no carregamento — não em cada lugar que soma.**

A mesma cesta costuma ser totalizada em vários lugares: a tela, o PDF, o texto que vai para o
WhatsApp, o pedido gravado e a planilha do e-mail. Mexer no **dado** é o que garante que todos
digam o mesmo número. Qualquer outra abordagem acaba com dois deles discordando.

### Arredonde por item, não no subtotal

O cliente paga linha a linha, e é isso que a tela mostra. Calcular o total pelo subtotal × fator dá
resultado diferente do somatório dos itens arredondados — uma diferença de centavos que aparece como
inconsistência entre a tela e o documento.

### A ordem da conta, quando há margem e desconto

Se o preço de tela embute uma margem e a página concede desconto por volume, defina **qual das duas
tem de sobreviver intacta** e escreva isso no código.

No desenho usado aqui o frete deve chegar **inteiro** e o desconto incidir sobre o produto:

```
preço de tela = tabela / (1 - margem) × (1 + frete)
```

Com margem de 10% e desconto de 10%:

```
tabela / 0,90 × (1 + frete)  −10%  =  tabela × (1 + frete)   ✅ frete inteiro
tabela × (1 + frete)         −10%  =  90% de tudo            ❌ come o frete
```

Atenção ao irmão desse erro: **`× 1,10` não é o inverso de `−10%`**. Tirar 10% de quem recebeu 10%
devolve 99, não 100 — cada item sairia 1% abaixo da tabela assim que o desconto entrasse. O correto
é `/ 0,90`, que é +11,11%: 100 → 111,11 → 100,00.

Prove com um caso numérico no comentário do código, não com prosa.

---

## 10. Modelo de dados

```sql
-- o cliente/lead e o que já se sabe dele
lead (
  id            bigserial primary key,
  contact_id    text,            -- id no CRM
  fone          text,
  cnpj          text,
  cep           text,
  endereco      text,
  cidade        text,
  uf            text,
  cnae          text,            -- 7 dígitos, como veio da Receita
  cnae_desc     text,
  ramo_cnae     text,            -- R01..R10, ou vazio
  razao_social  text,
  cnae_em       timestamptz,     -- "a consulta foi RESPONDIDA" (ver §4)
  link_em       timestamptz,
  link_seg      text,            -- cesta entregue
  link_url      text,
  link_vezes    integer
);

-- CNAE → ramo. Monte a partir da sua base real de clientes.
cnae_ramo (
  cnae7       text primary key,
  ramo_sigla  text not null
);

-- as cestas montadas, uma por combinação região×ramo
cesta (
  cesta_id   text primary key,   -- "Sudeste-R01"
  ramo_nome  text,
  n_itens    integer
);

-- percentual por região
frete_regiao (
  regiao         text primary key,
  perc_cif       numeric not null
);

-- uma linha por município; a chave é o IBGE
frete_cidade (
  cod_ibge      integer primary key,
  cidade        text,
  cidade_busca  text,            -- pré-normalizada: minúscula, sem acento (ver §5)
  uf            char(2),
  regiao        text references frete_regiao(regiao),
  perc_cif      numeric
);
create index on frete_cidade (uf, cidade_busca);
```

Duas colunas carregam decisão de projeto:

- **`cnae_em`** carimba que a pergunta foi *respondida*, nunca que foi *feita*. É o que viabiliza os
  três retornos da §4.
- **`cidade_busca`** é pré-calculada. Normalizar na consulta mataria o índice e espalharia a regra
  por dois lugares.

---

## 11. Checklist de implementação

- [ ] Regex de CNPJ e CEP com `(?!\d)` no fim, aplicadas a **todas** as mensagens recebidas
- [ ] Campo que vira trava é preenchido por código, nunca só por ferramenta do modelo
- [ ] `ramoDoCnpj` com **três** retornos distintos; 429 e 5xx não encerram
- [ ] Carimbo de consulta gravado só quando houve resposta
- [ ] Consulta de CNAE acontece uma vez por cliente, no atendimento
- [ ] Praça do cadastro só preenche o que estiver vazio
- [ ] Busca de frete pelo **código IBGE**; nome de cidade apenas como desempate único
- [ ] Coluna `cidade_busca` pré-normalizada, com a mesma função do código
- [ ] A trava é **recusa da ferramenta**, com `o_que_fazer` acionável
- [ ] CNPJ e CEP pedidos **na mesma mensagem**; rua/número/bairro não são pedidos
- [ ] Cada trava tem chave de configuração alterável sem deploy
- [ ] Frete resolvido **antes** da cesta
- [ ] Praça não apurada é declarada no retorno, não mascarada pelo default
- [ ] Fallback de cesta com nome, devolvido ao chamador
- [ ] `perc` limitado a [0, 50] no servidor **e** no cliente
- [ ] `perc = 0` não gera marca
- [ ] Marca lida no topo da página, antes de qualquer `replaceState`
- [ ] Frete aplicado no **dado**, uma vez, no carregamento
- [ ] Arredondamento **por item**
- [ ] Ordem margem/desconto documentada com caso numérico
- [ ] Retorno instrui a IA sobre o que ela pode e não pode afirmar sobre preço

---

## 12. Princípios

1. **Trava que importa mora na ferramenta, não no prompt.** Texto o modelo pondera; recusa ele não
   contorna.
2. **Dado que vira trava é extraído por código.** Se depende do modelo lembrar de salvar, a trava
   dispara contra quem já respondeu.
3. **"Falhou" ≠ "não existe"** em enriquecimento externo. Três estados, não dois.
4. **Chave estável, nunca nome.** Código IBGE, não nome de cidade: nome erra calado.
5. **Ambiguidade não se resolve no chute.** Duas candidatas = não resolve, e diz por quê.
6. **Fallback tem nome e volta no retorno.** Quem consome precisa saber qual aproximação recebeu.
7. **Transforme o dado, uma vez** — não cada lugar que o consome.
8. **Toda regra de negócio tem chave de configuração**, para afrouxar sem deploy.
9. **Peça os dados juntos e diga para que servem.** Cada ida e volta a mais perde cliente.
10. **Não peça o que a API resolve sozinha.** O CEP já traz rua, bairro, cidade e UF.
11. **A IA reflete o resultado; não abre a conta** nem assume compromisso de prazo.
