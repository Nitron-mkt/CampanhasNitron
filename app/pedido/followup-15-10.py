# -*- coding: utf-8 -*-
# Follow-up de 15/10 — dois grupos:
#   A) lead repassado ha 8-10 dias que nao fechou (o "esquecido")
#   B) lead que veio da campanha, respondeu e nunca foi procurado de novo
# Regra: nada de CNPJ na mensagem AO CLIENTE; nada de prazo, pagamento ou frete prometido;
# nenhuma promessa de horario ("ainda hoje") — licao de 17/09.
import io, json

L = "https://bitter-math-090f.marketing-da5.workers.dev/#"
RODA = ("Prazo de entrega, condição de pagamento e frete quem combina com você é a Camyla, "
        "do nosso comercial — eu só organizo o pedido pra chegar certo nela.")
COMO = ("No link você vê cada produto com foto, quantos vêm no fardo e o preço de fábrica. "
        "Use o + e o − pra mudar a quantidade, tire o que não quiser, e no fim toque no botão verde "
        "*Enviar*. O pedido chega aqui pra gente já montado.")

M = []  # (lead_id, contact_id, rotulo, texto)

# ---------------- GRUPO A — repassados e parados ----------------

M.append((387, "znvsSm2c0jIWz5nRdYTI", "Agrocamp / Rinaldo", 
u"""Oi Rinaldo, aqui é a Nina, da Nitron.

Desculpa a demora em te dar retorno. No dia 07/10 eu passei seu contato para o Mauro, nosso representante da sua região — e queria saber de você: ele chegou a falar contigo?

Preciso te falar uma coisa com franqueza, porque descobri conferindo aqui: *garrafa térmica não faz parte da nossa linha*. A Nitron é de plástico para casa — potes e mantimentos, utensílios de cozinha, organização, lixeiras, banheiro. Preferi te dizer isso agora do que te deixar esperando por uma coisa que a gente não tem.

Se esse mix te interessar para a loja, montei uma lista pronta com o que as lojas do seu perfil mais compram:
""" + L + u"""Sudeste-R01

""" + COMO + u"""

""" + RODA + u"""

E se for só térmica mesmo que você procura, me diz que eu te tiro da lista pra não ficar te incomodando."""))

M.append((378, "dtMWWpo9KGx5ctvZVkpw", "Rubia / Cotia-SP",
u"""Oi Rubia, aqui é a Nina, da Nitron.

Desculpa a demora. No dia 06/10 eu passei seu contato para o Adão, nosso representante da região de Cotia — ele chegou a falar com você?

De qualquer jeito não quero te deixar parada. Você me disse que queria começar por potes e organização, então separei uma lista pronta com o que as lojas de variedades do interior de SP mais compram da gente — tem 42 itens, a maioria de cozinha, potes e organização:
""" + L + u"""Sudeste-R01

""" + COMO + u"""

""" + RODA))

M.append((372, "jELw9usNthmm7KGYAvxD", "Nathalia Queiroz / Sta Maria de Jetiba-ES",
u"""Oi Nathalia, aqui é a Nina, da Nitron.

Desculpa a demora em te dar retorno. No dia 06/10 passei seu contato para o Carlos Eduardo, nosso representante do Espírito Santo — ele chegou a te procurar?

Como você está abrindo a loja agora, montei uma lista que ajuda a começar: é o mix que as lojas de variedades e utilidades do Sudeste mais compram da gente — cozinha, potes, organização, lixeiras e banheiro.
""" + L + u"""Sudeste-R01

""" + COMO + u"""

""" + RODA + u"""

Loja nova é decisão atrás de decisão — se quiser, me diz o tamanho da loja que eu te ajudo a enxugar a lista."""))

M.append((362, "lrekmcjx7JW6jyz04hCA", "LAR UNNA / Laura Nobre",
u"""Oi Laura, aqui é a Nina, da Nitron.

Desculpa a demora. No dia 05/10 eu passei o contato da LAR UNNA para o Adilson, nosso representante da Bahia — ele chegou a falar com você?

Você me disse que trabalham com material de construção e utilidades do lar, e que hoje compram de distribuidor. A nossa parte é a de utilidades: separei a lista com o que as lojas do Nordeste mais compram da gente — cozinha, potes, banheiro e organização, 55 itens.
""" + L + u"""Nordeste-R01

""" + COMO + u"""

""" + RODA))

M.append((333, "FYHgDyybsSnLVHTqBMql", "Extrema Utilidades / Edimilson",
u"""Oi Edimilson, aqui é a Nina, da Nitron.

Desculpa a demora em voltar. No dia 05/10 eu passei o contato da Extrema Utilidades para o José Fernando, nosso representante da sua região — ele chegou a falar com você?

Você falou em mix completo: potes, organização, cozinha, lixeiras e banheiro. Então separei a lista mais larga que a gente tem para loja de magazine no Sudeste — 54 itens, exatamente nessas linhas:
""" + L + u"""Sudeste-R02

""" + COMO + u"""

""" + RODA))

# ---------------- GRUPO B — vieram da campanha e ninguém voltou ----------------

M.append((446, "OEb9zGTwBGUxvyDassCA", "Gislene / Santo Andre-SP",
u"""Oi Gislene, aqui é a Nina, da Nitron.

A gente conversou no dia 13 e eu acabei não voltando — desculpa. Você me contou que revende utilidades pelo Mercado Livre e por grupos, e que queria potes, organizadores e cozinha.

É exatamente o que a gente faz. Montei a lista com o que as lojas do seu perfil em SP mais compram da gente:
""" + L + u"""Sudeste-R01

""" + COMO + u"""

""" + RODA + u"""

Só pra te adiantar: o pedido mínimo de fábrica é de R$ 2.500."""))

M.append((443, "6OwmqOx9VFllr5HTIPkO", "Orineide / Cidade Ocidental-GO",
u"""Oi Orineide, aqui é a Nina, da Nitron.

A gente começou a conversar no dia 13 e eu não voltei — desculpa. Você me disse que tem mercado em Cidade Ocidental.

Pra mercado a gente tem uma lista própria: é o que os mercados do Centro-Oeste mais levam da Nitron — potes e mantimentos, utensílios de cozinha, organização e banheiro, 56 itens. Produto de giro, aquele que o cliente leva junto com a compra do mês:
""" + L + u"""Centro-Oeste-R04

""" + COMO + u"""

""" + RODA + u"""

O pedido mínimo de fábrica é de R$ 2.500."""))

M.append((439, "jSmF8PTuTMgHHaJFv6CG", "Shopping das Frutas / Gamaliel",
u"""Oi Gamaliel, aqui é a Nina, da Nitron.

A gente conversou no dia 13 e eu acabei não voltando — desculpa. Você me contou das 5 lojas em Campina Grande e que queria ampliar o mix de utilidades além dos temperos.

Com 5 lojas o seu caso é de volume, então separei a lista mais completa que a gente tem para mercearia no Nordeste — 56 itens: potes e mantimentos, cozinha, banheiro e organização:
""" + L + u"""Nordeste-R04

""" + COMO + u"""

""" + RODA + u"""

Uma coisa que vale você saber: a gente é fábrica, não distribuidor. É por aí que o preço do seu fornecedor atual deve cair."""))

M.append((347, "npWj5oGdUTJGq0x679Bx", "Claudio / Jundiai-SP",
u"""Oi Claudio, aqui é a Nina, da Nitron.

A gente conversou no dia 06 sobre a loja de utilidades em Jundiaí e eu acabei não voltando — desculpa pela demora.

Você tinha perguntado de frasqueira. A gente tem 23 modelos, e elas estão dentro da lista que eu montei pra você junto com o resto do mix que as lojas de utilidades de SP mais compram:
""" + L + u"""Sudeste-R01

""" + COMO + u"""

""" + RODA))

M.append((343, "Fh668y3qtOcXQ9jTXTBb", "Daniel Balido / preco unico",
u"""Oi Daniel, aqui é a Nina, da Nitron.

A gente conversou no dia 05 sobre a loja de preço único a R$ 12 e eu não voltei depois — desculpa.

Loja de preço único vive de item que cabe no preço e gira rápido. Montei a lista do Sul com 56 itens — cozinha, organização, banheiro e potes — e no link dá pra ver o preço de cada um na peça, que é o que importa pra você fechar os R$ 12:
""" + L + u"""Sul-R01

""" + COMO + u"""

""" + RODA + u"""

Uma dúvida que ficou da nossa conversa: a loja vai ser em Juquiá ou em Curitiba? É isso que define quem te atende aqui."""))

M.append((325, "zBlXxU3HqfmqMNUJMCw1", "A. Barboza Alvares / Erika - Londrina-PR",
u"""Oi Erika, aqui é a Nina, da Nitron.

A gente conversou no dia 05 sobre o bazar e papelaria em Londrina e eu acabei não voltando — desculpa.

Você me disse que hoje compra plástico da Plasvale e que queria organização e potes. A gente é fábrica da mesma prateleira: separei a lista com 56 itens de cozinha, organização, banheiro e potes, que é o que as lojas do Sul mais compram da gente:
""" + L + u"""Sul-R01

""" + COMO + u"""

""" + RODA))

out = [{"canal": "whatsapp", "contact_id": c, "instancia": "Nina", "texto": t, "_id": i, "_rot": r}
       for (i, c, r, t) in M]
io.open("fup.json", "w", encoding="utf-8").write(json.dumps(out, ensure_ascii=False, indent=1))
print("%d mensagens" % len(out))
for o in out:
    print("  #%-4s %-42s %4d chars" % (o["_id"], o["_rot"], len(o["texto"])))
