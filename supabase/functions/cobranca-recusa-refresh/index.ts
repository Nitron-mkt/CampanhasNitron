// cobranca-recusa-refresh (v2) — snapshot dos pedidos REPROVADOS na liberacao do Sankhya.
//
// Pedido do gestor em 25/09: um quadro para avisar o representante do motivo de recusa do pedido.
//
// ONDE A RECUSA VIVE, E ONDE NAO VIVE. O caminho obvio — AD_MOTIVOCANCELAPEDIDO, com seus 16
// motivos, apontada por TGFCAB_EXC.AD_NUCANC — esta MORTO: 40 pedidos no total, todos de 2020/2021,
// e em TGFCAB_EXC o motivo vem nulo em 649 de 649 exclusoes dos ultimos 90 dias. A recusa viva e a
// da LIBERACAO: TSILIB com REPROVADO='S' e TABELA='TGFCAB', onde OBSLIB (a observacao de quem
// reprovou) e o motivo e vem preenchido em 100% dos casos. Medido em 25/09: 55 recusas em 7 dias,
// a mais recente as 10h37 do proprio dia.
//
// UM PEDIDO PODE TER VARIAS LINHAS de liberacao reprovadas (eventos/sequencias diferentes da mesma
// nota). O snapshot consolida por NUNOTA e fica com a reprovacao MAIS RECENTE — senao o mesmo pedido
// aparece duas vezes na tela e duas vezes na mensagem ao representante.
//
// O VENDEDOR: prefere o do PEDIDO (TGFCAB.CODVEND, quem vendeu aquilo) e cai no do parceiro quando
// o pedido vier sem — mesma armadilha do PIX antecipado, onde o titulo vinha com CODVEND=0.
//
// v2 (28/09): agora esta funcao tem um BOTAO no painel ("atualizar do Sankhya", para clicar antes de
//     disparar no manual). Por isso o ERRO VOLTA COMO HTTP 200 com ok:false: o postJSON do painel
//     descarta o corpo quando o status nao e 2xx, e um 500 aparecia na tela como "status 500",
//     escondendo o motivo. Mesma convencao do campanhas-comunicado-cliente; o console.error fica.
//     Ela continua SO LENDO o Sankhya e gravando o snapshot: nao enfileira e nao envia nada.
//
// ?seco=1 mostra o que viria do Sankhya sem gravar nada.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
// Guarda 30 dias no snapshot; a JANELA de quem aparece na tela e da view (recusa_janela_dias, 7).
// Guardar mais do que se mostra e de proposito: da para auditar por que alguem saiu do quadro.
const DIAS_SNAPSHOT = 30;

async function login(base: string, u: string, p: string) {
  const r = await fetch(`${base}/mge/service.sbr?serviceName=MobileLoginSP.login&outputType=json`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceName: "MobileLoginSP.login", requestBody: { NOMUSU: { $: u }, INTERNO: { $: p }, KEEPCONNECTED: { $: "true" } } }) });
  const d = JSON.parse(new TextDecoder("iso-8859-1").decode(await r.arrayBuffer()));
  const s = d?.responseBody?.jsessionid?.$ ?? d?.responseBody?.jsessionid ?? "";
  return { jsession: String(s || ""), cookie: s ? `JSESSIONID=${s}` : "" };
}
async function query(base: string, sess: any, sql: string) {
  let url = `${base}/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json`;
  if (sess.jsession) url += `&mgeSession=${encodeURIComponent(sess.jsession)}`;
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Cookie: sess.cookie }, body: JSON.stringify({ serviceName: "DbExplorerSP.executeQuery", requestBody: { sql } }) });
  const d = JSON.parse(new TextDecoder("iso-8859-1").decode(await r.arrayBuffer()));
  if (String(d?.status) !== "1") throw new Error("Sankhya: " + String(d?.statusMessage).slice(0, 150));
  return (d?.responseBody?.rows ?? []) as any[][];
}

const Q = `WITH r AS (
  SELECT L.NUCHAVE NUNOTA, MAX(L.DHLIB) DHLIB,
         MAX(SUBSTR(L.OBSLIB,1,300)) KEEP (DENSE_RANK FIRST ORDER BY L.DHLIB DESC) MOTIVO,
         MAX(L.CODUSULIB)            KEEP (DENSE_RANK FIRST ORDER BY L.DHLIB DESC) CODUSULIB
    FROM TSILIB L
   WHERE L.REPROVADO = 'S' AND L.TABELA = 'TGFCAB' AND L.DHLIB >= TRUNC(SYSDATE) - ${DIAS_SNAPSHOT}
   GROUP BY L.NUCHAVE)
SELECT r.NUNOTA, CAB.CODPARC, SUBSTR(PAR.NOMEPARC,1,80), REGEXP_REPLACE(PAR.CGC_CPF,'[^0-9]',''),
       NVL(NULLIF(CAB.CODVEND,0), NVL(PAR.CODVEND,0)), VEN.APELIDO, VEN.TIPVEND,
       CAB.VLRNOTA, TO_CHAR(r.DHLIB,'YYYY-MM-DD"T"HH24:MI:SS'), TRUNC(SYSDATE - r.DHLIB),
       r.MOTIVO, U.NOMEUSU
  FROM r
  JOIN TGFCAB CAB ON CAB.NUNOTA = r.NUNOTA
  JOIN TGFPAR PAR ON PAR.CODPARC = CAB.CODPARC
  LEFT JOIN TGFVEN VEN ON VEN.CODVEND = NVL(NULLIF(CAB.CODVEND,0), NVL(PAR.CODVEND,0))
  LEFT JOIN TSIUSU U ON U.CODUSU = r.CODUSULIB
 ORDER BY r.DHLIB DESC`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const seco = new URL(req.url).searchParams.get("seco") === "1";
    const base = (Deno.env.get("SANKHYA_URL") || "").replace(/\/$/, "");
    if (!base) return j({ ok: false, erro: "sem SANKHYA_URL" });
    const sess = await login(base, Deno.env.get("SANKHYA_USER")!, Deno.env.get("SANKHYA_PASS")!);
    const rows = await query(base, sess, Q);

    const lido_em = new Date().toISOString();
    const linhas = rows.map((r) => ({
      nunota: Number(r[0]), codparc: Number(r[1]), cliente: r[2] || null, cnpj: r[3] || null,
      codvend: Number(r[4] || 0), rep: r[5] || null, tipvend: r[6] || null,
      vlrnota: Number(r[7] || 0), dhlib: r[8] ? (String(r[8]) + "Z") : null,
      dias: Number(r[9] || 0), motivo: r[10] || null, liberador: r[11] || null,
      atualizado: lido_em,
    }));
    if (seco) return j({ ok: true, seco: true, total: linhas.length, linhas: linhas.slice(0, 20) });

    const key = srvKey();
    if (!key) return j({ ok: false, erro: "sem chave de servico (SRV_JWT)" });
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, key);

    // Grava primeiro, limpa depois: se o upsert falhar a tabela mantem o retrato anterior em vez de
    // ficar vazia (licao do roteiro-refresh v8).
    if (linhas.length) {
      const { error } = await sb.from("recusa_pedido").upsert(linhas, { onConflict: "nunota" });
      if (error) throw error;
    }
    const vivos = linhas.map((x) => x.nunota);
    const del = vivos.length
      ? await sb.from("recusa_pedido").delete().not("nunota", "in", "(" + vivos.join(",") + ")")
      : await sb.from("recusa_pedido").delete().gte("nunota", 0);
    if (del.error) throw del.error;

    const { data: aptos } = await sb.from("recusa_pedido_apto").select("nunota, rep, instancia, instancia_pausada, venda_interna, vlrnota");
    const A = aptos || [];
    return j({
      ok: true, lido_em, recusados_30d: linhas.length, no_quadro: A.length,
      de_venda_interna: A.filter((x: any) => x.venda_interna).length,
      sem_assistente: A.filter((x: any) => !x.instancia).length,
      instancia_pausada: A.filter((x: any) => x.instancia_pausada).length,
      valor_no_quadro: Math.round(A.reduce((s: number, x: any) => s + Number(x.vlrnota || 0), 0) * 100) / 100,
    });
  } catch (e: any) {
    const msg = [e?.message, e?.details, e?.hint, e?.code].filter(Boolean).join(" · ") || String(e);
    console.error("cobranca-recusa-refresh falhou:", msg);
    // HTTP 200 de proposito: o painel so le o corpo quando o status e 2xx (ver v2 no topo).
    return j({ ok: false, erro: msg });
  }
});
