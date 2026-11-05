// lp-lead — a ponte entre a landing "Nitron Direto" (Replit) e a Nina.
//
// O QUE ELA RESOLVE. A LP ja pedia ao lojista, num formulario so, exatamente os tres dados que
// travam o link de pedido: CNPJ (com digito verificador conferido), CEP e ramo. Mas o cadastro
// morria no Postgres do proprio Replit: nao criava contato no CRM, nao avisava ninguem, e o
// lojista ficava com um numero de protocolo esperando um contato que ninguem sabia que tinha de
// fazer. Esta funcao pega esse cadastro e o entrega pronto para a Nina.
//
// POR QUE ISSO MUDA O JOGO. Um lead do anuncio gasta 4 a 6 mensagens ate a Nina arrancar CNPJ e
// CEP — e e nesse vai-e-vem que ele desiste. Aqui os dois ja vem digitados. Quando ele mandar a
// primeira mensagem, o `copiloto-lead` encontra a linha de `copiloto_lead` ja preenchida, o
// `link_pedido` passa nas travas de primeira, e o link com a cesta certa e o preco final da praca
// dele sai NA PRIMEIRA RESPOSTA.
//
// O GANCHO QUE FAZ A NINA ATENDER. O `copiloto-lead` pula quem nao tem tag, nao tem `source` no
// CRM e cuja mensagem nao parece abertura (linha 630) — mas ele NAO pula quem ja tem linha em
// `copiloto_lead`. Criar a linha aqui, chaveada pelo telefone, e o que garante o atendimento sem
// precisar publicar a funcao de lead, que esta atendendo gente neste momento.
//
// O TEXTO DO WHATSAPP MORA AQUI, nao na LP. A pagina so redireciona para a URL que esta funcao
// devolve. Mudar a mensagem passa a ser deploy desta funcao, sem mexer no Replit — e sem risco de
// a LP e a Nina discordarem sobre o que foi dito.
//
// O QUE ELA NAO FAZ, de proposito:
//  - nao manda mensagem nenhuma. Quem fala e a Nina, quando o lojista escrever. Assim um POST
//    forjado nao vira Zaptos para um numero de terceiro.
//  - nao define dono do contato no CRM. Contato de lead SEM DONO recebe Zaptos normalmente; com
//    dono de outra instancia, o `campanhas-enviar` recusa o envio da Nina.
//
// Uso:
//   POST /lp-lead            header `x-lp-token: <LP_TOKEN>`
//   body { nome, email, whatsapp, cnpj, cep, ramo, consentimento, origem?, protocolo? }
//   ?dry=1 na query  ve o que seria gravado, sem gravar
//
// Deploy: supabase functions deploy lp-lead --no-verify-jwt
//   (verify_jwt FALSE: quem chama e o servidor da LP, que se identifica pelo LP_TOKEN. Publicar
//    com verify_jwt true derruba todo cadastro que entrar — conferir no retorno do deploy.)

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), {
    status: s,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*",
               "Access-Control-Allow-Headers": "content-type, x-lp-token",
               "Access-Control-Allow-Methods": "POST, OPTIONS" },
  });

const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const URL_ = () => Deno.env.get("SUPABASE_URL")!;
const API = "https://services.leadconnectorhq.com";
const UA = "Mozilla/5.0 (compatible; NitronBot/1.0)";

// WhatsApp da Nina. O mesmo numero da pagina de pedido.
const NINA_WA = "5511960390203";

const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
// grava o numero INTEIRO: tira o 55 so quando o que sobra ainda e numero brasileiro plausivel.
// Guardar "os ultimos N digitos" ja custou leads entregues ao vendedor com numero inexistente.
const foneNac = (s: unknown) => { let d = digits(s); if (d.length >= 12 && d.startsWith("55")) d = d.slice(2); return d; };

function cnpjValido(v: unknown): boolean {
  const c = digits(v);
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const calc = (n: number) => {
    let s = 0, p = n - 7;
    for (let i = 0; i < n; i++) { s += Number(c[i]) * p--; if (p < 2) p = 9; }
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(c[12]) && calc(13) === Number(c[13]);
}

async function rest(path: string, init?: RequestInit) {
  const k = srvKey();
  return await fetch(`${URL_()}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: k, Authorization: "Bearer " + k, "Content-Type": "application/json",
               ...(init?.headers || {}) },
  });
}

function ghl(method: string, path: string, body: unknown, version = "2021-07-28") {
  return fetch(API + path, {
    method,
    headers: { Authorization: "Bearer " + Deno.env.get("GHL_TOKEN"), Version: version,
               "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ---- CNPJ -> CNAE -> ramo ---------------------------------------------------------------------
// So R01..R10 tem cesta montada em `pedido_base`. CNAE que cai noutro ramo devolve vazio de
// proposito: melhor a cesta geral do que apontar para uma que nao existe.
const TEM_CESTA = /^R(0[1-9]|10)$/;
type Ramo = { ramo: string; cnae: string; desc: string; razao: string; cidade: string; uf: string };
// Tres retornos, e eles sao diferentes. A BrasilAPI limita chamada: um 429 quer dizer "pergunte de
// novo", nao "este CNPJ nao tem CNAE". Tratar falha transitoria como resposta marca o lead como
// consultado para sempre e devolve a cesta ao palpite.
async function ramoDoCnpj(cnpj: string): Promise<Ramo | { fim: true } | null> {
  const d = digits(cnpj);
  if (d.length !== 14) return { fim: true };
  try {
    const r = await fetch("https://brasilapi.com.br/api/cnpj/v1/" + d, { signal: AbortSignal.timeout(9000) });
    if (r.status === 404) return { fim: true };
    if (!r.ok) return null;
    const v = await r.json();
    const cnae = String(v?.cnae_fiscal || "").replace(/\D/g, "");
    if (!cnae) return { fim: true };
    const q = await rest(`cnae_ramo?select=ramo_sigla&cnae7=eq.${cnae}`);
    const sig = String((q.ok ? (await q.json())[0]?.ramo_sigla : "") || "").toUpperCase();
    return {
      ramo: TEM_CESTA.test(sig) ? sig : "",
      cnae,
      desc: String(v?.cnae_fiscal_descricao || "").slice(0, 150),
      razao: String(v?.razao_social || "").slice(0, 150),
      cidade: String(v?.municipio || "").slice(0, 80),
      uf: String(v?.uf || "").toUpperCase().slice(0, 2),
    };
  } catch { return null; }
}

// ---- CEP -> praca -----------------------------------------------------------------------------
// A chave e o COD_IBGE, nunca o nome da cidade: a base do Sankhya tem grafia divergente e nomes
// com e sem acento, e casar por nome erra calado — e erra no preco.
async function praca(cep: string): Promise<{ cidade: string; uf: string; regiao: string; perc: number } | { erro: string }> {
  const d = digits(cep);
  if (d.length !== 8) return { erro: "CEP invalido" };
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return { erro: "ViaCEP nao respondeu" };
    const v = await r.json();
    const ibge = Number(String(v?.ibge || "").replace(/\D/g, ""));
    if (!ibge) return { erro: "CEP sem codigo IBGE" };
    const q = await rest(`pedido_frete_cidade?select=cidade,uf,regiao,perc_cif&cod_ibge=eq.${ibge}`);
    const row = q.ok ? (await q.json())[0] : null;
    if (!row) return { erro: `o CEP ${d} aponta ${v?.localidade}/${v?.uf}, fora da tabela de frete` };
    return { cidade: row.cidade, uf: row.uf, regiao: row.regiao, perc: Number(row.perc_cif) || 0 };
  } catch { return { erro: "ViaCEP fora do ar" }; }
}

const prim = (s: string) => (String(s || "").trim().split(/\s+/)[0] || "");

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return j({ ok: true });
    if (req.method !== "POST") return j({ ok: false, erro: "use POST" }, 405);

    // O segredo identifica o SERVIDOR da LP. Nao e chave de banco: existe so para um POST forjado
    // nao virar contato no CRM e linha de lead.
    const esperado = Deno.env.get("LP_TOKEN") || "";
    if (!esperado) return j({ ok: false, erro: "LP_TOKEN nao configurado nesta funcao" }, 500);
    if ((req.headers.get("x-lp-token") || "") !== esperado) return j({ ok: false, erro: "nao autorizado" }, 401);

    const u = new URL(req.url);
    const dry = u.searchParams.get("dry") === "1";
    const b = await req.json().catch(() => ({} as any));

    // ---- validacao. A LP ja valida, mas o servidor nao confia no cliente. ----
    const nome = String(b?.nome || "").replace(/\s+/g, " ").trim();
    const fone = foneNac(b?.whatsapp || b?.fone);
    const cnpj = digits(b?.cnpj);
    const cep = digits(b?.cep);
    const email = String(b?.email || "").trim().toLowerCase();

    const falta: string[] = [];
    if (nome.split(" ").length < 2 || nome.length < 3) falta.push("nome e sobrenome");
    if (fone.length < 10 || fone.length > 11) falta.push("whatsapp com DDD");
    if (!cnpjValido(cnpj)) falta.push("CNPJ valido");
    if (cep.length !== 8) falta.push("CEP de 8 digitos");
    if (b?.consentimento !== true) falta.push("consentimento de contato");
    if (falta.length) return j({ ok: false, erro: "cadastro incompleto", falta }, 400);

    const ramoLp = String(b?.ramo || "").toUpperCase().trim();   // R01..R10, vindo do select da LP
    const origem = String(b?.origem || "lp-nitron-direto").slice(0, 120);
    const protocolo = String(b?.protocolo || "").slice(0, 60);

    // ---- ja e cliente? Quem ja tem cadastro nao e lead: ele ja tem consultor. ----
    const qc = await rest(`ghl_cliente?select=codparc,razao,situacao&cnpj=ilike.*${cnpj}*&limit=1`);
    const cliente = qc.ok ? (await qc.json())[0] || null : null;

    // ---- enriquecimento: as duas cadeias, em paralelo ----
    const [rc, pr] = await Promise.all([ramoDoCnpj(cnpj), praca(cep)]);
    const temRamo = rc && !(rc as any).fim ? (rc as Ramo) : null;
    const ramo = (temRamo?.ramo && TEM_CESTA.test(temRamo.ramo)) ? temRamo.ramo
               : (TEM_CESTA.test(ramoLp) ? ramoLp : "");
    const ramoVeioDe = temRamo?.ramo ? "CNAE do CNPJ" : (TEM_CESTA.test(ramoLp) ? "o que ele marcou na LP" : "nao resolvido");
    const pOk = !(pr as any).erro ? (pr as { cidade: string; uf: string; regiao: string; perc: number }) : null;

    if (dry) return j({
      ok: true, previa: true, nome, fone, cnpj, cep, email,
      ja_cliente: cliente ? `${cliente.razao} (codparc ${cliente.codparc})` : null,
      ramo, ramo_veio_de: ramoVeioDe, cnae: temRamo?.cnae || null, razao: temRamo?.razao || null,
      praca: pOk ? `${pOk.cidade}/${pOk.uf} — ${pOk.regiao} (${pOk.perc}%)` : (pr as any).erro,
    });

    // ---- contato no CRM. Sem dono, de proposito. ----
    // O `campanhas-enviar` em modo lookup acha ou cria o contato e devolve o id — e o mesmo caminho
    // que todo o resto do projeto usa, entao o de-para de telefone e duplicidade ja esta resolvido.
    let contactId: string | null = null;
    let contatoCriado = false, donoCrm: string | null = null;
    try {
      const lk = await fetch(`${URL_()}/functions/v1/campanhas-enviar`, {
        method: "POST",
        headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" },
        body: JSON.stringify({ lookup: true, canal: "whatsapp", fone, nome, email: email || undefined }),
      });
      const d = await lk.json().catch(() => ({} as any));
      contactId = d?.contactId || null;
      contatoCriado = !!d?.criado;
      donoCrm = d?.dono_crm || null;
    } catch { /* segue: a linha do lead vale mesmo sem contato resolvido */ }

    // TAG E ORIGEM NO CONTATO — e por elas que quem abre o CRM ve de onde o lead veio.
    //
    // As tags entram pelo endpoint PROPRIO de tags, que SOMA. Um PUT em /contacts/{id} com `tags`
    // SUBSTITUI a lista inteira: num contato que ja existia (lojista que voltou, ou que ja falou
    // com a Nina antes) isso apagaria calado as tags que ele ja tinha, inclusive as que o fluxo do
    // GHL usa para decidir atendimento.
    //
    // Quais tags, em copiloto_config.lp_tags (separadas por virgula): trocar e UPDATE, sem deploy.
    if (contactId) {
      const qt = await rest("copiloto_config?select=valor&chave=eq.lp_tags");
      const tags = String((qt.ok ? (await qt.json())[0]?.valor : "") || "lead,lp-nitron-direto")
        .split(",").map((t) => t.trim()).filter(Boolean).slice(0, 10);
      if (tags.length) {
        try { await ghl("POST", `/contacts/${contactId}/tags`, { tags }); }
        catch { /* a tag e conforto para quem le o CRM, nao pre-requisito do atendimento */ }
      }
      // o `source` o copiloto-lead LE para dizer a Nina de onde o lead veio, entao vale o PUT —
      // mas sem `tags` no corpo, para nao reabrir o problema de cima.
      try { await ghl("PUT", `/contacts/${contactId}`, { source: origem, ...(email ? { email } : {}) }); }
      catch { /* idem */ }
    }

    // ---- a linha do lead. E ela que faz a Nina atender e que carrega CNPJ e CEP. ----
    const agora = new Date().toISOString();
    const row: any = {
      contact_id: contactId, fone, instancia: "Nina",
      nome, nome_confirmado: true,          // ele mesmo digitou, com sobrenome conferido
      empresa: temRamo?.razao || null,
      razao_social: temRamo?.razao || null,
      cnpj, cep,
      cidade: pOk?.cidade || temRamo?.cidade || null,
      uf: pOk?.uf || temRamo?.uf || null,
      cnae: temRamo?.cnae || null,
      cnae_desc: temRamo?.desc || null,
      ramo_cnae: ramo || null,
      // carimba que a consulta foi RESPONDIDA. Falha transitoria (rc === null) deixa vazio de
      // proposito, para o copiloto-lead perguntar de novo na primeira passada.
      cnae_em: rc ? agora : null,
      origem, status: "frio",
      tipo_loja: String(b?.ramo_nome || "").slice(0, 120) || null,
      codparc: cliente?.codparc || null,
      resumo: [
        "Cadastro pela landing Nitron Direto" + (protocolo ? ` (protocolo ${protocolo})` : "") + ".",
        `Ramo marcado: ${String(b?.ramo_nome || ramoLp || "nao informado")}.`,
        ramo ? `Cesta: ${ramo} (${ramoVeioDe}).` : "Cesta nao resolvida pelo CNAE.",
        pOk ? `Praca: ${pOk.cidade}/${pOk.uf}.` : "Praca nao resolvida pelo CEP.",
        cliente ? `ATENCAO: o CNPJ ja tem cadastro — ${cliente.razao}, codparc ${cliente.codparc}, situacao ${cliente.situacao}.` : "CNPJ sem cadastro: lead novo.",
        "CNPJ e CEP ja estao preenchidos: o link de pedido pode sair na primeira resposta.",
      ].join(" ").slice(0, 900),
      atualizado: agora,
    };

    // upsert por contact_id, ou por telefone quando o CRM nao resolveu
    const col = contactId ? "contact_id" : "fone";
    const val = contactId || fone;
    const qa = await rest(`copiloto_lead?select=id&${col}=eq.${encodeURIComponent(val)}&order=id.desc&limit=1`);
    const atual = qa.ok ? (await qa.json())[0] || null : null;

    let leadId: number | null = null;
    if (atual?.id) {
      // ja existia (ele ja tinha falado com a Nina antes): completa sem apagar o que ja havia
      const r = await rest(`copiloto_lead?id=eq.${atual.id}`, {
        method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(row),
      });
      leadId = r.ok ? (await r.json())[0]?.id ?? atual.id : atual.id;
    } else {
      const r = await rest("copiloto_lead", {
        method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ ...row, criado: agora }),
      });
      if (!r.ok) return j({ ok: false, erro: "nao gravei o lead: " + (await r.text()).slice(0, 200) }, 500);
      leadId = (await r.json())[0]?.id ?? null;
    }

    // ---- a mensagem que o lojista vai mandar ----
    // Mora aqui, e nao na LP, para o texto mudar sem tocar no Replit. Ela e a ABERTURA da conversa:
    // quem escreve e ele, entao a janela de 24h abre e a Nina responde em texto livre.
    const linhas = [
      `Olá! Sou ${nome} e acabei de me cadastrar no site da Nitron.`,
      temRamo?.razao ? `Minha loja é a ${temRamo.razao}.` : "",
      String(b?.ramo_nome || "") ? `Ramo: ${b.ramo_nome}.` : "",
      pOk ? `Estou em ${pOk.cidade}/${pOk.uf}.` : "",
      "Já deixei CNPJ e CEP no cadastro. Quero ver a lista do meu ramo com os preços.",
      protocolo ? `(protocolo ${protocolo})` : "",
    ].filter(Boolean);
    const wa = `https://wa.me/${NINA_WA}?text=${encodeURIComponent(linhas.join("\n"))}`;

    return j({
      ok: true,
      lead_id: leadId,
      contact_id: contactId,
      contato_criado: contatoCriado,
      dono_crm: donoCrm,
      ja_cliente: cliente ? { codparc: cliente.codparc, razao: cliente.razao, situacao: cliente.situacao } : null,
      ramo, ramo_veio_de: ramoVeioDe,
      praca: pOk ? { cidade: pOk.cidade, uf: pOk.uf, regiao: pOk.regiao, perc_cif: pOk.perc } : null,
      praca_erro: (pr as any).erro || undefined,
      whatsapp_url: wa,
    });
  } catch (e) {
    return j({ ok: false, erro: String(e).slice(0, 300) }, 500);
  }
});
