// copiloto-repasse (v3) — o lead qualificado deixa de esperar em silencio.
//
// Ate aqui a Nina qualificava, abria tarefa no CRM e avisava o gestor — e parava. Quem ia falar com
// o lead era decidido a mao, e o lead ficava esperando sem saber que estava esperando. O gestor
// pediu em 14/09 que isso vire rotina, e sao tres movimentos:
//   1. SAUDACAO ao lead, na hora: um representante fala com voce ainda hoje. Sem isso ele fica
//      olhando para uma conversa que morreu depois de "um consultor assume daqui".
//   2. CLASSIFICACAO: loja de rua ou e-commerce/marketplace. Nao e detalhe — quem vende online nao
//      tem praca, e mandar para o representante da praca e mandar para ninguem.
//   3. SORTEIO de quem atende: entre os representantes da praca (loja fisica) ou entre as
//      vendedoras internas (online). O sorteio mora no BANCO (funcao repasse_candidatos), nao aqui,
//      para dar para conferir em SQL quem estava no chapeu.
//
// O TEXTO E MONTADO EM CODIGO, sem IA. Regra da casa de 28/08: a IA nunca escreve CNPJ — um digito
// trocado manda o representante para outra empresa. Aqui o documento sai de copiloto_lead.cnpj,
// formatado por docFmt(), em linha propria.
//
// O NUMERO DE SAIDA E O DONO DO CONTATO. Entao antes de mandar a funcao confere o dono do contato do
// destinatario e, se ele nao for uma instancia viva, passa o contato para a instancia de repasse
// (Camyla) — autorizado pelo gestor em 10/09 para contato INTERNO. Sem isso o aviso e aceito pelo
// GHL e nunca chega, que foi o que custou 8 mensagens em 26/08.
//
// ?dry=1 mostra o que sairia sem mandar e sem gravar. ?lead=<id> forca um lead. ?limite=N.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
// SUPABASE_SERVICE_ROLE_KEY vem com valor sb_secret_, que o PostgREST recusa (PGRST303).
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GHL = (Deno.env.get("GHL_TOKEN") || "").trim();
const LOC = "rZ8y7lzqV7fzxsartaX2";

const digits = (s: any) => String(s || "").replace(/\D/g, "");
const d10 = (s: any) => digits(s).slice(-10);
const norm = (s: any) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
const lista = (s: any, pad: string) => String(s ?? pad).split(",").map((x) => x.trim()).filter(Boolean);
const ghl = (m: string, p: string, v = "2021-07-28", body?: any) => fetch("https://services.leadconnectorhq.com" + p, { method: m, headers: { Authorization: "Bearer " + GHL, Version: v, Accept: "application/json", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

// documento so aparece formatado em CODIGO, nunca escrito por IA (regra do gestor, 28/08).
function docFmt(d: any): string {
  const x = digits(d);
  if (x.length === 14) return x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") + " (CNPJ)";
  if (x.length === 11) return x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") + " (CPF)";
  return x ? x + " (documento fora do padrao)" : "";
}
// telefone do lead como a pessoa do outro lado vai discar.
// So tira o 55 quando o que sobra e um numero brasileiro plausivel (10 ou 11 digitos): ha numero
// que COMECA com 55 sem ser DDI, e cortar ali inventa um telefone.
function foneFmt(f: any): string {
  let d = digits(f);
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
  if (d.length === 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
  return String(f || "");
}

async function enviarZaptos(contact_id: string | null, fone: string, texto: string, instancia: string) {
  const body: any = { canal: "whatsapp", texto, instancia };
  if (contact_id) body.contact_id = contact_id; else body.fone = fone;
  const r = await fetch(SUPA_URL + "/functions/v1/campanhas-enviar", { method: "POST", headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return await r.json().catch(() => ({ ok: false, motivo: "resposta ilegivel do campanhas-enviar" }));
}
// lookup=true: o campanhas-enviar acha (ou cria) o contato pelo telefone e devolve o id SEM mandar
// nada. E como a gente descobre em qual contato do CRM o representante vive — sem isso nao da para
// conferir o dono, e o dono e quem decide o numero de saida.
async function lookupContato(fone: string, instancia: string) {
  try {
    const r = await fetch(SUPA_URL + "/functions/v1/campanhas-enviar", { method: "POST", headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" }, body: JSON.stringify({ canal: "whatsapp", fone, instancia, lookup: true }) });
    return await r.json().catch(() => ({}));
  } catch (_e) { return {}; }
}

// canal oficial da Meta: nao tem instancia, e passadas ~24h da mensagem do lead so template passa.
async function enviarNativo(contact_id: string, texto: string) {
  const r = await ghl("POST", "/conversations/messages", "2021-04-15", { type: "WhatsApp", contactId: contact_id, message: texto });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, motivo: r.ok ? undefined : String(d?.message || ("GHL " + r.status)).slice(0, 200) };
}
// O TELEFONE DO LEAD VEM DO CRM, nao de copiloto_lead.fone. Motivo caro, descoberto em 14/09: a
// coluna guarda o resultado de d10(), que fica com os 10 ULTIMOS digitos — e isso decapita o celular
// brasileiro de 11 digitos. O (11) 98240-8982 virou "(19) 8240-8982" na mensagem, e a Monica ligou
// para um numero que nao existe. O contato do GHL tem o numero inteiro, com DDI.
async function foneDoCrm(contact_id: string | null): Promise<string> {
  if (!contact_id) return "";
  try {
    const r = await ghl("GET", `/contacts/${contact_id}`);
    if (!r.ok) return "";
    const c = (await r.json().catch(() => ({})))?.contact || {};
    return String(c.phone || "");
  } catch (_e) { return ""; }
}

async function notaCrm(contact_id: string, texto: string) {
  try { const r = await ghl("POST", `/contacts/${contact_id}/notes`, "2021-07-28", { body: texto.slice(0, 4000) }); return r.ok; } catch (_e) { return false; }
}

// ---- o dono do contato manda no numero de saida ------------------------------------------------
type Inst = { instancia: string; usuario_ghl_id: string; viva: boolean };
async function instancias(sb: any): Promise<Inst[]> {
  const { data } = await sb.from("instancia_ghl").select("instancia, usuario_ghl_id, ativa, pausada_em");
  return (data || []).map((x: any) => ({ instancia: String(x.instancia), usuario_ghl_id: String(x.usuario_ghl_id || ""), viva: !!x.ativa && !x.pausada_em }));
}
// Devolve o contato pronto para receber: com dono que seja a instancia remetente. Troca o dono
// quando ele e instancia morta — autorizado pelo gestor para contato INTERNO (rep e time).
async function prepararDestino(contact_id: string, remetente: Inst, insts: Inst[], trocar: boolean) {
  const r = await ghl("GET", `/contacts/${contact_id}`);
  if (!r.ok) return { ok: false, motivo: "GHL " + r.status + " ao ler o contato" };
  const c = (await r.json().catch(() => ({})))?.contact || {};
  const dono = String(c.assignedTo || "");
  const donoInst = insts.find((i) => i.usuario_ghl_id === dono) || null;
  if (donoInst && donoInst.instancia === remetente.instancia) return { ok: true, dono: donoInst.instancia, trocou: false };
  if (donoInst && donoInst.viva) return { ok: true, dono: donoInst.instancia, trocou: false, usar_dono: true };
  if (!trocar) return { ok: false, motivo: "dono do contato e " + (donoInst?.instancia || (dono ? "usuario fora do cadastro" : "ninguem")) + " e a troca esta desligada" };
  const u = await ghl("PUT", `/contacts/${contact_id}`, "2021-07-28", { assignedTo: remetente.usuario_ghl_id });
  if (!u.ok) return { ok: false, motivo: "nao consegui trocar o dono (GHL " + u.status + ")" };
  return { ok: true, dono: remetente.instancia, trocou: true, dono_antes: donoInst?.instancia || (dono ? dono : "sem dono") };
}

// ---- os textos, todos montados aqui ------------------------------------------------------------
function textoSaudacao(L: any, tipo: string): string {
  const quem = tipo === "online" ? "uma das nossas consultoras de venda" : "um dos nossos representantes";
  const nome = String(L.nome || "").trim().split(/\s+/)[0] || "";
  return [
    (nome ? "Oi, " + nome + "! " : "Oi! ") + "Aqui e a Nina, da Nitron.",
    "",
    "Passando so para te dar um retorno: suas informacoes ja estao com " + quem + ", e o contato com voce sai ainda hoje por aqui mesmo, pelo WhatsApp.",
    "",
    "Se precisar de qualquer coisa antes disso, e so me chamar.",
  ].join("\n");
}

function textoDestino(L: any, tipo: string, destino: string, escopo: string, cfg: Record<string, string>): string {
  const min = parseInt(digits(cfg.pedido_minimo || "2500")) || 2500;
  const praca = [L.cidade, L.uf].filter(Boolean).join("/");
  const cab = tipo === "online"
    ? destino + ", chegou um lead do anuncio da Nitron que vende ONLINE (sem loja de rua), entao e da venda interna."
    : destino + ", chegou um lead do anuncio da Nitron" + (praca ? (" na sua praca (" + praca + ")") : "") + ", e ja foi qualificado aqui.";
  const linhas = [
    cab,
    "",
    L.empresa ? "Loja: " + L.empresa : null,
    docFmt(L.cnpj) || "Sem documento informado",
    praca ? "Praca: " + praca : null,
    "Contato: " + (L.nome ? L.nome + " — " : "") + foneFmt(L.fone),
    L.tipo_loja ? "Tipo: " + L.tipo_loja : null,
    L.interesse ? "Quer abastecer: " + L.interesse : null,
    L.ja_revende ? "Compra hoje: " + L.ja_revende : null,
    "Pedido minimo: " + (L.sabe_minimo ? "ja sabe que e R$ " + min.toLocaleString("pt-BR") + " e seguiu interessado" : "AINDA NAO SABE — diga na abordagem (R$ " + min.toLocaleString("pt-BR") + ")"),
    L.temperatura ? "Temperatura: " + L.temperatura : null,
    "",
    L.resumo ? "Resumo da conversa: " + L.resumo : null,
    "",
    "O que a Nina NAO falou, e e com voce: preco, prazo de entrega, condicao de pagamento, desconto e frete. Ela so disse que alguem da Nitron fala com ele hoje.",
    "",
    "Como seguir:",
    "1. Fale com ele por WhatsApp — ele esta esperando esse contato hoje.",
    "2. Se apresente como " + (tipo === "online" ? "a consultora da Nitron que vai atende-lo" : "o representante da Nitron da regiao") + ".",
    "3. Confirme a loja e o CNPJ, e peca a inscricao estadual: ja adianta o cadastro.",
    "4. Antes de mandar tabela, entenda o que ele vende hoje e o tamanho da operacao. A primeira compra e curadoria, nao catalogo inteiro.",
    "5. Preco, prazo e pagamento sao com voce.",
    "6. Travou cadastro, credito ou disponibilidade? Me chama que resolvemos daqui.",
    "",
    // o recado do prazo, pedido pelo gestor: sutil, sem ameaca
    "Se hoje nao der para voce falar com ele, me avisa por aqui — como o cliente ja foi avisado de que o contato sai hoje, eu preciso passar para outro consultor para nao deixar ele no vacuo.",
    escopo === "uf" ? "\n(Obs.: nao temos cliente nessa cidade ainda, entao voce entrou como representante do estado. Se essa praca nao for sua, me diz que eu passo para quem atende.)" : null,
  ].filter((x) => x !== null);
  return linhas.join("\n");
}

// ---- um lead -----------------------------------------------------------------------------------
async function repassar(sb: any, cfg: Record<string, string>, L: any, o: { dry: boolean; insts: Inst[] }) {
  const rep: any = { lead: L.id, contato: L.empresa || L.nome || L.fone, praca: [L.cidade, L.uf].filter(Boolean).join("/") };
  const hist: any[] = Array.isArray(L.repasse_historico) ? L.repasse_historico : [];

  // ---- 1) fisica ou online? -------------------------------------------------------------------
  // Le tudo o que a Nina apurou, nao so tipo_loja: "atua em marketplaces" costuma aparecer no resumo.
  let re: RegExp | null = null;
  try { re = new RegExp(String(cfg.repasse_online_re || "e-?commerce|marketplace"), "i"); } catch (_e) { re = /e-?commerce|marketplace/i; }
  const bagagem = norm([L.tipo_loja, L.interesse, L.ja_revende, L.resumo, L.empresa].filter(Boolean).join(" | "));
  const tipo = re.test(bagagem) ? "online" : "fisica";
  rep.tipo = tipo;

  // ---- 2) quem atende -------------------------------------------------------------------------
  let destNome = "", destFone = "", destContato: string | null = null, destCodvend: number | null = null, escopo = "", destInstPropria = "";
  if (tipo === "online") {
    const { data: vs } = await sb.from("copiloto_venda_interna").select("*").eq("ativo", true);
    const jaForam = new Set(hist.map((h: any) => String(h.para || "")));
    const pool = (vs || []).filter((v: any) => !jaForam.has(String(v.nome)));
    const cand = (pool.length ? pool : (vs || []));
    if (!cand.length) { rep.erro = "nenhuma vendedora interna ativa em copiloto_venda_interna"; return rep; }
    // Sorteio COM MEMORIA: embaralha e depois traz para a frente quem recebeu menos. Sorteio puro,
    // sem isso, empilha — na primeira previa os tres leads online cairam na mesma pessoa e a outra
    // ficou sem nenhum. Continua aleatorio: o desempate entre quem tem a mesma carga e que e sorteio.
    cand.sort(() => Math.random() - 0.5);
    cand.sort((a: any, b: any) => Number(a.repasses || 0) - Number(b.repasses || 0));
    const v = cand[0];
    destNome = v.nome; destFone = v.fone; destContato = v.contact_id || null; destCodvend = v.codvend || null; destInstPropria = v.instancia || "";
    escopo = "venda interna";
  } else {
    if (!L.uf) { rep.erro = "lead sem UF — nao da para achar o representante da praca"; return rep; }
    const { data: cands, error } = await sb.rpc("repasse_candidatos", { p_cidade: L.cidade || "", p_uf: L.uf, p_excluir: lista(cfg.repasse_rep_excluir, "0,67,116").map((x) => parseInt(x)).filter((n) => !isNaN(n)) });
    if (error) { rep.erro = "sorteio falhou: " + error.message; return rep; }
    const jaForam = new Set(hist.map((h: any) => Number(h.codvend)).filter(Boolean));
    const pool = (cands || []).filter((c: any) => !jaForam.has(Number(c.codvend)));
    const lista0 = (pool.length ? pool : (cands || []));
    // mesma ideia do lado do representante: o RPC ja devolve embaralhado, e aqui quem recebeu menos
    // lead deste funil vem primeiro. Sem isso o mesmo nome pode levar a praca inteira por azar.
    const { data: cargas } = await sb.from("copiloto_lead").select("repasse_codvend").not("repasse_codvend", "is", null);
    const carga: Record<string, number> = {};
    (cargas || []).forEach((x: any) => { const k = String(x.repasse_codvend); carga[k] = (carga[k] || 0) + 1; });
    lista0.sort((a: any, b: any) => (carga[String(a.codvend)] || 0) - (carga[String(b.codvend)] || 0));
    const c = lista0[0];
    if (!c) { rep.erro = "nenhum representante elegivel em " + [L.cidade, L.uf].filter(Boolean).join("/"); return rep; }
    destCodvend = Number(c.codvend); destNome = String(c.rep); escopo = String(c.escopo);
    rep.candidatos = (cands || []).length;
    const { data: s } = await sb.from("snap_rep").select("celular, fone_parc, email").eq("codvend", destCodvend).maybeSingle();
    destFone = digits(s?.celular).length >= 10 ? String(s?.celular) : String(s?.fone_parc || "");
    if (digits(destFone).length < 10) { rep.erro = "representante " + destNome + " (codvend " + destCodvend + ") sem telefone utilizavel em snap_rep"; return rep; }
  }
  rep.destino = destNome; rep.codvend = destCodvend; rep.escopo = escopo; rep.fone_destino = foneFmt(destFone);

  // ---- 3) por qual instancia sai ---------------------------------------------------------------
  // Nunca pela instancia do proprio destinatario: numero nao conversa consigo mesmo.
  const nomeInst = String(cfg.repasse_inst || "Camyla");
  const alt = String(cfg.repasse_inst_alt || "Nina");
  const escolhida = (norm(nomeInst) === norm(destInstPropria) ? alt : nomeInst);
  const remetente = o.insts.find((i) => norm(i.instancia) === norm(escolhida) && i.viva) || o.insts.find((i) => i.viva && norm(i.instancia) !== norm(destInstPropria));
  if (!remetente) { rep.erro = "nenhuma instancia viva para mandar o aviso"; return rep; }
  rep.instancia = remetente.instancia;

  // numero do lead pelo CRM; se o CRM nao devolver, cai no que esta gravado (pode estar truncado)
  const foneLead = (await foneDoCrm(L.contact_id)) || L.fone;
  const Lx = { ...L, fone: foneLead };
  rep.fone_lead = foneFmt(foneLead);
  const textoLead = textoSaudacao(Lx, tipo);
  const textoDest = textoDestino(Lx, tipo, String(destNome).split(/\s+/)[0], escopo, cfg);

  if (o.dry) {
    return { ...rep, previa: true, saudacao_pendente: !L.saudacao_em, texto_lead: textoLead, texto_destino: textoDest };
  }

  // ---- 4) saudacao ao lead ---------------------------------------------------------------------
  if (!L.saudacao_em && String(cfg.repasse_saudacao || "sim") === "sim") {
    const nativo = String(L.instancia || "") === "ghl-nativo";
    const env: any = nativo
      ? await enviarNativo(String(L.contact_id), textoLead)
      : await enviarZaptos(L.contact_id, L.fone, textoLead, String(L.instancia || cfg.lead_inst || "Nina"));
    rep.saudacao = { ok: !!env?.ok, motivo: env?.ok ? undefined : String(env?.motivo || "").slice(0, 200) };
    if (env?.ok) await sb.from("copiloto_lead").update({ saudacao_em: new Date().toISOString(), atualizado: new Date().toISOString() }).eq("id", L.id);
  } else rep.saudacao = { ok: true, ja_feita: true };

  // ---- 5) o contato do destinatario precisa de dono vivo ---------------------------------------
  let alvoContato = destContato;
  let usarDono = false;
  if (!alvoContato && destFone) {
    const lk: any = await lookupContato(destFone, remetente.instancia);
    if (lk?.contactId) alvoContato = String(lk.contactId);
    rep.contato_destino = alvoContato || null;
  }
  if (alvoContato) {
    const prep = await prepararDestino(alvoContato, remetente, o.insts, String(cfg.repasse_troca_dono || "sim") === "sim");
    if (!prep.ok) { rep.erro = prep.motivo; }
    else { rep.dono = prep.dono; if (prep.trocou) rep.dono_trocado_de = prep.dono_antes; if ((prep as any).usar_dono) { usarDono = true; rep.instancia = prep.dono; } }
  }

  // ---- 6) manda -------------------------------------------------------------------------------
  const instEnvio = usarDono ? String(rep.instancia) : remetente.instancia;
  const env: any = await enviarZaptos(alvoContato, destFone, textoDest, instEnvio);
  rep.enviado = !!env?.ok;
  if (!env?.ok) rep.erro = String(env?.motivo || "envio recusado").slice(0, 300);
  if (env?.contactId && !alvoContato) alvoContato = env.contactId;

  // ---- 7) rastro ------------------------------------------------------------------------------
  const agora = new Date().toISOString();
  hist.push({ em: agora, tipo, para: destNome, codvend: destCodvend, escopo, instancia: instEnvio, ok: !!env?.ok, motivo: env?.ok ? undefined : String(env?.motivo || "").slice(0, 200) });
  await sb.from("copiloto_lead").update({
    repasse_tipo: tipo, repasse_codvend: destCodvend, repasse_para: destNome, repasse_fone: digits(destFone),
    repasse_em: env?.ok ? agora : null, repasse_ok: !!env?.ok, repasse_erro: env?.ok ? null : String(env?.motivo || "").slice(0, 300),
    repasse_tentativas: Number(L.repasse_tentativas || 0) + 1, repasse_historico: hist, atualizado: agora,
  }).eq("id", L.id);

  if (env?.ok && tipo === "online" && destNome) {
    try {
      const { data: v0 } = await sb.from("copiloto_venda_interna").select("repasses").eq("nome", destNome).maybeSingle();
      await sb.from("copiloto_venda_interna").update({ repasses: Number(v0?.repasses || 0) + 1, ultimo_em: agora, atualizado: agora }).eq("nome", destNome);
    } catch (_e) { /* contador, nao bloqueia */ }
  }

  if (env?.ok && L.contact_id) {
    await notaCrm(String(L.contact_id), "Lead repassado por " + (tipo === "online" ? "VENDA INTERNA" : "REPRESENTANTE DA PRACA") +
      ": " + destNome + (destCodvend ? (" (codvend " + destCodvend + ")") : "") + ", avisado por Zaptos pela instancia " + instEnvio + "." +
      "\nSorteio: " + escopo + ". O lead foi saudado e sabe que o contato sai hoje.");
  }
  return rep;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!GHL) return j({ ok: false, erro: "sem GHL_TOKEN" }, 500);
    const sb = createClient(SUPA_URL, srvKey());
    const sp = new URL(req.url).searchParams;
    const b = await req.json().catch(() => ({} as any));
    const dry = sp.get("dry") === "1" || b.dry === true;
    const umId = parseInt(String(sp.get("lead") || b.lead || "0")) || 0;

    const { data: cfgRows } = await sb.from("copiloto_config").select("*");
    const cfg: Record<string, string> = {}; (cfgRows || []).forEach((r: any) => cfg[r.chave] = r.valor);
    if (String(cfg.copiloto_ativo || "sim").toLowerCase() === "nao") return j({ ok: true, desligado: "copiloto_ativo=nao" });
    if (!umId && String(cfg.repasse_ativa || "sim").toLowerCase() !== "sim") return j({ ok: true, desligado: "repasse_ativa=nao" });

    const limite = Math.min(parseInt(String(sp.get("limite") || b.limite || cfg.repasse_limite || "8")) || 8, 30);
    const janelaH = Math.max(1, parseInt(cfg.repasse_janela_h || "120") || 120);

    let q = sb.from("copiloto_lead").select("*");
    if (umId) q = q.eq("id", umId);
    else q = q.eq("status", "passado").is("repasse_em", null).lt("repasse_tentativas", 3)
             .gte("criado", new Date(Date.now() - janelaH * 3600000).toISOString());
    const { data: leads, error } = await q.order("id", { ascending: true }).limit(limite);
    if (error) return j({ ok: false, erro: error.message }, 500);

    const insts = await instancias(sb);
    const feitos: any[] = [];
    for (const L of (leads || [])) {
      try { feitos.push(await repassar(sb, cfg, L, { dry, insts })); }
      catch (e) { feitos.push({ lead: L.id, erro: String(e).slice(0, 200) }); }
    }
    return j({
      ok: true, modo: dry ? "previa" : "repassando", pendentes: (leads || []).length,
      repassados: feitos.filter((f) => f.enviado).length, com_erro: feitos.filter((f) => f.erro).length,
      resultado: feitos,
    });
  } catch (e) { return j({ ok: false, erro: String(e) }, 500); }
});
