// nitronmob-nina — avisa o gestor quando um cliente bate na Nina vindo do e-mail Nitron-Mob.
//
// Ordem do gestor, 20/10: "o link esta mandando para a Nina (...) caso chegue algum contato
// interessado eu quero que a Nina me avise".
//
// O botao do e-mail abre o WhatsApp da Nina com um texto pronto:
//   "Ola! Vi o e-mail da NitronMob e gostaria de saber mais."
// Essa frase e a assinatura da campanha. E o UNICO jeito de saber que o contato veio do e-mail:
// o wa.me nao carrega parametro nosso, o GHL grava `source: WhatsApp` para todo mundo, e o lead
// que chega nao traz nada mais. Mesma historia do lead do Google (copiloto-lead v12): a prova
// mora no texto da primeira mensagem, e se ninguem ler, morre ali.
//
// O que esta funcao NAO faz: nao responde ao cliente. Quem conversa e a Nina, pelo copiloto-lead
// de sempre — as licoes 315/316/317 ensinam a linha a ela. Aqui so se detecta e se avisa.
//
// Uso:
//   ?varrer=1        procura nas conversas recentes e avisa quem for novo
//   ?varrer=1&dry=1  mostra o que acharia, sem avisar e sem gravar
//   ?lista=1         quem ja chegou por esta campanha
//
// Deploy: supabase functions deploy nitronmob-nina

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const URL_ = () => Deno.env.get("SUPABASE_URL")!;
const LOC = "rZ8y7lzqV7fzxsartaX2";
const API = "https://services.leadconnectorhq.com";
const UA = "Mozilla/5.0 (compatible; NitronBot/1.0)";

const HORAS = 96;        // so conversa nascida nas ultimas 96h entra na varredura
const MAX_FETCH = 12;    // teto de conversas cujas mensagens sao abertas por rodada

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
  return await fetch(`${URL_()}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: k, Authorization: "Bearer " + k, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
}
async function cfg(): Promise<Record<string, string>> {
  const r = await rest("copiloto_config?select=chave,valor");
  const o: Record<string, string> = {};
  for (const x of (await r.json()) || []) o[x.chave] = x.valor;
  return o;
}

// sem acento, sem caixa, sem pontuacao: "Olá! Vi o e-mail da NitronMob" e "vi o email da nitron mob"
// tem de casar os dois. O cliente pode editar o texto antes de mandar.
const pad = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ");
function eDaCampanha(txt: unknown) {
  const t = pad(txt);
  return /\bnitron ?mob\b/.test(t) && /\b(e ?mail|email)\b/.test(t);
}

async function mandar(fone: string, texto: string) {
  const r = await fetch(`${URL_()}/functions/v1/campanhas-enviar`, {
    method: "POST",
    headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" },
    // usar_dono: o contato do gestor e da Nina no CRM; recado nao pode morrer por cadastro
    body: JSON.stringify({ canal: "whatsapp", fone, texto, instancia: "Camyla", usar_dono: true }),
  });
  const d = await r.json().catch(() => ({}));
  return { ok: !!d?.ok, motivo: d?.ok ? null : String(d?.motivo || "recusado").slice(0, 180) };
}

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);

    if (u.searchParams.get("lista") === "1") {
      const r = await rest("nitronmob_contato?select=*&order=achado_em.desc&limit=100");
      return j({ ok: true, contatos: await r.json() });
    }

    const c = await cfg();
    const dry = u.searchParams.get("dry") === "1";
    if (String(c.nitronmob_vigia_ativo || "sim").toLowerCase() !== "sim" && !dry)
      return j({ ok: true, skip: "nitronmob_vigia_ativo != sim" });

    const jaR = await rest("nitronmob_contato?select=contact_id");
    const ja = new Set(((await jaR.json()) || []).map((x: any) => x.contact_id));

    const sr = await ghl("GET",
      `/conversations/search?locationId=${LOC}&limit=100&sortBy=last_message_date&sort=desc`, null, "2021-07-28");
    const sd = await sr.json().catch(() => ({} as any));
    const convs: any[] = sd?.conversations || [];
    const corte = Date.now() - HORAS * 3600_000;

    const achados: any[] = [];
    let abertas = 0;
    for (const cv of convs) {
      if (ja.has(cv.contactId)) continue;
      if (!cv.dateAdded || cv.dateAdded < corte) continue;

      // atalho: numa conversa recem-nascida a ultima mensagem AINDA e a frase do botao
      let msg: string | null = eDaCampanha(cv.lastMessageBody) ? String(cv.lastMessageBody) : null;

      // senao, a Nina ja respondeu por cima — ai vale abrir as mensagens e procurar a primeira
      if (!msg && abertas < MAX_FETCH) {
        abertas++;
        try {
          const mr = await ghl("GET", `/conversations/${cv.id}/messages?limit=40`, null);
          const md = await mr.json().catch(() => ({} as any));
          const lista: any[] = md?.messages?.messages || [];
          const hit = lista.find((m: any) => m.direction === "inbound" && eDaCampanha(m.body));
          if (hit) msg = String(hit.body);
        } catch { /* uma conversa ilegivel volta na proxima rodada */ }
      }
      if (!msg) continue;

      achados.push({ contact_id: cv.contactId, nome: cv.fullName || cv.contactName || null,
                     fone: cv.phone || null, conversa_id: cv.id,
                     primeira_msg: msg.replace(/\s*Instance Source:.*$/is, "").trim().slice(0, 300) });
    }

    if (dry) return j({ ok: true, previa: true, conversas_olhadas: convs.length, abertas, achados });
    if (!achados.length) return j({ ok: true, novos: 0, conversas_olhadas: convs.length });

    const fones = String(c.nitronmob_avisar_fones || "").split(/[,;]/)
      .map((x) => x.replace(/\D/g, "")).filter((x) => x.length >= 10);

    const saida: any[] = [];
    for (const a of achados) {
      // grava ANTES de avisar: se o envio falhar, o contato nao se perde, e o indice primario
      // garante que ele nao vira aviso duplicado na proxima rodada
      const ins = await rest("nitronmob_contato", { method: "POST", body: JSON.stringify(a) });
      if (!ins.ok) { saida.push({ ...a, avisado: false, motivo: "ja registrado" }); continue; }

      const texto =
        "CONTATO NOVO DA CAMPANHA NITRON-MOB\n\n" +
        (a.nome ? a.nome + "\n" : "") + (a.fone ? a.fone + "\n" : "") +
        "\nEle escreveu:\n\"" + a.primeira_msg + "\"\n\n" +
        "Veio do botao do e-mail, entao ja chegou interessado. A Nina esta atendendo pelo WhatsApp dela.";

      let avisado = false, erro: string | null = null;
      for (const f of fones) {
        const r = await mandar(f, texto);
        if (r.ok) avisado = true; else erro = r.motivo;
      }
      await rest(`nitronmob_contato?contact_id=eq.${encodeURIComponent(a.contact_id)}`, {
        method: "PATCH",
        body: JSON.stringify({ avisado_em: avisado ? new Date().toISOString() : null, aviso_erro: erro }),
      });
      saida.push({ ...a, avisado, erro });
    }
    return j({ ok: true, novos: saida.length, avisados: saida.filter((x) => x.avisado).length, detalhe: saida });
  } catch (e) {
    return j({ ok: false, erro: String(e).slice(0, 300) }, 500);
  }
});
