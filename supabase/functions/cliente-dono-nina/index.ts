// cliente-dono-nina (v1) — da dono a contato de CLIENTE que hoje nao tem nenhum (12/11/2026).
//
// POR QUE EXISTE. O numero de saida do Zaptos e o `assignedTo` do contato: sem dono, a mensagem
// nao sai. No convite do Nitron Conecta, 98 dos 350 clientes do raio com celular no CRM estavam
// sem dono — ou seja, nao receberiam nada por Zaptos. O gestor autorizou em 12/11 dar a Nina
// (a instancia da fabrica, que e quem convida) como dona desses contatos.
//
// ESTREITA DE PROPOSITO, e cada limite abaixo tem motivo:
//   1. SO escreve em contato que esta HOJE SEM DONO. Trocar dono existente foi o que custou dois
//      dias em 15/09: muda, em silencio, todo aviso que saia por outra instancia para aquele
//      contato. Contato com dono volta em `ja_tinham_dono` e nao e tocado.
//   2. Le o assignedTo NA HORA, no proprio GHL — nao confia em snapshot nosso, que pode estar
//      velho justamente no contato que alguem acabou de atribuir.
//   3. GRAVA EM cliente_dono_log ANTES de chamar o GHL, com o dono anterior. O GHL nao guarda
//      historico de assignedTo; sem esse log nao ha marcha a re.
//   4. So aceita instancia cadastrada e ATIVA em instancia_ghl, e usa o usuario_ghl_id dela.
//
// POST { contatos: [ { contact_id, codparc?, nome? } ], instancia?: "Nina", seco?: true }
// GET/POST ?seco=1 = plano seco: diz o que faria, sem escrever nada.
//
// Erro volta como HTTP 200 com ok:false (convencao do painel).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const API = "https://services.leadconnectorhq.com";
const UA = "Mozilla/5.0 (compatible; NitronCampanhas/1.0)";

function ghl(tok: string, metodo: string, caminho: string, corpo?: unknown) {
  return fetch(API + caminho, {
    method: metodo,
    headers: { Authorization: "Bearer " + tok, Version: "2021-07-28", "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
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
    const body: any = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const seco = url.searchParams.get("seco") === "1" || body.seco === true;
    const nomeInst = String(body.instancia || "Nina").trim();
    const contatos: any[] = Array.isArray(body.contatos) ? body.contatos : [];
    if (!contatos.length) return j({ ok: false, erro: "sem contatos" });
    if (contatos.length > 200) return j({ ok: false, erro: "no maximo 200 por chamada" });

    // a instancia tem de existir, estar ativa e ter usuario no CRM
    const { data: inst } = await sb.from("instancia_ghl")
      .select("instancia,usuario_ghl_id,ativa,pausada_em").eq("instancia", nomeInst).maybeSingle();
    if (!inst || inst.ativa !== true || !inst.usuario_ghl_id) {
      return j({ ok: false, erro: `instancia "${nomeInst}" nao esta ativa no instancia_ghl, ou nao tem usuario_ghl_id` });
    }
    const uid = String(inst.usuario_ghl_id);

    // de usuario -> instancia, para dizer de QUEM e o contato que ja tem dono
    const { data: todas } = await sb.from("instancia_ghl").select("instancia,usuario_ghl_id");
    const nomeDe: Record<string, string> = {};
    (todas || []).forEach((x: any) => { if (x.usuario_ghl_id) nomeDe[String(x.usuario_ghl_id)] = String(x.instancia); });

    const res: any[] = [];
    let aplicados = 0, ja_tinham_dono = 0, falhas = 0, nao_achados = 0;

    for (const c of contatos) {
      const cid = String(c.contact_id || "").trim();
      const base = { contact_id: cid, codparc: c.codparc ?? null, nome: c.nome ?? null };
      if (!cid) { falhas++; res.push({ ...base, resultado: "falha", detalhe: "sem contact_id" }); continue; }

      // 2. o estado AGORA, no GHL
      const g = await ghl(tok, "GET", `/contacts/${cid}`);
      if (!g.ok) {
        if (g.status === 404) { nao_achados++; res.push({ ...base, resultado: "nao_achado" }); continue; }
        falhas++; res.push({ ...base, resultado: "falha", detalhe: `ler ${g.status}` }); continue;
      }
      const d: any = await g.json().catch(() => ({}));
      const antes = String(d?.contact?.assignedTo || d?.assignedTo || "");

      // 1. contato COM dono nao e tocado — e a regra que custou dois dias
      if (antes) {
        ja_tinham_dono++;
        res.push({ ...base, resultado: "ja_tinha_dono", dono: nomeDe[antes] || ("usuario " + antes.slice(0, 8)) });
        continue;
      }
      if (seco) { res.push({ ...base, resultado: "daria_dono", dono_depois: nomeInst }); continue; }

      // 3. log ANTES de escrever
      const { data: log } = await sb.from("cliente_dono_log").insert({
        codparc: c.codparc ?? null, nome: c.nome ?? null, contato_ghl: cid,
        dono_antes: null, dono_depois: nomeInst,
        motivo: String(body.motivo || "convite Nitron Conecta — contato sem dono nao recebe Zaptos"),
        resultado: "tentando",
      }).select("id").maybeSingle();

      const p = await ghl(tok, "PUT", `/contacts/${cid}`, { assignedTo: uid });
      const okp = p.ok;
      if (log?.id) await sb.from("cliente_dono_log").update({ resultado: okp ? "aplicado" : ("falha " + p.status) }).eq("id", log.id);
      if (okp) { aplicados++; res.push({ ...base, resultado: "aplicado", dono_depois: nomeInst }); }
      else { falhas++; res.push({ ...base, resultado: "falha", detalhe: `escrever ${p.status}` }); }
    }

    return j({ ok: true, seco, instancia: nomeInst, total: contatos.length, aplicados, ja_tinham_dono, nao_achados, falhas, itens: res });
  } catch (e) {
    return j({ ok: false, erro: String((e as Error).message || e) });
  }
});
