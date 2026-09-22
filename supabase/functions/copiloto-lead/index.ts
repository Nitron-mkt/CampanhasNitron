// copiloto-lead (v11) — NOME E SOBRENOME, confirmados com a pessoa, e gravados NO CRM. Ordem do
// gestor em 22/09: o nome que a Nina usava vinha do perfil do WhatsApp — apelido, emoji ("🙂",
// "😜"), versiculo ("Deus E Fiel") ou o nome da loja. O consultor recebia o lead sem saber com quem
// ia falar. Agora ela pergunta o nome completo uma vez, cedo, e so grava como confirmado o que a
// PESSOA escreveu (nomePlausivel: duas palavras, sem numero, sem emoji). Com o nome confirmado, o
// contato do CRM e atualizado (firstName/lastName) — nao adianta a Nina saber e o CRM continuar
// mostrando o apelido para quem for atender. E o nome confirmado nao e mais sobrescrito pelo do
// perfil na rodada seguinte: era o mesmo vao que fazia o status voltar atras na v4.
// copiloto-lead (v10) — O TELEFONE DO LEAD ERA GRAVADO DECAPITADO. d10() guardava os ultimos 10
// digitos de um numero que vem do CRM com DDI, entao "+5511982408982" virava "1982408982": o 55 saiu
// levando junto o primeiro digito do DDD, e o nono digito do celular tomou o lugar dele. O numero
// gravado vira de outra praca — as vezes um numero que EXISTE, de um desconhecido. Cinco dos oito
// leads repassados foram entregues a representante com numero inexistente, e esses leads ficaram
// esperando. Agora grava o nacional inteiro (foneNac) e a busca aceita as duas formas, para os
// registros antigos de 10 digitos nao virarem lead duplicado.
// copiloto-lead (v9) — NUMERO DE CASA nunca e lead. O resumo do encerramento passou a sair pelo
// Zaptos da Nina para o gestor, e o contato dele no CRM tem `source` preenchido ("Form 38"): sem
// trava, a resposta dele entraria pela porta da frente e a Nina tentaria qualificar o proprio
// gestor. Os numeros vem de copiloto_responsaveis.fone, ao lado da trava que ja existia para
// representante.
// copiloto-lead (v8) — o seguimento tambem pega a conversa cuja ultima mensagem e do lead mas e
// ROBO DELE (autoresposta da propria loja). A Natalie caiu nesse vao: o inbound pulava por ruido e
// o seguimento pulava por "ele respondeu", e ninguem falava com ela.
// copiloto-lead (v7) — SEGUNDO TOQUE. Ate aqui a Nina so falava quando o lead falava: quem nao
// respondia a primeira mensagem morria ali, e "aquecer" nao existia. Agora, passados
// lead_seguir_min (180) minutos sem resposta, ela da um toque leve — de outro angulo, no maximo
// lead_toques_max (2) vezes, so em horario comercial de SP (lead_toque_horario) — e quem nao
// responde nem assim fica 'frio', sem virar trabalho pro comercial. No canal oficial ha uma
// ultima chance: se a janela de 24h da Meta vai fechar dentro de lead_janela_aviso_min (90) e o
// lead nunca foi tocado, o toque sai na hora, porque depois so template passa.
// ?acao=inbound|seguir|tudo (padrao tudo) separa as duas passadas.
// copiloto-lead (v6) — filtro de ruido pega tambem a autoresposta no plural ("nao estamos disponiveis", "responderemos assim que possivel", "agradecemos sua mensagem"): a loja do proprio lead tem robo, e a Nina quase respondeu ao dele. Padrao extra passa a vir de copiloto_config.lead_ruido_extra, sem deploy.
// copiloto-lead (v5) — v4 desfazia o proprio trabalho: o upsert de depois do envio reescrevia o status com o valor lido ANTES das ferramentas rodarem, e um lead descartado (ou passado pro comercial) voltava a "qualificando". O patch de depois do envio nao toca mais em status.
// copiloto-lead (v4) — a Nina atende o LEAD DE CAMPANHA, qualifica e passa pro comercial fechar.
//
// v4: DOIS CANAIS e origem lida do CRM. Os leads da landing "Atacado Nitron PRO" nao chegam pelo
//     Zaptos: chegam pelo WhatsApp NATIVO do GHL (numero oficial da conta, type 19), sem marcador
//     de instancia — a v3 os ignorava. Responder pelo Zaptos faria o lead receber mensagem de um
//     numero estranho e partiria a conversa em duas, entao o envio agora sai pelo MESMO canal em
//     que ele escreveu. Vem com tres consequencias praticas:
//       - JANELA DE 24h DA META: no canal nativo, passadas ~24h da mensagem do lead, texto livre e
//         recusado. A Nina nao gasta a tentativa: abre tarefa p/ o comercial (template ou ligacao).
//       - ORIGEM: o `source` do contato (escrito pelo formulario da landing) diz de que campanha
//         ele veio, e vale como sinal de lead tanto quanto a tag "ads". Quando a origem nao e o
//         anuncio conhecido, o prompt PROIBE a Nina de adivinhar oferta ou valor anunciado.
//       - CNPJ QUE ELE JA DEU: o formulario grava o CNPJ no contato. A Nina nao pede de novo (a
//         sugestao automatica do CRM pedia, e o lead ja havia informado), e o codigo confere se
//         esse CNPJ ja tem cadastro antes de tratar como lead novo.
//
// v3: o sinal de que a conversa e de anuncio passou a ser a TAG do CRM ("ads"), com o regex da
//     primeira frase apenas como rede: o texto que o META pre-enche no clique muda no gerenciador
//     a qualquer momento, a tag nao.
// v2: a v1 cortava a lista em `limite` ANTES de filtrar a instancia. Num dia normal de operacao as
//     conversas de representante enchiam a fila e o lead do anuncio nunca era olhado (as 20
//     primeiras eram todas de outra instancia ou ja respondidas). Agora filtra pela instancia —
//     que a propria busca devolve no rodape da ultima mensagem — e so depois corta.
//
// POR QUE ESTA FUNCAO EXISTE, e nao um caminho novo dentro do copiloto-conversa: o cerebro do
// copiloto atende quem TEM cadastro — representante (carteira, meta, pedidos) ou cliente (codparc,
// tabela de preco, boleto, entrega). O lead do anuncio nao tem nada disso: nao ha codparc, entao
// preco/boleto/entrega nao existem, e a conversa e outra (qualificar e aquecer, nao resolver). Ate
// 10/09/2026 esse lead nao tinha caminho nenhum: chegava na instancia da Nina, o copiloto-conversa
// nao achava rep e devolvia "escalonar" sem responder. O primeiro lead do anuncio (10/09, 00:10 BRT)
// ficou 12 horas sem resposta.
//
// COMO ELA ACHA O LEAD: nao depende de webhook. Pergunta ao GHL quais conversas tem a ULTIMA
// mensagem inbound (`lastMessageDirection=inbound` = ninguem respondeu ainda), fica so com as que
// chegaram pela instancia de copiloto_config.lead_inst e filtra o resto. Assim um humano que pega a
// conversa antes ganha: com uma resposta dele, a conversa sai da lista sozinha.
//
// O HISTORICO E O DO GHL, nao um espelho nosso: ela le a conversa como ela esta, inclusive o que
// pessoa de verdade escreveu no meio. Espelho proprio ja mostrou divergir do CRM.
//
// GATES (copiloto_config, nao constante no codigo): lead_ativo ('nao' = monta e nao manda),
// lead_inst ('Nina'), pedido_minimo (2500), lead_espera_min (2 = da tempo de um humano pegar
// primeiro), lead_ate_horas (48). ?dry=1 monta a resposta sem mandar e sem gravar nada.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GHL = (Deno.env.get("GHL_TOKEN") || "").trim();
const LOC = "rZ8y7lzqV7fzxsartaX2";
const MODELO = "claude-sonnet-5";

const digits = (s: any) => String(s || "").replace(/\D/g, "");
// GRAVAR O NUMERO INTEIRO. Ate a v9 a coluna guardava d10() — os ULTIMOS 10 digitos — e o telefone
// vem do CRM com DDI: "+5511982408982" (13 digitos) virava "1982408982". Nao e so o 55 que sai: o
// primeiro digito do DDD sai junto, e o nono digito do celular ocupa o lugar dele. O numero gravado
// passa a ser de OUTRA praca e, pior, as vezes existe: (49) 9186-5299 (SC) e (99) 9794-1046 (MA)
// foram entregues a representante como se fossem o lead. Cinco dos oito leads repassados sairam
// assim, e os leads ficaram esperando uma ligacao que nunca chegou.
// Quebrava todo celular de 11 digitos (DDD + nono digito), ou seja praticamente todo DDD de 11 a 28.
// Demorou a aparecer porque numero de 12 digitos (celular antigo, sem o nono) passa ileso: ali os
// ultimos 10 sao o nacional inteiro. Por isso os leads de DDD alto sairam certos.
const foneNac = (s: any) => { let d = digits(s); if (d.length >= 12 && d.startsWith("55")) d = d.slice(2); return d; };
// so para achar registro GRAVADO antes da correcao, que tem 10 digitos. Nao usar para gravar.
const d10 = (s: any) => digits(s).slice(-10);
function foneFmt(s: any): string {
  const d = foneNac(s);
  if (d.length === 11) return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
  if (d.length === 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
  return String(s || "");
}
const fk8 = (s: any) => { let d = digits(s).replace(/^0+/, "").replace(/^55/, ""); if (d.length > 8) d = d.slice(-8); return d; };
const norm = (s: any) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const prim = (s: any) => (String(s || "").trim().split(/\s+/)[0] || String(s || ""));
function hojeBRT(): string { const d = new Date(Date.now() - 3 * 3600 * 1000); const p = (n: number) => String(n).padStart(2, "0"); return p(d.getUTCDate()) + "/" + p(d.getUTCMonth() + 1) + "/" + d.getUTCFullYear(); }

// A instancia do Zaptos vem escrita no rodape da propria mensagem: nao existe como campo do contato
// no GHL (conferido em 100 custom fields). E o unico jeito de saber por qual numero ela entrou.
function instDe(t: any): string | null { const m = String(t || "").match(/Instance Source:\s*([^\n\r]+)/i); return m ? m[1].trim() : null; }
function limpa(t: any): string { return String(t || "").replace(/Instance Source:.*/is, "").replace(/#contact_instance:\S+/gi, "").replace(/\s+/g, " ").trim(); }

// Ruido que chega na instancia da Nina: codigo de confirmacao do Facebook, mensagem que o WhatsApp
// nao decifrou e autoresposta de OUTRA empresa. Chegaram mais de 20 em 10 dias — sem este filtro a
// Nina conversa com robo alheio e gasta o numero dela nisso.
// A lista cresce com a operacao: muitos leads sao numeros comerciais com resposta automatica
// propria. O da loja da Natalie ("Nao estamos disponiveis... responderemos assim que possivel")
// escapou da versao no singular em 10/09 e a Nina quase respondeu ao robo dela. Padrao extra em
// copiloto_config.lead_ruido_extra, para o proximo formato entrar por UPDATE, sem deploy.
const RE_RUIDO = /(codigo de confirmacao|undecryptable|descriptografar|ative as listas|agradece(mos)? (seu contato|sua mensagem)|atendente virtual|horario de atendimento|entraremos em contato|selecione (a|uma|um) (opcao|assunto)|(estou|estamos) indisponive|nao (estou|estamos) disponive|retornare(i|mos) assim que|respondere(i|mos) assim que|ouvidoria|mensagem automatica)/;
// Abertura de quem veio do anuncio. O texto que o META pre-enche no clique e "Ola! Posso ter mais
// informacoes sobre isso?" — e o caso mais comum e o mais generico, por isso esta na lista.
const RE_ABRE = /(mais informacoe?s sobre isso|posso ter mais informacoe?s|quero saber mais|vim pelo (anuncio|face|insta)|vi (o|um) (anuncio|video|reels|post)|como (faco|fazer) (para|pra) (comprar|revender)|revend|atacado|catalogo|abastecer|sou (lojista|dono)|tenho (uma )?(loja|bazar|mercad)|preciso (de|comprar))/;
let RUIDO_EXTRA: RegExp | null = null;
const ehRuido = (t: any) => RE_RUIDO.test(norm(t)) || (!!RUIDO_EXTRA && RUIDO_EXTRA.test(norm(t)));
const ehAbertura = (t: any) => !ehRuido(t) && RE_ABRE.test(norm(t));

// documento so aparece formatado em CODIGO. A IA nunca escreve CNPJ — regra do gestor de 28/08: um
// digito trocado manda o comercial para outra empresa.
function docFmt(d: any): string {
  const x = digits(d);
  if (x.length === 14) return x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") + " (CNPJ)";
  if (x.length === 11) return x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") + " (CPF)";
  return x ? x + " (documento fora do padrao)" : "";
}

const ghl = (m: string, p: string, v = "2021-07-28", body?: any) => fetch("https://services.leadconnectorhq.com" + p, { method: m, headers: { Authorization: "Bearer " + GHL, Version: v, Accept: "application/json", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

async function anthropic(system: string, messages: any[], tools: any[]): Promise<any> {
  const key = Deno.env.get("ANTHROPIC_API_KEY"); if (!key) throw new Error("sem ANTHROPIC_API_KEY");
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: MODELO, max_tokens: 1500, system, tools, messages }) });
  if (!r.ok) throw new Error("anthropic " + r.status + " " + (await r.text()).slice(0, 300));
  return await r.json();
}

async function enviar(contact_id: string | null, fone: string, texto: string, instancia: string) {
  const body: any = { canal: "whatsapp", texto, instancia };
  if (contact_id) body.contact_id = contact_id; else body.fone = fone;
  const r = await fetch(SUPA_URL + "/functions/v1/campanhas-enviar", { method: "POST", headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return await r.json().catch(() => ({ ok: false, motivo: "resposta ilegivel do campanhas-enviar" }));
}

// Envio pelo WHATSAPP NATIVO do GHL (canal oficial da Meta, numero 11 94793-4107). Nada a ver com
// o Zaptos: nao existe instancia, nao ha bind de dono, e o remetente e o proprio WABA da conta. O
// campanhas-enviar nao serve aqui — ele e Zaptos e EXIGE instancia.
async function enviarNativo(contact_id: string, texto: string) {
  const r = await ghl("POST", "/conversations/messages", "2021-04-15", { type: "WhatsApp", contactId: contact_id, message: texto });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, motivo: r.ok ? undefined : (d?.message || JSON.stringify(d).slice(0, 200)), id: d?.messageId };
}

// O CRM guarda de onde o lead veio (`source`, preenchido pelo formulario da landing) e o CNPJ que
// ele mesmo digitou (campo CF_CNPJ). Ler isso evita o erro mais caro da qualificacao: pedir de novo
// um dado que o lead ja deu — foi o que a sugestao automatica do CRM fez com a Natalie.
const CF_CNPJ = "TLRZeTrxxPBsMNRqbdHO";
async function contatoCrm(contact_id: string | null): Promise<any> {
  if (!contact_id) return {};
  try {
    const r = await ghl("GET", `/contacts/${contact_id}`);
    if (!r.ok) return {};
    const c = (await r.json().catch(() => ({})))?.contact || {};
    const cf = Array.isArray(c.customFields) ? c.customFields : [];
    const at = c.attributionSource || c.lastAttributionSource || {};
    return {
      source: c.source || null,
      cnpj: digits((cf.find((x: any) => x.id === CF_CNPJ) || {}).value || ""),
      email: c.email || null,
      empresa: c.companyName || c.businessName || null,
      url: at.url || null, utm: at.utmSource || null, canal_origem: at.sessionSource || null, meio: at.medium || null,
      dono: c.assignedTo || null,
    };
  } catch (_e) { return {}; }
}

// ---- ferramentas -----------------------------------------------------------------------------
// Conjunto CURTO de proposito: sem codparc, as ferramentas de preco/boleto/pedido/entrega so
// responderiam "codparc invalido" e convidariam a IA a inventar.
const TOOLS = [
  { name: "buscar_cliente", description: "Confere se a loja JA tem cadastro na Nitron, por CNPJ (14 digitos) ou por nome/razao. Use assim que tiver o CNPJ.", input_schema: { type: "object", properties: { termo: { type: "string", description: "CNPJ (so digitos) ou nome da loja" } }, required: ["termo"] } },
  { name: "consultar_conhecimento", description: "Base de conhecimento da casa (produto, mercado, playbook). Use quando ele perguntar algo que voce nao sabe de cabeca.", input_schema: { type: "object", properties: { termo: { type: "string" } }, required: ["termo"] } },
  { name: "produtos", description: "Produtos por categoria/nome/ramo: devolve nome e LINK da foto. SEM preco.", input_schema: { type: "object", properties: { termo: { type: "string" } }, required: ["termo"] } },
  { name: "salvar_lead", description: "Anota/atualiza o que voce JA apurou deste lead. Chame assim que descobrir um dado novo. Mande so o que ele disse — nao preencha por deducao.", input_schema: { type: "object", properties: { nome: { type: "string", description: "nome da pessoa COMO ELA MESMA ESCREVEU nesta conversa, com sobrenome. NUNCA o nome do perfil do WhatsApp (apelido, emoji, frase, nome da loja)." }, nome_confirmado: { type: "boolean", description: "true SOMENTE quando a propria pessoa disse o nome nesta conversa. Falso/ausente se voce pegou do perfil ou deduziu." }, empresa: { type: "string", description: "nome da loja / razao social" }, cnpj: { type: "string" }, cidade: { type: "string" }, uf: { type: "string" }, tipo_loja: { type: "string", description: "bazar, utilidades, variedades, presentes, supermercado, magazine, material de construcao..." }, ja_revende: { type: "string", description: "de quem ele compra hoje, ou que nao compra direto de fabrica" }, interesse: { type: "string", description: "linha/produto que ele quer abastecer" }, sabe_minimo: { type: "boolean", description: "true depois de VOCE dizer o pedido minimo nesta conversa" }, temperatura: { type: "string", enum: ["frio", "morno", "quente"] }, resumo: { type: "string", description: "2 a 3 frases do caso, para o comercial ler" } }, required: [] } },
  { name: "passar_comercial", description: "Fecha a qualificacao e passa pro comercial fechar a venda. Use quando ja souber o NOME COMPLETO da pessoa (confirmado por ela), a loja, a praca (cidade/UF) e o que ele quer, e ele ja souber do pedido minimo. Abre a tarefa na fila de execucao e devolve o protocolo.", input_schema: { type: "object", properties: { resumo: { type: "string", description: "o caso em 2 a 4 frases: quem e, o que quer, em que pe esta" }, falta: { type: "string", description: "o que o comercial ainda precisa levantar ou combinar" }, temperatura: { type: "string", enum: ["frio", "morno", "quente"] } }, required: ["resumo"] } },
  { name: "descartar_lead", description: "Use quando NAO e revenda: consumidor final querendo uma peca, curriculo, fornecedor oferecendo servico, engano de numero. Marca como descartado e NAO abre tarefa pro comercial.", input_schema: { type: "object", properties: { motivo: { type: "string" } }, required: ["motivo"] } },
];
const CAMPOS = ["nome", "empresa", "cnpj", "cidade", "uf", "tipo_loja", "ja_revende", "interesse", "resumo", "temperatura"];
// nome do perfil do WhatsApp nao e nome de gente: emoji, frase ("Deus E Fiel"), nome da loja,
// um primeiro nome solto. So vale como nome confirmado o que a PESSOA escreveu, com sobrenome.
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F000}-\u{1F02F}]/u;
function nomePlausivel(n: any): boolean {
  const t = String(n || "").replace(EMOJI_RE, " ").replace(/\s+/g, " ").trim();
  if (t.length < 5 || /\d/.test(t)) return false;
  const ps = t.split(" ").filter((x) => x.length > 1);
  return ps.length >= 2;
}
function partesNome(n: string): { first: string; last: string } {
  const ps = String(n).replace(EMOJI_RE, " ").replace(/\s+/g, " ").trim().split(" ");
  return { first: ps[0] || "", last: ps.slice(1).join(" ") };
}
// O gestor pediu em 22/09: com o nome confirmado, o CONTATO DO CRM passa a ter o nome de
// verdade — nao adianta a Nina saber e o CRM continuar mostrando "🙂" para quem for atender.
async function nomeNoCrm(contact_id: string, nome: string) {
  const { first, last } = partesNome(nome);
  if (!first || !last) return { ok: false, motivo: "nome sem sobrenome — nao grava no CRM" };
  try {
    const r = await ghl("PUT", `/contacts/${contact_id}`, "2021-07-28", { firstName: first, lastName: last, name: first + " " + last });
    if (!r.ok) return { ok: false, motivo: "GHL " + r.status };
    return { ok: true, nome: first + " " + last };
  } catch (e) { return { ok: false, motivo: String(e).slice(0, 120) }; }
}

async function upsertLead(sb: any, ctx: any, patch: any): Promise<{ lead?: any; erro?: string }> {
  const col = ctx.contact_id ? "contact_id" : "fone"; const val = ctx.contact_id || ctx.fone;
  if (!val) return { erro: "lead sem contact_id e sem fone" };
  const { data: atual } = await sb.from("copiloto_lead").select("*").eq(col, val).order("id", { ascending: false }).limit(1).maybeSingle();
  const row: any = { atualizado: new Date().toISOString() };
  for (const k in patch) { const v = patch[k]; if (v !== null && v !== undefined && String(v).trim() !== "") row[k] = v; }
  if (atual?.id) { const { data, error } = await sb.from("copiloto_lead").update(row).eq("id", atual.id).select("*").maybeSingle(); return error ? { erro: error.message } : { lead: data }; }
  row.contact_id = ctx.contact_id || null; row.fone = ctx.fone || null; row.instancia = ctx.instancia || null;
  const { data, error } = await sb.from("copiloto_lead").insert(row).select("*").maybeSingle();
  return error ? { erro: error.message } : { lead: data };
}

async function runTool(sb: any, ctx: any, name: string, input: any): Promise<any> {
  try {
    if (ctx.dry && ["salvar_lead", "passar_comercial", "descartar_lead"].includes(name)) return { ok: true, previa: true, simulado: name, aviso: "previa: nada foi gravado" };
    if (name === "buscar_cliente") {
      const termo = String(input?.termo || "").trim(); const dig = digits(termo);
      let q = sb.from("ghl_cliente").select("codparc, razao, cnpj, situacao, canal, ramo, dias").limit(5);
      q = dig.length >= 11 ? q.ilike("cnpj", "%" + dig + "%") : q.ilike("razao", "%" + termo + "%");
      const { data } = await q;
      if (!data || !data.length) return { encontrados: 0, aviso: "nenhum cadastro com esse dado — trate como lead novo" };
      return { encontrados: data.length, clientes: data, aviso: "JA E CLIENTE: nao trate como lead novo, diga isso a ele e passe pro comercial" };
    }
    if (name === "consultar_conhecimento") {
      const termo = String(input?.termo || "").trim(); if (!termo) return { erro: "termo vazio" };
      const { data, error } = await sb.rpc("buscar_conhecimento", { q: termo });
      if (error) return { erro: error.message };
      if (!data || !data.length) return { encontrados: 0, aviso: "nada na base p/ '" + termo + "'" };
      return { encontrados: data.length, conhecimento: (data as any[]).slice(0, 4).map((d) => ({ titulo: d.titulo, texto: String(d.conteudo).slice(0, 1500) })) };
    }
    if (name === "produtos") {
      const termo = String(input?.termo || "").trim();
      if (!termo) return { erro: "termo vazio" };
      const like = "%" + termo + "%";
      const { data } = await sb.from("produto_web").select("categoria, nome, url, ramo").eq("ativo", true).or(`nome.ilike.${like},categoria.ilike.${like},ramo.ilike.${like}`).limit(6);
      if (!data || !data.length) return { encontrados: 0, aviso: "nenhum produto com esse termo" };
      return { encontrados: data.length, produtos: data, dica: "mande o url; sem preco (o lead ainda nao tem tabela)." };
    }
    if (["salvar_lead", "passar_comercial", "descartar_lead"].includes(name)) {
      const patch: any = {};
      for (const k of CAMPOS) if (input?.[k] != null && String(input[k]).trim()) patch[k] = String(input[k]).trim().slice(0, 400);
      if (patch.cnpj) patch.cnpj = digits(patch.cnpj).slice(0, 14);
      if (patch.uf) patch.uf = String(patch.uf).toUpperCase().slice(0, 2);
      if (input?.sabe_minimo === true) patch.sabe_minimo = true;
      // nome so vira "confirmado" quando a pessoa disse E tem sobrenome. Sem isso ele continua
      // sendo o apelido do WhatsApp, e o CRM nao e tocado.
      let crmNome: any = null;
      if (patch.nome && input?.nome_confirmado === true && nomePlausivel(patch.nome)) {
        patch.nome_confirmado = true;
        if (ctx.contact_id) {
          crmNome = await nomeNoCrm(String(ctx.contact_id), patch.nome);
          if (crmNome?.ok) patch.nome_crm_em = new Date().toISOString();
        }
      } else if (patch.nome && !nomePlausivel(patch.nome)) {
        // nao apaga o que ja existe, mas nao promove apelido a nome
        patch.nome_confirmado = false;
      }
      if (name === "salvar_lead") { const r = await upsertLead(sb, ctx, patch); return r.erro ? { erro: r.erro } : { ok: true, anotado: true, nome_no_crm: crmNome || undefined, lead: { nome: r.lead?.nome, nome_confirmado: !!r.lead?.nome_confirmado, empresa: r.lead?.empresa, praca: [r.lead?.cidade, r.lead?.uf].filter(Boolean).join("/"), interesse: r.lead?.interesse, status: r.lead?.status } }; }
      if (name === "descartar_lead") { const r = await upsertLead(sb, ctx, { ...patch, status: "descartado", motivo: String(input?.motivo || "").slice(0, 300) }); return r.erro ? { erro: r.erro } : { ok: true, descartado: true, aviso: "marcado como descartado. Encerre com gentileza, sem insistir." }; }
      // passar_comercial: o texto da tarefa e montado AQUI, a partir da linha do lead. A IA escreve
      // o resumo em volta; documento e telefone entram em codigo.
      const up = await upsertLead(sb, ctx, { ...patch, status: "qualificado" });
      if (up.erro) return { erro: up.erro };
      const L = up.lead || {};
      const det = [
        L.empresa ? "Loja: " + L.empresa : null,
        L.nome ? ("Contato: " + L.nome + (L.nome_confirmado ? "" : " (nome do perfil do WhatsApp — nao confirmado com ele)")) : null,
        ctx.fone ? "WhatsApp: " + foneFmt(ctx.fone) : null,
        docFmt(L.cnpj) || "Sem documento informado",
        (L.cidade || L.uf) ? "Praca: " + [L.cidade, L.uf].filter(Boolean).join("/") : null,
        L.tipo_loja ? "Tipo de loja: " + L.tipo_loja : null,
        L.interesse ? "Quer abastecer: " + L.interesse : null,
        L.ja_revende ? "Compra hoje: " + L.ja_revende : null,
        "Sabe do pedido minimo: " + (L.sabe_minimo ? "sim" : "NAO — diga na abordagem"),
        L.temperatura ? "Temperatura: " + L.temperatura : null,
        "",
        "Resumo da Nina: " + String(input?.resumo || L.resumo || "").slice(0, 700),
        input?.falta ? "Falta: " + String(input.falta).slice(0, 400) : null,
        "",
        "Origem: " + (ctx.source ? ("campanha \"" + ctx.source + "\"") : "campanha nao registrada no CRM") + ", atendido pela Nina " + (ctx.instancia === "ghl-nativo" ? "no WhatsApp oficial do GHL (numero da conta)" : ("no Zaptos, instancia " + ctx.instancia)) + ".",
        ctx.contact_id ? "Conversa: https://app.gohighlevel.com/v2/location/" + LOC + "/contacts/detail/" + ctx.contact_id : null,
      ].filter((x) => x !== null).join("\n");
      const { data: tf, error: eT } = await sb.from("copiloto_tarefas").insert({ area: "comercial", tipo: "lead-anuncio", acao: ("Fechar lead do anuncio: " + (L.empresa || L.nome || "lead sem nome")).slice(0, 500), detalhe: det.slice(0, 1500), cliente_nome: L.empresa || L.nome || null, contact_id: ctx.contact_id || null, origem: "nina-lead", prioridade: 1 }).select("id").maybeSingle();
      if (eT) return { erro: eT.message };
      await upsertLead(sb, ctx, { status: "passado", tarefa_id: tf?.id || null });
      return { ok: true, protocolo: tf?.id, aviso: "passado pro comercial (tarefa #" + tf?.id + ", area comercial). Diga a ele que um consultor assume daqui, sem prometer preco, prazo nem data." };
    }
    return { erro: "ferramenta desconhecida: " + name };
  } catch (e) { return { erro: String(e) }; }
}

// ---- prompt ----------------------------------------------------------------------------------
const ESTILO = `\n\nESTILO (pessoa de verdade, nao IA): frases curtas e naturais, sem negrito, sem listas, sem textao, emoji quase nunca. NAO diga que e IA/bot. Responda primeiro o que ele perguntou e so depois puxe a conversa.`;

async function playbook(sb: any): Promise<string> {
  const { data } = await sb.from("copiloto_skills").select("nome,conteudo").eq("ativo", true).in("nome", ["lead", "vendas"]);
  const ordem = (n: string) => n === "lead" ? 0 : 1;
  return (data || []).sort((a: any, b: any) => ordem(a.nome) - ordem(b.nome)).map((r: any) => "[" + String(r.nome).toUpperCase() + "]\n" + r.conteudo).join("\n\n");
}
async function licoes(sb: any): Promise<string> {
  try { const { data } = await sb.from("copiloto_licoes").select("licao").eq("ativo", true).order("id"); const ls = (data || []).map((r: any) => "- " + r.licao); return ls.length ? "\n\nLICOES DO GESTOR (tem PRIORIDADE, siga a risca):\n" + ls.join("\n") : ""; } catch (_e) { return ""; }
}

// ---- uma conversa ----------------------------------------------------------------------------
async function atender(sb: any, cfg: Record<string, string>, cv: any, opts: { dry: boolean; ativo: boolean; pedidoMin: number; inst: string; nativoOn: boolean; janelaH: number; pb: string; lic: string; reps: Set<string>; internos: Set<string> }) {
  const contact_id = cv.contactId || cv.contact_id || null;
  const fone = String(cv.phone || "").trim();
  const nomeCrm = String(cv.fullName || cv.contactName || "").trim();
  const base = { contato: nomeCrm || fone || contact_id, contact_id };

  // conversa como ela esta no GHL — inclusive o que pessoa de verdade escreveu no meio
  const rm = await ghl("GET", `/conversations/${cv.id}/messages?limit=25`, "2021-04-15");
  if (!rm.ok) return { ...base, decisao: "erro", motivo: "GHL " + rm.status + " nas mensagens" };
  const dm = await rm.json().catch(() => ({}));
  const arr = (dm?.messages?.messages || dm?.messages || []) as any[];
  const msgs = arr.slice().reverse().filter((m: any) => String(m?.body || "").trim());
  if (!msgs.length) return { ...base, decisao: "pular", motivo: "sem mensagem com texto" };

  const ultima = msgs[msgs.length - 1];
  if (ultima.direction !== "inbound") return { ...base, decisao: "pular", motivo: "a ultima e nossa — alguem respondeu" };
  // DOIS CANAIS, e eles nao se misturam:
  //  - Zaptos: a mensagem traz "Instance Source: <instancia>" no rodape e a resposta sai pelo numero
  //    daquela instancia, via campanhas-enviar.
  //  - WhatsApp NATIVO do GHL (type 19 / TYPE_WHATSAPP): sem marcador, numero oficial da conta. A
  //    resposta TEM de sair por ele — mandar pelo Zaptos faria o lead receber mensagem de um numero
  //    estranho e partiria a conversa em duas.
  const nativo = String(ultima.messageType || "") === "TYPE_WHATSAPP" || Number(ultima.type) === 19 || String(cv.lastMessageType) === "TYPE_WHATSAPP";
  const instancia = instDe(ultima.body) || instDe(cv.lastMessageBody) || "";
  if (!nativo && norm(instancia) !== norm(opts.inst)) return { ...base, decisao: "pular", motivo: "outra instancia: " + (instancia || "sem marcador") };
  if (nativo && !opts.nativoOn) return { ...base, decisao: "pular", motivo: "canal nativo desligado (lead_nativo=nao)" };

  const texto = limpa(ultima.body);
  if (!texto) return { ...base, decisao: "pular", motivo: "mensagem sem texto (midia)" };
  if (ehRuido(texto)) return { ...base, decisao: "pular", motivo: "ruido (sistema ou autoresposta de terceiro)" };
  if (fone && opts.reps.has(fk8(fone))) return { ...base, decisao: "pular", motivo: "e representante — quem atende e o copiloto-conversa" };
  // NUMERO DE CASA nunca e lead. O aviso interno do encerramento sai pelo Zaptos da Nina, e o
  // contato do gestor tem `source` preenchido no CRM ("Form 38") — sem esta linha, a resposta dele
  // ("ok, obrigado") entraria pela porta da frente e a Nina tentaria qualificar o proprio gestor.
  if (fone && opts.internos.has(fk8(fone))) return { ...base, decisao: "pular", motivo: "numero interno (copiloto_responsaveis) — aviso da casa, nao lead" };

  // O fluxo do GHL marca quem vem do anuncio com a tag "ads" (e a instancia com "nina"). Isso e
  // MUITO mais confiavel do que adivinhar pela frase: o texto que o META pre-enche pode mudar a
  // qualquer momento no gerenciador, a tag nao. O regex fica como rede, para o caso de o contato
  // chegar sem tag.
  const tags = (Array.isArray(cv.tags) ? cv.tags : []).map((x: any) => norm(x));
  const ehAds = tags.includes("ads") || tags.includes("lead") || tags.includes("anuncio");
  // A busca aceita as DUAS formas de proposito: a nova (numero inteiro) e a antiga (10 digitos).
  // Os registros gravados ate a v9 tem 10 digitos; se a busca so procurasse a forma nova, o mesmo
  // lead viraria dois registros e a conversa recomecaria do zero para quem ja tinha respondido.
  const { data: leadRow } = await sb.from("copiloto_lead").select("*").or(`contact_id.eq.${contact_id || "__none__"},fone.eq.${foneNac(fone)},fone.eq.${d10(fone)}`).order("id", { ascending: false }).limit(1).maybeSingle();
  if (leadRow?.ultima_msg_id && leadRow.ultima_msg_id === ultima.id) return { ...base, decisao: "pular", motivo: "ja respondi esta mensagem (o envio pode estar a caminho)" };
  // O CRM tambem diz de onde ele veio: `source` e preenchido pelo formulario da landing (ex.
  // "Atacado Nitron Pro"). Isso e sinal de lead tao bom quanto a tag, e serve para campanha que
  // ninguem aqui conhece ainda.
  const crm = await contatoCrm(contact_id);
  if (!leadRow && !ehAds && !crm.source && !ehAbertura(texto)) return { ...base, decisao: "pular", motivo: "sem tag, sem source no CRM e a mensagem nao parece lead: " + texto.slice(0, 60) };

  // JANELA DE 24h DA META (so no canal nativo): passadas 24h da ultima mensagem do lead, texto
  // livre e RECUSADO — so template aprovado passa. Entao a Nina nao tenta: registra e chama humano,
  // em vez de gastar a tentativa e deixar o lead sem resposta.
  const nascida = new Date(ultima.dateAdded || cv.lastInboundWhatsappMessageDate || cv.lastMessageDate || Date.now()).getTime();
  const idadeH = (Date.now() - nascida) / 3600000;
  if (nativo && idadeH > opts.janelaH) {
    if (leadRow?.status === "janela_fechada") return { ...base, decisao: "pular", motivo: "janela de 24h fechada, humano ja avisado" };
    if (opts.dry) return { ...base, decisao: "janela_fechada", motivo: "passaram " + idadeH.toFixed(1) + "h da mensagem dele: a Meta so aceita template agora (previa, nada gravado)" };
    const up = await upsertLead(sb, { contact_id, fone: foneNac(fone), instancia: "ghl-nativo" }, { nome: nomeCrm || null, empresa: crm.empresa || null, cnpj: crm.cnpj || null, status: "janela_fechada", motivo: "janela de 24h da Meta fechada antes da primeira resposta" });
    const { data: tfj } = await sb.from("copiloto_tarefas").insert({ area: "comercial", tipo: "lead-janela-24h", acao: ("Lead sem resposta e janela de 24h fechada: " + (nomeCrm || fone)).slice(0, 500), detalhe: ["Canal: WhatsApp nativo do GHL", "Contato: " + (nomeCrm || "sem nome"), "WhatsApp: " + foneFmt(fone), docFmt(crm.cnpj) || "Sem documento", crm.source ? "Origem (CRM): " + crm.source : null, crm.url ? "Landing: " + crm.url : null, "Escreveu: \"" + texto.slice(0, 200) + "\"", "", "Passaram " + idadeH.toFixed(1) + "h: texto livre nao passa mais pela Meta. Responder por template aprovado, ou ligar."].filter(Boolean).join("\n").slice(0, 1500), cliente_nome: nomeCrm || null, contact_id, origem: "nina-lead", prioridade: 2 }).select("id").maybeSingle();
    return { ...base, decisao: "janela_fechada", lead_id: up.lead?.id || null, tarefa: tfj?.id || null, motivo: "passaram " + idadeH.toFixed(1) + "h — tarefa aberta p/ o comercial (template ou ligacao)" };
  }

  const ctx: any = { contact_id, fone: foneNac(fone), instancia: nativo ? "ghl-nativo" : instancia, dry: opts.dry, source: crm.source || (ehAds ? "anuncio META" : null) };
  // Se ele ja informou o CNPJ no formulario, a Nina NAO pede de novo — e o codigo ja confere se
  // esse CNPJ tem cadastro, para ela nao tratar cliente antigo como lead novo.
  let cadastro: any = null;
  if (crm.cnpj && crm.cnpj.length >= 11) { const { data } = await sb.from("ghl_cliente").select("codparc, razao, situacao, dias").ilike("cnpj", "%" + crm.cnpj + "%").limit(1).maybeSingle(); cadastro = data || null; }
  // nome do CRM entra so como provisorio: se a Nina JA confirmou o nome com a pessoa, esta linha
  // nao pode reescrever com o apelido do perfil (era o mesmo vao que fazia o status voltar na v4).
  if (!opts.dry && (crm.cnpj || crm.source)) await upsertLead(sb, ctx, { nome: (leadRow?.nome_confirmado ? null : (nomeCrm || null)), empresa: crm.empresa || cadastro?.razao || null, cnpj: crm.cnpj || null, codparc: cadastro?.codparc || null, origem: ctx.source });
  const jaSei = leadRow ? [(leadRow.nome && leadRow.nome_confirmado) && "nome: " + leadRow.nome, leadRow.empresa && "loja: " + leadRow.empresa, leadRow.cnpj && "CNPJ ja informado", (leadRow.cidade || leadRow.uf) && "praca: " + [leadRow.cidade, leadRow.uf].filter(Boolean).join("/"), leadRow.tipo_loja && "tipo: " + leadRow.tipo_loja, leadRow.ja_revende && "compra hoje: " + leadRow.ja_revende, leadRow.interesse && "interesse: " + leadRow.interesse, leadRow.sabe_minimo && "JA sabe do pedido minimo", "status: " + leadRow.status].filter(Boolean).join(" | ") : "";

  const nome = prim(cfg.nome_assistente || opts.inst || "Nina");
  const sys = `Voce e a ${nome}, do time comercial da Nitronplast (Nitron), por WhatsApp. Calorosa e natural, pessoa de verdade da equipe.` + ESTILO
    + `\n\nHOJE e ${hojeBRT()} (data atual REAL; datas de 2026 sao normais).`
    + (opts.pb ? `\n\nMANUAIS DA CASA (o [LEAD] manda aqui):\n${opts.pb}` : "")
    + `\n\nQUEM E ESTE CONTATO: um LEAD, nao representante. ${ehAds ? "Veio do anuncio da Nitron no META (tag ads no CRM)." : crm.source ? ("Veio da campanha/landing \"" + crm.source + "\" — foi o que o CRM registrou como origem" + (crm.url ? (", pela pagina " + crm.url) : "") + (crm.utm ? (", chegando por " + crm.utm) : "") + ".") : "A origem nao esta registrada no CRM."}`
    + `\n${ehAds ? "" : "VOCE NAO SABE qual criativo ou promessa ele viu, e NAO PODE adivinhar: nao invente oferta, valor, brinde nem condicao que possa ter sido anunciada. Se ele citar algo que viu, pergunte o que exatamente foi oferecido antes de confirmar qualquer coisa — e diga que confirma com o consultor. Comece perguntando, de leve, que tipo de loja ele tem e o que quer abastecer."}`
    + (cadastro ? `\nATENCAO: o CNPJ que ele informou JA TEM CADASTRO na Nitron — ${cadastro.razao} (codparc ${cadastro.codparc}, situacao ${cadastro.situacao}). Nao trate como lead novo: reconheca que ele ja e cliente e passe pro comercial com passar_comercial.` : "")
    + (crm.cnpj && !cadastro ? `\nELE JA INFORMOU O CNPJ no formulario e NAO tem cadastro ainda. NAO peca o CNPJ de novo — isso irrita. Se precisar confirmar, confirme a EMPRESA pelo nome, nao o numero.` : "")
    + `\nPEDIDO MINIMO da Nitron: R$ ${opts.pedidoMin.toLocaleString("pt-BR")}. Diga quando a conversa chegar em volume, mix ou como comprar — nunca na abertura.`
    + (cfg.catalogo_url ? `\nCATALOGO (mande o LINK quando ele quiser ver produtos): ${cfg.catalogo_url}` : "")
    + (cfg.site_url ? `\nSITE: ${cfg.site_url}` : "")
    + `\n${jaSei ? "JA APURADO (nao pergunte de novo): " + jaSei : "AINDA NAO SEI NADA sobre ele — comece pelo tipo de loja e o que ele precisa abastecer."}`
    + (leadRow?.nome_confirmado
      ? `\nNOME JA CONFIRMADO por ele: ${leadRow.nome}. Use esse e NAO pergunte de novo.`
      : `\nNOME — regra do gestor (22/09): ${nomeCrm ? `no CRM esta "${nomeCrm}", e isso vem do perfil do WhatsApp: pode ser apelido, emoji, versiculo ou o nome da loja. NAO trate como o nome dele.` : "voce ainda nao sabe o nome dele."} Pergunte o nome COMPLETO (nome e sobrenome), de leve e UMA vez, cedo na conversa — algo como "antes de a gente seguir, com quem eu falo? seu nome completo" — e nunca deduza nem complete sobrenome por conta propria. Quando ele responder, chame salvar_lead com nome (nome e sobrenome, como ele escreveu) e nome_confirmado=true. Sem isso o consultor recebe o lead sem saber com quem vai falar.`)
    + opts.lic;

  const messages: any[] = [{ role: "user", content: msgs.map((m: any) => (m.direction === "inbound" ? "CONTATO: " : "VOCE (Nitron): ") + limpa(m.body).slice(0, 500)).join("\n") + "\n\n(Responda so a proxima mensagem sua, sem prefixo.)" }];
  let reply = ""; const usadas: string[] = [];
  for (let i = 0; i < 5; i++) {
    const resp = await anthropic(sys, messages, TOOLS);
    const bl = resp.content || []; messages.push({ role: "assistant", content: bl });
    const tus = bl.filter((x: any) => x.type === "tool_use");
    if (resp.stop_reason !== "tool_use" || !tus.length) { reply = bl.filter((x: any) => x.type === "text").map((x: any) => x.text).join("\n").trim(); break; }
    const rs: any[] = [];
    for (const tu of tus) { usadas.push(tu.name); const out = await runTool(sb, ctx, tu.name, tu.input); rs.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out).slice(0, 6000) }); }
    messages.push({ role: "user", content: rs });
  }
  if (!reply) return { ...base, decisao: "erro", motivo: "o modelo nao devolveu texto", ferramentas: usadas };

  if (opts.dry || !opts.ativo) return { ...base, decisao: "previa", canal: nativo ? "whatsapp-nativo-ghl" : ("zaptos:" + instancia), origem: crm.source || (ehAds ? "anuncio META (tag ads)" : null), cnpj_do_form: crm.cnpj ? docFmt(crm.cnpj) : null, ja_cliente: cadastro ? (cadastro.razao + " / codparc " + cadastro.codparc) : null, horas_desde_a_mensagem: Number(idadeH.toFixed(1)), ferramentas: usadas, recebido: texto.slice(0, 200), rascunho: reply, motivo: opts.dry ? "previa (dry=1)" : "lead_ativo=nao" };

  const env = nativo ? await enviarNativo(String(contact_id), reply) : await enviar(contact_id, fone, reply, opts.inst);
  // NAO escreve status aqui. Quem manda no status sao as ferramentas (descartar_lead,
  // passar_comercial), e elas rodaram DEPOIS de leadRow ser lido: reescrever com o valor antigo
  // desfazia o que elas acabaram de gravar — o Fiver Metalurgica virou "descartado" e voltou para
  // "qualificando" na mesma rodada (10/09). Pelo mesmo motivo nao escreve mais o NOME: a ferramenta
  // pode ter acabado de gravar o nome confirmado, e o valor antigo o apagaria.
  const up = await upsertLead(sb, ctx, { ultima_msg_id: ultima.id, ultima_resposta_em: new Date().toISOString() });
  if (!env?.ok) return { ...base, decisao: "falhou", canal: nativo ? "whatsapp-nativo-ghl" : ("zaptos:" + instancia), ferramentas: usadas, motivo: env?.motivo || "envio recusado", texto: reply };
  return { ...base, decisao: "respondeu", canal: nativo ? "whatsapp-nativo-ghl" : ("zaptos:" + instancia), origem: crm.source || (ehAds ? "anuncio META (tag ads)" : null), ferramentas: usadas, lead_id: up.lead?.id || null, status: up.lead?.status, recebido: texto.slice(0, 200), texto: reply };
}

// ---- seguimento: o toque em quem nao respondeu ----------------------------------------------
// Ate a v6 a Nina so falava quando o lead falava: quem nao respondia a primeira mensagem morria
// ali. Agora ela da um toque leve depois de lead_seguir_min, no maximo lead_toques_max vezes, e
// quem nao responde nem assim fica 'frio' (sem tarefa: lead que nunca falou nao e trabalho pro
// comercial).
// Horario de Sao Paulo, fixo — a PRIMEIRA resposta nao espera horario (o lead acabou de escrever),
// mas o toque e iniciativa nossa e as 22h e falta de educacao.
function foraHorarioComercial(): boolean {
  const brt = new Date(Date.now() - 3 * 3600 * 1000);
  const dow = brt.getUTCDay(); const h = brt.getUTCHours();
  if (dow === 0) return true;
  if (dow === 6) return h < 8 || h >= 13;
  return h < 8 || h >= 18;
}

async function seguir(sb: any, cfg: Record<string, string>, o: any) {
  const feitos: any[] = [];
  const { data: cands } = await sb.from("copiloto_lead").select("*")
    .in("status", ["qualificando", "qualificado"])
    .not("ultima_resposta_em", "is", null)
    .lt("toques", o.toquesMax)
    .order("ultima_resposta_em", { ascending: true }).limit(30);
  let tocados = 0;
  for (const L of (cands || [])) {
    if (tocados >= o.limite) break;
    const base = { contato: L.nome || L.empresa || L.fone, lead_id: L.id };
    if (!L.contact_id) { feitos.push({ ...base, decisao: "pular", motivo: "lead sem contact_id" }); continue; }
    const rc = await ghl("GET", `/conversations/search?locationId=${LOC}&contactId=${L.contact_id}&limit=1`);
    if (!rc.ok) { feitos.push({ ...base, decisao: "erro", motivo: "GHL " + rc.status }); continue; }
    const cv = (((await rc.json().catch(() => ({})))?.conversations) || [])[0];
    if (!cv) { feitos.push({ ...base, decisao: "pular", motivo: "conversa nao encontrada" }); continue; }
    // "ultima mensagem e dele" nao significa que ele respondeu: pode ser o robo da propria loja
    // dele. A Natalie caiu exatamente nesse vao em 10/09 — o inbound pulava por ruido e o
    // seguimento pulava por "ele respondeu", e ninguem falava com ela.
    const ultimaDele = String(cv.lastMessageDirection) === "inbound";
    const ultimaERuido = ultimaDele && ehRuido(limpa(cv.lastMessageBody));
    if (ultimaDele && !ultimaERuido) { feitos.push({ ...base, decisao: "pular", motivo: "ele respondeu — o caminho normal cuida" }); continue; }
    const nativo = String(cv.lastMessageType) === "TYPE_WHATSAPP";
    const minDesde = (Date.now() - new Date(L.ultima_resposta_em).getTime()) / 60000;
    // janela de 24h da Meta: medida da ULTIMA mensagem DELE, nao da nossa
    let restamMin = Infinity;
    if (nativo && Number(cv.lastInboundWhatsappMessageDate || 0)) restamMin = o.janelaH * 60 - (Date.now() - Number(cv.lastInboundWhatsappMessageDate)) / 60000;
    if (restamMin <= 0) {
      if (!o.dry) await sb.from("copiloto_lead").update({ status: "frio", motivo: "nao respondeu e a janela de 24h da Meta fechou", atualizado: new Date().toISOString() }).eq("id", L.id);
      feitos.push({ ...base, decisao: "esfriou", motivo: "janela de 24h fechada sem resposta dele" }); continue;
    }
    // toca quando ja passou a espera, OU quando a janela vai fechar e ele nunca foi tocado
    const naHora = minDesde >= o.seguirMin;
    const ultimaChance = nativo && restamMin <= o.avisoMin && Number(L.toques || 0) === 0;
    if (!naHora && !ultimaChance) { feitos.push({ ...base, decisao: "pular", motivo: "ainda cedo (" + Math.round(minDesde) + "min de " + o.seguirMin + (nativo ? ("; janela fecha em " + Math.round(restamMin) + "min") : "") + ")" }); continue; }
    if (o.soHorario && foraHorarioComercial()) { feitos.push({ ...base, decisao: "pular", motivo: "fora do horario comercial de SP" }); continue; }

    const rm = await ghl("GET", `/conversations/${cv.id}/messages?limit=25`, "2021-04-15");
    if (!rm.ok) { feitos.push({ ...base, decisao: "erro", motivo: "GHL " + rm.status + " nas mensagens" }); continue; }
    const arr = (((await rm.json().catch(() => ({})))?.messages?.messages) || []) as any[];
    const msgs = arr.slice().reverse().filter((m: any) => String(m?.body || "").trim() && !/^#contact_instance|^\[System\]/i.test(String(m.body)));
    if (!msgs.length) { feitos.push({ ...base, decisao: "pular", motivo: "sem historico legivel" }); continue; }

    const toqueN = Number(L.toques || 0) + 1;
    const jaSei = [L.empresa && "loja: " + L.empresa, L.tipo_loja && "tipo: " + L.tipo_loja, (L.cidade || L.uf) && "praca: " + [L.cidade, L.uf].filter(Boolean).join("/"), L.interesse && "interesse: " + L.interesse, L.cnpj && "CNPJ ja informado", L.sabe_minimo && "ja sabe do pedido minimo"].filter(Boolean).join(" | ");
    const sys = `Voce e a ${prim(cfg.nome_assistente || o.inst || "Nina")}, do time comercial da Nitronplast (Nitron), por WhatsApp. Calorosa e natural, pessoa de verdade da equipe.` + ESTILO
      + `\n\nHOJE e ${hojeBRT()} (data atual REAL).`
      + (o.pb ? `\n\nMANUAIS DA CASA (o [LEAD] manda aqui):\n${o.pb}` : "")
      + `\n\nTOQUE DE SEGUIMENTO (toque ${toqueN} de ${o.toquesMax}): ele NAO respondeu sua ultima mensagem, mandada ha ${Math.round(minDesde / 60)}h. Mande UMA mensagem curta, leve e SEM cobranca.`
      + `\nNAO repita o que voce ja disse nem reformule a mesma pergunta: troque de angulo. Ofereca algo util (o link do catalogo, uma sugestao pelo tipo de loja dele, dizer que pode mandar so o que interessa) e faca no maximo UMA pergunta facil de responder.`
      + `\nNUNCA use pressa, escassez, "so hoje" nem cobranca de resposta.`
      + (toqueN >= o.toquesMax ? `\nESTE E O ULTIMO TOQUE: deixe a porta aberta sem insistir — diga que fica a disposicao quando ele quiser, e encerre com leveza.` : "")
      + `\n\nQUEM E: lead de campanha, nao representante e sem cadastro de cliente. ${L.origem ? ("Origem registrada no CRM: \"" + L.origem + "\".") : "Origem nao registrada."} Nao invente oferta nem condicao que possa ter sido anunciada.`
      + `\nPEDIDO MINIMO: R$ ${o.pedidoMin.toLocaleString("pt-BR")}.`
      + (cfg.catalogo_url ? `\nCATALOGO (link): ${cfg.catalogo_url}` : "")
      + `\n${jaSei ? "JA APURADO (nao pergunte de novo): " + jaSei : "Nao sei nada sobre a loja dele ainda."}`
      + (L.nome_confirmado ? `\nNOME JA CONFIRMADO por ele: ${L.nome}. Use esse.` : `\nVoce ainda NAO confirmou o nome dele (o que aparece e o do perfil do WhatsApp). Se couber no toque, pergunte o nome completo de leve — e chame salvar_lead com nome e nome_confirmado=true quando ele responder.`)
      + o.lic;
    const messages: any[] = [{ role: "user", content: msgs.map((m: any) => (m.direction === "inbound" ? "CONTATO: " : "VOCE (Nitron): ") + limpa(m.body).slice(0, 400)).join("\n") + "\n\n(Escreva SO o toque de seguimento, sem prefixo.)" }];
    const ctx: any = { contact_id: L.contact_id, fone: L.fone, instancia: L.instancia, dry: o.dry, source: L.origem };
    let texto = ""; const usadas: string[] = [];
    for (let i = 0; i < 4; i++) {
      const resp = await anthropic(sys, messages, TOOLS);
      const bl = resp.content || []; messages.push({ role: "assistant", content: bl });
      const tus = bl.filter((x: any) => x.type === "tool_use");
      if (resp.stop_reason !== "tool_use" || !tus.length) { texto = bl.filter((x: any) => x.type === "text").map((x: any) => x.text).join("\n").trim(); break; }
      const rs: any[] = [];
      for (const tu of tus) { usadas.push(tu.name); const out = await runTool(sb, ctx, tu.name, tu.input); rs.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out).slice(0, 4000) }); }
      messages.push({ role: "user", content: rs });
    }
    if (!texto) { feitos.push({ ...base, decisao: "erro", motivo: "o modelo nao devolveu texto" }); continue; }
    if (o.dry || !o.ativo) { feitos.push({ ...base, decisao: "previa_toque", toque: toqueN, canal: nativo ? "whatsapp-nativo-ghl" : ("zaptos:" + (L.instancia || o.inst)), horas_sem_resposta: Math.round(minDesde / 60), janela_fecha_em_min: restamMin === Infinity ? null : Math.round(restamMin), rascunho: texto }); continue; }
    const env = nativo ? await enviarNativo(String(L.contact_id), texto) : await enviar(L.contact_id, L.fone || "", texto, L.instancia || o.inst);
    if (!env?.ok) { feitos.push({ ...base, decisao: "falhou", motivo: env?.motivo || "envio recusado", texto }); continue; }
    await sb.from("copiloto_lead").update({ toques: toqueN, ultimo_toque_em: new Date().toISOString(), ultima_resposta_em: new Date().toISOString(), atualizado: new Date().toISOString() }).eq("id", L.id);
    tocados++;
    feitos.push({ ...base, decisao: "tocou", toque: toqueN, canal: nativo ? "whatsapp-nativo-ghl" : ("zaptos:" + (L.instancia || o.inst)), texto });
  }
  // quem estourou o teto de toques e continua calado vira 'frio'
  let esfriados = 0;
  if (!o.dry) {
    const { data: velhos } = await sb.from("copiloto_lead").select("id").eq("status", "qualificando").gte("toques", o.toquesMax).lt("ultima_resposta_em", new Date(Date.now() - o.seguirMin * 60000).toISOString());
    for (const v of (velhos || [])) { await sb.from("copiloto_lead").update({ status: "frio", motivo: "nao respondeu aos " + o.toquesMax + " toques", atualizado: new Date().toISOString() }).eq("id", v.id); esfriados++; }
  }
  const conta = (k: string) => feitos.filter((x) => x.decisao === k).length;
  return { candidatos: (cands || []).length, tocou: conta("tocou"), previa_toque: conta("previa_toque"), esfriou: conta("esfriou") + esfriados, pulou: conta("pular"), falhou: conta("falhou"), erro: conta("erro"), resultado: feitos };
}

// ---- rodada ----------------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!GHL) return j({ ok: false, erro: "sem GHL_TOKEN" }, 500);
    const sb = createClient(SUPA_URL, srvKey());
    const sp = new URL(req.url).searchParams;
    const b = await req.json().catch(() => ({} as any));
    const dry = sp.get("dry") === "1" || b.dry === true;
    const limite = Math.min(parseInt(sp.get("limite") || b.limite || "6") || 6, 20);

    // ---- REPARO: regrava copiloto_lead.fone com o telefone real do CRM ----
    // Existe por causa do d10(): ate a v9 a coluna guardou numero decapitado, e nao da para
    // reconstruir o que foi cortado (o digito perdido e o primeiro do DDD). A unica fonte de verdade
    // e o contato no GHL. ?acao=fone_crm&dry=1 mostra o que mudaria sem gravar.
    if (String(sp.get("acao") || b.acao || "").toLowerCase() === "fone_crm") {
      const { data: leads } = await sb.from("copiloto_lead").select("id, contact_id, nome, empresa, fone").order("id");
      const mud: any[] = [];
      for (const L of (leads || [])) {
        if (!L.contact_id) { mud.push({ id: L.id, situacao: "sem contact_id" }); continue; }
        const rc = await ghl("GET", "/contacts/" + L.contact_id);
        if (!rc.ok) { mud.push({ id: L.id, situacao: "GHL " + rc.status }); continue; }
        const dc = await rc.json().catch(() => ({} as any));
        const novo = foneNac(dc?.contact?.phone || "");
        if (!novo) { mud.push({ id: L.id, situacao: "contato sem telefone no CRM" }); continue; }
        if (novo === digits(L.fone)) { mud.push({ id: L.id, situacao: "ja certo", fone: foneFmt(novo) }); continue; }
        if (!dry) await sb.from("copiloto_lead").update({ fone: novo }).eq("id", L.id);
        mud.push({ id: L.id, quem: L.empresa || L.nome, situacao: dry ? "mudaria" : "corrigido", antes: foneFmt(L.fone), depois: foneFmt(novo) });
      }
      return j({ ok: true, acao: "fone_crm", dry, total: mud.length, corrigidos: mud.filter((x) => x.situacao === "corrigido" || x.situacao === "mudaria").length, resultado: mud });
    }

    const { data: cfgRows } = await sb.from("copiloto_config").select("*");
    const cfg: Record<string, string> = {}; (cfgRows || []).forEach((r: any) => cfg[r.chave] = r.valor);
    if (String(cfg.copiloto_ativo || "sim").toLowerCase() === "nao") return j({ ok: true, desligado: "copiloto_ativo=nao" });
    const ativo = String(cfg.lead_ativo || "nao").toLowerCase() === "sim";
    const inst = String(cfg.lead_inst || cfg.nome_assistente || "Nina").split(",")[0].trim();
    const pedidoMin = parseInt(digits(cfg.pedido_minimo || "2500")) || 2500;
    const esperaMin = Math.max(0, parseInt(cfg.lead_espera_min || "2") || 0);
    const ateHoras = Math.max(1, parseInt(cfg.lead_ate_horas || "48") || 48);
    const nativoOn = String(cfg.lead_nativo || "sim").toLowerCase() === "sim";
    const janelaH = Math.max(1, parseFloat(cfg.lead_janela_h || "23.5") || 23.5);
    const seguirMin = Math.max(15, parseInt(cfg.lead_seguir_min || "180") || 180);
    const toquesMax = Math.max(0, parseInt(cfg.lead_toques_max || "2") || 0);
    const soHorario = String(cfg.lead_toque_horario || "sim").toLowerCase() === "sim";
    const avisoMin = Math.max(0, parseInt(cfg.lead_janela_aviso_min || "90") || 0);
    const acao = String(sp.get("acao") || b.acao || "tudo").toLowerCase();
    RUIDO_EXTRA = null;
    if (String(cfg.lead_ruido_extra || "").trim()) { try { RUIDO_EXTRA = new RegExp(String(cfg.lead_ruido_extra).trim(), "i"); } catch (_e) { RUIDO_EXTRA = null; } }

    // as conversas em que a ULTIMA mensagem e do contato: ninguem respondeu ainda
    const r = await ghl("GET", `/conversations/search?locationId=${LOC}&limit=100&sortBy=last_message_date&sort=desc&lastMessageDirection=inbound`);
    if (!r.ok) return j({ ok: false, http: r.status, erro: (await r.text()).slice(0, 300) });
    const convs = ((await r.json())?.conversations || []) as any[];
    const agora = Date.now();
    // A INSTANCIA JA VEM NA BUSCA, no rodape da ultima mensagem (lastMessageBody): filtrar aqui, e
    // so depois cortar em `limite`. Na v1 o corte vinha antes do filtro e num dia normal de
    // operacao as conversas de representante empurravam o lead para fora da fila — as 20 primeiras
    // eram todas de outra instancia ou ja respondidas, e o lead do anuncio nunca era olhado.
    // De quebra, so busca as mensagens de quem interessa (uma chamada ao GHL por conversa).
    const daNina = (c: any) => { const i = instDe(c.lastMessageBody); return !!i && norm(i) === norm(inst); };
    // canal nativo: sem marcador de instancia, o proprio GHL diz o tipo
    const ehNativo = (c: any) => String(c.lastMessageType) === "TYPE_WHATSAPP";
    const naJanela = (c: any) => { const q = Number(c.lastMessageDate || 0); if (!q) return false; const min = (agora - q) / 60000; return min >= esperaMin && min <= ateHoras * 60; };
    const candidatas = convs.filter((c: any) => String(c.lastMessageType) !== "TYPE_EMAIL" && (daNina(c) || (nativoOn && ehNativo(c))) && naJanela(c));
    const alvos = candidatas.slice(0, limite);

    const { data: reps } = await sb.from("snap_rep").select("celular, fone_parc").limit(3000);
    const setReps = new Set<string>();
    (reps || []).forEach((x: any) => { const a = fk8(x.celular); const c = fk8(x.fone_parc); if (a) setReps.add(a); if (c) setReps.add(c); });
    // os numeros da casa (quem recebe o aviso do encerramento) — nunca sao lead
    const setInternos = new Set<string>();
    try {
      const { data: resp } = await sb.from("copiloto_responsaveis").select("fone");
      (resp || []).forEach((x: any) => { const a = fk8(x.fone); if (a) setInternos.add(a); });
    } catch (_e) { /* sem cadastro, so a trava dos reps vale */ }

    const pb = await playbook(sb); const lic = await licoes(sb);
    const opts = { dry, ativo, pedidoMin, inst, nativoOn, janelaH, pb, lic, reps: setReps, internos: setInternos };
    const feitos: any[] = [];
    if (acao !== "seguir") for (const cv of alvos) { try { feitos.push(await atender(sb, cfg, cv, opts)); } catch (e) { feitos.push({ contato: cv.fullName || cv.phone, decisao: "erro", motivo: String(e).slice(0, 200) }); } }

    // segundo toque em quem nao respondeu. Roda DEPOIS do inbound: se ele acabou de responder, a
    // conversa ja foi atendida acima e o seguimento a pula.
    let seg: any = null;
    if (acao !== "inbound" && toquesMax > 0) {
      try { seg = await seguir(sb, cfg, { dry, ativo, pedidoMin, inst, janelaH, seguirMin, toquesMax, soHorario, avisoMin, pb, lic, limite: Math.max(1, Math.min(limite, 4)) }); }
      catch (e) { seg = { erro: String(e).slice(0, 200) }; }
    }

    const conta = (k: string) => feitos.filter((x) => x.decisao === k).length;
    return j({
      ok: true, instancia: inst, lead_ativo: ativo, modo: dry ? "previa" : (ativo ? "atendendo" : "so rascunho (lead_ativo=nao)"),
      inbound_sem_resposta: convs.length, da_instancia_na_janela: candidatas.length, analisadas: feitos.length,
      respondeu: conta("respondeu"), previa: conta("previa"), pulou: conta("pular"), falhou: conta("falhou"), janela_fechada: conta("janela_fechada"), erro: conta("erro"),
      resultado: feitos,
      seguimento: seg,
    });
  } catch (e) { return j({ ok: false, erro: String(e) }, 500); }
});
