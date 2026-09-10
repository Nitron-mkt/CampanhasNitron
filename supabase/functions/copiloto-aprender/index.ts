// copiloto-aprender v4 — auto-aprendizado AMPLO. Falhas -> regras (auto em copiloto_licoes). Amostra real de conversas do GHL -> Sonnet (nivel Claude) entende mercado/objecoes/o-que-funciona -> PROPOE conhecimento + skills novas (gate humano em copiloto_aprend_proposta). Raio-X pro Ricardo. ?acao=aprovar&ids=1,3 promove as propostas.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GHL = (Deno.env.get("GHL_TOKEN") || "").trim();
const LOC = "rZ8y7lzqV7fzxsartaX2";
const MODELO_HARD = "claude-sonnet-5";
async function enviar(texto: string, fone: string, instancia: string) { try { const r = await fetch(SUPA_URL + "/functions/v1/campanhas-enviar", { method: "POST", headers: { "Authorization": "Bearer " + SRK, "Content-Type": "application/json" }, body: JSON.stringify({ canal: "whatsapp", texto, fone, instancia }) }); const d = await r.json().catch(() => ({})); return !!d?.ok; } catch (_e) { return false; } }
async function sonnet(system: string, user: string): Promise<string> { const key = Deno.env.get("ANTHROPIC_API_KEY"); if (!key) return ""; try { const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: MODELO_HARD, max_tokens: 8000, system, messages: [{ role: "user", content: user }] }) }); if (!r.ok) return "ERRO " + r.status + " " + (await r.text()).slice(0, 200); const d = await r.json().catch(() => ({})); return (d?.content || []).filter((x: any) => x.type === "text").map((x: any) => x.text).join("").trim(); } catch (e) { return "ERRO " + String(e); } }
function parseJson(s: string): any { try { const m = s.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; } catch (_e) { return null; } }
async function amostraConversas(): Promise<string> {
  if (!GHL) return "";
  try {
    const s = await fetch(`https://services.leadconnectorhq.com/conversations/search?locationId=${LOC}&sortBy=last_message_date&sort=desc&limit=30`, { headers: { Authorization: "Bearer " + GHL, Version: "2021-04-15", Accept: "application/json" } });
    const sd = await s.json().catch(() => ({})); const convs = sd?.conversations || [];
    const blocos: string[] = [];
    for (const cv of (Array.isArray(convs) ? convs : []).slice(0, 20)) {
      try {
        const m = await fetch(`https://services.leadconnectorhq.com/conversations/${cv.id}/messages?limit=14`, { headers: { Authorization: "Bearer " + GHL, Version: "2021-04-15", Accept: "application/json" } });
        const md = await m.json().catch(() => ({})); const arr = md?.messages?.messages || md?.messages || [];
        const linhas: string[] = [];
        for (const x of (Array.isArray(arr) ? arr : [])) { const body = String(x?.body || "").replace(/\n+/g, " ").replace(/Instance Source:.*/i, "").replace(/#contact_instance:\S+/i, "").trim(); if (!body || body.toLowerCase() === "ptt") continue; linhas.push((x.direction === "inbound" ? "CONTATO: " : "NITRON: ") + body.slice(0, 220)); }
        if (linhas.length >= 2) blocos.push(`[${cv.contactName || cv.fullName || "contato"}${cv.companyName ? " / " + cv.companyName : ""}]\n` + linhas.slice(-12).join("\n"));
      } catch (_e) { /* */ }
    }
    return blocos.join("\n\n---\n\n").slice(0, 28000);
  } catch (_e) { return ""; }
}
async function rodar(sb: any, dias: number) {
  const desde = new Date(Date.now() - dias * 86400000).toISOString();
  // ===== 1) FALHAS -> regras (auto) =====
  const { data: al } = await sb.from("copiloto_alertas").select("tipo, detalhe, texto_contato, reply, criado").in("tipo", ["lookup_falhou", "esquiva", "acesso_restrito", "cliente_desconfiou"]).gte("criado", desde).order("criado", { ascending: false }).limit(150);
  const { data: pd } = await sb.from("copiloto_pendencias").select("tema, pergunta, encaminhar, status").in("status", ["escalar", "precisa_info"]).gte("criado", desde).order("id", { ascending: false }).limit(80);
  const falhas = [
    ...(al || []).map((a: any) => `[${a.tipo}] contato: "${String(a.texto_contato || "").slice(0, 160)}" | ${String(a.detalhe || "").slice(0, 140)}${a.reply ? ` | IA: "${String(a.reply).slice(0, 120)}"` : ""}`),
    ...(pd || []).map((p: any) => `[${p.status}] "${String(p.pergunta || "").slice(0, 150)}" | ${String(p.encaminhar || "").slice(0, 160)}`),
  ];
  const { data: licAtivas } = await sb.from("copiloto_licoes").select("licao").eq("ativo", true);
  const jaTem = new Set((licAtivas || []).map((l: any) => String(l.licao).toLowerCase().slice(0, 55)));
  let regras: string[] = [], lacunas: string[] = [], humano: string[] = [], aplicadas = 0;
  if (falhas.length) {
    const sysF = `Voce e o supervisor de aprendizado da Nina (IA comercial da Nitron no WhatsApp, consulta o Sankhya ao vivo). Dadas as FALHAS reais dela, ache padroes e devolva SO um JSON {\"regras\":[],\"conhecimento\":[],\"humano\":[]}. regras = comportamento acionavel que ela cumpre sozinha (com ferramentas Sankhya/conhecimento/abrir_tarefa), imperativas, max 8, sem repetir existentes. conhecimento = lacunas de dado que precisam de humano, max 5. humano = casos de decisao humana, max 5. Portugues, concreto, so o que vem das falhas.`;
    const an = parseJson(await sonnet(sysF, "FALHAS (" + falhas.length + "):\n" + falhas.slice(0, 110).join("\n"))) || {};
    regras = (an.regras || []).filter((r: string) => r && !jaTem.has(String(r).toLowerCase().slice(0, 55))).slice(0, 8);
    lacunas = (an.conhecimento || []).slice(0, 5); humano = (an.humano || []).slice(0, 5);
    for (const r of regras) { const { error } = await sb.from("copiloto_licoes").insert({ licao: String(r).slice(0, 500), ativo: true, criado_por: "auto-aprendizado" }); if (!error) aplicadas++; }
  }
  // ===== 2) CONVERSAS REAIS -> mercado/objecoes/skills (propostas, gate humano) =====
  const conversas = await amostraConversas();
  let propConh: any[] = [], propSkill: any[] = [];
  if (conversas && conversas.length > 200) {
    const sysM = `Voce e o cerebro de aprendizado da Nina, IA comercial da Nitronplast (utilidades domesticas, principalmente plastico; vende via representantes e para lojistas). Vou te dar CONVERSAS REAIS recentes do WhatsApp da Nitron. Estude como quem quer que a Nina venda mais e atenda melhor. Identifique o que RECORRE: objecoes comuns, perguntas frequentes, o que faz o cliente comprar, duvidas de produto/preco/prazo, padroes por tipo de cliente, e cenarios onde faltaria um PLAYBOOK proprio. Devolva SO um JSON: {\"conhecimento\":[{\"titulo\":\"...\",\"texto\":\"...\"}],\"skills\":[{\"nome\":\"...\",\"quando_usar\":\"...\",\"playbook\":\"...\"}]}. conhecimento = fatos/insights de mercado, produto ou objecao que ajudam a vender (max 6, texto de 2-5 frases cada, so o que aparece nas conversas, NUNCA invente preco). skills = um playbook NOVO e reutilizavel para um cenario recorrente que a Nina ainda nao domina (max 4): quando_usar = gatilho; playbook = passo a passo do que a Nina deve fazer/dizer. Portugues, concreto, baseado nas conversas.`;
    const mkt = parseJson(await sonnet(sysM, "CONVERSAS RECENTES:\n" + conversas)) || {};
    propConh = (mkt.conhecimento || []).filter((c: any) => c && c.titulo && c.texto).slice(0, 6);
    propSkill = (mkt.skills || []).filter((s: any) => s && s.nome && s.playbook).slice(0, 4);
    for (const c of propConh) { await sb.from("copiloto_aprend_proposta").insert({ tipo: "conhecimento", titulo: String(c.titulo).slice(0, 160), conteudo: String(c.texto).slice(0, 3000), origem: "conversas", status: "pendente" }); }
    for (const s of propSkill) { await sb.from("copiloto_aprend_proposta").insert({ tipo: "skill", titulo: String(s.nome).slice(0, 160), conteudo: ("QUANDO USAR: " + String(s.quando_usar || "") + "\n\nPLAYBOOK:\n" + String(s.playbook || "")).slice(0, 4000), origem: "conversas", status: "pendente" }); }
  }
  await sb.from("copiloto_aprendizado").insert({ periodo: `ultimos ${dias}d`, n_falhas: falhas.length, regras_aprendidas: aplicadas, resumo: ("regras:" + aplicadas + " conh:" + propConh.length + " skills:" + propSkill.length).slice(0, 3000), analise: { regras, lacunas, humano, propConh: propConh.map((c: any) => c.titulo), propSkill: propSkill.map((s: any) => s.nome) } });
  // ===== 3) raio-X pro Ricardo =====
  const { data: pend } = await sb.from("copiloto_aprend_proposta").select("id, tipo, titulo").eq("status", "pendente").order("id", { ascending: false }).limit(20);
  const { data: cfgRows } = await sb.from("copiloto_config").select("*"); const cfg: Record<string, string> = {}; (cfgRows || []).forEach((r: any) => cfg[r.chave] = r.valor);
  const dest = String(cfg.vigia_teste_fone || cfg.alerta_fone || "").trim(); const inst = String(cfg.auto_atendimento_inst || "Nina").split(",")[0].trim() || "Nina";
  let enviado = false;
  if (dest) {
    let txt = "🧠 Raio-X de aprendizado da Nina (ultimos " + dias + "d)\n" + falhas.length + " tropecos + amostra de conversas do GHL analisadas.";
    if (regras.length) txt += "\n\n✅ APRENDI " + aplicadas + " regra(s) de comportamento (JA valendo):\n- " + regras.map((r: string) => String(r).slice(0, 150)).join("\n- ");
    const conhP = (pend || []).filter((p: any) => p.tipo === "conhecimento"); const skillP = (pend || []).filter((p: any) => p.tipo === "skill");
    if (conhP.length) txt += "\n\n💡 CONHECIMENTO novo que aprendi das conversas (precisa do seu OK):\n" + conhP.map((p: any) => "#" + p.id + " " + String(p.titulo).slice(0, 120)).join("\n");
    if (skillP.length) txt += "\n\n🚀 SKILLS novas que proponho (precisa do seu OK):\n" + skillP.map((p: any) => "#" + p.id + " " + String(p.titulo).slice(0, 120)).join("\n");
    if (lacunas.length) txt += "\n\n❓ LACUNAS que preciso que voce confirme:\n- " + lacunas.map((c: string) => String(c).slice(0, 140)).join("\n- ");
    if (conhP.length || skillP.length) txt += "\n\nPra aprovar, responda: aprovar " + [...conhP, ...skillP].map((p: any) => p.id).slice(0, 6).join(",") + "  (ou 'aprovar tudo', ou 'rejeitar N').";
    enviado = await enviar(txt.slice(0, 3900), dest, inst);
  }
  return { ok: true, n_falhas: falhas.length, regras_aprendidas: aplicadas, regras, propostas_conhecimento: propConh.length, propostas_skills: propSkill.length, pendentes: (pend || []).length, digest_enviado: enviado };
}
async function aprovar(sb: any, ids: number[], rejeita = false) {
  let n = 0; const feitos: string[] = [];
  for (const id of ids) {
    const { data: p } = await sb.from("copiloto_aprend_proposta").select("*").eq("id", id).eq("status", "pendente").maybeSingle();
    if (!p) continue;
    if (rejeita) { await sb.from("copiloto_aprend_proposta").update({ status: "rejeitado" }).eq("id", id); n++; continue; }
    if (p.tipo === "conhecimento") { await sb.from("conhecimento").insert({ sistema: "mercado", topico: "aprendido-conversas", titulo: p.titulo, conteudo: p.conteudo }); }
    else if (p.tipo === "skill") { await sb.from("conhecimento").insert({ sistema: "skill", topico: "playbook-aprendido", titulo: p.titulo, conteudo: p.conteudo }); }
    else if (p.tipo === "regra") { await sb.from("copiloto_licoes").insert({ licao: p.conteudo.slice(0, 500), ativo: true, criado_por: "aprovado" }); }
    await sb.from("copiloto_aprend_proposta").update({ status: "aprovado" }).eq("id", id); n++; feitos.push(p.titulo);
  }
  return { ok: true, processados: n, feitos, rejeitado: rejeita };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = createClient(SUPA_URL, SRK);
    const sp = new URL(req.url).searchParams; const b = await req.json().catch(() => ({}));
    const acao = sp.get("acao") || b.acao;
    if (acao === "aprovar" || acao === "rejeitar") {
      const raw = String(sp.get("ids") || b.ids || "").trim();
      let ids: number[] = [];
      if (raw.toLowerCase() === "tudo") { const { data } = await sb.from("copiloto_aprend_proposta").select("id").eq("status", "pendente"); ids = (data || []).map((x: any) => Number(x.id)); }
      else ids = raw.split(/[,\s]+/).map((x) => parseInt(x)).filter(Boolean);
      return j(await aprovar(sb, ids, acao === "rejeitar"));
    }
    const { data: at } = await sb.from("copiloto_config").select("valor").eq("chave", "aprendizado_ativo").maybeSingle();
    if (String(at?.valor || "sim").toLowerCase() === "nao") return j({ ok: true, desligado: true });
    const dias = Math.min(parseInt(sp.get("dias") || b.dias || "7") || 7, 60);
    return j(await rodar(sb, dias));
  } catch (e) { return j({ ok: false, erro: String(e) }, 500); }
});
