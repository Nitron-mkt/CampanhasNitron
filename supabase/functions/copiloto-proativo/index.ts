// copiloto-proativo v2 — Nina PROATIVA guiada pelas CAMPANHAS do Gestor. Carrega as campanhas ATIVAS (as regras oficiais do negocio) e o Sonnet as APLICA na carteira de cada rep p/ montar o 'plano de hoje'. Se voce edita/cria campanha no Gestor, a Nina usa automaticamente. ?dry=1 preview. Gate: copiloto_config.proativo_ativo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const MODELO_HARD = "claude-sonnet-5";
const prim = (s: any) => (String(s || "").trim().split(/\s+/)[0] || String(s || ""));
const money = (v: any) => "R$ " + Math.round(Number(v) || 0).toLocaleString("pt-BR");
async function enviar(texto: string, fone: string, instancia: string) { try { const r = await fetch(SUPA_URL + "/functions/v1/campanhas-enviar", { method: "POST", headers: { "Authorization": "Bearer " + SRK, "Content-Type": "application/json" }, body: JSON.stringify({ canal: "whatsapp", texto, fone, instancia }) }); const d = await r.json().catch(() => ({})); return !!d?.ok; } catch (_e) { return false; } }
async function sonnet(system: string, user: string): Promise<string> { const key = Deno.env.get("ANTHROPIC_API_KEY"); if (!key) return ""; try { const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: MODELO_HARD, max_tokens: 8000, system, messages: [{ role: "user", content: user }] }) }); if (!r.ok) return "SONNET_ERR " + r.status + " " + (await r.text()).slice(0, 220); const d = await r.json().catch(() => ({})); return (d?.content || []).filter((x: any) => x.type === "text").map((x: any) => x.text).join("").trim(); } catch (e) { return "SONNET_CATCH " + String(e).slice(0, 180); } }
function pubArr(p: any): string[] { if (Array.isArray(p)) return p.map((x) => String(x)); return String(p || "").replace(/[{}"]/g, "").split(",").map((x) => x.trim()).filter(Boolean); }
async function campanhasRep(sb: any): Promise<string> {
  const { data } = await sb.from("campanhas").select("codigo, nome, objetivo, gatilho, prioridade, publico, filtros_padrao").eq("ativa", true).eq("status_dados", "pronto").order("prioridade", { ascending: false });
  const camps = (data || []).filter((c: any) => pubArr(c.publico).some((x) => x.includes("rep") || x.includes("cliente")));
  return camps.map((c: any) => { const g = c.gatilho ? (typeof c.gatilho === "string" ? c.gatilho : JSON.stringify(c.gatilho)) : ""; const f = c.filtros_padrao ? (typeof c.filtros_padrao === "string" ? c.filtros_padrao : JSON.stringify(c.filtros_padrao)) : ""; return `- [prio ${c.prioridade}] ${c.codigo}: ${c.objetivo}${g ? " | regra: " + g : ""}${f && f !== "{}" ? " | filtros: " + f : ""}`; }).join("\n");
}
async function rodarRep(sb: any, rep: any, dry: boolean, campsTxt: string, destino: string | null = null) {
  const cv = Number(rep.codvend);
  const { data } = await sb.from("roteiro_cliente").select("codparc, nome, dias, fat12m, clube_saldo, inad, cidade, uf").eq("codvend", cv).limit(5000);
  const rows = (data || []).filter((r: any) => Number(r.codparc) !== 1 && Number(r.codparc) !== 68200).sort((a: any, b: any) => Number(b.fat12m) - Number(a.fat12m));
  if (!rows.length) return { rep: rep.nome, skip: "sem carteira" };
  const comClube = rows.filter((r: any) => Number(r.clube_saldo) > 0);
  const dormAlto = rows.filter((r: any) => Number(r.dias) >= 60);
  const sel = [...new Set([...comClube, ...rows.slice(0, 80), ...dormAlto.slice(0, 30)])].slice(0, 130);
  const carteira = sel.map((r: any) => `${r.nome} | ${r.dias}d sem compra | gira ${money(r.fat12m)}/ano${Number(r.clube_saldo) > 0 ? " | CLUBE " + money(r.clube_saldo) : ""}${r.inad ? " | INADIMPLENTE" : ""}${r.cidade ? " | " + r.cidade + "/" + r.uf : ""}`).join("\n");
  let assistNome = "Nina"; try { const { data: sr } = await sb.from("snap_rep").select("assistente").eq("codvend", cv).maybeSingle(); if (sr?.assistente) assistNome = prim(sr.assistente); } catch (_e) { /* */ }
  const sys = `Voce e ${assistNome}, a assistente comercial do representante ${prim(rep.nome)} na Nitronplast (utilidades pra casa). Todo dia de manha voce manda pra ele o PLANO DE HOJE, APLICANDO as CAMPANHAS OFICIAIS da Nitron (as regras do negocio) na carteira dele.\n\nCAMPANHAS ATIVAS (prioridade / codigo / objetivo / regra) — use ESTAS regras, nesta ordem de prioridade:\n${campsTxt}\n\nComo montar o plano: para cada campanha relevante, escolha da carteira os clientes que se encaixam na regra dela (use dias sem compra p/ giro/reativacao, CLUBE saldo p/ clube, INADIMPLENTE p/ cobranca, faturamento p/ priorizar valor). Junte as MELHORES jogadas do dia (5-7), das campanhas de maior prioridade e clientes de maior valor. Regras de escrita: bom-dia curto + foco do dia; fale em NOME de cliente + valor (NUNCA codigo); no maximo ~12 linhas; diga o QUE FAZER em cada; sem tabela/markdown pesado (e WhatsApp). CLUBE com saldo = venda ja paga, so agendar (topo). INADIMPLENTE = cobranca resolve antes de vender. Termine com um empurraozinho e ofereca a planilha completa (\"me pede a planilha\").`;
  const plano = await sonnet(sys, "CARTEIRA DO REP (" + rows.length + " clientes; amostra por valor + todos com Clube + dormidos):\n" + carteira);
  if (!plano) return { rep: rep.nome, erro: "sonnet vazio" };
  let enviado = false; const inst = (rep.instancia || "Nina");
  if (!dry) enviado = await enviar(plano, rep.fone, inst);
  return { rep: rep.nome, codvend: cv, clientes: rows.length, com_clube: comClube.length, dormidos_60d: dormAlto.length, enviado, plano };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = createClient(SUPA_URL, SRK);
    const sp = new URL(req.url).searchParams; const b = await req.json().catch(() => ({}));
    const dry = sp.get("dry") === "1" || b.dry === true;
    const foneOverride = String(b.fone || "").replace(/\D/g, ""); const { data: at } = await sb.from("copiloto_config").select("valor").eq("chave", "proativo_ativo").maybeSingle();
    if (!dry && !foneOverride && String(at?.valor || "nao").toLowerCase() === "nao") return j({ ok: true, desligado: true, dica: "ligue copiloto_config.proativo_ativo=sim, ou use ?dry=1" });
    const campsTxt = await campanhasRep(sb);
    let reps: any[] = [];
    if (b.codvend) { const { data: p } = await sb.from("copiloto_piloto").select("*").eq("codvend", b.codvend).eq("ativo", true).limit(1); reps = p || []; }
    else { const { data: p } = await sb.from("copiloto_piloto").select("*").eq("ativo", true); const seen = new Set(); reps = (p || []).filter((r: any) => { const k = Number(r.codvend); if (seen.has(k)) return false; seen.add(k); return true; }); }
    const out: any[] = [];
    for (const rep of reps) { out.push(await rodarRep(sb, rep, dry, campsTxt, foneOverride || null)); }
    return j({ ok: true, dry, campanhas_no_prompt: campsTxt.split("\n").length, reps: out.length, resultados: out });
  } catch (e) { return j({ ok: false, erro: String(e) }, 500); }
});
