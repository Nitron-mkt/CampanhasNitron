// nina-poslink (v1) — MANDOU O LINK E NAO PEDIU EM 3h: PERGUNTA O QUE ACONTECEU.
//
// Ordem do gestor em 28/10: "mandou o link e nao fez o pedido em ate 3h, pergunte e saiba o que
// aconteceu, se precisa de ajuda ou algo assim".
//
// O que motivou: em 28/10, ate as 15h30, 9 leads ABRIRAM a pagina de pedido e nenhum concluiu —
// e SEIS deles nao receberam mensagem nenhuma depois de abrir. O Erick abriu as 08h39 e a ultima
// fala da Nina era das 06h02; o Janjao abriu as 12h59 com a ultima fala das 08h50. Abrir a pagina
// e o sinal mais quente que existe aqui (o cara clicou, viu os precos e saiu sem fechar) e nada
// no sistema lia isso: o `seguir` do copiloto-lead conta tempo desde a ULTIMA MENSAGEM, nao desde
// o link nem desde a visita, entao quem abriu ha quatro horas era tratado igual a quem nunca
// clicou.
//
// POR QUE E FUNCAO SEPARADA, e nao mais uma acao do copiloto-lead:
//   1. O copiloto-lead tem 83 mil caracteres e a ferramenta de deploy exige mandar o arquivo
//      inteiro numa chamada so — ja esta no limite do que passa.
//   2. Isto e comportamento NOVO que fala sozinho. Depois de 16/09 ("NADA FALA SOZINHO"), uma
//      regra dessas tem de poder ser desligada sem publicar por cima da funcao que esta
//      atendendo lead ao vivo. Aqui basta `poslink_ativo='nao'` — ou derrubar o cron.
//
// TRES TRAVAS QUE EXISTEM POR CAUSA DE ERRO JA COMETIDO AQUI:
//   - JANELA DE 48h (`poslink_janela_h`). Sem ela a primeira rodada pegaria TODO lead que um dia
//     recebeu link — eram 18, varios de semanas atras. Tocar em quem recebeu link ha duas semanas
//     nao e "seguimento de 3h", e abordagem fria, e nao foi isso que o gestor pediu.
//   - SILENCIO MINIMO (`poslink_silencio_min`, 90 min). O `seguir` do copiloto-lead roda de 5 em
//     5 min e toca em quem esta ha 3h sem resposta — exatamente a mesma faixa. Sem esta trava o
//     lead levaria DUAS mensagens nossas quase juntas, uma de cada rotina.
//   - A ULTIMA MENSAGEM NAO PODE SER DELE. Se ele escreveu e ninguem respondeu ainda, quem atende
//     e o caminho normal do copiloto-lead. Entrar por cima seria atropelar a conversa — foi o que
//     a Nina fez com o representante em 16/09.
//   - TETO DE MENSAGENS ESPONTANEAS EM 24h (`poslink_max_dia`, 2). Esta trava nasceu da conversa
//     da StarLuz (lead 564), conferida em 28/10 antes de ligar a regra: a Nina ja tinha mandado
//     TRES mensagens espontaneas para a Ana Luiza em 12h — uma as 21h10 e DUAS quase identicas as
//     08h23 e 08h26, com 3 minutos de diferenca — enquanto o `toques` do lead marcava 2. E a lead
//     ainda tinha escrito "estou finalizando os ultimos ajustes com minha socia e em breve
//     retornarei". Sem este teto, o toque pos-link seria a QUARTA.
//     Conta na propria conversa do CRM, nao num contador nosso, e conta SO O QUE E ESPONTANEO:
//     a primeira versao contava toda mensagem nossa e calou 8 dos 10 candidatos da previa, porque
//     lead em conversa viva acumula 5 ou 6 mensagens nossas por dia que sao RESPOSTAS. Responder
//     nao e insistir.
//
// O MODELO AQUI NAO TEM FERRAMENTA. De proposito: este toque e uma pergunta, nao uma rodada de
// qualificacao. Sem ferramenta ele nao reescreve lead, nao abre tarefa e nao monta link novo —
// e portanto nao tem como inventar preco, praca ou compromisso. O que ele produz e UMA frase.
//
// ELE SABE SE O LEAD ABRIU A PAGINA, E ESTA PROIBIDO DE DIZER ISSO. A informacao serve para
// escolher o angulo ("ficou alguma duvida no que voce viu" x "conseguiu abrir o link"), nunca
// para ser dita: "vi que voce entrou na pagina as 12h59" e vigilancia, e o lojista le como tal.
//
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GHL = (Deno.env.get("GHL_TOKEN") || "").trim();
const LOC = "rZ8y7lzqV7fzxsartaX2";
const MODELO = "claude-sonnet-5";

const digits = (s: any) => String(s || "").replace(/\D/g, "");
const norm = (s: any) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const prim = (s: any) => (String(s || "").trim().split(/\s+/)[0] || String(s || ""));
function hojeBRT(): string { const d = new Date(Date.now() - 3 * 3600 * 1000); const p = (n: number) => String(n).padStart(2, "0"); return p(d.getUTCDate()) + "/" + p(d.getUTCMonth() + 1) + "/" + d.getUTCFullYear(); }

function limpa(t: any): string { return String(t || "").replace(/Instance Source:.*/is, "").replace(/#contact_instance:\S+/gi, "").replace(/\s+/g, " ").trim(); }
// mesma lista do copiloto-lead: autoresposta da loja DELE nao e "ele respondeu". A Natalie caiu
// nesse vao em 10/09 — o robo dela respondia e o seguimento achava que a conversa estava viva.
const RE_RUIDO = /(codigo de confirmacao|undecryptable|descriptografar|ative as listas|agradece(mos)? (seu contato|sua mensagem)|atendente virtual|horario de atendimento|entraremos em contato|selecione (a|uma|um) (opcao|assunto)|(estou|estamos) indisponive|nao (estou|estamos) disponive|retornare(i|mos) assim que|respondere(i|mos) assim que|ouvidoria|mensagem automatica)/;
const ehRuido = (t: any) => RE_RUIDO.test(norm(t));

const ghl = (m: string, p: string, v = "2021-07-28", body?: any) => fetch("https://services.leadconnectorhq.com" + p, { method: m, headers: { Authorization: "Bearer " + GHL, Version: v, Accept: "application/json", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

async function anthropic(system: string, messages: any[]): Promise<any> {
  const key = Deno.env.get("ANTHROPIC_API_KEY"); if (!key) throw new Error("sem ANTHROPIC_API_KEY");
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: MODELO, max_tokens: 600, system, messages }) });
  if (!r.ok) throw new Error("anthropic " + r.status + " " + (await r.text()).slice(0, 300));
  return await r.json();
}

async function enviar(contact_id: string, texto: string, instancia: string) {
  const r = await fetch(SUPA_URL + "/functions/v1/campanhas-enviar", {
    method: "POST", headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ canal: "whatsapp", texto, instancia, contact_id }),
  });
  return await r.json().catch(() => ({ ok: false, motivo: "resposta ilegivel do campanhas-enviar" }));
}

// Instancia caida: pausa na PRIMEIRA recusa. Mesma licao de 02/10 — sem isto a rodada seguinte
// escreve outra mensagem, e a seguinte outra, e o lead ve a Nina monologando quando religarem.
async function pausarInstancia(sb: any, instancia: string, motivo: string) {
  if (!instancia) return { ok: false };
  try {
    const { error } = await sb.from("instancia_ghl")
      .update({ pausada_em: new Date().toISOString(), pausada_motivo: motivo.slice(0, 400) })
      .eq("instancia", instancia).is("pausada_em", null);
    return { ok: !error };
  } catch (_e) { return { ok: false }; }
}
async function instanciasPausadas(sb: any): Promise<Set<string>> {
  try {
    const { data } = await sb.from("instancia_ghl").select("instancia").not("pausada_em", "is", null);
    return new Set((data || []).map((x: any) => norm(x.instancia)));
  } catch (_e) { return new Set(); }
}

async function licoes(sb: any): Promise<string> {
  try {
    const { data } = await sb.from("copiloto_licoes").select("licao").eq("ativo", true).order("id");
    const ls = (data || []).map((r: any) => "- " + r.licao);
    return ls.length ? "\n\nLICOES DO GESTOR (tem PRIORIDADE, siga a risca):\n" + ls.join("\n") : "";
  } catch (_e) { return ""; }
}

// Horario de Sao Paulo, fixo. O toque e iniciativa NOSSA: fora da janela ele espera. Domingo nao.
function foraDaJanela(cfg: Record<string, string>): string | null {
  const brt = new Date(Date.now() - 3 * 3600 * 1000);
  const dow = brt.getUTCDay(); const h = brt.getUTCHours();
  if (dow === 0) return "domingo";
  const ini = Math.max(0, parseInt(cfg.poslink_hora_ini || "8") || 8);
  const fim = Math.min(23, parseInt(cfg.poslink_hora_fim || "20") || 20);
  if (h < ini || h >= fim) return "fora de " + ini + "h-" + fim + "h de Sao Paulo (agora " + h + "h)";
  return null;
}

const hhmm = (ms: number) => { const h = Math.floor(ms / 3600000); const m = Math.round((ms % 3600000) / 60000); return h > 0 ? (h + "h" + (m ? String(m).padStart(2, "0") : "")) : (m + "min"); };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!GHL) return j({ ok: false, erro: "sem GHL_TOKEN" }, 500);
    const sb = createClient(SUPA_URL, srvKey());
    const sp = new URL(req.url).searchParams;
    const b = await req.json().catch(() => ({} as any));
    const dry = sp.get("dry") === "1" || b.dry === true;
    const soLead = parseInt(sp.get("lead") || b.lead || "0") || 0;

    const { data: cfgRows } = await sb.from("copiloto_config").select("*");
    const cfg: Record<string, string> = {}; (cfgRows || []).forEach((r: any) => cfg[r.chave] = r.valor);
    if (String(cfg.copiloto_ativo || "sim").toLowerCase() === "nao") return j({ ok: true, desligado: "copiloto_ativo=nao" });

    const ativo = String(cfg.poslink_ativo || "nao").toLowerCase() === "sim";
    const inst = String(cfg.lead_inst || cfg.nome_assistente || "Nina").split(",")[0].trim();
    const horas = Math.max(1, parseFloat(cfg.poslink_horas || "3") || 3);
    const janelaH = Math.max(horas + 1, parseFloat(cfg.poslink_janela_h || "48") || 48);
    const maxVezes = Math.max(1, Math.min(3, parseInt(cfg.poslink_max || "1") || 1));
    const lote = Math.max(1, Math.min(15, parseInt(cfg.poslink_lote || "5") || 5));
    const silencioMin = Math.max(0, parseInt(cfg.poslink_silencio_min || "90") || 0);
    const maxDia = Math.max(1, parseInt(cfg.poslink_max_dia || "2") || 2);
    const pedidoMin = parseInt(digits(cfg.pedido_minimo || "3500")) || 3500;
    const erroEsperaMin = Math.max(5, parseInt(cfg.lead_erro_espera_min || "120") || 120);

    // instancia pausada nao tenta NADA. O campanhas-enviar filtra por `ativa`, nao por pausa.
    const pausadas = await instanciasPausadas(sb);
    if (pausadas.has(norm(inst))) return j({ ok: true, instancia: inst, pausado: true, motivo: "instancia '" + inst + "' esta pausada em instancia_ghl — nada foi enviado" });

    const fora = foraDaJanela(cfg);
    if (fora && !dry && !soLead) return j({ ok: true, instancia: inst, fora_da_janela: fora, enviou: 0 });

    const agora = Date.now();
    let q = sb.from("copiloto_lead").select("*")
      .not("link_em", "is", null)
      .in("status", ["qualificando", "qualificado"])
      .lt("poslink_vezes", maxVezes)
      .lt("link_em", new Date(agora - horas * 3600000).toISOString())
      .gt("link_em", new Date(agora - janelaH * 3600000).toISOString())
      .order("link_em", { ascending: true }).limit(40);
    if (soLead) q = sb.from("copiloto_lead").select("*").eq("id", soLead).limit(1);
    const { data: cands, error: eq } = await q;
    if (eq) return j({ ok: false, erro: eq.message }, 500);

    const lic = await licoes(sb);
    const feitos: any[] = [];
    let mandados = 0;

    for (const L of (cands || [])) {
      if (mandados >= lote) break;
      const base = { lead_id: L.id, quem: L.empresa || L.nome || L.fone, praca: [L.cidade, L.uf].filter(Boolean).join("/") };
      if (!L.contact_id) { feitos.push({ ...base, decisao: "pular", motivo: "lead sem contact_id" }); continue; }

      // JA PEDIU: nada a perguntar. Linha descartada nao conta como pedido.
      const { data: peds } = await sb.from("pedido_recebido").select("codigo, total, status").eq("lead_id", L.id).neq("status", "descartado").limit(1);
      if (peds && peds.length) { feitos.push({ ...base, decisao: "pular", motivo: "ja fez pedido (" + peds[0].codigo + ")" }); continue; }

      // NAO ATROPELAR O `seguir` DO COPILOTO-LEAD: se a gente falou ha pouco, espera.
      const desdeNossa = L.ultima_resposta_em ? (agora - new Date(L.ultima_resposta_em).getTime()) / 60000 : Infinity;
      if (desdeNossa < silencioMin) { feitos.push({ ...base, decisao: "pular", motivo: "falamos com ele ha " + Math.round(desdeNossa) + "min (silencio minimo " + silencioMin + "min)" }); continue; }

      // envio recusado ha pouco (fixo, dono errado no CRM, numero sem WhatsApp): de molho.
      if (L.envio_erro_em && (agora - new Date(L.envio_erro_em).getTime()) / 60000 < erroEsperaMin) {
        feitos.push({ ...base, decisao: "pular", motivo: "envio recusado ha pouco (" + String(L.envio_erro || "").slice(0, 70) + ")" }); continue;
      }

      const rc = await ghl("GET", `/conversations/search?locationId=${LOC}&contactId=${L.contact_id}&limit=1`);
      if (!rc.ok) { feitos.push({ ...base, decisao: "erro", motivo: "GHL " + rc.status }); continue; }
      const cv = (((await rc.json().catch(() => ({})))?.conversations) || [])[0];
      if (!cv) { feitos.push({ ...base, decisao: "pular", motivo: "conversa nao encontrada" }); continue; }

      // A ULTIMA E DELE: quem responde e o caminho normal. Entrar aqui seria falar por cima.
      const ultimaDele = String(cv.lastMessageDirection) === "inbound";
      if (ultimaDele && !ehRuido(limpa(cv.lastMessageBody))) { feitos.push({ ...base, decisao: "pular", motivo: "ele escreveu e ainda nao foi respondido — o copiloto-lead cuida" }); continue; }

      const rm = await ghl("GET", `/conversations/${cv.id}/messages?limit=25`, "2021-04-15");
      if (!rm.ok) { feitos.push({ ...base, decisao: "erro", motivo: "GHL " + rm.status + " nas mensagens" }); continue; }
      const arr = (((await rm.json().catch(() => ({})))?.messages?.messages) || []) as any[];
      const msgs = arr.slice().reverse().filter((m: any) => String(m?.body || "").trim() && !/^#contact_instance|^\[System\]/i.test(String(m.body)));
      if (!msgs.length) { feitos.push({ ...base, decisao: "pular", motivo: "sem historico legivel" }); continue; }

      // TETO DE 24h, contado NA CONVERSA e nao num contador nosso. O `toques` do copiloto_lead ja
      // mentiu: na StarLuz ele marcava 2 enquanto a conversa tinha TRES mensagens espontaneas em
      // 12h (duas delas com 3 minutos de diferenca, texto quase igual). Contador proprio so sabe o
      // que a propria rotina fez; a conversa sabe o que o lead de fato RECEBEU.
      //
      // CONTA SO MENSAGEM ESPONTANEA, nao toda mensagem nossa. A primeira versao desta trava
      // contava tudo e, na previa de 28/10, calou 8 dos 10 candidatos: leads no meio de uma
      // conversa viva (Villa Nova, Loja GV) apareciam com 5 e 6 mensagens nossas em 24h, que eram
      // RESPOSTAS ao que eles escreveram. Responder nao e insistir. Espontanea e a mensagem cuja
      // anterior na conversa tambem e nossa — ou seja, falamos duas vezes sem ele falar no meio.
      let espontaneas = 0; let nossas24h = 0;
      for (let i = 0; i < msgs.length; i++) {
        const m: any = msgs[i];
        if (String(m.direction) !== "outbound") continue;
        if ((agora - new Date(m.dateAdded || 0).getTime()) >= 24 * 3600000) continue;
        nossas24h++;
        const ant: any = msgs[i - 1];
        if (!ant || String(ant.direction) === "outbound") espontaneas++;
      }
      if (espontaneas >= maxDia) { feitos.push({ ...base, decisao: "pular", motivo: "ja mandamos " + espontaneas + " mensagens espontaneas a ele nas ultimas 24h (teto " + maxDia + "; " + nossas24h + " no total, o resto foi resposta)" }); continue; }

      // Abriu a pagina depois de receber o link? Informacao INTERNA: escolhe o angulo, nunca e dita.
      const { count: aberturas } = await sb.from("pedido_visita").select("id", { count: "exact", head: true }).eq("lead_id", L.id).gt("em", L.link_em);
      const abriu = Number(aberturas || 0);
      const desdeLink = agora - new Date(L.link_em).getTime();
      const vez = Number(L.poslink_vezes || 0) + 1;

      const sys = `Voce e a ${prim(cfg.nome_assistente || inst || "Nina")}, do time comercial da Nitronplast (Nitron), por WhatsApp. Calorosa e natural, pessoa de verdade da equipe.`
        + `\n\nESTILO (pessoa de verdade, nao IA): frases curtas e naturais, sem negrito, sem listas, sem textao, emoji quase nunca. NAO diga que e IA/bot.`
        + `\n\nHOJE e ${hojeBRT()} (data atual REAL; datas de 2026 sao normais).`
        + `\n\nO QUE ESTA ACONTECENDO: voce mandou a ele o link da pagina de pedido ha ${hhmm(desdeLink)} e ele NAO concluiu nenhum pedido. Ordem do gestor em 28/10: nesse caso voce pergunta o que aconteceu e oferece ajuda. Escreva UMA mensagem curta com esse proposito e mais nada.`
        + (abriu > 0
          ? `\n\nELE ABRIU A PAGINA (informacao INTERNA — voce NAO PODE dizer que sabe disso, nem citar horario, nem dizer "vi que voce entrou". Dizer isso e invasivo e o lojista le como vigilancia). Use so para escolher o angulo: pergunte se ficou alguma duvida no que ele viu, se faltou algum produto na lista, ou se ele quer ajuda para montar.`
          : `\n\nELE AINDA NAO ABRIU A PAGINA (informacao INTERNA — nao diga que sabe disso). Angulo: pergunte se ele conseguiu abrir o link, de leve, porque as vezes o link se perde no meio da conversa.`)
        + `\n\nCOMO ESCREVER:`
        + `\n- UMA pergunta so, facil de responder.`
        + `\n- Ofereca ajuda CONCRETA: montar a lista junto com ele, tirar duvida de produto, explicar como funciona o envio do pedido.`
        + `\n- SEM cobranca, SEM pressa, SEM escassez. Nada de "so hoje", "ultimas unidades", "nao perca". Nada de cobrar resposta.`
        + `\n- NAO mande o link de novo nesta mensagem. Se ele responder que perdeu, ai sim a gente remanda.`
        + `\n- NAO repita o que voce ja disse na conversa: leia o historico e troque de angulo.`
        + `\n- Se ele ja tinha dito algum motivo (vai ver com o socio, esta sem verba, achou caro), RECONHECA esse motivo em vez de ignorar.`
        + `\n\nO QUE VOCE PODE DIZER: que o desconto por volume ja esta impresso na propria pagina e entra sozinho no total (10% a partir de R$ 5.000), e que o pedido minimo e R$ ${pedidoMin.toLocaleString("pt-BR")}.`
        + `\n\nO QUE VOCE NAO DIZ, NUNCA: percentual de frete, quanto do preco e frete, prazo ou data de entrega, nenhum desconto ou condicao alem do que esta na pagina, e nenhuma tabela especial. O preco da tela ja e o final para a praca dele, com entrega inclusa — isso voce pode dizer; abrir a conta, nao.`
        + (vez >= maxVezes ? `\n\nESTE E O ULTIMO TOQUE sobre o link. Deixe a porta aberta com um motivo concreto para ele voltar, mas NAO se despeca e nao diga "fico a disposicao" e pare por ai.` : "")
        + lic;

      const messages: any[] = [{ role: "user", content: msgs.map((m: any) => (m.direction === "inbound" ? "CONTATO: " : "VOCE (Nitron): ") + limpa(m.body).slice(0, 400)).join("\n") + "\n\n(Escreva SO a proxima mensagem sua, sem prefixo.)" }];
      let texto = "";
      try {
        const resp = await anthropic(sys, messages);
        texto = (resp.content || []).filter((x: any) => x.type === "text").map((x: any) => x.text).join("\n").trim();
      } catch (e) { feitos.push({ ...base, decisao: "erro", motivo: String(e).slice(0, 180) }); continue; }
      if (!texto) { feitos.push({ ...base, decisao: "erro", motivo: "o modelo nao devolveu texto" }); continue; }

      if (dry || !ativo) {
        feitos.push({ ...base, decisao: "previa", vez, horas_desde_o_link: Number((desdeLink / 3600000).toFixed(1)), abriu_a_pagina: abriu > 0, espontaneas_24h: espontaneas, nossas_24h: nossas24h, cesta: L.link_seg, rascunho: texto });
        mandados++; continue;
      }

      const env = await enviar(String(L.contact_id), texto, inst);
      if (!env?.ok) {
        if (env?.instancia_caiu) {
          const p = await pausarInstancia(sb, inst, "queda detectada no toque pos-link: " + String(env?.recusado || env?.motivo || "").slice(0, 200));
          feitos.push({ ...base, decisao: "instancia_caiu", instancia_pausada: p.ok, motivo: env?.recusado || env?.motivo });
          break; // a instancia e a mesma para todos: nao adianta tentar o proximo
        }
        await sb.from("copiloto_lead").update({ envio_erro: String(env?.motivo || "envio recusado").slice(0, 300), envio_erro_em: new Date().toISOString(), atualizado: new Date().toISOString() }).eq("id", L.id);
        feitos.push({ ...base, decisao: "falhou", motivo: env?.motivo || "envio recusado", texto });
        continue;
      }
      // `ultima_resposta_em` tambem e atualizado: esta mensagem E a nossa ultima fala, e e isso que
      // impede o `seguir` do copiloto-lead de tocar no mesmo lead logo em seguida.
      await sb.from("copiloto_lead").update({
        poslink_em: new Date().toISOString(), poslink_vezes: vez,
        ultima_resposta_em: new Date().toISOString(), atualizado: new Date().toISOString(),
      }).eq("id", L.id);
      feitos.push({ ...base, decisao: "perguntou", vez, horas_desde_o_link: Number((desdeLink / 3600000).toFixed(1)), abriu_a_pagina: abriu > 0, texto });
      mandados++;
    }

    const conta = (k: string) => feitos.filter((x) => x.decisao === k).length;
    return j({
      ok: true, instancia: inst, poslink_ativo: ativo, modo: dry ? "previa" : (ativo ? "perguntando" : "so rascunho (poslink_ativo=nao)"),
      regra: "link mandado ha mais de " + horas + "h, sem pedido, dentro de " + janelaH + "h, no maximo " + maxVezes + " toque(s), teto de " + maxDia + " mensagens espontaneas em 24h",
      fora_da_janela: fora, candidatos: (cands || []).length,
      perguntou: conta("perguntou"), previa: conta("previa"), pulou: conta("pular"), falhou: conta("falhou"), erro: conta("erro"),
      resultado: feitos,
    });
  } catch (e) { return j({ ok: false, erro: String(e) }, 500); }
});
