# -*- coding: utf-8 -*-
# A NINA ASSUME. Ordem do gestor em 16/10, depois do caso do Alex Fernandes: lead que esperou tempo
# demais pelo representante passa a ser atendido pela Nina direto, sem repassar para ninguem.
#
# Criterio desta primeira leva (o mais indefensavel de todos, por isso comeca por ele):
#   repassado a REPRESENTANTE ha 21+ dias, quente, com CNPJ, e NUNCA perguntado nada.
#   Sao 9; o #71 (Dona Antoninha) ficou de fora porque o contato e da Monica no CRM — humano na
#   conversa, a Nina nao atropela.
#
# O que a mensagem tem de fazer:
#   - dizer o numero de dias, calculado, nunca "um tempinho" (licao de 16/09)
#   - assumir sem culpar o representante pelo nome: o cliente nao tem nada com a nossa cozinha
#   - puxar para a pagina, com o minimo de R$ 2.500 e a media do ramo (licao 280)
#   - sobre desconto: PODE haver condicao melhor no fechamento, SEM numero e SEM promessa.
#     Quem fecha preco nao e a Nina — isso nao mudou.
import io, json
L = "https://pedido-nitron.marketing-da5.workers.dev/#"

def msg(nome, dias, loja_frase, seg, lojas):
    saud = (u"Oi " + nome + u", aqui é a Nina, da Nitron.") if nome else u"Oi, aqui é a Nina, da Nitron."
    return (
      saud + u"\n\n"
      u"Vim pedir desculpa e resolver. Você falou com a gente e eu te passei para um representante "
      u"da sua região. *Passaram-se " + dias + u" dias e ninguém te procurou.* Isso não devia ter "
      u"acontecido, e a responsabilidade é nossa.\n\n"
      u"*Daqui para frente quem cuida de você sou eu*, por aqui mesmo — não vou te passar para mais "
      u"ninguém. E, em vez de você esperar alguém aparecer, dá para montar o pedido agora:\n"
      + L + seg + u"\n\n"
      + loja_frase + u" Cada produto tem foto, o preço de fábrica por peça e quantos vêm no fardo. "
      u"Você mexe no *+* e no *−*, tira o que não serve, e no fim toca em *Enviar*.\n\n"
      u"Duas coisas antes de começar:\n\n"
      u"*1.* O mínimo de fábrica é R$ 2.500 — abaixo disso não conseguimos faturar.\n\n"
      u"*2.* A lista que aparece não foi escolhida produto a produto para a sua loja: é a *média de "
      u"compra de " + lojas + u" lojas do mesmo ramo* do seu CNPJ, só para você não começar de uma "
      u"tela em branco. A página já aplica desconto por volume sozinha, e quando o pedido chega "
      u"aqui bem montado ainda dá para olhar a condição com mais carinho no fechamento — não vou "
      u"prometer número porque não sou eu quem define isso.\n\n"
      u"Eu fico por aqui enquanto você monta. Qualquer dúvida de produto ou quantidade, me chama.")

M = [
 (76, "bQeAg9eBzUftEzayGTjn", "Monteiro Casa e Construcao / Varginha-MG", "Sudeste-R01",
  msg(u"Adriana", u"28", u"Separei a parte de utilidades para casa, que é onde a Nitron entra na sua loja.", "Sudeste-R01", u"871")),
 (97, "dfr02UR24PiEMArOxC9a", "Mix 10 / Russas-CE", "Nordeste-R01",
  msg(u"João", u"25", u"Para loja de preço único é prático: dá para ver quanto custa cada item na peça e escolher só o que fecha no seu preço.", "Nordeste-R01", u"262")),
 (132, "TVMv4ik3xpoUIMYsQErR", "Tamaio Distribuidora / Umuarama-PR", "Sul-R01",
  msg(u"Gustavo", u"25", u"É a lista de utilidades domésticas que as lojas do Sul mais levam da gente.", "Sul-R01", u"209")),
 (127, "ZKLCX0oXv1hUTGrNbMPo", "Bazar da Mana / Florianopolis-SC", "Sul-R01",
  msg(u"", u"25", u"É a lista de utilidades que as lojas do Sul mais compram da gente.", "Sul-R01", u"209")),
 (96, "ofK2wKEEU48axdOTPb2O", "Rei dos Achados / Queimados-RJ", "Sudeste-R01",
  msg(u"Marcos", u"25", u"É o mix de variedades e utilidades, que é o perfil da sua loja.", "Sudeste-R01", u"871")),
 (143, "6dqBrxuYIvpi8gQXJ3Gt", "Ponto do Real / Candido Rodrigues-SP", "Sudeste-R01",
  msg(u"Rose", u"24", u"É a lista de utilidades domésticas que as lojas de SP mais compram da gente.", "Sudeste-R01", u"871")),
 (147, "nXJiG994zzbxVyk43UrX", "Princesas10 / Santo Andre-SP", "Sudeste-R01",
  msg(u"Zhaofa", u"24", u"É o mix de variedades e utilidades para casa.", "Sudeste-R01", u"871")),
 (206, "YD48GfU2nDP7GVa6n172", "Minas Utilidades / Mario Campos-MG", "Sudeste-R01",
  msg(u"Gilsimar", u"21", u"É a lista de utilidades que combina com o nome da sua loja — cozinha, potes, organização, lixeiras e banheiro.", "Sudeste-R01", u"871")),
]
out=[{"canal":"whatsapp","contact_id":c,"instancia":"Nina","texto":t,"_id":i,"_rot":r,"_seg":s}
     for (i,c,r,s,t) in M]
io.open("/tmp/claude-0/-home-user-CampanhasNitron/fcb4233f-1999-5b5f-af2a-111d7f46b9a6/scratchpad/assumir.json","w",encoding="utf-8").write(json.dumps(out,ensure_ascii=False,indent=1))
print("%d mensagens"%len(out))
for o in out: print("  #%-4s %-42s %-14s %4d chars"%(o["_id"],o["_rot"],o["_seg"],len(o["texto"])))
