// copiloto-feedback (v2) — o retorno vem do CLIENTE, porque do representante nao vem.
//
// v2: o telefone da tarefa vem do CRM, nao da coluna. copiloto_lead.fone foi gravado decapitado ate
//     a copiloto-lead v9 e o gestor recebia um numero que nao existe — justamente no aviso de que o
//     representante nao atendeu, que e quando alguem vai LIGAR para o cliente.
//
// Buraco apontado pelo gestor em 14/09: quando o lead vai para representante, a conversa continua no
// WhatsApp PESSOAL dele, fora do nosso CRM. Nao da para ver se ligou, se marcou, se vendeu. Entao a
// unica fonte de verdade e o proprio cliente, e a pergunta se faz a ele — 3 a 5 dias depois do
// repasse (feedback_dias). Antes disso a resposta e sempre "ainda nao": o representante precisa de
// tempo para ligar e o cliente precisa de tempo para ter o que contar.
//
// SO PARA LEAD QUE FOI A REPRESENTANTE (feedback_tipos = 'fisica'). Quando vai para a venda interna,
// a conversa acontece nas NOSSAS instancias e da para ler no CRM — perguntar ali e redundante e
// incomoda o cliente.
//
// DUAS PASSADAS:
//   ?acao=perguntar — manda a pergunta a quem esta na janela, e o reforco a quem nao respondeu.
//   ?acao=ler       — le a resposta, classifica e grava. "nao_atendido" vira TAREFA, que a
//                     copiloto-entrega leva ao gestor: e o unico jeito de a gente descobrir que o
//                     representante nao ligou.
// Sem ?acao roda as duas. ?dry=1 mostra sem mandar e sem gravar. ?lead=<id> forca um lead.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GHL = (Deno.env.get("GHL_TOKEN") || "").trim();
const LOC = "rZ8y7lzqV7fzxsartaX2";
const MODELO = "claude-sonnet-5";

const digits = (s: any) => String(s || "").replace(/\D/g, "");
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

async function enviarZaptos(contact_id: string | null, fone: string, texto: string, instancia: string) {
  const body: any = { canal: "whatsapp", texto, instancia };
  if (contact_id) body.contact_id = contact_id; else body.fone = fone;
  const r = await fetch(SUPA_URL + "/functions/v1/campanhas-enviar", { method: "POST", headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return await r.json().catch(() => ({ ok: false, motivo: "resposta ilegivel do campanhas-enviar" }));
}

// ---- os textos, em codigo ----------------------------------------------------------------------
// Pergunta curta e de mao dupla: serve tanto para "ja falou" quanto para "ninguem falou". A segunda
// metade e a que importa — e o unico jeito de o cliente nos dizer que foi esquecido.
function textoPergunta(L: any): string {
  const nome = String(L.nome || "").trim().split(/\s+/)[0] || "";
  return [
    (nome ? "Oi, " + nome + "! " : "Oi! ") + "Aqui e a Nina, da Nitron.",
    "",
    "Passei seu contato para o nosso representante da regiao uns dias atras e queria saber de voce: ele chegou a falar com voce?",
    "",
    "Se ja falou, me conta rapidinho como foi. E se ainda nao falou, me avisa que eu resolvo isso por aqui.",
  ].join("\n");
}
function textoReforco(L: any): string {
  const nome = String(L.nome || "").trim().split(/\s+/)[0] || "";
  return [
    (nome ? nome + ", " : "") + "so um oi rapido para nao te deixar no vacuo:",
    "",
    "o representante da sua regiao chegou a te procurar? Responde so sim ou nao que ja me ajuda — se foi nao, eu passo para outro consultor hoje mesmo.",
  ].join("\n");
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
  const dias = Math.max(1, parseInt(cfg.feedback_dias || "3") || 3);
  const reforcoH = Math.max(6, parseInt(cfg.feedback_reforco_h || "48") || 48);
  const toquesMax = Math.max(1, parseInt(cfg.feedback_toques_max || "2") || 2);
  const limite = Math.min(parseInt(cfg.feedback_limite || "3") || 3, 20);
  const tipos = lista(cfg.feedback_tipos, "fisica");

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
    // canal oficial da Meta: passados 3 dias a janela de 24h ja fechou e texto livre nao passa
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

// ---- passada 2: ler a resposta -----------------------------------------------------------------
async function ler(sb: any, cfg: Record<string, string>, dry: boolean, umId: number) {
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
          ? "O CLIENTE DIZ QUE NINGUEM FALOU COM ELE. O representante nao atendeu o lead."
          : "O cliente perdeu o interesse depois do repasse.",
        "Resposta dele: \"" + resposta.slice(0, 400) + "\"",
        "",
        "Decisao do gestor: passar para outro consultor, ou cobrar o representante.",
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
    feitos.push({ ...base, decisao: "classificou", ...cls, tarefa, resposta: resposta.slice(0, 200) });
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

    const out: any = { ok: true, modo: dry ? "previa" : "rodando" };
    if (acao !== "ler") out.perguntar = await perguntar(sb, cfg, dry, umId);
    if (acao !== "perguntar") out.ler = await ler(sb, cfg, dry, umId);
    return j(out);
  } catch (e) { return j({ ok: false, erro: String(e) }, 500); }
});
