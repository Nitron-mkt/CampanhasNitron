// copiloto-lead (v3) — a Nina atende o LEAD DO ANUNCIO (META -> Zaptos da Nina), qualifica e passa
// pro comercial fechar.
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
const d10 = (s: any) => digits(s).slice(-10);
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
const RE_RUIDO = /(codigo de confirmacao|undecryptable|descriptografar|ative as listas|agradece seu contato|atendente virtual|horario de atendimento|entraremos em contato|selecione (a|uma|um) (opcao|assunto)|estou indisponivel|nao estou disponivel|retornarei assim que|ouvidoria)/;
// Abertura de quem veio do anuncio. O texto que o META pre-enche no clique e "Ola! Posso ter mais
// informacoes sobre isso?" — e o caso mais comum e o mais generico, por isso esta na lista.
const RE_ABRE = /(mais informacoe?s sobre isso|posso ter mais informacoe?s|quero saber mais|vim pelo (anuncio|face|insta)|vi (o|um) (anuncio|video|reels|post)|como (faco|fazer) (para|pra) (comprar|revender)|revend|atacado|catalogo|abastecer|sou (lojista|dono)|tenho (uma )?(loja|bazar|mercad)|preciso (de|comprar))/;
const ehRuido = (t: any) => RE_RUIDO.test(norm(t));
const ehAbertura = (t: any) => !ehRuido(t) && RE_ABRE.test(norm(t));

// documento so aparece formatado em CODIGO. A IA nunca escreve CNPJ — regra do gestor de 28/08: um
// digito trocado manda o comercial para outra empresa.
function docFmt(d: any): string {
  const x = digits(d);
  if (x.length === 14) return x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") + " (CNPJ)";
  if (x.length === 11) return x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") + " (CPF)";
  return x ? x + " (documento fora do padrao)" : "";
}

const ghl = (m: string, p: string, v = "2021-07-28") => fetch("https://services.leadconnectorhq.com" + p, { method: m, headers: { Authorization: "Bearer " + GHL, Version: v, Accept: "application/json", "Content-Type": "application/json" } });

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

// ---- ferramentas -----------------------------------------------------------------------------
// Conjunto CURTO de proposito: sem codparc, as ferramentas de preco/boleto/pedido/entrega so
// responderiam "codparc invalido" e convidariam a IA a inventar.
const TOOLS = [
  { name: "buscar_cliente", description: "Confere se a loja JA tem cadastro na Nitron, por CNPJ (14 digitos) ou por nome/razao. Use assim que tiver o CNPJ.", input_schema: { type: "object", properties: { termo: { type: "string", description: "CNPJ (so digitos) ou nome da loja" } }, required: ["termo"] } },
  { name: "consultar_conhecimento", description: "Base de conhecimento da casa (produto, mercado, playbook). Use quando ele perguntar algo que voce nao sabe de cabeca.", input_schema: { type: "object", properties: { termo: { type: "string" } }, required: ["termo"] } },
  { name: "produtos", description: "Produtos por categoria/nome/ramo: devolve nome e LINK da foto. SEM preco.", input_schema: { type: "object", properties: { termo: { type: "string" } }, required: ["termo"] } },
  { name: "salvar_lead", description: "Anota/atualiza o que voce JA apurou deste lead. Chame assim que descobrir um dado novo. Mande so o que ele disse — nao preencha por deducao.", input_schema: { type: "object", properties: { nome: { type: "string" }, empresa: { type: "string", description: "nome da loja / razao social" }, cnpj: { type: "string" }, cidade: { type: "string" }, uf: { type: "string" }, tipo_loja: { type: "string", description: "bazar, utilidades, variedades, presentes, supermercado, magazine, material de construcao..." }, ja_revende: { type: "string", description: "de quem ele compra hoje, ou que nao compra direto de fabrica" }, interesse: { type: "string", description: "linha/produto que ele quer abastecer" }, sabe_minimo: { type: "boolean", description: "true depois de VOCE dizer o pedido minimo nesta conversa" }, temperatura: { type: "string", enum: ["frio", "morno", "quente"] }, resumo: { type: "string", description: "2 a 3 frases do caso, para o comercial ler" } }, required: [] } },
  { name: "passar_comercial", description: "Fecha a qualificacao e passa pro comercial fechar a venda. Use quando ja souber a loja, a praca (cidade/UF) e o que ele quer, e ele ja souber do pedido minimo. Abre a tarefa na fila de execucao e devolve o protocolo.", input_schema: { type: "object", properties: { resumo: { type: "string", description: "o caso em 2 a 4 frases: quem e, o que quer, em que pe esta" }, falta: { type: "string", description: "o que o comercial ainda precisa levantar ou combinar" }, temperatura: { type: "string", enum: ["frio", "morno", "quente"] } }, required: ["resumo"] } },
  { name: "descartar_lead", description: "Use quando NAO e revenda: consumidor final querendo uma peca, curriculo, fornecedor oferecendo servico, engano de numero. Marca como descartado e NAO abre tarefa pro comercial.", input_schema: { type: "object", properties: { motivo: { type: "string" } }, required: ["motivo"] } },
];
const CAMPOS = ["nome", "empresa", "cnpj", "cidade", "uf", "tipo_loja", "ja_revende", "interesse", "resumo", "temperatura"];

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
      if (name === "salvar_lead") { const r = await upsertLead(sb, ctx, patch); return r.erro ? { erro: r.erro } : { ok: true, anotado: true, lead: { empresa: r.lead?.empresa, praca: [r.lead?.cidade, r.lead?.uf].filter(Boolean).join("/"), interesse: r.lead?.interesse, status: r.lead?.status } }; }
      if (name === "descartar_lead") { const r = await upsertLead(sb, ctx, { ...patch, status: "descartado", motivo: String(input?.motivo || "").slice(0, 300) }); return r.erro ? { erro: r.erro } : { ok: true, descartado: true, aviso: "marcado como descartado. Encerre com gentileza, sem insistir." }; }
      // passar_comercial: o texto da tarefa e montado AQUI, a partir da linha do lead. A IA escreve
      // o resumo em volta; documento e telefone entram em codigo.
      const up = await upsertLead(sb, ctx, { ...patch, status: "qualificado" });
      if (up.erro) return { erro: up.erro };
      const L = up.lead || {};
      const det = [
        L.empresa ? "Loja: " + L.empresa : null,
        L.nome ? "Contato: " + L.nome : null,
        ctx.fone ? "WhatsApp: " + ctx.fone : null,
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
        "Origem: lead do anuncio META, atendido pela Nina no Zaptos.",
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
async function atender(sb: any, cfg: Record<string, string>, cv: any, opts: { dry: boolean; ativo: boolean; pedidoMin: number; inst: string; pb: string; lic: string; reps: Set<string> }) {
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
  const instancia = instDe(ultima.body) || instDe(cv.lastMessageBody) || "";
  if (norm(instancia) !== norm(opts.inst)) return { ...base, decisao: "pular", motivo: "outra instancia: " + (instancia || "sem marcador") };

  const texto = limpa(ultima.body);
  if (!texto) return { ...base, decisao: "pular", motivo: "mensagem sem texto (midia)" };
  if (ehRuido(texto)) return { ...base, decisao: "pular", motivo: "ruido (sistema ou autoresposta de terceiro)" };
  if (fone && opts.reps.has(fk8(fone))) return { ...base, decisao: "pular", motivo: "e representante — quem atende e o copiloto-conversa" };

  // O fluxo do GHL marca quem vem do anuncio com a tag "ads" (e a instancia com "nina"). Isso e
  // MUITO mais confiavel do que adivinhar pela frase: o texto que o META pre-enche pode mudar a
  // qualquer momento no gerenciador, a tag nao. O regex fica como rede, para o caso de o contato
  // chegar sem tag.
  const tags = (Array.isArray(cv.tags) ? cv.tags : []).map((x: any) => norm(x));
  const ehAds = tags.includes("ads") || tags.includes("lead") || tags.includes("anuncio");
  const { data: leadRow } = await sb.from("copiloto_lead").select("*").or(`contact_id.eq.${contact_id || "__none__"},fone.eq.${d10(fone)}`).order("id", { ascending: false }).limit(1).maybeSingle();
  if (!leadRow && !ehAds && !ehAbertura(texto)) return { ...base, decisao: "pular", motivo: "sem tag de anuncio e a mensagem nao parece lead: " + texto.slice(0, 60) };
  if (leadRow?.ultima_msg_id && leadRow.ultima_msg_id === ultima.id) return { ...base, decisao: "pular", motivo: "ja respondi esta mensagem (o envio pode estar a caminho)" };

  const ctx: any = { contact_id, fone: d10(fone), instancia, dry: opts.dry };
  const jaSei = leadRow ? [leadRow.nome && "nome: " + leadRow.nome, leadRow.empresa && "loja: " + leadRow.empresa, leadRow.cnpj && "CNPJ ja informado", (leadRow.cidade || leadRow.uf) && "praca: " + [leadRow.cidade, leadRow.uf].filter(Boolean).join("/"), leadRow.tipo_loja && "tipo: " + leadRow.tipo_loja, leadRow.ja_revende && "compra hoje: " + leadRow.ja_revende, leadRow.interesse && "interesse: " + leadRow.interesse, leadRow.sabe_minimo && "JA sabe do pedido minimo", "status: " + leadRow.status].filter(Boolean).join(" | ") : "";

  const nome = prim(cfg.nome_assistente || opts.inst || "Nina");
  const sys = `Voce e a ${nome}, do time comercial da Nitronplast (Nitron), por WhatsApp. Calorosa e natural, pessoa de verdade da equipe.` + ESTILO
    + `\n\nHOJE e ${hojeBRT()} (data atual REAL; datas de 2026 sao normais).`
    + (opts.pb ? `\n\nMANUAIS DA CASA (o [LEAD] manda aqui):\n${opts.pb}` : "")
    + `\n\nQUEM E ESTE CONTATO: um LEAD do anuncio da Nitron no META. NAO e representante e NAO tem cadastro de cliente — sem codparc nao existe tabela de preco, boleto, pedido nem entrega para consultar. Se ele falar como quem ja compra, peca o CNPJ e confira com buscar_cliente.`
    + `\nPEDIDO MINIMO da Nitron: R$ ${opts.pedidoMin.toLocaleString("pt-BR")}. Diga quando a conversa chegar em volume, mix ou como comprar — nunca na abertura.`
    + (cfg.catalogo_url ? `\nCATALOGO (mande o LINK quando ele quiser ver produtos): ${cfg.catalogo_url}` : "")
    + (cfg.site_url ? `\nSITE: ${cfg.site_url}` : "")
    + `\n${jaSei ? "JA APURADO (nao pergunte de novo): " + jaSei : "AINDA NAO SEI NADA sobre ele — comece pelo tipo de loja e o que ele precisa abastecer."}`
    + (nomeCrm ? `\nNome dele no CRM: ${nomeCrm} (pode ser apelido do WhatsApp — confirme antes de usar em cheio).` : "")
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

  if (opts.dry || !opts.ativo) return { ...base, decisao: "previa", instancia, por_tag: ehAds, ferramentas: usadas, recebido: texto.slice(0, 200), rascunho: reply, motivo: opts.dry ? "previa (dry=1)" : "lead_ativo=nao" };

  const env = await enviar(contact_id, fone, reply, opts.inst);
  const up = await upsertLead(sb, ctx, { nome: leadRow?.nome || null, ultima_msg_id: ultima.id, ultima_resposta_em: new Date().toISOString(), status: leadRow?.status || "qualificando" });
  if (!env?.ok) return { ...base, decisao: "falhou", instancia, ferramentas: usadas, motivo: env?.motivo || "envio recusado", texto: reply };
  return { ...base, decisao: "respondeu", instancia, ferramentas: usadas, lead_id: up.lead?.id || null, status: up.lead?.status, recebido: texto.slice(0, 200), texto: reply };
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

    const { data: cfgRows } = await sb.from("copiloto_config").select("*");
    const cfg: Record<string, string> = {}; (cfgRows || []).forEach((r: any) => cfg[r.chave] = r.valor);
    if (String(cfg.copiloto_ativo || "sim").toLowerCase() === "nao") return j({ ok: true, desligado: "copiloto_ativo=nao" });
    const ativo = String(cfg.lead_ativo || "nao").toLowerCase() === "sim";
    const inst = String(cfg.lead_inst || cfg.nome_assistente || "Nina").split(",")[0].trim();
    const pedidoMin = parseInt(digits(cfg.pedido_minimo || "2500")) || 2500;
    const esperaMin = Math.max(0, parseInt(cfg.lead_espera_min || "2") || 0);
    const ateHoras = Math.max(1, parseInt(cfg.lead_ate_horas || "48") || 48);

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
    const naJanela = (c: any) => { const q = Number(c.lastMessageDate || 0); if (!q) return false; const min = (agora - q) / 60000; return min >= esperaMin && min <= ateHoras * 60; };
    const candidatas = convs.filter((c: any) => String(c.lastMessageType) !== "TYPE_EMAIL" && daNina(c) && naJanela(c));
    const alvos = candidatas.slice(0, limite);

    const { data: reps } = await sb.from("snap_rep").select("celular, fone_parc").limit(3000);
    const setReps = new Set<string>();
    (reps || []).forEach((x: any) => { const a = fk8(x.celular); const c = fk8(x.fone_parc); if (a) setReps.add(a); if (c) setReps.add(c); });

    const opts = { dry, ativo, pedidoMin, inst, pb: await playbook(sb), lic: await licoes(sb), reps: setReps };
    const feitos: any[] = [];
    for (const cv of alvos) { try { feitos.push(await atender(sb, cfg, cv, opts)); } catch (e) { feitos.push({ contato: cv.fullName || cv.phone, decisao: "erro", motivo: String(e).slice(0, 200) }); } }

    const conta = (k: string) => feitos.filter((x) => x.decisao === k).length;
    return j({
      ok: true, instancia: inst, lead_ativo: ativo, modo: dry ? "previa" : (ativo ? "atendendo" : "so rascunho (lead_ativo=nao)"),
      inbound_sem_resposta: convs.length, da_instancia_na_janela: candidatas.length, analisadas: feitos.length,
      respondeu: conta("respondeu"), previa: conta("previa"), pulou: conta("pular"), falhou: conta("falhou"), erro: conta("erro"),
      resultado: feitos,
    });
  } catch (e) { return j({ ok: false, erro: String(e) }, 500); }
});
