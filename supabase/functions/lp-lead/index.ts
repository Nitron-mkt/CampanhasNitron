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
//  - nao escolhe dono por fora: o contato NOVO nasce com a Nina, que e quem vai falar com ele. O
//    numero de saida E o `assignedTo`, entao dono indefinido e numero de saida indefinido. Contato
//    que JA existe nao tem o dono mexido — e se alguem do time assumir depois, o dono muda e o
//    `campanhas-enviar` passa a recusar a saudacao automatica, que e a protecao que importa.
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
// Nome da instancia no `instancia_ghl`. Vai no lookup do CRM e na linha do lead — os dois tem de
// dizer a mesma coisa, senao o contato nasce de um jeito e o lead diz outro.
const INSTANCIA = "Nina";
// A location do GHL. A mesma do resto do projeto.
const LOC = "rZ8y7lzqV7fzxsartaX2";

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

// Le uma chave de `copiloto_config`. Pipeline, etapa e o molde das tags inteligentes moram la,
// nao em constante: sao parametro de operacao, e muda-los nao pode exigir deploy de uma funcao que
// recebe lead o dia inteiro.
async function cfg(chave: string): Promise<string> {
  try {
    const q = await rest(`copiloto_config?select=valor&chave=eq.${chave}`);
    return q.ok ? String((await q.json())[0]?.valor ?? "").trim() : "";
  } catch { return ""; }
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
async function praca(cep: string, ms = 6000): Promise<{ cidade: string; uf: string; regiao: string; perc: number } | { erro: string }> {
  const d = digits(cep);
  if (d.length !== 8) return { erro: "CEP invalido" };
  try {
    const r = await fetch(`https://viacep.com.br/ws/${d}/json/`, { signal: AbortSignal.timeout(ms) });
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

    // ---- PREVIA. So ela roda as duas cadeias na ida: ninguem esta esperando um link. ----
    if (dry) {
      const qc = await rest(`ghl_cliente?select=codparc,razao,situacao&cnpj=ilike.*${cnpj}*&limit=1`);
      const cli = qc.ok ? (await qc.json())[0] || null : null;
      const [rc0, pr0] = await Promise.all([ramoDoCnpj(cnpj), praca(cep)]);
      const tr = rc0 && !(rc0 as any).fim ? (rc0 as Ramo) : null;
      const rm = (tr?.ramo && TEM_CESTA.test(tr.ramo)) ? tr.ramo : (TEM_CESTA.test(ramoLp) ? ramoLp : "");
      const p0 = !(pr0 as any).erro ? (pr0 as { cidade: string; uf: string; regiao: string; perc: number }) : null;
      return j({
        ok: true, previa: true, nome, fone, cnpj, cep, email,
        ja_cliente: cli ? `${cli.razao} (codparc ${cli.codparc})` : null,
        ramo: rm, ramo_veio_de: tr?.ramo ? "CNAE do CNPJ" : (TEM_CESTA.test(ramoLp) ? "o que ele marcou na LP" : "nao resolvido"),
        cnae: tr?.cnae || null, razao: tr?.razao || null,
        praca: p0 ? `${p0.cidade}/${p0.uf} — ${p0.regiao} (${p0.perc}%)` : (pr0 as any).erro,
      });
    }

    // ====================================================================================
    // A ORDEM AQUI E DELIBERADA, e custou uma regressao em 05/11 para ficar assim.
    //
    // O servidor da LP desiste da ponte em 8 SEGUNDOS (`EXTERNAL_TIMEOUT_MS`) e, sem resposta,
    // devolve o protocolo SEM o link do WhatsApp — ou seja, o lojista termina o cadastro e NAO e
    // levado para a conversa, que e o passo que converte. Quando a ponte passou a abrir tambem a
    // oportunidade no funil, a soma (BrasilAPI ate 9s + ViaCEP + lookup no GHL + tags + PUT +
    // upsert da oportunidade) estourou esse limite: medido, o cadastro completou no servidor e
    // mesmo assim voltou sem link.
    //
    // Entao: grava o ESSENCIAL e responde; o resto acontece depois.
    //   1. a linha do lead com o que o formulario ja deu (nome, CNPJ, CEP) — uma escrita so;
    //   2. a praca pelo CEP, com 3s de teto, porque ela entra na saudacao;
    //   3. RESPONDE com o link;
    //   4. CNAE, contato no CRM, tags e funil rodam em segundo plano e completam a mesma linha.
    //
    // O que isso garante: o lead NUNCA se perde, mesmo que a Receita, o GHL ou o enriquecimento
    // inteiro falhem — o CNPJ e o CEP, que sao o que destrava o link de pedido, ja estao salvos
    // antes de qualquer chamada externa. E o lojista sempre recebe o link.
    // ====================================================================================
    const agora = new Date().toISOString();

    // ---- 1. a linha do lead, com o essencial, AGORA ----
    const baseRow: any = {
      fone, instancia: INSTANCIA, nome, nome_confirmado: true,
      cnpj, cep, origem, status: "frio",
      tipo_loja: String(b?.ramo_nome || "").slice(0, 120) || null,
      atualizado: agora,
    };
    let leadId: number | null = null;
    {
      const q = await rest(`copiloto_lead?select=id&fone=eq.${encodeURIComponent(fone)}&order=id.desc&limit=1`);
      const atual = q.ok ? (await q.json())[0] || null : null;
      if (atual?.id) {
        await rest(`copiloto_lead?id=eq.${atual.id}`, { method: "PATCH", body: JSON.stringify(baseRow) });
        leadId = atual.id;
      } else {
        const r = await rest("copiloto_lead", {
          method: "POST", headers: { Prefer: "return=representation" },
          body: JSON.stringify({ ...baseRow, criado: agora, resumo: "Cadastro pela landing Nitron Direto" + (protocolo ? ` (protocolo ${protocolo})` : "") + ". Enriquecimento em andamento." }),
        });
        if (!r.ok) return j({ ok: false, erro: "nao gravei o lead: " + (await r.text()).slice(0, 200) }, 500);
        leadId = (await r.json())[0]?.id ?? null;
      }
    }

    // ---- 2. a praca, com teto curto: ela entra na saudacao ----
    const pr = await praca(cep, 3000);
    const pOk = !(pr as any).erro ? (pr as { cidade: string; uf: string; regiao: string; perc: number }) : null;

    // ---- 3. o resto, em segundo plano ----
    const completar = async () => {
      const rc = await ramoDoCnpj(cnpj);
      const temRamo = rc && !(rc as any).fim ? (rc as Ramo) : null;
      const ramo = (temRamo?.ramo && TEM_CESTA.test(temRamo.ramo)) ? temRamo.ramo
                 : (TEM_CESTA.test(ramoLp) ? ramoLp : "");
      const ramoVeioDe = temRamo?.ramo ? "CNAE do CNPJ" : (TEM_CESTA.test(ramoLp) ? "o que ele marcou na LP" : "nao resolvido");

      // ja e cliente? Quem ja tem cadastro nao e lead: ele ja tem consultor.
      const qc = await rest(`ghl_cliente?select=codparc,razao,situacao&cnpj=ilike.*${cnpj}*&limit=1`);
      const cliente = qc.ok ? (await qc.json())[0] || null : null;

      // ---- contato no CRM ----
      // A INSTANCIA E OBRIGATORIA NO LOOKUP, mesmo sem mandar mensagem nenhuma: o `campanhas-enviar`
      // recusa WhatsApp sem instancia ANTES de procurar o contato (`sem_instancia`). Sem ela a
      // chamada voltava `ok:false` e o lead ficava sem contato — e SEM CONTATO NAO HA TAG.
      // Com a instancia, o contato NOVO nasce com a Nina como dono, que e quem vai falar com ele;
      // contato que JA existe nao tem o dono mexido.
      let contactId: string | null = null, crmErro: string | null = null;
      try {
        const lk = await fetch(`${URL_()}/functions/v1/campanhas-enviar`, {
          method: "POST",
          headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" },
          body: JSON.stringify({ lookup: true, canal: "whatsapp", instancia: INSTANCIA, fone, nome, email: email || undefined }),
        });
        const d = await lk.json().catch(() => ({} as any));
        contactId = d?.contactId || null;
        if (!contactId) crmErro = String(d?.motivo || "o CRM nao devolveu contato").slice(0, 200);
      } catch (e) { crmErro = String(e).slice(0, 200); }

      let tagsAplicadas: string[] = [];
      let oportErro: string | null = null;
      if (contactId) {
        // As tags entram pelo endpoint PROPRIO de tags, que SOMA. Um PUT em /contacts/{id} com
        // `tags` SUBSTITUI a lista inteira e apagaria calado o que o contato ja tinha.
        const fixas = String((await cfg("lp_tags")) || "lead,lp-nitron-direto")
          .split(",").map((t) => t.trim()).filter(Boolean).slice(0, 10);
        if (fixas.length) { try { await ghl("POST", `/contacts/${contactId}/tags`, { tags: fixas }); } catch { /* conforto, nao pre-requisito */ } }
        try { await ghl("PUT", `/contacts/${contactId}`, { source: origem, ...(email ? { email } : {}) }); } catch { /* idem */ }

        // TAG INTELIGENTE. A tag fixa diz DE ONDE o lead veio; esta diz O QUE ELE E, com o que a
        // ponte apurou: o ramo do CNAE e a UF do CEP. Tag com buraco (`lp-uf-` sozinho) nao vai —
        // tag, no GHL, ninguem apaga depois.
        const molde = (await cfg("lp_tags_inteligentes")) || "lp-ramo-{ramo},lp-uf-{uf}";
        const valores: Record<string, string> = {
          ramo: ramo || "indefinido",
          uf: (pOk?.uf || temRamo?.uf || "").toUpperCase(),
          cidade: (pOk?.cidade || "").toLowerCase().replace(/\s+/g, "-"),
        };
        tagsAplicadas = molde.split(",").map((t) => t.trim()).filter(Boolean)
          .map((t) => t.replace(/\{(\w+)\}/g, (_m, k) => valores[k] ?? ""))
          .filter((t) => t && !/\{|\}/.test(t) && !/[-_]$/.test(t)).slice(0, 6);
        if (tagsAplicadas.length) { try { await ghl("POST", `/contacts/${contactId}/tags`, { tags: tagsAplicadas }); } catch { /* idem */ } }

        // OPORTUNIDADE. UPSERT, nao create: casa por (pipeline, contato), entao quem preencher o
        // formulario duas vezes nao vira dois cards no funil. Sem pipeline configurado nao cria e
        // diz por que — chutar um pipeline seria pior.
        const pipeId = await cfg("lp_pipeline_id");
        const stageId = await cfg("lp_stage_id");
        if (!pipeId) oportErro = "lp_pipeline_id nao configurado";
        else {
          try {
            const o = await ghl("POST", "/opportunities/upsert", {
              pipelineId: pipeId, locationId: LOC, contactId, status: "open",
              ...(stageId ? { pipelineStageId: stageId } : {}),
              name: (temRamo?.razao || nome).slice(0, 120),
            });
            if (!o.ok) { const od = await o.json().catch(() => ({} as any)); oportErro = String(od?.message || od?.error || ("HTTP " + o.status)).slice(0, 160); }
          } catch (e) { oportErro = String(e).slice(0, 160); }
        }
      }

      const patch: any = {
        contact_id: contactId,
        empresa: temRamo?.razao || null,
        razao_social: temRamo?.razao || null,
        cidade: pOk?.cidade || temRamo?.cidade || null,
        uf: pOk?.uf || temRamo?.uf || null,
        cnae: temRamo?.cnae || null,
        cnae_desc: temRamo?.desc || null,
        ramo_cnae: ramo || null,
        // carimba que a consulta foi RESPONDIDA. Falha transitoria (rc === null) deixa vazio de
        // proposito, para o copiloto-lead perguntar de novo na primeira passada.
        cnae_em: rc ? new Date().toISOString() : null,
        codparc: cliente?.codparc || null,
        resumo: [
          "Cadastro pela landing Nitron Direto" + (protocolo ? ` (protocolo ${protocolo})` : "") + ".",
          `Ramo marcado: ${String(b?.ramo_nome || ramoLp || "nao informado")}.`,
          ramo ? `Cesta: ${ramo} (${ramoVeioDe}).` : "Cesta nao resolvida pelo CNAE — vale o mix geral da praca dele.",
          pOk ? `Praca: ${pOk.cidade}/${pOk.uf}.` : "Praca nao resolvida pelo CEP.",
          cliente ? `ATENCAO: o CNPJ ja tem cadastro — ${cliente.razao}, codparc ${cliente.codparc}, situacao ${cliente.situacao}.` : "CNPJ sem cadastro: lead novo.",
          crmErro ? `ATENCAO: contato NAO resolvido no CRM (${crmErro}) — sem contato nao ha tag nem conversa.` : "",
          tagsAplicadas.length ? `Tags: ${tagsAplicadas.join(", ")}.` : "",
          oportErro ? `ATENCAO: nao abri a oportunidade no funil (${oportErro}).` : "",
          "CNPJ e CEP ja estao preenchidos: o link de pedido pode sair na primeira resposta.",
        ].filter(Boolean).join(" ").slice(0, 900),
        atualizado: new Date().toISOString(),
      };
      if (leadId) await rest(`copiloto_lead?id=eq.${leadId}`, { method: "PATCH", body: JSON.stringify(patch) });
      return { contactId, tagsAplicadas, crmErro, oportErro, ramo, ramoVeioDe, razao: temRamo?.razao || null };
    };

    // `?sync=1` espera o enriquecimento e devolve o resultado dele — e como se confere a ponte
    // inteira sem depender do que a LP mostra na tela.
    const sync = u.searchParams.get("sync") === "1";
    let detalhe: any = undefined;
    if (sync) detalhe = await completar();
    else if (typeof (globalThis as any).EdgeRuntime?.waitUntil === "function") (globalThis as any).EdgeRuntime.waitUntil(completar());
    else await completar();   // runtime sem waitUntil: melhor devagar do que perder o enriquecimento

    // ---- 4. a mensagem que o lojista vai mandar ----
    // Mora aqui, e nao na LP, para o texto mudar sem tocar no Replit. Ela e a ABERTURA da conversa:
    // quem escreve e ele, entao a janela de 24h abre e a Nina responde em texto livre.
    const linhas = [
      `Olá! Sou ${nome} e acabei de me cadastrar no site da Nitron.`,
      String(b?.ramo_nome || "") ? `Minha loja é do ramo: ${b.ramo_nome}.` : "",
      pOk ? `Estou em ${pOk.cidade}/${pOk.uf}.` : "",
      "Já deixei CNPJ e CEP no cadastro. Quero ver a lista do meu ramo com os preços.",
      protocolo ? `(protocolo ${protocolo})` : "",
    ].filter(Boolean);
    const wa = `https://wa.me/${NINA_WA}?text=${encodeURIComponent(linhas.join("\n"))}`;

    return j({
      ok: true,
      lead_id: leadId,
      praca: pOk ? { cidade: pOk.cidade, uf: pOk.uf, regiao: pOk.regiao, perc_cif: pOk.perc } : null,
      praca_erro: (pr as any).erro || undefined,
      enriquecimento: sync ? detalhe : "em segundo plano",
      whatsapp_url: wa,
    });
  } catch (e) {
    return j({ ok: false, erro: String(e).slice(0, 300) }, 500);
  }
});
