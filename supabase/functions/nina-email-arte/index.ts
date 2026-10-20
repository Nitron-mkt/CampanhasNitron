// nina-email-arte — manda uma arte do construtor de e-mail do GHL informando o remetente.
//
// ATENCAO — ESTA FUNCAO NAO RESOLVE O REMETENTE. Medido em 20/10, e a conclusao e o contrario do
// que esta funcao foi escrita para fazer:
//
//   O GHL ACEITA o `emailFrom` e o IGNORA. A chamada volta 201 {"msg":"Email queued successfully"},
//   esta funcao devolve `de=timecomercial@email.nitron.com.br` — e o GET
//   /conversations/messages/email/DlDnYlfWQojJBz4LdrWM, do proprio e-mail entregue, traz
//   "from":"Nitron <marketing@nitron.com.br>". Quem decide o remetente e a configuracao da
//   location, nao o corpo da chamada. Nao ha endpoint na API para ler nem para trocar essa
//   configuracao (procurado em 20/10): e tela do GHL, em Settings -> Email Services.
//
// Consequencia do remetente ser `marketing@nitron.com.br`: o dominio do From (nitron.com.br) e
// diferente do dominio que assina o envio (email.nitron.com.br, o autenticado no Mailgun/LC). Por
// isso o Outlook mostra o Return-Path cru — `marketing=nitron.com.br@email.nitron.com.br` — e o
// "em nome de". Isso NAO se conserta por codigo; conserta-se pondo o From num endereco de
// email.nitron.com.br.
//
// O que esta funcao continua servindo: mandar uma arte do construtor para um destino avulso sem
// passar por campanha. O campo `de` fica porque nao atrapalha e porque, se o GHL passar a honra-lo,
// ja esta no lugar.
//
// Esta funcao e separada de proposito: mexer no campanhas-enviar, de que dependem todas as
// campanhas, para resolver um caso de remetente seria risco desproporcional. Aqui o raio de
// alcance e so quem chamar.
//
// Uso:
//   POST { "templateId": "<id da arte>", "email": "destino@x.com", "assunto": "...",
//          "de": "timecomercial@email.nitron.com.br", "nome": "Fulano" }
//   ou  { "html": "<html>...", ... } para mandar um HTML pronto.
//
// Deploy: supabase functions deploy nina-email-arte

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const URL_ = () => Deno.env.get("SUPABASE_URL")!;
const LOC = "rZ8y7lzqV7fzxsartaX2";
const API = "https://services.leadconnectorhq.com";
const UA = "Mozilla/5.0 (compatible; NitronBot/1.0)";

function ghl(method: string, path: string, body: any, version = "2021-07-28") {
  return fetch(API + path, {
    method,
    headers: { Authorization: "Bearer " + Deno.env.get("GHL_TOKEN"), Version: version,
               "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// mesma leitura que o campanhas-enviar faz: a arte mora no construtor e o HTML vem do previewUrl
async function arteHtml(templateId: string): Promise<string | null> {
  try {
    const r = await ghl("GET", `/emails/builder?locationId=${LOC}&limit=100`, null);
    const d = await r.json();
    const tpl = (d?.builders || d?.data?.builders || []).find((t: any) => t.id === templateId);
    if (!tpl?.previewUrl) return null;
    const h = await fetch(tpl.previewUrl, { headers: { "User-Agent": UA } });
    if (!h.ok) return null;
    const html = await h.text();
    return html && html.length > 50 ? html : null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return j({ ok: false, erro: "use POST" }, 405);
  try {
    const b = await req.json().catch(() => ({} as any));
    const email = String(b.email || "").trim();
    const de = String(b.de || "").trim();
    if (!email) return j({ ok: false, erro: "sem email de destino" }, 400);

    let html: string | null = b.html ? String(b.html) : null;
    let arte_ok = false;
    if (!html && b.templateId) { html = await arteHtml(String(b.templateId)); arte_ok = !!html; }
    if (!html) return j({ ok: false, erro: "sem html: passe html ou um templateId que exista no construtor" }, 400);

    // o contato e resolvido pelo campanhas-enviar (lookup), que ja sabe achar/criar por e-mail —
    // nao duplico essa logica aqui
    const lk = await fetch(`${URL_()}/functions/v1/campanhas-enviar`, {
      method: "POST",
      headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" },
      body: JSON.stringify({ lookup: true, canal: "email", email, nome: b.nome || undefined }),
    });
    const d = await lk.json().catch(() => ({}));
    const contactId = d?.contactId;
    if (!contactId) return j({ ok: false, erro: "nao achei/criei contato para " + email, lookup: d }, 500);

    const payload: any = { type: "Email", contactId, subject: String(b.assunto || "Nitron"), html };
    // o GHL aceita e IGNORA este campo (medido 20/10) — ver o cabecalho. Fica porque nao custa.
    if (de) payload.emailFrom = de;
    const r = await ghl("POST", "/conversations/messages", payload, "2021-04-15");
    const txt = (await r.text()).slice(0, 400);
    return j({ ok: r.status >= 200 && r.status < 300, http: r.status, contactId, de_pedido: de || "(padrao da location)", de_real: "o GHL ignora emailFrom — confira com GET /conversations/messages/email/{id}",
               arte_ok, tamanho_html: html.length, resposta: txt });
  } catch (e) { return j({ ok: false, erro: String(e).slice(0, 300) }, 500); }
});
