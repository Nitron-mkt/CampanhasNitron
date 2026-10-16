# -*- coding: utf-8 -*-
# Segundo toque nos 11 de 15/10 — ordem do gestor em 16/10: "tente os convencer que eles podem
# comprar direto pelo link e mande o link novamente".
#
# Tres coisas mudaram desde ontem e justificam a segunda mensagem (segundo toque sem motivo e
# chateacao; com motivo e atendimento):
#   1. o endereco do link mudou (o Worker foi renomeado) — o de ontem esta 404
#   2. a pagina so virou celular de verdade hoje (faltava o meta viewport)
#   3. o angulo e outro: ontem era "montei uma lista pra voce"; hoje e "da pra comprar por aqui"
#
# Regras que valem (licao 280 + CLAUDE.md):
#   - diz o minimo de R$ 2.500 e que a lista e a media do ramo
#   - NAO promete prazo, pagamento nem frete — isso e de quem fecha
#   - NAO diz que e checkout: o cliente monta e ENVIA; a Camyla fecha. Vender nao e mentir.
#   - sem CNPJ na mensagem ao cliente
import io, json

L = "https://pedido-nitron.marketing-da5.workers.dev/#"

def msg(nome, gancho, seg, fecho=""):
    return (
      u"Oi " + nome + u", é a Nina de novo, da Nitron.\n\n"
      u"Voltei por dois motivos. O primeiro: o link que te mandei ontem mudou de endereço, então se "
      u"você chegou a tocar nele e não abriu, era isso — o certo é este:\n"
      + L + seg + u"\n\n"
      u"O segundo é o que ele faz, que eu acho que não ficou claro ontem. *Você monta e manda o "
      u"pedido por ali mesmo* — sem catálogo em PDF, sem esperar vendedor passar na loja, sem ficar "
      u"pedindo foto e preço de item em item. " + gancho + u"\n\n"
      u"Abre no celular, já vem com a lista pronta, você mexe no + e no −, tira o que não serve e "
      u"toca em *Enviar*. O pedido chega aqui inteirinho e a Camyla, do nosso comercial, te procura "
      u"para fechar prazo, forma de pagamento e frete — isso não dá para fazer sozinho pelo link.\n\n"
      u"*Pedido mínimo de R$ 2.500*, que é o mínimo de fábrica para faturar. E a lista que aparece "
      u"não foi escolhida produto a produto para você: é a *média de compra das lojas do mesmo ramo* "
      u"do seu CNPJ, para você não começar do zero. Tire e mude o que quiser."
      + (u"\n\n" + fecho if fecho else u""))

M = [
 (387, "znvsSm2c0jIWz5nRdYTI", "Agrocamp / Rinaldo", "Sudeste-R01",
  msg(u"Rinaldo",
      u"Como eu te falei, garrafa térmica a gente não tem — mas se o mix de casa servir para a "
      u"Agrocamp, dá para você ver tudo com preço de fábrica e decidir em dois minutos.",
      "Sudeste-R01",
      u"E se não for o seu caso mesmo, me diz que eu paro de te procurar — sem problema nenhum.")),

 (378, "dtMWWpo9KGx5ctvZVkpw", "Rubia / Cotia-SP", "Sudeste-R01",
  msg(u"Rubia",
      u"Os potes e a organização que você queria estão lá, com o preço por peça e quantos vêm no fardo.",
      "Sudeste-R01")),

 (372, "jELw9usNthmm7KGYAvxD", "Nathalia / Sta Maria de Jetiba-ES", "Sudeste-R01",
  msg(u"Nathalia",
      u"Para quem está abrindo loja isso ajuda bastante: dá para ver o mix inteiro de uma vez e "
      u"montar o primeiro pedido sem depender de ninguém.",
      "Sudeste-R01")),

 (362, "lrekmcjx7JW6jyz04hCA", "LAR UNNA / Laura", "Nordeste-R01",
  msg(u"Laura",
      u"É a parte de utilidades do lar da LAR UNNA — direto de fábrica, que é o que vocês queriam "
      u"em vez de distribuidor.",
      "Nordeste-R01")),

 (333, "FYHgDyybsSnLVHTqBMql", "Extrema Utilidades / Edimilson", "Sudeste-R02",
  msg(u"Edimilson",
      u"É o mix completo que você me pediu — potes, organização, cozinha, lixeiras e banheiro — "
      u"numa tela só.",
      "Sudeste-R02")),

 (446, "OEb9zGTwBGUxvyDassCA", "Gislene / Santo Andre-SP", "Sudeste-R01",
  msg(u"Gislene",
      u"Para quem vende no Mercado Livre isso resolve: você vê o preço de fábrica por peça e já "
      u"calcula a sua margem antes de comprar.",
      "Sudeste-R01")),

 (443, "6OwmqOx9VFllr5HTIPkO", "Orineide / Cidade Ocidental-GO", "Centro-Oeste-R04",
  msg(u"Orineide",
      u"É a lista que os mercados levam da gente — produto de giro, que o cliente põe no carrinho "
      u"junto com a compra do mês.",
      "Centro-Oeste-R04")),

 (439, "jSmF8PTuTMgHHaJFv6CG", "Shopping das Frutas / Gamaliel", "Nordeste-R04",
  msg(u"Gamaliel",
      u"Com 5 lojas vale muito a pena olhar: a gente é fábrica, não distribuidor, e é daí que sai a "
      u"diferença de preço que você sentiu no fornecedor de hoje.",
      "Nordeste-R04")),

 (347, "npWj5oGdUTJGq0x679Bx", "Claudio / Jundiai-SP", "Sudeste-R01",
  msg(u"Claudio",
      u"As frasqueiras que você perguntou estão lá dentro — a gente tem 23 modelos.",
      "Sudeste-R01")),

 (343, "Fh668y3qtOcXQ9jTXTBb", "Daniel Balido / preco unico", "Sul-R01",
  msg(u"Daniel",
      u"Para loja de preço único é a ferramenta certa: dá para ver o preço de cada item na peça e "
      u"escolher só o que fecha nos R$ 12.",
      "Sul-R01",
      u"E ficou aquela dúvida da nossa conversa: a loja vai ser em Juquiá ou em Curitiba?")),

 (325, "zBlXxU3HqfmqMNUJMCw1", "A. Barboza / Erika - Londrina-PR", "Sul-R01",
  msg(u"Erika",
      u"Dá para comparar item a item com o que você paga hoje na Plasvale, sem precisar pedir "
      u"orçamento para ninguém.",
      "Sul-R01")),
]

out=[{"canal":"whatsapp","contact_id":c,"instancia":"Nina","texto":t,"_id":i,"_rot":r,"_seg":s}
     for (i,c,r,s,t) in M]
io.open("/tmp/claude-0/-home-user-CampanhasNitron/fcb4233f-1999-5b5f-af2a-111d7f46b9a6/scratchpad/fup2.json","w",encoding="utf-8").write(json.dumps(out,ensure_ascii=False,indent=1))
print("%d mensagens"%len(out))
for o in out: print("  #%-4s %-36s %-18s %4d chars"%(o["_id"],o["_rot"],o["_seg"],len(o["texto"])))
