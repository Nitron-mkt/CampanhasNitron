// forca-cadastro — leva o cadastro do lead da landing para o FORCA DE VENDAS.
//
// ORDEM DO GESTOR (17/11): "o cliente vem da campanha, manda os dados da LP para o forca e la ele
// vai fazer tudo". A `vendas.nitron.com.br` nao devolve uma pagina: ela abre PEDIDO DE VERDADE no
// ERP (numero de pedido, esteira do AD_STATUFORCA) e devolve o link.
//
// VAI SO O CADASTRO. Nenhum item, nenhuma cesta: quem monta o mix e a tela do Forca, como o
// lojista ja ve no link de hoje. Isso dispensou todo o de-para CODPROD->REFERENCIA e a conversao
// de peca para fardo que o desenho anterior exigia.
//
// POR QUE E FUNCAO PROPRIA, E NAO UMA CHAMADA DENTRO DA `lp-lead`:
//  1. A ponte esta recebendo lead agora. Publicar por cima dela para acrescentar uma chamada e
//     risco sem necessidade — a licao de 16/09 vale aqui igual.
//  2. O documento diz que CADA CONSULTA AO PROTOCOLO EMPURRA O PROCESSAMENTO do outro lado. Uma
//     varredura volta e termina o que nao coube; uma chamada inline tem uma janela so e desiste.
//  3. Regra nova que fala com sistema de fora tem de poder ser desligada sem deploy.
//
// NASCE DESLIGADA E SEM CRON (`forca_ativo='nao'`). Ligar exige as duas coisas.
//
// Uso (sempre com a chave de servico no Authorization):
//   ?acao=fila            quem entraria, sem mandar nada
//   ?acao=status          contagem do que ja foi, do que falta e do que deu erro
//   ?limite=N             processa ate N leads (respeita `forca_lote`)
//   &dry=1                igual a ?acao=fila
//
// O QUE AINDA NAO VAI: o objeto `entrega`. A API aceita cep + numero + complemento, e a landing
// ainda nao coleta numero nem complemento (pedido ao Replit em 17/11). Sem o numero o endereco
// nao se sustenta e o pedido nasce no endereco da Receita — que no lojista costuma ser o fiscal,
// nao o deposito. Melhor isso, e dito em voz alta no resumo, do que endereco pela metade.

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o, null, 2), { status: s, headers: { "Content-Type": "application/json" } });

const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const URL_ = () => Deno.env.get("SUPABASE_URL")!;
const API_GHL = "https://services.leadconnectorhq.com";
const FORCA_BASE = "https://vendas.nitron.com.br";
const FORCA_ID = "crm-nitron";

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

async function rest(path: string, init?: RequestInit) {
  const k = srvKey();
  return await fetch(`${URL_()}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: k, Authorization: "Bearer " + k, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
}

async function cfg(chave: string, padrao = ""): Promise<string> {
  try {
    const q = await rest(`copiloto_config?select=valor&chave=eq.${chave}`);
    const v = q.ok ? String((await q.json())[0]?.valor ?? "").trim() : "";
    return v || padrao;
  } catch { return padrao; }
}

// ---- credencial do Forca ----------------------------------------------------------------------
// O token vale 60 min. Guardar na instancia evita um /auth por lead. Nunca persistir: e credencial.
let tok: { t: string; exp: number } | null = null;
async function forcaToken(): Promise<string> {
  const seg = Deno.env.get("CRM_PEDIDO_SECRET") || "";
  if (!seg) throw new Error("CRM_PEDIDO_SECRET nao configurado");
  if (tok && tok.exp > Date.now() + 60_000) return tok.t;
  const r = await fetch(`${FORCA_BASE}/api/crm/auth`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: FORCA_ID, client_secret: seg }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`auth ${r.status}: ${(await r.text()).slice(0, 160)}`);
  const d = await r.json();
  if (!d?.access_token) throw new Error("auth sem access_token");
  tok = { t: d.access_token, exp: Date.now() + (Number(d.expires_in) || 3600) * 1000 };
  return tok.t;
}

// ---- e-mail: a landing coleta, mas ele so existe no contato do CRM ----------------------------
// A API EXIGE e-mail. Ate 17/11 a `copiloto_lead` nao tinha a coluna, entao aqui ele e buscado no
// contato e GRAVADO — da proxima vez ja esta em casa.
async function emailDoCrm(contactId: string): Promise<string> {
  try {
    const r = await fetch(`${API_GHL}/contacts/${contactId}`, {
      headers: { Authorization: "Bearer " + Deno.env.get("GHL_TOKEN"), Version: "2021-07-28", Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return "";
    const d = await r.json();
    return String(d?.contact?.email || "").trim().toLowerCase();
  } catch { return ""; }
}

type Lead = { id: number; nome: string; cnpj: string; cep: string; fone: string; email: string | null;
              contact_id: string | null; empresa: string | null; forca_protocolo: string | null };

async function patch(id: number, campos: Record<string, unknown>) {
  await rest(`copiloto_lead?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(campos) });
}

// ---- abre (ou termina de abrir) o pedido de UM lead -------------------------------------------
async function tratar(L: Lead): Promise<Record<string, unknown>> {
  const H = { Authorization: "Bearer " + (await forcaToken()), "Content-Type": "application/json" };
  const agora = new Date().toISOString();

  // JA TEM PROTOCOLO: so consultar. E isto que faz a varredura valer — a consulta empurra o
  // processamento do outro lado, entao o que ficou pela metade fecha aqui.
  if (L.forca_protocolo) {
    const g = await fetch(`${FORCA_BASE}/api/crm/orcamento/${L.forca_protocolo}`, { headers: H, signal: AbortSignal.timeout(120_000) });
    const e = await g.json().catch(() => ({} as any));
    if (e?.status === "pronto") {
      await patch(L.id, { forca_pedido: e.pedido, forca_link: e.link, forca_validade: e.validade, forca_erro: null, forca_em: agora });
      return { lead: L.id, nome: L.nome, acao: "terminado", pedido: e.pedido, validade: e.validade };
    }
    if (e?.status === "erro") {
      await patch(L.id, { forca_erro: `${e.erro}: ${String(e.mensagem || "").slice(0, 200)}`, forca_em: agora });
      return { lead: L.id, nome: L.nome, acao: "recusado", erro: e.erro, mensagem: e.mensagem };
    }
    return { lead: L.id, nome: L.nome, acao: "ainda processando", protocolo: L.forca_protocolo };
  }

  // NOVO: precisa de e-mail. Sem e-mail a API nem aceita o POST.
  let email = String(L.email || "").trim().toLowerCase();
  if (!email && L.contact_id) {
    email = await emailDoCrm(L.contact_id);
    if (email) await patch(L.id, { email });
  }
  if (!email) {
    await patch(L.id, { forca_erro: "sem e-mail: a API exige, e nem o lead nem o contato do CRM tem", forca_em: agora });
    return { lead: L.id, nome: L.nome, acao: "sem e-mail" };
  }

  const corpo = { cnpj: digits(L.cnpj), contato: L.nome.slice(0, 100), email, whatsapp: digits(L.fone) };
  const r = await fetch(`${FORCA_BASE}/api/crm/orcamento`, {
    method: "POST", headers: H, body: JSON.stringify(corpo), signal: AbortSignal.timeout(120_000),
  });
  const d = await r.json().catch(() => ({} as any));

  // O POST responde 202 nos DOIS casos (processando e pronto): quem manda e o campo `status`, nao
  // o codigo HTTP. Ler o HTTP aqui faria "processando" parecer conclusao.
  if (!d?.protocolo) {
    const m = `POST ${r.status}: ${String(d?.mensagem || d?.erro || "sem protocolo").slice(0, 200)}`;
    await patch(L.id, { forca_erro: m, forca_em: agora });
    return { lead: L.id, nome: L.nome, acao: "falhou", erro: m };
  }

  // Grava o protocolo ANTES de qualquer outra coisa: sem ele, o trabalho ja feito do lado deles
  // fica orfao e nao ha como terminar depois.
  await patch(L.id, { forca_protocolo: d.protocolo, forca_erro: null, forca_em: agora });

  if (d.status === "pronto") {
    await patch(L.id, { forca_pedido: d.pedido, forca_link: d.link, forca_validade: d.validade });
    return { lead: L.id, nome: L.nome, acao: "pronto na hora", protocolo: d.protocolo, pedido: d.pedido };
  }
  if (d.status === "erro") {
    await patch(L.id, { forca_erro: `${d.erro}: ${String(d.mensagem || "").slice(0, 200)}` });
    return { lead: L.id, nome: L.nome, acao: "recusado", erro: d.erro, mensagem: d.mensagem };
  }
  return { lead: L.id, nome: L.nome, acao: "aberto, processando", protocolo: d.protocolo };
}

Deno.serve(async (req) => {
  try {
    // Esta funcao escreve no ERP. So a chave de servico entra — e ela tem DUAS grafias neste
    // projeto: o SRV_JWT (o JWT que o PostgREST aceita) e o SUPABASE_SERVICE_ROLE_KEY (que vem
    // como `sb_secret_` e o PostgREST recusa). O cofre guarda uma delas; aceitar as duas evita
    // ficar trancado do lado de fora da propria funcao.
    const auth = req.headers.get("Authorization") || "";
    const aceitas = [Deno.env.get("SRV_JWT"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")]
      .filter(Boolean).map((k) => "Bearer " + k);
    if (!aceitas.includes(auth)) return j({ ok: false, erro: "nao autorizado" }, 401);

    const u = new URL(req.url);
    const acao = u.searchParams.get("acao") || "";
    const dry = u.searchParams.get("dry") === "1" || acao === "fila";

    // ---- ?acao=avulso: chama a API com UM CNPJ qualquer, sem tocar na fila de leads -----------
    // Serve para ver o que a API faz com cliente que JA e da casa: atendido por representante,
    // inativo ha anos, com Clube vigente. E chamada DE VERDADE — se a API nao recusar, nasce
    // pedido no ERP. O resultado fica em `forca_teste` para a decisao nao depender de memoria.
    if (acao === "avulso") {
      const cnpj = digits(u.searchParams.get("cnpj"));
      const contato = (u.searchParams.get("contato") || "").trim();
      const email = (u.searchParams.get("email") || "").trim().toLowerCase();
      const whatsapp = digits(u.searchParams.get("whatsapp"));
      const caso = (u.searchParams.get("caso") || "").slice(0, 40);
      const razao = (u.searchParams.get("razao") || "").slice(0, 200);
      const codparc = Number(u.searchParams.get("codparc") || 0) || null;
      if (cnpj.length !== 14 || !contato || !email || whatsapp.length < 10) {
        return j({ ok: false, erro: "avulso exige cnpj(14), contato, email e whatsapp" }, 400);
      }
      const t0 = Date.now();
      const H = { Authorization: "Bearer " + (await forcaToken()), "Content-Type": "application/json" };
      const r = await fetch(`${FORCA_BASE}/api/crm/orcamento`, {
        method: "POST", headers: H, body: JSON.stringify({ cnpj, contato, email, whatsapp }),
        signal: AbortSignal.timeout(120_000),
      });
      let d = await r.json().catch(() => ({} as any));
      let consultas = 0;
      // Consulta ate fechar. Cada GET empurra o processamento do outro lado.
      while (d?.protocolo && d?.status === "processando" && consultas < 8) {
        await new Promise((s) => setTimeout(s, 12_000));
        consultas++;
        const g = await fetch(`${FORCA_BASE}/api/crm/orcamento/${d.protocolo}`, { headers: H, signal: AbortSignal.timeout(120_000) });
        const e = await g.json().catch(() => ({} as any));
        if (e?.status) d = { ...d, ...e };
        if (d.status !== "processando") break;
      }
      const seg = Math.round((Date.now() - t0) / 100) / 10;
      const reg = { caso, codparc, razao, cnpj, contato, email, whatsapp,
                    protocolo: d?.protocolo || null, pedido: d?.pedido || null, link: d?.link || null,
                    validade: d?.validade || null, erro: d?.erro || null,
                    mensagem: d?.mensagem || null, consultas, segundos: seg };
      await rest("forca_teste", { method: "POST", body: JSON.stringify(reg) });
      return j({ ok: true, caso, razao, http: r.status, status: d?.status || null, segundos: seg, consultas, ...reg });
    }

    const origens = (await cfg("forca_origens", "nitron-direto-lp%,lp-nitron%")).split(",").map((s) => s.trim()).filter(Boolean);
    const filtroOrigem = "(" + origens.map((o) => `origem.ilike.${o}`).join(",") + ")";
    const sel = "id,nome,cnpj,cep,fone,email,contact_id,empresa,forca_protocolo,forca_pedido,forca_erro,criado";

    if (acao === "status") {
      const q = await rest(`copiloto_lead?select=${sel}&or=${filtroOrigem}&limit=1000`);
      const rows = q.ok ? await q.json() : [];
      return j({
        ok: true, origens,
        total: rows.length,
        com_pedido: rows.filter((r: any) => r.forca_pedido).length,
        processando: rows.filter((r: any) => r.forca_protocolo && !r.forca_pedido && !r.forca_erro).length,
        com_erro: rows.filter((r: any) => r.forca_erro).length,
        nunca_enviados: rows.filter((r: any) => !r.forca_protocolo && !r.forca_erro).length,
        ativo: await cfg("forca_ativo", "nao"),
      });
    }

    // A FILA tem duas partes, e a ordem importa: primeiro quem ja tem protocolo (terminar o que
    // esta a meio custa uma chamada e fecha um pedido), depois quem nunca foi.
    const qp = await rest(`copiloto_lead?select=${sel}&or=${filtroOrigem}&forca_protocolo=not.is.null&forca_pedido=is.null&forca_erro=is.null&order=criado.asc&limit=50`);
    const pendentes: Lead[] = qp.ok ? await qp.json() : [];
    const qn = await rest(`copiloto_lead?select=${sel}&or=${filtroOrigem}&forca_protocolo=is.null&forca_erro=is.null&order=criado.desc&limit=50`);
    const novos: Lead[] = (qn.ok ? await qn.json() : []).filter((l: Lead) => digits(l.cnpj).length === 14);

    const lote = Number(await cfg("forca_lote", "3")) || 3;
    const limite = Math.max(1, Math.min(Number(u.searchParams.get("limite") || lote) || lote, 20));
    const fila = [...pendentes, ...novos].slice(0, limite);

    if (dry) {
      return j({ ok: true, previa: true, origens, lote, limite,
        terminar: pendentes.length, abrir: novos.length,
        fila: fila.map((l) => ({ lead: l.id, nome: l.nome, empresa: l.empresa, cnpj: digits(l.cnpj),
                                 tem_email: !!l.email, protocolo: l.forca_protocolo })) });
    }

    const ativo = (await cfg("forca_ativo", "nao")).toLowerCase();
    if (ativo !== "sim") return j({ ok: false, erro: "forca_ativo nao esta 'sim' — ligar e UPDATE em copiloto_config", fila: fila.length });
    if (!Deno.env.get("CRM_PEDIDO_SECRET")) return j({ ok: false, erro: "CRM_PEDIDO_SECRET nao configurado" }, 500);

    const feito: Record<string, unknown>[] = [];
    for (const L of fila) {
      try { feito.push(await tratar(L)); }
      catch (e) { feito.push({ lead: L.id, nome: L.nome, acao: "erro", detalhe: String(e).slice(0, 200) }); }
    }
    return j({ ok: true, processados: feito.length, restam_terminar: pendentes.length, restam_abrir: novos.length, feito });
  } catch (e) {
    return j({ ok: false, erro: String(e).slice(0, 400) }, 500);
  }
});
