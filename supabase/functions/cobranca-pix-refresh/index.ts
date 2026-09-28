// cobranca-pix-refresh (v4) — snapshot dos titulos PIX ANTECIPADO em aberto no Sankhya.
//
// Pedido do gestor em 25/09: cobranca automatica do PIX antecipado, um quadro para o representante
// e outro para o cliente. O titulo e o CODTIPTIT 57, "PIX – Antecipado"; em aberto e DHBAIXA nula,
// RECDESP=1 e PROVISAO='N'.
//
// v2: TRAZ O CODIGO PIX. O copia-e-cola mora em AD_HYAKRECEBIMENTOSPIX.QRCODE, chaveado pelo MESMO
//     NUFIN do titulo (tabela da integracao Hyak, 615 linhas, QRCODE preenchido em 100% delas).
//     Ele vai na mensagem ao cliente para a pessoa pagar sem pedir a chave a ninguem.
//     A JANELA DE 7 DIAS e o filtro de quem entra nao ficam aqui: moram na view cobranca_pix_apto,
//     para a tela e o disparo lerem a mesma regra. Aqui a gente guarda TUDO o que esta aberto —
//     inclusive o que ja passou de 7 dias e a venda de balcao — senao nao da para auditar depois
//     por que um cliente saiu do quadro.
//
// v3 (28/09): AGORA ESTA FUNCAO TEM UM BOTAO. O gestor pediu um "atualizar do Sankhya" no painel,
//     para clicar ANTES de disparar no manual — os dias em aberto e o codigo PIX tem de ser os do
//     momento, nao os da ultima passada do cron. Duas consequencias:
//     1. ERRO VOLTA COMO HTTP 200 com ok:false. O postJSON do painel descarta o corpo quando o
//        status nao e 2xx, entao um 500 aparecia na tela como "status 500" e escondia o motivo.
//        Mesma convencao do campanhas-comunicado-cliente. O console.error continua.
//     2. valor_no_quadro estava somando `s + 0` — dava 0 sempre, e agora esse numero aparece para
//        quem clicou. Passou a somar o valor de verdade (a coluna entrou no select).
//     Ela continua SO LENDO o Sankhya e gravando o snapshot: nao enfileira e nao envia nada.
//
// v4 (28/09): O QRCODE DO SANKHYA VEM EM BASE64, NAO E O COPIA-E-COLA. Achado ao montar a mensagem
//     de teste para o gestor: AD_HYAKRECEBIMENTOSPIX.QRCODE guarda o BR Code codificado em base64
//     (240 chars que comecam com "MDAwMjAxMDEwMjEy…"), e o que o cliente precisa colar no banco e o
//     conteudo decodificado — "00020101021226820014br.gov.bcb.pix…", 180 chars, CRC16 conferido.
//     Mandar o base64 seria mandar um blob que nenhum aplicativo aceita: o cliente leria "segue o
//     codigo PIX" e nao conseguiria pagar. Mesma familia do erro de 26/08 ("aceito" != "entregue"):
//     o campo existia e parecia certo, so nao era o que a pessoa do outro lado usa.
//     Se o valor nao virar um BR Code de verdade (comeca em 000201), grava NULL e conta em
//     qrcode_ilegivel — a tela ja mostra "sem codigo PIX" e a mensagem cai no "peca a 2a via".
//     Silenciar seria pior: ninguem descobriria olhando a tela.
//
// DUAS COISAS QUE A CONSULTA DESCOBRIU E QUE MUDAM O DESENHO:
// 1. O VENDEDOR VEM DO PARCEIRO, NAO DO TITULO. TGFFIN.CODVEND vinha 0 em 6 dos 9 titulos abertos —
//    e justamente nos maiores (R$ 12.235, R$ 5.733, R$ 3.640). Quem sabe de quem e o cliente e
//    TGFPAR.CODVEND. Usar o do titulo deixaria a maior parte da cobranca sem representante.
// 2. TIPVEND SEPARA REPRESENTANTE DE LOJA. 'R' e representante de rua; 'V' e venda de loja. A view
//    aceita 'R' MAIS os codvend de copiloto_venda_interna (Valeria e Monica), que o gestor mandou
//    incluir em 25/09 porque vendem direto igual representante.
//
// ?seco=1 mostra o que viria do Sankhya sem gravar nada.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const TIPTIT_PIX = 57;

// O Sankhya guarda o BR Code em base64 (ver v4 no topo). Devolve o copia-e-cola, ou null quando o
// que veio nao e reconhecivel como BR Code — melhor sem codigo do que com um codigo que nao paga.
function pixCopiaCola(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (s.startsWith("000201")) return s; // ja veio cru
  try {
    const bin = atob(s.replace(/\s+/g, ""));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const t = new TextDecoder().decode(bytes).trim();
    return t.startsWith("000201") ? t : null;
  } catch {
    return null;
  }
}

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

// Um PIX pode ter mais de uma tentativa de geracao para o mesmo NUFIN; fica a MAIS RECENTE que
// tenha QRCODE (DTRECFASE2 e quando a API devolveu o codigo).
const Q = `SELECT FIN.NUFIN, FIN.CODPARC, SUBSTR(PAR.NOMEPARC,1,80), SUBSTR(PAR.RAZAOSOCIAL,1,80),
  REGEXP_REPLACE(PAR.CGC_CPF,'[^0-9]','') , FIN.NUMNOTA,
  TO_CHAR(FIN.DTNEG,'YYYY-MM-DD'), TO_CHAR(FIN.DTVENC,'YYYY-MM-DD'),
  TRUNC(SYSDATE - FIN.DTNEG), TRUNC(SYSDATE - FIN.DTVENC), FIN.VLRDESDOB,
  NVL(PAR.CODVEND,0), VEN.APELIDO, VEN.TIPVEND,
  NVL((SELECT SUM(F2.VLRDESDOB) FROM TGFFIN F2 WHERE F2.CODPARC = FIN.CODPARC AND F2.RECDESP = 1
        AND F2.DHBAIXA IS NULL AND F2.PROVISAO = 'N' AND F2.DTVENC < TRUNC(SYSDATE)),0),
  NVL((SELECT COUNT(*) FROM TGFFIN F3 WHERE F3.CODPARC = FIN.CODPARC AND F3.RECDESP = 1
        AND F3.DHBAIXA IS NULL AND F3.PROVISAO = 'N' AND F3.DTVENC < TRUNC(SYSDATE)),0),
  (SELECT MAX(PX.QRCODE) KEEP (DENSE_RANK FIRST ORDER BY PX.DTRECFASE2 DESC NULLS LAST, PX.ID DESC)
     FROM AD_HYAKRECEBIMENTOSPIX PX WHERE PX.NUFIN = FIN.NUFIN AND PX.QRCODE IS NOT NULL)
FROM TGFFIN FIN
JOIN TGFPAR PAR ON PAR.CODPARC = FIN.CODPARC
LEFT JOIN TGFVEN VEN ON VEN.CODVEND = PAR.CODVEND
WHERE FIN.CODTIPTIT = ${TIPTIT_PIX} AND FIN.RECDESP = 1 AND FIN.DHBAIXA IS NULL AND FIN.PROVISAO = 'N'
ORDER BY FIN.DTVENC`;

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
      nufin: Number(r[0]), codparc: Number(r[1]), cliente: r[2] || null, razao: r[3] || null,
      cnpj: r[4] || null, numnota: r[5] === null ? null : Number(r[5]),
      dtneg: r[6] || null, dtvenc: r[7] || null,
      dias_aberto: Number(r[8] || 0), dias_venc: Number(r[9] || 0), valor: Number(r[10] || 0),
      codvend: Number(r[11] || 0), rep: r[12] || null, tipvend: r[13] || null,
      venc_total: Number(r[14] || 0), venc_titulos: Number(r[15] || 0),
      qrcode: pixCopiaCola(r[16]),
      atualizado: lido_em,
    }));
    if (seco) return j({ ok: true, seco: true, total: linhas.length, com_qrcode: linhas.filter((x) => x.qrcode).length, linhas: linhas.map((x) => ({ ...x, qrcode: x.qrcode ? (String(x.qrcode).slice(0, 30) + "… (" + String(x.qrcode).length + " chars)") : null })) });

    const key = srvKey();
    if (!key) return j({ ok: false, erro: "sem chave de servico (SRV_JWT)" });
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, key);

    // Espelho do Sankhya: o que foi baixado la tem de sumir daqui, senao a tela cobra titulo pago.
    // Grava primeiro, apaga o resto depois: se o upsert falhar, a tabela continua com o retrato
    // anterior em vez de ficar vazia (licao do roteiro-refresh v8).
    if (linhas.length) {
      const { error } = await sb.from("cobranca_pix").upsert(linhas, { onConflict: "nufin" });
      if (error) throw error;
    }
    const vivos = linhas.map((x) => x.nufin);
    const del = vivos.length
      ? await sb.from("cobranca_pix").delete().not("nufin", "in", "(" + vivos.join(",") + ")")
      : await sb.from("cobranca_pix").delete().gte("nufin", 0);
    if (del.error) throw del.error;

    const { data: aptos } = await sb.from("cobranca_pix_apto").select("nufin, rep, instancia, instancia_pausada, venda_interna, qrcode, dias_restantes, valor");
    const A = aptos || [];
    return j({
      ok: true, lido_em, titulos_abertos: linhas.length,
      no_quadro: A.length,
      fora_da_janela_7d: linhas.filter((x) => x.dias_aberto > 7).length,
      de_venda_interna: A.filter((x: any) => x.venda_interna).length,
      sem_qrcode: A.filter((x: any) => !x.qrcode).length,
      // veio codigo do Sankhya mas nao virou BR Code — se isso subir, o formato do campo mudou
      qrcode_ilegivel: rows.filter((r) => r[16] && !pixCopiaCola(r[16])).length,
      sem_assistente: A.filter((x: any) => !x.instancia).length,
      instancia_pausada: A.filter((x: any) => x.instancia_pausada).length,
      valor_no_quadro: Math.round(A.reduce((s: number, x: any) => s + Number(x.valor || 0), 0) * 100) / 100,
    });
  } catch (e: any) {
    const msg = [e?.message, e?.details, e?.hint, e?.code].filter(Boolean).join(" · ") || String(e);
    console.error("cobranca-pix-refresh falhou:", msg);
    // HTTP 200 de proposito: o painel so le o corpo quando o status e 2xx (ver v3 no topo).
    return j({ ok: false, erro: msg });
  }
});
