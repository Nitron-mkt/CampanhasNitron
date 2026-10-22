# Leads parados — foto de 22/10/2026, 12h SP

> Pedido do gestor em 22/10: *"De jeito nenhum podemos deixar o lead parado, então agora vamos
> fazer uma listagem de coisas que estão paradas um tempo, esperando alguém responder."*

A lista sai da view **`lead_parado`** (criada hoje). Ela é consultável a qualquer momento e não
precisa de código: `select * from lead_parado order by calor desc, dias_parado desc`.

## O número que importa

**442 leads estão parados há mais de 24 horas. Em 437 deles, ninguém vai falar nada.**

Não é falta de vontade: é como o acompanhamento foi construído. A rotina de seguimento da Nina só
olha lead em `qualificando` ou `qualificado` **com menos de 2 toques**. Quem já levou os dois
toques, ou foi marcado `passado` (repassado a alguém) ou `frio`, sai da lista e não volta. Só
**5** dos 442 ainda têm um toque automático pela frente.

| parado há | leads | com CNPJ | com link | já sabem o mínimo |
|---|---|---|---|---|
| até 1 dia | 34 | 13 | 18 | 4 |
| 2 a 3 dias | 11 | 8 | 0 | 5 |
| 4 a 7 dias | 17 | 16 | 0 | 15 |
| **8 a 30 dias** | **301** | 110 | 1 | 81 |
| mais de 30 dias | 109 | 41 | 0 | 31 |

A faixa de 8 a 30 dias é a maior e a mais cara: são leads que já foram qualificados, muitos com
CNPJ e cientes do pedido mínimo, e que simplesmente pararam.

## Como a lista é ordenada

A coluna `calor` soma o que a gente já sabe sobre cada um: CNPJ informado (2), sabe do pedido
mínimo (2), **abriu a página de pedido (3)**, recebeu o link (1), tipo de loja apurado (1).

| calor | leads | parados há | já foram a representante |
|---|---|---|---|
| 5 | 110 | 1 a 41 dias | 107 |
| 4 | 4 | 6 a 27 dias | 4 |
| 3 | 66 | 2 a 40 dias | 33 |
| 2 | 17 | 10 a 42 dias | 17 → 3 |
| 1 | 67 | 1 a 41 dias | 0 |
| 0 | 178 | 1 a 42 dias | 0 |

**Os 114 de calor 4 e 5 são a fila para começar.** São leads com CNPJ, cientes do pedido mínimo, e
**111 deles foram parar com um representante** — que é justamente o caminho que o gestor fechou.
Eles voltaram para a casa e ninguém assumiu.

## Os 114 prontos para a Nina retomar

| lead | loja | CNPJ | praça | ramo | parado | foi para |
|---|---|---|---|---|---|---|
| 18 | Faby Smart Tech Variedades | 58.370.322/0001-02 | Mogi das Cruzes / SP | variedades (eletrônico | 41d | Mônica |
| 16 | Lr Shop | 68.776.542/0001-94 | São Paulo / SP | variedades e utilidade | 41d | Valeria |
| 27 | MBGIOJO | 59.226.574/0001-25 | Campinas / SP | utilidades/variedades  | 38d | Mônica |
| 24 | Andra Matos | 12.387.382/0001-37 | Cordeiro / RJ | salão e loja de varied | 38d | EDSON GRAVINEZ |
| 25 | CFCONNECT | 69.028.198/0001-18 | Pitangui / MG | e-commerce de utilidad | 38d | Valeria |
| 31 | Loja D Presente | 45.519.300/0001-10 | Porto Velho / RO | variedades/presentes ( | 38d | ABIMAEL |
| 2 | Distak Utilidades e Presentes | 26.015.084/0001-20 | Petrolina de Goiás / GO | utilidades e presentes | 36d | GOIANDY |
| 43 | Magax8 Suprema Comercio Digital  | 60.134.799/0001-30 | São Paulo / SP | bazar/utilidades/varie | 36d | Valeria |
| 39 | MJP SERVCOM LTDA | 64.406.552/0001-87 | São Paulo / SP | utilidades domésticas  | 36d | Mônica |
| 47 | Festa e Cia | 38.262.241/0001-81 | Santa Rita do Sapucaí / MG | variedades/utilidades | 35d | ALEXANDRE |
| 3 | Kasamais | 47.258.455/0001-75 | São Luís / MA | preço único / armarinh | 35d | CASSIO |
| 76 | Monteiro Casa e Construção | 59.082.585/0001-89 | Varginha / MG | material de construção | 34d | ROBERTO |
| 23 | Sol e Lar | 46.233.764/0001-28 | Bauru / SP | variedades | 34d | SEBASTIAO |
| 40 | Pedro Paulo Variedades | 42.057.763/0001-19 | Santos / SP | variedades | 34d | Mônica |
| 71 | Dona Antoninha Produtos De Limpe | 65.308.757/0001-92 | São Paulo / SP | utilidades domésticas | 34d | HELENA SANTOS S |
| 83 | Victor Hugo - Mercado Livre | 57.385.479/0001-49 | Presidente Prudente / SP | utilidades domésticas  | 33d | Mônica |
| 82 | Auguri Store LTDA | 65.258.039/0001-59 | Mogi das Cruzes / SP | utilidades e móveis (e | 33d | Valeria |
| 101 | Kalebe Imóveis | 44.945.844/0001-80 | Ferraz de Vasconcelos / SP | Marketplace (Shopee) - | 32d | Mônica |
| 96 | Rei dos Achados | 40.344.531/0001-16 | Queimados / RJ | variedades/utilidades | 31d | PAULO CESAR PC |
| 115 | Potencial Hub | 68.360.893/0001-10 | Oriximiná / PA | distribuidor | 31d | TIAGO SANTOS |
| 136 | Livenna Store | 68.365.225/0001-85 | São Paulo / SP | marketplace / utilidad | 31d | Mônica |
| 107 | Show de Variedades | 12.096.443/0001-07 | Guaianases / SP | variedades (loja de R$ | 31d | CARLINHOS |
| 109 | Bazar 5 de Outubro (Esteves Abra | 58.163.130/0001-25 | Santos / SP | bazar, decoração e pre | 31d | INACIO |
| 132 | Tamaio Distribuidora Ltda | 67.895.955/0001-25 | Umuarama / PR | utilidades domésticas, | 31d | JOÃO CARLOS |
| 90 | Ana Paula Bibbo | 18.846.578/0001-29 | São Carlos / SP | variedades | 31d | SEBASTIAO |
| 97 | Mix 10 (João Araújo Alencar Filh | 69.019.936/0001-60 | Russas / CE | preço único | 31d | ADILSON |
| 127 | Bazar da Mana | 02.334.699/0001-51 | Florianópolis / SC | utilidades | 31d | WILSON |
| 153 | Sohanna Mix | 60.620.668/0001-63 | Pouso Alegre / MG | e-commerce de utilidad | 30d | Valeria |
| 57 | Lojão Top 20 Pelada | 59.882.572/0001-94 | Caruaru / PE | utilidades/variedades | 30d | INADJA |
| 147 | Princesas10 | 67.506.021/0001-54 | Santo André / SP | variedades | 30d | MARCIO |
| 143 | Ponto do Real | 64.721.723/0001-55 | Candido Rodrigues / SP | utilidades domésticas | 30d | HERMES |
| 123 | Decorgazi (Versa Utilidades) | 33.659.740/0001-93 | Pedreira / SP | e-commerce de utilidad | 30d | Valeria |
| 167 | Casa e Estilo | 65.773.241/0001-19 | Fortaleza / CE | variedades | 29d | Mônica |
| 59 | Martins Utilidades | 53.319.515/0001-15 | Iretama / PR | utilidades | 28d | URBANO |
| 174 | Elaine da Silva Gonçalves | 66.578.770/0001-24 | São Bernardo do Campo / SP | ecommerce multinicho | 28d | Valeria |
| 193 | Habitual Delivery LTDA | 68.681.656/0001-50 | Diadema / SP | cama mesa e banho / de | 27d | Valeria |
| 206 | Minas Utilidades (MM Utilidades) | 33.958.692/0001-34 | Mário Campos / MG | utilidades | 27d | GERALDO |
| 197 | Patrícia Andressa Pescara | 57.499.788/0001-40 | Leme / SP | vendas online / utilid | 27d | Mônica |
| 190 | Raquel Souza Wolff | 35.304.961/0001-74 | Aracruz / ES | variedades | 27d | JOANA |
| 204 | Farmácia Açungui Ltda | 63.237.057/0001-29 | Rio Branco do Sul / PR | farmácia | 27d | MAURI CONCI |
| 189 | Grupo VESS | 43.887.509/0001-00 | Vitória da Conquista / BA | utilidades | 27d | SALVADOR DE LIM |
| 202 | Nay Móveis | 57.426.260/0001-40 | Martinópole / CE | móveis e eletros, come | 27d | INACIO |
| 215 | Thiago Fragoso (revenda Mercado  | 61.700.302/0001-67 | Guarulhos / SP | utilidades domésticas | 26d | Mônica |
| 211 | Sandro Quirino | 38.058.754/0001-75 | São Paulo / SP | ecommerce utilidades | 26d | Mônica |
| 249 | Alexandre Campos | 62.579.444/0001-80 | Santo André / SP | e-commerce (Mercado Li | 24d | Valeria |
| 240 | Kcum | 61.186.510/0001-90 | São Paulo / SP | brinquedos/lazer | 24d | JOSÉ C LEAL |
| 223 | Prospereira | 68.885.560/0001-04 | São Paulo / SP | revenda online (Amazon | 24d | Mônica |
| 243 | Aline Cristina Zefa | 68.327.507/0001-98 | São José dos Pinhais / PR | ecommerce (eletrônicos | 24d | Mônica |
| 280 | Kelly | 64.548.517/0001-00 | Aracariguama / SP | utilidades | 23d | MILTON |
| 274 | Eduardo Pereira da Silva | 59.466.111/0001-30 | São Paulo / SP | ecommerce (marketplace | 23d | Valeria |
| 92 | Casa e Decor Anna | 60.909.030/0001-47 | Marataízes / ES | utilidades / cama mesa | 23d | JOANA |
| 276 | D&V Variedades | 52.271.357/0001-08 | Itapecerica da Serra / SP | variedades | 23d | MARCIO |
| 93 | Lari Utilidades | 67.049.280/0001-01 | Selvíria / MS | utilidades | 23d | JOÃO CARLOS |
| 286 | Defrati Logistica Ltda | 61.182.789/0001-33 | São Paulo / SP | utilidades domésticas | 22d | REGINA |
| 291 | Ipo Embalagens | 09.055.640/0001-73 | Colombo / PR | distribuidora de embal | 22d | JOÃO CARLOS |
| 95 | Núbia Gonçalves | 22.033.898/0001-37 | São Sebastião do Paraíso / MG | utilidades domésticas | 22d | FIGUEROA |
| 260 | Neko Shop | 69.181.103/0001-00 | Guarulhos / SP | utilidades/utensílios  | 22d | Valeria |
| 266 | e-commerce de variedades | 66.081.395/0001-02 | Volta Redonda / RJ | variedades | 22d | Mônica |
| 297 | ManuStore | 67.021.156/0001-20 | Santo André / SP | utilidades para casa | 21d | ROBERTO |
| 300 | Loja de utilidades domésticas (M | 63.398.179/0001-05 | São José do Rio Preto / SP | utilidades domésticas | 21d | Valeria |
| 301 | Tudo de Casa Utilidades | 49.447.420/0001-00 | Angical do Piauí / PI | utilidades / preço úni | 21d | COSTA |
| 298 | Daily | 69.090.762/0001-22 | Divinópolis / MG | variedades (marketplac | 21d | Mônica |
| 98 | Seu Lar Paraíba | 19.859.037/0001-06 | Queimadas / PB | cama, mesa e banho | 21d | EDUARDO |
| 309 | Jhonatas Francis | 34.997.730/0001-20 | Maceió / AL | material de construção | 21d | GILVANIR |
| 308 | Pro Forte Utilidades | 66.452.419/0001-92 | Santo André / SP | venda online/marketpla | 21d | Mônica |
| 305 | Confraria Armazém Beer | 30.587.037/0001-29 | Itapema / SC | presentes/cestas | 21d | JOSÉ FERNANDO |
| 320 | Kaya Variedades | 68.576.972/0001-62 | São Paulo / SP | ecommerce/variedades | 20d | Mônica |
| 332 | Fernando Figueiredo (loja Shopee | 67.926.347/0001-30 | Balneário Camboriú / SC | utilidades domésticas | 19d | Valeria |
| 335 | Halteia | 36.799.935/0001-27 | Canavieiras / BA | utilidades domésticas, | 18d | SALVADOR DE LIM |
| 326 | Fgsversatta | 68.517.489/0001-07 | São Paulo / SP | ecommerce de utilidade | 17d | Valeria |
| 366 | JM Preço Único | 26.181.243/0001-67 | Moraes Almeida / PA | utilidades (preço únic | 17d | DAVID |
| 325 | A.Barboza Alvares e Cia Ltda | 72.498.249/0001-80 | Londrina / PR | bazar e papelaria | 17d | - |
| 355 | Ecommerce Sheila França | 15.749.063/0001-12 | Curitiba / PR | ecommerce (Mercado Liv | 17d | Mônica |
| 110 | Loja É 10 | 29.016.650/0001-90 | Anchieta / SC | utilidades, variedades | 17d | LUCIO |
| 157 | Mayke Suehiro | 69.300.027/0001-04 | Wanderlândia / TO | utilidades e brinquedo | 17d | - |
| 359 | Nc Distribuidora | 59.064.339/0001-02 | São Paulo / SP | utilidades domésticas  | 16d | Valeria |
| 372 | Nathalia Queiroz | 16.925.563/0001-20 | Santa Maria de Jetibá / ES | variedades e utilidade | 16d | CARLOS EDUARDO |
| 375 | Zavora Ltda | 68.781.281/0001-09 | São Bernardo do Campo / SP | e-commerce de utilidad | 16d | Valeria |
| 378 | Rubia | 69.472.710/0001-10 | Cotia / SP | variedades | 16d | ADÃO |
| 391 | Kairos | 58.740.373/0001-89 | Campinas / SP | marketplace | 15d | Mônica |
| 334 | Utimixhome10 | 49.795.926/0001-00 | Itupeva / SP | ecommerce | 14d | Valeria |
| 382 | Daniel Marchesani Florencio da S | 64.860.152/0001-47 | Itupeva / SP | ecommerce (Mercado Liv | 13d | Mônica |
| 412 | Edileia de Sousa Francisco Varie | 58.798.278/0001-36 | Indaiatuba / SP | e-commerce variedades | 12d | Mônica |
| 422 | Cfbazar | 08.898.774/0001-93 | Taboão da Serra / SP | bazar/variedades | 11d | Mônica |
| 437 | Madeplan Multicoisas | 28.922.519/0001-46 | Londrina / PR | marcenaria e utilidade | 10d | VALERIA |
| 425 | Loja online (Shopee) - Carlos Ed | 65.623.155/0001-89 | Serra / ES | loja online (Shopee) - | 10d | Mônica |
| 448 | Jbnmultishop | 64.846.613/0001-27 | Miraí / MG | ecommerce | 9d | Mônica |
| 415 | Mix Variedades | 38.047.646/0001-05 | Icapuí / CE | preço único | 9d | VALERIA |
| 449 | Bazar da Cristiane | 03.825.827/0001-22 | Garruchos / RS | bazar | 9d | JOÃO ANTONIO |
| 129 | Imprima gráfica e papelaria | 36.959.748/0001-63 | Itapissuma / PE | papelaria | 8d | MARCELO |
| 142 | Ms Comercial e Cia Ltda (MS Home | 67.613.104/0001-42 | Salvador / BA | home center | 7d | CARLOS ALFAYA |
| 121 | Artes e Presentes | 18.961.513/0001-24 | Ibaté / SP | presentes/utilidades | 7d | MILTON |
| 457 | Amauri Salerno Marques | 28.144.969/0001-55 | Sorocaba / SP | utilidades do lar | 7d | Mônica |
| 137 | Samia Presentes | 44.494.405/0001-07 | São Paulo / SP | utilidades domésticas | 7d | LUCIANA MITIE |
| 144 | Magno Construção | 67.005.968/0001-81 | Itapipoca / CE | material de construção | 7d | EDUARDO |
| 117 | Luelu Presentes e Utilidades | 58.101.850/0001-66 | Alfenas / MG | utilidades | 7d | RONALDO JR |
| 170 | Nascimento Utilidades Domesticas | 58.155.675/0002-70 | Balneário Arroio do Silva / SC | utilidades | 7d | PAULO DRESCH |
| 397 | Isabela Dias Rezende (MEI) | 59.847.597/0001-57 | Santa Luzia / MG | atacadista/distribuido | 6d | DIVINO |
| 224 | Rozeni Pereira Capuchinho de Fre | 23.753.379/0001-06 | Taiobeiras / MG | armarinhos, papelaria  | 6d | EVERTON |
| 239 | Alex Fernandes | 68.056.713/0001-00 | São Paulo / SP | multinicho / variedade | 6d | ADÃO |
| 156 | Biju Mania | 10.981.457/0001-88 | Curaçá / BA | utilidades | 6d | EDMILSON |
| 304 | Maria Socorro da Mota Dias | 67.603.204/0001-98 | São José do Rio Preto / SP | loja de preço único (R | 6d | HELENA SANTOS S |
| 158 | Bella Mix Utilidades | 66.177.732/0001-60 | Além Paraíba / MG | variedades (preço únic | 5d | DIVINO |
| 460 | loja virtual (ecommerce) - Fabia | 68.000.689/0001-98 | São Bernardo do Campo / SP | ecommerce, mix variado | 5d | Mônica |
| 463 | Douglas Sotto - e-commerce | 35.641.438/0001-33 | São Paulo (Interlagos) / SP | e-commerce | 3d | Mônica |
| 464 | Dilltec Instalações Elétricas | 23.922.722/0001-07 | Xanxerê / SC | material elétrico | 3d | PAULO DRESCH |
| 213 | Loja de variedades (nova, em mon | 64.231.248/0001-46 | Apicum-Açu / MA | variedades | 2d | CASSIO |
| 242 | Casa Cirúrgica Angra dos Reis | 45.087.076/0001-34 | Angra dos Reis / RJ | produtos hospitalares/ | 2d | MILTON |
| 402 | Marcos Santos | sem CNPJ | Sumaré / SP | utilidades | 1d | - |
| 290 | W S Comércio Varejista | 60.004.261/0001-01 | Itabuna / BA | material de construção | 1d | TOM |
| 200 | Emanuel Martins | 68.734.440/0001-06 | Campo Magro / PR | - | 27d | Valeria |
| 275 | CONFIENVIOS BR IMPORTACAO E EXPO | 36.502.577/0001-49 | Osasco / SP | - | 23d | Mônica |
| 387 | Agrocamp | 30.409.697/0001-10 | São Sebastião da Grama / SP | - | 15d | MAURO |
| 454 | Centralmix | 69.217.089/0001-49 | Goiânia / GO | - | 6d | VALERIA |
## O que falta decidir

Nenhum desses recebeu mensagem nossa ainda — **não disparei nada**. Mandar para 114 lojistas é
comunicação em massa, e a regra da casa é que isso é decisão do gestor. O que está pronto:

1. A fila existe e é consultável (`lead_parado`).
2. A Nina já sabe montar o link certo para cada um (ramo + região), sem ninguém no meio.
3. O texto teria de reconhecer o tempo parado — vários esperam há mais de um mês depois de terem
   sido repassados a um representante que não os procurou.

**O buraco estrutural continua:** enquanto o seguimento só enxergar `qualificando`/`qualificado`
com menos de 2 toques, todo lead que esfria sai do radar para sempre. Consertar isso é mudar a
régua de acompanhamento, não mandar uma campanha.
