// copiloto-tarefas — painel vivo da FILA DE EXECUCAO + API. Serve o HTML (?k=token) e os endpoints ?acao=lista|resolver|andamento (k=token).
// Alimentado por copiloto_tarefas (a Nina abre via abrir_tarefa em qualquer conversa: rep ou cliente). verify_jwt=false, gate por token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const SUPA_URL = Deno.env.get("SUPABASE_URL")!; const SRK = Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
function htmlPage(): string { return `<!doctype html><html lang=pt-br><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Fila de Execucao — Nina</title><style>
:root{--bg:#f4f5f7;--panel:#fff;--panel2:#fbfbfc;--ink:#1c2230;--ink2:#5b6472;--line:#e6e8ee;--line2:#eef0f4;--accent:#e8622a;--nova:#e8622a;--andamento:#c98a12;--resolvida:#2f9e63;--a-financeiro:#d84a4a;--a-execucao:#e8622a;--a-cadastro:#7b62d8;--a-logistica:#2f74d0;--a-faturamento:#128a86;--a-ti:#6b7280;--a-comercial:#c98a12;--a-gestor:#c4519b;--sh:0 1px 2px rgba(20,26,40,.05),0 6px 20px rgba(20,26,40,.05)}
@media(prefers-color-scheme:dark){:root{--bg:#12141a;--panel:#191c23;--panel2:#1e222b;--ink:#eef1f6;--ink2:#9aa3b2;--line:#282d38;--line2:#222731;--accent:#ff7a45;--nova:#ff7a45;--andamento:#e0a53a;--resolvida:#49c187;--a-financeiro:#ef6a6a;--a-execucao:#ff7a45;--a-cadastro:#9d86ee;--a-logistica:#5a97e6;--a-faturamento:#2bb0ab;--a-ti:#98a1b0;--a-comercial:#e0a53a;--a-gestor:#dd77bb;--sh:0 1px 2px rgba(0,0,0,.3),0 8px 24px rgba(0,0,0,.28)}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,\"Segoe UI\",Roboto,Arial,sans-serif;font-size:15px;line-height:1.5}
.wrap{max-width:1080px;margin:0 auto;padding:20px 18px 60px}.top{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:16px}
.brand{display:flex;align-items:center;gap:11px}.flame{width:30px;height:30px;border-radius:8px;background:linear-gradient(150deg,var(--accent),#f0a24a);display:grid;place-items:center;color:#fff;font-weight:800;box-shadow:var(--sh)}
h1{font-size:20px;margin:0;letter-spacing:-.02em}.sub{color:var(--ink2);font-size:12.5px;margin-top:1px}
.kpis{display:flex;gap:10px;flex-wrap:wrap}.kpi{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:9px 14px;min-width:92px;box-shadow:var(--sh)}
.kpi .n{font-size:22px;font-weight:750;font-variant-numeric:tabular-nums;line-height:1.1}.kpi .l{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--ink2);margin-top:2px}.kpi.acc .n{color:var(--accent)}
.filters{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin:14px 0 4px}.chip{border:1px solid var(--line);background:var(--panel);color:var(--ink2);border-radius:999px;padding:6px 12px;font-size:12.5px;font-weight:600;cursor:pointer;display:inline-flex;gap:7px;align-items:center}
.chip.on{background:var(--ink);color:var(--bg);border-color:var(--ink)}.chip .dot{width:8px;height:8px;border-radius:50%}.chip .c{font-variant-numeric:tabular-nums;opacity:.7;font-size:11px}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:999px;overflow:hidden;background:var(--panel)}.seg button{border:0;background:transparent;color:var(--ink2);padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit}.seg button.on{background:var(--panel2);color:var(--ink)}
.list{display:flex;flex-direction:column;gap:11px;margin-top:12px}.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:var(--sh);padding:15px 16px;display:grid;grid-template-columns:5px 1fr auto;gap:0 15px;position:relative;overflow:hidden}
.rail{position:absolute;left:0;top:0;bottom:0;width:5px;background:var(--area)}.body{grid-column:2;min-width:0}.side{grid-column:3;display:flex;flex-direction:column;align-items:flex-end;gap:9px;white-space:nowrap}
.row1{display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:3px}.area{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--area);border:1px solid color-mix(in srgb,var(--area) 35%,transparent);background:color-mix(in srgb,var(--area) 12%,transparent);padding:2px 8px;border-radius:6px}
.proto{font-size:12px;color:var(--ink2);font-variant-numeric:tabular-nums;font-weight:600}.status{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:650}.status .d{width:8px;height:8px;border-radius:50%}
.acao{font-size:15px;font-weight:640;margin:2px 0 5px;text-wrap:balance}.det{font-size:13px;color:var(--ink2)}.meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px;font-size:12px;color:var(--ink2)}.meta b{color:var(--ink);font-weight:640}.tag{background:var(--panel2);border:1px solid var(--line2);border-radius:7px;padding:2px 8px}
.age{font-size:11.5px;color:var(--ink2);font-variant-numeric:tabular-nums}.btn{border:1px solid var(--line);background:var(--panel2);color:var(--ink);border-radius:9px;padding:7px 12px;font-size:12.5px;font-weight:650;cursor:pointer;font-family:inherit}.btn:hover{border-color:var(--resolvida);color:var(--resolvida)}.btn.g{border-color:var(--andamento);color:var(--andamento)}
.card.done{opacity:.5}.card.done .acao{text-decoration:line-through}.empty{text-align:center;color:var(--ink2);padding:40px}.foot{margin-top:22px;color:var(--ink2);font-size:11.5px;text-align:center}
@media(max-width:560px){.card{grid-template-columns:5px 1fr}.side{grid-column:2;align-items:flex-start;flex-direction:row;margin-top:10px}}
</style></head><body><div class=wrap>
<div class=top><div class=brand><div class=flame>N</div><div><h1>Fila de Execução</h1><div class=sub>Tudo que a Nina tria das conversas (reps e clientes) — a IA lê e encaminha, a equipe executa</div></div></div>
<div class=kpis><div class="kpi acc"><div class=n id=k-novas>–</div><div class=l>Novas</div></div><div class=kpi><div class=n id=k-and>–</div><div class=l>Em andamento</div></div><div class=kpi><div class=n id=k-res>–</div><div class=l>Resolvidas hoje</div></div></div></div>
<div class=filters id=areaFilters></div><div class=filters style=margin-top:2px><div class=seg id=statusSeg><button data-st=abertas class=on>Abertas</button><button data-st=todas>Todas</button><button data-st=resolvidas>Resolvidas</button></div><div class=age style=margin-left:auto id=count></div></div>
<div class=list id=list></div><div class=foot>Atualiza sozinho a cada 20s · fila real da operação Nitron</div></div>
<script>
const K=new URLSearchParams(location.search).get('k')||'';
const AREAS={financeiro:'Financeiro',execucao:'Execução',cadastro:'Cadastro',logistica:'Logística',faturamento:'Faturamento',ti:'TI',comercial:'Comercial',gestor:'Gestor'};
const ST={nova:['Nova','--nova'],andamento:['Em andamento','--andamento'],resolvida:['Resolvida','--resolvida']};
let DATA={tarefas:[],stats:{}},fArea='todas',fStatus='abertas';
function idade(iso){if(!iso)return'';const s=(Date.now()-new Date(iso).getTime())/1000;if(s<90)return'agora';if(s<3600)return'há '+Math.round(s/60)+' min';if(s<86400)return'há '+Math.round(s/3600)+' h';return'há '+Math.round(s/86400)+' d';}
async function carrega(){try{const r=await fetch(location.pathname+'?acao=lista&k='+encodeURIComponent(K));DATA=await r.json();render();}catch(e){}}
async function acao(id,st){try{await fetch(location.pathname+'?acao='+st+'&k='+encodeURIComponent(K),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});carrega();}catch(e){}}
function counts(){const c={};(DATA.tarefas||[]).forEach(t=>{if(t.status!=='resolvida')c[t.area]=(c[t.area]||0)+1});return c;}
function renderFilters(){const c=counts(),af=document.getElementById('areaFilters');const tot=Object.values(c).reduce((a,b)=>a+b,0);af.innerHTML='';const all=document.createElement('button');all.className='chip'+(fArea==='todas'?' on':'');all.innerHTML='Todas <span class=c>'+tot+'</span>';all.onclick=()=>{fArea='todas';render()};af.appendChild(all);Object.keys(AREAS).forEach(a=>{if(!c[a])return;const b=document.createElement('button');b.className='chip'+(fArea===a?' on':'');b.innerHTML='<span class=dot style=\"background:var(--a-'+a+')\"></span>'+AREAS[a]+' <span class=c>'+c[a]+'</span>';b.onclick=()=>{fArea=a;render()};af.appendChild(b)})}
function card(t){const done=t.status==='resolvida';const el=document.createElement('div');el.className='card'+(done?' done':'');el.style.setProperty('--area','var(--a-'+t.area+')');const s=ST[t.status]||ST.nova;el.innerHTML='<div class=rail></div><div class=body><div class=row1><span class=area>'+(AREAS[t.area]||t.area)+'</span><span class=proto>#'+String(t.id).padStart(3,'0')+'</span><span class=status><span class=d style=\"background:var('+s[1]+')\"></span>'+s[0]+'</span></div><div class=acao></div><div class=det></div><div class=meta><span class=tag>Cliente: <b>'+(t.cliente_nome||'—')+'</b></span><span class=tag>Rep: <b>'+(t.rep||'—')+'</b></span>'+(t.tipo?'<span class=tag>'+t.tipo+'</span>':'')+'</div></div><div class=side><span class=age>'+idade(t.criado)+'</span></div>';el.querySelector('.acao').textContent=t.acao||'';el.querySelector('.det').textContent=t.detalhe||'';const side=el.querySelector('.side');if(!done){if(t.status!=='andamento'){const b1=document.createElement('button');b1.className='btn g';b1.textContent='Pegar';b1.onclick=()=>acao(t.id,'andamento');side.appendChild(b1)}const b=document.createElement('button');b.className='btn';b.textContent='Marcar resolvida';b.onclick=()=>acao(t.id,'resolver');side.appendChild(b)}return el}
function render(){renderFilters();let rows=(DATA.tarefas||[]).slice();if(fArea!=='todas')rows=rows.filter(t=>t.area===fArea);if(fStatus==='abertas')rows=rows.filter(t=>t.status!=='resolvida');else if(fStatus==='resolvidas')rows=rows.filter(t=>t.status==='resolvida');rows.sort((a,b)=>(a.status==='resolvida')-(b.status==='resolvida')||b.id-a.id);const list=document.getElementById('list');list.innerHTML='';if(!rows.length)list.innerHTML='<div class=empty>Nada por aqui 👏</div>';else rows.forEach(t=>list.appendChild(card(t)));document.getElementById('count').textContent=rows.length+(rows.length===1?' tarefa':' tarefas');const s=DATA.stats||{};document.getElementById('k-novas').textContent=s.novas??0;document.getElementById('k-and').textContent=s.andamento??0;document.getElementById('k-res').textContent=s.resolvidas_hoje??0}
document.querySelectorAll('#statusSeg button').forEach(b=>b.onclick=()=>{document.querySelectorAll('#statusSeg button').forEach(x=>x.classList.remove('on'));b.classList.add('on');fStatus=b.dataset.st;render()});
carrega();setInterval(carrega,20000);
</script></body></html>`; }
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = createClient(SUPA_URL, SRK);
    const sp = new URL(req.url).searchParams; const acao = sp.get("acao"); const k = sp.get("k") || "";
    const { data: tk } = await sb.from("copiloto_config").select("valor").eq("chave", "tarefas_token").maybeSingle();
    const token = tk?.valor || "";
    if (token && k !== token) { if (!acao) return new Response("<h3 style='font-family:sans-serif'>Acesso: adicione ?k=SEU_TOKEN na URL</h3>", { status: 401, headers: { "Content-Type": "text/html; charset=utf-8" } }); return j({ erro: "nao autorizado" }, 401); }
    if (acao === "lista") {
      const { data } = await sb.from("copiloto_tarefas").select("id, area, tipo, acao, detalhe, cliente_nome, codparc, rep, status, criado").order("id", { ascending: false }).limit(500);
      const rows = data || [];
      const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
      const stats = { novas: rows.filter((t: any) => t.status === "nova").length, andamento: rows.filter((t: any) => t.status === "andamento").length, resolvidas_hoje: rows.filter((t: any) => t.status === "resolvida" && String(t.criado).slice(0, 10) === hoje).length };
      return j({ ok: true, stats, tarefas: rows });
    }
    if (acao === "resolver" || acao === "andamento") {
      const b = await req.json().catch(() => ({})); const id = parseInt(b?.id); if (!id) return j({ erro: "id?" }, 400);
      const upd: any = acao === "resolver" ? { status: "resolvida", resolvido_em: new Date().toISOString() } : { status: "andamento" };
      const { error } = await sb.from("copiloto_tarefas").update(upd).eq("id", id);
      return j({ ok: !error, erro: error?.message });
    }
    return new Response(htmlPage(), { headers: { ...cors, "Content-Type": "text/html; charset=utf-8" } });
  } catch (e) { return j({ ok: false, erro: String(e) }, 500); }
});
