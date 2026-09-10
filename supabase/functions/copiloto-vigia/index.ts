// copiloto-vigia (v6) — detecta travados, resolve pelo cerebro da Nina, avisa (gated). FIX chave: SRV_JWT (sb_secret quebrada) tb usada como Bearer nas chamadas internas.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const SUPA_URL = Deno.env.get("SUPABASE_URL")!; const SRK = Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const LOC = "rZ8y7lzqV7fzxsartaX2";
const digits = (s: any) => String(s || "").replace(/\D/g, "");
const last8 = (s: any) => { let d = digits(s).replace(/^0+/, "").replace(/^55/, ""); if (d.length > 8) d = d.slice(-8); return d; };
const norm = (s: any) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const chaveNome = (s: any) => norm(s).replace(/\b(ltda|me|epp|eireli|sa|s\/a|comercio|comercial|distribuidora|industria|e|de|do|da|dos|das)\b/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
function brtHoje(): string { const d = new Date(Date.now() - 3 * 3600 * 1000); return d.toISOString().slice(0, 10); }
const RE_FACTUAL = /(boleto|2a via|segunda via|linha digitavel|codigo de barras|pagar|pagamento|titulo|venciment|nota|nf\b|pedido|faturou|faturad|faturament|prazo|entrega|entregar|agendar|agendament|chegou|nao chegou|rastrei|transportadora|carga|saldo|estoque|disponivel|produto|referencia|tabela|status|quando|qual|cade|onde|ja saiu|ja foi)/i;
const RE_EVASIVA = /(vou (verificar|confirmar|checar|ver com|levantar|dar uma olhada|olhar|passar|falar com)|deixa eu (ver|confirmar|checar|olhar)|ja (te )?retorno|assim que (eu )?(tiver|souber|confirmar)|preciso (confirmar|verificar|checar)|ja te falo|ja te aviso|volto (ja|em seguida)|um instante|so um minuto|aguarda|aguarde)/i;
const RE_NAORESOLV = /\bn[aã]o[_ ]?resolvivel\b/i;
const RE_PEDEINFO = /(preciso (de|do|da|que|identificar|localizar)|me pass[ae]|voce (tem|consegue|pode|sabe|confirma)|qual (e|é|o|a|desses|deles|dessas) |confirm[ae] |pec[ao] o|solicit[ae] o|informe |manda (o |a |ai)|envi[ae] |n[aã]o (retornaram|encontrei|localizei|consta|consigo confirmar|foi possivel)|sem (mais )?informa|nenhum (dado|resultado))[\s\S]{0,80}(cnpj|codigo|c[oó]digo|nome|raz[aã]o|numero|n[uú]mero|pedido|nota|cliente|identific|qual (desses|deles|dessas|e))/i;
const NOISE_NOME = /^(pagamentos?|logistica|financeiro|faturamento\d*|expedicao|nitron|cobranca|sac|comercial|fiscal|marketing|rh|ti|compras|contabil)$/i;
function ehSubstantiva(t: string): boolean { const s = String(t || "").trim(); if (s.length < 6) return false; if (/^\[/.test(s)) return false; if (/^https?:\/\/\S+$/.test(s)) return false; return true; }
function limpaTexto(t: string): string { return String(t || "").replace(/Instance Source:.*/is, "").replace(/#\w+:\S+/g, "").replace(/\s+/g, " ").trim(); }

async function detectar(sb: any, dia: string) {
  const { data: rd } = await sb.from("relatorio_dia").select("coleta").eq("dia", dia).maybeSingle();
  const convs: any[] = rd?.coleta?.conversas || [];
  if (!convs.length) return { ok: true, dia, aviso: "sem coleta p/ esse dia", conversas: 0 };
  const { data: sc } = await sb.from("snap_contato").select("codparc, email, fone").limit(40000);
  const porFone: Record<string, number> = {}; const porEmail: Record<string, number> = {};
  (sc || []).forEach((r: any) => { const f = last8(r.fone); if (f && !porFone[f]) porFone[f] = r.codparc; const e = norm(r.email); if (e && !porEmail[e]) porEmail[e] = r.codparc; });
  const porNome: Record<string, number> = {}; try { const { data: sp } = await sb.from("snap_parceiro").select("codparc, razaosocial, nomeparc").limit(60000); (sp || []).forEach((r: any) => { for (const nm of [r.razaosocial, r.nomeparc]) { const k = chaveNome(nm); if (k && k.length >= 5 && porNome[k] === undefined) porNome[k] = r.codparc; } }); } catch (_e) { /* */ }
  const { data: tr } = await sb.from("transcricoes").select("conversation_id, audio_url, texto").eq("dia", dia).not("texto", "is", null);
  const trMap: Record<string, string> = {}; (tr || []).forEach((r: any) => { if (r.audio_url) trMap[r.conversation_id + "|" + r.audio_url] = r.texto; });
  const { data: ai } = await sb.from("assistente_instancia").select("nome, fone, ativo");
  const foneAssist: Record<string, string> = {}; (ai || []).forEach((r: any) => { foneAssist[norm(r.nome)] = r.fone; });

  let detectadas = 0, fechadas = 0, varridas = 0, ruido = 0;
  for (const c of convs) {
    if (c?.negocio === false) continue; const msgs0: any[] = Array.isArray(c?.mensagens) ? c.mensagens : []; if (!msgs0.length) continue; varridas++;
    const nomeCli = c.empresa && c.empresa !== "Nitron" ? c.empresa : (c.nome || "");
    const msgs = msgs0.map((m: any) => { let txt = limpaTexto(m.texto); if ((!txt || /pendente de transcri/i.test(m.texto || "")) && m.audio_url && trMap[c.id + "|" + m.audio_url]) txt = limpaTexto(trMap[c.id + "|" + m.audio_url]); return { t: m.t, dir: m.dir, quem: m.quem, tipo: m.tipo, texto: txt }; }).sort((a: any, b: any) => String(a.t).localeCompare(String(b.t)));
    let li = -1; for (let i = msgs.length - 1; i >= 0; i--) { if (msgs[i].dir === "inbound" && msgs[i].quem !== "gestor") { li = i; break; } }
    if (li < 0) continue; const perg = msgs[li].texto; if (!ehSubstantiva(perg) || !RE_FACTUAL.test(perg)) continue;
    let respondeu = false, evasivo = false;
    for (let i = li + 1; i < msgs.length; i++) { if (msgs[i].dir === "outbound" && ehSubstantiva(msgs[i].texto)) { if (RE_EVASIVA.test(msgs[i].texto)) evasivo = true; else { respondeu = true; break; } } }
    const pendente = !respondeu;
    let cod = porFone[last8(c.fone)] || porEmail[norm(c.email)] || porNome[chaveNome(nomeCli)] || null;
    if (cod === 1 || cod === 68200 || NOISE_NOME.test(norm(nomeCli))) { ruido++; continue; }
    const assistNome = Array.isArray(c.assistentes) && c.assistentes.length ? c.assistentes.find((x: string) => !NOISE_NOME.test(norm(x))) || null : null;
    const aFone = assistNome ? (foneAssist[norm(assistNome)] || null) : null;
    const ctx = msgs.slice(Math.max(0, li - 3)).map((m: any) => (m.dir === "inbound" ? "Cliente: " : "Assistente: ") + m.texto).join("\n").slice(0, 1500);
    const base = { dia, conversation_id: c.id, contact_id: c.contactId || null, codparc: cod, quem: msgs[li].quem || "cliente", cliente_nome: nomeCli || null, assistente: assistNome, assistente_fone: aFone, pergunta: perg.slice(0, 800), diagnostico: evasivo ? "assistente respondeu de forma evasiva (vou verificar) e nao resolveu" : "cliente perguntou e ficou SEM resposta", raw: { ctx, cnt: c.cnt, tags: c.tags } };
    const { data: ex } = await sb.from("copiloto_pendencias").select("id, status").eq("dia", dia).eq("conversation_id", c.id).maybeSingle();
    if (pendente) {
      if (!ex) { await sb.from("copiloto_pendencias").insert({ ...base, status: "detectada" }); detectadas++; }
      else if (["detectada", "resolvida", "escalar", "precisa_info"].includes(ex.status)) { await sb.from("copiloto_pendencias").update({ pergunta: base.pergunta, diagnostico: base.diagnostico, codparc: base.codparc, cliente_nome: base.cliente_nome, assistente: base.assistente, assistente_fone: base.assistente_fone, raw: base.raw, atualizado_em: new Date().toISOString() }).eq("id", ex.id); }
    } else if (ex && ["detectada", "resolvida", "escalar", "precisa_info"].includes(ex.status)) { await sb.from("copiloto_pendencias").update({ status: "fechada_humano", atualizado_em: new Date().toISOString() }).eq("id", ex.id); fechadas++; }
  }
  return { ok: true, dia, conversas: convs.length, varridas, novas_detectadas: detectadas, fechadas_pelo_humano: fechadas, ruido_ignorado: ruido };
}

async function resolver(sb: any, dia: string, limite: number) {
  const secret = Deno.env.get("COPILOTO_SECRET") || "";
  const { data: pend } = await sb.from("copiloto_pendencias").select("*").eq("dia", dia).eq("status", "detectada").order("id", { ascending: true }).limit(limite);
  let feitas = 0, resolv = 0, escal = 0, info = 0, erros = 0;
  for (const p of (pend || [])) {
    const quemLabel = p.quem === "rep" ? "representante" : "cliente";
    const idInfo = "Este atendimento e com um " + quemLabel + (p.cliente_nome ? " chamado/empresa '" + p.cliente_nome + "'" : "") + (p.codparc ? " [codparc " + p.codparc + " - use nas ferramentas]" : " (codparc AINDA NAO identificado - tente localizar pela razao social/nome '" + (p.cliente_nome || "") + "' ou CNPJ com buscar_cliente/consultar_sankhya antes de pedir dado ao cliente)") + ".\n";
    const ctx = idInfo + (p?.raw?.ctx ? ("Trecho da conversa:\n" + p.raw.ctx + "\n\n") : "") + "Pergunta/pendencia a resolver: " + p.pergunta;
    try {
      const r = await fetch(SUPA_URL + "/functions/v1/copiloto-conversa", { method: "POST", headers: { "Authorization": "Bearer " + SRK, "Content-Type": "application/json", ...(secret ? { "x-copiloto-secret": secret } : {}) }, body: JSON.stringify({ modo_resolver: true, codparc: p.codparc || undefined, texto: ctx }) });
      const d = await r.json().catch(() => ({}));
      if (!d?.ok) { erros++; continue; }
      const bruto = String(d.bruto || d.resposta || "").trim();
      const marcadorNao = RE_NAORESOLV.test(bruto) || d.resolvivel === false;
      const limpo = bruto.replace(/^[\s*_>#\-•]*(RESPOSTA|N[AÃ]O[_ ]?RESOLVIVEL)\s*[:\-]?\s*\**\s*/i, "").trim();
      let status: string, resolvivel: boolean, resposta_pronta: string | null = null, encaminhar: string | null = null;
      if (marcadorNao) { status = "escalar"; resolvivel = false; encaminhar = limpo || d.encaminhar || "depende de humano"; escal++; }
      else if (!limpo || RE_PEDEINFO.test(limpo)) { status = "precisa_info"; resolvivel = false; encaminhar = limpo || "a Nina precisa de um identificador (CNPJ/codigo/numero do pedido) para localizar e resolver"; info++; }
      else { status = "resolvida"; resolvivel = true; resposta_pronta = limpo; resolv++; }
      await sb.from("copiloto_pendencias").update({ tema: d.tema || null, resolvivel, resposta_pronta, encaminhar, status, atualizado_em: new Date().toISOString() }).eq("id", p.id);
      feitas++;
    } catch (_e) { erros++; }
  }
  return { ok: true, dia, processadas: feitas, resolvidas: resolv, escaladas: escal, precisa_info: info, erros, restam: Math.max(0, (pend || []).length - feitas) };
}

async function enviar(texto: string, fone: string, instancia: string) {
  const r = await fetch(SUPA_URL + "/functions/v1/campanhas-enviar", { method: "POST", headers: { "Authorization": "Bearer " + SRK, "Content-Type": "application/json" }, body: JSON.stringify({ canal: "whatsapp", texto, fone, instancia }) });
  const d = await r.json().catch(() => ({})); return !!d?.ok;
}

async function avisar(sb: any, dia: string, limite: number) {
  const { data: cfgRows } = await sb.from("copiloto_config").select("*"); const cfg: Record<string, string> = {}; (cfgRows || []).forEach((r: any) => cfg[r.chave] = r.valor);
  const liga = String(cfg.vigia_avisar || "nao").toLowerCase() === "sim";
  const testeFone = String(cfg.vigia_teste_fone || "").trim();
  const instEnvio = String(cfg.auto_atendimento_inst || cfg.nome_assistente || "Nina").split(",")[0].trim() || "Nina";
  if (!liga && !testeFone) { const { count } = await sb.from("copiloto_pendencias").select("*", { count: "exact", head: true }).eq("dia", dia).eq("status", "resolvida").is("avisado_em", null); return { ok: true, dia, skip: "sem destino (vigia_avisar=nao e sem vigia_teste_fone)", candidatos: count }; }
  const { data: pend } = await sb.from("copiloto_pendencias").select("*").eq("dia", dia).eq("status", "resolvida").eq("resolvivel", true).is("avisado_em", null).order("id", { ascending: true }).limit(limite);
  let enviados = 0, falhas = 0;
  for (const p of (pend || [])) {
    const destino = liga ? p.assistente_fone : testeFone; if (!destino) continue;
    const link = p.contact_id ? ("https://app.gohighlevel.com/v2/location/" + LOC + "/contacts/detail/" + p.contact_id) : "";
    const cab = liga ? ("🔔 Nina (interna) — ") : ("🧪 [TESTE — chegaria pra assistente " + (p.assistente || "?") + "] Nina (interna) — ");
    const msg = cab + (p.cliente_nome || "cliente") + " esperando resposta.\n\nPerguntou: \"" + String(p.pergunta).slice(0, 200) + "\"\n\nResposta pronta:\n" + String(p.resposta_pronta).slice(0, 900) + (link ? ("\n\nCard: " + link) : "") + "\n\n(Confere e manda. — Nina)";
    const ok = await enviar(msg, destino, instEnvio);
    if (ok) { await sb.from("copiloto_pendencias").update({ status: liga ? "avisada" : "avisada_teste", avisado_em: new Date().toISOString() }).eq("id", p.id); enviados++; } else falhas++;
  }
  return { ok: true, dia, modo: liga ? "assistentes" : "teste_ricardo", avisados: enviados, falhas, instancia: instEnvio };
}

async function digest(sb: any, dia: string) {
  const { data: cfgRows } = await sb.from("copiloto_config").select("*"); const cfg: Record<string, string> = {}; (cfgRows || []).forEach((r: any) => cfg[r.chave] = r.valor);
  const dest = String(cfg.vigia_teste_fone || cfg.alerta_fone || "").trim(); const instEnvio = String(cfg.auto_atendimento_inst || "Nina").split(",")[0].trim() || "Nina";
  if (!dest) return { ok: false, erro: "sem vigia_teste_fone/alerta_fone" };
  const { data } = await sb.from("copiloto_pendencias").select("status, cliente_nome, resposta_pronta, encaminhar, assistente").eq("dia", dia).in("status", ["resolvida", "escalar", "precisa_info", "avisada", "avisada_teste"]);
  const rows = data || []; if (!rows.length) return { ok: true, dia, skip: "sem pendencias no dia" };
  const isRes = (x: any) => x.status === "resolvida" || x.status === "avisada" || x.status === "avisada_teste";
  const res = rows.filter(isRes); const esc = rows.filter((x: any) => x.status === "escalar"); const inf = rows.filter((x: any) => x.status === "precisa_info");
  const line = (x: any) => "• " + (x.cliente_nome || "?") + (x.assistente ? (" (" + x.assistente + ")") : "") + ": " + String(x.resposta_pronta || x.encaminhar || "").replace(/\s+/g, " ").slice(0, 150);
  let txt = "📋 Vigia Nina — " + dia + "\n" + rows.length + " travados | ✅ " + res.length + " resolvidos · ⬆️ " + esc.length + " escalados · ❓ " + inf.length + " precisa info";
  if (res.length) txt += "\n\n✅ RESOLVIDOS (resposta pronta pra assistente)\n" + res.slice(0, 8).map(line).join("\n");
  if (esc.length) txt += "\n\n⬆️ ESCALADOS (com diagnostico feito)\n" + esc.slice(0, 8).map(line).join("\n");
  if (inf.length) txt += "\n\n❓ PRECISA DE 1 INFO\n" + inf.slice(0, 6).map(line).join("\n");
  txt = txt.slice(0, 3500) + "\n\n(— Nina, vigia comercial)";
  const ok = await enviar(txt, dest, instEnvio);
  return { ok: true, dia, enviado: ok, contagem: { resolvidos: res.length, escalados: esc.length, precisa_info: inf.length } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = createClient(SUPA_URL, SRK);
    const sp = new URL(req.url).searchParams; const b = await req.json().catch(() => ({}));
    const { data: cfgAtivo } = await sb.from("copiloto_config").select("valor").eq("chave", "vigia_ativo").maybeSingle();
    if (String(cfgAtivo?.valor || "sim").toLowerCase() === "nao") return j({ ok: true, desligado: true });
    const acao = String(sp.get("acao") || b.acao || "rodar").toLowerCase();
    const dia = String(sp.get("dia") || b.dia || brtHoje());
    const limite = Math.min(parseInt(sp.get("limite") || b.limite || "6") || 6, 20);
    if (acao === "detectar") return j(await detectar(sb, dia));
    if (acao === "resolver") return j(await resolver(sb, dia, limite));
    if (acao === "avisar") return j(await avisar(sb, dia, Math.min(limite, 12)));
    if (acao === "digest") return j(await digest(sb, dia));
    if (acao === "lista") { const { data } = await sb.from("copiloto_pendencias").select("id, conversation_id, cliente_nome, codparc, assistente, tema, status, resolvivel, pergunta, resposta_pronta, encaminhar").eq("dia", dia).order("status", { ascending: true }).order("id", { ascending: true }); const cont: Record<string, number> = {}; (data || []).forEach((r: any) => cont[r.status] = (cont[r.status] || 0) + 1); return j({ ok: true, dia, total: (data || []).length, por_status: cont, pendencias: data }); }
    if (acao === "rodar") { const det = await detectar(sb, dia); const res = await resolver(sb, dia, limite); return j({ ok: true, dia, detectar: det, resolver: res }); }
    return j({ ok: false, erro: "acao desconhecida (detectar|resolver|avisar|digest|lista|rodar)" });
  } catch (e) { return j({ ok: false, erro: String(e) }, 500); }
});
