// nina-pedido-recebido — recebe o pedido montado na pagina do lojista, registra, e manda o
// pedido COMPLETO por e-mail para quem atende (hoje a Camyla) e para o marketing. Devolve o codigo.
//
// Por que existe: o botao da pagina abria o WhatsApp com o pedido inteiro no texto. Numa cesta
// de 55 itens isso da 6.114 caracteres de texto e uma URL de wa.me com 9.802 — muito acima do
// que o celular entrega. O pedido grande chegava truncado ou nao chegava. Agora a pagina manda
// o pedido para ca, recebe um codigo, e o WhatsApp leva so o aviso curto com esse codigo.
//
// Efeito colateral bom: o pedido deixa de ser texto de WhatsApp para alguem interpretar e vira
// linha de tabela — item, fardo, peca e valor, sem risco de leitura errada.
//
// Deploy: supabase functions deploy nina-pedido-recebido --no-verify-jwt
//   (a pagina e publica e nao tem como carregar chave; ver "Exposicao" no fim)

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// A SUPABASE_SERVICE_ROLE_KEY injetada pela plataforma vem como sb_secret_ e o PostgREST recusa
// (PGRST303). Toda funcao daqui usa SRV_JWT primeiro — ver CLAUDE.md.
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const URL_ = () => Deno.env.get("SUPABASE_URL")!;

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const txt = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const brl = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const int = (v: number) => Math.round(v).toLocaleString("pt-BR");

function fmtDoc(d: string) {
  const s = (d || "").replace(/\D/g, "");
  if (s.length === 14) return `${s.slice(0,2)}.${s.slice(2,5)}.${s.slice(5,8)}/${s.slice(8,12)}-${s.slice(12)}`;
  if (s.length === 11) return `${s.slice(0,3)}.${s.slice(3,6)}.${s.slice(6,9)}-${s.slice(9)} (CPF)`;
  return d || "";
}

async function rest(path: string, init: RequestInit = {}) {
  const k = srvKey();
  return await fetch(`${URL_()}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: k, Authorization: "Bearer " + k, "Content-Type": "application/json",
               Prefer: "return=representation", ...(init.headers || {}) },
  });
}

async function cfg(): Promise<Record<string, string>> {
  try {
    const r = await rest("copiloto_config?select=chave,valor");
    const rows = await r.json();
    const o: Record<string, string> = {};
    for (const x of rows || []) o[x.chave] = x.valor;
    return o;
  } catch { return {}; }
}

// O corpo do e-mail. Texto puro com quebra de linha: o campanhas-enviar embrulha em <div> com
// <br>, entao o que a Camyla ve e exatamente isto. De proposito nao e tabela HTML — ela copia
// e cola no Forca de Vendas, e tabela atrapalha.
function corpoEmail(p: any, itens: any[], codigo: string) {
  const L: string[] = [];
  L.push(`PEDIDO ${codigo}`);
  L.push("");
  L.push(`Loja: ${p.loja || "(nao informada)"}`);
  if (p.cnpj) L.push(`CNPJ ${fmtDoc(p.cnpj)}`);
  if (p.cidade) L.push(`Cidade: ${p.cidade}`);
  if (p.fone) L.push(`WhatsApp: ${p.fone}`);
  L.push(`Segmento da cesta: ${p.segmento || "-"}`);
  L.push(`Recebido em: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
  L.push("");
  L.push("-".repeat(58));
  itens.forEach((it: any, i: number) => {
    const fardos = n(it.fardos), emb = n(it.emb) || 1, un = fardos * emb, tot = un * n(it.preco);
    L.push(`${i + 1}. ${txt(it.desc, 70)}`);
    L.push(`   Ref ${txt(it.ref, 24)} | ${fardos} fardo(s) x ${emb} un = ${int(un)} pecas | R$ ${brl(n(it.preco))}/un | R$ ${brl(tot)}`);
  });
  L.push("-".repeat(58));
  L.push("");
  L.push(`${itens.length} produtos | ${int(n(p.qtd_fardos))} fardos | ${int(n(p.qtd_pecas))} pecas`);
  if (n(p.desconto) > 0) {
    L.push(`Subtotal: R$ ${brl(n(p.subtotal))}`);
    L.push(`Desconto: -R$ ${brl(n(p.desconto))}`);
  }
  L.push(`TOTAL: R$ ${brl(n(p.total))}`);
  L.push("");
  L.push("O cliente montou este pedido na pagina que a Nina mandou. Ele NAO combinou preco, prazo,");
  L.push("condicao de pagamento nem frete com ninguem — isso e com voce.");
  return L.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return j({ ok: false, erro: "use POST" }, 405);

  try {
    const b = await req.json().catch(() => ({} as any));
    const itensRaw = Array.isArray(b.itens) ? b.itens : [];
    if (!itensRaw.length) return j({ ok: false, erro: "pedido sem itens" }, 400);
    // teto de sanidade: a maior cesta tem 56 itens e o catalogo inteiro 639
    if (itensRaw.length > 700) return j({ ok: false, erro: "pedido grande demais" }, 400);

    const itens = itensRaw.slice(0, 700).map((it: any) => ({
      cod: txt(it.cod, 20), ref: txt(it.ref, 24), desc: txt(it.desc, 120),
      linha: txt(it.linha, 40), emb: n(it.emb) || 1, preco: n(it.preco), fardos: n(it.fardos),
    })).filter((it: any) => it.fardos > 0);
    if (!itens.length) return j({ ok: false, erro: "nenhum item com fardo" }, 400);

    const c = b.cliente || {};
    const linha = (it: any) => it.fardos * (it.emb || 1) * it.preco;
    const subtotal = n(b.subtotal) || itens.reduce((s: number, it: any) => s + linha(it), 0);
    const pecas = n(b.qtd_pecas) || itens.reduce((s: number, it: any) => s + it.fardos * (it.emb || 1), 0);
    const fardos = n(b.qtd_fardos) || itens.reduce((s: number, it: any) => s + it.fardos, 0);

    const conf = await cfg();
    // A chave aceita VARIOS destinos separados por virgula (ou ponto-e-virgula). Ordem do gestor em
    // 16/10: alem de quem fecha, o pedido vai sempre para o marketing. Um e-mail por destino, porque
    // o campanhas-enviar resolve um contato do CRM por endereco — nao tem campo de copia.
    const destinos = (conf.pedido_email_para || "").split(/[,;]/).map((x) => x.trim())
      .filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
    const para = destinos[0] || "";
    const dono = conf.pedido_dono || "";

    const reg = {
      segmento: txt(b.segmento, 60), loja: txt(c.loja, 120), cnpj: txt(c.cnpj, 20).replace(/\D/g, ""),
      cidade: txt(c.cidade, 80), fone: txt(c.fone, 30), contact_id: txt(b.contact_id, 40) || null,
      itens, qtd_itens: itens.length, qtd_fardos: fardos, qtd_pecas: pecas,
      subtotal, desconto: n(b.desconto), total: n(b.total) || subtotal - n(b.desconto),
      origem: txt(b.origem, 30) || "pagina", dono: dono || null, email_para: destinos.join(", ") || null,
    };

    const ins = await rest("pedido_recebido", { method: "POST", body: JSON.stringify(reg) });
    if (!ins.ok) return j({ ok: false, erro: "nao gravou: " + (await ins.text()).slice(0, 200) }, 500);
    const row = (await ins.json())[0];
    // O codigo sai do proprio id: sequencial, legivel ao telefone, sem colisao possivel.
    const codigo = "PED-" + String(row.id).padStart(4, "0");
    await rest(`pedido_recebido?id=eq.${row.id}`, { method: "PATCH", body: JSON.stringify({ codigo }) });

    // ---- aviso por e-mail com o pedido COMPLETO, para cada destino ----
    // email_ok so e true quando TODOS receberam: se o do marketing sair e o de quem fecha nao, o
    // pedido esta perdido do mesmo jeito e a linha nao pode dizer que deu certo.
    let email_ok: boolean | null = null, email_erro: string | null = null;
    if ((conf.pedido_aviso_ativo || "sim").toLowerCase() === "sim" && destinos.length) {
      const corpo = corpoEmail(reg, itens, codigo);
      const assunto = `${codigo} — pedido novo${reg.loja ? " de " + reg.loja : ""} (R$ ${brl(reg.total)})`;
      const falhas: string[] = [];
      for (const d0 of destinos) {
        try {
          const r = await fetch(`${URL_()}/functions/v1/campanhas-enviar`, {
            method: "POST",
            headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" },
            body: JSON.stringify({
              canal: "email", email: d0, nome: d0 === para ? (dono || undefined) : undefined,
              assunto, texto: corpo,
            }),
          });
          const d = await r.json().catch(() => ({}));
          if (!d?.ok) falhas.push(d0 + ": " + String(d?.motivo || d?.erro || "recusado").slice(0, 120));
        } catch (e) { falhas.push(d0 + ": " + String(e).slice(0, 120)); }
      }
      email_ok = falhas.length === 0;
      if (falhas.length) email_erro = falhas.join(" | ").slice(0, 300);
      await rest(`pedido_recebido?id=eq.${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ email_ok, email_em: new Date().toISOString(), email_erro }),
      });
    }

    // A pagina so precisa do codigo e do resumo para montar a mensagem curta do WhatsApp.
    return j({
      ok: true, codigo, id: row.id, email_ok,
      resumo: { produtos: itens.length, fardos, pecas, total: reg.total },
    });
  } catch (e) {
    return j({ ok: false, erro: String(e).slice(0, 300) }, 500);
  }
});

// ---- Exposicao -------------------------------------------------------------------------------
// A pagina e publica e nao carrega chave, entao esta funcao sobe com --no-verify-jwt: qualquer um
// que descubra a URL consegue gravar uma linha e disparar um e-mail para os destinos. O destino
// NUNCA vem do pedido (sai de copiloto_config.pedido_email_para), entao nao da para usar isto para
// mandar e-mail para terceiros — o estrago possivel e ruido na caixa deles. Se virar problema:
// desligue com copiloto_config.pedido_aviso_ativo = 'nao' (a gravacao continua) ou ponha um token
// na querystring e confira aqui.
