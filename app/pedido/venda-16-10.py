# -*- coding: utf-8 -*-
# Primeiro toque COM o link, em 10 leads parados — ordem do gestor em 16/10: "selecione mais
# algumas pessoas para testar, mas tem que tentar vender e eles fazerem o pedido por la".
#
# Diferenca para o followup2: estes nunca receberam o link. Entao a mensagem nao pede desculpa por
# endereco trocado — ela VENDE o que a pagina faz, e so.
#
# Quem ficou de fora, e por que (a conferencia vale mais que o numero de disparos):
#   #334 Utimixhome10 e #110 Loja E 10 — contato com dono VALERIA, que saiu do rodizio. Contato de
#        CLIENTE nao tem troca de dono (CLAUDE.md), entao o Zaptos da Nina seria recusado.
#   #422 Cfbazar — dono MONICA, ativa. Humano na conversa: a Nina nao atropela (licao do Lr Shop).
#   #410 Beevia — quer mesa posta (jogo americano, sousplat, guardanapo). Conferido no Sankhya:
#        ZERO produtos assim em 4.396 cadastrados. Mandar link seria repetir o erro do Rinaldo.
#
# Regras: minimo de R$ 2.500 e "media do ramo" obrigatorios (licao 280); nada de prazo, pagamento
# ou frete prometido; sem CNPJ na mensagem ao cliente.
import io, json

L = "https://pedido-nitron.marketing-da5.workers.dev/#"

def msg(nome, abre, porque, seg, lojas, fecho=u""):
    return (
      u"Oi " + nome + u", aqui é a Nina, da Nitron. " + abre + u"\n\n"
      u"Montei uma coisa que acho que vai te servir melhor do que ficar trocando mensagem comigo: "
      u"*uma página onde você monta e manda o pedido sozinho*, direto de fábrica.\n"
      + L + seg + u"\n\n"
      u"Abre no celular. " + porque + u" Cada produto tem foto, o preço por peça e quantos vêm no "
      u"fardo. Você mexe no *+* e no *−*, tira o que não serve, e no fim toca em *Enviar*. O pedido "
      u"chega aqui montado e a Camyla, do nosso comercial, te procura para fechar prazo, forma de "
      u"pagamento e frete.\n\n"
      u"*Pedido mínimo de R$ 2.500*, que é o mínimo de fábrica para faturar. E a lista que você vai "
      u"ver não foi escolhida produto a produto para a sua loja: é a *média de compra de " + lojas +
      u" lojas do mesmo ramo* do seu CNPJ, para você não começar de uma tela em branco."
      + ((u"\n\n" + fecho) if fecho else u""))

M = [
 (454, "mzknTQ3hNeexQpT7T5nM", "Centralmix / Samuel - Goiania-GO", "Centro-Oeste-R01",
  msg(u"Samuel", u"Você falou comigo sobre utilidades para a Centralmix e eu não voltei — desculpa.",
      u"Já vem com a lista de utilidades para casa montada, não de cama e mesa.", "Centro-Oeste-R01", u"162",
      u"Para quem vende por TikTok isso ajuda: dá para ver o preço de fábrica por peça e calcular a sua margem antes de comprar qualquer coisa.")),

 (437, "1HJWCrlwIp44yWlnkeKf", "Madeplan / Juliana - Londrina-PR", "Sul-R01",
  msg(u"Juliana", u"Desculpa a demora em te dar retorno sobre a Madeplan.",
      u"Separei a parte de utilidades domésticas, que é onde a gente entra na sua loja.", "Sul-R01", u"209")),

 (415, "zcYdTeRFvRZK1ZVLPlZ7", "Mix Variedades / Ellen - Icapui-CE", "Nordeste-R01",
  msg(u"Ellen", u"Desculpa o sumiço depois da nossa conversa.",
      u"Os organizadores e os porta-escovas que você queria estão lá dentro.", "Nordeste-R01", u"262",
      u"Como seria a sua primeira compra direto de fábrica, qualquer dúvida me chama que eu te explico — não tem pegadinha nenhuma.")),

 (427, "dwj0qtkfJnZkQooNkfuw", "Magazine Karina / Valdimiro - MA", "Nordeste-R02",
  msg(u"Valdimiro", u"Desculpa a demora. Como a loja ia inaugurar, imagino que esteja corrido aí.",
      u"É a lista mais larga que a gente tem para magazine — cozinha, potes, organização, banheiro e lixeiras.", "Nordeste-R02", u"200",
      u"Para montar loja nova isso costuma economizar bastante tempo: você vê o mix inteiro de uma vez em vez de pedir item por item.")),

 (239, "y0dmKNJnCbJc89Hdgo6b", "Alex Fernandes / Sao Paulo-SP", "Sudeste-R01",
  msg(u"Alex", u"Você tinha me pedido a tabela de preços e eu demorei — desculpa.",
      u"A página é a tabela: preço de fábrica em cada produto, na peça.", "Sudeste-R01", u"871",
      u"Para loja multinicho vale olhar as categorias lá em cima, que tem bem mais do que a lista inicial mostra.")),

 (397, "BgrmUsLhaxMyaPqHYk35", "Marcilio (atacadista) - Santa Luzia-MG", "Sudeste-R01",
  msg(u"Marcílio", u"Desculpa a demora em voltar.",
      u"As vasilhas e as utilidades de plástico que você revende estão aí.", "Sudeste-R01", u"871",
      u"Sei que para atacadista a lista inicial é pequena — ela é feita para loja de varejo. Monte pelo volume que faz sentido para você e me diga; se precisar de condição de atacado, a Camyla trata isso com você.")),

 (304, "koJLNow6s2AvFGREbAso", "Maria Socorro / S J Rio Preto-SP", "Sudeste-R01",
  msg(u"Maria Socorro", u"Desculpa a demora em te dar retorno.",
      u"Para loja de preço único é bem prático: dá para ver quanto custa cada item na peça e escolher só o que fecha nos R$ 10.", "Sudeste-R01", u"871")),

 (297, "BwOwwy1PU7ZmYPJzYBMs", "ManuStore / Santo Andre-SP", "Sudeste-R01",
  msg(u"Flávia", u"Desculpa a demora em voltar com você sobre a ManuStore.",
      u"É a lista de utilidades para casa, que é o que você me disse que procura.", "Sudeste-R01", u"871")),

 (301, "iboSpMqr92320tAKriNs", "Tudo de Casa / Angical do Piaui-PI", "Nordeste-R01",
  msg(u"Felipe", u"Desculpa a demora em te responder.",
      u"É a lista de utilidades que as lojas do Nordeste mais levam da gente — e dá para filtrar por preço de peça, que é o que importa em loja de preço único.", "Nordeste-R01", u"262")),

 (157, "nEm8dZMJGVGyJPYyoHOZ", "Mayke Suehiro / Wanderlandia-TO", "Norte-R01",
  msg(u"Mayke", u"Desculpa o tempo que levei para voltar.",
      u"É o mix de utilidades que as lojas do Norte mais compram da gente.", "Norte-R01", u"57",
      u"Brinquedo a gente não faz — a nossa parte é plástico para casa. Se o mix te servir, o resto é com você.")),
]

out=[{"canal":"whatsapp","contact_id":c,"instancia":"Nina","texto":t,"_id":i,"_rot":r,"_seg":s}
     for (i,c,r,s,t) in M]
io.open("/tmp/claude-0/-home-user-CampanhasNitron/fcb4233f-1999-5b5f-af2a-111d7f46b9a6/scratchpad/venda.json","w",encoding="utf-8").write(json.dumps(out,ensure_ascii=False,indent=1))
print("%d mensagens"%len(out))
for o in out: print("  #%-4s %-36s %-18s %4d chars"%(o["_id"],o["_rot"],o["_seg"],len(o["texto"])))
