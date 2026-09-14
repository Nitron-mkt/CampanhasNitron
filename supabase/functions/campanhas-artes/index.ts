// campanhas-artes (v10) — lista artes/templates de e-mail do GHL, COM CACHE (ghl_arte). Se o GHL estiver no limite diario (429) ou falhar, serve a ultima lista boa. ?diag=1 mostra o status GHL.
// v10: TIRADA a chave de servico que estava CHUMBADA no fonte como fallback do SRV_JWT. Era um JWT
//      de service_role literal, valido ate 2101: quem lesse o codigo da funcao tinha acesso total ao
//      banco, e rotacionar exigiria redeploy. E o mesmo caso ja corrigido em fila-enfileirar (v15),
//      campanhas-cron (v16), campanhas-saldo, campanhas-keyaccounts e cross-sell-abc — o CLAUDE.md
//      manda tirar sempre que aparecer outra. Agora so o secret, como no resto: sem chave a funcao
//      falha alto, em vez de seguir com credencial embutida no repositorio.
// v9: chave de servico via SRV_JWT (a SUPABASE_SERVICE_ROLE_KEY injetada pela plataforma virou sb_secret_ e o PostgREST recusa com PGRST303).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, OPTIONS" };
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const API = "https://services.leadconnectorhq.com";
const LOC = "rZ8y7lzqV7fzxsartaX2";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/146.0 Safari/537.36";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const j = (o: any, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
  const key = srvKey();
  if (!key) return j({ erro: "sem chave de servico (secret SRV_JWT ausente)" }, 500);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, key);
  const diag = new URL(req.url).searchParams.get("diag");
  let status = 0, remaining: any = null, ghlErr: any = null;
  try {
    const r = await fetch(`${API}/emails/builder?locationId=${LOC}&limit=100`, { headers: { "Authorization": "Bearer " + Deno.env.get("GHL_TOKEN"), "Version": "2021-07-28", "Accept": "application/json", "User-Agent": UA } });
    status = r.status; remaining = r.headers.get("x-ratelimit-daily-remaining");
    const d = await r.json().catch(() => ({}));
    const arr = d?.builders || d?.data?.builders || [];
    if (r.ok && Array.isArray(arr) && arr.length) {
      const artes = arr.map((b: any) => ({ id: String(b.id || b._id), nome: b.name || b.title || "(sem nome)", preview: b.previewUrl || b.thumbnail || null, tipo: b.templateType || b.type || null }));
      // atualiza cache (substitui)
      const now = new Date().toISOString();
      const { error: eUp } = await sb.from("ghl_arte").upsert(artes.map((a: any) => ({ ...a, atualizado: now })));
      if (eUp) throw eUp;
      const ids = artes.map((a: any) => a.id);
      const { data: velhas, error: eVel } = await sb.from("ghl_arte").select("id"); if (eVel) throw eVel;
      const remover = (velhas || []).map((x: any) => x.id).filter((id: string) => !ids.includes(id));
      if (remover.length) { const { error } = await sb.from("ghl_arte").delete().in("id", remover); if (error) throw error; }
      return j(diag ? { artes, fonte: "ghl", status, remaining } : { artes, fonte: "ghl" });
    }
    ghlErr = d?.message || null;
  } catch (e) { ghlErr = String(e); }
  // fallback: cache
  const { data: cache } = await sb.from("ghl_arte").select("*").order("nome");
  const artes = (cache || []).map((a: any) => ({ id: a.id, nome: a.nome, preview: a.preview, tipo: a.tipo }));
  const motivo = status === 429 ? "GHL no limite diario de chamadas (cota 0) — mostrando a ultima lista salva" : (ghlErr ? ("GHL indisponivel: " + ghlErr) : null);
  return j({ artes, fonte: "cache", motivo, status, remaining, atualizado: (cache && cache[0]) ? cache[0].atualizado : null });
});
