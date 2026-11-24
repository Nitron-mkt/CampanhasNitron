// forca-perguntar — REABORDA QUEM RECEBEU O LINK DO FORCA E NAO FECHOU, e AVISA O GESTOR QUEM RESPONDER.
//
// Ordem do gestor em 24/11, depois de ler a medicao da coorte do link (34 links entregues,
// nenhum pedido concluido na tela, 6 lojistas que nunca escreveram uma linha):
//   "Quero que volte a reativar essa galera por mensagem perguntando o motivo do nao fechamento,
//    se precisa de algo ou nao. Qualquer um que responder voce deve me informar no whatsapp que
//    eles responderam (...) Talvez perguntar se ele quer o contato de um vendedor?"
//
// SAO DUAS PASSADAS, E A SEGUNDA E O MOTIVO DE A FUNCAO EXISTIR:
//   ?acao=perguntar — manda UMA pergunta a quem recebeu o link ha mais de `forca_perg_espera_h`.
//   ?acao=ler       — acha quem respondeu depois da pergunta e AVISA quem tem `avisar=true`.
//   ?acao=tudo      — le primeiro, pergunta depois (e o que o cron chama; um cron a menos).
//
// POR QUE NAO E A `forca-cutucar`, QUE JA CUTUCA ESTE MESMO PUBLICO: sao dois relogios e duas
// perguntas. A cutucada e de 45 MINUTOS e pergunta "conseguiu abrir o link?" — e sobre a tela.
// Esta e de DIAS e pergunta "o que pesou pra nao fechar, precisa de alguma coisa?" — e sobre a
// venda. E so esta avisa o gestor. Misturar faria um teto corromper o outro, e a cutucada esta
// no ar atendendo lead desde 18/11.
//
// A PERGUNTA NAO AFIRMA QUE ELE NAO PEDIU, E ISSO NAO E PRECIOSISMO: nao da para saber.
// O sinal seria o `AD_STATUFORCA` do Sankhya (ou o `situacao` do GET do protocolo, que volta null),
// e nenhum dos dois chega aqui. Entao a frase pergunta SE ele chegou a fechar — que continua
// verdadeira se ele ja tiver enviado o pedido. Afirmar o que nao se mediu e o erro de 16/09.
//
// O VENDEDOR E OFERTA, NAO PROMESSA DE HORA. Quem aceitar cai na `passar_comercial` da Nina
// (licoes 474 e 475), que abre tarefa no CRM com dono. Aqui nao se marca hora nem se promete ligacao.
//
// TRAVAS (cada uma com motivo medido):
//   - `forca_perg_ativo` e o cron sao DUAS coisas: a licao de 16/09 vale aqui igual.
//   - `forca_perg_espera_h` (24h): quem recebeu o link hoje de manha esta sendo cutucado pela
//     `forca-cutucar`, nao reabordado. Em 24/11 isso sozinho segura 8 dos 35.
//   - `forca_perg_silencio_h` (24h): se ele escreveu agora ha pouco, a conversa esta VIVA e quem
//     atende e o `copiloto-lead`. Entrar por cima e o que a Nina fez com o representante em 16/09.
//   - `forca_perg_max` (1): uma pergunta por lead. Duas viram cobranca.
//   - TETO DE ESPONTANEAS EM 24h (2), contado NA CONVERSA DO CRM e nao num contador nosso — o
//     `toques` do `copiloto_lead` mente (StarLuz, lead 564). Espontanea e a mensagem cuja anterior
//     tambem e nossa: RESPONDER NAO E INSISTIR. Na previa de 24/11 isso sozinho segurou 2 dos 10
//     (Pedro 718 e Katiani 722, com 3 espontaneas cada nas ultimas 24h).
//   - DEDUPE POR CNPJ: o mesmo lojista pode ter duas linhas de lead (765 e 766, Lucas Moraes,
//     mesmo CNPJ e mesmo pedido 1715623). Sem isso ele levaria a mesma pergunta duas vezes.
//   - `forca_perg_pular`: ids que nao entram. Nasce com o 689 (SIMONI), o unico da coorte que
//     ja comprou — perguntar a quem comprou por que nao comprou e o pior erro possivel aqui.
//   - `forca_perg_em` e gravado ANTES do envio. Licao do `toques` (02/10) e do `reativa_em` (03/11).
//   - 9h as 20h de Sao Paulo, sem domingo, nas DUAS passadas. O aviso ao gestor tambem e
//     iniciativa nossa, e noticia boa de madrugada ainda e madrugada.
//
// Uso: ?dry=1 (previa em qualquer acao) | ?lead=N | ?limite=N

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o, null, 2), { status: s, headers: { "Content-Type": "application/json" } });

const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const URL_ = () => Deno.env.get("SUPABASE_URL")!;
const GHL = (Deno.env.get("GHL_TOKEN") || "").trim();
const LOC = "rZ8y7lzqV7fzxsartaX2";
const MODELO = "claude-sonnet-5";

const prim = (s: any) => (String(s || "").trim().split(/\s+/)[0] || "");
const norm = (s: any) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const d14 = (s: any) => String(s || "").replace(/\D/g, "");

// Autoresposta da loja DELE nao e "ele respondeu" — a Natalie caiu nesse vao em 10/09.
const RE_RUIDO = /(codigo de confirmacao|undecryptable|descriptografar|ative as listas|agradece(mos)? (seu contato|sua mensagem)|atendente virtual|horario de atendimento|entraremos em contato|selecione (a|uma|um) (opcao|assunto)|(estou|estamos) indisponive|nao (estou|estamos) disponive|retornare(i|mos) assim que|respondere(i|mos) assim que|ouvidoria|mensagem automatica)/;
const ehRuido = (t: any) => RE_RUIDO.test(norm(t));
const limpa = (t: any) => String(t || "").replace(/Instance Source:.*/is, "").replace(/#contact_instance:\S+/gi, "").replace(/\s+/g, " ").trim();

function fmtDoc(cnpj: any): string | null {
  const d = d14(cnpj);
  if (!d) return null;
  if (d.length === 14) return "CNPJ: " + d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return "CPF: " + d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return "Documento: " + d;
}

const brtTxt = (iso: any) => {
  if (!iso) return "-";
  const t = new Date(iso).getTime();
  if (!t) return "-";
  const b = new Date(t - 3 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(b.getUTCDate())}/${p(b.getUTCMonth() + 1)} ${p(b.getUTCHours())}h${p(b.getUTCMinutes())}`;
};

const dias = (iso: any) => {
  const t = new Date(iso || 0).getTime();
  if (!t) return 0;
  return Math.max(0, Math.round((Date.now() - t) / 86400000));
};

async function rest(path: string, init?: RequestInit) {
  const k = srvKey();
  return await fetch(`${URL_()}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: k, Authorization: "Bearer " + k, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
}

const ghl = (m: string, p: string, v = "2021-07-28") =>
  fetch("https://services.leadconnectorhq.com" + p, {
    method: m, headers: { Authorization: "Bearer " + GHL, Version: v, Accept: "application/json", "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20_000),
  });

async function cfgAll(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const q = await rest("copiloto_config?select=chave,valor&limit=1000");
    for (const r of (q.ok ? await q.json() : [])) out[r.chave] = String(r.valor ?? "").trim();
  } catch { /* vazio */ }
  return out;
}

async function licoes(): Promise<string> {
  try {
    const q = await rest("copiloto_licoes?select=licao&ativo=is.true&order=id");
    const ls = (q.ok ? await q.json() : []).map((r: any) => "- " + r.licao);
    return ls.length ? "\n\nLICOES DO GESTOR (tem PRIORIDADE, siga a risca):\n" + ls.join("\n") : "";
  } catch { return ""; }
}

async function enviar(body: Record<string, unknown>) {
  const r = await fetch(URL_() + "/functions/v1/campanhas-enviar", {
    method: "POST", headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ canal: "whatsapp", ...body }),
    signal: AbortSignal.timeout(90_000),
  });
  return await r.json().catch(() => ({ ok: false, motivo: "resposta ilegivel do campanhas-enviar" }));
}

async function anthropic(system: string, user: string): Promise<string> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("sem ANTHROPIC_API_KEY");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODELO, max_tokens: 400, system, messages: [{ role: "user", content: user }] }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!r.ok) throw new Error("anthropic " + r.status + " " + (await r.text()).slice(0, 200));
  const d = await r.json();
  return String(d?.content?.[0]?.text || "").trim();
}

const patch = (id: number, campos: Record<string, unknown>) =>
  rest(`copiloto_lead?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(campos) });

function foraDaJanela(c: Record<string, string>): string | null {
  const brt = new Date(Date.now() - 3 * 3600 * 1000);
  if (brt.getUTCDay() === 0) return "domingo";
  const h = brt.getUTCHours();
  const ini = parseInt(c.forca_perg_hora_ini || "9") || 9;
  const fim = parseInt(c.forca_perg_hora_fim || "20") || 20;
  if (h < ini || h >= fim) return `fora de ${ini}h-${fim}h de Sao Paulo (agora ${h}h)`;
  return null;
}

// ---- A CONVERSA DO CRM, QUE E QUEM MANDA ------------------------------------------------------
// Devolve as mensagens do mais VELHO para o mais novo, que e a ordem em que se conta espontanea.
async function conversa(contact_id: string) {
  const rc = await ghl("GET", `/conversations/search?locationId=${LOC}&contactId=${contact_id}&limit=1`);
  const cv = (((await rc.json().catch(() => ({} as any)))?.conversations) || [])[0];
  if (!cv?.id) return null;
  const rm = await ghl("GET", `/conversations/${cv.id}/messages?limit=25`, "2021-04-15");
  const md = await rm.json().catch(() => ({} as any));
  const novas: any[] = (md?.messages?.messages || md?.messages || []);
  return { id: cv.id, msgs: novas.slice().reverse() };
}

const ehEntrada = (m: any) => String(m?.direction) === "inbound" && !ehRuido(m?.body);
const quando = (m: any) => new Date(m?.dateAdded || 0).getTime();

function espontaneasEm24h(ordem: any[]): number {
  const agora = Date.now();
  let n = 0;
  for (let i = 0; i < ordem.length; i++) {
    const m = ordem[i];
    if (String(m?.direction) !== "outbound") continue;
    if (agora - quando(m) > 24 * 3600_000) continue;
    const ant = ordem[i - 1];
    if (!ant || String(ant.direction) === "outbound") n++;
  }
  return n;
}

// ---- O TEXTO DE RESERVA -----------------------------------------------------------------------
// Existe para que uma falha do modelo nao vire silencio. Ele ja carrega as tres coisas que o
// gestor pediu: o motivo, se falta alguma coisa, e a oferta do vendedor.
// COM ACENTO, de proposito: ele JA SAIU para o lead 706 em 24/11 (a chamada ao modelo falhou
// naquela passada) e chegou escrito "Voce chegou a fechar" na tela do lojista.
function textoReserva(nome: string, comVendedor: boolean): string {
  const n = prim(nome);
  return (n ? `Oi, ${n}! ` : "Oi! ") +
    "Te mandei o acesso pra montar o pedido e fiquei sem retorno por aqui. " +
    "Você chegou a fechar, ou ficou faltando alguma coisa pra decidir? " +
    (comVendedor
      ? "Se preferir falar com uma pessoa, eu peço pra um vendedor nosso te chamar e montar junto com você."
      : "Me conta o que pesou que eu te ajudo.");
}

// ---- O AVISO AO GESTOR ------------------------------------------------------------------------
function textoGestor(L: any, resposta: string, quandoResp: any): string {
  return [
    "LOJISTA RESPONDEU — reabordagem do link do Forca",
    "",
    `${L.nome || "(sem nome)"}${L.empresa ? " — " + L.empresa : ""}`,
    fmtDoc(L.cnpj),
    L.cidade ? `Cidade: ${L.cidade}${L.uf ? "/" + L.uf : ""}` : null,
    L.forca_pedido ? `Pedido no Forca: ${L.forca_pedido}` : null,
    `Link entregue em ${brtTxt(L.forca_link_em)} (ha ${dias(L.forca_link_em)} dia(s))`,
    "",
    `PERGUNTAMOS em ${brtTxt(L.forca_perg_em)}:`,
    `"${String(L.forca_perg_texto || "(texto nao gravado)").slice(0, 400)}"`,
    "",
    `ELE RESPONDEU em ${brtTxt(quandoResp)}:`,
    `"${resposta.slice(0, 600)}"`,
    "",
    "A Nina segue a conversa normalmente. Se ele pedir vendedor, ela abre a tarefa no CRM.",
    `Conversa: https://app.gohighlevel.com/v2/location/${LOC}/contacts/detail/${L.contact_id || ""}`,
  ].filter((x) => x !== null).join("\n");
}

async function avisarInternos(texto: string, inst: string) {
  const out: any[] = [];
  try {
    const q = await rest("copiloto_responsaveis?select=nome,fone,avisar&avisar=is.true");
    const resp: any[] = q.ok ? await q.json() : [];
    const vistos = new Set<string>();
    for (const r of resp) {
      const f = d14(r.fone);
      const k = f.slice(-8);                        // o gestor aparece em duas areas; avisar uma vez
      if (!f || !k || vistos.has(k)) continue;
      vistos.add(k);
      const e: any = await enviar({ texto, instancia: inst, fone: f });
      out.push({ quem: r.nome, ok: !!e?.ok, motivo: e?.ok ? undefined : String(e?.motivo || "").slice(0, 160) });
    }
  } catch (e) { out.push({ erro: String(e).slice(0, 160) }); }
  return out;
}

const SEL = "id,nome,empresa,cnpj,contact_id,cidade,uf,interesse,origem,forca_pedido,forca_link_em," +
            "forca_perg_em,forca_perg_vezes,forca_perg_texto,forca_perg_resp_em,forca_perg_aviso_em,ultima_msg_id";

// ===== PASSADA 1 — PERGUNTAR ===================================================================
async function perguntar(c: Record<string, string>, dry: boolean, soLead: number, lote: number) {
  const agora = Date.now();
  const esperaH = Number(c.forca_perg_espera_h || "24") || 24;
  const silencioH = Number(c.forca_perg_silencio_h || "24") || 24;
  const maxVezes = Number(c.forca_perg_max || "1") || 1;
  const maxDia = Number(c.forca_perg_max_dia || "2") || 2;
  const inst = c.forca_link_instancia || "Nina";
  const ligado = (c.forca_perg_ativo || "nao").toLowerCase() === "sim";
  const comVendedor = (c.forca_perg_vendedor || "sim").toLowerCase() === "sim";
  const pular = new Set((c.forca_perg_pular || "").split(",").map((x) => x.trim()).filter(Boolean));

  const url = soLead
    ? `copiloto_lead?select=${SEL}&id=eq.${soLead}`
    : `copiloto_lead?select=${SEL}&forca_link_em=not.is.null&descartado_em=is.null&contact_id=not.is.null` +
      `&forca_perg_vezes=lt.${maxVezes}` +
      `&forca_link_em=lt.${new Date(agora - esperaH * 3600_000).toISOString()}` +
      `&order=forca_link_em.asc&limit=40`;
  const q = await rest(url);
  const cands: any[] = q.ok ? await q.json() : [];

  const lic = dry ? "" : await licoes();
  const feito: any[] = [];
  const cnpjVistos = new Set<string>();
  let mandados = 0;

  for (const L of cands) {
    if (mandados >= lote) break;
    const base = { lead: L.id, nome: L.nome, empresa: L.empresa, pedido: L.forca_pedido, link_em: brtTxt(L.forca_link_em) };

    if (!soLead && pular.has(String(L.id))) { feito.push({ ...base, decisao: "pular", motivo: "esta em forca_perg_pular" }); continue; }
    const doc = d14(L.cnpj);
    if (doc && cnpjVistos.has(doc)) { feito.push({ ...base, decisao: "pular", motivo: "mesmo CNPJ de outro lead ja tratado nesta rodada" }); continue; }

    const cv = await conversa(L.contact_id);
    if (!cv) { feito.push({ ...base, decisao: "pular", motivo: "sem conversa no CRM" }); continue; }
    const ordem = cv.msgs;

    // CONVERSA VIVA E DO `copiloto-lead`.
    const ultEntrada = ordem.filter(ehEntrada).pop();
    if (ultEntrada && agora - quando(ultEntrada) < silencioH * 3600_000) {
      feito.push({ ...base, decisao: "pular", motivo: `ele escreveu ha menos de ${silencioH}h — a conversa esta viva e quem atende e o copiloto-lead` });
      continue;
    }

    const esp = espontaneasEm24h(ordem);
    if (esp >= maxDia) { feito.push({ ...base, decisao: "pular", motivo: `ja mandamos ${esp} mensagens espontaneas nas ultimas 24h (teto ${maxDia})` }); continue; }

    const hist = ordem.slice(-10).map((m: any) =>
      (String(m?.direction) === "inbound" ? "LOJISTA: " : "NINA: ") + limpa(m?.body).slice(0, 300)).join("\n");
    const mudo = !L.ultima_msg_id && !ordem.some(ehEntrada);

    const sistema =
      "Voce e a Nina, da Nitron (utilidades domesticas, venda no atacado para lojistas). " +
      "Escreva UMA mensagem de WhatsApp, no maximo 3 frases, em portugues do Brasil, tom de gente.\n" +
      "SITUACAO: ha " + dias(L.forca_link_em) + " dia(s) voce mandou a este lojista o acesso onde ele monta e " +
      "envia o pedido, e depois disso ele nao deu retorno.\n" +
      (mudo ? "ATENCAO: este lojista NUNCA escreveu nada — ele preencheu o formulario e recebeu o acesso. Nao diga 'conversamos' nem 'como combinamos'.\n" : "") +
      "A MENSAGEM PRECISA TER AS TRES COISAS, nessa ordem e sem parecer formulario:\n" +
      "1. perguntar, SEM COBRAR, o que pesou para ele nao ter fechado ainda;\n" +
      "2. perguntar se esta faltando alguma coisa da nossa parte (duvida de produto, de condicao, de quantidade);\n" +
      (comVendedor ? "3. oferecer que um VENDEDOR nosso fale com ele e monte o pedido junto, se ele preferir pessoa a aplicativo.\n"
                   : "3. se colocar a disposicao para ajudar a montar.\n") +
      "REGRAS DURAS:\n" +
      "- NAO AFIRME que ele nao fez o pedido: voce NAO SABE se ele enviou. Pergunte SE ele chegou a fechar.\n" +
      "- NAO diga nem sugira que voce VIU o que ele fez na pagina (se abriu, se montou, se tem carrinho): esse dado NAO EXISTE aqui.\n" +
      "  Pode dizer que, se ele preferir, uma pessoa monta junto com ele.\n" +
      "- NAO comente episodio passado da conversa nem faca graca com atrito anterior: va direto ao ponto.\n" +
      "- NAO repita o link e NAO cite prazo, frete, validade nem pedido minimo.\n" +
      "- Desconto: a UNICA coisa que voce pode dizer, se couber, e que a partir de R$ 5.000 entram 10% sozinhos. Nenhum outro numero.\n" +
      "- NAO marque hora nem prometa ligacao: o vendedor e uma OFERTA, e ele precisa aceitar.\n" +
      "- Nada de 'estamos aguardando seu retorno', 'ultima chance' ou pressao.\n" +
      "Responda SO com o texto da mensagem, sem aspas e sem comentario." + lic;
    const usuario = `Lojista: ${L.nome}${L.empresa ? " (" + L.empresa + ")" : ""}` +
      `${L.cidade ? " — " + L.cidade + "/" + (L.uf || "") : ""}\n` +
      `${L.interesse ? "Interesse dito por ele: " + String(L.interesse).slice(0, 300) + "\n" : ""}` +
      `Ultimas mensagens da conversa:\n${hist || "(ele nunca escreveu — so saiu mensagem nossa)"}`;

    let texto = "";
    try { texto = await anthropic(sistema, usuario); } catch (_e) { texto = ""; }
    if (!texto || texto.length > 700) texto = textoReserva(L.nome, comVendedor);

    if (doc) cnpjVistos.add(doc);

    if (dry) {
      feito.push({ ...base, decisao: "previa", dias_do_link: dias(L.forca_link_em), nunca_escreveu: mudo, espontaneas_24h: esp, rascunho: texto });
      mandados++;
      continue;
    }
    if (!ligado) { feito.push({ ...base, decisao: "pular", motivo: "forca_perg_ativo nao esta 'sim'" }); continue; }

    // ANTES do envio.
    await patch(L.id, { forca_perg_em: new Date().toISOString(), forca_perg_vezes: (L.forca_perg_vezes || 0) + 1, forca_perg_texto: texto, forca_perg_erro: null });
    const env: any = await enviar({ texto, instancia: inst, contact_id: L.contact_id });
    mandados++;
    if (!env?.ok) await patch(L.id, { forca_perg_erro: String(env?.motivo || "recusado").slice(0, 300) });
    feito.push({ ...base, decisao: env?.ok ? "perguntado" : "recusado", dias_do_link: dias(L.forca_link_em), motivo: env?.ok ? undefined : env?.motivo, texto });
  }

  return { ligado, instancia: inst, candidatos: cands.length, tratados: feito.length, feito };
}

// ===== PASSADA 2 — LER E AVISAR ================================================================
async function ler(c: Record<string, string>, dry: boolean, soLead: number, lote: number) {
  const diasLer = Number(c.forca_perg_ler_dias || "7") || 7;
  const inst = c.forca_perg_aviso_instancia || c.forca_link_instancia || "Nina";
  const ligado = (c.forca_perg_aviso_ativo || "sim").toLowerCase() === "sim";
  // TETO DE VARREDURA: `avisados` so anda quando ACHA resposta, entao sem isto uma fila de 40
  // leads custa 80 chamadas ao GHL e a rodada morre em IDLE_TIMEOUT (150s) — a licao do lote
  // de 12 da reativacao e do lote de 3 do pos-link.
  const scanMax = Number(c.forca_perg_ler_scan || "15") || 15;

  const url = soLead
    ? `copiloto_lead?select=${SEL}&id=eq.${soLead}&forca_perg_em=not.is.null`
    : `copiloto_lead?select=${SEL}&forca_perg_em=not.is.null&forca_perg_aviso_em=is.null&contact_id=not.is.null` +
      `&forca_perg_em=gt.${new Date(Date.now() - diasLer * 86400_000).toISOString()}` +
      `&order=forca_perg_em.desc&limit=40`;
  const q = await rest(url);
  const cands: any[] = q.ok ? await q.json() : [];

  const feito: any[] = [];
  let avisados = 0;
  let olhados = 0;

  for (const L of cands) {
    if (avisados >= lote || olhados >= scanMax) break;
    olhados++;
    const base = { lead: L.id, nome: L.nome, empresa: L.empresa, perguntado_em: brtTxt(L.forca_perg_em) };

    const cv = await conversa(L.contact_id);
    if (!cv) { feito.push({ ...base, decisao: "pular", motivo: "sem conversa no CRM" }); continue; }

    const corte = new Date(L.forca_perg_em).getTime();
    const resp = cv.msgs.filter((m: any) => ehEntrada(m) && quando(m) > corte).pop();
    if (!resp) { feito.push({ ...base, decisao: "aguardando", motivo: "nenhuma resposta depois da pergunta" }); continue; }

    const texto = limpa(resp.body) || "(mensagem sem texto — audio, imagem ou anexo)";
    const aviso = textoGestor(L, texto, resp.dateAdded);

    if (dry) {
      feito.push({ ...base, decisao: "previa", respondeu_em: brtTxt(resp.dateAdded), resposta: texto.slice(0, 300), aviso });
      avisados++;
      continue;
    }
    if (!ligado) { feito.push({ ...base, decisao: "pular", motivo: "forca_perg_aviso_ativo nao esta 'sim'", resposta: texto.slice(0, 300) }); continue; }

    // ANTES do envio, como toda marca daqui.
    await patch(L.id, {
      forca_perg_resp_em: new Date(resp.dateAdded).toISOString(),
      forca_perg_resp: texto.slice(0, 1000),
      forca_perg_aviso_em: new Date().toISOString(),
    });
    const envs = await avisarInternos(aviso, inst);
    avisados++;
    feito.push({ ...base, decisao: "avisado", respondeu_em: brtTxt(resp.dateAdded), resposta: texto.slice(0, 300), avisos: envs });
  }

  return { ligado, instancia: inst, candidatos: cands.length, olhados, tratados: feito.length, feito };
}

Deno.serve(async (req) => {
  try {
    const auth = req.headers.get("Authorization") || "";
    const aceitas = [Deno.env.get("SRV_JWT"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")]
      .filter(Boolean).map((k) => "Bearer " + k);
    if (!aceitas.includes(auth)) return j({ ok: false, erro: "nao autorizado" }, 401);
    if (!GHL) return j({ ok: false, erro: "sem GHL_TOKEN" }, 500);

    const u = new URL(req.url);
    const dry = u.searchParams.get("dry") === "1";
    const soLead = Number(u.searchParams.get("lead") || 0) || 0;
    const acao = (u.searchParams.get("acao") || "tudo").toLowerCase();

    const c = await cfgAll();
    const lote = Math.max(1, Math.min(Number(u.searchParams.get("limite") || c.forca_perg_lote || "3") || 3, 10));

    const fora = foraDaJanela(c);
    if (fora && !dry && !soLead) return j({ ok: true, acao, fora_da_janela: fora, enviou: 0 });

    const out: Record<string, unknown> = { ok: true, acao, previa: dry, lote };
    if (acao === "ler" || acao === "tudo") out.leitura = await ler(c, dry, soLead, lote);
    if (acao === "perguntar" || acao === "tudo") out.pergunta = await perguntar(c, dry, soLead, lote);
    if (!out.leitura && !out.pergunta) return j({ ok: false, erro: "acao desconhecida: use perguntar, ler ou tudo" }, 400);
    return j(out);
  } catch (e) {
    return j({ ok: false, erro: String(e).slice(0, 400) }, 500);
  }
});
