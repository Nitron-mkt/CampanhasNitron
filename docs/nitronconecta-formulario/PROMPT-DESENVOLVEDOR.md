# Briefing — página de inscrição do NITRON CONECTA

> Para passar ao desenvolvedor. Está escrito para ser lido direto, sem contexto prévio do projeto.
> Se ele usar uma IA para gerar o código, pode colar este texto inteiro como prompt.

## O que é

Uma página única, pública, que recebe inscrições para um evento presencial na fábrica da Nitron.
O convite chega por WhatsApp e por e-mail com o link dela. Quase todo mundo vai abrir pelo celular.

A página tem duas partes: a chamada do evento (texto abaixo) e o formulário de inscrição, que inclui
escolher **um** dos três dias disponíveis.

**Não é para escrever nada "chumbado" na página.** Datas, horário, local, número de vagas por dia e o
próprio texto da chamada vêm prontos de uma API (detalhe mais abaixo). Isso é de propósito: a Nitron
muda qualquer um deles sem precisar de um novo deploy.

## O texto da chamada (a API devolve ele; use como está)

```
🚨 FALTAM 7 DIAS PARA O NITRON CONECTA!

A Reforma Tributária vai impactar o mercado de utilidades domésticas. Sua empresa está preparada?

A Nitron está reunindo seus principais parceiros para uma conversa exclusiva sobre desafios,
mudanças e soluções para o nosso setor.

🔥 Apenas 15 convidados por dia!

📅 16, 17 ou 18 de novembro
⏰ Das 9h às 17h
📍 Nitron | Rua Uruçuí, 600 – Cidade Aracília, Guarulhos/SP

⚠️ Não deixe sua inscrição para a última hora!
```

O campo `texto` vem com `**negrito**` (estilo WhatsApp/markdown). Converta para `<b>`, escapando o
HTML antes. A contagem regressiva ("FALTAM N DIAS") deve ser **calculada** a partir da primeira data,
não escrita fixa — senão daqui a três dias a página mente.

## Os campos do formulário

| campo | obrigatório | observação |
|---|---|---|
| Contato principal (nome) | sim | |
| WhatsApp | sim | máscara `(11) 99999-9999`, aceitar 10 ou 11 dígitos |
| E-mail | não | validar formato se preenchido |
| CNPJ | sim | máscara, aceitar também CPF de 11 dígitos (há cliente pessoa física) |
| Razão social | sim | |
| Nome do representante Nitron | não | muitos não lembram; deixe opcional |
| Quem vem junto | — | ver abaixo |
| Dia escolhido | sim | um dos três, só entre os que ainda têm vaga |
| Observação / assunto que quer tratar | não | campo livre |

### "Quantas pessoas vêm" — leia esta parte com atenção

A Nitron precisa do número exato de convidados para encomendar almoço e coffee break, **e do primeiro
nome de cada um**.

**Não faça um campo numérico separado da lista de nomes.** Campo "quantas pessoas" independente dos
nomes sempre acaba discordando deles — a pessoa escreve 5 e lista 2 — e aí a comida é encomendada
errado. O certo: a pessoa **adiciona os nomes de quem vem com ela** (botão "+ adicionar pessoa") e o
total aparece sozinho, derivado da lista:

> 👥 **3 pessoas** da sua empresa: Fernando, Ana, Bruno

O contato principal conta como a primeira pessoa. Então `pessoas = acompanhantes + 1`.

Rótulo sugerido para a seção: *"Quem vem com você? O almoço e o coffee break são reservados por
pessoa, então precisamos do nome de cada convidado da sua empresa. Se vier só você, deixe a lista
vazia."*

### Os três dias e as vagas

16, 17 e 18 de novembro, **15 empresas por dia**. A API devolve, para cada dia, quantas vagas restam
e se ele ainda está aberto. Mostre os três como cartões clicáveis:

- dia aberto → clicável, com "12 vagas" (ou "última vaga" quando restar 1)
- dia lotado → desabilitado, com "esgotado", em vermelho
- poucas vagas (3 ou menos) → destaque em laranja

**O limite de 15 é garantido pelo servidor, não pela tela.** A tela mostrar vaga é conforto; quem
conta e grava é o banco, dentro da mesma transação, com trava por dia. Então **não reimplemente a
contagem no front** e não tente "reservar" vaga no navegador. Pode acontecer de a pessoa escolher o
dia 17, demorar preenchendo, e o 17 lotar nesse meio-tempo — a resposta do `POST` diz isso e já traz
a contagem nova; nesse caso avise e peça para escolher outro dia (ver abaixo).

## A API

Endpoint único:

```
https://bwbeieumxcuomtrvlqxs.supabase.co/functions/v1/conecta-form
```

Dois cabeçalhos em toda chamada:

```
apikey:        <chave pública>
Authorization: Bearer <chave pública>
Content-Type:  application/json
```

A chave é **pública por desenho** (é a mesma que já roda no painel interno da Nitron) — peça ao
marketing. Ela não dá acesso às tabelas de inscrição: as tabelas estão fechadas e toda escrita
acontece dentro da função, com uma credencial que nunca sai do servidor. **Não existe caminho de
escrita direto do navegador, e isso é intencional** — não tente criar um. CORS está liberado, então a
página pode ficar em qualquer domínio.

### `GET /conecta-form` — o que desenhar

Opcionalmente `?token=<token>`, quando o link do convite for pessoal (pré-preenche nome, razão social,
CNPJ e representante). Sem token, ou com token desconhecido, **o formulário continua aberto para
preenchimento manual** — não bloqueie a página por falta de token.

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

Percorra o array `dias`. Se amanhã virar quatro dias, ou 20 empresas por dia, a página tem de
acompanhar sozinha — então nada de três cartões escritos na mão.

### `POST /conecta-form` — gravar

```jsonc
{
  "token": null,                       // ou o token, quando veio na URL
  "nome": "Fulano de Tal",             // contato principal
  "fone": "(11) 99999-9999",           // WhatsApp
  "email": "fulano@empresa.com.br",
  "documento": "00.000.000/0000-00",   // CNPJ
  "razao_social": "EMPRESA LTDA",
  "representante": "EDSON",
  "pessoas": 3,                        // TOTAL, incluindo o contato principal
  "acompanhantes": ["Ana", "Bruno"],   // primeiro nome de cada acompanhante
  "data_escolhida": "2026-11-17",      // uma das datas do GET
  "observacao": "",
  "origem": "form"
}
```

Sucesso:

```json
{ "ok": true, "id": 42, "atualizado": false, "dia": "2026-11-17", "restantes": 11, "dias": [ … ] }
```

Recusa:

```json
{ "ok": false, "erro": "dia lotado", "campo": "data_escolhida", "restantes": 0, "dias": [ … ] }
```

> ⚠️ **Erro vem como HTTP 200 com `ok:false`. Trate sempre pelo corpo, nunca pelo status.**
> É proposital: muito cliente HTTP descarta o corpo quando o status não é 2xx, e o usuário veria
> "erro 409" no lugar de "esse dia lotou, escolha outro" — que é justamente a informação que ele
> precisa. `campo` diz qual input marcar (`nome`, `fone`, `documento`, `pessoas`, `data_escolhida`).

Tanto o sucesso quanto a recusa trazem **`dias` atualizado**. Use para redesenhar os cartões de dia
sem fazer um segundo pedido.

### Reenvio é esperado, não é erro

A contagem de "15 empresas" é **por CNPJ**. Se a mesma empresa preencher de novo, a inscrição dela é
**atualizada** (`"atualizado": true`) em vez de ocupar uma segunda vaga. É assim que a pessoa corrige
o número de convidados sem ligar para ninguém. Então: não bloqueie o reenvio, e na tela de sucesso
diga que basta preencher de novo com o mesmo CNPJ para mudar algo.

## O que entregar

- Uma página responsiva (celular em primeiro lugar), hospedada onde for mais prático.
- O endereço final dela, para a Nitron cadastrar no painel — é esse link que vai nas mensagens.
- Visual livre. Pode usar a identidade da Nitron; o importante é a página carregar rápido e o
  formulário ser curto.

Existe uma **implementação de referência funcional** (`index.html`, nesta mesma pasta): pode usar como
ponto de partida, reestilizar inteira, ou ignorar e escrever do zero. O que não muda é o contrato
acima.

## Resumo do que não pode mudar

1. Datas, horário, local, vagas e texto vêm do `GET` — nada escrito fixo na página.
2. O limite de 15/dia é do servidor. A tela mostra, não controla.
3. Contagem de pessoas sai dos **nomes**, não de um campo numérico separado.
4. Erro é lido do **corpo** (`ok:false`), não do status HTTP.
5. Reenvio com o mesmo CNPJ **atualiza**, não duplica.
6. Celular em primeiro lugar.
