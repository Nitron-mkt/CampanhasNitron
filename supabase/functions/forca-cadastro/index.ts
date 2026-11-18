// forca-cadastro — leva o cadastro do lead da landing para o FORCA DE VENDAS e entrega o link.
//
// ORDEM DO GESTOR (17/11): "o cliente vem da campanha, manda os dados da LP para o forca e la ele
// vai fazer tudo". A `vendas.nitron.com.br` nao devolve uma pagina: ela abre PEDIDO DE VERDADE no
// ERP (numero de pedido, esteira do AD_STATUFORCA) e devolve o link.
//
// VAI SO O CADASTRO. Nenhum item, nenhuma cesta: quem monta o mix e a tela do Forca, como o
// lojista ja ve no link de hoje. Isso dispensou todo o de-para CODPROD->REFERENCIA e a conversao
// de peca para fardo que o desenho anterior exigia.
//
// POR QUE E FUNCAO PROPRIA, E NAO UMA CHAMADA DENTRO DA `lp-lead` OU DO `copiloto-lead`:
//  1. As duas estao recebendo lead agora. Publicar por cima delas para acrescentar uma chamada e
//     risco sem necessidade — a licao de 16/09 vale aqui igual.
//  2. O documento diz que CADA CONSULTA AO PROTOCOLO EMPURRA O PROCESSAMENTO do outro lado. Uma
//     varredura volta e termina o que nao coube; uma chamada inline tem uma janela so e desiste.
//  3. Regra nova que fala com sistema de fora — e, desde a v3, que fala com o LOJISTA — tem de
//     poder ser desligada sem deploy.
//
// Uso (sempre com a chave de servico no Authorization):
//   ?acao=fila            quem entraria na abertura de pedido, sem mandar nada
//   ?acao=links           quem receberia o link por Zaptos, com o texto pronto, sem mandar nada
//   ?acao=status          contagem do que ja foi, do que falta e do que deu erro
//   ?limite=N             processa ate N leads (respeita `forca_lote`)
//   ?acao=enviar_links    so a entrega do link (respeita `forca_link_lote`)
//   &dry=1                nao escreve e nao manda
//
// ============================ v3 (17/11) — AS TRES COISAS NOVAS ================================
//
// 1) O E-MAIL AGORA E PROCURADO NA CONVERSA, e nao so no contato do CRM.
//    A API EXIGE e-mail ("nao pode ser opcional, ate para cadastrar no CRM" — gestor, 17/11) e
//    medimos o pedagio: dos leads da Nina, 268 tinham CNPJ, 75 tinham CEP e ZERO tinham e-mail na
//    nossa tabela; no CRM, 5 contatos de anuncio em 100. Ou seja: sem procurar na conversa, a
//    maioria do fluxo para aqui.
//    O `copiloto-lead` ja EXTRAI o e-mail da assinatura da landing do Google (`acelera()`) e ate
//    17/11 simplesmente JOGAVA FORA — `acl.cnpj` e `acl.nome` eram usados, `acl.email` nao. Esta
//    funcao e a rede do lado de ca: le a conversa, pega o e-mail que o LOJISTA escreveu, grava na
//    `copiloto_lead` E no contato do CRM.
//    So mensagem INBOUND conta: endereco nosso que aparece num e-mail de saida nao e do cliente.
//
// 2) O LINK E ENTREGUE POR ZAPTOS. Ate a v2 o pedido nascia no ERP e o link morria numa coluna —
//    13 pedidos abertos e nenhum lojista avisado. Agora sai pela instancia da Nina, com o preco
//    minimo, a regra dos 10% e a validade do link.
//    TRES TRAVAS, cada uma por um motivo medido:
//      - `forca_link_enviar` nasce 'nao'. Ligar e UPDATE. Licao de 16/09.
//      - `forca_link_janela_h` (36h): so recebe link quem esta ATIVO — e a janela conta do maior
//        entre `criado` e `forca_pedir_em`, porque um lead de semanas atras que a Nina acabou de
//        atender E o fluxo novo. Sem a janela, a primeira rodada mandaria mensagem a 21 leads
//        parados ha ate uma semana de uma vez so: isso nao e o fluxo novo, e um disparo frio.
//      - `forca_link_em` e gravado ANTES do envio. E a licao do `toques` (02/10) e do `reativa_em`
//        (03/11): contador escrito depois de um envio que leva 12s de checagem cruza com a rodada
//        seguinte e manda a mesma mensagem duas vezes. O erro, se houver, vai para `forca_link_erro`.
//
// 3) O PIX SO E DITO ENQUANTO A DATA VALER. `pix_desconto_ate` e lido a cada envio; passada a
//    data, a frase some sozinha, sem ninguem lembrar. Percentual escrito em prompt continua sendo
//    dito no dia seguinte ao fim da promocao — e promessa de dinheiro que a tela nao cumpre e o
//    erro de 16/09 com dinheiro no meio. E a promessa fica REGISTRADA (`forca_pix_em`): o PIX com
//    desconto e gerado a mao, entao quem receber o pedido precisa saber que ela foi feita.
//
// ============================ v5 (18/11) — O ENDERECO DE ENTREGA =============================
// A LP passou a coletar NUMERO e COMPLEMENTO, e ate 18/11 os dois chegavam no POST da ponte e
// caiam no chao. Agora a `lp-lead` os grava e esta funcao manda o objeto `entrega` — que e o que
// faz o pedido nascer no endereco de ENTREGA e nao no endereco fiscal da Receita, que no lojista
// costuma ser o escritorio do contador. E, quando o ERP recusa o cadastro por outro motivo que
// nao representante/Clube, abre TAREFA: sem ela o lead ficava num vao, com a Nina prometendo um
// acesso que nunca chegaria.
//
// O QUE AINDA NAO VAI: o objeto `entrega`. A API aceita cep + numero + complemento, e a landing
// ainda nao coleta numero nem complemento (pedido ao Replit em 17/11). Sem o numero o endereco
// nao se sustenta e o pedido nasce no endereco da Receita — que no lojista costuma ser o fiscal,
// nao o deposito. Melhor isso, e dito em voz alta no resumo, do que endereco pela metade.

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o, null, 2), { status: s, headers: { "Content-Type": "application/json" } });

const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const URL_ = () => Deno.env.get("SUPABASE_URL")!;
const API_GHL = "https://services.leadconnectorhq.com";
const LOC = "rZ8y7lzqV7fzxsartaX2";
const FORCA_BASE = "https://vendas.nitron.com.br";
const FORCA_ID = "crm-nitron";

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

async function rest(path: string, init?: RequestInit) {
  const k = srvKey();
  return await fetch(`${URL_()}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: k, Authorization: "Bearer " + k, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
}

function ghl(method: string, path: string, body?: unknown, version = "2021-07-28") {
  return fetch(API_GHL + path, {
    method,
    headers: { Authorization: "Bearer " + Deno.env.get("GHL_TOKEN"), Version: version,
               "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
}

// QUEM ENTRA NA FILA: o lead da landing (por origem) E, desde 17/11, QUALQUER lead que a Nina
// tenha marcado ao chamar a ferramenta `link_pedido` (`forca_pedir_em`). Sem essa segunda porta o
// fluxo novo valeria so para a landing, e o gestor foi explicito: "a partir de agora a nina tem
// que fazer o fluxo que falamos hoje" — lead do META e do organico entram pela mesma porta.
async function filtro(): Promise<string> {
  const origens = (await cfg("forca_origens", "nitron-direto-lp%,lp-nitron%")).split(",").map((s) => s.trim()).filter(Boolean);
  return "(" + [...origens.map((o) => `origem.ilike.${o}`), "forca_pedir_em.not.is.null"].join(",") + ")";
}

async function cfg(chave: string, padrao = ""): Promise<string> {
  try {
    const q = await rest(`copiloto_config?select=valor&chave=eq.${chave}`);
    const v = q.ok ? String((await q.json())[0]?.valor ?? "").trim() : "";
    return v || padrao;
  } catch { return padrao; }
}

// ---- credencial do Forca ----------------------------------------------------------------------
// O token vale 60 min. Guardar na instancia evita um /auth por lead. Nunca persistir: e credencial.
let tok: { t: string; exp: number } | null = null;
async function forcaToken(): Promise<string> {
  const seg = Deno.env.get("CRM_PEDIDO_SECRET") || "";
  if (!seg) throw new Error("CRM_PEDIDO_SECRET nao configurado");
  if (tok && tok.exp > Date.now() + 60_000) return tok.t;
  const r = await fetch(`${FORCA_BASE}/api/crm/auth`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: FORCA_ID, client_secret: seg }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`auth ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const d = await r.json();
  if (!d?.access_token) throw new Error("auth sem access_token");
  tok = { t: d.access_token, exp: Date.now() + (Number(d.expires_in) || 3600) * 1000 };
  return tok.t;
}

// ---- e-mail -----------------------------------------------------------------------------------
// Dominios nossos NAO sao e-mail de cliente. Sem isto, uma mensagem que cite `comercial@nitron...`
// viraria "o e-mail do lojista" e o cadastro nasceria no nosso proprio endereco.
const NOSSOS = /@(nitron\.com\.br|crm\.nitron\.com\.br|hyakgroup\.com\.br)$/i;
const RE_EMAIL = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;

function emailDoTexto(t: string): string {
  for (const m of String(t || "").match(RE_EMAIL) || []) {
    const e = m.trim().toLowerCase().replace(/[.,;:)\]}>]+$/, "");
    if (!NOSSOS.test(e) && e.length <= 160) return e;
  }
  return "";
}

async function emailDoCrm(contactId: string): Promise<string> {
  try {
    const r = await ghl("GET", `/contacts/${contactId}`);
    if (!r.ok) return "";
    const d = await r.json();
    const e = String(d?.contact?.email || "").trim().toLowerCase();
    return NOSSOS.test(e) ? "" : e;
  } catch { return ""; }
}

// O e-mail que o LOJISTA escreveu. So inbound: o que sai e nosso.
// Cobre de quebra a assinatura da landing do Google ("Origem: Campanha Acelera Nitron / E-mail: ..."),
// que chega como primeira mensagem DELE.
async function emailDaConversa(contactId: string): Promise<string> {
  try {
    const rc = await ghl("GET", `/conversations/search?locationId=${LOC}&contactId=${contactId}&limit=1`);
    if (!rc.ok) return "";
    const cv = (((await rc.json().catch(() => ({} as any)))?.conversations) || [])[0];
    if (!cv?.id) return "";
    const rm = await ghl("GET", `/conversations/${cv.id}/messages?limit=60`, undefined, "2021-04-15");
    if (!rm.ok) return "";
    const md = await rm.json().catch(() => ({} as any));
    const msgs: any[] = md?.messages?.messages || md?.messages || [];
    for (const m of msgs) {                       // vem do mais novo para o mais velho
      if (String(m?.direction) !== "inbound") continue;
      const e = emailDoTexto(m?.body || "");
      if (e) return e;
    }
    return "";
  } catch { return ""; }
}

// Gravar no CONTATO do CRM tambem: e de la que o resto do projeto le, e e o que o gestor pediu
// ("tanto para enviar para o forca quanto para enviar para o CRM").
async function gravarEmailNoCrm(contactId: string, email: string) {
  try { await ghl("PUT", `/contacts/${contactId}`, { email }); } catch { /* o lead ja tem */ }
}

// ---- envio por Zaptos --------------------------------------------------------------------------
async function enviar(contact_id: string, texto: string, instancia: string) {
  const r = await fetch(URL_() + "/functions/v1/campanhas-enviar", {
    method: "POST", headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ canal: "whatsapp", texto, instancia, contact_id }),
    signal: AbortSignal.timeout(90_000),
  });
  return await r.json().catch(() => ({ ok: false, motivo: "resposta ilegivel do campanhas-enviar" }));
}

const brl = (n: number) => "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const primeiroNome = (n: string) => String(n || "").trim().split(/\s+/)[0] || "";

type Cfg = Record<string, string>;

// O texto do link. Escrito em CODIGO, nao pelo modelo, de proposito: ele carrega preco minimo,
// percentual e validade — tres numeros que a Nina nao pode improvisar. A licao de 16/09 e a de
// 23/10 (o /0,90) sao a mesma: numero na boca da IA sem conta atras vira promessa que ninguem
// cumpre.
function textoDoLink(L: any, c: Cfg, pix: boolean): string {
  const nome = primeiroNome(L.nome);
  const min = Number(c.pedido_minimo || "3500") || 3500;
  const pctVol = 10, minVol = 5000;
  const val = L.forca_validade ? new Date(L.forca_validade + "T12:00:00Z").toLocaleDateString("pt-BR") : "";

  const linhas: string[] = [];
  linhas.push(nome ? `Prontinho, ${nome}! Seu acesso esta liberado.` : "Prontinho! Seu acesso esta liberado.");
  linhas.push("");
  linhas.push("Aqui voce ve o catalogo com o preco de cada produto, monta o pedido do seu jeito e envia direto pra gente:");
  linhas.push("");
  linhas.push(String(L.forca_link));
  linhas.push("");
  linhas.push(`O pedido minimo e de ${brl(min)}, e a partir de ${brl(minVol)} o desconto de ${pctVol}% ja entra sozinho no total — voce nao precisa pedir.`);
  if (pix) {
    const pct = Number(c.pix_desconto_pct || "5") || 5;
    const pmin = Number(c.pix_desconto_min || "5000") || 5000;
    const ate = c.pix_desconto_ate
      ? new Date(c.pix_desconto_ate + "T12:00:00Z").toLocaleDateString("pt-BR") : "";
    linhas.push(`E tem mais: se o pedido passar de ${brl(pmin)} ja com esse desconto e voce pagar por PIX, a gente ainda tira ${pct}%${ate ? ` — essa condicao vale ate ${ate}` : ""}. Me avisa aqui se quiser pagar assim que eu cuido disso com voce.`);
  }
  if (val) linhas.push(`O acesso fica aberto ate ${val}.`);
  linhas.push("");
  linhas.push("Qualquer duvida enquanto voce monta, e so me chamar por aqui.");
  return linhas.join("\n");
}

type Lead = { id: number; nome: string; cnpj: string; cep: string; fone: string; email: string | null;
              contact_id: string | null; empresa: string | null; forca_protocolo: string | null;
              forca_pedido: number | null; forca_link: string | null; forca_validade: string | null;
              forca_link_em: string | null; forca_pedir_em: string | null; criado: string;
              numero: string | null; complemento: string | null; forca_tarefa_id: number | null };

async function patch(id: number, campos: Record<string, unknown>) {
  await rest(`copiloto_lead?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(campos) });
}

// QUANDO O OUTRO LADO RECUSA, ALGUEM TEM DE FICAR SABENDO.
// Sem isto o lead entra num vao: a `forca-cadastro` pula quem tem `forca_erro`, e a Nina continua
// dizendo "ja estou preparando seu acesso" a cada vez que chama o `link_pedido` — um acesso que
// nunca vai chegar. E a doenca de 16/09 outra vez: a IA afirmando o que o sistema nao cumpre.
// CLIENTE_COM_REPRESENTANTE e CLIENTE_CLUBE ficam de FORA: ali o sistema funcionou, o lead tem
// dono, e o funil ja mostra isso na etapa propria — abrir tarefa para eles seria ruido.
// Uma tarefa por lead (`forca_tarefa_id`), para a rodada seguinte nao empilhar a mesma coisa.
const RECUSA_ESPERADA = /CLIENTE_COM_REPRESENTANTE|CLIENTE_CLUBE/i;
async function tarefaDeErro(L: Lead, erro: string) {
  if (L.forca_tarefa_id || RECUSA_ESPERADA.test(erro)) return;
  try {
    const det = [
      L.empresa ? "Loja: " + L.empresa : null,
      "Contato: " + L.nome,
      L.cnpj ? "CNPJ: " + digits(L.cnpj) : "Sem CNPJ",
      L.email ? "E-mail: " + L.email : null,
      L.fone ? "WhatsApp: " + digits(L.fone) : null,
      "",
      "O cadastro no Forca de Vendas foi RECUSADO: " + erro.slice(0, 300),
      "",
      "Enquanto isto nao for resolvido o lojista NAO recebe o acesso de compra, e a Nina nao tem",
      "como abrir o pedido dele. Resolver pelo cadastro, ou avisar que este lead sai do fluxo.",
      L.contact_id ? "Conversa: https://app.gohighlevel.com/v2/location/" + LOC + "/contacts/detail/" + L.contact_id : null,
    ].filter(Boolean).join("\n");
    const r = await rest("copiloto_tarefas", {
      method: "POST", headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        area: "comercial", tipo: "forca-cadastro-recusado",
        acao: ("Cadastro recusado no Forca: " + (L.empresa || L.nome || "lead")).slice(0, 500),
        detalhe: det.slice(0, 1500), cliente_nome: L.empresa || L.nome || null,
        contact_id: L.contact_id || null, origem: "nina-lead", prioridade: 2,
      }),
    });
    const id = r.ok ? (await r.json())[0]?.id ?? null : null;
    if (id) await patch(L.id, { forca_tarefa_id: id });
  } catch { /* o erro do cadastro ja esta gravado; a tarefa e o extra */ }
}

// ---- abre (ou termina de abrir) o pedido de UM lead -------------------------------------------
async function tratar(L: Lead): Promise<Record<string, unknown>> {
  const H = { Authorization: "Bearer " + (await forcaToken()), "Content-Type": "application/json" };
  const agora = new Date().toISOString();

  // JA TEM PROTOCOLO: so consultar. E isto que faz a varredura valer — a consulta empurra o
  // processamento do outro lado, entao o que ficou pela metade fecha aqui.
  if (L.forca_protocolo) {
    const g = await fetch(`${FORCA_BASE}/api/crm/orcamento/${L.forca_protocolo}`, { headers: H, signal: AbortSignal.timeout(120_000) });
    const e = await g.json().catch(() => ({} as any));
    if (e?.status === "pronto") {
      await patch(L.id, { forca_pedido: e.pedido, forca_link: e.link, forca_validade: e.validade, forca_erro: null, forca_em: agora });
      return { lead: L.id, nome: L.nome, acao: "terminado", pedido: e.pedido, validade: e.validade };
    }
    if (e?.status === "erro") {
      const msg = `${e.erro}: ${String(e.mensagem || "").slice(0, 200)}`;
      await patch(L.id, { forca_erro: msg, forca_em: agora });
      await tarefaDeErro(L, msg);
      return { lead: L.id, nome: L.nome, acao: "recusado", erro: e.erro, mensagem: e.mensagem };
    }
    return { lead: L.id, nome: L.nome, acao: "ainda processando", protocolo: L.forca_protocolo };
  }

  // NOVO: precisa de e-mail. Sem e-mail a API nem aceita o POST.
  // Tres fontes, nesta ordem: o que ja esta em casa, o contato do CRM, a conversa.
  let email = String(L.email || "").trim().toLowerCase();
  let fonte = email ? "lead" : "";
  if (!email && L.contact_id) {
    email = await emailDoCrm(L.contact_id);
    if (email) { fonte = "contato do CRM"; await patch(L.id, { email, email_origem: fonte }); }
  }
  if (!email && L.contact_id) {
    email = await emailDaConversa(L.contact_id);
    if (email) {
      fonte = "conversa";
      await patch(L.id, { email, email_origem: fonte });
      await gravarEmailNoCrm(L.contact_id, email);   // para o CRM parar de nascer sem e-mail
    }
  }
  if (!email) {
    await patch(L.id, { forca_erro: "sem e-mail: a API exige, e nao achei nem no lead, nem no contato do CRM, nem na conversa", forca_em: agora });
    return { lead: L.id, nome: L.nome, acao: "sem e-mail" };
  }

  // O OBJETO `entrega` SO VAI QUANDO TEM NUMERO (18/11). Sem ele o pedido nasce no endereco da
  // Receita, que no lojista costuma ser o escritorio do contador e nao o deposito — e foi por isso
  // que a LP passou a pedir numero e complemento. Mandar `entrega` com o CEP sozinho nao resolve
  // nada e ainda arrisca o outro lado recusar por endereco incompleto: ou vai inteiro, ou nao vai.
  const corpo: Record<string, unknown> = { cnpj: digits(L.cnpj), contato: L.nome.slice(0, 100), email, whatsapp: digits(L.fone) };
  const cepEnt = digits(L.cep);
  const numEnt = String(L.numero || "").trim().slice(0, 10);
  if (cepEnt.length === 8 && numEnt) {
    const cplEnt = String(L.complemento || "").trim().slice(0, 30);
    corpo.entrega = { cep: cepEnt, numero: numEnt, ...(cplEnt ? { complemento: cplEnt } : {}) };
  }
  const r = await fetch(`${FORCA_BASE}/api/crm/orcamento`, {
    method: "POST", headers: H, body: JSON.stringify(corpo), signal: AbortSignal.timeout(120_000),
  });
  const d = await r.json().catch(() => ({} as any));

  // O POST responde 202 nos DOIS casos (processando e pronto): quem manda e o campo `status`, nao
  // o codigo HTTP. Ler o HTTP aqui faria "processando" parecer conclusao.
  if (!d?.protocolo) {
    const m = `POST ${r.status}: ${String(d?.mensagem || d?.erro || "sem protocolo").slice(0, 200)}`;
    await patch(L.id, { forca_erro: m, forca_em: agora });
    return { lead: L.id, nome: L.nome, acao: "falhou", erro: m };
  }

  // Grava o protocolo ANTES de qualquer outra coisa: sem ele, o trabalho ja feito do lado deles
  // fica orfao e nao ha como terminar depois.
  await patch(L.id, { forca_protocolo: d.protocolo, forca_erro: null, forca_em: agora });

  if (d.status === "pronto") {
    await patch(L.id, { forca_pedido: d.pedido, forca_link: d.link, forca_validade: d.validade });
    return { lead: L.id, nome: L.nome, acao: "pronto na hora", protocolo: d.protocolo, pedido: d.pedido, email_de: fonte };
  }
  if (d.status === "erro") {
    const msg = `${d.erro}: ${String(d.mensagem || "").slice(0, 200)}`;
    await patch(L.id, { forca_erro: msg });
    await tarefaDeErro(L, msg);
    return { lead: L.id, nome: L.nome, acao: "recusado", erro: d.erro, mensagem: d.mensagem };
  }
  return { lead: L.id, nome: L.nome, acao: "aberto, processando", protocolo: d.protocolo, email_de: fonte };
}

// ---- entrega do link por Zaptos ----------------------------------------------------------------
async function entregarLinks(u: URL, dry: boolean) {
  const c: Cfg = {};
  for (const k of ["forca_link_enviar", "forca_link_janela_h", "forca_link_lote", "forca_link_instancia",
                   "pedido_minimo", "pix_desconto_ativo", "pix_desconto_pct", "pix_desconto_ate", "pix_desconto_min"]) {
    c[k] = await cfg(k, "");
  }
  const janelaH = Number(c.forca_link_janela_h || "36") || 36;
  const lote = Number(u.searchParams.get("limite") || c.forca_link_lote || "3") || 3;
  const inst = c.forca_link_instancia || "Nina";

  // O PIX so e dito enquanto a data valer — a frase some sozinha no dia seguinte.
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const pix = (c.pix_desconto_ativo || "nao").toLowerCase() === "sim" &&
              (!c.pix_desconto_ate || hoje <= c.pix_desconto_ate);

  const filtroOrigem = await filtro();
  const corte = Date.now() - janelaH * 3600_000;
  const sel = "id,nome,empresa,cnpj,fone,email,contact_id,forca_pedido,forca_link,forca_validade,forca_link_em,forca_pedir_em,criado";
  const q = await rest(`copiloto_lead?select=${sel}&or=${filtroOrigem}` +
    `&forca_link=not.is.null&forca_link_em=is.null&descartado_em=is.null&contact_id=not.is.null` +
    `&order=criado.desc&limit=200`);
  const todos: Lead[] = q.ok ? await q.json() : [];

  // A JANELA conta do momento em que o lead ficou ATIVO, nao so de quando nasceu: um lead de
  // semanas atras que a Nina acabou de atender tem `forca_pedir_em` de agora e E o fluxo novo.
  // Sem isso a janela calaria justamente o caso que o gestor pediu.
  const recente = (L: Lead) =>
    Math.max(new Date(L.criado || 0).getTime(), new Date((L as any).forca_pedir_em || 0).getTime()) >= corte;
  const cands = todos.filter(recente);
  // Quantos ficaram de FORA so pela janela: e o numero que decide se vale alargar, e sem ele a
  // previa parece dizer "nao ha ninguem" quando na verdade ha gente parada de semanas atras.
  const foraDaJanela = todos.length - cands.length;

  const fila = cands.slice(0, Math.max(1, Math.min(lote, 10)));
  const ligado = (c.forca_link_enviar || "nao").toLowerCase() === "sim";

  if (dry || !ligado) {
    return {
      ok: true, previa: true, ligado, instancia: inst, pix, janela_h: janelaH,
      a_enviar: cands.length, fora_da_janela: foraDaJanela,
      motivo: ligado ? null : "forca_link_enviar nao esta 'sim' — ligar e UPDATE em copiloto_config",
      fila: fila.map((L) => ({ lead: L.id, nome: L.nome, empresa: L.empresa, pedido: L.forca_pedido,
                               texto: textoDoLink(L, c, pix) })),
    };
  }

  const feito: Record<string, unknown>[] = [];
  for (const L of fila) {
    const agora = new Date().toISOString();
    // ANTES do envio. Licao do `toques` (02/10) e do `reativa_em` (03/11): o envio leva 12s de
    // checagem de entrega, e duas rodadas que se cruzam mandariam a mesma mensagem duas vezes.
    await patch(L.id, { forca_link_em: agora, forca_link_erro: null, ...(pix ? { forca_pix_em: agora } : {}) });
    try {
      const env = await enviar(L.contact_id!, textoDoLink(L, c, pix), inst);
      if (env?.ok) { feito.push({ lead: L.id, nome: L.nome, acao: "link enviado", pedido: L.forca_pedido, pix }); }
      else {
        await patch(L.id, { forca_link_erro: String(env?.motivo || "recusado").slice(0, 300) });
        feito.push({ lead: L.id, nome: L.nome, acao: "recusado", motivo: env?.motivo });
      }
    } catch (e) {
      await patch(L.id, { forca_link_erro: String(e).slice(0, 300) });
      feito.push({ lead: L.id, nome: L.nome, acao: "erro", detalhe: String(e).slice(0, 200) });
    }
  }
  return { ok: true, instancia: inst, pix, enviados: feito.filter((f) => f.acao === "link enviado").length,
           restam: cands.length - fila.length, fora_da_janela: foraDaJanela, feito };
}

Deno.serve(async (req) => {
  try {
    // Esta funcao escreve no ERP e fala com o lojista. So a chave de servico entra — e ela tem
    // DUAS grafias neste projeto: o SRV_JWT (o JWT que o PostgREST aceita) e o
    // SUPABASE_SERVICE_ROLE_KEY (que vem como `sb_secret_` e o PostgREST recusa). O cofre guarda
    // uma delas; aceitar as duas evita ficar trancado do lado de fora da propria funcao.
    const auth = req.headers.get("Authorization") || "";
    const aceitas = [Deno.env.get("SRV_JWT"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")]
      .filter(Boolean).map((k) => "Bearer " + k);
    if (!aceitas.includes(auth)) return j({ ok: false, erro: "nao autorizado" }, 401);

    const u = new URL(req.url);
    const acao = u.searchParams.get("acao") || "";
    const dry = u.searchParams.get("dry") === "1" || acao === "fila" || acao === "links";

    if (acao === "links" || acao === "enviar_links") return j(await entregarLinks(u, acao === "links"));

    // ---- ?acao=avulso: chama a API com UM CNPJ qualquer, sem tocar na fila de leads -----------
    // Serve para ver o que a API faz com cliente que JA e da casa: atendido por representante,
    // inativo ha anos, com Clube vigente. E chamada DE VERDADE — se a API nao recusar, nasce
    // pedido no ERP. O resultado fica em `forca_teste` para a decisao nao depender de memoria.
    if (acao === "avulso") {
      const cnpj = digits(u.searchParams.get("cnpj"));
      const contato = (u.searchParams.get("contato") || "").trim();
      const email = (u.searchParams.get("email") || "").trim().toLowerCase();
      const whatsapp = digits(u.searchParams.get("whatsapp"));
      const caso = (u.searchParams.get("caso") || "").slice(0, 40);
      const razao = (u.searchParams.get("razao") || "").slice(0, 200);
      const codparc = Number(u.searchParams.get("codparc") || 0) || null;
      if (cnpj.length !== 14 || !contato || !email || whatsapp.length < 10) {
        return j({ ok: false, erro: "avulso exige cnpj(14), contato, email e whatsapp" }, 400);
      }
      const t0 = Date.now();
      const H = { Authorization: "Bearer " + (await forcaToken()), "Content-Type": "application/json" };
      const r = await fetch(`${FORCA_BASE}/api/crm/orcamento`, {
        method: "POST", headers: H, body: JSON.stringify({ cnpj, contato, email, whatsapp }),
        signal: AbortSignal.timeout(120_000),
      });
      let d = await r.json().catch(() => ({} as any));
      let consultas = 0;
      // Consulta ate fechar. Cada GET empurra o processamento do outro lado.
      while (d?.protocolo && d?.status === "processando" && consultas < 8) {
        await new Promise((s) => setTimeout(s, 12_000));
        consultas++;
        const g = await fetch(`${FORCA_BASE}/api/crm/orcamento/${d.protocolo}`, { headers: H, signal: AbortSignal.timeout(120_000) });
        const e = await g.json().catch(() => ({} as any));
        if (e?.status) d = { ...d, ...e };
        if (d.status !== "processando") break;
      }
      const seg = Math.round((Date.now() - t0) / 100) / 10;
      const reg = { caso, codparc, razao, cnpj, contato, email, whatsapp,
                    protocolo: d?.protocolo || null, pedido: d?.pedido || null, link: d?.link || null,
                    validade: d?.validade || null, erro: d?.erro || null,
                    mensagem: d?.mensagem || null, consultas, segundos: seg };
      await rest("forca_teste", { method: "POST", body: JSON.stringify(reg) });
      return j({ ok: true, caso, razao, http: r.status, status: d?.status || null, segundos: seg, consultas, ...reg });
    }

    const filtroOrigem = await filtro();
    const sel = "id,nome,cnpj,cep,fone,email,contact_id,empresa,numero,complemento,forca_protocolo,forca_pedido,forca_link,forca_validade,forca_link_em,forca_erro,forca_tarefa_id,criado";

    if (acao === "status") {
      const q = await rest(`copiloto_lead?select=${sel}&or=${filtroOrigem}&limit=1000`);
      const rows = q.ok ? await q.json() : [];
      return j({
        ok: true, filtro: filtroOrigem,
        total: rows.length,
        com_pedido: rows.filter((r: any) => r.forca_pedido).length,
        link_entregue: rows.filter((r: any) => r.forca_link_em).length,
        link_a_entregar: rows.filter((r: any) => r.forca_link && !r.forca_link_em).length,
        processando: rows.filter((r: any) => r.forca_protocolo && !r.forca_pedido && !r.forca_erro).length,
        com_erro: rows.filter((r: any) => r.forca_erro).length,
        nunca_enviados: rows.filter((r: any) => !r.forca_protocolo && !r.forca_erro).length,
        ativo: await cfg("forca_ativo", "nao"),
        link_enviar: await cfg("forca_link_enviar", "nao"),
      });
    }

    // A FILA tem duas partes, e a ordem importa: primeiro quem ja tem protocolo (terminar o que
    // esta a meio custa uma chamada e fecha um pedido), depois quem nunca foi.
    // `descartado_em` fica de fora das duas: lead descartado a mao nao volta pela porta dos fundos.
    const qp = await rest(`copiloto_lead?select=${sel}&or=${filtroOrigem}&descartado_em=is.null&forca_protocolo=not.is.null&forca_pedido=is.null&forca_erro=is.null&order=criado.asc&limit=50`);
    const pendentes: Lead[] = qp.ok ? await qp.json() : [];
    const qn = await rest(`copiloto_lead?select=${sel}&or=${filtroOrigem}&descartado_em=is.null&forca_protocolo=is.null&forca_erro=is.null&order=criado.desc&limit=50`);
    const novos: Lead[] = (qn.ok ? await qn.json() : []).filter((l: Lead) => digits(l.cnpj).length === 14);

    const lote = Number(await cfg("forca_lote", "3")) || 3;
    const limite = Math.max(1, Math.min(Number(u.searchParams.get("limite") || lote) || lote, 20));
    const fila = [...pendentes, ...novos].slice(0, limite);

    if (dry) {
      return j({ ok: true, previa: true, filtro: filtroOrigem, lote, limite,
        terminar: pendentes.length, abrir: novos.length,
        fila: fila.map((l) => ({ lead: l.id, nome: l.nome, empresa: l.empresa, cnpj: digits(l.cnpj),
                                 tem_email: !!l.email, tem_numero: !!l.numero, protocolo: l.forca_protocolo })) });
    }

    const ativo = (await cfg("forca_ativo", "nao")).toLowerCase();
    if (ativo !== "sim") return j({ ok: false, erro: "forca_ativo nao esta 'sim' — ligar e UPDATE em copiloto_config", fila: fila.length });
    if (!Deno.env.get("CRM_PEDIDO_SECRET")) return j({ ok: false, erro: "CRM_PEDIDO_SECRET nao configurado" }, 500);

    const feito: Record<string, unknown>[] = [];
    for (const L of fila) {
      try { feito.push(await tratar(L)); }
      catch (e) { feito.push({ lead: L.id, nome: L.nome, acao: "erro", detalhe: String(e).slice(0, 200) }); }
    }

    // Abriu pedido? Entao entrega o link na mesma rodada — o lojista nao espera o proximo cron.
    let links: unknown = null;
    try { links = await entregarLinks(u, false); } catch (e) { links = { ok: false, erro: String(e).slice(0, 200) }; }

    return j({ ok: true, processados: feito.length, restam_terminar: pendentes.length, restam_abrir: novos.length, feito, links });
  } catch (e) {
    return j({ ok: false, erro: String(e).slice(0, 400) }, 500);
  }
});
