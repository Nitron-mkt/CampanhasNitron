// cobranca-contatos (v3) — so os CONTATOS de um representante ou de um cliente. Sem IA, sem
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
//
// v2 (28/09) — QUEM DO CLIENTE RECEBE A COBRANCA. Pergunta do gestor: "voce esta mandando para o
// cliente ou para o contato do financeiro dele no Sankhya?". A v1 mandava para TODOS os contatos
// cadastrados, sem distinguir funcao — inclusive Expedicao e Fiscal, que nao tem nada com cobranca.
// Agora a funcao do contato no Sankhya manda:
//   FINANCEIRO (1) > PRINCIPAL (2) > COMPRAS (3) > contato do CRM (4)
// O primeiro de cada canal vem com `preferido: true` — e so esse nasce marcado na tela; os outros
// ficam a um clique.
// NUMEROS DA BASE (28/09): 1.740 clientes tem PRINCIPAL, 546 COMPRAS, so **87** tem FINANCEIRO,
// 45 EXPEDICAO e 37 FISCAL. Entre os 619 clientes com titulo vencido, apenas **6** tem financeiro.
// Por isso o financeiro e PREFERENCIA, nao exigencia: exigir financeiro apagaria a campanha.
//
// v3 (28/09) — EXPEDICAO/FISCAL VOLTAM COMO ULTIMO RECURSO. O gestor fechou a regra desta campanha:
// "o ideal e mandar sempre para o financeiro, mas por ser PIX pode mandar direto para o vendedor ou
// qualquer numero que esteja disponivel". Entao nada e descartado: expedicao e fiscal entram no fim
// da fila (rank 6, `ultimo_recurso: true`) e so sao escolhidos quando nao ha mais nada naquele canal.
// A v2 os jogava fora, o que em cliente sem outro contato virava "sem contato" — pior do que mandar
// para o telefone da expedicao, que pelo menos e a empresa certa.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const digits = (s: any) => String(s || "").replace(/\D/g, "");
// "Expedicao" e "EXPEDIÇÃO" sao a mesma funcao; o cadastro tem as duas grafias.
const chaveFuncao = (f: any) => String(f || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
const RANK: Record<string, number> = { FINANCEIRO: 1, PRINCIPAL: 2, COMPRAS: 3, CRM: 4 };
// Nao sao descartados: vao para o fim da fila e so entram se nao houver mais nada (ver v3).
const ULTIMO_RECURSO = new Set(["EXPEDICAO", "FISCAL"]);
const rankDe = (f: any) => (ULTIMO_RECURSO.has(chaveFuncao(f)) ? 6 : (RANK[chaveFuncao(f)] || 5));

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
        // Mesmo contrato do lado do cliente: o primeiro de cada canal nasce marcado na tela.
        const jaPref: any = {};
        out.forEach((x: any) => { x.ultimo_recurso = false; x.preferido = !jaPref[x.canal]; if (!jaPref[x.canal]) jaPref[x.canal] = 1; });
        itens[String(c)] = {
          nome: r?.rep || null,
          contatos: out,
          ignorados: [],
          aviso: !r ? "representante fora do snapshot do Sankhya" : (out.length ? null : "representante sem telefone nem e-mail no cadastro"),
        };
      });
    } else {
      const cods = nums(p, "codparc", "codparcs");
      if (!cods.length) return j({ ok: false, erro: "informe codparc" });
      // nada e descartado por funcao; a funcao so decide a ORDEM (ver v3)
      const [sc, gc] = await Promise.all([
        sb.from("snap_contato").select("codparc,funcao,nome,fone,email").in("codparc", cods),
        sb.from("ghl_contato").select("codparc,nome,fone,email").in("codparc", cods),
      ]);
      if (sc.error) throw sc.error;
      if (gc.error) throw gc.error;
      type Cand = { canal: string; valor: any; funcao: string; origem: string; rank: number };
      const cand: Record<string, Cand[]> = {};
      const nomes: Record<string, string | null> = {};
      cods.forEach((c) => { cand[String(c)] = []; nomes[String(c)] = null; });
      (sc.data || []).forEach((ct: any) => {
        const k = String(ct.codparc); if (!cand[k]) return;
        if (!nomes[k] && ct.nome) nomes[k] = ct.nome;
        const f = ct.funcao || "Contato", r = rankDe(f);
        [["whatsapp", ct.fone], ["email", ct.email]].forEach((par: any) => {
          if (!String(par[1] || "").trim()) return;
          cand[k].push({ canal: par[0], valor: par[1], funcao: f, origem: "Sankhya", rank: r });
        });
      });
      (gc.data || []).forEach((g: any) => {
        const k = String(g.codparc); if (!cand[k]) return;
        if (!nomes[k] && g.nome) nomes[k] = g.nome;
        cand[k].push({ canal: "whatsapp", valor: g.fone, funcao: "CRM", origem: "CRM", rank: RANK.CRM });
        cand[k].push({ canal: "email", valor: g.email, funcao: "CRM", origem: "CRM", rank: RANK.CRM });
      });
      cods.forEach((c) => {
        const k = String(c);
        // Ordena ANTES de deduplicar: o mesmo numero cadastrado em duas funcoes fica com a melhor.
        const lista = cand[k].slice().sort((a, b) => a.rank - b.rank);
        const out: any[] = [], seen: any = {}, rankDo: Record<string, number> = {};
        lista.forEach((x) => { const antes = out.length; pushCanal(out, seen, x.canal, x.valor, x.funcao, x.origem); if (out.length > antes) rankDo[String(out.length - 1)] = x.rank; });
        // Marca o primeiro de cada canal: e o unico que nasce marcado na tela.
        const jaPref: any = {};
        out.forEach((x: any, idx: number) => {
          x.ultimo_recurso = rankDo[String(idx)] === 6;
          x.preferido = !jaPref[x.canal];
          if (!jaPref[x.canal]) jaPref[x.canal] = 1;
        });
        itens[k] = {
          nome: nomes[k],
          contatos: out,
          ignorados: [], // vazio desde a v3; mantido para nao quebrar quem ja lia o campo
          aviso: out.length ? null : "cliente sem telefone nem e-mail cadastrado",
        };
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
