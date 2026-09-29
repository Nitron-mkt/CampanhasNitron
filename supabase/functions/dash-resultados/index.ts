// dash-resultados — agrega o GHL das três contas (Nitron, Teak, Roga) para a dash de gestão.
// Devolve só totais: oportunidades por mês × origem × pipeline × status, e estatística das
// campanhas de e-mail. Nenhum nome, telefone ou e-mail de contato sai daqui.
// Somente leitura no GHL.
const API = "https://services.leadconnectorhq.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/146.0 Safari/537.36";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };

const CONTAS: Record<string, { loc: string; env: string }> = {
  nitron: { loc: "rZ8y7lzqV7fzxsartaX2", env: "GHL_TOKEN" },
  teak: { loc: "DRhJc78pTfF9dlaH5NK9", env: "GHL_TOKEN_TEAK" },
  roga: { loc: "uqZMP3rxrdHqMHPQYRAp", env: "GHL_TOKEN_ROGA" },
};

async function ghl(env: string, path: string, version = "2021-07-28") {
  const r = await fetch(API + path, { headers: { "Authorization": "Bearer " + (Deno.env.get(env) || ""), "Version": version, "Accept": "application/json", "User-Agent": UA } });
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${path.split("?")[0]}: ${t.slice(0, 200)}`);
  return JSON.parse(t);
}

// Origem do lead: o campo source da oportunidade; sem ele, a primeira atribuição (utm).
function origem(o: any): string {
  const s = (o.source || "").trim();
  if (s) return s;
  const a = (o.attributions || []).find((x: any) => x.isFirst) || (o.attributions || [])[0];
  if (a) return (a.utmSource || a.utmSessionSource || a.medium || "(sem origem)").toString();
  return "(sem origem)";
}
function canal(o: any): string {
  const a = (o.attributions || []).find((x: any) => x.isFirst) || (o.attributions || [])[0];
  return a ? (a.utmSessionSource || a.medium || "") : "";
}

async function oportunidades(c: { loc: string; env: string }, desde: string) {
  const pipes = await ghl(c.env, `/opportunities/pipelines?locationId=${c.loc}`);
  const pipeNome: Record<string, string> = {}, stageNome: Record<string, string> = {};
  for (const p of pipes.pipelines || []) {
    pipeNome[p.id] = p.name;
    for (const s of p.stages || []) stageNome[s.id] = s.name;
  }
  const agg: Record<string, any> = {};
  let after = "", afterId = "", paginas = 0, lidas = 0, fim = false;
  while (!fim && paginas < 120) {
    const q = `/opportunities/search?location_id=${c.loc}&limit=100` + (after ? `&startAfter=${after}&startAfterId=${afterId}` : "");
    const d = await ghl(c.env, q);
    const ops = d.opportunities || [];
    paginas++;
    for (const o of ops) {
      if ((o.createdAt || "") < desde) { fim = true; continue; }
      lidas++;
      const k = [o.createdAt.slice(0, 7), origem(o), canal(o), pipeNome[o.pipelineId] || o.pipelineId, stageNome[o.pipelineStageId] || "", o.status].join("|");
      const a = agg[k] ||= { n: 0, valor: 0 };
      a.n++; a.valor += Number(o.monetaryValue || 0);
    }
    if (!ops.length || !d.meta?.startAfterId) break;
    after = String(d.meta.startAfter); afterId = d.meta.startAfterId;
  }
  const linhas = Object.entries(agg).map(([k, v]) => {
    const [mes, origem, canal, pipeline, etapa, status] = k.split("|");
    return { mes, origem, canal, pipeline, etapa, status, ...v };
  });
  return { lidas, paginas, linhas };
}

async function emails(c: { loc: string; env: string }, desde: string) {
  const out: any[] = [];
  for (let off = 0; off < 1000; off += 100) {
    const d = await ghl(c.env, `/emails/locations/${c.loc}/campaigns/emails?limit=100&offset=${off}`);
    const cs = d.campaigns || [];
    for (const k of cs) {
      if (k.deleted || k.status === "draft" || (k.createdAt || "") < desde) continue;
      let stats: any = null;
      try { stats = (await ghl(c.env, `/emails/locations/${c.loc}/campaigns/stats/email-campaigns/${k.id}`)).stats; } catch (e) { stats = { erro: String(e).slice(0, 120) }; }
      out.push({ id: k.id, nome: k.name, status: k.status, criado: k.createdAt, stats });
    }
    if (cs.length < 100) break;
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const u = new URL(req.url);
  const desde = u.searchParams.get("desde") || "2026-01-01";
  const so = u.searchParams.get("conta");
  const res: Record<string, any> = { gerado_em: new Date().toISOString(), desde };
  for (const [nome, c] of Object.entries(CONTAS)) {
    if (so && so !== nome) continue;
    const r: any = {};
    try { r.oportunidades = await oportunidades(c, desde); } catch (e) { r.erro_oportunidades = String(e); }
    try { r.emails = await emails(c, desde); } catch (e) { r.erro_emails = String(e); }
    res[nome] = r;
  }
  return new Response(JSON.stringify(res), { headers: { ...cors, "Content-Type": "application/json" } });
});
