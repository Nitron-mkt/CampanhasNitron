// copiloto-entrega (v4) — a tarefa que a Nina abre passa a EXISTIR onde o humano olha.
//
// Em 10/09 o gestor abriu o painel do contato do lead que a Nina acabara de qualificar (Kasamais,
// Sao Luis/MA) e leu "Ainda nao ha tarefas". A tarefa existia — em copiloto_tarefas, a NOSSA fila —
// e a nossa fila nao avisa ninguem: e uma tabela que alguem precisa abrir. Ele foi direto ao ponto:
// "isso nao pode passar de jeito nenhum". Entao esta funcao pega toda tarefa recem-gravada pelo
// copiloto e faz as duas coisas que faltavam:
//   1. abre a tarefa NO CRM, no contato (POST /contacts/{id}/tasks), com dono de verdade no
//      assignedTo e quem acompanha NOMEADO no corpo — uma tarefa do GHL aceita UM assignedTo;
//   2. marca dono e acompanha como SEGUIDORES do contato — no GHL e assim que se marca alguem, e
//      foi o pedido: "marque o Usuario do Leonardo, Camyla, tudo nessa tarefa";
//   3. manda o resumo da conversa e os dados do cliente para quem tem de saber.
//
// v4 (18/09): o aviso de lead que ainda NAO TEM DESTINO deixa de sair daqui. Ver esperandoRepasse().
//
// POR QUE AQUI E NAO DENTRO DA copiloto-lead: assim a entrega e uma FILA, com retentativa e
// independente de qual caminho gravou a tarefa (encerramento com passar_comercial, janela de 24h da
// Meta que fechou antes da primeira resposta, e o que vier depois). Se o GHL recusar na hora, a
// tarefa nao se perde calada: a rodada seguinte tenta de novo, ate entrega_tentativas_max. E o lead
// nao fica esperando criacao de tarefa e e-mail dentro do turno da conversa dele.
//
// QUEM RESPONDE mora em copiloto_responsaveis (area, papel: dono | acompanha) e os parametros em
// copiloto_config (entrega_*) — muda por UPDATE, sem deploy. Mesma regra do resto da casa.
//
// ?dry=1 mostra o que sairia sem abrir nada e sem mandar nada.
// ?tarefa=<id> entrega uma tarefa especifica, mesmo ja tentada ou fora da janela.
// ?so_aviso=1 manda o resumo SEM abrir tarefa no CRM (a do CRM ja existe; faltou o aviso).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
// SUPABASE_SERVICE_ROLE_KEY vem com valor sb_secret_, que o PostgREST recusa (PGRST303) — SRV_JWT
// e o JWT de verdade. Toda funcao da casa le nesta ordem.
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GHL = (Deno.env.get("GHL_TOKEN") || "").trim();
const LOC = "rZ8y7lzqV7fzxsartaX2";

const digits = (s: any) => String(s || "").replace(/\D/g, "");
const d10 = (s: any) => digits(s).slice(-10);
const lista = (s: any, pad: string) => String(s || pad).split(",").map((x) => x.trim()).filter(Boolean);
const ghl = (m: string, p: string, v = "2021-07-28", body?: any) => fetch("https://services.leadconnectorhq.com" + p, { method: m, headers: { Authorization: "Bearer " + GHL, Version: v, Accept: "application/json", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

// ---- quem responde pela area ------------------------------------------------------------------
// A tabela nasceu com as 8 areas e todos os campos nulos, sem ninguem que a lesse. Agora ela e a
// fonte do dono da tarefa (assignedTo) e de quem recebe o aviso.
async function equipe(sb: any, areas: string[]): Promise<any[]> {
  try {
    const { data } = await sb.from("copiloto_responsaveis").select("area,papel,nome,fone,email,idcrm,avisar").eq("ativo", true).in("area", areas);
    return (data || []) as any[];
  } catch (_e) { return []; }
}

async function tarefaCrm(contact_id: string, titulo: string, corpo: string, dono: string | null, prazoH: number) {
  const body: any = { title: titulo.slice(0, 200), body: corpo.slice(0, 4000), completed: false, dueDate: new Date(Date.now() + Math.max(1, prazoH) * 3600000).toISOString() };
  if (dono) body.assignedTo = dono;   // sem dono a tarefa nasce sem ninguem, e volta a ser invisivel
  const r = await ghl("POST", `/contacts/${contact_id}/tasks`, "2021-07-28", body);
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, id: d?.task?.id || null, motivo: r.ok ? undefined : String(d?.message || ("GHL " + r.status)).slice(0, 200) };
}

// "marque o Usuario do Leonardo, Camyla, tudo nessa tarefa": no GHL, marcar alguem num contato e
// torna-lo SEGUIDOR. E o que faz os dois verem o contato e receberem notificacao — a tarefa em si
// so tem lugar para UM (o assignedTo). Idempotente: o GHL devolve followersAdded so de quem faltava.
async function seguidores(contact_id: string, ids: string[]) {
  if (!ids.length) return { ok: true, add: [] as string[] };
  const r = await ghl("POST", `/contacts/${contact_id}/followers`, "2021-07-28", { followers: ids });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, add: (d?.followersAdded || []) as string[], motivo: r.ok ? undefined : String(d?.message || ("GHL " + r.status)).slice(0, 200) };
}

// ---- o aviso ----------------------------------------------------------------------------------
// Canais EM ORDEM (entrega_canal), para no primeiro que entrega. Nao e preciosismo: o WhatsApp
// interno depende de quem e o dono do contato no CRM — o numero de saida do Zaptos e o assignedTo
// do contato, e o campanhas-enviar RECUSA quando o dono divirja da instancia pedida (com razao:
// senao a mensagem sai por outro numero, ou por instancia pausada, e vira "enviado" sem chegar).
// Sem a cadeia, o resumo se perderia calado toda vez que o CRM estivesse assim.
async function avisar(pessoas: any[], assunto: string, texto: string, inst: string, canais: string[]) {
  const out: any[] = []; const vistos = new Set<string>();
  for (const p of pessoas) {
    const chave = d10(p.fone) || String(p.email || "").toLowerCase();
    if (!chave || vistos.has(chave)) continue;   // a mesma pessoa em duas areas recebe UMA mensagem
    vistos.add(chave);
    let entregue = false; const tent: any[] = [];
    for (const c of canais) {
      if (entregue) break;
      const alvo = c === "email" ? p.email : p.fone;
      if (!alvo) { tent.push({ canal: c, ok: false, motivo: "sem " + (c === "email" ? "e-mail" : "telefone") + " no cadastro" }); continue; }
      const corpo: any = c === "email"
        ? { canal: "email", email: p.email, nome: p.nome || undefined, assunto, texto }
        : { canal: "whatsapp", fone: String(p.fone), nome: p.nome || undefined, texto, instancia: inst };
      try {
        const r = await fetch(SUPA_URL + "/functions/v1/campanhas-enviar", { method: "POST", headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
        const d: any = await r.json().catch(() => ({ ok: false, motivo: "resposta ilegivel do campanhas-enviar" }));
        tent.push({ canal: c, ok: !!d?.ok, motivo: d?.ok ? undefined : String(d?.motivo || "").slice(0, 200) });
        entregue = !!d?.ok;
      } catch (e) { tent.push({ canal: c, ok: false, motivo: String(e).slice(0, 200) }); }
    }
    out.push({ nome: p.nome || chave, area: p.area, entregue, tentativas: tent });
  }
  return out;
}

// Ordem do gestor em 18/09: UMA mensagem por lead, e ela tem de dizer quem esta cuidando. A tarefa
// nasce na QUALIFICACAO, quando ninguem foi escolhido ainda — e era isso que chegava primeiro, sem
// destino ("nao sei quem esta cuidando deles"). Entao, enquanto o lead ainda espera repasse, a
// tarefa e aberta no CRM normalmente, mas o Zaptos nao sai: quem avisa e o espelho da
// copiloto-repasse, que ja traz loja, CNPJ, telefone, resumo E o nome de quem recebeu.
async function esperandoRepasse(sb: any, t: any): Promise<boolean> {
  if (!t.contact_id || String(t.origem || "") !== "nina-lead") return false;
  try {
    const { data } = await sb.from("copiloto_lead").select("id, status, repasse_em")
      .eq("contact_id", t.contact_id).order("id", { ascending: false }).limit(1).maybeSingle();
    return !!data && !data.repasse_em && String(data.status || "") === "passado";
  } catch (_e) { return false; }
}

// ---- uma tarefa -------------------------------------------------------------------------------
async function entregar(sb: any, cfg: Record<string, string>, t: any, o: { dry: boolean; soAviso: boolean }) {
  const area = String(t.area || "comercial");
  const areasAviso = [area, ...(String(cfg.entrega_aviso_gestor || "sim").toLowerCase() === "sim" ? ["gestor"] : [])];
  const eq = await equipe(sb, Array.from(new Set(areasAviso)));
  const dono = eq.find((p: any) => p.area === area && p.papel === "dono" && p.idcrm) || eq.find((p: any) => p.papel === "dono" && p.idcrm) || null;
  const acomp = eq.filter((p: any) => p.area === area && p.papel !== "dono" && p.nome).map((p: any) => p.nome);
  const titulo = String(t.acao || ("Tarefa " + t.id));
  const quem = [dono?.nome ? "Responsavel: " + dono.nome : null, acomp.length ? "Acompanha: " + acomp.join(", ") : null].filter(Boolean).join("\n");
  const corpo = [quem, String(t.detalhe || "").trim(), "Tarefa interna #" + t.id].filter(Boolean).join("\n\n");
  const canais = lista(cfg.entrega_canal, "whatsapp,email");
  // a mesma pessoa aparece em duas areas (comercial e gestor): uma mensagem so, e a previa tem de
  // dizer isso tambem — senao ela promete dois avisos onde vai sair um.
  const destinatarios: any[] = []; const jaVistos = new Set<string>();
  for (const p of eq.filter((x: any) => x.avisar)) {
    const k = d10(p.fone) || String(p.email || "").toLowerCase();
    if (!k || jaVistos.has(k)) continue;
    jaVistos.add(k); destinatarios.push(p);
  }

  const marcar = Array.from(new Set(eq.filter((p: any) => p.area === area && p.idcrm).map((p: any) => String(p.idcrm))));
  // lead ainda sem destino: a tarefa vai para o CRM, o aviso espera o espelho do repasse
  const segurarAviso = String(cfg.entrega_aviso_so_com_destino || "sim") === "sim" && await esperandoRepasse(sb, t);
  if (segurarAviso) { destinatarios.length = 0; }

  if (o.dry) {
    return { tarefa: t.id, previa: true, titulo, responsavel: dono?.nome || null, acompanha: acomp, aviso_segurado: segurarAviso || undefined, abriria_no_crm: !!(t.contact_id && !o.soAviso && !t.crm_task_id), tarefa_crm_existente: t.crm_task_id || undefined, marcaria: marcar, avisaria: destinatarios.map((p: any) => p.nome), canais, corpo };
  }

  const rep: any = { tarefa: t.id, titulo, responsavel: dono?.nome || null, acompanha: acomp };
  if (segurarAviso) rep.aviso_segurado = "lead ainda sem destino — quem avisa e o espelho do repasse";
  const erros: string[] = [];

  // crm_task_id preenchido = a tarefa do CRM ja existe (a rodada anterior abriu, ou alguem abriu a
  // mao). Nao abrir de novo: duas tarefas iguais no mesmo contato e pior que nenhuma.
  if (t.crm_task_id) { rep.tarefa_crm = t.crm_task_id; rep.tarefa_crm_reaproveitada = true; }
  else if (t.contact_id && !o.soAviso) {
    const r = await tarefaCrm(String(t.contact_id), titulo, corpo, dono?.idcrm || null, Number(cfg.entrega_prazo_h || 4));
    rep.tarefa_crm = r.id || null;
    if (!r.ok) { rep.tarefa_crm_erro = r.motivo; erros.push("CRM: " + r.motivo); }
  } else if (!t.contact_id) {
    rep.tarefa_crm = null; rep.tarefa_crm_erro = "tarefa sem contact_id — nao ha contato onde abrir";
  }

  // seguidores nao entram na conta do entrega_ok: sao secundarios, e falhar aqui nao pode fazer a
  // fila reabrir tarefa e remandar aviso na rodada seguinte.
  if (t.contact_id && marcar.length) {
    const sg = await seguidores(String(t.contact_id), marcar);
    rep.marcados = sg.add; if (!sg.ok) rep.marcados_erro = sg.motivo;
  }

  const texto = ["Tarefa — " + titulo, "", corpo, t.contact_id ? "" : null].filter((x) => x !== null).join("\n");
  rep.aviso = await avisar(destinatarios, titulo, texto, String(cfg.lead_inst || "Nina"), canais);
  if (destinatarios.length && !rep.aviso.some((a: any) => a.entregue)) erros.push("aviso: nenhum canal entregou");

  // entrega_ok=true so quando a tarefa do CRM existe (ou nao havia onde abrir) E alguem foi avisado.
  // Enquanto for false a proxima rodada tenta de novo, ate entrega_tentativas_max — e o motivo fica
  // gravado em entrega_erro, para nao ser preciso ler log de funcao para saber o que travou.
  const ok = erros.length === 0;
  try {
    await sb.from("copiloto_tarefas").update({
      crm_task_id: rep.tarefa_crm || t.crm_task_id || null,
      responsavel: dono?.nome || t.responsavel || null,
      entrega_ok: ok, entrega_em: new Date().toISOString(),
      entrega_tentativas: Number(t.entrega_tentativas || 0) + 1,
      entrega_erro: ok ? null : erros.join(" | ").slice(0, 400),
    }).eq("id", t.id);
  } catch (e) { rep.gravacao_erro = String(e).slice(0, 200); }
  rep.ok = ok;
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
    const soAviso = sp.get("so_aviso") === "1" || b.so_aviso === true;
    const umaId = parseInt(String(sp.get("tarefa") || b.tarefa || "0")) || 0;
    const limite = Math.min(parseInt(String(sp.get("limite") || b.limite || "10")) || 10, 40);

    const { data: cfgRows } = await sb.from("copiloto_config").select("*");
    const cfg: Record<string, string> = {}; (cfgRows || []).forEach((r: any) => cfg[r.chave] = r.valor);
    if (String(cfg.copiloto_ativo || "sim").toLowerCase() === "nao") return j({ ok: true, desligado: "copiloto_ativo=nao" });
    if (!umaId && String(cfg.entrega_ativa || "sim").toLowerCase() !== "sim") return j({ ok: true, desligado: "entrega_ativa=nao" });

    const cols = "id, criado, area, tipo, acao, detalhe, cliente_nome, contact_id, origem, prioridade, status, responsavel, crm_task_id, entrega_ok, entrega_tentativas";
    let pend: any[] = [];
    if (umaId) {
      // ?tarefa=<id>: entrega manual, sem olhar janela nem tentativas — e o caminho de conserto.
      const { data } = await sb.from("copiloto_tarefas").select(cols).eq("id", umaId).maybeSingle();
      if (!data) return j({ ok: false, erro: "tarefa " + umaId + " nao existe" }, 404);
      pend = [data];
    } else {
      // Janela curta de proposito: a tabela tem meses de tarefas antigas, e entregar tudo de uma vez
      // encheria o CRM de tarefa velha e o WhatsApp do responsavel de aviso atrasado.
      const janelaH = Math.max(1, parseInt(cfg.entrega_janela_h || "12") || 12);
      const maxTent = Math.max(1, parseInt(cfg.entrega_tentativas_max || "3") || 3);
      const desde = new Date(Date.now() - janelaH * 3600000).toISOString();
      const { data, error } = await sb.from("copiloto_tarefas").select(cols)
        .in("origem", lista(cfg.entrega_origens, "nina-lead"))
        .gte("criado", desde)
        .or("entrega_ok.is.null,entrega_ok.eq.false")
        .lt("entrega_tentativas", maxTent)
        .order("id", { ascending: true }).limit(limite);
      if (error) return j({ ok: false, erro: error.message }, 500);
      pend = data || [];
    }

    const feitas: any[] = [];
    for (const t of pend) {
      try { feitas.push(await entregar(sb, cfg, t, { dry, soAviso })); }
      catch (e) { feitas.push({ tarefa: t.id, ok: false, erro: String(e).slice(0, 200) }); }
    }
    return j({ ok: true, modo: dry ? "previa" : "entregando", pendentes: pend.length, entregues: feitas.filter((f) => f.ok).length, resultado: feitas });
  } catch (e) { return j({ ok: false, erro: String(e) }, 500); }
});
