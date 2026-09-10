// copiloto-voz (v22) — A/B HAIKU vs SONNET: discar escolhe o assistente por cliente (voz_fila.modelo='sonnet' usa cfg.assistant_id_sonnet, senao o padrao Haiku), passa modelo na metadata, e tratarRetorno grava voz_ligacao.modelo p/ comparar. Base v21 — MAQUINA DE LIGACOES E VENDAS: (1) construirFila novo publico = Reativação+Giro vencido+Giro a vencer+vendedor autoatendimento(codvend 67), so c/ telefone, dedup, prioridade Clube+fat (~3178 clientes); (2) CADENCIA em tratarRetorno: numero_errado→morto; nao atendeu→re-agenda +1d (ate 4 tent); interesse/contato→+3d; sem interesse→perdido; senao +7d — "ligar de novo ate vender"; (3) FUNIL: moverFunil poe a oportunidade em Reativacao/Ciclo de Recompra no estagio certo (Em Contato/Perdido); (4) acao=recadencia reativa 'agendado' vencidos, e acao=discar ja roda recadencia antes. Base v20 — ARQUITETURA NATIVA: a Vapi agora roda a IA nativa (Anthropic) + ferramentas via copiloto-voz-tool (fluido). Esta funcao agora serve: (a) DISCADOR (acao=discar) que monta o DOSSIE do cliente (montarDossie Sankhya + memoria360 CRM/GHL) e passa como assistantOverrides.variableValues.contexto -> {{contexto}} no prompt; (b) acao=fila; (c) end-of-call-report (tratarRetorno). O caminho cerebroFala (custom-LLM) fica de reserva. verify_jwt=false p/ o server-webhook da Vapi chegar. Base v19 — REVERT do v18: o streaming manual deixou PIOR (mais lento + respostas curtas demais/burras). Voltou ao cerebroFala nao-stream do v17 (cache por call_id, identificacao so no 1o turno, prompt natural, max_tokens 300). Base v17 — LATENCIA turno: identificacao do numero (resolverPorFone: snap_rep 3000 linhas + contato_enriquecido) e todo o contexto agora rodam SO no 1o turno (dentro do if !system) e ficam no cache; turnos seguintes = so leitura do cache + Anthropic. Base v16 — LATENCIA: prompt de voz enxuto (so skills voz+vendas, nao todas — reduz ~24k p/ ~5k, acelera o modelo em todo turno). Dados seguem vindo das ferramentas ao vivo. Base v15 — LATENCIA: contexto pesado (skills+dossie+memoria GHL) montado 1x por ligacao e cacheado em voz_ctx por call_id (turnos seguintes instantaneos); memoria360 paralelizada (2 conversas). NATURALIDADE: prompt de fala humana (contracoes, reagir, nao ficar mudo). Base v14 — INTELIGENCIA FUNCIONAL na voz: (1) carrega TODAS as skills de negocio; (2) 4 ferramentas funcionais fixas: preco_produto (tabela do cliente), credito_cliente, estoque_produto, entrega_cliente. Resposta na voz continua BREVE (Haiku rapido). Preco: rep pode ouvir; cliente final evita. Base v12 (chave SRV_JWT).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-vapi-secret", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const MODELO = "claude-haiku-4-5-20251001";
const GHL = (Deno.env.get("GHL_TOKEN") || "").trim();
const LOC = "rZ8y7lzqV7fzxsartaX2";
const enc = new TextEncoder();
const digits = (s: any) => String(s || "").replace(/\D/g, "");
const norm = (s: any) => String(s || "").toLowerCase().trim();
function sse(obj: unknown) { return enc.encode("data: " + JSON.stringify(obj) + "\n\n"); }
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
function foraHorarioComercial(): boolean { const brt = new Date(Date.now() - 3 * 3600 * 1000); const dow = brt.getUTCDay(); const h = brt.getUTCHours(); if (dow === 0) return true; if (dow === 6) return h < 8 || h >= 13; return h < 8 || h >= 18; }
function pick(o: any, ...ks: string[]): any { for (const k of ks) { const v = o?.[k]; if (v != null && String(v).trim() && String(v).toLowerCase() !== "null") return v; } return null; }
function metaDaReq(b: any): Record<string, any> {
  const c = b?.call || {};
  const cands = [b?.metadata, c?.metadata, b?.assistantOverrides?.variableValues, c?.assistantOverrides?.variableValues, c?.assistantOverrides?.metadata, b?.variableValues, c?.assistant?.metadata];
  const m: Record<string, any> = {};
  for (const src of cands) { if (src && typeof src === "object") for (const [k, v] of Object.entries(src)) if (m[k] == null) m[k] = v; }
  const fone = pick(b, "phoneNumber") || pick(c, "customerNumber") || c?.customer?.number || m.fone || m.telefone || null;
  if (fone && m.fone == null) m.fone = fone;
  return m;
}
async function resolverContactId(sb: any, md: Record<string, any>): Promise<string | null> {
  if (md.contact_id || md.ghl_contact_id) return String(md.contact_id || md.ghl_contact_id);
  const cod = parseInt(md.codparc || ""); if (cod) { try { const { data } = await sb.from("ghl_cliente").select("ghl_id").eq("codparc", cod).maybeSingle(); if (data?.ghl_id) return String(data.ghl_id); } catch (_e) { /* */ } }
  return null;
}
async function resolverPorFone(sb: any, fone: any): Promise<{ codparc?: number; nome_empresa?: string; ehRep?: boolean; repNome?: string; codvend?: number }> {
  const l8 = digits(fone).replace(/^0+/, "").replace(/^55/, "").slice(-8); if (l8.length < 8) return {};
  try { const { data: reps } = await sb.from("snap_rep").select("codvend, rep, celular, fone_parc").limit(3000); const m = (reps || []).find((r: any) => String(digits(r.celular)).slice(-8) === l8 || String(digits(r.fone_parc)).slice(-8) === l8); if (m) return { ehRep: true, repNome: m.rep, codvend: Number(m.codvend) }; } catch (_e) { /* */ }
  try { const { data } = await sb.from("contato_enriquecido").select("codparc, nomeparc, whatsapp").ilike("whatsapp", "%" + l8 + "%").limit(3); if (data && data.length) return { codparc: Number(data[0].codparc), nome_empresa: data[0].nomeparc }; } catch (_e) { /* */ }
  return {};
}
async function memoria360(sb: any, contactId: string | null, codparc: number | null): Promise<string> {
  const blocos: string[] = [];
  if (contactId && GHL) {
    try {
      const s = await fetch(`https://services.leadconnectorhq.com/conversations/search?locationId=${LOC}&contactId=${contactId}&limit=10`, { headers: { Authorization: "Bearer " + GHL, Version: "2021-04-15", Accept: "application/json" } });
      const sd = await s.json().catch(() => ({})); const convs = sd?.conversations || [];
      const linhas: string[] = [];
      const arrs = await Promise.all((Array.isArray(convs) ? convs : []).slice(0, 2).map(async (cv: any) => { try { const m = await fetch(`https://services.leadconnectorhq.com/conversations/${cv.id}/messages?limit=10`, { headers: { Authorization: "Bearer " + GHL, Version: "2021-04-15", Accept: "application/json" } }); const md = await m.json().catch(() => ({})); return md?.messages?.messages || md?.messages || []; } catch (_e) { return []; } }));
      for (const arr of arrs) { for (const x of (Array.isArray(arr) ? arr : [])) { const body = String(x?.body || "").replace(/\n+/g, " ").replace(/Instance Source:.*/i, "").replace(/#contact_instance:\S+/i, "").trim(); if (!body || norm(body) === "ptt") continue; linhas.push((x.direction === "inbound" ? "Contato: " : "Nitron: ") + body.slice(0, 160)); } }
      if (linhas.length) blocos.push("CONVERSAS ANTERIORES NO WHATSAPP (qualquer assistente/canal):\n- " + linhas.slice(-20).join("\n- "));
    } catch (_e) { /* */ }
  }
  if (codparc) { try { const { data } = await sb.from("voz_ligacao").select("interesse, proximo_passo, observacao").eq("codparc", codparc).order("criado", { ascending: false }).limit(3); if (data && data.length) blocos.push("LIGACOES ANTERIORES (voz):\n- " + (data as any[]).map((l) => `(${l.interesse || "-"}) ${l.observacao || l.proximo_passo || ""}`.trim()).join("\n- ")); } catch (_e) { /* */ } }
  if (contactId) { try { const { data } = await sb.from("transcricoes").select("texto, tipo").eq("contact_id", contactId).not("texto", "is", null).order("criado_em", { ascending: false }).limit(4); if (data && data.length) blocos.push("TRANSCRICOES DE AUDIO ANTERIORES:\n- " + (data as any[]).reverse().map((t) => String(t.texto).replace(/\s+/g, " ").slice(0, 250)).join("\n- ")); } catch (_e) { /* */ } }
  return blocos.join("\n\n");
}
async function montarDossie(sb: any, md: Record<string, any>): Promise<{ txt: string; empresa: string; ramo: string; tipo: string }> {
  const tipo = String(md.tipo || "").toLowerCase().includes("prospect") ? "prospect" : (md.tipo ? "adormecido" : "");
  let empresa = String(md.empresa_nome || md.razao || md.nome_empresa || "").trim();
  let ramo = String(md.ramo || "").trim();
  const linhas: string[] = []; const enr: string[] = []; let resumoEmp = "";
  const cod = parseInt(md.codparc || md.cod || "");
  const cnpj = String(md.cnpj || "").replace(/\D/g, "");
  if (cod) {
    try {
      const { data } = await sb.from("contato_enriquecido").select("nomeparc, canal, ramo, praca, dias_sem_compra, ticket_medio, num_compras, classe_abc, situacao, compra_linhas, cross_recomendado, resumo, instagram, website, titulos_vencidos, saldo_entregar, clube_saldo").eq("codparc", cod).maybeSingle();
      if (data) {
        if (!empresa) empresa = String(data.nomeparc || "").trim();
        if (!ramo) ramo = String(data.ramo || "").trim();
        if (data.dias_sem_compra != null) linhas.push(data.dias_sem_compra + " dias sem comprar");
        if (data.situacao) linhas.push("situacao " + data.situacao);
        if (data.canal) linhas.push("canal " + data.canal);
        if (data.praca) linhas.push("praca " + data.praca);
        if (data.ticket_medio) linhas.push("ticket medio ~R$ " + Math.round(Number(data.ticket_medio)));
        if (data.classe_abc) linhas.push("classe " + data.classe_abc);
        if (data.compra_linhas) linhas.push("comprava: " + String(data.compra_linhas).slice(0, 180));
        if (data.cross_recomendado) linhas.push("cross a oferecer: " + String(data.cross_recomendado).slice(0, 140));
        if (data.saldo_entregar && Number(data.saldo_entregar) > 0) linhas.push("tem saldo a entregar R$ " + Math.round(Number(data.saldo_entregar)));
        if (data.clube_saldo && Number(data.clube_saldo) > 0) linhas.push("tem saldo de Clube ja pago");
        if (/[1-9]/.test(String(data.titulos_vencidos || ""))) linhas.push("ATENCAO titulo vencido - nao empurrar venda");
        if (data.instagram) enr.push("Instagram " + data.instagram);
        if (data.website) enr.push("site " + data.website);
        if (data.resumo) resumoEmp = String(data.resumo).slice(0, 500);
      }
    } catch (_e) { /* */ }
  } else if (cnpj.length >= 11) {
    try {
      const { data } = await sb.from("lead").select("razao_social, nome_fantasia, cnae_principal, porte, segmento_ia, canal_provavel, categorias_revendidas, faturamento_presumido, funcionarios_estimados, maps_nota, maps_avaliacoes, dominio, tem_ecommerce, municipio, uf").eq("cnpj", cnpj).maybeSingle();
      if (data) {
        if (!empresa) empresa = String(data.nome_fantasia || data.razao_social || "").trim();
        if (!ramo) ramo = String(data.segmento_ia || data.canal_provavel || "").trim();
        if (data.municipio) linhas.push("em " + data.municipio + "/" + (data.uf || ""));
        if (data.canal_provavel) linhas.push("canal provavel " + data.canal_provavel);
        if (data.categorias_revendidas) linhas.push("revende: " + String(data.categorias_revendidas).slice(0, 160));
        if (data.porte) linhas.push("porte " + data.porte);
        if (data.maps_nota) linhas.push("nota Google " + data.maps_nota + (data.maps_avaliacoes ? " (" + data.maps_avaliacoes + " avaliacoes)" : ""));
        if (data.tem_ecommerce) linhas.push("tem e-commerce");
        if (data.dominio) enr.push("site " + data.dominio);
      }
    } catch (_e) { /* */ }
  }
  const nomeContato = String(md.nome || md.contato || "").trim();
  let txt = "CONTEXTO DO CONTATO: " + (tipo === "prospect" ? "PROSPECT (nunca comprou)" : tipo === "adormecido" ? "CLIENTE ADORMECIDO (reativar)" : tipo === "cliente" ? "CLIENTE" : "contato comercial") + ".";
  if (empresa) txt += " Empresa: " + empresa + ".";
  if (nomeContato) txt += " Pessoa: " + nomeContato + ".";
  if (ramo) txt += " Ramo/segmento: " + ramo + ".";
  if (cod) txt += " codparc: " + cod + ".";
  if (linhas.length) txt += " Dados: " + linhas.join("; ") + ".";
  if (enr.length) txt += " Presenca digital: " + enr.join("; ") + ".";
  if (resumoEmp) txt += " Sobre a empresa: " + resumoEmp;
  txt += " Use o que sabe da empresa e o historico para PERSONALIZAR, mas NAO fique listando dados na ligacao - use como contexto, natural.";
  return { txt, empresa, ramo, tipo };
}
async function catalogoTxt(sb: any): Promise<string> {
  try {
    const { data } = await sb.from("linha_produto").select("linha, qtd_prod_ativos, relevancia, activa, linha_negocio").eq("activa", true);
    const nome = (l: string) => String(l || "").replace(/^Linha\s+/i, "");
    const plast = (data || []).filter((r: any) => String(r.linha_negocio) !== "MADEIRA" && Number(r.qtd_prod_ativos) > 0);
    const carro = plast.filter((r: any) => r.relevancia >= 5).map((r: any) => nome(r.linha));
    const fortes = plast.filter((r: any) => r.relevancia === 4 || r.relevancia === 3).map((r: any) => nome(r.linha));
    let s = "LINHAS (Nitron, utilidades pra casa, principalmente plastico). ";
    if (carro.length) s += "Carro-chefe: " + carro.join(", ") + ". ";
    if (fortes.length) s += "Fortes: " + fortes.join(", ") + ". ";
    s += "Lancamentos: Teca, Mob, Pop. Madeira: Teca (tabuas) e Mob (moveis pinus). NUNCA cite preco na voz.";
    return s;
  } catch (_e) { return ""; }
}
const SANKHYA_HINT = "TABELAS COMERCIAIS (Oracle, ROWNUM p/ limitar): TGFPAR (clientes: CODPARC, RAZAOSOCIAL, CGC_CPF, CODVEND, CODTAB). TGFCAB (pedidos/notas: NUNOTA, CODPARC, DTNEG, DTFATUR, TIPMOV, STATUSNOTA, VLRNOTA, CODTIPVENDA, ORDEMCARGA, CODPARCTRANSP, CHAVENFE). TGFITE (itens). TGFPRO (produtos). TGFEST (estoque). TGFTPV (prazo). AD_TSIAGENENT (agendamento de entrega por NUNOTA: NOVADATA, STATUS, FALOUCOM). Amarrar boleto<->pedido: o NUFIN do boleto (via boleto_cliente) traz o NUNOTA; com o NUNOTA voce puxa TGFCAB/TGFITE/AD_TSIAGENENT. PROIBIDO: RH/folha (TFP*), producao (TPR*), pagamentos (TCB*, TGFFIN - boleto usa boleto_cliente).";
const TOOLS_VOZ = [
  { name: "buscar_cliente", description: "Perfil rapido de cliente (espelho) por codparc/CNPJ/nome.", input_schema: { type: "object", properties: { termo: { type: "string" } }, required: ["termo"] } },
  { name: "pedido_cliente", description: "AO VIVO: ultimos pedidos/notas do cliente (codparc) com data, status, valor e PRAZO DE PAGAMENTO.", input_schema: { type: "object", properties: { codparc: { type: "integer" } }, required: ["codparc"] } },
  { name: "boleto_cliente", description: "AO VIVO: boletos/2a via/titulos a receber em aberto do proprio cliente (codparc) - valor, vencimento, SITUACAO (vencido/a_vencer), NUNOTA (pedido/nota vinculado), linha digitavel, banco. So com o cliente identificado. So chame de 'vencido' se situacao=vencido; a_vencer e normal. Use o NUNOTA p/ achar pedido/nota/entrega via consultar_sankhya. Titulo sem linha digitavel = boleto nao emitido, encaminhar ao financeiro.", input_schema: { type: "object", properties: { codparc: { type: "integer" } }, required: ["codparc"] } },
  { name: "consultar_conhecimento", description: "Base de conhecimento: COMO o Sankhya/GHL/integracao/campanhas funcionam. Passe um assunto.", input_schema: { type: "object", properties: { termo: { type: "string" } }, required: ["termo"] } },
  { name: "saldos_cliente", description: "Saldos (sobra de pedidos) do cliente por codparc.", input_schema: { type: "object", properties: { codparc: { type: "integer" } }, required: ["codparc"] } },
  { name: "cobranca_cliente", description: "Titulos a receber vencidos do cliente por codparc.", input_schema: { type: "object", properties: { codparc: { type: "integer" } }, required: ["codparc"] } },
  { name: "consultar_sankhya", description: "AO VIVO: um SELECT de leitura em tabelas COMERCIAIS (inclui agendamento AD_TSIAGENENT). " + SANKHYA_HINT, input_schema: { type: "object", properties: { sql: { type: "string" } }, required: ["sql"] } },
  { name: "preco_produto", description: "Preco da TABELA do cliente (codparc + produto por nome/codprod) - o preco de atacado que ESSE cliente paga. A inteligencia ja sabe qual tabela aplica a cada um.", input_schema: { type: "object", properties: { codparc: { type: "integer" }, produto: { type: "string" } }, required: ["codparc", "produto"] } },
  { name: "credito_cliente", description: "Credito/bloqueio do cliente (codparc): limite, saldo aberto, vencido, disponivel, se esta bloqueado e se PODE COMPRAR agora.", input_schema: { type: "object", properties: { codparc: { type: "integer" } }, required: ["codparc"] } },
  { name: "estoque_produto", description: "Disponibilidade/estoque de um produto (nome/codprod), ao vivo. Use antes de prometer.", input_schema: { type: "object", properties: { produto: { type: "string" } }, required: ["produto"] } },
  { name: "entrega_cliente", description: "Status e agendamento de entrega por codparc ou nunota: previsao, transportadora, se precisa agendar.", input_schema: { type: "object", properties: { codparc: { type: "integer" }, nunota: { type: "integer" } }, required: [] } },
];
async function runTool(sb: any, name: string, input: any): Promise<any> {
  try {
    if (name === "buscar_cliente") { const termo = String(input?.termo || "").trim(); const dig = digits(termo); const soDig = dig === termo.replace(/\s/g, ""); let q = sb.from("ghl_cliente").select("codparc, razao, cnpj, ticket, dias, situacao, canal, ramo, mix, compra_linhas, saldo_entregar, titulos_vencidos, crosssell, clube_saldo_pedir").limit(5); if (dig.length >= 11) q = q.ilike("cnpj", "%" + dig + "%"); else if (soDig && dig.length >= 2 && dig.length <= 7) q = q.eq("codparc", parseInt(dig)); else q = q.ilike("razao", "%" + termo + "%"); const { data } = await q; if (!data || !data.length) return { encontrados: 0, aviso: "nada no espelho; tente pedido_cliente/consultar_sankhya" }; return { encontrados: data.length, clientes: data }; }
    if (name === "pedido_cliente") { const cod = parseInt(input?.codparc); if (!cod) return { erro: "codparc invalido" }; const sql = `SELECT * FROM (SELECT CAB.NUNOTA, TO_CHAR(CAB.DTNEG,'DD/MM/YYYY') DATA, CAB.TIPMOV, CAB.STATUSNOTA, CAB.VLRNOTA, (SELECT MAX(T.DESCRTIPVENDA) FROM TGFTPV T WHERE T.CODTIPVENDA=CAB.CODTIPVENDA) TIPO_NEG FROM TGFCAB CAB WHERE CAB.CODPARC=${cod} AND CAB.TIPMOV IN ('P','V') ORDER BY CAB.DTNEG DESC, CAB.NUNOTA DESC) WHERE ROWNUM<=6`; const { rows, erro } = await skExec(sql); if (erro) return { erro }; if (!rows.length) return { encontrados: 0, aviso: "sem pedidos" }; const st = (s: any) => ({ A: "em aberto", L: "faturado", C: "cancelado" } as any)[s] || s; const tp = (t: any) => t === "V" ? "nota faturada" : t === "D" ? "devolucao" : "pedido"; const lista = rows.map((r) => ({ nunota: r[0], data: r[1], tipo: tp(r[2]), status: st(r[3]), valor: r[4], prazo_pagamento: r[5] })); const real = lista.find((x) => !/bonific|credito|cortesia|brinde/i.test(String(x.prazo_pagamento || ""))); return { ultimo: lista[0], ultimo_pedido_com_prazo: real || null, pedidos: lista }; }
    if (name === "boleto_cliente") { const cod = parseInt(input?.codparc); if (!cod) return { erro: "codparc invalido" }; const sql = `SELECT * FROM (SELECT NUFIN, NUNOTA, TO_CHAR(DTVENC,'DD/MM/YYYY') VENC, VLRDESDOB, NOSSONUM, LINHADIGITAVEL, CODBCO, CASE WHEN TRUNC(DTVENC) < TRUNC(SYSDATE) THEN 'vencido' ELSE 'a_vencer' END SITUACAO FROM TGFFIN WHERE CODPARC=${cod} AND RECDESP=1 AND PROVISAO='N' AND DHBAIXA IS NULL ORDER BY DTVENC) WHERE ROWNUM<=15`; const { rows, erro } = await skExec(sql); if (erro) return { erro }; if (!rows.length) return { encontrados: 0, vencidos: 0, a_vencer: 0, aviso: "sem titulo a receber em aberto (nada vencido, nada a vencer)" }; const lista = rows.map((r) => ({ nufin: r[0], nunota: r[1], vencimento: r[2], valor: r[3], nosso_numero: r[4], linha_digitavel: r[5] || null, banco: r[6], situacao: r[7], boleto_emitido: !!r[5] })); const venc = lista.filter((x) => x.situacao === "vencido").length; const semb = lista.filter((x) => !x.linha_digitavel).length; return { encontrados: lista.length, vencidos: venc, a_vencer: lista.length - venc, titulos: lista, obs: (venc ? (venc + " vencido(s). ") : "NENHUM vencido - os titulos ainda VAO vencer (a_vencer), e normal, NAO diga que estao vencidos. ") + (semb ? (semb + " sem linha digitavel = boleto nao emitido, encaminhar ao financeiro. ") : "") + "Cada titulo traz o NUNOTA (pedido/nota): use consultar_sankhya p/ pedido/faturamento/entrega, sem pedir numero." }; }
    if (name === "consultar_conhecimento") { const termo = String(input?.termo || "").trim(); if (!termo) return { erro: "termo vazio" }; const { data, error } = await sb.rpc("buscar_conhecimento", { q: termo }); if (error) return { erro: error.message }; if (!data || !data.length) return { encontrados: 0, aviso: "nada na base p/ '" + termo + "'" }; return { encontrados: data.length, conhecimento: (data as any[]).map((d) => ({ sistema: d.sistema, topico: d.topico, titulo: d.titulo, texto: String(d.conteudo).slice(0, 2500) })) }; }
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
      return { cliente_codparc: cod, cliente: rows[0][ix("NOMEPARC")], tabela_do_cliente: itens[0].tabela, ao_vivo: true, itens, obs: "Preco JA e o da TABELA DESSE CLIENTE (atacado). Se vieram varios, confirme qual produto." };
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
      return { ao_vivo: true, qtd: itens.length, entregas: itens, obs: "PREVENT=previsao; AGENDADA=agendamento; NECESSITA_AGEND=precisa agendar. Reflita o status; p/ mudar, encaminhe a logistica." };
    }
    return { erro: "ferramenta desconhecida" };
  } catch (e) { return { erro: String(e) }; }
}
async function cerebroFala(sb: any, system: string, messages: any[]): Promise<string> {
  const key = Deno.env.get("ANTHROPIC_API_KEY"); if (!key) return "Oi, aqui e a Nina do comercial da Nitron, tudo bem?";
  const msgs = [...messages];
  for (let i = 0; i < 4; i++) {
    let d: any = {};
    try { const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: MODELO, max_tokens: 300, temperature: 0.6, system, tools: TOOLS_VOZ, messages: msgs }) }); if (!r.ok) return "Só um instante, deixa eu confirmar aqui."; d = await r.json().catch(() => ({})); } catch (_e) { return "Só um instante."; }
    const blocks = d?.content || []; msgs.push({ role: "assistant", content: blocks });
    const toolUses = blocks.filter((x: any) => x.type === "tool_use");
    if (d?.stop_reason !== "tool_use" || !toolUses.length) { return blocks.filter((x: any) => x.type === "text").map((x: any) => x.text).join(" ").trim() || "Certo."; }
    const results: any[] = [];
    for (const tu of toolUses) { const out = await runTool(sb, tu.name, tu.input); results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out).slice(0, 6000) }); }
    msgs.push({ role: "user", content: results });
  }
  return "Deixa eu confirmar isso certinho e ja te falo.";
}
const SYS_BASE = `Voce e a Nina, do time comercial da Nitronplast (Nitron), numa LIGACAO TELEFONICA (voz). Voce fala; nao escreve. Regras da voz: turnos CURTOS, uma ideia por vez, deixe a pessoa responder, ritmo humano. NUNCA leia link, URL, e-mail soletrado nem lista. Ao pegar um nome ou numero, REPITA para confirmar. Portugues do Brasil, caloroso e natural. Nao diga que e robo/IA; mas nunca minta que e da Nitron. Voce PODE consultar dados AO VIVO com as ferramentas. Para entender COMO algo funciona use consultar_conhecimento. E uma ligacao, seja breve. INTELIGENCIAS FUNCIONAIS (ferramentas prontas): preco_produto (preco da tabela do cliente), credito_cliente (limite/bloqueio/pode comprar), estoque_produto (disponibilidade), entrega_cliente (status/agendamento) - use-as em vez de escrever SQL. PRECO: se falar com o REP/interno, pode dar o preco da tabela do cliente (preco_produto); ao CLIENTE final na voz, evite cotar preco e direcione ao vendedor. NAO acessa RH/salarios/producao/pagamentos.\nVENCIDO x A VENCER: so diga 'vencido' se situacao=vencido. Vencimento futuro = a_vencer = normal.\nVINCULO BOLETO->PEDIDO->NOTA->ENTREGA: todo boleto traz o NUNOTA; use consultar_sankhya (TGFCAB/TGFITE/AD_TSIAGENENT).\nEMPRESA: aqui e a NITRON. Nunca mencione Hyak/Teak/Roga.\nFALE COMO GENTE DE VERDADE (isto e o mais importante): use contracoes naturais (pra, ta, ce, to, num, cade), frases curtas e soltas, comece as vezes com 'oi', 'entao', 'olha', 'deixa eu ver', 'ah sim'. NADA de frase perfeita de robo, nada de listar, nada de repetir o nome da pessoa toda hora (uma vez basta). REAJA ao que a pessoa acabou de falar antes de emendar o seu assunto. Se for consultar algo e demorar 1 segundo, fala 'perai que eu ja vejo aqui' e segue - NUNCA fique muda. Uma frase por vez, tom leve, como uma colega de verdade ligando.\nResponda APENAS com a proxima fala da Nina, curta, natural, sem aspas.`;
function sysInbound(repNome: string | null, empresa: string): string {
  let s = "\n\nMODO INBOUND (a pessoa LIGOU - voce ATENDE): abra RECEPTIVA e curta, 'Nitron, aqui e a Nina, em que posso ajudar?'. Descubra o que precisa e RESOLVA com as ferramentas.";
  if (repNome) s += " O numero e do REPRESENTANTE " + repNome + " - trate como colega interno.";
  else if (empresa) s += " O numero parece ser de: " + empresa + " - seja pessoal.";
  else s += " NAO identifiquei o numero - pergunte com quem fala e de qual empresa. Para dado financeiro confirme o CNPJ.";
  return s;
}
const SYS_OUTBOUND = `\n\nMODO OUTBOUND (VOCE ligou): se e a primeira fala, ABRA com saudacao curta + permissao ('tem um minuto?'). Alvo: reabrir a relacao e CAPTURAR o contato de compras (nome + WhatsApp).`;
async function guardarGravacao(sb: any, url: string | null, callId: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    let vapiKey = Deno.env.get("VAPI_KEY") || "";
    if (!vapiKey) { const { data } = await sb.from("voz_config").select("valor").eq("chave", "vapi_key").maybeSingle(); vapiKey = data?.valor || ""; }
    let resp = await fetch(url);
    if ((resp.status === 401 || resp.status === 403) && vapiKey) resp = await fetch(url, { headers: { Authorization: "Bearer " + vapiKey } });
    if (!resp.ok) return null;
    const buf = new Uint8Array(await resp.arrayBuffer()); if (!buf.length) return null;
    const base = url.split("?")[0]; const ext = (base.match(/\.(wav|mp3|mpeg|ogg|m4a)$/i)?.[1] || "wav").toLowerCase();
    const ct = ext === "mp3" || ext === "mpeg" ? "audio/mpeg" : ext === "ogg" ? "audio/ogg" : ext === "m4a" ? "audio/mp4" : "audio/wav";
    const path = (callId || crypto.randomUUID()) + "." + (ext === "mpeg" ? "mp3" : ext);
    const up = await sb.storage.from("voz-gravacoes").upload(path, buf, { contentType: ct, upsert: true });
    if (up.error) return null;
    return path;
  } catch (_e) { return null; }
}
// MAQUINA DE LIGACOES — funis do GHL (Reativacao + Ciclo de Recompra) e movimentacao da oportunidade.
const FUNIL: any = {
  reativacao: { pipe: "vblAWA4q76yLAoQdeumB", em_contato: "2c477ed8-69cc-49ed-bf47-923f04199017", recuperado: "69708d20-7541-4015-80b5-70b288239b38", perdido: "276a7847-139e-4f1c-bc16-c8e94a53a240" },
  recompra: { pipe: "ZGbdsvosBOIr3iuaA22B", em_contato: "c2f2ef60-7386-45f3-9d5b-f291913d2899", recuperado: "dbb5903e-9153-43b7-9edd-1f0120b210a0", perdido: "00c93be8-f48c-42b5-a2d6-023d8062dcd3" },
};
async function moverFunil(sb: any, codparc: number, resultado: string): Promise<string | null> {
  if (!GHL || !codparc) return null;
  const cid = await resolverContactId(sb, { codparc: String(codparc) });
  if (!cid) return null;
  try {
    const r = await fetch(`https://services.leadconnectorhq.com/opportunities/search?location_id=${LOC}&contact_id=${cid}`, { headers: { Authorization: "Bearer " + GHL, Version: "2021-07-28", Accept: "application/json" } });
    const d = await r.json().catch(() => ({})); const opps = d?.opportunities || [];
    for (const o of (Array.isArray(opps) ? opps : [])) {
      const cfg = o.pipelineId === FUNIL.reativacao.pipe ? FUNIL.reativacao : o.pipelineId === FUNIL.recompra.pipe ? FUNIL.recompra : null;
      if (!cfg) continue; const stage = cfg[resultado]; if (!stage) continue;
      await fetch(`https://services.leadconnectorhq.com/opportunities/${o.id}`, { method: "PUT", headers: { Authorization: "Bearer " + GHL, Version: "2021-07-28", "Content-Type": "application/json" }, body: JSON.stringify({ pipelineId: cfg.pipe, pipelineStageId: stage, status: resultado === "perdido" ? "lost" : "open" }) });
      return o.id;
    }
  } catch (_e) { /* */ }
  return null;
}
async function recadenciar(sb: any) {
  const agora = new Date().toISOString();
  const { data, error } = await sb.from("voz_fila").update({ status: "pendente", atualizado: agora }).eq("status", "agendado").lte("agendado_para", agora).select("id");
  return { ok: !error, reativados: (data || []).length, erro: error?.message };
}
async function tratarRetorno(sb: any, b: any, m: any) {
  const call = m?.call || {};
  const meta = call?.metadata || m?.metadata || call?.assistantOverrides?.metadata || {};
  const sd = m?.analysis?.structuredData || m?.structuredData || {};
  const tRaw = m?.artifact?.transcript || m?.transcript || "";
  const transcript = typeof tRaw === "string" ? tRaw : JSON.stringify(tRaw);
  const callId = call?.id || m?.id || null;
  const numero = m?.customer?.number || call?.customer?.number || meta?.fone || "";
  const durSeg = m?.durationSeconds != null ? Math.round(Number(m.durationSeconds)) : (m?.duration != null ? Math.round(Number(m.duration)) : null);
  const wpp = digits(sd?.contato_whatsapp);
  const rec = m?.recordingUrl || m?.stereoRecordingUrl || m?.artifact?.recordingUrl || m?.artifact?.stereoRecordingUrl || m?.artifact?.recording?.stereoUrl || m?.artifact?.recording?.mono?.combinedUrl || m?.artifact?.recording?.combinedUrl || null;
  const gravPath = await guardarGravacao(sb, rec, callId);
  const row: any = { call_id: callId, empresa: String(meta?.empresa || meta?.tenant || "nitron"), modelo: meta?.modelo || null, codparc: meta?.codparc ? parseInt(String(meta.codparc)) : null, numero_ligado: numero || null, duracao_seg: durSeg, ended_reason: m?.endedReason || null, interesse: sd?.interesse || null, decisor_falado: typeof sd?.decisor_falado === "boolean" ? sd.decisor_falado : null, numero_errado: typeof sd?.numero_errado === "boolean" ? sd.numero_errado : null, contato_nome: sd?.contato_nome || null, contato_whatsapp: sd?.contato_whatsapp || null, contato_email: sd?.contato_email || null, proximo_passo: sd?.proximo_passo || null, observacao: sd?.observacao || null, gravacao_url: rec, gravacao_path: gravPath, transcript: transcript ? transcript.slice(0, 8000) : null, raw: b };
  let ghlId: string | null = null; let wb = "sem_contato";
  if (wpp && wpp.length >= 10 && GHL) {
    try {
      const fone = "+55" + wpp.slice(-11);
      const r = await fetch("https://services.leadconnectorhq.com/contacts/upsert", { method: "POST", headers: { Authorization: "Bearer " + GHL, Version: "2021-07-28", "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ locationId: LOC, name: row.contato_nome || ("Contato " + row.empresa), phone: fone, email: row.contato_email || undefined, tags: ["nina-voz-capturado", "interesse-" + (row.interesse || "na")], source: "Ligacao Nina (voz)" }) });
      const d = await r.json().catch(() => ({})); ghlId = d?.contact?.id || d?.id || null; wb = ghlId ? "ghl_ok" : "ghl_sem_id";
      if (ghlId) { try { await fetch(`https://services.leadconnectorhq.com/contacts/${ghlId}/notes`, { method: "POST", headers: { Authorization: "Bearer " + GHL, Version: "2021-07-28", "Content-Type": "application/json" }, body: JSON.stringify({ body: "Ligacao da Nina. Interesse: " + (row.interesse || "-") + ". Proximo passo: " + (row.proximo_passo || "-") + ". Obs: " + (row.observacao || "-") }) }); } catch (_e) { /* */ } }
    } catch (_e) { wb = "ghl_erro"; }
  }
  row.ghl_contact_id = ghlId; row.writeback_status = wb;
  const { error } = await sb.from("voz_ligacao").insert(row);
  // CADENCIA (ligar de novo ate vender) + FUNIL
  let cad = "concluido"; let funil = "";
  if (callId) {
    try {
      const { data: fr } = await sb.from("voz_fila").select("id, tentativas, codparc").eq("call_id", callId).maybeSingle();
      const tent = Number(fr?.tentativas || 0);
      const er = String(m?.endedReason || "").toLowerCase();
      const naoAtendeu = /no-answer|voicemail|busy|did-not-answer|customer-did-not|no-microphone|twilio|dial|failed|error/.test(er);
      const interesse = String(sd?.interesse || "").toLowerCase();
      const positivo = /alto|medio|médio|sim|quente|interess|recompra|pedid|clube/.test(interesse) || (!!wpp && wpp.length >= 10);
      const negativo = /nenhum|baixo|nao quer|não quer|sem interess|desliga|nao tem interess/.test(interesse);
      const upd: any = { atualizado: new Date().toISOString(), agendado_para: null };
      const emDias = (n: number) => new Date(Date.now() + n * 24 * 3600 * 1000).toISOString();
      if (sd?.numero_errado === true) { upd.status = "numero_errado"; funil = "perdido"; }
      else if (naoAtendeu) { if (tent < 4) { upd.status = "agendado"; upd.agendado_para = emDias(1); } else { upd.status = "sem_resposta"; } }
      else if (positivo) { upd.status = "agendado"; upd.agendado_para = emDias(3); funil = "em_contato"; }
      else if (negativo) { upd.status = "perdido"; funil = "perdido"; }
      else { upd.status = "agendado"; upd.agendado_para = emDias(7); funil = "em_contato"; }
      cad = upd.status;
      if (fr?.id) await sb.from("voz_fila").update(upd).eq("id", fr.id);
      const cp = Number(fr?.codparc || meta?.codparc || 0);
      if (cp && funil) { try { await moverFunil(sb, cp, funil); } catch (_e) { /* */ } }
    } catch (_e) { try { await sb.from("voz_fila").update({ status: "concluido", atualizado: new Date().toISOString() }).eq("call_id", callId); } catch (_e2) { /* */ } }
  }
  return { ok: !error, salvo: !error, cadencia: cad, funil, interesse: row.interesse, contato: row.contato_nome, whatsapp: row.contato_whatsapp, ghl: ghlId, writeback: wb, gravacao_salva: !!gravPath, erro: error?.message };
}
async function construirFila(sb: any, sp: URLSearchParams) {
  const limite = Math.min(parseInt(sp.get("limite") || "300") || 300, 1500);
  const empresa = sp.get("empresa") || "nitron";
  const sel = "codparc, cnpj, nomeparc, whatsapp, situacao, codvend, faturamento_12m, ticket_medio, clube_saldo";
  // Publico: reativacao + recompra (giro vencido/a vencer) + vendedor autoatendimento (codvend 67). So com telefone.
  const q1 = sb.from("contato_enriquecido").select(sel).in("situacao", ["Reativação", "Giro vencido", "Giro a vencer"]).not("whatsapp", "is", null).limit(2000);
  const q2 = sb.from("contato_enriquecido").select(sel).eq("codvend", 67).not("whatsapp", "is", null).limit(2000);
  const [r1, r2] = await Promise.all([q1, q2]);
  if (r1.error && r2.error) return { ok: false, erro: r1.error.message };
  const mapa = new Map<number, any>();
  for (const c of [...(r1.data || []), ...(r2.data || [])]) { const cp = Number(c.codparc); if (cp === 1 || cp === 68200) continue; if (!mapa.has(cp)) mapa.set(cp, c); }
  const cands = [...mapa.values()].sort((a, b) => ((Number(b.clube_saldo) || 0) + (Number(b.faturamento_12m) || 0) / 10) - ((Number(a.clube_saldo) || 0) + (Number(a.faturamento_12m) || 0) / 10));
  const { data: jaFila } = await sb.from("voz_fila").select("codparc").in("status", ["pendente", "discando", "agendado"]);
  const naFila = new Set((jaFila || []).map((r: any) => Number(r.codparc)));
  let inseridos = 0, semwpp = 0, dup = 0;
  for (const c of cands) {
    if (inseridos >= limite) break;
    const cp = Number(c.codparc); if (naFila.has(cp)) { dup++; continue; }
    const tel = digits(c.whatsapp); if (!tel || tel.length < 10) { semwpp++; continue; }
    const tipo = Number(c.codvend) === 67 ? "autoatendimento" : c.situacao === "Reativação" ? "reativacao" : "recompra";
    const prio = Math.round((Number(c.clube_saldo) || 0) + (Number(c.faturamento_12m) || 0) / 10);
    const { error: e2 } = await sb.from("voz_fila").insert({ empresa, codparc: cp, cnpj: c.cnpj, nome_empresa: c.nomeparc, telefone: tel, tipo, prioridade: prio, status: "pendente" });
    if (!e2) { inseridos++; naFila.add(cp); }
  }
  const { count } = await sb.from("voz_fila").select("*", { count: "exact", head: true }).eq("status", "pendente");
  return { ok: true, candidatos: cands.length, inseridos, duplicados: dup, sem_whatsapp: semwpp, fila_pendente: count };
}
async function discar(sb: any) {
  const { data: cfgRows } = await sb.from("voz_config").select("*"); const cfg: Record<string, string> = {}; (cfgRows || []).forEach((r: any) => cfg[r.chave] = r.valor);
  if (String(cfg.discador_ativo || "nao").toLowerCase() !== "sim") return { ok: true, skip: "discador desligado" };
  if (foraHorarioComercial()) return { ok: true, skip: "fora do horario" };
  const vapiKey = Deno.env.get("VAPI_KEY") || cfg.vapi_key; const assistantId = cfg.assistant_id; const phoneNumberId = cfg.phone_number_id; const canaisMax = parseInt(cfg.canais_max || "15") || 15;
  if (!vapiKey || !assistantId || !phoneNumberId) return { ok: false, erro: "config vapi incompleta" };
  const { count: ativas } = await sb.from("voz_fila").select("*", { count: "exact", head: true }).eq("status", "discando");
  const vagas = canaisMax - (ativas || 0);
  if (vagas <= 0) return { ok: true, skip: "canais cheios", ativas };
  const { data: pend } = await sb.from("voz_fila").select("*").eq("status", "pendente").order("prioridade", { ascending: false }).limit(vagas);
  let disc = 0, err = 0;
  for (const row of (pend || [])) {
    const tel = digits(row.telefone); if (tel.length < 10) { await sb.from("voz_fila").update({ status: "sem_numero" }).eq("id", row.id); continue; }
    const numero = "+55" + tel.slice(-11);
    // DOSSIE do cliente (Sankhya via montarDossie/contato_enriquecido/lead + CRM via memoria360/GHL) -> vai como {{contexto}} pra Nina saber com quem fala.
    const md2: Record<string, any> = { codparc: row.codparc ? String(row.codparc) : "", cnpj: row.cnpj || "", tipo: row.tipo, empresa_nome: row.nome_empresa, nome: row.contato_nome };
    let contexto = "";
    try { const dossie = await montarDossie(sb, md2); const contactId = await resolverContactId(sb, md2); const mem = await memoria360(sb, contactId, parseInt(md2.codparc || "") || null); contexto = (dossie.txt || "") + (mem ? ("\n\n" + mem) : ""); } catch (_e) { /* */ }
    try {
      const aid = (row.modelo === "sonnet" && cfg.assistant_id_sonnet) ? cfg.assistant_id_sonnet : assistantId;
      const r = await fetch("https://api.vapi.ai/call", { method: "POST", headers: { Authorization: "Bearer " + vapiKey, "Content-Type": "application/json" }, body: JSON.stringify({ assistantId: aid, phoneNumberId, customer: { number: numero }, assistantOverrides: { variableValues: { contexto: contexto || "Nao identifiquei o cadastro no sistema - descubra com educacao com quem fala e de qual empresa." }, metadata: { empresa: row.empresa, codparc: row.codparc, tipo: row.tipo, nome: row.contato_nome, empresa_nome: row.nome_empresa, modelo: row.modelo || "haiku" } } }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d?.id) { await sb.from("voz_fila").update({ status: "discando", call_id: d.id, tentativas: (row.tentativas || 0) + 1, atualizado: new Date().toISOString() }).eq("id", row.id); disc++; }
      else { await sb.from("voz_fila").update({ status: "erro", ultimo_erro: JSON.stringify(d).slice(0, 300), tentativas: (row.tentativas || 0) + 1, atualizado: new Date().toISOString() }).eq("id", row.id); err++; }
    } catch (e) { await sb.from("voz_fila").update({ status: "erro", ultimo_erro: String(e).slice(0, 300), atualizado: new Date().toISOString() }).eq("id", row.id); err++; }
  }
  return { ok: true, discadas: disc, erros: err, vagas, ativas: ativas || 0 };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SRV_JWT") || (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "")!);
    const sp = new URL(req.url).searchParams; const acao = sp.get("acao");
    if (acao) {
      const { data: cfgg } = await sb.from("voz_config").select("valor").eq("chave", "disc_secret").maybeSingle();
      if (cfgg?.valor && sp.get("k") !== cfgg.valor) return j({ erro: "nao autorizado" }, 401);
      if (acao === "fila") return j(await construirFila(sb, sp));
      if (acao === "recadencia") return j(await recadenciar(sb));
      if (acao === "discar") { const rc = await recadenciar(sb); const dd = await discar(sb); return j({ ...dd, recadencia: rc }); }
      if (acao === "gravacao") {
        const cid = sp.get("call_id") || ""; if (!cid) return j({ erro: "call_id?" }, 400);
        const { data } = await sb.from("voz_ligacao").select("gravacao_path, gravacao_url").eq("call_id", cid).order("id", { ascending: false }).limit(1).maybeSingle();
        if (!data) return j({ erro: "ligacao nao encontrada" }, 404);
        if (data.gravacao_path) { const { data: sig } = await sb.storage.from("voz-gravacoes").createSignedUrl(data.gravacao_path, 3600); if (sig?.signedUrl) return Response.redirect(sig.signedUrl, 302); }
        if (data.gravacao_url) return Response.redirect(data.gravacao_url, 302);
        return j({ erro: "sem gravacao" }, 404);
      }
      return j({ erro: "acao desconhecida" });
    }
    const vs = Deno.env.get("VAPI_SECRET"); if (vs && req.headers.get("x-vapi-secret") !== vs) return new Response("unauthorized", { status: 401, headers: cors });
    const b = await req.json().catch(() => ({}));
    const evt = b?.message; if (evt && typeof evt === "object" && evt.type) {
      if (evt.type === "end-of-call-report") { const out = await tratarRetorno(sb, b, evt); return j(out); }
      return j({ ok: true, ignorado: evt.type });
    }
    const wantStream = b?.stream !== false;
    const inMsgs: any[] = Array.isArray(b?.messages) ? b.messages : [];
    const conv = inMsgs.filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim()).map((m: any) => ({ role: m.role, content: m.content }));
    if (!conv.length || conv[0].role !== "user") conv.unshift({ role: "user", content: "(inicio da ligacao — a Nina fala primeiro)" });
    const md = metaDaReq(b);
    const ehInbound = !(md.codparc || md.tipo || md.empresa_nome);
    // CONTEXTO PESADO (skills+dossie+memoria GHL + IDENTIFICACAO do numero) = caro. Monta 1x por ligacao e cacheia por call_id; turnos seguintes so leem o cache (instantaneo, sem reconsultar snap_rep/GHL).
    const callId = String(b?.call?.id || b?.message?.call?.id || b?.callId || md.call_id || "");
    let system = "";
    if (callId) { try { const { data: cx } = await sb.from("voz_ctx").select("sys").eq("call_id", callId).maybeSingle(); if (cx?.sys) system = cx.sys; } catch (_e) { /* */ } }
    if (!system) {
      let identRep: string | null = null;
      if (ehInbound && md.fone) { const ident = await resolverPorFone(sb, md.fone); if (ident.ehRep) identRep = ident.repNome || "representante"; else if (ident.codparc) { md.codparc = String(ident.codparc); md.tipo = "cliente"; if (ident.nome_empresa) md.empresa_nome = ident.nome_empresa; } }
      const cod = parseInt(md.codparc || "") || null;
      const [skillRes, dossie, contactId, catt] = await Promise.all([
        sb.from("copiloto_skills").select("nome,conteudo").eq("ativo", true),
        montarDossie(sb, md),
        resolverContactId(sb, md),
        catalogoTxt(sb),
      ]);
      const skillRows = (skillRes as any).data || [];
      const SKL: Record<string, string> = {}; skillRows.forEach((r: any) => SKL[r.nome] = r.conteudo);
      // VOZ = leve p/ baixa latencia: so o roteiro (voz) + tecnica de venda (vendas). Os DADOS vem das ferramentas ao vivo; as skills pesadas ficam no texto (WhatsApp).
      const outrasSkills = skillRows.filter((r: any) => r.nome === "vendas").map((r: any) => "[" + String(r.nome).toUpperCase() + "]\n" + String(r.conteudo)).join("\n\n");
      const mem = await memoria360(sb, contactId, cod);
      system = SYS_BASE + (ehInbound ? sysInbound(identRep, dossie.empresa) : SYS_OUTBOUND) + (SKL["voz"] ? "\n\nROTEIRO DA LIGACAO:\n" + SKL["voz"] : "") + (outrasSkills ? "\n\nMANUAIS DE NEGOCIO DA NITRON (todas as skills — use a que o caso pedir; na VOZ seja BREVE e natural, NAO despeje o manual, use como inteligencia de fundo):\n" + outrasSkills : "") + (catt ? "\n\n" + catt : "") + "\n\n" + dossie.txt + (mem ? "\n\n" + mem : "");
      if (callId) { try { await sb.from("voz_ctx").upsert({ call_id: callId, sys: system, criado: new Date().toISOString() }); } catch (_e) { /* */ } }
    }
    const fala = await cerebroFala(sb, system, conv);
    const id = "chatcmpl-" + (crypto.randomUUID?.() || String(Date.now()));
    const created = Math.floor(Date.now() / 1000);
    if (!wantStream) return new Response(JSON.stringify({ id, object: "chat.completion", created, model: b?.model || "copiloto-voz", choices: [{ index: 0, message: { role: "assistant", content: fala }, finish_reason: "stop" }], usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }), { headers: { ...cors, "Content-Type": "application/json" } });
    const partes = fala.match(/[^.!?…]+[.!?…]*\s*/g) || [fala];
    const stream = new ReadableStream({
      start(ctrl) {
        ctrl.enqueue(sse({ id, object: "chat.completion.chunk", created, model: b?.model || "copiloto-voz", choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }] }));
        for (const pt of partes) ctrl.enqueue(sse({ id, object: "chat.completion.chunk", created, model: b?.model || "copiloto-voz", choices: [{ index: 0, delta: { content: pt }, finish_reason: null }] }));
        ctrl.enqueue(sse({ id, object: "chat.completion.chunk", created, model: b?.model || "copiloto-voz", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }));
        ctrl.enqueue(enc.encode("data: [DONE]\n\n")); ctrl.close();
      },
    });
    return new Response(stream, { headers: { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" } });
  } catch (e) { return j({ error: String(e) }, 500); }
});
