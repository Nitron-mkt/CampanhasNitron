// nitronmob-tag — marca no CRM, com a tag `nitronmob-comunicacao`, o publico da cadencia
// Nitron-Mob, para o gestor passar a disparar pelo proprio GHL (que tem relatorio de abertura e
// clique; o envio por API, que e como as duas ondas sairam, nao tem).
//
// QUEM ENTRA, e por que o criterio e esse. Pedido do gestor em 12/11: "a galera que ja enviou" MAIS
// "os contatos que ainda nao enviou, mas que ja verificou que o e-mail funciona". A prova de que o
// e-mail funciona e a ENTREGA CONFIRMADA no 1o e-mail (delivered/opened/clicked) — nao basta o GHL
// ter aceitado. Por isso ficam de fora:
//   - os 214 `failed` do 1o e-mail (bounce de verdade)
//   - os 50 `sent` sem confirmacao de entrega: aceito nao e entregue, e essa distincao ja custou
//     caro aqui antes (26/08, 8 mensagens "enviadas" que nunca chegaram)
//   - os 11 que falharam e os 9 que foram recusados no 2o e-mail
// Sobram 4.808 enderecos, congelados na tabela `nitronmob_tag`. Levar endereco que nao entrega para
// dentro do CRM seria exportar o problema de reputacao para a ferramenta nova.
//
// POR QUE UMA TABELA, e nao marcar direto da view: o trabalho e longo e a
// edge function corta em 150s. O trabalho precisa ser retomavel — cada linha guarda o contact_id
// assim que ele e achado, entao uma rodada que morre no meio nao perde o que ja fez.
//
// A MARCACAO E EM LOTE. O GHL tem `POST /contacts/bulk/tags/update/add`, que aceita uma lista de
// contact ids de uma vez. Marcar um a um seriam mais 4.800 chamadas; em lotes de 100 sao 48.
//
// Uso:
//   ?acao=buscar&n=600   resolve e-mail -> contact_id, em blocos de 80 por chamada ao GHL
//   ?acao=marcar         aplica a tag em todos que ja tem contact_id e ainda nao foram marcados
//   ?status=1            quanto falta de cada passo
//   &dry=1               vale nos dois: mostra o que faria, sem tocar no CRM
//
// NAO CRIA CONTATO. A busca e so leitura (`POST /contacts/search`). Se um e-mail nao tiver contato
// no CRM, a linha fica com `busca_erro` e segue a vida — criar contato aqui seria inventar publico.
//
// Deploy: supabase functions deploy nitronmob-tag

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const URL_ = () => Deno.env.get("SUPABASE_URL")!;
const LOC = "rZ8y7lzqV7fzxsartaX2";
const TAG = "nitronmob-comunicacao";

// O `POST /contacts/search` aceita o operador `contains_set` com uma LISTA de e-mails, entao
// resolve 80 de uma vez. Buscar um a um seriam 4.808 chamadas ao GHL (e foi assim que esta funcao
// nasceu); em blocos sao ~60. O limite de 80, e nao 100, e folga: um mesmo e-mail pode ter mais de
// um contato no CRM, e a pagina de resposta corta em 100.
const LOTE_BUSCA = 80;
const LOTE_TAG = 100;     // contatos por chamada do endpoint de tag em lote

function ghl(method: string, path: string, body: any, version = "2021-07-28") {
  return fetch("https://services.leadconnectorhq.com" + path, {
    method,
    headers: {
      Authorization: "Bearer " + Deno.env.get("GHL_TOKEN"),
      Version: version,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function sb(path: string, init: RequestInit = {}) {
  const k = srvKey();
  return fetch(`${URL_()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: k, Authorization: "Bearer " + k, "Content-Type": "application/json",
      Prefer: "return=representation", ...(init.headers || {}),
    },
  });
}

// Resolve um BLOCO de e-mails de uma vez. SO LEITURA: nunca cria contato — e-mail sem contato no
// CRM simplesmente nao volta no mapa, e a linha fica registrada como "sem contato".
async function buscarBloco(emails: string[]): Promise<{ mapa: Map<string, string>; erro?: string }> {
  const mapa = new Map<string, string>();
  try {
    const r = await ghl("POST", "/contacts/search", {
      locationId: LOC, pageLimit: 100,
      filters: [{ field: "email", operator: "contains_set", value: emails }],
    });
    if (r.status === 429) return { mapa, erro: "429" };
    if (!r.ok) return { mapa, erro: "HTTP " + r.status + " " + (await r.text()).slice(0, 120) };
    const d = await r.json().catch(() => ({} as any));
    for (const c of (d?.contacts || []) as any[]) {
      const e = String(c?.email || "").toLowerCase();
      if (e && c?.id && !mapa.has(e)) mapa.set(e, c.id);   // primeiro contato vence, se houver duplicado
    }
    return { mapa };
  } catch (e) {
    return { mapa, erro: String(e).slice(0, 120) };
  }
}

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const acao = u.searchParams.get("acao") || "status";
    const dry = u.searchParams.get("dry") === "1";
    // teto alto porque a busca agora e em bloco: 2.500 e-mails custam ~32 chamadas ao GHL (~30s),
    // bem dentro dos 150s de ociosidade da edge function
    const n = Math.max(1, Math.min(parseInt(u.searchParams.get("n") || "800"), 2500));

    // ---------- STATUS ----------
    if (acao === "status" || u.searchParams.get("status") === "1") {
      const r = await sb(`nitronmob_tag?select=contact_id,busca_em,tag_em,recebeu_2o`);
      const linhas = await r.json() as any[];
      const achou = linhas.filter((x) => x.contact_id).length;
      return j({
        ok: true, tag: TAG, total: linhas.length,
        ja_receberam_o_2o_email: linhas.filter((x) => x.recebeu_2o).length,
        busca: { resolvidos: achou, sem_contato: linhas.filter((x) => !x.contact_id && x.busca_em).length,
                 faltam: linhas.filter((x) => !x.contact_id && !x.busca_em).length },
        tagueados: linhas.filter((x) => x.tag_em).length,
        faltam_taguear: linhas.filter((x) => x.contact_id && !x.tag_em).length,
      });
    }

    // ---------- BUSCAR: e-mail -> contact_id ----------
    if (acao === "buscar") {
      const r = await sb(`nitronmob_tag?select=email&contact_id=is.null&busca_em=is.null&limit=${n}`);
      const alvos = (await r.json() as any[]).map((x) => x.email as string);
      if (!alvos.length) return j({ ok: true, acao, nada_a_fazer: true });
      if (dry) return j({ ok: true, acao, dry: true, buscaria: alvos.length, amostra: alvos.slice(0, 5) });

      let achados = 0, semContato = 0, blocosAdiados = 0;
      for (let i = 0; i < alvos.length; i += LOTE_BUSCA) {
        const bloco = alvos.slice(i, i + LOTE_BUSCA);
        const { mapa, erro } = await buscarBloco(bloco);
        // bloco que nao respondeu nao e carimbado: volta inteiro na proxima rodada
        if (erro) { blocosAdiados++; await new Promise((ok) => setTimeout(ok, 600)); continue; }
        await sb(`nitronmob_tag?on_conflict=email`, {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(bloco.map((email) => ({
            email, contact_id: mapa.get(email) || null,
            busca_em: new Date().toISOString(),
            busca_erro: mapa.get(email) ? null : "sem contato no CRM",
          }))),
        });
        for (const e of bloco) { if (mapa.get(e)) achados++; else semContato++; }
        await new Promise((ok) => setTimeout(ok, 150));
      }
      return j({ ok: true, acao, olhados: alvos.length, achados, sem_contato: semContato, blocos_adiados: blocosAdiados });
    }

    // ---------- MARCAR: aplica a tag em lote ----------
    if (acao === "marcar") {
      const r = await sb(`nitronmob_tag?select=email,contact_id&contact_id=not.is.null&tag_em=is.null&limit=${Math.min(n * 4, 2400)}`);
      const alvos = await r.json() as any[];
      if (!alvos.length) return j({ ok: true, acao, nada_a_fazer: true });
      if (dry) return j({ ok: true, acao, dry: true, marcaria: alvos.length, tag: TAG, lotes: Math.ceil(alvos.length / LOTE_TAG) });

      let marcados = 0; const falhas: any[] = [];
      for (let i = 0; i < alvos.length; i += LOTE_TAG) {
        const bloco = alvos.slice(i, i + LOTE_TAG);
        const resp = await ghl("POST", "/contacts/bulk/tags/update/add", {
          locationId: LOC, contacts: bloco.map((x) => x.contact_id), tags: [TAG],
        });
        const txt = await resp.text();
        if (!resp.ok) { falhas.push({ lote: i / LOTE_TAG, status: resp.status, resp: txt.slice(0, 200) }); continue; }
        await sb(`nitronmob_tag?on_conflict=email`, {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify(bloco.map((x) => ({ email: x.email, tag_em: new Date().toISOString(), tag_erro: null }))),
        });
        marcados += bloco.length;
        await new Promise((ok) => setTimeout(ok, 250));
      }
      return j({ ok: true, acao, tag: TAG, marcados, falhas });
    }

    return j({ ok: false, erro: "acao desconhecida: use status, buscar ou marcar" }, 400);
  } catch (e) {
    return j({ ok: false, erro: String(e).slice(0, 300) }, 500);
  }
});
