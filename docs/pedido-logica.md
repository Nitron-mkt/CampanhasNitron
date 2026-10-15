# Nina — Pedido Sugerido por CNPJ (lógica operacional)

> Documento-mestre para a Nina **vender direto**: recebe um CNPJ, descobre **ramo** e **região**
> do cliente, e monta um **pedido-base** (mix + quantidades) específico para aquele perfil,
> já com o gancho das linhas novas **TECA** e **MOB**, apresentando cada item com **penetração** e
> **curva A/B**. A sugestão é ponto de partida — o operador/cliente ajusta.

---

## 1. Fluxo ponta a ponta

1. **Recebe o CNPJ** (digitado pelo cliente, lido da conversa, ou já vinculado ao contato).
2. **Já é cliente?**
   - **Sim** (existe CODPARC no Sankhya): usa direto o `AD_CODRAMOPAR` (ramo) e a UF do cadastro.
     Não precisa de API externa.
   - **Não** (prospect): segue para o passo 3.
3. **Consulta a BrasilAPI** (gratuita, sem chave):
   `GET https://brasilapi.com.br/api/cnpj/v1/{cnpj_somente_digitos}`
   Campos usados: `cnae_fiscal` (principal), `cnaes_secundarios[]`, `uf`, `municipio`, `razao_social`,
   `nome_fantasia`, `descricao_situacao_cadastral` (só ativa).
4. **CNAE → Ramo** via tabela de-para `cnae_ramo` (CNAE de 7 dígitos → `CODRAMO` R01…R31):
   - tenta o **CNAE principal**; se não casar, varre os **secundários**;
   - fallback: ramo pelo **grupo/divisão** do CNAE (2–4 primeiros dígitos); último fallback = `R01`
     (Casa de Utilidades) por ser o ramo mais abrangente do núcleo.
5. **Região (macro)** a partir da **UF**:
   - Norte: AC AP AM PA RO RR TO · Nordeste: AL BA CE MA PB PE PI RN SE ·
     Centro-Oeste: DF GO MT MS · Sudeste: ES MG RJ SP · Sul: PR RS SC.
6. **Busca o pedido-base** em `vw_pedido_base` com `regiao = X` e `ramo_sigla = Y`.
   - Se **não houver** cesta para o par (ramo com amostra fraca naquela região): usa o
     **fallback nacional do ramo** (cesta do mesmo ramo no Sudeste, que é a de maior amostra);
     se nem isso, usa a cesta **R01 da região**.
7. **Monta a sugestão** (JSON do pedido): itens com `referencia`, `descr`, `linha`, `qtd`,
   `penetracao`, `curva (A/B/C)`, `preco_ref`, `imagem_url`, e flag `semente` (TECA/MOB).
8. **Apresenta** com a narrativa de venda (seção 3) e, se aprovado, encaminha para o portal/pedido.

---

## 2. Dados e fontes (onde cada coisa vive)

| Peça | Fonte | Estado |
|---|---|---|
| Pedido-base (mix+qtd por Região×Ramo) | Supabase `vw_pedido_base` (sobre `pedido_base` + `pedido_base_item` + `nitron_sku`) | ✅ pronto (40 cestas) |
| De-para **CNAE→Ramo** | Supabase `cnae_ramo` | ⏳ a criar (derivar dos parceiros já mapeados no Sankhya) |
| **Curva ABC** por SKU | coluna `curva` em `nitron_sku`/item | ⏳ a calcular (faturamento 3 anos) |
| **Penetração** (% clientes do segmento que compram) | `pedido_base_item.penetracao` | ✅ pronto |
| **Imagens** dos produtos | `nitron_sku.imagem_url` (URL pública `produto.nitron.com.br`, vinda de `produto_foto.link_principal` por referência) | ✅ 264/279 SKUs |
| CNPJ → CNAE/UF (prospect) | **BrasilAPI** `/api/cnpj/v1/{cnpj}` | externo, gratuito |
| Ramo (cliente existente) | Sankhya `TGFPAR.AD_CODRAMOPAR` → `AD_RAMOATUACAO` | ✅ existe |

---

## 3. Narrativa de venda (SEMPRE penetração + curva)

Para **cada item** a Nina fala, nesta ordem:

> "**{descrição}** — esse é **curva {A/B}** e **{penetração}% das lojas de {ramo} no {região}
> compram** esse item. Não pode faltar na sua loja."

Regras:
- **Sempre** dizer se é **A ou B** (itens C normalmente nem entram na cesta; se entrar, tratar como "complemento").
- **Curva A/B/C = por PENETRAÇÃO** no segmento (decisão do Ricardo — "staple"): **A** = itens que a
  maioria das lojas daquele ramo/região compra (top ~45% por penetração); **B** = penetração média
  (~40% seguintes); **C** = cauda (~15%). Quanto mais lojas compram, mais "A" (não pode faltar).
- **Penetração** = % de clientes daquele **Região×Ramo** que compraram o SKU nos últimos 3 anos.
- **TECA / MOB (linha nova)** entram como gancho, com fala própria:
  > "E aproveita pra levar uns itens da **linha nova** — {TECA: tábuas com alça, tábuas de pizza,
  > petisqueiras, organizadores de juta} e {MOB: **arara**, prateleiras, sapateira}. Leva um mix
  > pequeno pra girar e sentir a saída; quem colocou está vendendo bem."

---

## 4. TECA e MOB — ampliação e espalhamento

- **TECA** (ampliar o mix semeado, variando por ramo conforme o que o ramo já compra):
  tábuas de corte (inclui a **387** = `TABUA DE CORTE TECA - G`, que **gira muito** e deve aparecer
  espalhada em vários ramos), **tábuas com alça** (P/M/G), **tábuas de pizza**, **petisqueiras**,
  **organizadores / cestos de juta**, painéis.
- **MOB**: incluir a **Arara** (produto de interesse), além de prateleiras multiuso e sapateira.
- **Espalhar entre ramos**: em vez de 6 sementes fixas iguais para todos, a semente de cada cesta
  olha **o que aquele ramo×região já comprou de TECA/MOB** (quando houver histórico) e prioriza esses;
  onde não houver histórico, usa o kit padrão de degustação. A **tábua 387** entra como item recorrente
  nos ramos onde a penetração dela justifica (Casa de Utilidades, Magazine, Presentes, Cama-Mesa…).

---

## 5. Guardrails (do CLAUDE.md do projeto)

- Não prometer disponibilidade **sem estoque confirmado**; não praticar **preço fora da tabela do canal**.
- **Não vender a quem tem título vencido** (checar antes de fechar).
- **Grandes contas / redes nacionais → humano**.
- Sankhya é **somente leitura** pela integração; o pedido efetivo nasce no **portal** (vendas.nitron.com.br),
  que grava nativo no ERP. A Nina **sugere**; não robotiza a tela.

---

## 6. Implementação (edge function `nina-pedido-sugerido`)

**Input:** `{ cnpj | codparc }`
**Passos internos:**
1. Se `codparc`: lê ramo+UF do Sankhya (ou do espelho). Senão: BrasilAPI(cnpj) → cnae+uf.
2. `cnae_ramo` → `ramo_sigla`; UF → `regiao`.
3. `select * from vw_pedido_base where regiao=:r and ramo_sigla=:s` (+ fallback).
4. Enriquecer cada item com `curva` (de `nitron_sku`) e `imagem_url`.
5. Retornar `{ cliente:{razao,cnpj,regiao,ramo}, pedido:[{referencia,descr,linha,qtd,penetracao,curva,preco_ref,imagem_url,semente}], valor_estimado }`.

**Output para o cliente:** o **arquivo do pedido** (1 por cliente/segmento) — PDF/HTML com **imagem de
cada produto**, quantidade sugerida, e a marca da curva A/B. Os **40 arquivos-modelo** (um por
Região×Ramo) servem de catálogo pronto; o pedido do cliente é o modelo do seu segmento já preenchido.

---

## 8. Montador de pedido interativo (app "Pedido Nitron")

Página única (HTML+JS, sem build) que entrega o pedido-base **editável** ao cliente. Dados embutidos
em `app_data.js` (`window.DATA = { segs: {40 segmentos com cesta pré-preenchida: cod,ref,desc,linha,emb
(fardo/QTDEMB),preco,fardos,curva,pen,img}, catalogo: [2992 SKUs vendáveis com img] }`). Fonte do app:
`scratchpad/order_app.html` + `app_data.js` (gerados de `pedido_base`/`pedido_base_item`/`nitron_sku` +
catálogo Sankhya TGFPRO + `produto_foto`).

**O que faz:**
- Abre no segmento certo via `#<pedido_id>` (ex.: `#Sudeste-R04`); seletor troca entre os 40.
- Aba **"Meu pedido"** = cesta sugerida já preenchida (fardos sugeridos), cada card com foto, **curva
  A/B**, **penetração** ("X% das lojas de {ramo} compram"), **tamanho do fardo (QTDEMB)**, **preço/un**,
  **preço/fardo**, stepper +/− de fardos, **total da linha** (un e R$).
- Aba **"Linha nova · TECA/MOB"** (sementes, inclui a Arara) + **abas por categoria** com o catálogo
  completo (2992 SKUs, busca por nome/ref) — itens do segmento já marcados em verde; cliente adiciona mais.
- Barra fixa com **total geral** (R$, produtos, fardos, unidades). "Ver pedido" (texto + copiar),
  "PDF" (jsPDF), "Enviar para a Nina" (WhatsApp `wa.me` com o pedido escrito).
- Campos "Dados da loja" (razão, CNPJ, cidade, WhatsApp) entram no cabeçalho do pedido.

**Preço = TABELA PADRÃO PV-0003 (CODTAB 0), cheia.** (Ricardo decidiu usar a padrão, **não** a 194 do
gestor — a 194 é só −24,73% sobre esta.) A mediana de vendas (3 anos) serve só para a
**dinâmica/escolha de itens**, nunca como preço. Preço de venda = **VLRVENDA da CODTAB 0 "PV0003"**
(NUTAB vigente 628), **sem desconto por item**. Só **644 produtos** têm preço nessa tabela → o app
só mostra esses (catálogo "vendável de verdade"); 630/639 têm foto. Itens de cesta sem preço na base
(25 linhas, TECA/utilidades ativas mas tabeladas noutro lugar) foram **retirados** da cesta (sobram
TECA/MOB com preço: 8624/8626/8649/7955/14170-14182…). Para recalcular (nova tabela), reler TGFEXC do
NUTAB vigente de CODTAB 0 (`SELECT CODPROD,VLRVENDA FROM TGFEXC WHERE NUTAB=<vigente> AND TIPO='V'`).

**Desconto por volume (no total do pedido, não por item):** **>R$ 5.000 = 10%**; **>R$ 15.000 = 15%**.
O app mostra subtotal riscado + desconto + total, e a dica "faltam R$ X para o próximo nível".

**Imagens — EMBUTIDAS no app (data-URIs).** A sandbox do Artifact **bloqueia imagem externa de
qualquer domínio** (foi por isso que SharePoint/produto.nitron.com.br não renderizavam). Solução:
baixar por referência de `produto.nitron.com.br/<ref _>-01.jpg` (público, sem login), gerar miniatura
224px (Pillow, q70) e empacotar tudo em **`app_img.js`** = `window.IMG={codprod:"data:image/jpeg;base64,…"}`
(~3,1 MB, 630/639). O app usa `IMG[cod]`. 9 refs não respondem no CDN → placeholder. As fotos também
estão no SharePoint **Marketing › …/PRODUTOS/Digital_RGB** (nome = `<ref _>-01.jpg`), mas precisam de
login — por isso usamos o CDN público. Na **versão hospedada** (domínio Nitron) as imagens carregam por
URL direto, sem precisar embutir.

**Config:** `NINA_WA` no topo do script = WhatsApp da Nina (só dígitos, DDI 55). Vazio → o botão só
copia/abre resumo. **Pendente: Ricardo informar o número da Nina.**

**UX carrinho (ajuste 08/10/26):** "Meu pedido" é o **carrinho** (já vem com a cesta sugerida da
Nina). As abas de categoria (Potes, Organização, Cozinha, Lixeiras… + TECA/MOB como categorias
normais — **sem** aba "Linha Nova" duplicada) têm, em cada card, seletor de fardos + botão **"Incluir
no meu pedido"** → o item passa a aparecer em "Meu pedido". No carrinho, cada item tem stepper de
fardos + "remover". Itens já no pedido aparecem marcados em verde nas categorias.

**⚠️ Artifact vs. hospedado:** dentro do sandbox de Artifact do Claude o **download do PDF** e um
**POST automático de volta pra Nina** são bloqueados (a sandbox bloqueia download e cross-origin).
Para ficarem automáticos, publicar o **mesmo arquivo** no domínio da Nitron (função Supabase atrás do
Cloudflare Worker, padrão dos painéis limão/gestor — ver `supabase-paineis-html-csp`) + edge function
**`nina-pedido-recebido`** (recebe o JSON do pedido → grava + avisa a Nina → opcional PDF server-side).
No app hospedado PDF e envio funcionam nativos; o `wa.me` também é confiável fora da sandbox.

---

## 7. Pendências para ligar tudo (dependem do Sankhya)

1. **`cnae_ramo`**: derivar o de-para a partir dos ~milhares de parceiros já mapeados
   (`CNAE` → `AD_CODRAMOPAR` predominante), + ajuste manual nas divisões ambíguas.
2. **Curva ABC**: `curva` por SKU a partir do faturamento 3 anos (A=80%, B=15%, C=5%).
3. **TECA/MOB**: puxar o catálogo completo dos grupos TECA (1001801–1805) e MOB (1001901),
   achar a **Arara**, e recomputar as sementes por ramo (espalhando a 387 e cia.).
4. **Imagens**: localizar a URL/imagem por `codprod` (repositório Sankhya ou catálogo Anymarket/ML) e
   gravar em `nitron_sku.imagem_url`.
5. **Arquivos do pedido**: gerar os 40 (um por Região×Ramo) com imagem de cada item.
6. **Função `nina-pedido-sugerido`** + ligação no fluxo da Nina.

> ⚠️ Em 07/10/2026 a autenticação do conector Sankhya (OAuth2/X-Token) estava falhando
> ("Bad Request"); os itens 1–5 ficam prontos para rodar assim que o acesso de leitura voltar.
>
> **Já pronto nesta data:** `vw_pedido_base` com `curva` (ABC) e `narrativa_venda` (frase pronta
> "Curva A · X% das lojas de {ramo} no {região} compram"). Falta ligar CNAE→ramo, TECA/MOB/Arara,
> imagens e os 40 arquivos — tudo depende do Sankhya voltar.
