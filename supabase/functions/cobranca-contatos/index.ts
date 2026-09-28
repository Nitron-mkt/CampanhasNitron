// cobranca-contatos (v1) — so os CONTATOS de um representante ou de um cliente. Sem IA, sem
// audiencia, sem consolidacao por matriz.
//
// POR QUE ELA EXISTE. Os quadros do PIX antecipado e do pedido recusado pediam os contatos ao
// campanhas-cobranca (?msg=<codparc>&publico=...), que e a tela da DUPLICATA VENCIDA. Aquela funcao
// so responde por quem esta na audiencia dela: se o cliente nao tem titulo VENCIDO, ela devolve
// {"erro":"grupo sem vencido"} e a tela mostrava "nenhum contato encontrado".
// O PIX antecipado e exatamente o caso oposto — titulo aberto, ainda DENTRO do prazo. Os dois
// quadros do PIX nunca iam funcionar por ali; o de recusa funcionou por acaso, nos clientes que
// tambem tinham vencido. Achado em 28/09, com o gestor tentando disparar.
//
// MESMA FONTE E MESMOS ROTULOS do campanhas-cobranca, de proposito (mesma regra do trio
// preview/roteiro/comunicado): ao REP, snap_rep (celular, fone do parceiro, e-mail Sankhya e CRM);
// ao CLIENTE, snap_contato + ghl_contato. Nao le rep_contato_extra — os contatos manuais de la sao
// internos e estao desligados desde 28/08 (custaram 6 de 10 Zaptos do Clube em 27/08).
//
// SEM consolidacao por matriz: aqui o titulo e de UMA loja, e o nome tem de ser o da loja do
// titulo. Consolidar traria o erro de casar nome de uma loja com contato de outra.
//
// Aceita varios de uma vez (?codvends=51,19 ou ?codparcs=100,200) para o envio em lote da tela
// fazer UMA chamada em vez de N.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const digits = (s: any) => String(s || "").replace(/\D/g, "");

// Copia literal do campanhas-cobranca: mesma deduplicacao (o mesmo numero com e sem +55 e um so).
function pushCanal(out: any[], seen: any, canal: string, valor: any, funcao: string, origem: string) {
  const v = String(valor || "").trim();
  if (!v) return;
  const k = canal + "|" + (canal === "email" ? v.toLowerCase() : digits(v).replace(/^0+/, "").replace(/^55/, ""));
  if (seen[k]) return;
  seen[k] = 1;
  out.push({ canal, valor: v, funcao, origem });
}
const nums = (p: URLSearchParams, ...chaves: string[]) => {
  const brutos: string[] = [];
  chaves.forEach((c) => { const v = p.get(c); if (v) brutos.push(...v.split(",")); });
  return Array.from(new Set(brutos.map((x) => Number(String(x).trim())).filter((x) => Number.isFinite(x) && x > 0)));
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const key = srvKey();
    if (!key) return j({ ok: false, erro: "sem chave de servico (SRV_JWT)" });
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, key);
    const p = new URL(req.url).searchParams;
    const publico = (p.get("publico") || "cliente") === "rep" ? "rep" : "cliente";
    const itens: Record<string, any> = {};

    if (publico === "rep") {
      const cods = nums(p, "codvend", "codvends");
      if (!cods.length) return j({ ok: false, erro: "informe codvend" });
      const { data, error } = await sb.from("snap_rep").select("codvend,rep,celular,fone_parc,email,email_crm").in("codvend", cods);
      if (error) throw error;
      const by: Record<string, any> = {};
      (data || []).forEach((r: any) => { by[String(r.codvend)] = r; });
      cods.forEach((c) => {
        const r = by[String(c)];
        const out: any[] = [], seen: any = {};
        if (r) {
          pushCanal(out, seen, "whatsapp", r.celular, "Rep", "Sankhya");
          pushCanal(out, seen, "whatsapp", r.fone_parc, "Rep", "Sankhya");
          pushCanal(out, seen, "email", r.email, "Rep", "Sankhya");
          pushCanal(out, seen, "email", r.email_crm, "Rep", "CRM");
        }
        itens[String(c)] = {
          nome: r?.rep || null,
          contatos: out,
          aviso: !r ? "representante fora do snapshot do Sankhya" : (out.length ? null : "representante sem telefone nem e-mail no cadastro"),
        };
      });
    } else {
      const cods = nums(p, "codparc", "codparcs");
      if (!cods.length) return j({ ok: false, erro: "informe codparc" });
      const [sc, gc] = await Promise.all([
        sb.from("snap_contato").select("codparc,funcao,nome,fone,email").in("codparc", cods),
        sb.from("ghl_contato").select("codparc,nome,fone,email").in("codparc", cods),
      ]);
      if (sc.error) throw sc.error;
      if (gc.error) throw gc.error;
      const porParc: Record<string, { out: any[]; seen: any; nome: string | null }> = {};
      cods.forEach((c) => { porParc[String(c)] = { out: [], seen: {}, nome: null }; });
      (sc.data || []).forEach((ct: any) => {
        const b = porParc[String(ct.codparc)]; if (!b) return;
        if (!b.nome && ct.nome) b.nome = ct.nome;
        pushCanal(b.out, b.seen, "whatsapp", ct.fone, ct.funcao || "Contato", "Sankhya");
        pushCanal(b.out, b.seen, "email", ct.email, ct.funcao || "Contato", "Sankhya");
      });
      (gc.data || []).forEach((g: any) => {
        const b = porParc[String(g.codparc)]; if (!b) return;
        if (!b.nome && g.nome) b.nome = g.nome;
        pushCanal(b.out, b.seen, "whatsapp", g.fone, "CRM", "CRM");
        pushCanal(b.out, b.seen, "email", g.email, "CRM", "CRM");
      });
      cods.forEach((c) => {
        const b = porParc[String(c)];
        itens[String(c)] = { nome: b.nome, contatos: b.out, aviso: b.out.length ? null : "cliente sem telefone nem e-mail cadastrado" };
      });
    }

    const semContato = Object.keys(itens).filter((k) => !itens[k].contatos.length);
    return j({ ok: true, publico, total: Object.keys(itens).length, sem_contato: semContato.length, itens });
  } catch (e: any) {
    const msg = [e?.message, e?.details, e?.hint, e?.code].filter(Boolean).join(" · ") || String(e);
    console.error("cobranca-contatos falhou:", msg);
    // HTTP 200 de proposito: o postJSON/getJSON do painel descarta o corpo fora de 2xx.
    return j({ ok: false, erro: msg });
  }
});
