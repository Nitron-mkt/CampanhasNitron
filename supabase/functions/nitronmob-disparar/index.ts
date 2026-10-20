// nitronmob-disparar — o lancamento Nitron-Mob por e-mail, em lotes.
//
// Por que NAO usa o campanhas-enviar, que e o caminho normal de campanha: aquela funcao nao
// informa `emailFrom` ao GHL (linha 259), entao sairia pelo remetente padrao da location —
// `marketing@nitron.com.br`, no dominio errado, com o "em nome de" de volta. E ela so sabe montar
// a arte a partir de um templateId do construtor, e o modelo que esta la ainda tem o rodape que
// encolhe o e-mail. Mexer no campanhas-enviar para isto seria risco desproporcional: dele dependem
// TODAS as campanhas. Entao este disparo e separado, e so ele usa `comercial@crm.nitron.com.br`.
//
// RAMPA, e nao disparo unico: `crm.nitron.com.br` e dominio novo, reputacao zero. 6.000 e-mails de
// uma vez num dominio virgem vai para spam. Por isso `n` e obrigatorio e tem teto, e a audiencia
// sai ORDENADA DO MAIS ENGAJADO PARA O MENOS (view `nitronmob_apto`, coluna `prioridade`): cliente
// em dia abre, e abertura e o que constroi reputacao. Mandar primeiro para quem nao compra ha tres
// anos e o jeito mais rapido de queimar o dominio.
//
// A arte mora em storage (`app/nitronmob.html`), nao aqui dentro: trocar o HTML nao exige deploy.
//
// Uso:
//   ?dry=1&n=100   ve quem receberia, sem mandar
//   ?n=100         manda 100 e grava cada um em nitronmob_envio
//   ?status=1      como esta o lote: enviados, erros, entregues
//
// Deploy: supabase functions deploy nitronmob-disparar

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const URL_ = () => Deno.env.get("SUPABASE_URL")!;
const API = "https://services.leadconnectorhq.com";
const UA = "Mozilla/5.0 (compatible; NitronBot/1.0)";

const DE = "comercial@crm.nitron.com.br";
const ASSUNTO = "Nitron-Mob chegou: 13 produtos novos para o seu mix";
const ARTE = "/storage/v1/object/public/app/nitronmob.html";
// Teto por CHAMADA, nao da rampa. Cada envio custa ~1,5s (lookup + GHL) mais a pausa, e a edge
// function tem limite de tempo — 100 numa chamada so morreria no meio. 40 cabe com folga; para
// 100, chame quatro vezes. Foi a mesma conta que fez o lote da reativacao ser 12.
const TETO = 40;
const PAUSA_MS = 1000;

function ghl(method: string, path: string, body: any, version = "2021-04-15") {
  return fetch(API + path, {
    method,
    headers: { Authorization: "Bearer " + Deno.env.get("GHL_TOKEN"), Version: version,
               "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function rest(path: string, init?: RequestInit) {
  const k = srvKey();
  const r = await fetch(`${URL_()}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: k, Authorization: "Bearer " + k, "Content-Type": "application/json",
               ...(init?.headers || {}) },
  });
  return r;
}

const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);

    if (u.searchParams.get("status") === "1") {
      const r = await rest("nitronmob_envio?select=id,email,nome,situacao,lote,ok,erro,message_id,enviado_em&order=id");
      const linhas: any[] = await r.json();
      const porLote: Record<string, any> = {};
      for (const x of linhas) {
        const k = "lote " + x.lote;
        porLote[k] ||= { enviados: 0, falharam: 0, desconhecidos: 0, primeiro: x.enviado_em, ultimo: x.enviado_em };
        // ok=false SEM erro = a funcao foi interrompida entre gravar e mandar. O e-mail pode ter
        // saido ou nao. Nao e falha nem sucesso, e nao vai ser reenviado (o indice unico barra) —
        // entao tem nome proprio, em vez de mentir numa das duas colunas.
        porLote[k][x.ok ? "enviados" : (x.erro ? "falharam" : "desconhecidos")]++;
        porLote[k].ultimo = x.enviado_em;
      }
      return j({ ok: true, total: linhas.length, por_lote: porLote,
                 falhas: linhas.filter((x) => !x.ok && x.erro).map((x) => ({ email: x.email, erro: String(x.erro).slice(0,120) })).slice(0, 40) });
    }

    const n = Math.min(Number(u.searchParams.get("n") || 0) | 0, TETO);
    const dry = u.searchParams.get("dry") === "1";
    const lote = Number(u.searchParams.get("lote") || 1) | 0;
    if (n <= 0) return j({ ok: false, erro: "informe ?n=<quantos> (teto " + TETO + "). ?dry=1 para ver antes." }, 400);

    // a view ja exclui representante, time interno, cadastro poluido, e-mail em muitas lojas, e
    // quem ja recebeu este lancamento
    const r = await rest(`nitronmob_apto?select=email,nome,codparc,situacao,faturamento_12m,prioridade` +
                         `&order=prioridade.asc,faturamento_12m.desc.nullslast&limit=${n}`);
    if (!r.ok) return j({ ok: false, erro: "audiencia: " + (await r.text()).slice(0, 200) }, 500);
    const alvos: any[] = await r.json();
    if (!alvos.length) return j({ ok: true, nada: "a audiencia apta acabou" });

    if (dry) {
      const porSit: Record<string, number> = {};
      for (const a of alvos) porSit[a.situacao] = (porSit[a.situacao] || 0) + 1;
      return j({ ok: true, previa: true, quantos: alvos.length, por_situacao: porSit,
                 remetente: DE, assunto: ASSUNTO,
                 primeiros: alvos.slice(0, 10).map((a) => `${a.nome} <${a.email}> (${a.situacao})`) });
    }

    const h = await fetch(URL_() + ARTE, { headers: { "User-Agent": UA } });
    const html = h.ok ? await h.text() : "";
    if (html.length < 1000) return j({ ok: false, erro: "arte nao carregou de " + ARTE }, 500);

    const envios: any[] = [];
    for (const a of alvos) {
      // GRAVA ANTES DE MANDAR. Se esta funcao morrer no meio (a edge function corta em 150s de
      // ociosidade), o que ja saiu fica registrado e a proxima chamada nao repete — o indice unico
      // em lower(email) e a trava final.
      const ins = await rest("nitronmob_envio", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ email: a.email, nome: a.nome, codparc: a.codparc, situacao: a.situacao, lote }),
      });
      if (!ins.ok) { envios.push({ email: a.email, ok: false, erro: "ja registrado" }); continue; }
      const linha = (await ins.json())[0];

      let ok = false, erro: string | null = null, msgId: string | null = null;
      try {
        // o contato existe (veio do ghl_contato), mas o lookup resolve nome e cria se faltar
        const lk = await fetch(`${URL_()}/functions/v1/campanhas-enviar`, {
          method: "POST",
          headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" },
          body: JSON.stringify({ lookup: true, canal: "email", email: a.email, nome: a.nome }),
        });
        const d = await lk.json().catch(() => ({}));
        const contactId = d?.contactId;
        if (!contactId) throw new Error("sem contactId");

        const er = await ghl("POST", "/conversations/messages",
          { type: "Email", contactId, subject: ASSUNTO, html, emailFrom: DE });
        const txt = (await er.text()).slice(0, 300);
        ok = er.status >= 200 && er.status < 300;
        if (ok) { try { msgId = JSON.parse(txt)?.emailMessageId || null; } catch { /* nao-JSON */ } }
        else erro = txt;
      } catch (e) { erro = String(e).slice(0, 200); }

      await rest(`nitronmob_envio?id=eq.${linha.id}`, {
        method: "PATCH", body: JSON.stringify({ ok, erro, message_id: msgId }),
      });
      envios.push({ email: a.email, ok, erro });
      await dorme(PAUSA_MS);
    }

    return j({ ok: true, lote, remetente: DE, assunto: ASSUNTO,
               mandados: envios.filter((x) => x.ok).length,
               falhas: envios.filter((x) => !x.ok) });
  } catch (e) {
    return j({ ok: false, erro: String(e).slice(0, 300) }, 500);
  }
});
