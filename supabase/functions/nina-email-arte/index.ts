// nina-email-arte — manda uma arte do construtor de e-mail do GHL informando o remetente.
//
// O REMETENTE SO VALE SE O DOMINIO ESTIVER VERIFICADO NA LOCATION. Medido duas vezes, com
// resultados opostos, e a diferenca explica a regra:
//
//   20/10 manha — pedi `timecomercial@email.nitron.com.br`. O GHL respondeu 201 "Email queued
//   successfully" e entregou com "from":"Nitron <marketing@nitron.com.br>". Ignorou o campo.
//   20/10 tarde — o gestor verificou o subdominio `crm.nitron.com.br` no GHL. Pedi
//   `comercial@crm.nitron.com.br` e o e-mail entregue veio
//   "from":"Nitron <comercial@crm.nitron.com.br>". Honrou.
//
// Ou seja: o GHL **cai calado** no remetente padrao da location quando o dominio do `emailFrom`
// nao esta verificado. Nao devolve erro, nao avisa — a chamada volta 201 nos dois casos. Por isso
// **nunca confie na resposta da API**: confira o remetente real com
// `GET /conversations/messages/email/{id}`, que e de onde sairam as duas medicoes acima.
//
// `email.nitron.com.br` NAO EXISTE MAIS (NXDOMAIN em dois resolvedores, 20/10) — foi substituido
// pelo `crm.nitron.com.br`, que tem SPF (leadconnectorhq + mailgun), MX do Mailgun e DKIM em `k1`
// e `default`. Nada no codigo nem no banco aponta para o dominio morto; o remetente e decidido
// pela configuracao da location.
//
// Quando o dominio do From bate com o dominio que assina o envio, o Outlook para de mostrar o
// Return-Path cru (`marketing=nitron.com.br@email.nitron.com.br`) e o "em nome de". Era esse o
// sintoma que o gestor cobrava.
//
// O que esta funcao serve: mandar uma arte do construtor para um destino avulso, pelo remetente
// que se quiser, sem passar por campanha.
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
    // so e honrado se o dominio estiver verificado na location — ver o cabecalho
    if (de) payload.emailFrom = de;
    const r = await ghl("POST", "/conversations/messages", payload, "2021-04-15");
    const txt = (await r.text()).slice(0, 400);
    return j({ ok: r.status >= 200 && r.status < 300, http: r.status, contactId, de_pedido: de || "(padrao da location)", de_real: "confira em GET /conversations/messages/email/{id} — a API responde 201 mesmo quando ignora",
               arte_ok, tamanho_html: html.length, resposta: txt });
  } catch (e) { return j({ ok: false, erro: String(e).slice(0, 300) }, 500); }
});
