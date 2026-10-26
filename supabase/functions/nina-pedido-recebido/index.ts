// nina-pedido-recebido — recebe o pedido montado na pagina do lojista, registra, e manda o
// pedido COMPLETO por e-mail para quem atende (hoje a Camyla) e para o marketing, mais um aviso
// curto por Zaptos para quem acompanha (pedido_avisar_fones). Devolve o codigo.
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

// ---- quem e o lojista -------------------------------------------------------------------------
// Ordem do gestor em 26/10: "no email nao devia vir apenas a informacao do pedido, devia vir o
// resumo e as informacoes reais do cliente". Ate aqui o e-mail so tinha o que o lojista digitasse
// no formulario da pagina — e ele quase nunca digita: nos seis primeiros pedidos, loja, CNPJ,
// cidade e telefone vieram VAZIOS. Quem sabe quem e o lojista e a Nina, em copiloto_lead, e o CRM.
// A ponte entre as duas coisas e o lead_id, que a pagina passou a mandar na mesma data.
const GHL = (Deno.env.get("GHL_TOKEN") || "").trim();
const LOC = "rZ8y7lzqV7fzxsartaX2";

function foneFmt(v: unknown): string {
  let d = String(v ?? "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return String(v ?? "");
}

// O CRM guarda o que a tabela do lead nao tem: e-mail, e as vezes o endereco que alguem digitou
// no cadastro. Falha em silencio de proposito — pedido que entra nao pode travar porque o GHL
// demorou a responder.
async function contatoCrm(contact_id: string | null): Promise<any> {
  if (!contact_id || !GHL) return {};
  try {
    const r = await fetch(`https://services.leadconnectorhq.com/contacts/${contact_id}`, {
      headers: { Authorization: "Bearer " + GHL, Version: "2021-07-28", Accept: "application/json" },
    });
    if (!r.ok) return {};
    const c = (await r.json().catch(() => ({})))?.contact || {};
    return {
      email: c.email || null,
      fone: c.phone || null,
      empresa: c.companyName || null,
      endereco: [c.address1, c.city, c.state].filter(Boolean).join(", ") || null,
      cep: c.postalCode || null,
      dono: c.assignedTo || null,
    };
  } catch { return {}; }
}

async function achaLead(lead_id: number | null, contact_id: string | null): Promise<any> {
  try {
    let q = "";
    if (lead_id) q = `id=eq.${lead_id}`;
    else if (contact_id) q = `contact_id=eq.${encodeURIComponent(contact_id)}&order=id.desc&limit=1`;
    else return null;
    const r = await rest(`copiloto_lead?${q}&select=*`);
    if (!r.ok) return null;
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  } catch { return null; }
}

// ---- a planilha do pedido ----------------------------------------------------------------------
// Ordem do gestor em 26/10, com o layout que ele mandou: CNPJ, PEDIDO, EAN, QUANTIDADE, PRECO,
// FOB, TRANSPORTADORA. Tres decisoes que ele confirmou e que NAO sao obvias:
//   EAN        = a nossa REFERENCIA interna (163.004.002), nao o codigo de barras.
//   QUANTIDADE = UNIDADES, nao fardos. O lojista escolhe fardos na tela; 2 fardos de 12 = 24.
//   PRECO      = o unitario como aparece na tela, ja com a margem e com o CIF somado.
// FOB e TRANSPORTADORA saem em branco de proposito: quem preenche e o comercial.
// CSV com ponto-e-virgula e decimal com virgula — e o que o Excel em pt-BR abre com dois cliques.
// O BOM no inicio e o que faz o Excel ler os acentos; sem ele vira "Concha para cereais".
function planilhaCsv(p: any, itens: any[], codigo: string): string {
  const q = (v: unknown) => { const t = String(v ?? ""); return /[";\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const num = (v: number) => v.toFixed(2).replace(".", ",");
  const L = ["CNPJ;PEDIDO;EAN;QUANTIDADE;PRECO;FOB;TRANSPORTADORA"];
  for (const it of itens) {
    const un = n(it.fardos) * (n(it.emb) || 1);
    L.push([q(p.cnpj || ""), q(codigo), q(it.ref), String(Math.round(un)), num(n(it.preco)), "", ""].join(";"));
  }
  return "\uFEFF" + L.join("\r\n") + "\r\n";
}

// Sobe a planilha no mesmo bucket publico que serve as paginas e devolve a URL. O GHL so aceita
// anexo por URL — nao da para mandar o arquivo no corpo.
async function subirPlanilha(codigo: string, csv: string): Promise<string | null> {
  try {
    const caminho = `pedidos/${codigo}.csv`;
    const k = srvKey();
    const r = await fetch(`${URL_()}/storage/v1/object/app/${caminho}`, {
      method: "POST",
      headers: { apikey: k, Authorization: "Bearer " + k, "Content-Type": "text/csv; charset=utf-8",
                 "x-upsert": "true" },
      body: csv,
    });
    if (!r.ok) return null;
    return `${URL_()}/storage/v1/object/public/app/${caminho}`;
  } catch { return null; }
}

// ---- o pedido abaixo do minimo nao pode chegar calado -------------------------------------------
// A pagina NAO bloqueia: ela pergunta "quer enviar assim mesmo?" e o lojista pode confirmar. Em
// 26/10 entrou um pedido de R$ 705,60 com minimo de R$ 3.500 e o e-mail dizia "PEDIDO NOVO" como
// qualquer outro — o gestor abriu achando que era pedido para faturar. Agora o aviso vem no
// assunto, no corpo e no Zaptos.
function faltaMinimo(total: number, minimo: number): number {
  return (minimo > 0 && total > 0 && total < minimo) ? (minimo - total) : 0;
}

// ---- quando a marca do lead nao chega ------------------------------------------------------------
// O lojista pode estar com a pagina ANTIGA em cache no celular (a pagina tem 3,8 MB e o Safari
// segura), e a versao antiga nao mandava lead_id. Foi o que aconteceu no PED-0009 e no PED-0011.
// O `pedido-visita` grava a marca na hora em que a pagina abre, entao o pedido ainda pode ser
// identificado por ela: mesma cesta, na janela de poucas horas, visita mais recente primeiro.
// O retorno diz COMO foi identificado — "visita" nunca e apresentado como certeza.
async function leadPelaVisita(segmento: string): Promise<{ lead_id: number; quando: string } | null> {
  if (!segmento) return null;
  try {
    const desde = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
    const r = await rest(`pedido_visita?select=lead_id,em&segmento=eq.${encodeURIComponent(segmento)}` +
                         `&lead_id=not.is.null&em=gte.${desde}&order=em.desc&limit=1`);
    if (!r.ok) return null;
    const rows = await r.json().catch(() => []);
    if (!Array.isArray(rows) || !rows.length) return null;
    return { lead_id: Number(rows[0].lead_id), quando: String(rows[0].em) };
  } catch { return null; }
}

// O bloco que o gestor pediu. Tudo que existe de real sobre o lojista, e quando NAO existe o
// e-mail diz isso com todas as letras — "(nao informada)" caladamente ja nos custou tres pedidos
// que ninguem sabia de quem eram.
function blocoCliente(L: any, crm: any, p: any): string[] {
  const out: string[] = ["CLIENTE"];
  if (!L && !crm?.email) {
    out.push("NAO IDENTIFICADO — este pedido chegou sem a marca do lead no link.");
    if (p.loja || p.cnpj || p.cidade || p.fone) {
      if (p.loja) out.push(`Loja (digitada na pagina): ${p.loja}`);
      if (p.cnpj) out.push(`CNPJ ${fmtDoc(p.cnpj)}`);
      if (p.cidade) out.push(`Cidade: ${p.cidade}`);
      if (p.fone) out.push(`WhatsApp: ${foneFmt(p.fone)}`);
    } else {
      out.push("O lojista tambem nao preencheu nada no formulario da pagina.");
    }
    out.push("");
    return out;
  }
  const nome = L?.nome || "";
  if (nome) out.push(`Nome: ${nome}${L?.nome_confirmado ? "" : " (nome do perfil do WhatsApp — nao confirmado com ele)"}`);
  const loja = L?.empresa || crm?.empresa || p.loja;
  if (loja) out.push(`Loja: ${loja}`);
  const cnpj = L?.cnpj || p.cnpj;
  out.push(cnpj ? `CNPJ ${fmtDoc(cnpj)}` : "CNPJ: NAO INFORMADO ainda");
  const mail = crm?.email || null;
  if (mail) out.push(`E-mail: ${mail}`);
  const fone = L?.fone || crm?.fone || p.fone;
  if (fone) out.push(`WhatsApp: ${foneFmt(fone)}`);
  const praca = [L?.cidade, L?.uf].filter(Boolean).join("/") || p.cidade;
  if (praca) out.push(`Cidade: ${praca}`);
  const end = L?.endereco || crm?.endereco;
  out.push(end ? `Endereco: ${end}` : "Endereco: NAO INFORMADO ainda");
  const cep = L?.cep || crm?.cep;
  if (cep) out.push(`CEP: ${cep}`);
  out.push(L?.pagamento ? `Pagamento que ele quer: ${L.pagamento}` : "Forma de pagamento: NAO INFORMADA ainda");
  if (L?.tipo_loja) out.push(`Tipo de loja: ${L.tipo_loja}`);
  if (L?.interesse) out.push(`Quer abastecer: ${L.interesse}`);
  if (L?.ja_revende) out.push(`Compra hoje: ${L.ja_revende}`);
  if (L?.origem) out.push(`Origem: ${L.origem}`);
  if (L?.id) out.push(`Lead #${L.id}${L?.status ? " (" + L.status + ")" : ""}`);
  const cid = L?.contact_id || p.contact_id;
  if (cid) out.push(`Conversa no CRM: https://app.gohighlevel.com/v2/location/${LOC}/contacts/detail/${cid}`);
  if (L?.resumo) { out.push(""); out.push(`Resumo da Nina: ${L.resumo}`); }
  out.push("");
  return out;
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
function corpoEmail(p: any, itens: any[], codigo: string, lead: any, crm: any, extra: any) {
  const L: string[] = [];
  L.push(`PEDIDO ${codigo}`);
  if (extra?.falta > 0) {
    L.push("");
    L.push(`*** ABAIXO DO PEDIDO MINIMO *** faltam R$ ${brl(extra.falta)} para os R$ ${brl(extra.minimo)}.`);
    L.push("A pagina avisa o lojista e ele escolheu enviar assim mesmo. NAO e pedido para faturar como esta:");
    L.push("alguem precisa falar com ele para completar.");
  }
  L.push("");
  for (const l of blocoCliente(lead, crm, p)) L.push(l);
  if (extra?.identificado_por === "visita") {
    L.push(`(Identificado pela visita a pagina, nao pela marca do link — o pedido chegou sem ela.`);
    L.push(` Confira o CNPJ antes de faturar.)`);
    L.push("");
  }
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
  if (extra?.planilha) {
    L.push("");
    L.push("A planilha vai em anexo (CSV, abre no Excel). Na coluna PRECO esta o unitario de tela,");
    L.push("com a margem e o CIF ja somados; o desconto de 10% esta no TOTAL acima, nao na linha.");
  }
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

    // Quem e o lojista. O formulario da pagina quase sempre vem vazio, entao o que vale e o lead:
    // a marca ~L<id> do link chega em b.lead_id desde 26/10. A linha gravada passa a levar o que
    // se descobriu — ate aqui loja, cnpj, cidade e fone ficavam em branco no banco tambem.
    const leadId = Number(b.lead_id) > 0 ? Number(b.lead_id) : null;
    let lead = await achaLead(leadId, txt(b.contact_id, 40) || null);
    // Sem marca no link, tenta a visita. Ver leadPelaVisita: e o caso da pagina velha em cache.
    let identificadoPor = lead ? "marca" : "";
    if (!lead) {
      const v = await leadPelaVisita(txt(b.segmento, 60));
      if (v) { lead = await achaLead(v.lead_id, null); if (lead) identificadoPor = "visita"; }
    }
    const crm = await contatoCrm(lead?.contact_id || txt(b.contact_id, 40) || null);

    const reg = {
      segmento: txt(b.segmento, 60),
      loja: txt(c.loja, 120) || txt(lead?.empresa, 120) || txt(crm?.empresa, 120),
      cnpj: (txt(c.cnpj, 20) || txt(lead?.cnpj, 20)).replace(/\D/g, ""),
      cidade: txt(c.cidade, 80) || [lead?.cidade, lead?.uf].filter(Boolean).join("/").slice(0, 80),
      fone: txt(c.fone, 30) || txt(lead?.fone, 30) || txt(crm?.fone, 30),
      contact_id: txt(b.contact_id, 40) || txt(lead?.contact_id, 40) || null,
      lead_id: lead?.id ?? leadId,
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

    // A planilha que o comercial digita, e o aviso de pedido abaixo do minimo.
    const minimo = n(conf.pedido_minimo) || 0;
    const planilhaUrl = await subirPlanilha(codigo, planilhaCsv(reg, itens, codigo));
    const extra = {
      falta: faltaMinimo(reg.total, minimo),
      minimo,
      planilha: planilhaUrl,
      identificado_por: identificadoPor,
    };

    // ---- aviso por e-mail com o pedido COMPLETO, para cada destino ----
    // email_ok so e true quando TODOS receberam: se o do marketing sair e o de quem fecha nao, o
    // pedido esta perdido do mesmo jeito e a linha nao pode dizer que deu certo.
    let email_ok: boolean | null = null, email_erro: string | null = null;
    if ((conf.pedido_aviso_ativo || "sim").toLowerCase() === "sim" && destinos.length) {
      const corpo = corpoEmail(reg, itens, codigo, lead, crm, extra);
      const quem = reg.loja || lead?.nome || "";
      const alerta = extra.falta > 0 ? "[ABAIXO DO MINIMO] " : "";
      const assunto = `${alerta}${codigo} — pedido novo${quem ? " de " + quem : " (cliente NAO identificado)"} (R$ ${brl(reg.total)})`;
      const falhas: string[] = [];
      for (const d0 of destinos) {
        try {
          const r = await fetch(`${URL_()}/functions/v1/campanhas-enviar`, {
            method: "POST",
            headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" },
            body: JSON.stringify({
              canal: "email", email: d0, nome: d0 === para ? (dono || undefined) : undefined,
              assunto, texto: corpo,
              anexos: planilhaUrl ? [planilhaUrl] : undefined,
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

    // ---- aviso curto por Zaptos para quem acompanha ----
    // O e-mail vai para quem FECHA (a Camyla). Este aviso e para quem ACOMPANHA: pedido que entra
    // nao pode esperar alguem abrir a caixa de e-mail. Lista propria em pedido_avisar_fones, e nao
    // copiloto_responsaveis.avisar, que assina todo espelho de repasse — sao duas coisas.
    const avisoFones = (conf.pedido_avisar_fones || "").split(/[,;]/)
      .map((x) => x.replace(/\D/g, "")).filter((x) => x.length >= 10);
    let aviso_zap: any = null;
    if (avisoFones.length && (conf.pedido_aviso_ativo || "sim").toLowerCase() === "sim") {
      // o reg ja vem enriquecido pelo lead, entao este aviso tambem deixou de sair anonimo
      const curto = [
        extra.falta > 0 ? `PEDIDO ABAIXO DO MINIMO — ${codigo}` : `PEDIDO NOVO — ${codigo}`,
        extra.falta > 0 ? `Faltam R$ ${brl(extra.falta)} para os R$ ${brl(extra.minimo)}. Nao e para faturar como esta.` : "",
        extra.identificado_por === "visita" ? "(identificado pela visita a pagina, nao pela marca do link — confira o CNPJ)" : "",
        lead?.nome ? `Contato: ${lead.nome}` : "",
        reg.loja ? `Loja: ${reg.loja}` : "",
        reg.cnpj ? `CNPJ ${fmtDoc(reg.cnpj)}` : "",
        reg.cidade ? `Cidade: ${reg.cidade}` : "",
        reg.fone ? `WhatsApp: ${foneFmt(reg.fone)}` : "",
        "",
        `${itens.length} produtos | ${int(fardos)} fardos | ${int(pecas)} pecas`,
        `TOTAL: R$ ${brl(reg.total)}`,
        "",
        `Montado na pagina (${reg.segmento || "segmento nao informado"}). O pedido completo foi por e-mail para ${para || "ninguem"}.`,
        "Ele NAO combinou preco, prazo, pagamento nem frete com ninguem.",
      ].filter((x) => x !== "").join("\n");
      aviso_zap = [];
      for (const f of avisoFones) {
        try {
          const r = await fetch(`${URL_()}/functions/v1/campanhas-enviar`, {
            method: "POST",
            headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" },
            // usar_dono: o contato interno pode estar em nome de outra pessoa no CRM; sair pela
            // instancia do dono e melhor do que o recado morrer por cadastro.
            body: JSON.stringify({ canal: "whatsapp", fone: f, texto: curto,
                                   instancia: conf.pedido_status_inst || "Camyla", usar_dono: true }),
          });
          const d = await r.json().catch(() => ({}));
          aviso_zap.push({ fone: f, ok: !!d?.ok, motivo: d?.ok ? undefined : String(d?.motivo || "recusado").slice(0, 140) });
        } catch (e) { aviso_zap.push({ fone: f, ok: false, motivo: String(e).slice(0, 140) }); }
      }
    }

    // ---- e agora o CLIENTE sabe que o pedido chegou ---------------------------------------------
    // Ordem do gestor em 26/10. Ate aqui ninguem respondia a quem mandava pedido: o Luis Carlos
    // concluiu as 08:33 e as 08:44 a Nina pediu que ele "concluisse o pedido" — ela nao sabia. O
    // aviso sai pela instancia da Nina, para o contato do lead, e diz o valor que ele mandou.
    let aviso_cliente: any = null;
    if (lead?.contact_id && (conf.pedido_aviso_cliente || "sim").toLowerCase() === "sim") {
      const nomeC = String(lead?.nome || "").trim().split(/\s+/)[0] || "";
      const linhas = [
        (nomeC ? nomeC + ", s" : "S") + `eu pedido chegou certinho aqui: ${codigo}, no valor de R$ ${brl(reg.total)}.`,
        "",
        extra.falta > 0
          ? `Só um detalhe: o mínimo de fábrica é R$ ${brl(extra.minimo)} e o seu ficou em R$ ${brl(reg.total)}, então faltam R$ ${brl(extra.falta)} para a gente conseguir faturar. Posso te ajudar a completar com o que faz sentido pra sua loja?`
          : "Já passei para a nossa equipe comercial dar sequência com você.",
        "",
        "Na primeira compra a gente trabalha à vista ou em 6x no cartão sem juros.",
      ].filter((x) => x !== null).join("\n");
      try {
        const r = await fetch(`${URL_()}/functions/v1/campanhas-enviar`, {
          method: "POST",
          headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" },
          body: JSON.stringify({ canal: "whatsapp", contact_id: lead.contact_id, texto: linhas,
                                 instancia: conf.lead_inst || "Nina" }),
        });
        const d = await r.json().catch(() => ({}));
        aviso_cliente = { ok: !!d?.ok, motivo: d?.ok ? undefined : String(d?.motivo || "recusado").slice(0, 140) };
      } catch (e) { aviso_cliente = { ok: false, motivo: String(e).slice(0, 140) }; }
    }

    // A pagina so precisa do codigo e do resumo para montar a mensagem curta do WhatsApp.
    return j({
      ok: true, codigo, id: row.id, email_ok, aviso_zap, aviso_cliente,
      planilha: planilhaUrl, abaixo_do_minimo: extra.falta > 0 || undefined,
      lead_id: lead?.id ?? null, identificado_por: identificadoPor || undefined,
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
