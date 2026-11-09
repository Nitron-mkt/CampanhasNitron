# Nitron Conecta — formulário de inscrição (spec para o desenvolvedor)

Agenda de **3 dias** (16, 17 e 18/11/2026), **das 9h às 17h**, na Nitron — Rua Uruçuí, 600, Cidade
Aracília, Guarulhos/SP. **15 empresas por dia.**

Ao lado deste arquivo há o **`index.html`**: uma página funcional, pronta para publicar ou para
reestilizar. Pode trocar todo o visual. O que não pode mudar é o contrato abaixo.

---

## 1. Endpoint

```
https://bwbeieumxcuomtrvlqxs.supabase.co/functions/v1/conecta-form
```

Dois cabeçalhos em toda chamada:

```
apikey:        <chave anon pública>
Authorization: Bearer <chave anon pública>
Content-Type:  application/json
```

A chave anon é **pública por desenho** (é a mesma que já está no painel de campanhas) — peça ao
marketing. Ela **não** dá acesso às tabelas de inscrição: as tabelas estão com RLS ligada e sem
policy, e toda a escrita acontece dentro da função, com a chave de serviço, que nunca sai do
servidor. Não existe caminho de escrita direto pelo navegador, e isso é de propósito.

CORS está liberado (`*`), então a página pode ficar em qualquer domínio.

---

## 2. `GET` — o que a página precisa para se desenhar

`GET /conecta-form` (opcional: `?token=<token do convite>`)

```json
{
  "ok": true,
  "titulo": "NITRON CONECTA",
  "texto": "A Reforma Tributária vai impactar…",
  "horario": "Das 9h às 17h",
  "local": "Nitron | Rua Uruçuí, 600 – Cidade Aracília, Guarulhos/SP",
  "vagas_dia": 15,
  "dias": [
    { "data": "2026-11-16", "curto": "16/11", "longo": "16 de novembro",
      "semana": "segunda-feira", "vagas_total": 15, "ocupadas": 3,
      "restantes": 12, "aberta": true }
  ],
  "convite": { "nome": "…", "razao_social": "…", "documento": "…", "representante": "…" }
}
```

**Nada disso fica escrito no HTML.** Data, horário, local, capacidade e o texto da chamada moram em
`campanhas.filtros_padrao` e o gestor muda por UPDATE, sem novo deploy. Se amanhã virar 4 dias ou 20
empresas/dia, a página acompanha sozinha — então percorra o array `dias`, não escreva três cards na
mão.

O campo `texto` vem com `**negrito**` (estilo WhatsApp). Converta escapando antes, como no exemplo.

`convite` só aparece quando a URL traz `?token=…` e o token existe — serve para pré-preencher. Sem
token (ou com token desconhecido) o formulário continua aberto para preenchimento manual: não
bloqueie a página por falta de token.

---

## 3. `POST` — gravar a inscrição

```jsonc
{
  "token": null,                       // ou o token do convite, quando veio pela URL
  "publico": "cliente",                // "cliente" ou "rep"
  "nome": "Fulano de Tal",             // Contato Principal — obrigatório
  "fone": "(11) 99999-9999",           // WhatsApp — obrigatório
  "email": "fulano@empresa.com.br",
  "documento": "00.000.000/0000-00",   // CNPJ — obrigatório (aceita CPF de 11 dígitos)
  "razao_social": "EMPRESA LTDA",
  "representante": "EDSON",            // nome do representante Nitron
  "pessoas": 3,                        // TOTAL, incluindo o contato principal
  "acompanhantes": ["João", "Maria"],  // primeiro nome de cada acompanhante
  "data_escolhida": "2026-11-17",      // tem de ser uma das datas do GET
  "observacao": "",
  "origem": "form"
}
```

Resposta de sucesso:

```json
{ "ok": true, "id": 42, "atualizado": false, "dia": "2026-11-17", "restantes": 11, "dias": [ … ] }
```

Resposta de recusa — **e aqui está a parte que mais dá errado:**

```json
{ "ok": false, "erro": "dia lotado", "campo": "data_escolhida", "restantes": 0, "dias": [ … ] }
```

> **Erro volta como HTTP 200 com `ok:false`.** Trate sempre pelo corpo, nunca pelo status. É de
> propósito: muito cliente HTTP descarta o corpo quando o status não é 2xx, e o usuário veria
> "status 409" no lugar de "esse dia lotou, escolha outro" — justamente a informação que ele precisa.

`campo` diz qual input marcar: `nome`, `fone`, `documento`, `pessoas`, `data_escolhida`.

Tanto o sucesso quanto a recusa trazem **`dias` atualizado**. Use para redesenhar a agenda sem um
segundo pedido: alguém pode ter pego a última vaga enquanto a pessoa preenchia.

---

## 4. As quatro regras que não são detalhe de implementação

**1. O limite de 15 é garantido pelo banco, não pela tela.**
A página mostra `restantes` e desabilita o dia lotado — isso é conforto, não controle. Quem conta as
vagas e grava a inscrição é uma função no banco, **na mesma transação**, com trava por dia
(`pg_advisory_xact_lock`). Dois cliques simultâneos na última vaga não fecham o dia com 16. Não
reimplemente a contagem no front e não faça `INSERT` por outro caminho.

**2. "15 empresas" conta por CNPJ, não por inscrição.**
A mesma empresa preenchendo de novo **atualiza** a inscrição dela (`atualizado: true`) em vez de
ocupar uma segunda vaga. É assim que a pessoa corrige o número de convidados sem ligar para ninguém.
Então: não trave o reenvio, e na tela de sucesso diga que basta preencher de novo com o mesmo CNPJ
para mudar algo.

**3. O número de participantes é contado pelos NOMES.**
Um campo "quantas pessoas" separado da lista de nomes sempre acaba discordando dela — "5 pessoas" e
dois nomes. Esse número vira almoço e coffee break encomendados, então a lista de nomes é a fonte, e
o total aparece derivado dela (`pessoas = acompanhantes + 1`). Se for mudar o visual, mantenha isso.

**4. A página precisa funcionar no celular.**
Quase todo mundo vai abrir por um link de WhatsApp. O `index.html` já está responsivo; mantenha.

---

## 5. Onde as respostas aparecem

Tabela `conecta_inscricao`, e a visão `conecta_inscricao_painel` junta a inscrição com os dados do
convite (representante, cidade, UF, distância). A ocupação por dia está em `conecta_vagas`.

Nada disso é legível pela anon key — é para o painel interno e para consulta no banco.

---

## 6. Para testar

Antes de publicar, confira estes cinco casos (todos já passaram no endpoint em 09/11):

| caso | esperado |
|---|---|
| `GET` sem token | 3 dias, 15 vagas cada |
| `POST` válido | `ok:true`, `restantes` cai 1 |
| mesmo CNPJ, mesmo dia | `ok:true, atualizado:true`, `restantes` **não** cai |
| CNPJ com 3 dígitos | `ok:false, campo:"documento"` |
| dia cheio | `ok:false, erro:"dia lotado"`, e `dias` mostra `aberta:false` |
