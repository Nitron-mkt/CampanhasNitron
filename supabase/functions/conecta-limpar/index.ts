// conecta-limpar (v1) — apaga do pipeline os cards de convite que NAO foram enviados (11/11/2026).
//
// POR QUE. Em 09/11 o lote do Conecta criou 635 cards em "Convite enviado" e logo depois a fila
// morreu na chave (wpp_ativo e email_ativo = false). As 1.031 linhas foram canceladas em 11/11 a
// pedido do gestor — mas os cards ficaram, afirmando um convite que nunca saiu. Quadro que mente e
// pior do que quadro vazio.
//
// A REGRA QUE PROTEGE O QUE IMPORTA: so apaga card que esta na PRIMEIRA etapa (convite). Card que
// avancou — "Formulario preenchido", "Confirmado", "Compareceu" — e gente que se inscreveu de
// verdade, e nao se toca. Em 11/11 ja havia tres inscricoes reais pelo formulario, mesmo com a fila
// desligada: apagar por lista de vinculo, sem olhar a etapa, levaria essas pessoas junto.
//
// Em lotes porque sao ~635 DELETEs no GHL e a funcao tem limite de tempo: `limite` (padrao 200) e a
// resposta diz quantos sobraram, para chamar de novo ate zerar.
//
// POST { limite?: 200, seco?: true }
// Erro volta como HTTP 200 com ok:false (convencao do painel).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const API = "https://services.leadconnectorhq.com";
const LOC = "rZ8y7lzqV7fzxsartaX2";
const UA = "Mozilla/5.0 (compatible; NitronCampanhas/1.0)";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function ghl(metodo: string, caminho: string) {
  return fetch(API + caminho, {
    method: metodo,
    headers: { Authorization: "Bearer " + Deno.env.get("GHL_TOKEN"), Version: "2021-07-28", Accept: "application/json", "User-Agent": UA },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!Deno.env.get("GHL_TOKEN")) return j({ ok: false, erro: "sem GHL_TOKEN" });
    const key = srvKey();
    if (!key) return j({ ok: false, erro: "sem chave de servico (SRV_JWT)" });
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, key);
    const b = await req.json().catch(() => ({}));
    const seco = b.seco === true;
    const limite = Math.max(1, Math.min(400, Number(b.limite) || 200));

    const { data: camp } = await sb.from("campanhas").select("filtros_padrao").eq("codigo", "nitronconecta").maybeSingle();
    const fp: any = camp?.filtros_padrao || {};
    const PIPE = fp.conecta_pipeline_id;
    const ETAPAS: Record<string, string> = fp.conecta_etapas || {};
    const ETAPA_CONVITE = ETAPAS.convite;
    if (!PIPE || !ETAPA_CONVITE) return j({ ok: false, erro: "pipeline ou etapa 'convite' nao cadastrada em filtros_padrao" });

    // So a PRIMEIRA etapa. Quem avancou se inscreveu e fica.
    const r = await ghl("GET", `/opportunities/search?location_id=${LOC}&pipeline_id=${PIPE}&pipeline_stage_id=${ETAPA_CONVITE}&status=all&limit=100`);
    if (!r.ok) return j({ ok: false, erro: `busca ${r.status}: ${(await r.text()).slice(0, 200)}` });
    const d = await r.json().catch(() => ({}));
    const todos: any[] = d?.opportunities || [];
    const total_na_etapa = d?.meta?.total ?? todos.length;
    if (seco) {
      return j({ ok: true, seco: true, etapa: "convite", total_na_etapa,
        amostra: todos.slice(0, 5).map((o: any) => ({ id: o.id, nome: o.name })) });
    }

    let apagados = 0; const falhas: any[] = [];
    for (const op of todos.slice(0, limite)) {
      const del = await ghl("DELETE", `/opportunities/${op.id}`);
      if (del.ok) {
        apagados++;
        await sb.from("conecta_oportunidade").delete().eq("oportunidade", op.id);
      } else {
        falhas.push({ id: op.id, status: del.status });
      }
    }
    // o que sobrou na etapa depois desta passada
    const r2 = await ghl("GET", `/opportunities/search?location_id=${LOC}&pipeline_id=${PIPE}&pipeline_stage_id=${ETAPA_CONVITE}&status=all&limit=1`);
    const d2 = r2.ok ? await r2.json().catch(() => ({})) : {};
    const restam = d2?.meta?.total ?? null;

    return j({ ok: true, apagados, falhas: falhas.length ? falhas.slice(0, 10) : undefined,
      restam_na_etapa_convite: restam,
      nota: restam ? "chame de novo para continuar" : "etapa 'Convite enviado' zerada; cards que avancaram foram preservados" });
  } catch (e) {
    return j({ ok: false, erro: String((e as Error).message || e) });
  }
});
