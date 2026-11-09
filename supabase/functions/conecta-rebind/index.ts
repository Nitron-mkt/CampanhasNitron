// conecta-rebind (v1) — devolve o #contact_instance do contato para a instancia anterior (09/11/2026).
//
// POR QUE EXISTE. O gestor provou em 09/11, no aparelho dele, que o BIND manda na saida: com o dono
// do contato na Camyla, um `#contact_instance: Nina` fez a mensagem sair pela Nina. Entao o convite
// do Conecta pode sair pela Nina sem tocar no `assignedTo` — basta amarrar o contato na Nina antes de
// mandar. A instrucao dele:
//   "quando mandar a mensagem, passe a instancia para a Nina e mande a mensagem e depois troque a
//    instancia novamente para a pessoa que estava antes com o codigo de #contact_instance: a pessoa
//    que estava antes"
//
// O SEGUNDO PASSO NAO E ENFEITE. O bind governa a ENTRADA: se o contato ficar amarrado na Nina, a
// RESPOSTA do cliente cai na conversa da Nina e a assistente que cuida dele para de ver o cliente.
// Devolver o bind e o que mantem o atendimento no lugar depois que o convite sai.
//
// Esta funcao faz SO isso: acha o contato e manda a linha de servico `#contact_instance:<instancia>`,
// esperando o ack do ZaptosWPP ("Contact Instance Updated!") para saber que o app processou. Nao
// manda texto, nao mexe em `assignedTo`, nao cria contato — se o contato nao existir, ela recusa, e e
// isso mesmo: rebind de contato inexistente nao e trabalho dela.
//
// POST { fone, instancia, contact_id?, esperar_ack?: true }
// Erro volta como HTTP 200 com ok:false (convencao do painel).
const API = "https://services.leadconnectorhq.com";
const LOC = "rZ8y7lzqV7fzxsartaX2";
const UA = "Mozilla/5.0 (compatible; NitronCampanhas/1.0)";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const digits = (s: any) => String(s || "").replace(/\D/g, "");
const e164 = (s: any) => { const d = digits(s); return !d ? "" : (d.length <= 11 ? "+55" + d : "+" + d); };
const ACK_MS = Math.max(3000, Number(Deno.env.get("REBIND_ACK_MS")) || 20000);
const POLL_MS = 1500;

function ghl(metodo: string, caminho: string, corpo?: unknown, versao = "2021-07-28") {
  return fetch(API + caminho, {
    method: metodo,
    headers: { Authorization: "Bearer " + Deno.env.get("GHL_TOKEN"), Version: versao, "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
}
const ehAck = (m: any) => /contact\s+instance\s+updated/i.test(String(m?.body || ""));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!Deno.env.get("GHL_TOKEN")) return j({ ok: false, erro: "sem GHL_TOKEN" });
    const b = await req.json().catch(() => ({}));
    const instancia = String(b.instancia || "").trim();
    if (!instancia) return j({ ok: false, erro: "sem instancia para devolver" });
    // o token do aparelho tem de existir no cadastro: bind com token que o app nao conhece nunca
    // recebe ack e deixa o contato amarrado em nada
    const k = srvKey();
    if (k) {
      const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
      const r = await fetch(`${base}/rest/v1/instancia_ghl?select=instancia&ativa=eq.true`, { headers: { apikey: k, Authorization: "Bearer " + k } });
      if (r.ok) {
        const rows = await r.json().catch(() => []);
        const set = new Set((Array.isArray(rows) ? rows : []).map((x: any) => String(x.instancia)));
        if (set.size && !set.has(instancia)) return j({ ok: false, erro: `instancia '${instancia}' fora do cadastro instancia_ghl (ativa)` });
      }
    }

    let cid = String(b.contact_id || "").trim();
    if (!cid) {
      const fone = String(b.fone || "").trim();
      if (!fone) return j({ ok: false, erro: "sem fone nem contact_id" });
      const r = await ghl("GET", `/contacts/?locationId=${LOC}&query=${encodeURIComponent(e164(fone))}&limit=1`);
      const d = await r.json().catch(() => ({}));
      cid = String((d?.contacts || [])[0]?.id || "");
      if (!cid) return j({ ok: false, erro: "contato nao encontrado no CRM", fone });
    }

    const to = b.fone ? e164(b.fone) : undefined;
    const payload: any = { type: "SMS", contactId: cid, message: `#contact_instance:${instancia}` };
    if (to) payload.toNumber = to;
    const r = await ghl("POST", "/conversations/messages", payload, "2021-04-15");
    const txt = (await r.text()).slice(0, 400);
    if (!(r.status >= 200 && r.status < 300)) return j({ ok: false, contactId: cid, erro: `o GHL recusou o bind (${r.status}): ${txt}` });

    let conversa = "", bindId = "";
    try { const d = JSON.parse(txt); conversa = String(d?.conversationId || ""); bindId = String(d?.messageId || ""); } catch { /* corpo inesperado */ }

    // Espera o app confirmar. O ack e INCONDICIONAL (sai tambem quando o contato ja estava na
    // instancia pedida), entao "sem ack" significa de verdade que o comando nao foi processado.
    let ack: any = { confirmado: null, motivo: "sem conversationId/messageId para conferir" };
    if (b.esperar_ack !== false && conversa && bindId) {
      const t0 = Date.now(); let bindAt = 0;
      ack = { confirmado: false, motivo: `o app nao confirmou em ${Math.round(ACK_MS / 1000)}s` };
      while (Date.now() - t0 < ACK_MS) {
        const rc = await ghl("GET", `/conversations/${conversa}/messages?limit=20`, null, "2021-04-15");
        if (rc.ok) {
          const d = await rc.json().catch(() => ({}));
          const msgs = d?.messages?.messages || d?.messages || [];
          if (Array.isArray(msgs)) {
            if (!bindAt) { const bm = msgs.find((m: any) => m?.id === bindId); if (bm?.dateAdded) bindAt = new Date(bm.dateAdded).getTime(); }
            if (bindAt) {
              const a = msgs.find((m: any) => ehAck(m) && m?.dateAdded && new Date(m.dateAdded).getTime() >= bindAt);
              if (a) { ack = { confirmado: true, ms: Date.now() - t0, em: a.dateAdded }; break; }
            }
          }
        }
        await sleep(POLL_MS);
      }
    }
    return j({ ok: true, contactId: cid, instancia, conversa: conversa || undefined, ack });
  } catch (e) {
    return j({ ok: false, erro: String((e as Error).message || e) });
  }
});
