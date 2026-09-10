// copiloto-voz-tool (v1) — EXECUTOR de ferramentas p/ a arquitetura NATIVA da voz. A Vapi roda a IA nativamente (streaming = fluido) e chama ESTA funcao SO quando precisa consultar o Sankhya. Formato de tool-call da Vapi (toolCallList -> results). Reaproveita skExec/runTool exatos da copiloto-voz.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-vapi-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const digits = (s: any) => String(s || "").replace(/\D/g, "");
const norm = (s: any) => String(s || "").toLowerCase().trim();
let SK: any = null;
async function skLogin() { const base = (Deno.env.get("SANKHYA_URL") || "").replace(/\/$/, ""); const u = Deno.env.get("SANKHYA_USER"); const p = Deno.env.get("SANKHYA_PASS"); if (!base || !u || !p) throw new Error("sem credenciais sankhya"); const r = await fetch(`${base}/mge/service.sbr?serviceName=MobileLoginSP.login&outputType=json`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceName: "MobileLoginSP.login", requestBody: { NOMUSU: { $: u }, INTERNO: { $: p }, KEEPCONNECTED: { $: "true" } } }) }); const d = JSON.parse(new TextDecoder("iso-8859-1").decode(await r.arrayBuffer())); const s = d?.responseBody?.jsessionid?.$ ?? d?.responseBody?.jsessionid ?? ""; if (!s) throw new Error("login sankhya falhou"); return { base, jsession: String(s), cookie: `JSESSIONID=${s}` }; }
async function skExec(sql: string): Promise<{ fields: string[]; rows: any[][]; erro: string | null }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (!SK) SK = await skLogin();
      const url = `${SK.base}/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json&mgeSession=${encodeURIComponent(SK.jsession)}`;
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Cookie: SK.cookie }, body: JSON.stringify({ serviceName: "DbExplorerSP.executeQuery", requestBody: { sql } }) });
      const d = JSON.parse(new TextDecoder("iso-8859-1").decode(await r.arrayBuffer()));
      const ok = String(d?.status ?? "1") === "1";
      if (!ok) { const msg = String(d?.statusMessage || "erro sankhya"); if (attempt === 0 && /sess|login|autoriz|expir/i.test(msg)) { SK = null; continue; } return { fields: [], rows: [], erro: msg.slice(0, 200) }; }
      const fm = d?.responseBody?.fieldsMetadata || d?.responseBody?.fields || []; const fields = (fm as any[]).map((f) => f?.name || f?.descricao || f?.field || "");
      const rows = (d?.responseBody?.rows || []) as any[][];
      return { fields, rows, erro: null };
    } catch (e) { if (attempt === 0) { SK = null; continue; } return { fields: [], rows: [], erro: String(e).slice(0, 200) }; }
  }
  return { fields: [], rows: [], erro: "falha sankhya" };
}
const SK_BLOQ_TAB = /(\b|\.)(TFP\w*|TRH\w*|TSIUSU\w*|TPR\w*|TCB\w*|TGFFIN|TGFCX\w*|TGFCTB\w*|TCTB\w*|TSICUS\w*)(\b)/i;
const SK_BLOQ_KW = /(salario|sal[a]?rios|folha de pagamento|holerite|contracheque|contra-cheque|apontament|ordem de produ|conta[s]? a pagar|contas a pagar|fluxo de caixa|movimenta\w* financeir|tesouraria)/i;
function checarSql(sql: any): { ok: boolean; sql?: string; motivo?: string } {
  let s = String(sql || "").trim().replace(/;+\s*$/, "");
  if (!/^select\b/i.test(s)) return { ok: false, motivo: "apenas UM SELECT de leitura" };
  if (/\b(insert|update|delete|drop|alter|truncate|merge|create|grant|revoke|begin|declare|execute|exec|call)\b/i.test(s)) return { ok: false, motivo: "comando de escrita bloqueado" };
  if (SK_BLOQ_TAB.test(s) || SK_BLOQ_KW.test(s)) return { ok: false, motivo: "RESTRITO: sem RH/folha/salarios, funcionarios, producao/apontamentos, pagamentos/tesouraria. Para boleto use boleto_cliente. So dados comerciais." };
  if (!/rownum/i.test(s) && !/fetch\s+first/i.test(s)) s = `SELECT * FROM (${s}) WHERE ROWNUM <= 20`;
  return { ok: true, sql: s };
}
async function runTool(sb: any, name: string, input: any): Promise<any> {
  try {
    if (name === "buscar_cliente") { const termo = String(input?.termo || "").trim(); const dig = digits(termo); const soDig = dig === termo.replace(/\s/g, ""); let q = sb.from("ghl_cliente").select("codparc, razao, cnpj, ticket, dias, situacao, canal, ramo, mix, compra_linhas, saldo_entregar, titulos_vencidos, crosssell, clube_saldo_pedir").limit(5); if (dig.length >= 11) q = q.ilike("cnpj", "%" + dig + "%"); else if (soDig && dig.length >= 2 && dig.length <= 7) q = q.eq("codparc", parseInt(dig)); else q = q.ilike("razao", "%" + termo + "%"); const { data } = await q; if (!data || !data.length) return { encontrados: 0, aviso: "nada no espelho; tente pedido_cliente/consultar_sankhya" }; return { encontrados: data.length, clientes: data }; }
    if (name === "pedido_cliente") { const cod = parseInt(input?.codparc); if (!cod) return { erro: "codparc invalido" }; const sql = `SELECT * FROM (SELECT CAB.NUNOTA, TO_CHAR(CAB.DTNEG,'DD/MM/YYYY') DATA, CAB.TIPMOV, CAB.STATUSNOTA, CAB.VLRNOTA, (SELECT MAX(T.DESCRTIPVENDA) FROM TGFTPV T WHERE T.CODTIPVENDA=CAB.CODTIPVENDA) TIPO_NEG FROM TGFCAB CAB WHERE CAB.CODPARC=${cod} AND CAB.TIPMOV IN ('P','V') ORDER BY CAB.DTNEG DESC, CAB.NUNOTA DESC) WHERE ROWNUM<=6`; const { rows, erro } = await skExec(sql); if (erro) return { erro }; if (!rows.length) return { encontrados: 0, aviso: "sem pedidos" }; const st = (s: any) => ({ A: "em aberto", L: "faturado", C: "cancelado" } as any)[s] || s; const tp = (t: any) => t === "V" ? "nota faturada" : t === "D" ? "devolucao" : "pedido"; const lista = rows.map((r) => ({ nunota: r[0], data: r[1], tipo: tp(r[2]), status: st(r[3]), valor: r[4], prazo_pagamento: r[5] })); const real = lista.find((x) => !/bonific|credito|cortesia|brinde/i.test(String(x.prazo_pagamento || ""))); return { ultimo: lista[0], ultimo_pedido_com_prazo: real || null, pedidos: lista }; }
    if (name === "boleto_cliente") { const cod = parseInt(input?.codparc); if (!cod) return { erro: "codparc invalido" }; const sql = `SELECT * FROM (SELECT NUFIN, NUNOTA, TO_CHAR(DTVENC,'DD/MM/YYYY') VENC, VLRDESDOB, NOSSONUM, LINHADIGITAVEL, CODBCO, CASE WHEN TRUNC(DTVENC) < TRUNC(SYSDATE) THEN 'vencido' ELSE 'a_vencer' END SITUACAO FROM TGFFIN WHERE CODPARC=${cod} AND RECDESP=1 AND PROVISAO='N' AND DHBAIXA IS NULL ORDER BY DTVENC) WHERE ROWNUM<=15`; const { rows, erro } = await skExec(sql); if (erro) return { erro }; if (!rows.length) return { encontrados: 0, vencidos: 0, a_vencer: 0, aviso: "sem titulo a receber em aberto (nada vencido, nada a vencer)" }; const lista = rows.map((r) => ({ nufin: r[0], nunota: r[1], vencimento: r[2], valor: r[3], nosso_numero: r[4], linha_digitavel: r[5] || null, banco: r[6], situacao: r[7], boleto_emitido: !!r[5] })); const venc = lista.filter((x) => x.situacao === "vencido").length; const semb = lista.filter((x) => !x.linha_digitavel).length; return { encontrados: lista.length, vencidos: venc, a_vencer: lista.length - venc, titulos: lista, obs: (venc ? (venc + " vencido(s). ") : "NENHUM vencido - a_vencer e normal. ") + (semb ? (semb + " sem linha digitavel = boleto nao emitido, financeiro. ") : "") + "Cada titulo traz o NUNOTA." }; }
    if (name === "consultar_conhecimento") { const termo = String(input?.termo || "").trim(); if (!termo) return { erro: "termo vazio" }; const { data, error } = await sb.rpc("buscar_conhecimento", { q: termo }); if (error) return { erro: error.message }; if (!data || !data.length) return { encontrados: 0, aviso: "nada na base p/ '" + termo + "'" }; return { encontrados: data.length, conhecimento: (data as any[]).map((d) => ({ sistema: d.sistema, topico: d.topico, titulo: d.titulo, texto: String(d.conteudo).slice(0, 2000) })) }; }
    if (name === "saldos_cliente") { const cod = parseInt(input?.codparc); if (!cod) return { erro: "codparc invalido" }; const { data } = await sb.from("saldo_pedido").select("nunota, valorpend, pct_atend").eq("codparc", cod).gte("valorpend", 1000).order("valorpend", { ascending: false }).limit(20); const total = (data || []).reduce((a: number, bb: any) => a + (Number(bb.valorpend) || 0), 0); return { codparc: cod, qtd: (data || []).length, total_saldo: Math.round(total) }; }
    if (name === "cobranca_cliente") { const cod = parseInt(input?.codparc); if (!cod) return { erro: "codparc invalido" }; const { data } = await sb.from("cobranca_cliente").select("valor_vencido, maior_atraso, n_titulos").eq("codparc", cod).maybeSingle(); if (!data) return { codparc: cod, vencido: false, aviso: "sem titulo vencido" }; return { codparc: cod, vencido: true, ...data }; }
    if (name === "consultar_sankhya") { const c = checarSql(input?.sql); if (!c.ok) return { erro: c.motivo, restrito: true }; const { fields, rows, erro } = await skExec(c.sql!); if (erro) return { erro }; const objs = rows.slice(0, 20).map((r) => { const o: any = {}; fields.forEach((f, i) => o[f || ("c" + i)] = r[i]); return o; }); return { colunas: fields, qtd: objs.length, linhas: objs }; }
    if (name === "preco_produto") {
      const cod = parseInt(input?.codparc || ""); const prod = String(input?.produto || input?.termo || "").trim();
      if (!cod) return { erro: "preciso do codparc do cliente p/ saber a tabela dele" }; if (!prod) return { erro: "qual produto?" };
      const dig = prod.replace(/\D/g, ""); const ehCod = !!dig && dig === prod.replace(/\s/g, "") && dig.length <= 6;
      const filtro = ehCod ? `P.CODPROD=${parseInt(dig)}` : `UPPER(P.DESCRPROD) LIKE UPPER('%${prod.replace(/'/g, "''")}%')`;
      const sql = `SELECT * FROM (SELECT P.CODPROD, SUBSTR(P.DESCRPROD,1,50) PROD, E.VLRVENDA, T.CODTAB, T.NOMEPARC FROM (SELECT CODPARC, NOMEPARC, CODTAB FROM TGFPAR WHERE CODPARC=${cod}) T JOIN TGFEXC E ON E.NUTAB=T.CODTAB JOIN TGFPRO P ON P.CODPROD=E.CODPROD WHERE P.ATIVO='S' AND E.VLRVENDA>0 AND ${filtro} ORDER BY P.DESCRPROD) WHERE ROWNUM<=15`;
      const { fields, rows, erro } = await skExec(sql); if (erro) return { erro };
      if (!rows.length) return { encontrados: 0, aviso: "sem preco na tabela do cliente p/ '" + prod + "'" };
      const ix = (n: string) => fields.indexOf(n); const itens = rows.map((r) => ({ codprod: r[ix("CODPROD")], produto: r[ix("PROD")], preco: Number(r[ix("VLRVENDA")]), tabela: r[ix("CODTAB")] }));
      return { cliente_codparc: cod, cliente: rows[0][ix("NOMEPARC")], tabela_do_cliente: itens[0].tabela, ao_vivo: true, itens };
    }
    if (name === "credito_cliente") {
      const cod = parseInt(input?.codparc || ""); if (!cod) return { erro: "codparc invalido" };
      const sql = `SELECT PAR.NOMEPARC, PAR.LIMCRED, PAR.BLOQUEAR, PAR.MOTBLOQ, NVL((SELECT SUM(F.VLRDESDOB) FROM TGFFIN F WHERE F.CODPARC=PAR.CODPARC AND F.RECDESP=1 AND F.PROVISAO='N' AND F.DHBAIXA IS NULL),0) ABERTO, NVL((SELECT SUM(F.VLRDESDOB) FROM TGFFIN F WHERE F.CODPARC=PAR.CODPARC AND F.RECDESP=1 AND F.PROVISAO='N' AND F.DHBAIXA IS NULL AND TRUNC(F.DTVENC)<TRUNC(SYSDATE)),0) VENCIDO FROM TGFPAR PAR WHERE PAR.CODPARC=${cod}`;
      const { fields, rows, erro } = await skExec(sql); if (erro) return { erro }; if (!rows.length) return { erro: "cliente nao encontrado" };
      const o: any = {}; fields.forEach((f, i) => o[f] = rows[0][i]);
      const lim = Number(o.LIMCRED || 0), aberto = Math.round(Number(o.ABERTO || 0)), venc = Math.round(Number(o.VENCIDO || 0)); const bloq = String(o.BLOQUEAR || "N") === "S"; const disp = Math.round(lim - aberto); const pode = !bloq && venc === 0 && disp >= 0;
      return { codparc: cod, cliente: o.NOMEPARC, ao_vivo: true, bloqueado: bloq, motivo_bloqueio: bloq ? (o.MOTBLOQ || "sem motivo") : null, limite_credito: Math.round(lim), saldo_em_aberto: aberto, valor_vencido: venc, credito_disponivel: disp, pode_comprar: pode, obs: bloq ? "BLOQUEADO - nao vender" : venc > 0 ? ("TEM R$ " + venc + " vencido - regularizar antes") : disp < 0 ? "estourou o limite" : "liberado dentro do limite" };
    }
    if (name === "estoque_produto") {
      const prod = String(input?.produto || input?.termo || "").trim(); if (!prod) return { erro: "qual produto?" };
      const dig = prod.replace(/\D/g, ""); const ehCod = !!dig && dig === prod.replace(/\s/g, "") && dig.length <= 6;
      const filtro = ehCod ? `P.CODPROD=${parseInt(dig)}` : `UPPER(P.DESCRPROD) LIKE UPPER('%${prod.replace(/'/g, "''")}%')`;
      const sql = `SELECT * FROM (SELECT P.CODPROD, SUBSTR(P.DESCRPROD,1,50) PROD, NVL(SUM(E.ESTOQUE-E.RESERVADO),0) DISP FROM TGFPRO P LEFT JOIN TGFEST E ON E.CODPROD=P.CODPROD AND E.TIPO='P' WHERE P.ATIVO='S' AND ${filtro} GROUP BY P.CODPROD, P.DESCRPROD ORDER BY P.DESCRPROD) WHERE ROWNUM<=15`;
      const { fields, rows, erro } = await skExec(sql); if (erro) return { erro }; if (!rows.length) return { encontrados: 0, aviso: "produto nao encontrado" };
      const ix = (n: string) => fields.indexOf(n); const itens = rows.map((r) => { const d = Math.floor(Number(r[ix("DISP")]) || 0); return { codprod: r[ix("CODPROD")], produto: r[ix("PROD")], disponivel: d, tem: d > 0 }; });
      return { ao_vivo: true, itens, obs: "disponivel = estoque proprio menos reservado. 0 ou negativo = NAO prometer." };
    }
    if (name === "entrega_cliente") {
      const cod = parseInt(input?.codparc || ""); const nun = parseInt(input?.nunota || ""); if (!cod && !nun) return { erro: "preciso do codparc ou do nunota" };
      const w = nun ? `V.NUNOTA=${nun}` : `V.CODPARC=${cod}`;
      const sql = `SELECT * FROM (SELECT V.NUNOTA, SUBSTR(V.NOMEPARC,1,32) CLIENTE, V.STATUSPEDIDO, V.DIAS, TO_CHAR(V.DTPREVENT,'DD/MM/YYYY') PREVENT, V.NOME_TRANSPORTADORA, ROUND(V.VLRSALDO) VLRSALDO, V.NECESSITA_AGEND, V.AGENDAMENTO_DESC, TO_CHAR(AG.NOVADATA,'DD/MM/YYYY') AGENDADA, AG.STATUS AGSTATUS FROM VW_PEDIDOS_ENTREGAR V LEFT JOIN AD_TSIAGENENT AG ON AG.NUNOTA=V.NUNOTA WHERE ${w} ORDER BY V.NUNOTA DESC) WHERE ROWNUM<=10`;
      const { fields, rows, erro } = await skExec(sql); if (erro) return { erro }; if (!rows.length) return { encontrados: 0, aviso: "nada na fila de entrega p/ esse " + (nun ? "pedido" : "cliente") };
      const itens = rows.map((r) => { const o: any = {}; fields.forEach((f, i) => o[f] = r[i]); return o; });
      return { ao_vivo: true, qtd: itens.length, entregas: itens };
    }
    return { erro: "ferramenta desconhecida: " + name };
  } catch (e) { return { erro: String(e) }; }
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SRV_JWT") || SRK);
    const b = await req.json().catch(() => ({}));
    const msg = (b && b.message) ? b.message : b;
    const calls = msg?.toolCallList || msg?.toolCalls || b?.toolCalls || b?.toolCallList || [];
    if (!Array.isArray(calls) || !calls.length) return j({ results: [] });
    const results: any[] = [];
    for (const c of calls) {
      const id = c.id || c.toolCallId || c?.function?.id || "";
      const fn = c.function || c;
      const name = fn.name || c.name;
      let args = fn.arguments ?? fn.parameters ?? c.arguments ?? {};
      if (typeof args === "string") { try { args = JSON.parse(args); } catch (_e) { args = {}; } }
      const out = await runTool(sb, name, args);
      results.push({ toolCallId: id, name, result: typeof out === "string" ? out : JSON.stringify(out).slice(0, 6000) });
    }
    return j({ results });
  } catch (e) { return j({ results: [], error: String(e) }); }
});
