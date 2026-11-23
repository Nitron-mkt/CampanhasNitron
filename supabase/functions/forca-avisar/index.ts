// forca-avisar — TODO LEAD QUE TRAVA NO CADASTRO PRECISA DE RESPOSTA.
//
// Ordem do gestor em 18/11: "quando acontecer de barrar na Inscricao Estadual tem que mandar para
// o lead que nao consegue continuar com o pedido". E em 19/11, depois do levantamento dos tipos de
// cliente: "pode fazer esse conserto do aviso para cliente da casa, na verdade para TODOS os
// clientes que travam".
//
// E, em 18/11, o limite dessas ordens, com todas as letras: "nao e para fazer teste nem disparo
// desse novo link para esses clientes que ja vieram, tudo e para os clientes novos". Por isso o
// corte fixo abaixo (`forca_aviso_desde`) existe ao lado da janela de horas.
//
// O QUE ACONTECIA ATE AQUI: o ERP recusava, a `forca-cadastro` gravava `forca_erro` e passava a
// PULAR aquele lead para sempre — e a Nina, do outro lado, seguia dizendo "ja estou montando o seu
// mix" a cada vez que chamava o `link_pedido`. Um mix que nunca ia chegar. Ate a v4 so a Inscricao
// Estadual tinha resposta; medido em 19/11, o grupo maior ficava calado: nos testes com cliente
// antigo, 4 de 4 cairam em representante ou Clube, e ninguem — nem o lojista, nem o representante
// dono, nem o comercial — ficava sabendo.
//
// A NINA NAO SABE DO RESULTADO, E POR ISSO QUEM AVISA E ESTA FUNCAO. O `copiloto-lead` apenas
// ESCREVE `forca_pedir_em`; ele nunca le `forca_erro`. A licao 443 ja diz o que ela deve falar
// quando o lojista e cliente da casa, mas nada a informava de que fora isso que aconteceu. Enquanto
// ela nao ler a coluna, o retorno sai daqui — pela instancia dela, na conversa dela.
//
// POR QUE E FUNCAO PROPRIA, e nao mais um bloco na `forca-cadastro`:
//   1. A `forca-cadastro` roda de 5 em 5 min abrindo PEDIDO DE VERDADE no ERP. Publicar 38 KB por
//      cima dela para acrescentar uma mensagem e risco sem motivo.
//   2. Regra nova que fala sozinha com o lojista tem de poder ser desligada sem publicar por cima
//      de quem esta atendendo — `forca_aviso_ativo`, mais o cron. E a licao de 16/09.
//
// O TEXTO E ESCRITO EM CODIGO, NAO PELO MODELO, e ha um por tipo de recusa. Motivo improvisado ou
// prazo inventado ali e o erro de 16/09.
//
// E ELE PERGUNTA EM VEZ DE ACUSAR. Na Inscricao Estadual, o que a gente sabe e que o ERP pediu a IE
// e nao achou — nao sabemos se a empresa e isenta, se tem IE fora da base, ou se a loja esta noutro
// CNPJ. Dos quatro primeiros casos, TRES eram empresa de servico (contabilidade, consultoria, apoio
// administrativo) e UM era lojista de verdade (CNAE 4789-0/05). A mesma frase serve aos dois sem
// mentir para nenhum.
//
// E O GESTOR TAMBEM E AVISADO. Ordem dele em 18/11: "alem de avisar o cliente (...) voce pode me
// avisar tambem quando esse lead travar". O aviso interno vai para quem tem `avisar=true` em
// `copiloto_responsaveis` (o gestor e a Camyla), deduplicado por telefone, e e INDEPENDENTE do
// aviso ao lojista: se a chave do lojista estiver desligada, ou se o lead cair fora da janela de
// 36h, o aviso interno sai do mesmo jeito — saber que um lead travou nao tem prazo de validade.
// O que ele NAO fura e o corte fixo `forca_aviso_desde`. O CNPJ vai em LINHA PROPRIA, como em toda
// comunicacao interna deste projeto: por nome fantasia ninguem acha a empresa no sistema.
//
// CLIENTE DA CASA NAO E ERRO, E PROTECAO — e o aviso interno e o que faz o "e passe" da licao 443
// acontecer: ele chega a Camyla, que e `papel='dono'` da area comercial. Nao abrimos tarefa nova
// aqui de proposito: a `forca-cadastro` ja abre tarefa para as recusas que nao sao representante
// nem Clube, e uma tarefa a mais nesses dois casos viraria segunda notificacao do mesmo fato.
//
// Uso (chave de servico no Authorization):
//   ?dry=1      quem receberia, com o texto pronto, sem mandar nada
//   ?limite=N   manda ate N (respeita `forca_aviso_lote`)
//   ?lead=N     um so, ignorando a janela de horas — mas NUNCA o corte fixo

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o, null, 2), { status: s, headers: { "Content-Type": "application/json" } });

const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const URL_ = () => Deno.env.get("SUPABASE_URL")!;

// ---- CLASSIFICACAO DA RECUSA ------------------------------------------------------------------
// O contrato da API manda decidir pelo `resolve` (corrigir | nitron | encerrado) e nao pelo `erro`,
// "para que um codigo novo que apareca um dia continue roteavel". Nos so guardamos o texto do erro
// em `forca_erro`, entao a classificacao e por padrao — mas a divisao e a mesma do `resolve`, e o
// caso final (`nosso`) e a rede: recusa que eu nao reconheco NAO fica calada.
//
// O que o ERP devolve na IE e "Insc. Estadual, deve ser informada." — abreviado e com ponto no
// meio. O padrao cobre "Insc. Estadual", "Inscricao Estadual" e "Inscrição Estadual".
const RE_IE = /insc\w*\.?\s*estadual/i;
const RE_CASA = /CLIENTE_COM_REPRESENTANTE|CLIENTE_CLUBE/i;
const RE_EMAIL = /sem e-?mail/i;
const RE_CNPJ_NAO = /CNPJ_NAO_ENCONTRADO/i;
const RE_CNPJ_INAT = /CNPJ_INATIVO/i;
const RE_CEP = /CEP_NAO_ENCONTRADO/i;

// AS DUAS CAUSAS QUE SE ESCONDIAM DENTRO DE `ERRO_ERP` (medidas em 23/11). O codigo de erro nelas
// e sempre o mesmo texto generico — "A Nitron recusou o cadastro ou o pedido por uma regra interna"
// — e o que diz QUAL regra travou mora no `detalhe`, que ate 23/11 nos jogavamos fora. Com o
// `forca_erro_detalhe` gravado pela `forca-detalhe`, essas duas passam a ser roteaveis:
//
// 1. CNPJ com digito verificador errado. A Receita responde "O numero do CNPJ informado nao e um
//    numero valido" — e a mensagem chega em latin1 ("O n?mero"), entao o padrao se agarra ao trecho
//    que nao tem acento nenhum. Sem isto, o lead 735 ouviu "e do nosso lado" quando bastava ele
//    conferir um digito.
// 2. O gatilho do Sankhya cobrando endereco do parceiro (ORA-20101 em TRG_INC_TGFPAR_NIT). Ali o
//    lojista tambem nao tem culpa, mas quem resolve E ele: so ele sabe a rua.
const RE_CNPJ_DV = /do CNPJ informado|d.?gito verificador/i;
const RE_ENDERECO = /ORA-20101|TRG_INC_TGFPAR_NIT|ndere.o do parceiro/i;

type Cat = "ie" | "casa" | "cnpj" | "cnpj_dv" | "cnpj_inativo" | "cep" | "endereco" | "email" | "nosso";

// LE O ERRO **E** O DETALHE. Era so o erro ate 23/11, e por isso toda recusa do ERP caia em
// `nosso`: o codigo generico nao diz nada, e a causa estava no campo que nao era lido.
function classificar(erro: unknown, detalhe?: unknown): Cat {
  const e = [String(erro || ""), String(detalhe || "")].join(" | ");
  if (RE_IE.test(e)) return "ie";
  if (RE_ENDERECO.test(e)) return "endereco";
  if (RE_CNPJ_DV.test(e)) return "cnpj_dv";
  if (RE_CASA.test(e)) return "casa";
  if (RE_EMAIL.test(e)) return "email";
  if (RE_CNPJ_NAO.test(e)) return "cnpj";
  if (RE_CNPJ_INAT.test(e)) return "cnpj_inativo";
  if (RE_CEP.test(e)) return "cep";
  return "nosso";
}

// Rotulo curto, para o aviso interno e para a previa.
const ROTULO: Record<Cat, string> = {
  ie: "INSCRICAO ESTADUAL",
  casa: "JA E CLIENTE DA CASA (representante ou Clube)",
  cnpj: "CNPJ NAO ENCONTRADO NA RECEITA",
  cnpj_dv: "CNPJ INVALIDO (digito verificador)",
  cnpj_inativo: "CNPJ INATIVO NA RECEITA",
  cep: "CEP FORA DA NOSSA BASE DE ENTREGA",
  endereco: "O ERP EXIGE O ENDERECO DO CADASTRO",
  email: "SEM E-MAIL",
  nosso: "RECUSA DO NOSSO LADO",
};

// O nome vem como a pessoa digitou, e muita gente escreve tudo em minuscula. "Oi, wellington!"
// numa mensagem que ja e uma noticia ruim soa descuidado — a primeira letra sobe.
const primeiroNome = (n: unknown) => {
  const p = String(n || "").trim().split(/\s+/)[0] || "";
  return p ? p.charAt(0).toUpperCase() + p.slice(1) : "";
};

async function rest(path: string, init?: RequestInit) {
  const k = srvKey();
  return await fetch(`${URL_()}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: k, Authorization: "Bearer " + k, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
}

async function cfg(chave: string, padrao = ""): Promise<string> {
  try {
    const q = await rest(`copiloto_config?select=valor&chave=eq.${chave}`);
    const v = q.ok ? String((await q.json())[0]?.valor ?? "").trim() : "";
    return v || padrao;
  } catch { return padrao; }
}

async function enviar(contact_id: string, texto: string, instancia: string) {
  const r = await fetch(URL_() + "/functions/v1/campanhas-enviar", {
    method: "POST", headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ canal: "whatsapp", texto, instancia, contact_id }),
    signal: AbortSignal.timeout(90_000),
  });
  return await r.json().catch(() => ({ ok: false, motivo: "resposta ilegivel do campanhas-enviar" }));
}

// O responsavel nao tem contact_id nesta tabela — o `campanhas-enviar` resolve o contato pelo
// numero. Mesma porta do espelho do repasse.
async function enviarFone(fone: string, texto: string, instancia: string) {
  const r = await fetch(URL_() + "/functions/v1/campanhas-enviar", {
    method: "POST", headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ canal: "whatsapp", texto, instancia, fone }),
    signal: AbortSignal.timeout(90_000),
  });
  return await r.json().catch(() => ({ ok: false, motivo: "resposta ilegivel do campanhas-enviar" }));
}

async function patch(id: number, campos: Record<string, unknown>) {
  await rest(`copiloto_lead?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(campos) });
}

// ---- A MENSAGEM AO LOJISTA, UMA POR TIPO ------------------------------------------------------
// Todas comecam dizendo que e um RETORNO: ele esta esperando o mix, nao pode levar assunto novo.
// Nenhuma promete prazo, nenhuma manda ele procurar o contador, e nenhuma diz "deu erro" quando
// nao deu — no caso `casa` nao deu mesmo: a recusa ali e protecao, e a licao 443 e explicita em
// nao fazer soar a falha nossa.
function textoDoAviso(L: { nome: string }, cat: Cat): string {
  const nome = primeiroNome(L.nome);
  const abre = nome ? `Oi, ${nome}! Vim te dar um retorno.` : "Oi! Vim te dar um retorno.";

  const corpo: Record<Cat, string[]> = {
    ie: [
      "Na hora de abrir o seu cadastro aqui, o sistema pediu a Inscricao Estadual do CNPJ e nao encontrou. Sem ela eu nao consigo seguir com o pedido: a nossa venda e para revenda e sai com nota de mercadoria.",
      "",
      "Se a sua empresa tiver Inscricao Estadual, me manda o numero por aqui que eu ja encaminho para a nossa equipe completar o seu cadastro.",
      "",
      "Se ela for isenta, ou se a loja estiver noutro CNPJ, me conta tambem — eu encaminho do mesmo jeito e a gente ve o caminho certo com voce.",
    ],
    // CLIENTE DA CASA. Licao 443, palavra por palavra: nao prometer link, nao inventar prazo e nao
    // dizer que "o sistema recusou" ou que "deu erro". Ele nao perdeu nada — ganhou um atendimento
    // que ja existia. E o "e passe" acontece: o aviso interno vai para a Camyla no mesmo minuto.
    casa: [
      "Fui montar o mix da sua loja e vi aqui que voce ja tem um atendimento dedicado na Nitron — ja existe uma pessoa responsavel por cuidar do seu cadastro e dos seus pedidos.",
      "",
      "Entao o caminho certo e por ela, que conhece o seu historico e consegue condicao melhor do que eu conseguiria montar por aqui. Ja estou passando o seu contato agora para o nosso comercial.",
      "",
      "Se voce tiver preferencia de horario para falarem com voce, me conta que eu mando junto.",
    ],
    cnpj: [
      "Fui abrir o cadastro da sua loja e o CNPJ que voce me passou nao aparece na base da Receita Federal. Pode ser so um digito trocado.",
      "",
      "Me confirma o numero por aqui que eu sigo na hora.",
    ],
    // CNPJ COM DIGITO ERRADO. E diferente de "nao encontrado": aqui a Receita diz que o numero nao
    // fecha como CNPJ, entao e erro de digitacao quase sempre. A frase nao acusa — ela devolve o
    // numero para ele conferir, que e o que resolve em uma mensagem. E AQUI a promessa de retomada
    // e verdadeira: o `cnpjDoTexto` grava o numero novo sozinho e a `forca-detalhe` reabre o pedido.
    cnpj_dv: [
      "Fui abrir o cadastro da sua loja e esse CNPJ nao passou na conferencia da Receita Federal — pelo numero que eu tenho aqui, parece faltar ou sobrar um digito.",
      "",
      "Me manda o CNPJ de novo por aqui que eu sigo na hora de onde a gente parou.",
    ],
    // ENDERECO DO CADASTRO. O sistema cobra o endereco do parceiro, e nem a Receita nem o CEP
    // entregam a rua nesses casos (MEI de cidade com CEP unico). So ele sabe, entao e ele quem e
    // perguntado — sem explicar gatilho de banco, que nao e problema dele.
    //
    // E ELE NAO PROMETE QUE O PEDIDO RETOMA SOZINHO, nem aqui nem na IE. Nos dois casos a API NAO
    // TEM CAMPO para o dado (nao ha `logradouro` nem `inscricao_estadual` no corpo aceito — sondado
    // em 23/11 em modo teste: a API aceita campo extra em silencio, o que prova que ela IGNORA, nao
    // que ela conhece). Entao quem conclui e uma pessoa, e "eu retomo de onde a gente parou" seria
    // promessa sem nada atras — o erro de 16/09. O que a mensagem promete e o que de fato acontece:
    // o dado chega a quem resolve.
    endereco: [
      "Fui abrir o cadastro da sua loja e faltou o endereco completo: o CEP que voce me passou e de uma regiao inteira, entao nao veio o nome da rua.",
      "",
      "Me manda rua, numero e bairro por aqui que eu ja encaminho para completarem o seu cadastro.",
    ],
    cnpj_inativo: [
      "Fui abrir o cadastro da sua loja e a Receita Federal esta mostrando esse CNPJ como inativo. Com ele eu nao consigo seguir com o pedido.",
      "",
      "Se a loja opera com outro CNPJ, me manda o numero por aqui que eu retomo de onde a gente parou.",
    ],
    cep: [
      "Fui calcular a entrega da sua loja e o CEP que voce me passou nao esta na nossa base de regioes. Sem ele eu nao consigo fechar o preco final, que ja vem com a entrega inclusa.",
      "",
      "Me confirma o CEP da loja por aqui que eu sigo.",
    ],
    email: [
      "Faltou so o seu e-mail para eu abrir o mix da sua loja — o cadastro nao abre sem ele.",
      "",
      "Me manda por aqui que eu sigo na hora.",
    ],
    // RECUSA NOSSA. Aqui a honestidade e possivel sem alarmar, e e importante NAO prometer que
    // avisamos depois: nada no sistema reabre esse lead sozinho. O que e verdade e que a tarefa
    // existe — a `forca-cadastro` abre tarefa para toda recusa que nao e representante nem Clube.
    nosso: [
      "Fui abrir o mix da sua loja e o nosso sistema nao conseguiu concluir o cadastro. Isso e do nosso lado, nao do que voce me mandou.",
      "",
      "Ja esta com a nossa equipe para resolver. Se quiser adiantar, me diz o melhor jeito de falarem com voce que eu mando junto.",
    ],
  };
  return [abre, "", ...corpo[cat]].join("\n");
}

// ---- O AVISO INTERNO --------------------------------------------------------------------------
// Curto de proposito: quem le ja tem o CRM para o detalhe, o que falta e SABER que o lead travou —
// e por que travou, para nao procurar defeito onde nao ha. Diz tambem se o lojista ja foi
// respondido, porque "ele ficou sabendo?" e a primeira pergunta de quem recebe.
function textoGestor(L: any, cat: Cat, avisado: boolean): string {
  const doc = String(L.cnpj || "").replace(/\D/g, "");
  const porque: Record<Cat, string> = {
    ie: "O ERP recusou o cadastro pedindo a Inscricao Estadual do CNPJ e nao encontrou, entao o pedido dele NAO foi aberto. A API nao tem campo para mandar a IE — quem resolve e uma pessoa refazendo o cadastro.",
    casa: "A API recusou abrir pedido direto porque este cliente JA E DA CASA: ou comprou nos ultimos 180 dias com um representante, ou tem Clube Nitron ativo. Isto NAO e defeito — e a trava funcionando. O que falta e uma pessoa assumir: ele esta esperando um retorno comercial.",
    cnpj: "A Receita Federal nao reconhece o CNPJ que ele informou. A Nina pediu que ele confira o numero. ATENCAO: este codigo tambem aparece quando a consulta a Receita falha por excesso de chamadas — medido em 23/11, o mesmo CNPJ passou tres vezes e foi recusado na quarta. Antes de cobrar o lojista, vale reconferir.",
    cnpj_dv: "O CNPJ que ele informou NAO FECHA no digito verificador — a Receita respondeu que o numero nao e valido. Quase sempre e digitacao. A Nina pediu o numero de novo, e assim que ele mandar o pedido REABRE sozinho (a `forca-detalhe` ve que o dado mudou e limpa a trava).",
    endereco: "O ERP recusou criar o cadastro cobrando o ENDERECO do parceiro, e nem a Receita nem o CEP tem a rua (CEP de cidade inteira). A Nina pediu rua, numero e bairro — mas ATENCAO: a API nao tem campo de logradouro, entao mesmo com a resposta dele alguem precisa concluir o cadastro a mao.",
    cnpj_inativo: "A Receita Federal mostra o CNPJ dele como INATIVO. A Nina perguntou se a loja opera com outro CNPJ.",
    cep: "O CEP que ele informou nao esta na nossa base de regioes, entao nao da para fechar o preco com entrega. A Nina pediu o CEP de novo.",
    email: "O cadastro nao abre sem e-mail e nao achamos em lugar nenhum: nem na linha do lead, nem no contato do CRM, nem na conversa. A Nina pediu o e-mail.",
    nosso: "A abertura do cadastro falhou do NOSSO lado. A `forca-cadastro` ja abriu tarefa no comercial com o texto cru do erro.",
  };
  return [
    "Lead travou no cadastro — " + ROTULO[cat],
    "",
    L.empresa ? "Loja: " + L.empresa : "Contato sem loja informada",
    doc.length === 14
      ? "CNPJ: " + doc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
      : (doc ? "Documento: " + doc : "Sem documento informado"),
    L.nome ? "Contato: " + L.nome : null,
    "Lead #" + L.id,
    "",
    porque[cat],
    "",
    avisado
      ? "O lojista ja recebeu retorno da Nina nesta conversa."
      : "O lojista AINDA NAO recebeu retorno (o aviso automatico esta desligado, ou ele esta fora da janela) — ele esta em silencio.",
    cat === "casa"
      ? "\nQuem fala com ele agora e o comercial: a conversa dele esta no CRM, com o historico inteiro."
      : null,
  ].filter((x) => x !== null).join("\n");
}

async function avisarInternos(L: any, cat: Cat, avisado: boolean, inst: string) {
  const out: any[] = [];
  try {
    const q = await rest("copiloto_responsaveis?select=nome,fone,avisar&avisar=is.true");
    const resp: any[] = q.ok ? await q.json() : [];
    const vistos = new Set<string>();
    for (const r of resp) {
      const f = String(r.fone || "").replace(/\D/g, "");
      const k = f.slice(-8);                       // o gestor aparece em duas areas; avisar uma vez
      if (!f || !k || vistos.has(k)) continue;
      vistos.add(k);
      const e: any = await enviarFone(f, textoGestor(L, cat, avisado), inst);
      out.push({ quem: r.nome, ok: !!e?.ok, motivo: e?.ok ? undefined : String(e?.motivo || "").slice(0, 160) });
    }
  } catch (e) { out.push({ erro: String(e).slice(0, 160) }); }
  return out;
}

Deno.serve(async (req) => {
  try {
    const auth = req.headers.get("Authorization") || "";
    const aceitas = [Deno.env.get("SRV_JWT"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")]
      .filter(Boolean).map((k) => "Bearer " + k);
    if (!aceitas.includes(auth)) return j({ ok: false, erro: "nao autorizado" }, 401);

    const u = new URL(req.url);
    const dry = u.searchParams.get("dry") === "1";
    const soLead = Number(u.searchParams.get("lead") || 0) || 0;

    const janelaH = Number(await cfg("forca_aviso_janela_h", "36")) || 36;
    const lote = Math.max(1, Math.min(Number(u.searchParams.get("limite") || await cfg("forca_aviso_lote", "3")) || 3, 10));
    const inst = await cfg("forca_link_instancia", "Nina");
    const ligado = (await cfg("forca_aviso_ativo", "nao")).toLowerCase() === "sim";
    // O aviso INTERNO tem chave propria: o gestor pediu em 18/11 para ser avisado quando um lead
    // travar, e isso nao deve morrer junto com a mensagem ao lojista se ela for desligada.
    const ligadoGestor = (await cfg("forca_aviso_gestor", "sim")).toLowerCase() === "sim";
    // QUAIS TIPOS FALAM. Nasce com todos, e desligar um e UPDATE — sem deploy, sem mexer em funcao
    // que esta atendendo. Util se um tipo se mostrar barulhento depois de ligado.
    const tipos = new Set((await cfg("forca_aviso_tipos", "ie,casa,cnpj,cnpj_dv,cnpj_inativo,cep,endereco,email,nosso"))
      .split(",").map((x) => x.trim().toLowerCase()).filter(Boolean));

    // Hora de Sao Paulo, fixa. Esta mensagem e iniciativa NOSSA e e uma noticia ruim: nao chega as
    // 2 da manha, e nao chega no domingo.
    const brt = new Date(Date.now() - 3 * 3600 * 1000);
    const hIni = parseInt(await cfg("forca_cutuca_hora_ini", "9")) || 9;
    const hFim = parseInt(await cfg("forca_cutuca_hora_fim", "20")) || 20;
    const fora = brt.getUTCDay() === 0 ? "domingo"
               : (brt.getUTCHours() < hIni || brt.getUTCHours() >= hFim)
                 ? `fora de ${hIni}h-${hFim}h de Sao Paulo (agora ${brt.getUTCHours()}h)` : null;

    // A mesma porta da `forca-cadastro`: lead da landing OU lead que a Nina encaminhou.
    const origens = (await cfg("forca_origens", "nitron-direto-lp%,lp-nitron%")).split(",").map((x) => x.trim()).filter(Boolean);
    const filtro = "(" + [...origens.map((o) => `origem.ilike.${o}`), "forca_pedir_em.not.is.null"].join(",") + ")";
    const sel = "id,nome,empresa,cnpj,contact_id,forca_erro,forca_erro_detalhe,forca_erro_cod," +
                "forca_aviso_em,forca_aviso_gestor_em,forca_pedir_em,criado";
    const url = soLead
      ? `copiloto_lead?select=${sel}&id=eq.${soLead}`
      : `copiloto_lead?select=${sel}&or=${filtro}&forca_erro=not.is.null` +
        `&descartado_em=is.null&contact_id=not.is.null&order=criado.desc&limit=200`;
    const q = await rest(url);
    const todos: any[] = q.ok ? await q.json() : [];

    // TODA recusa entra, cada uma com o seu texto. O caso `nosso` e a rede: recusa que eu nao
    // reconheco nao fica calada — era assim que o lojista sumia do mapa ate a v4.
    const comCat = todos.map((L) => ({ ...L, cat: classificar(L.forca_erro, L.forca_erro_detalhe) }))
                        .filter((L) => tipos.has(L.cat));

    // DUAS TRAVAS, e a segunda e a que o gestor pediu com todas as letras em 18/11:
    //   "nao e para fazer teste nem disparo desse novo link para esses clientes que ja vieram,
    //    tudo e para os clientes novos".
    //
    // 1) A JANELA, igual a do link: conta do maior entre nascer e ser encaminhado, porque um lead
    //    que a Nina acabou de atender E o fluxo de hoje mesmo que a linha seja antiga.
    // 2) O CORTE FIXO (`forca_aviso_desde`): uma data, nao um intervalo. A janela e aritmetica e
    //    anda com o relogio; o corte e uma linha no chao. Lead que ja existia quando a regra
    //    nasceu NAO recebe, hoje nem daqui a um mes. Alargar para tras e UPDATE nessa chave, e e
    //    decisao do gestor — do mesmo jeito que o `reativa_max_dias` segurou a onda de 03/11.
    //    O `?lead=` fura a janela de horas, mas NAO fura o corte: ele existe para destravar um
    //    caso novo, nao para alcancar quem ficou para tras.
    const corte = Date.now() - janelaH * 3600_000;
    const desdeTxt = await cfg("forca_aviso_desde", "");
    const desde = desdeTxt ? new Date(desdeTxt).getTime() : 0;
    const quando = (L: any) =>
      Math.max(new Date(L.criado || 0).getTime(), new Date(L.forca_pedir_em || 0).getTime());
    const recente = (L: any) => quando(L) >= corte && quando(L) >= desde;
    const naJanela = soLead ? comCat.filter((L: any) => quando(L) >= desde) : comCat.filter(recente);
    const foraDaJanela = comCat.length - naJanela.length;
    // A marca de "ja avisado" saiu do SQL e virou filtro aqui: sao DUAS filas com marcas
    // diferentes, e o PostgREST so aceita um `or=` por consulta — ele ja e das origens.
    const cands = naJanela.filter((L: any) => !L.forca_aviso_em);
    const fila = cands.slice(0, lote);

    // A FILA DO AVISO INTERNO E OUTRA, e de proposito: ela NAO olha a janela de 36h. Saber que um
    // lead travou nao tem prazo de validade, e um lead que barrou enquanto o cron estava parado
    // continua sendo noticia. O corte fixo (`forca_aviso_desde`) vale aqui igual.
    const gCands = comCat.filter((L: any) => quando(L) >= desde && !L.forca_aviso_gestor_em);
    const gFila = gCands.slice(0, lote);

    const porTipo = comCat.reduce((a: Record<string, number>, L: any) => {
      a[L.cat] = (a[L.cat] || 0) + 1; return a;
    }, {});

    if (dry || (!ligado && !ligadoGestor) || (fora && !soLead)) {
      return j({
        ok: true, previa: true, ligado, instancia: inst, janela_h: janelaH,
        fora_do_horario: fora || undefined,
        tipos_ligados: [...tipos],
        travados: comCat.length, por_tipo: porTipo, a_avisar: cands.length, fora_da_janela: foraDaJanela,
        so_a_partir_de: desdeTxt || "sem corte configurado",
        motivo: ligado ? null : "forca_aviso_ativo nao esta 'sim' — ligar e UPDATE em copiloto_config",
        aviso_ao_gestor: { ligado: ligadoGestor, a_avisar: gCands.length,
                           fila: gFila.map((L) => ({ lead: L.id, empresa: L.empresa, tipo: L.cat,
                                                     texto: textoGestor(L, L.cat, !!L.forca_aviso_em) })) },
        fila: fila.map((L) => ({ lead: L.id, nome: L.nome, empresa: L.empresa, tipo: L.cat,
                                 erro: String(L.forca_erro || "").slice(0, 120),
                                 detalhe: String(L.forca_erro_detalhe || "").slice(0, 200) || undefined,
                                 texto: textoDoAviso(L, L.cat) })),
      });
    }

    const feito: Record<string, unknown>[] = [];
    const jaAvisado = new Set<number>();
    for (const L of (ligado ? fila : [])) {
      // ANTES do envio, como em todo o resto do projeto: o envio leva 12s de checagem de entrega,
      // e duas rodadas que se cruzam mandariam a mesma noticia duas vezes. (`toques`, 02/10.)
      await patch(L.id, { forca_aviso_em: new Date().toISOString(), forca_aviso_erro: null });
      try {
        const env = await enviar(L.contact_id, textoDoAviso(L, L.cat), inst);
        if (env?.ok) { jaAvisado.add(L.id); feito.push({ lead: L.id, nome: L.nome, tipo: L.cat, acao: "avisado" }); }
        else {
          await patch(L.id, { forca_aviso_erro: String(env?.motivo || "recusado").slice(0, 300) });
          feito.push({ lead: L.id, nome: L.nome, tipo: L.cat, acao: "recusado", motivo: env?.motivo });
        }
      } catch (e) {
        await patch(L.id, { forca_aviso_erro: String(e).slice(0, 300) });
        feito.push({ lead: L.id, nome: L.nome, tipo: L.cat, acao: "erro", detalhe: String(e).slice(0, 200) });
      }
    }
    // O AVISO AO GESTOR, depois. Vem por ultimo de proposito: assim ele ja diz se o lojista foi
    // respondido nesta mesma rodada. A marca e gravada ANTES do envio, como a do lojista.
    const internos: Record<string, unknown>[] = [];
    for (const L of (ligadoGestor ? gFila : [])) {
      await patch(L.id, { forca_aviso_gestor_em: new Date().toISOString() });
      try {
        internos.push({ lead: L.id, empresa: L.empresa, tipo: L.cat,
                        para: await avisarInternos(L, L.cat, !!L.forca_aviso_em || jaAvisado.has(L.id), inst) });
      } catch (e) { internos.push({ lead: L.id, erro: String(e).slice(0, 200) }); }
    }

    return j({ ok: true, instancia: inst, travados: comCat.length, por_tipo: porTipo,
               avisados: feito.filter((f) => f.acao === "avisado").length,
               restam: cands.length - fila.length, fora_da_janela: foraDaJanela, feito,
               aviso_ao_gestor: { ligado: ligadoGestor, feito: internos,
                                  restam: Math.max(0, gCands.length - gFila.length) } });
  } catch (e) {
    return j({ ok: false, erro: String(e).slice(0, 400) }, 500);
  }
});
