// rep-dono-crm (v1) — poe a ASSISTENTE DO ERP como dona do contato do representante no CRM.
//
// POR QUE. O comunicado ao rep sai pela assistente, e "quem manda" no ZaptosWPP e o assignedTo do
// contato no GHL. Representante sem dono no CRM nao tem por onde sair: o painel descarta a linha de
// Zaptos ("sairia pelo numero errado") e, como o e-mail nasce desligado, ele nao recebe NADA, calado.
// Medido em 19/10: 19 dos 103 representantes ativos ficaram de fora do comunicado de 14-15/10, 14
// deles por falta de dono — entre eles JOSE ALVES (306 clientes), PAULO HENRIQUE (165), WALDEMAR
// (159), LUCIANE (153), MORAES (152), MAURO (119).
//
// O gestor autorizou em 19/10: "esses que nao tem dono no CRM, pegue de onde esta vindo as
// informacoes de assistente e marque as mesmas como proprietarias antes de mandar as mensagens".
// A fonte da assistente e o ERP: rep_carteira.assist_idcrm (AD_IDCRM do gerente no Sankhya), que ja
// E o id do usuario da assistente no GHL — sem casar nome de pessoa.
//
// ESTA E UMA EXCECAO AUTORIZADA A REGRA DE NAO MEXER NO assignedTo, e ela e estreita de proposito:
//   1. So escreve em contato que esta HOJE SEM DONO. Trocar um dono existente muda em silencio todo
//      aviso que ja saia por ele — foi o que custou dois dias em 15/09. Contato com dono e PULADO e
//      aparece em `ja_tinham_dono` para o gestor olhar.
//   2. So toca o telefone que o comunicado usaria (mesma regra do painel: primeiro celular de rotulo
//      confiavel), nao a lista inteira do parceiro.
//   3. So usa assistente de instancia ATIVA e cadastrada em instancia_ghl.
//
// ?seco=1 (padrao) mostra o plano sem escrever nada. POST {"aplicar":true} executa.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const API = "https://services.leadconnectorhq.com";
// mesmo location das outras funcoes (campanhas-enviar, campanhas-comunicado)
const LOC = "rZ8y7lzqV7fzxsartaX2";
const UA = "Mozilla/5.0 (compatible; NitronCampanhas/1.0)";
const digits = (s: any) => String(s || "").replace(/\D/g, "");
const nf = (s: any) => digits(s).replace(/^0+/, "").replace(/^55/, "");
function e164(f: any): string { const d = digits(f); if (!d) return ""; return d.length <= 11 ? "+55" + d : "+" + d; }
// Mesma leitura do painel: 10 digitos e fixo (sem WhatsApp), 11+ e celular.
const ehCelular = (v: any) => nf(v).length >= 11;
const FUZZY = new Set(["CRM·empresa", "CRM·casado"]);

async function ghl(tok: string, metodo: string, caminho: string, corpo?: unknown) {
  const r = await fetch(API + caminho, {
    method: metodo,
    headers: { Authorization: "Bearer " + tok, Version: "2021-07-28", "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const t = await r.text();
  let d: any = null; try { d = JSON.parse(t); } catch { /* corpo nao-json */ }
  return { ok: r.ok, status: r.status, body: d, texto: t.slice(0, 300) };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const tok = Deno.env.get("GHL_TOKEN");
    if (!tok) return j({ ok: false, erro: "sem GHL_TOKEN" });
    const key = srvKey();
    if (!key) return j({ ok: false, erro: "sem chave de servico (SRV_JWT)" });
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, key);

    const url = new URL(req.url);
    let body: any = {};
    if (req.method === "POST") { try { body = await req.json(); } catch { body = {}; } }
    const aplicar = body?.aplicar === true && url.searchParams.get("seco") !== "1";

    const { data: rcs, error: eRc } = await sb.from("rep_carteira").select("codvend,apelido,codparc,assist_idcrm,celular,clientes"); if (eRc) throw eRc;
    const { data: instRows, error: eI } = await sb.from("instancia_ghl").select("instancia,usuario_ghl_id,ativa,pausada_em"); if (eI) throw eI;
    const porUsuario: Record<string, any> = {};
    (instRows || []).forEach((x: any) => { if (x.usuario_ghl_id) porUsuario[String(x.usuario_ghl_id)] = x; });
    const { data: extras, error: eE } = await sb.from("rep_contato_extra").select("codvend,tipo,valor,rotulo").eq("ativo", true); if (eE) throw eE;
    const exMap: Record<string, any[]> = {}; (extras || []).forEach((e: any) => { (exMap[e.codvend] = exMap[e.codvend] || []).push(e); });

    // telefone que o comunicado usaria: primeiro celular de rotulo confiavel
    const alvos = (rcs || []).map((r: any) => {
      const tels: { valor: string; rotulo: string }[] = [];
      if (r.celular) tels.push({ valor: String(r.celular), rotulo: "Sankhya" });
      (exMap[String(r.codvend)] || []).filter((e: any) => e.tipo === "telefone")
        .forEach((e: any) => tels.push({ valor: String(e.valor), rotulo: e.rotulo || "manual" }));
      const vistos = new Set<string>();
      const unicos = tels.filter((t) => { const k = nf(t.valor); if (!k || vistos.has(k)) return false; vistos.add(k); return true; });
      const forte = unicos.find((t) => ehCelular(t.valor) && !FUZZY.has(t.rotulo)) || null;
      const inst = r.assist_idcrm ? porUsuario[String(r.assist_idcrm)] : null;
      return { codvend: Number(r.codvend), nome: String(r.apelido || ("Rep " + r.codvend)), clientes: Number(r.clientes) || 0, forte, assist_idcrm: r.assist_idcrm || null, inst };
    });

    // dono atual de cada telefone, no CRM
    const fones = Array.from(new Set(alvos.filter((a) => a.forte).map((a) => e164(a.forte!.valor))));
    const contato: Record<string, { id: string; assignedTo: string | null }> = {};
    for (let i = 0; i < fones.length; i += 90) {
      const r = await ghl(tok, "POST", "/contacts/search", { locationId: LOC, pageLimit: 100, filters: [{ field: "phone", operator: "contains_set", value: fones.slice(i, i + 90) }] });
      if (!r.ok) return j({ ok: false, erro: "busca no CRM falhou (" + r.status + "): " + r.texto });
      (r.body?.contacts || []).forEach((c: any) => { const k = nf(c?.phone); if (k && !contato[k]) contato[k] = { id: String(c.id), assignedTo: c?.assignedTo ? String(c.assignedTo) : null }; });
    }

    const plano: any[] = [], ja: any[] = [], sem: any[] = [];
    alvos.forEach((a) => {
      if (!a.forte) { sem.push({ codvend: a.codvend, nome: a.nome, clientes: a.clientes, motivo: "sem celular confiavel no cadastro" }); return; }
      if (!a.inst) { sem.push({ codvend: a.codvend, nome: a.nome, clientes: a.clientes, motivo: a.assist_idcrm ? "assistente do ERP fora do instancia_ghl" : "sem assistente no ERP" }); return; }
      const c = contato[nf(a.forte.valor)];
      if (!c) { sem.push({ codvend: a.codvend, nome: a.nome, clientes: a.clientes, fone: a.forte.valor, motivo: "telefone nao achado no CRM" }); return; }
      if (c.assignedTo) {
        const atual = porUsuario[c.assignedTo];
        if (atual?.instancia !== a.inst.instancia) ja.push({ codvend: a.codvend, nome: a.nome, fone: a.forte.valor, dono_atual: atual?.instancia || ("usuario " + c.assignedTo), erp_diz: a.inst.instancia });
        return; // NUNCA troca dono existente
      }
      plano.push({ codvend: a.codvend, nome: a.nome, clientes: a.clientes, fone: a.forte.valor, contact_id: c.id, assistente: a.inst.instancia, pausada: !!a.inst.pausada_em, ativa: a.inst.ativa !== false, uid: String(a.assist_idcrm) });
    });

    if (!aplicar) {
      return j({ ok: true, seco: true, reps: alvos.length, a_marcar: plano.length, ja_tinham_dono: ja.length, sem_caminho: sem.length, plano, ja_tinham_dono_detalhe: ja, sem_caminho_detalhe: sem });
    }

    const feitos: any[] = [], falhas: any[] = [];
    for (const p of plano) {
      const r = await ghl(tok, "PUT", "/contacts/" + p.contact_id, { assignedTo: p.uid });
      if (r.ok) feitos.push({ codvend: p.codvend, nome: p.nome, assistente: p.assistente });
      else falhas.push({ codvend: p.codvend, nome: p.nome, status: r.status, erro: r.texto });
    }
    return j({ ok: true, aplicado: true, marcados: feitos.length, falhas: falhas.length, feitos, falhas, ja_tinham_dono: ja.length, ja_tinham_dono_detalhe: ja, sem_caminho: sem.length, sem_caminho_detalhe: sem });
  } catch (e: any) {
    const msg = [e?.message, e?.details, e?.hint, e?.code].filter(Boolean).join(" · ") || String(e);
    console.error("rep-dono-crm falhou:", msg);
    return j({ ok: false, erro: msg });
  }
});
