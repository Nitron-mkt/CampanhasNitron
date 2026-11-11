// conecta-pipeline (v5) — move o lead do NITRON CONECTA no pipeline do CRM (09/11/2026).
//
// Pipeline "Nitron Conecta" no GHL, com as 4 etapas que o gestor criou:
//   convite -> formulario -> confirmado -> compareceu
// Os ids moram em campanhas.filtros_padrao (conecta_pipeline_id / conecta_etapas / conecta_etapa_ordem),
// nao em constante: renomear ou reordenar etapa no CRM nao exige deploy.
//
// REGRA CENTRAL: NUNCA ANDA PARA TRAS.
// Quem ja esta em "Formulario preenchido" e recebe um segundo convite nao volta para "Convite
// enviado". A funcao compara a POSICAO da etapa atual com a de destino e so avanca. Sem isso, um
// reenvio de lote desfaria em silencio o trabalho de quem ja respondeu — e ninguem veria, porque o
// GHL nao guarda historico de etapa de oportunidade.
//
// Por isso tambem TODA movimentacao e gravada em conecta_crm_log ANTES de responder, com a etapa de
// origem. E a mesma licao do rep_dono_log de 19/10: sem log nao ha marcha a re.
//
// v2: /opportunities/search quer os filtros em SNAKE_CASE (pipeline_id, contact_id). Com camelCase a
// API devolve 422 "property pipelineId should not exist", e a busca nunca achava nada.
//
// v3: A BUSCA DO GHL E INDEXADA e NAO devolve oportunidade recem-criada. Provado em 09/11: o convite
// criou a oportunidade e, no mesmo minuto, a busca pelo MESMO contact_id voltou vazia — entao o
// formulario criou uma SEGUNDA oportunidade em vez de mover a primeira, e a mesma empresa ficou com
// dois cards. Como o formulario pode ser respondido minutos depois do convite, esperar o indice nao
// e opcao: o vinculo empresa -> oportunidade passou a ser gravado em conecta_oportunidade na criacao,
// e a busca do GHL virou plano B, so para quem ainda nao tem vinculo.
// Tambem passou a escolher o contato de forma DETERMINISTICA (menor ghl_id): um codparc pode ter
// varios contatos no CRM (o 15 tem 3) e "o primeiro que vier" muda de uma chamada para outra.
//
// v5: O ID DO CONTATO PODE VIR COM SUFIXO. ghl_contato.ghl_id guarda, em 91 das 7.081 linhas, a
// chave composta "<id>#r<codparc>" ou "<id>#biz<codparc>" — e o mesmo contato do CRM servindo mais
// de uma loja, com o sufixo so para a linha ser unica por codparc. A funcao mandava a chave inteira
// como contactId e o GHL recusava com 400 na criacao da oportunidade. Medido no lote de 11/11:
// 3 clientes de 702. Agora corta tudo a partir do "#".
//
// POST { acao: "convite"|"formulario"|"confirmado"|"compareceu",
//        alvos: [ { codparc?, codvend?, fone?, email?, nome? } ],
//        seco?: true }
//
// Erro volta como HTTP 200 com ok:false (convencao do painel: postJSON descarta o corpo fora de 2xx).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const API = "https://services.leadconnectorhq.com";
const LOC = "rZ8y7lzqV7fzxsartaX2";
const UA = "Mozilla/5.0 (compatible; NitronCampanhas/1.0)";
const digits = (s: any) => String(s || "").replace(/\D/g, "");
const nf = (s: any) => digits(s).replace(/^0+/, "").replace(/^55/, "");
const e164 = (s: any) => { const d = digits(s); return !d ? "" : (d.length <= 11 ? "+55" + d : "+" + d); };

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
    if (req.method === "POST") body = await req.json().catch(() => ({}));
    const seco = url.searchParams.get("seco") === "1" || body.seco === true;
    const acao = String(body.acao || url.searchParams.get("acao") || "convite");
    const alvos: any[] = Array.isArray(body.alvos) ? body.alvos : [];
    if (!alvos.length) return j({ ok: false, erro: "sem alvos" });

    // --- parametros do pipeline, do banco
    const { data: camp } = await sb.from("campanhas").select("filtros_padrao").eq("codigo", "nitronconecta").maybeSingle();
    const fp: any = camp?.filtros_padrao || {};
    const PIPE = fp.conecta_pipeline_id;
    const ETAPAS: Record<string, string> = fp.conecta_etapas || {};
    const ORDEM: string[] = fp.conecta_etapa_ordem || ["convite", "formulario", "confirmado", "compareceu"];
    if (!PIPE || !ETAPAS[acao]) return j({ ok: false, erro: `pipeline ou etapa "${acao}" nao cadastrada em filtros_padrao` });
    const destinoId = ETAPAS[acao];
    const destinoPos = ORDEM.indexOf(acao);
    // id da etapa -> posicao, para saber se a oportunidade ja esta adiante
    const posDe: Record<string, number> = {};
    ORDEM.forEach((k, i) => { if (ETAPAS[k]) posDe[ETAPAS[k]] = i; });

    // --- contato no GHL: primeiro pelo codparc (ghl_contato), senao pelo telefone
    const codparcs = alvos.map((a) => a.codparc).filter((x) => x != null);
    const porCodparc = new Map<string, any>();
    if (codparcs.length) {
      const { data } = await sb.from("ghl_contato").select("ghl_id,codparc,nome,fone").in("codparc", codparcs).order("ghl_id", { ascending: true });
      (data || []).forEach((c: any) => { if (!porCodparc.has(String(c.codparc))) porCodparc.set(String(c.codparc), c); });
    }

    // --- vinculos que ja conhecemos (fonte primaria, antes da busca do GHL)
    const chaveDe = (a: any) => (a.codparc != null ? "c:" + a.codparc : "r:" + a.codvend);
    const chaves = alvos.map(chaveDe);
    const vinculo = new Map<string, any>();
    {
      const { data } = await sb.from("conecta_oportunidade").select("*").in("chave", chaves);
      (data || []).forEach((v: any) => vinculo.set(v.chave, v));
    }

    const res: any[] = [];
    const logs: any[] = [];
    let criados = 0, movidos = 0, ja_adiante = 0, sem_contato = 0, falhas = 0;

    for (const a of alvos) {
      const nome = String(a.nome || "").trim() || ("codparc " + a.codparc);
      const base = { acao, publico: a.codvend != null && a.codparc == null ? "rep" : "cliente", codparc: a.codparc ?? null, codvend: a.codvend ?? null, nome };

      // 1. achar o contato
      let cid: string | null = null;
      const porCp = a.codparc != null ? porCodparc.get(String(a.codparc)) : null;
      // ghl_contato.ghl_id as vezes guarda uma CHAVE COMPOSTA, "<id>#r<codparc>" / "<id>#biz<codparc>":
      // sao 91 linhas de 7.081, um mesmo contato do CRM que atende varias lojas, e o sufixo existe
      // so para a linha ficar unica por codparc. Mandar isso cru para o GHL da 400 na criacao da
      // oportunidade. Achado em 11/11 no lote do Conecta (F. I. REPRESENTACOES, THIEGO, CAVANNA).
      if (porCp?.ghl_id) cid = String(porCp.ghl_id).split("#")[0];
      if (!cid && a.contact_id) cid = String(a.contact_id);
      // Busca por telefone: o cadastro guarda o numero em formatos diferentes (+5511..., 5511...,
      // 11...), entao tentar UM formato so devolve vazio e o alvo vira "sem_contato" sem motivo.
      // Achado no teste de ponta a ponta de 09/11: o contato do gestor existe, com o telefone certo,
      // e `contains_set` com o numero sem o 55 nao achou nada. Agora tenta as variantes, na ordem
      // mais provavel, e para na primeira que achar.
      if (!cid && a.fone && nf(a.fone).length >= 10) {
        const d = nf(a.fone);
        const variantes = [e164(a.fone), "55" + d, d];
        for (const v of variantes) {
          if (cid) break;
          const s1 = await ghl(tok, "POST", "/contacts/search", { locationId: LOC, pageLimit: 1, filters: [{ field: "phone", operator: "contains_set", value: [v] }] });
          cid = s1.body?.contacts?.[0]?.id || null;
        }
        // ultimo recurso: a busca simples por texto, que e a que o campanhas-enviar usa ha meses
        if (!cid) {
          const s2 = await ghl(tok, "GET", `/contacts/?locationId=${LOC}&query=${encodeURIComponent(e164(a.fone))}&limit=1`);
          cid = s2.body?.contacts?.[0]?.id || null;
        }
      }
      if (!cid) {
        sem_contato++;
        res.push({ ...base, resultado: "sem_contato" });
        logs.push({ ...base, resultado: "sem_contato", detalhe: "contato nao encontrado no CRM" });
        continue;
      }

      // 2. achar a oportunidade. PRIMEIRO o vinculo que gravamos (a busca do GHL tem atraso de
      //    indice e nao devolve o que acabou de ser criado); so depois a busca, como plano B.
      let op: any = null;
      const v = vinculo.get(chaveDe(a));
      if (v?.oportunidade) {
        const g = await ghl(tok, "GET", `/opportunities/${v.oportunidade}`);
        if (g.ok) op = g.body?.opportunity || g.body || null;
        // oportunidade apagada no CRM: o vinculo esta velho, cai para a busca/criacao
        if (g.status === 404) { await sb.from("conecta_oportunidade").delete().eq("chave", chaveDe(a)); }
      }
      if (!op) {
        const q = await ghl(tok, "GET", `/opportunities/search?location_id=${LOC}&pipeline_id=${PIPE}&contact_id=${cid}&status=all&limit=20`);
        if (!q.ok) {
          falhas++;
          res.push({ ...base, contato_ghl: cid, resultado: "falha", detalhe: `busca ${q.status}: ${q.texto}` });
          logs.push({ ...base, contato_ghl: cid, resultado: "falha", detalhe: `busca ${q.status}` });
          continue;
        }
        op = (q.body?.opportunities || [])[0] || null;
      }

      // 3. criar ou avancar — NUNCA voltar
      if (!op) {
        if (seco) { res.push({ ...base, contato_ghl: cid, resultado: "criaria" }); continue; }
        const c = await ghl(tok, "POST", "/opportunities/", {
          pipelineId: PIPE, locationId: LOC, name: nome, pipelineStageId: destinoId,
          status: "open", contactId: cid, monetaryValue: 0,
        });
        if (!c.ok) {
          falhas++;
          res.push({ ...base, contato_ghl: cid, resultado: "falha", detalhe: `criar ${c.status}: ${c.texto}` });
          logs.push({ ...base, contato_ghl: cid, resultado: "falha", detalhe: `criar ${c.status}` });
          continue;
        }
        criados++;
        const oid = c.body?.opportunity?.id || c.body?.id || null;
        if (oid) {
          await sb.from("conecta_oportunidade").upsert({
            chave: chaveDe(a), codparc: a.codparc ?? null, codvend: a.codvend ?? null,
            oportunidade: oid, contato_ghl: cid, nome, atualizado: new Date().toISOString(),
          }, { onConflict: "chave" });
        }
        res.push({ ...base, contato_ghl: cid, oportunidade: oid, resultado: "criado", etapa_depois: acao });
        logs.push({ ...base, contato_ghl: cid, oportunidade: oid, resultado: "criado", etapa_antes: null, etapa_depois: acao });
        continue;
      }

      if (!v && op?.id) {
        await sb.from("conecta_oportunidade").upsert({
          chave: chaveDe(a), codparc: a.codparc ?? null, codvend: a.codvend ?? null,
          oportunidade: op.id, contato_ghl: cid, nome, atualizado: new Date().toISOString(),
        }, { onConflict: "chave" });
      }
      const atualPos = posDe[op.pipelineStageId];
      const atualNome = ORDEM[atualPos] ?? "(etapa fora da ordem cadastrada)";
      if (atualPos != null && atualPos >= destinoPos) {
        // JA ESTA ADIANTE (ou na mesma etapa): nao mexe. Reenviar convite para quem ja respondeu o
        // formulario nao pode puxar o lead de volta para a primeira coluna.
        ja_adiante++;
        res.push({ ...base, contato_ghl: cid, oportunidade: op.id, resultado: "ja_adiante", etapa_antes: atualNome });
        continue;
      }
      if (seco) { res.push({ ...base, contato_ghl: cid, oportunidade: op.id, resultado: "moveria", etapa_antes: atualNome, etapa_depois: acao }); continue; }
      const u = await ghl(tok, "PUT", `/opportunities/${op.id}`, { pipelineId: PIPE, pipelineStageId: destinoId, status: "open" });
      if (!u.ok) {
        falhas++;
        res.push({ ...base, contato_ghl: cid, oportunidade: op.id, resultado: "falha", detalhe: `mover ${u.status}: ${u.texto}` });
        logs.push({ ...base, contato_ghl: cid, oportunidade: op.id, resultado: "falha", detalhe: `mover ${u.status}` });
        continue;
      }
      movidos++;
      res.push({ ...base, contato_ghl: cid, oportunidade: op.id, resultado: "movido", etapa_antes: atualNome, etapa_depois: acao });
      logs.push({ ...base, contato_ghl: cid, oportunidade: op.id, resultado: "movido", etapa_antes: atualNome, etapa_depois: acao });
    }

    if (logs.length && !seco) await sb.from("conecta_crm_log").insert(logs);

    return j({ ok: true, seco, acao, total: alvos.length, criados, movidos, ja_adiante, sem_contato, falhas, itens: res });
  } catch (e) {
    return j({ ok: false, erro: String((e as Error).message || e) });
  }
});
