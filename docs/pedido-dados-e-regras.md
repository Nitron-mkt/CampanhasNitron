# Dados e regras — Pedido Nitron

Tudo que o app usa para montar e precificar o pedido, e como **regerar** quando a tabela ou o
catálogo mudarem. O documento-mestre da lógica comercial (como as 40 cestas foram construídas,
curva por penetração, CNAE→ramo, TECA/MOB) é o **`LOGICA-NINA.md`** (neste pacote).

---

## 1. Arquivos de dados do app

### `app_data.js` — `window.DATA = { segs, catalogo }`
- **`segs`**: 40 segmentos (Macro-região × Ramo). Cada um:
  `{ reg, sig, ramo, base, itens: [ { cod, ref, desc, linha, emb, preco, fardos, curva, pen, tipo, img } ] }`
  - `emb` = unidades por **fardo** (QTDEMB do Sankhya).
  - `preco` = preço por unidade (**Tabela Padrão PV-0003**, ver §2).
  - `fardos` = quantidade sugerida (mediana histórica de compra do segmento ÷ fardo).
  - `curva` (A/B/C) e `pen` (penetração 0–1) = **só uso interno** (não aparecem para o cliente).
- **`catalogo`**: 639 SKUs vendáveis (os que têm preço na tabela), cada um
  `{ cod, ref, desc, linha, emb, preco, img }`. São as abas de categoria.

### `app_img.js` — `window.IMG = { <codprod>: "data:image/jpeg;base64,..." }`
Miniatura (224px, JPEG q70) de cada produto, **embutida**. 630 de 639 produtos têm foto.
Motivo de estar embutido: ver §4.

---

## 2. Preço — Tabela Padrão PV-0003 (CODTAB 0)

**Decisão:** o preço de venda é a **Tabela Padrão PV-0003**, que no Sankhya é **CODTAB 0**, cheia,
**sem desconto por item**. (A tabela 194 "Gestor Varejo" é essa mesma tabela com −24,73% embutido;
**não** é usada aqui — o desconto do app é por volume, no total, ver §3.)

No Sankhya os preços ficam em **`TGFEXC`** (exceção de preço), chaveados por `NUTAB` (a *versão*
vigente da tabela). A versão vigente da CODTAB 0 muda quando o preço é reajustado.

**SQL para regerar o preço** (rode no conector Sankhya, leitura):
```sql
-- 1) achar a versão (NUTAB) vigente da Tabela Padrão (CODTAB 0):
SELECT NUTAB FROM TGFTAB t
WHERE CODTAB = 0
  AND DTVIGOR = (SELECT MAX(DTVIGOR) FROM TGFTAB WHERE CODTAB = 0);
-- (em 08/10/2026 era NUTAB = 628)

-- 2) puxar o preço de cada produto nessa versão:
SELECT CODPROD, VLRVENDA
FROM TGFEXC
WHERE NUTAB = 628        -- <= troque pelo NUTAB vigente do passo 1
  AND TIPO = 'V'         -- preço fixo (V). 'P' seria percentual.
ORDER BY CODPROD;
```
São ~644 produtos com preço. O app usa **apenas** esses (quem não tem preço na tabela não é mostrado —
não dá para vender sem preço). Esse resultado vira `build/precotab0.json` (`{ "<codprod>": preco }`).

---

## 3. Desconto por volume (no total do pedido)

Aplicado sobre o **subtotal** do pedido, **não** por item:

| Subtotal | Desconto |
|---|---|
| até R$ 5.000 | 0% |
| **acima de R$ 5.000** | **10%** |
| **acima de R$ 15.000** | **15%** |

No app isso está na função `discountRate(sub)` no topo do `order_app.html`:
```js
function discountRate(sub){ if(sub>15000) return .15; if(sub>5000) return .10; return 0; }
```
A barra inferior mostra a chamada *"Compre mais R$ X e ganhe 10% de desconto"* (o X é a diferença
exata até o próximo nível), o subtotal riscado e o total com desconto. Entra também no texto do
WhatsApp e no PDF. **Para mudar as faixas/percentuais, edite só essa função.**

---

## 4. Imagens — por que estão embutidas

As fotos dos produtos ficam em `produto.nitron.com.br/<REFERENCIA com _>-01.jpg` (público, sem login)
e também no SharePoint **Marketing → …/PRODUTOS/Digital_RGB** (mesmo nome de arquivo, mas exige login).

No **Artifact do Claude** a sandbox bloqueava imagem externa de qualquer domínio; por isso as
miniaturas foram **embutidas** no `app_img.js`. **Na versão hospedada isso não é mais necessário** —
a página pode carregar as imagens por URL. Se quiser aliviar o `app_img.js`, dá para trocar o app
para usar as URLs diretas; mas deixar embutido **funciona em qualquer lugar** e não depende do CDN.

**SQL/sem SQL para regerar as fotos:** o mapa `codprod → referência` sai do catálogo
(`build/cods_refs.json`). O script `build/build_images.py` baixa cada `ref` do CDN, gera a miniatura
e escreve o `app_img.js`:
```bash
python build/build_images.py
```
(precisa de Python + Pillow). 9 referências não respondem no CDN e ficam com o código no lugar da
foto — se precisar delas, pegue manualmente no SharePoint Digital_RGB.

---

## 5. Modo cliente × modo interno (ADMIN)

Controlado pelo **hash** da URL (ver `LINKS.md`):
- `#<ID>` → **cliente**: esconde curva, penetração, nome do segmento, base de lojas e tabela de preço.
- `#<ID>~adm` ou `#adm` → **interno**: mostra tudo + seletor dos 40 segmentos.

No código: `var ADMIN = (location.hash||"").toLowerCase().indexOf("adm") >= 0;`

---

## 6. WhatsApp da Nina

Constante no topo do `order_app.html`:
```js
var NINA_WA = "5511960390203";   // +55 11 96039-0203
```
O botão **Enviar para a Nina** abre `wa.me/5511960390203?text=<pedido>` com o pedido já escrito
(produtos, fardos, unidades, subtotal, desconto e total). Para trocar o número, edite essa linha
(só dígitos, com DDI 55).

---

## 7. Como as 40 cestas foram construídas (resumo)

3 anos de venda Nitron (TGFCAB/TGFITE, PJ) agregados por **Macro-região × Ramo**. Por SKU do segmento:
penetração (clientes que compram) + quantidade mediana. Cesta = top-N por frequência (N = P75 de
linhas/pedido do segmento). Em toda cesta entram sementes **TECA/MOB** (linha nova), incluindo a
**Arara**. As cestas vivem no Supabase (`pedido_base`, `pedido_base_item`, view `vw_pedido_base`) —
e foram exportadas para o `app_data.js`. Detalhe completo: **`LOGICA-NINA.md`** (neste pacote).

**Para regenerar o `app_data.js`** a partir das tabelas do Supabase + preço da §2 + QTDEMB do Sankhya,
veja os scripts em `build/` e o passo-a-passo no documento-mestre.

---

## 8. Checklist quando o preço mudar

1. Rodar os 2 SQLs da §2 → atualizar `build/precotab0.json`.
2. Regerar `app_data.js` (preço novo nos itens e no catálogo).
3. (Se mudou catálogo/foto) rodar `build/build_images.py` → novo `app_img.js`.
4. Subir os arquivos de novo (overwrite) — ver `HOSPEDAGEM.md`.
