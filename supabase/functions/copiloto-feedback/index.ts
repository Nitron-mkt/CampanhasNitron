// copiloto-feedback (v4) — o retorno vem do CLIENTE, porque do representante nao vem.
//
// v3/v4 (ordem do gestor, 18/09): a verificacao encurtou e deixou de morrer numa coluna.
//   * Pergunta no FINAL DO SEGUNDO DIA depois que o representante recebeu o lead (feedback_dias=2 +
//     janela de hora: so a partir de feedback_hora_ini, 16h de Sao Paulo). Perguntar as 10h do
//     segundo dia e perguntar cedo demais; perguntar no terceiro dia e tarde demais.
//   * A pergunta ao cliente DIZ o que acontece se ninguem falou com ele: o contato passa para uma
//     das nossas vendedoras internas. Antes a frase era "eu resolvo isso por aqui", que nao promete
//     nada e nao explica nada.
//   * "nao_atendido" deixou de ser so tarefa: vira TRANSFERENCIA de verdade. A Nina avisa o
//     representante de que, por nao ter atendido, o lead vai para outro vendedor; sorteia a
//     vendedora interna com menos repasses; manda o lead a ela; avisa o cliente; e espelha tudo
//     para quem tem avisar=true (o gestor e a Camyla). A tarefa continua sendo aberta — ela e o
//     registro para o gestor, nao o conserto.
//   * O expediente da venda interna vale aqui como vale no repasse (seg-qui ate 18h, sex ate 17h,
//     sem fim de semana). Fora da janela a transferencia FICA PENDENTE em repasse_historico e sai na
//     proxima rodada dentro do expediente — o representante e o cliente ja foram avisados.
//   * O aviso ao representante e o lead a vendedora saem pela instancia da NINA mesmo que o contato
//     tenha outro dono no CRM (repasse_forcar_inst). So vale para contato INTERNO.
//   * v4: o tempo decorrido e CALCULADO (haDias), nao escrito "ha dois dias" na mao.
//
// v2: o telefone da tarefa vem do CRM, nao da coluna. copiloto_lead.fone foi gravado decapitado ate
//     a copiloto-lead v9 e o gestor recebia um numero que nao existe — justamente no aviso de que o
//     representante nao atendeu, que e quando alguem vai LIGAR para o cliente.
//
// Buraco apontado pelo gestor em 14/09: quando o lead vai para representante, a conversa continua no
// WhatsApp PESSOAL dele, fora do nosso CRM. Nao da para ver se ligou, se marcou, se vendeu. Entao a
// unica fonte de verdade e o proprio cliente, e a pergunta se faz a ele.
//
// SO PARA LEAD QUE FOI A REPRESENTANTE (feedback_tipos = 'fisica'). Quando vai para a venda interna,
// a conversa acontece nas NOSSAS instancias e da para ler no CRM — perguntar ali e redundante e
// incomoda o cliente.
//
// TRES PASSADAS:
//   ?acao=perguntar  — manda a pergunta a quem esta na janela, e o reforco a quem nao respondeu.
//   ?acao=ler        — le a resposta, classifica, grava, abre tarefa e dispara a transferencia.
//   ?acao=transferir — so as transferencias que ficaram pendentes (fora do expediente interno).
// Sem ?acao roda as tres. ?dry=1 mostra sem mandar e sem gravar. ?lead=<id> forca um lead.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GHL = (Deno.env.get("GHL_TOKEN") || "").trim();
const LOC = "rZ8y7lzqV7fzxsartaX2";
const MODELO = "claude-sonnet-5";

const digits = (s: any) => String(s || "").replace(/\D/g, "");
const d10 = (s: any) => digits(s).slice(-10);   // so para deduplicar quem ja foi avisado
// O telefone da coluna copiloto_lead.fone foi gravado decapitado ate a copiloto-lead v9 (os ultimos
// 10 digitos de um numero com DDI: "+5511982408982" virava "1982408982"). Os registros antigos
// foram corrigidos, mas imprimir a coluna crua nunca foi seguro: quem le a tarefa e o gestor, e o
// numero e para ele ligar. Entao o numero da TAREFA vem do CRM, como na copiloto-repasse.
const foneNac = (s: any) => { let d = digits(s); if (d.length >= 12 && d.startsWith("55")) d = d.slice(2); return d; };
function foneFmt(s: any): string {
  const d = foneNac(s);
  if (d.length === 11) return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
  if (d.length === 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
  return String(s || "");
}
async function foneDoCrm(contact_id: any): Promise<string> {
  if (!contact_id) return "";
  try {
    const r = await ghl("GET", "/contacts/" + contact_id);
    if (!r.ok) return "";
    const d = await r.json().catch(() => ({}));
    return String(d?.contact?.phone || d?.phone || "");
  } catch { return ""; }
}
const lista = (s: any, pad: string) => String(s ?? pad).split(",").map((x) => x.trim()).filter(Boolean);
const ghl = (m: string, p: string, v = "2021-07-28", body?: any) => fetch("https://services.leadconnectorhq.com" + p, { method: m, headers: { Authorization: "Bearer " + GHL, Version: v, Accept: "application/json", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
function limpa(t: any): string { return String(t || "").replace(/Instance Source:.*/is, "").replace(/#contact_instance:\S+/gi, "").replace(/\s+/g, " ").trim(); }
function docFmt(d: any): string {
  const x = digits(d);
  if (x.length === 14) return x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") + " (CNPJ)";
  if (x.length === 11) return x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") + " (CPF)";
  return x ? x + " (documento fora do padrao)" : "";
}

// ---- hora de Sao Paulo, e o expediente da venda interna ----------------------------------------
// Mesmas contas da copiloto-repasse v4, de proposito: se divergirem, a Nina promete numa funcao o
// que a outra nao cumpre. (UTC-3 fixo — o Brasil nao tem mais horario de verao.)
function agoraSP(): Date { return new Date(Date.now() - 3 * 3600 * 1000); }
function janelaInterna(cfg: Record<string, string>): { aberto: boolean; motivo?: string } {
  const ini = Math.max(0, parseInt(cfg.interna_ini || "8") || 8);
  const fimSeg = Math.max(1, parseInt(cfg.interna_fim || "18") || 18);
  const fimSex = Math.max(1, parseInt(cfg.interna_fim_sex || "17") || 17);
  const margem = Math.max(0, parseInt(cfg.interna_margem_min || "45") || 45);
  const d = agoraSP(); const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return { aberto: false, motivo: "fim de semana" };
  const fim = dow === 5 ? fimSex : fimSeg;
  const min = d.getUTCHours() * 60 + d.getUTCMinutes();
  if (min < ini * 60) return { aberto: false, motivo: "antes das " + ini + "h" };
  if (min > fim * 60 - margem) return { aberto: false, motivo: "perto do fim do expediente (ate " + fim + "h)" };
  return { aberto: true };
}
function proximoDiaUtilTxt(): string {
  const dow = agoraSP().getUTCDay();
  if (dow === 5 || dow === 6) return "na segunda-feira de manha";
  return "amanha de manha";
}

// "ha dois dias" e a regra, mas o texto tem de dizer o que aconteceu de verdade: o lead 23 estava
// com o representante ha quatro dias quando a transferencia saiu. Numero errado na boca da Nina e
// exatamente a doenca que o gestor apontou em 16/09.
function diasDesde(iso: any): number { const t = new Date(iso || 0).getTime(); if (!t) return 2; return Math.max(0, Math.round((Date.now() - t) / 86400000)); }
function haDias(iso: any): string { const n = diasDesde(iso); return n <= 1 ? "ontem" : "ha " + n + " dias"; }

async function enviarZaptos(contact_id: string | null, fone: string, texto: string, instancia: string) {
  const body: any = { canal: "whatsapp", texto, instancia };
  if (contact_id) body.contact_id = contact_id; else body.fone = fone;
  const r = await fetch(SUPA_URL + "/functions/v1/campanhas-enviar", { method: "POST", headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return await r.json().catch(() => ({ ok: false, motivo: "resposta ilegivel do campanhas-enviar" }));
}
// lookup=true: acha (ou cria) o contato pelo telefone e devolve o id SEM mandar nada. E como se
// descobre em qual contato do CRM o representante vive — e o dono do contato decide o numero de saida.
async function lookupContato(fone: string, instancia: string) {
  try {
    const r = await fetch(SUPA_URL + "/functions/v1/campanhas-enviar", { method: "POST", headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" }, body: JSON.stringify({ canal: "whatsapp", fone, instancia, lookup: true }) });
    return await r.json().catch(() => ({}));
  } catch (_e) { return {}; }
}
async function notaCrm(contact_id: string, texto: string) {
  try { const r = await ghl("POST", `/contacts/${contact_id}/notes`, "2021-07-28", { body: texto.slice(0, 4000) }); return r.ok; } catch (_e) { return false; }
}

// ---- o dono do contato manda no numero de saida ------------------------------------------------
type Inst = { instancia: string; usuario_ghl_id: string; viva: boolean };
async function instancias(sb: any): Promise<Inst[]> {
  const { data } = await sb.from("instancia_ghl").select("instancia, usuario_ghl_id, ativa, pausada_em");
  return (data || []).map((x: any) => ({ instancia: String(x.instancia), usuario_ghl_id: String(x.usuario_ghl_id || ""), viva: !!x.ativa && !x.pausada_em }));
}
// Contato INTERNO pronto para receber pela instancia remetente. Trocar o dono e a unica forma de
// honrar "mande pela instancia da Nina mesmo que esteja com outro proprietario no CRM": o numero de
// saida E o dono. Vale so para rep e time — em contato de CLIENTE trocar o dono tira o cliente da
// vista do consultor dele.
async function prepararDestino(contact_id: string, remetente: Inst, insts: Inst[], forcar: boolean) {
  const r = await ghl("GET", `/contacts/${contact_id}`);
  if (!r.ok) return { ok: false, motivo: "GHL " + r.status + " ao ler o contato" };
  const c = (await r.json().catch(() => ({})))?.contact || {};
  const dono = String(c.assignedTo || "");
  const donoInst = insts.find((i) => i.usuario_ghl_id === dono) || null;
  if (donoInst && donoInst.instancia === remetente.instancia) return { ok: true, dono: donoInst.instancia, trocou: false };
  if (donoInst && donoInst.viva && !forcar) return { ok: true, dono: donoInst.instancia, trocou: false, usar_dono: true };
  const u = await ghl("PUT", `/contacts/${contact_id}`, "2021-07-28", { assignedTo: remetente.usuario_ghl_id });
  if (!u.ok) return { ok: false, motivo: "nao consegui trocar o dono (GHL " + u.status + ")" };
  return { ok: true, dono: remetente.instancia, trocou: true, dono_antes: donoInst?.instancia || (dono ? dono : "sem dono") };
}
// manda para um contato INTERNO pela instancia da Nina, trocando o dono se preciso
async function enviarInterno(insts: Inst[], remetente: Inst | null, contact_id: string | null, fone: string, texto: string, forcar: boolean) {
  if (!remetente) return { ok: false, motivo: "instancia remetente fora do cadastro" };
  let alvo = contact_id || "";
  if (!alvo && fone) { const lk: any = await lookupContato(fone, remetente.instancia); if (lk?.contactId) alvo = String(lk.contactId); }
  let inst = remetente.instancia;
  if (alvo) {
    const prep: any = await prepararDestino(alvo, remetente, insts, forcar);
    if (!prep.ok) return { ok: false, motivo: prep.motivo };
    if (prep.usar_dono) inst = String(prep.dono);
  }
  const env: any = await enviarZaptos(alvo || null, fone, texto, inst);
  return { ok: !!env?.ok, motivo: env?.ok ? undefined : String(env?.motivo || "envio recusado").slice(0, 250), instancia: inst, contato: alvo || null };
}

// ---- os textos, em codigo ----------------------------------------------------------------------
// Pergunta curta e de mao dupla: serve tanto para "ja falou" quanto para "ninguem falou". A segunda
// metade e a que importa — e o unico jeito de o cliente nos dizer que foi esquecido. E ela DIZ o que
// acontece nesse caso: quem le precisa saber que responder "nao" resolve alguma coisa.
function textoPergunta(L: any): string {
  const nome = String(L.nome || "").trim().split(/\s+/)[0] || "";
  return [
    (nome ? "Oi, " + nome + "! " : "Oi! ") + "Aqui e a Nina, da Nitron.",
    "",
    "Passei seu contato para o nosso representante da regiao " + haDias(L.repasse_em) + " e queria saber de voce: ele chegou a falar com voce?",
    "",
    "Se ja falou, me conta rapidinho como foi. E se ainda nao falou, e so me dizer que eu passo seu atendimento para uma das nossas vendedoras internas aqui da Nitron, que fala com voce direto por aqui.",
  ].join("\n");
}
function textoReforco(L: any): string {
  const nome = String(L.nome || "").trim().split(/\s+/)[0] || "";
  return [
    (nome ? nome + ", " : "") + "so um oi rapido para nao te deixar no vacuo:",
    "",
    "o representante da sua regiao chegou a te procurar? Responde so sim ou nao que ja me ajuda — se for nao, eu passo seu atendimento para uma das nossas vendedoras internas, que te atende por aqui mesmo.",
  ].join("\n");
}
// Aviso ao representante. Sem sermao e sem ameaca: o fato, a consequencia (que ele ja conhecia desde
// o repasse) e a porta aberta caso ele tenha falado e o cliente nao tenha lembrado.
function textoAvisoRep(L: any, vendedora: string): string {
  const praca = [L.cidade, L.uf].filter(Boolean).join("/");
  return [
    String(L.repasse_para || "") + ", sobre o lead que te passei " + haDias(L.repasse_em) + ":",
    "",
    L.empresa ? "Loja: " + L.empresa : null,
    docFmt(L.cnpj) || null,
    praca ? "Praca: " + praca : null,
    "",
    "Perguntei ao cliente e ele disse que ainda nao foi procurado. Como ele ja estava esperando o contato, eu vou passar o atendimento dele para " + (vendedora ? vendedora + ", da nossa venda interna" : "uma das nossas vendedoras internas") + ".",
    "",
    "Se voce chegou a falar com ele e o cliente nao lembrou, me avisa agora por aqui que eu seguro a transferencia.",
  ].filter((x) => x !== null).join("\n");
}
// O lead indo para a venda interna. Diz por que chegou ali — ela precisa saber que o cliente ja
// esperou dois dias, e que isso muda a pressa.
function textoVendedora(L: any, vendedora: string, cfg: Record<string, string>, foneLead: string, hoje: boolean): string {
  const min = parseInt(digits(cfg.pedido_minimo || "2500")) || 2500;
  const praca = [L.cidade, L.uf].filter(Boolean).join("/");
  return [
    vendedora + ", esse lead do anuncio foi para o representante da praca " + haDias(L.repasse_em) + " e o cliente disse que ninguem falou com ele. Passando para voce atender.",
    "",
    L.empresa ? "Loja: " + L.empresa : null,
    docFmt(L.cnpj) || "Sem documento informado",
    praca ? "Praca: " + praca : null,
    "Contato: " + (L.nome ? L.nome + " — " : "") + foneFmt(foneLead),
    L.tipo_loja ? "Tipo: " + L.tipo_loja : null,
    L.interesse ? "Quer abastecer: " + L.interesse : null,
    L.ja_revende ? "Compra hoje: " + L.ja_revende : null,
    "Pedido minimo: " + (L.sabe_minimo ? "ja sabe que e R$ " + min.toLocaleString("pt-BR") + " e seguiu interessado" : "AINDA NAO SABE — diga na abordagem (R$ " + min.toLocaleString("pt-BR") + ")"),
    L.temperatura ? "Temperatura: " + L.temperatura : null,
    "",
    L.resumo ? "Resumo da conversa: " + L.resumo : null,
    "",
    "Ele ja esperou " + (diasDesde(L.repasse_em) <= 1 ? "um dia" : diasDesde(L.repasse_em) + " dias") + " por um contato que nao veio — entao quanto antes voce falar com ele, melhor" + (hoje ? ", de preferencia ainda hoje." : "."),
    "Eu ja avisei o cliente de que voce vai falar com ele" + (hoje ? " hoje." : " " + proximoDiaUtilTxt() + "."),
    "",
    "Preco, prazo, condicao de pagamento e frete sao com voce — a Nina nao falou nada disso.",
    "Conversa dele com a Nina: https://app.gohighlevel.com/v2/location/" + LOC + "/contacts/detail/" + (L.contact_id || ""),
  ].filter((x) => x !== null).join("\n");
}
// O cliente soube que responderia "nao" resolvia alguma coisa. Isso e a coisa acontecendo.
function textoClienteTransferido(L: any, vendedora: string, hoje: boolean): string {
  const nome = String(L.nome || "").trim().split(/\s+/)[0] || "";
  return [
    (nome ? nome + ", " : "") + "obrigada por me contar — desculpa pela demora.",
    "",
    "Ja passei seu atendimento para " + (vendedora || "uma das nossas vendedoras internas") + ", aqui da Nitron, e ela fala com voce " + (hoje ? "ainda hoje" : proximoDiaUtilTxt()) + " por aqui mesmo.",
    "",
    "Qualquer coisa antes disso, e so me chamar.",
  ].join("\n");
}
// O espelho para quem tem avisar=true (o gestor e a Camyla). Ordem do gestor em 18/09: eles sabem de
// todo repasse — e uma transferencia por falta de atendimento e o repasse que mais importa saber.
function textoEspelhoTransf(L: any, vendedora: string, foneLead: string, resposta: string): string {
  const praca = [L.cidade, L.uf].filter(Boolean).join("/");
  return [
    "Lead TRANSFERIDO — o representante nao atendeu",
    "",
    (L.empresa ? "Loja: " + L.empresa : "Contato sem loja informada"),
    docFmt(L.cnpj) || "Sem documento informado",
    praca ? "Praca: " + praca : null,
    "Contato: " + (L.nome ? L.nome + " — " : "") + foneFmt(foneLead),
    "",
    "Estava com: " + String(L.repasse_para || "?") + (L.repasse_codvend ? (" (codvend " + L.repasse_codvend + ")") : "") + ", desde " + (L.repasse_em ? new Date(L.repasse_em).toLocaleDateString("pt-BR") : "?") + ".",
    "Foi para: " + (vendedora || "?") + " (venda interna).",
    "O cliente disse: \"" + String(resposta || "").slice(0, 200) + "\"",
    "",
    "O representante foi avisado de que o lead saiu dele.",
  ].filter((x) => x !== null).join("\n");
}

async function anthropic(system: string, messages: any[]): Promise<any> {
  const key = Deno.env.get("ANTHROPIC_API_KEY"); if (!key) throw new Error("sem ANTHROPIC_API_KEY");
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: MODELO, max_tokens: 400, system, messages }) });
  if (!r.ok) throw new Error("anthropic " + r.status + " " + (await r.text()).slice(0, 200));
  return await r.json();
}

// Classificar e a parte que nao pode ser regex: "ele me ligou mas nao mandou a tabela ainda" e
// atendido, "ate agora nada" e nao_atendido, e as duas frases nao tem palavra em comum.
const SYS_CLASSIFICA = `Voce le a resposta de um LOJISTA a uma pergunta da Nitron. A pergunta foi: "o nosso representante chegou a falar com voce?".
Classifique em UM destes valores, e nada mais:
- atendido: o representante entrou em contato (ligou, mandou mensagem, passou tabela, visitou), mesmo que a negociacao ainda nao tenha fechado.
- nao_atendido: ninguem falou com ele ate agora, ou ele diz que continua esperando.
- comprou: ja fez pedido, fechou compra ou esta finalizando o pedido.
- sem_interesse: ele nao quer mais, desistiu, ou pediu para nao insistirem.
- indefinido: a resposta nao permite dizer (mudou de assunto, so mandou emoji, ficou ambigua).
Responda SO com JSON valido, sem texto em volta: {"resultado":"<valor>","detalhe":"<uma frase curta, em portugues, do que ele disse>"}`;

async function classificar(texto: string): Promise<{ resultado: string; detalhe: string }> {
  try {
    const r = await anthropic(SYS_CLASSIFICA, [{ role: "user", content: "Resposta do lojista:\n\n" + texto.slice(0, 1500) }]);
    const t = (r.content || []).filter((x: any) => x.type === "text").map((x: any) => x.text).join("").trim();
    const m = t.match(/\{[\s\S]*\}/);
    const o = JSON.parse(m ? m[0] : t);
    const ok = ["atendido", "nao_atendido", "comprou", "sem_interesse", "indefinido"];
    return { resultado: ok.includes(o.resultado) ? o.resultado : "indefinido", detalhe: String(o.detalhe || "").slice(0, 300) };
  } catch (_e) { return { resultado: "indefinido", detalhe: "nao consegui classificar a resposta automaticamente" }; }
}

// ---- passada 1: perguntar ----------------------------------------------------------------------
async function perguntar(sb: any, cfg: Record<string, string>, dry: boolean, umId: number) {
  const dias = Math.max(1, parseInt(cfg.feedback_dias || "2") || 2);
  const reforcoH = Math.max(6, parseInt(cfg.feedback_reforco_h || "48") || 48);
  const toquesMax = Math.max(1, parseInt(cfg.feedback_toques_max || "2") || 2);
  const limite = Math.min(parseInt(cfg.feedback_limite || "3") || 3, 20);
  const tipos = lista(cfg.feedback_tipos, "fisica");
  // FINAL do segundo dia: a hora faz parte do pedido. Perguntar as 10h do segundo dia e perguntar
  // antes de o dia ter acontecido — o representante ainda tem a tarde inteira para ligar.
  const hIni = Math.max(0, parseInt(cfg.feedback_hora_ini || "16") || 16);
  const hFim = Math.min(22, parseInt(cfg.feedback_hora_fim || "21") || 21);
  const h = agoraSP().getUTCHours();
  if (!umId && (h < hIni || h >= hFim)) return [{ decisao: "pular", motivo: "fora da janela de perguntar (" + hIni + "h as " + hFim + "h de Sao Paulo; agora sao " + h + "h)" }];

  let q = sb.from("copiloto_lead").select("*").is("feedback_resultado", null).lt("feedback_tentativas", toquesMax);
  if (umId) q = q.eq("id", umId);
  else q = q.eq("repasse_ok", true).in("repasse_tipo", tipos)
            .lte("repasse_em", new Date(Date.now() - dias * 86400000).toISOString());
  const { data: leads, error } = await q.order("repasse_em", { ascending: true }).limit(limite);
  if (error) return [{ erro: error.message }];

  const feitos: any[] = [];
  for (const L of (leads || [])) {
    const base: any = { lead: L.id, contato: L.empresa || L.nome || foneFmt(L.fone), rep: L.repasse_para, toque: Number(L.feedback_tentativas || 0) + 1 };
    // ja perguntou e ainda esta dentro do intervalo de reforco: nao insiste
    if (L.feedback_em && (Date.now() - new Date(L.feedback_em).getTime()) < reforcoH * 3600000) {
      feitos.push({ ...base, decisao: "pular", motivo: "perguntado ha menos de " + reforcoH + "h" }); continue;
    }
    // canal oficial da Meta: passados 2 dias a janela de 24h ja fechou e texto livre nao passa
    if (String(L.instancia || "") === "ghl-nativo") {
      feitos.push({ ...base, decisao: "pular", motivo: "lead do canal nativo: a janela de 24h da Meta ja fechou, so template passa" }); continue;
    }
    const texto = L.feedback_em ? textoReforco(L) : textoPergunta(L);
    if (dry) { feitos.push({ ...base, decisao: "previa", texto }); continue; }
    const env: any = await enviarZaptos(L.contact_id, L.fone, texto, String(L.instancia || cfg.lead_inst || "Nina"));
    const agora = new Date().toISOString();
    if (env?.ok) {
      await sb.from("copiloto_lead").update({ feedback_em: agora, feedback_tentativas: Number(L.feedback_tentativas || 0) + 1, feedback_erro: null, atualizado: agora }).eq("id", L.id);
      feitos.push({ ...base, decisao: L.feedback_em ? "reforcou" : "perguntou" });
    } else {
      // recusa por dono divergente = alguem do time assumiu a conversa. Nao e erro: e humano no meio.
      const motivo = String(env?.motivo || "envio recusado").slice(0, 250);
      await sb.from("copiloto_lead").update({ feedback_erro: motivo, atualizado: agora }).eq("id", L.id);
      feitos.push({ ...base, decisao: "falhou", motivo });
    }
  }
  return feitos;
}

// ---- a transferencia: o que a promessa ao cliente virou ----------------------------------------
// Sorteio com memoria, como na copiloto-repasse: embaralha e traz para a frente quem recebeu menos.
async function sortearInterna(sb: any): Promise<any> {
  const { data } = await sb.from("copiloto_venda_interna").select("*").eq("ativo", true);
  const arr = (data || []).slice();
  if (!arr.length) return null;
  arr.sort(() => Math.random() - 0.5);
  arr.sort((a: any, b: any) => Number(a.repasses || 0) - Number(b.repasses || 0));
  return arr[0];
}
const jaFez = (L: any, acao: string) => (Array.isArray(L.repasse_historico) ? L.repasse_historico : []).some((h: any) => h?.acao === acao && h?.ok);

async function transferir(sb: any, cfg: Record<string, string>, L: any, insts: Inst[], dry: boolean) {
  const out: any = { lead: L.id, contato: L.empresa || L.nome || foneFmt(L.fone), rep: L.repasse_para };
  const forcar = String(cfg.repasse_forcar_inst || "sim") === "sim";
  const nomeInst = String(cfg.repasse_inst || "Nina");
  const remetente = insts.find((i) => i.instancia === nomeInst) || null;
  const janela = janelaInterna(cfg);
  const vend = await sortearInterna(sb);
  if (!vend) { out.erro = "nenhuma vendedora interna ativa em copiloto_venda_interna"; return out; }
  out.vendedora = vend.nome;

  const hist: any[] = Array.isArray(L.repasse_historico) ? L.repasse_historico : [];
  const agora = new Date().toISOString();
  const foneLead = (await foneDoCrm(L.contact_id)) || L.fone;

  // 1) o representante e avisado SEMPRE, dentro ou fora do expediente interno: e ele quem precisa
  //    saber agora, e e a janela para ele dizer "falei sim, o cliente nao lembrou".
  if (!jaFez(L, "aviso_rep")) {
    const txt = textoAvisoRep(L, vend.nome);
    if (dry) out.aviso_rep = { previa: txt };
    else {
      const r = await enviarInterno(insts, remetente, null, String(L.repasse_fone || ""), txt, forcar);
      out.aviso_rep = r;
      hist.push({ em: agora, acao: "aviso_rep", para: L.repasse_para, ok: !!r.ok, motivo: r.ok ? undefined : r.motivo });
    }
  } else out.aviso_rep = { decisao: "ja avisado" };

  // 2) a vendedora so recebe dentro do expediente dela. Fora, a transferencia fica PENDENTE e sai na
  //    proxima rodada — o cliente e o representante ja sabem o que vai acontecer.
  if (!janela.aberto) {
    out.pendente = true; out.motivo = "venda interna fora do expediente (" + janela.motivo + ") — a transferencia sai na proxima rodada dentro do horario";
    if (!dry) await sb.from("copiloto_lead").update({ repasse_historico: hist, atualizado: agora }).eq("id", L.id);
    return out;
  }

  const txtV = textoVendedora(L, vend.nome, cfg, foneLead, true);
  if (dry) { out.vendedora_msg = { previa: txtV }; out.cliente_msg = { previa: textoClienteTransferido(L, vend.nome, true) }; return out; }
  const rv = await enviarInterno(insts, remetente, vend.contact_id || null, String(vend.fone || ""), txtV, forcar);
  out.vendedora_envio = rv;
  hist.push({ em: agora, acao: "transferencia", para: vend.nome, codvend: vend.codvend, tipo: "online", ok: !!rv.ok, motivo: rv.ok ? undefined : rv.motivo });
  if (!rv.ok) { await sb.from("copiloto_lead").update({ repasse_historico: hist, atualizado: agora }).eq("id", L.id); return out; }

  // 3) o cliente soube que responder "nao" resolvia alguma coisa
  const rc: any = await enviarZaptos(L.contact_id, L.fone, textoClienteTransferido(L, vend.nome, true), String(L.instancia || cfg.lead_inst || "Nina"));
  out.cliente_avisado = { ok: !!rc?.ok, motivo: rc?.ok ? undefined : String(rc?.motivo || "").slice(0, 200) };

  // 4) o espelho para o gestor e a Camyla — ISSO SEMPRE DEVE ACONTECER (ordem de 18/09)
  const espelho = textoEspelhoTransf(L, vend.nome, foneLead, String(L.feedback_resposta || ""));
  const avisados: any[] = [];
  try {
    const { data: resp } = await sb.from("copiloto_responsaveis").select("nome, fone, avisar").eq("avisar", true);
    const vistos = new Set<string>();
    for (const r0 of (resp || [])) {
      const f = digits(r0.fone);
      if (!f || vistos.has(d10(f))) continue;   // o gestor aparece em duas areas; avisar uma vez
      vistos.add(d10(f));
      const e2: any = await enviarZaptos(null, f, espelho, remetente?.instancia || nomeInst);
      avisados.push({ quem: r0.nome, ok: !!e2?.ok, motivo: e2?.ok ? undefined : String(e2?.motivo || "").slice(0, 160) });
    }
  } catch (e) { avisados.push({ erro: String(e).slice(0, 160) }); }
  out.espelho = avisados;

  await sb.from("copiloto_lead").update({ repasse_historico: hist, atualizado: agora }).eq("id", L.id);
  try {
    await sb.from("copiloto_venda_interna").update({ repasses: Number(vend.repasses || 0) + 1, ultimo_em: agora, atualizado: agora }).eq("nome", vend.nome);
  } catch (_e) { /* contador, nao bloqueia */ }
  if (L.contact_id) await notaCrm(String(L.contact_id), "Lead TRANSFERIDO para a venda interna (" + vend.nome + ") porque o cliente disse que " + String(L.repasse_para || "o representante") + " nao falou com ele. O representante foi avisado. Espelho enviado ao gestor e a Camyla.");
  return out;
}

// as que ficaram pendentes por estar fora do expediente da venda interna
async function transferirPendentes(sb: any, cfg: Record<string, string>, insts: Inst[], dry: boolean, umId: number) {
  const limite = Math.min(parseInt(cfg.feedback_limite || "3") || 3, 20);
  let q = sb.from("copiloto_lead").select("*").eq("feedback_resultado", "nao_atendido");
  if (umId) q = q.eq("id", umId);
  const { data, error } = await q.order("feedback_resp_em", { ascending: true }).limit(200);
  if (error) return [{ erro: error.message }];
  const pend = (data || []).filter((L: any) => !jaFez(L, "transferencia")).slice(0, limite);
  const feitos: any[] = [];
  for (const L of pend) feitos.push(await transferir(sb, cfg, L, insts, dry));
  return feitos;
}

// ---- passada 2: ler a resposta -----------------------------------------------------------------
async function ler(sb: any, cfg: Record<string, string>, dry: boolean, umId: number, insts: Inst[]) {
  const desistirH = Math.max(12, parseInt(cfg.feedback_desistir_h || "96") || 96);
  const limite = Math.min(parseInt(cfg.feedback_limite || "3") || 3, 20);
  let q = sb.from("copiloto_lead").select("*").not("feedback_em", "is", null).is("feedback_resultado", null);
  if (umId) q = q.eq("id", umId);
  const { data: leads, error } = await q.order("feedback_em", { ascending: true }).limit(limite);
  if (error) return [{ erro: error.message }];

  const feitos: any[] = [];
  for (const L of (leads || [])) {
    const base: any = { lead: L.id, contato: L.empresa || L.nome || foneFmt(L.fone), rep: L.repasse_para };
    if (!L.contact_id) { feitos.push({ ...base, decisao: "pular", motivo: "lead sem contact_id" }); continue; }
    const rc = await ghl("GET", `/conversations/search?locationId=${LOC}&contactId=${L.contact_id}&limit=1`);
    const cv = (((await rc.json().catch(() => ({})))?.conversations) || [])[0];
    if (!cv) { feitos.push({ ...base, decisao: "pular", motivo: "conversa nao encontrada" }); continue; }
    const rm = await ghl("GET", `/conversations/${cv.id}/messages?limit=20`, "2021-04-15");
    const arr = (((await rm.json().catch(() => ({})))?.messages?.messages) || []) as any[];
    const desde = new Date(L.feedback_em).getTime();
    // so o que o LOJISTA escreveu depois da pergunta
    const dele = arr.filter((m: any) => m.direction === "inbound" && new Date(m.dateAdded).getTime() > desde && limpa(m.body))
                    .sort((a: any, b: any) => new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime())
                    .map((m: any) => limpa(m.body));
    if (!dele.length) {
      const horas = (Date.now() - desde) / 3600000;
      if (horas >= desistirH) {
        if (!dry) await sb.from("copiloto_lead").update({ feedback_resultado: "sem_resposta", feedback_detalhe: "nao respondeu em " + Math.round(horas) + "h", atualizado: new Date().toISOString() }).eq("id", L.id);
        feitos.push({ ...base, decisao: "sem_resposta", horas: Math.round(horas) });
      } else feitos.push({ ...base, decisao: "aguardando", horas: Math.round(horas) });
      continue;
    }
    const resposta = dele.join(" | ").slice(0, 1200);
    const cls = await classificar(resposta);
    if (dry) { feitos.push({ ...base, decisao: "previa", resposta, ...cls }); continue; }
    const agora = new Date().toISOString();
    await sb.from("copiloto_lead").update({ feedback_resposta: resposta, feedback_resp_em: agora, feedback_resultado: cls.resultado, feedback_detalhe: cls.detalhe, atualizado: agora }).eq("id", L.id);

    // "ninguem falou comigo" e a descoberta que justifica a rotina inteira: vira TAREFA, e a
    // copiloto-entrega leva ao gestor. Sem isso ficaria numa coluna que ninguem abre.
    let tarefa: any = null;
    if (cls.resultado === "nao_atendido" || cls.resultado === "sem_interesse") {
      const det = [
        L.empresa ? "Loja: " + L.empresa : null,
        docFmt(L.cnpj) || "Sem documento informado",
        (L.cidade || L.uf) ? "Praca: " + [L.cidade, L.uf].filter(Boolean).join("/") : null,
        "Contato: " + (L.nome ? L.nome + " — " : "") + foneFmt((await foneDoCrm(L.contact_id)) || L.fone),
        "",
        "Repassado em " + new Date(L.repasse_em).toLocaleDateString("pt-BR") + " para " + L.repasse_para + (L.repasse_codvend ? (" (codvend " + L.repasse_codvend + ")") : "") + ".",
        cls.resultado === "nao_atendido"
          ? "O CLIENTE DIZ QUE NINGUEM FALOU COM ELE. O representante nao atendeu o lead, e o atendimento esta sendo transferido para a venda interna."
          : "O cliente perdeu o interesse depois do repasse.",
        "Resposta dele: \"" + resposta.slice(0, 400) + "\"",
        "",
        cls.resultado === "nao_atendido"
          ? "Ja feito pela Nina: o representante foi avisado e o lead foi para uma vendedora interna. Decisao do gestor: o que fazer com o representante."
          : "Decisao do gestor: encerrar ou tentar por outro caminho.",
        "Conversa: https://app.gohighlevel.com/v2/location/" + LOC + "/contacts/detail/" + L.contact_id,
      ].filter((x) => x !== null).join("\n");
      const { data: tf } = await sb.from("copiloto_tarefas").insert({
        area: "comercial", tipo: cls.resultado === "nao_atendido" ? "lead-sem-atendimento" : "lead-perdeu-interesse",
        acao: (cls.resultado === "nao_atendido" ? "Lead nao foi atendido pelo representante: " : "Lead perdeu o interesse: ") + (L.empresa || L.nome || foneFmt(L.fone)),
        detalhe: det.slice(0, 1500), cliente_nome: L.empresa || L.nome || null, contact_id: L.contact_id,
        origem: "nina-lead", prioridade: 1,
      }).select("id").maybeSingle();
      tarefa = tf?.id || null;
    }
    // a promessa feita ao cliente vira transferencia de verdade, na mesma rodada
    let transf: any = null;
    if (cls.resultado === "nao_atendido") transf = await transferir(sb, cfg, { ...L, feedback_resposta: resposta }, insts, dry);
    feitos.push({ ...base, decisao: "classificou", ...cls, tarefa, transferencia: transf, resposta: resposta.slice(0, 200) });
  }
  return feitos;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!GHL) return j({ ok: false, erro: "sem GHL_TOKEN" }, 500);
    const sb = createClient(SUPA_URL, srvKey());
    const sp = new URL(req.url).searchParams;
    const b = await req.json().catch(() => ({} as any));
    const dry = sp.get("dry") === "1" || b.dry === true;
    const umId = parseInt(String(sp.get("lead") || b.lead || "0")) || 0;
    const acao = String(sp.get("acao") || b.acao || "tudo").toLowerCase();

    const { data: cfgRows } = await sb.from("copiloto_config").select("*");
    const cfg: Record<string, string> = {}; (cfgRows || []).forEach((r: any) => cfg[r.chave] = r.valor);
    if (String(cfg.copiloto_ativo || "sim").toLowerCase() === "nao") return j({ ok: true, desligado: "copiloto_ativo=nao" });
    if (!umId && String(cfg.feedback_ativo || "sim").toLowerCase() !== "sim") return j({ ok: true, desligado: "feedback_ativo=nao" });

    const insts = await instancias(sb);
    const out: any = { ok: true, modo: dry ? "previa" : "rodando" };
    if (acao === "perguntar" || acao === "tudo") out.perguntar = await perguntar(sb, cfg, dry, umId);
    if (acao === "ler" || acao === "tudo") out.ler = await ler(sb, cfg, dry, umId, insts);
    if (acao === "ler" || acao === "tudo" || acao === "transferir") out.transferir = await transferirPendentes(sb, cfg, insts, dry, umId);
    return j(out);
  } catch (e) { return j({ ok: false, erro: String(e) }, 500); }
});
