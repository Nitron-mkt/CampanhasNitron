// camp-pipeline — mantem o card de cada lead de campanha na etapa certa do pipeline
// "Leads das Campanhas" (`Ddc2boEemLbeixx6xmIA`), criado pelo gestor em 17/11.
//
// A REGRA DO DESENHO: so existe etapa que algum sinal move sozinho. Etapa que depende de alguem
// arrastar card morre em duas semanas — por isso cada etapa aqui tem uma condicao de dados, e
// nenhuma depende de alguem lembrar.
//
// AS ETAPAS, e o que coloca o card em cada uma:
//   Lead Novo               linha existe
//   Dados completos         CNPJ (14) e e-mail na mao — e o que a API de pedidos exige
//   Pedido aberto no Forca  `forca_pedido` preenchido
//   Representante ou Clube  `forca_erro` com CLIENTE_COM_REPRESENTANTE ou CLIENTE_CLUBE
//
// As etapas seguintes (Link entregue, Montando o pedido, Pedido enviado, Ganho) dependem de
// sinais que ainda nao estao ligados: o envio do link, e o AD_STATUFORCA do Sankhya. Elas NAO
// sao escritas aqui ate o sinal existir — card que anda sozinho sem motivo e pior que card parado.
//
// POR QUE "Representante ou Clube" NAO E PERDA: quando a API recusa, o sistema FUNCIONOU — ele
// protegeu quem ja atende o cliente. Nos quatro testes com cliente antigo, 4 de 4 cairam ai.
// Jogar isso em perdido esconderia que a trava existe, e esconderia o volume de leads de campanha
// que, na verdade, sao clientes de representante.
//
// MOVER, NAO DUPLICAR. O `/opportunities/upsert` casa por (pipeline, contato): chamar com o
// pipeline novo criaria um card novo e deixaria o antigo em "Novos Clientes". Por isso quando ja
// existe oportunidade para o contato, ela e ATUALIZADA (PUT) com o pipeline e a etapa novos.
//
// Uso (chave de servico no Authorization):
//   ?acao=previa      o que mudaria, sem mudar nada
//   ?limite=N         aplica em ate N leads
//   ?origens=...      sobrescreve `camp_origens` (padrao: as da landing)

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o, null, 2), { status: s, headers: { "Content-Type": "application/json" } });

const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const URL_ = () => Deno.env.get("SUPABASE_URL")!;
const API = "https://services.leadconnectorhq.com";
const LOC = "rZ8y7lzqV7fzxsartaX2";
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

async function rest(path: string, init?: RequestInit) {
  const k = srvKey();
  return await fetch(`${URL_()}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: k, Authorization: "Bearer " + k, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
}

function ghl(method: string, path: string, body?: unknown) {
  return fetch(API + path, {
    method,
    headers: { Authorization: "Bearer " + Deno.env.get("GHL_TOKEN"), Version: "2021-07-28",
               "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function cfg(chave: string, padrao = ""): Promise<string> {
  try {
    const q = await rest(`copiloto_config?select=valor&chave=eq.${chave}`);
    const v = q.ok ? String((await q.json())[0]?.valor ?? "").trim() : "";
    return v || padrao;
  } catch { return padrao; }
}

type Lead = {
  id: number; nome: string; empresa: string | null; razao_social: string | null;
  cnpj: string | null; email: string | null; contact_id: string | null;
  forca_pedido: number | null; forca_erro: string | null; forca_link_em: string | null;
};

// A etapa sai do ESTADO do lead, nao de quem o olhou por ultimo.
function etapaDe(L: Lead, E: Record<string, string>): { id: string; nome: string } {
  const err = (L.forca_erro || "").toUpperCase();
  if (err.includes("CLIENTE_COM_REPRESENTANTE") || err.includes("CLIENTE_CLUBE"))
    return { id: E.rep_clube, nome: "Representante ou Clube" };
  // "Link entregue" so existe porque passou a haver sinal: `forca_link_em` e escrito quando a
  // mensagem com o link sai. Etapa sem sinal proprio morre em duas semanas.
  if (L.forca_link_em) return { id: E.link, nome: "Link entregue" };
  if (L.forca_pedido) return { id: E.pedido_aberto, nome: "Pedido aberto no Forca" };
  if (digits(L.cnpj).length === 14 && (L.email || "").includes("@"))
    return { id: E.dados, nome: "Dados completos" };
  return { id: E.lead_novo, nome: "Lead Novo" };
}

Deno.serve(async (req) => {
  try {
    const auth = req.headers.get("Authorization") || "";
    const aceitas = [Deno.env.get("SRV_JWT"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")]
      .filter(Boolean).map((k) => "Bearer " + k);
    if (!aceitas.includes(auth)) return j({ ok: false, erro: "nao autorizado" }, 401);

    const u = new URL(req.url);
    const previa = u.searchParams.get("acao") === "previa" || u.searchParams.get("dry") === "1";
    const limite = Math.max(1, Math.min(Number(u.searchParams.get("limite") || 40) || 40, 100));

    const PIPE = await cfg("camp_pipeline_id");
    const E = {
      lead_novo:     await cfg("camp_etapa_lead_novo"),
      link:          await cfg("camp_etapa_link"),
      dados:         await cfg("camp_etapa_dados"),
      pedido_aberto: await cfg("camp_etapa_pedido_aberto"),
      rep_clube:     await cfg("camp_etapa_rep_clube"),
    };
    if (!PIPE || !E.lead_novo || !E.rep_clube) {
      return j({ ok: false, erro: "pipeline ou etapas nao configurados em copiloto_config (camp_*)" }, 500);
    }

    // Entram os leads da landing (por origem) E qualquer lead que a Nina tenha encaminhado ao
    // Forca de Vendas (`forca_pedir_em`, 17/11) — lead do META e do organico seguem o mesmo fluxo
    // desde entao, e sem esta segunda porta eles ficariam fora do funil.
    const origens = (u.searchParams.get("origens") || await cfg("camp_origens", "nitron-direto-lp%,lp-nitron%"))
      .split(",").map((s) => s.trim()).filter(Boolean);
    const filtro = "(" + [...origens.map((o) => `origem.ilike.${o}`), "forca_pedir_em.not.is.null"].join(",") + ")";
    const sel = "id,nome,empresa,razao_social,cnpj,email,contact_id,forca_pedido,forca_erro,forca_link_em";
    const q = await rest(`copiloto_lead?select=${sel}&or=${filtro}&contact_id=not.is.null&order=criado.desc&limit=${limite}`);
    const leads: Lead[] = q.ok ? await q.json() : [];

    const feito: Record<string, unknown>[] = [];
    for (const L of leads) {
      const alvo = etapaDe(L, E);
      const nomeCard = (L.razao_social || L.empresa || L.nome || "Lead").slice(0, 120);
      try {
        // Procura a oportunidade do contato EM QUALQUER pipeline: o lead pode ter nascido no
        // "Novos Clientes", que era para onde a landing apontava ate hoje.
        // O parametro e `locationId`, NAO `location_id`. Com o nome errado a busca devolve lista
        // vazia em vez de erro — e a funcao concluiria "nao tem card" e criaria um segundo,
        // deixando o original orfao no pipeline antigo. Pego na previa de 17/11, antes de aplicar.
        // OS DOIS PARAMETROS SAO SNAKE_CASE: `location_id` e `contact_id`. A propria API diz, em
        // 422: "property locationId should not exist / location_id must be a string". Nao se
        // guie pelo `meta.nextPageUrl` que ela devolve — ele vem com `locationId=` e e pista
        // falsa; foi por ele que eu troquei o certo pelo errado em 17/11.
        const s = await ghl("GET", `/opportunities/search?location_id=${LOC}&contact_id=${L.contact_id}&status=all&limit=20`);
        const sd = await s.json().catch(() => ({} as any));
        // A BUSCA TEM DE FALAR QUANDO FALHA. `sd?.opportunities || []` transforma 401, 403 e
        // qualquer erro em "este contato nao tem card" — e a funcao entao CRIA um segundo, que e
        // exatamente o estrago que ela existe para evitar. Em 17/11 a busca voltou vazia duas
        // vezes seguidas e so a previa impediu 29 duplicatas. Sem conferir `ok`, nao se decide.
        if (!s.ok || !Array.isArray(sd?.opportunities)) {
          feito.push({ lead: L.id, nome: nomeCard, acao: "busca falhou",
                       http: s.status, detalhe: JSON.stringify(sd).slice(0, 220) });
          continue;
        }
        const ops: any[] = sd.opportunities;
        // Prefere a que ja esta no pipeline novo; senao, a mais recente de qualquer um.
        const op = ops.find((o) => o.pipelineId === PIPE) || ops[0] || null;

        if (previa) {
          feito.push({ lead: L.id, nome: nomeCard, etapa_alvo: alvo.nome,
                       oportunidade: op?.id || null,
                       pipeline_atual: op?.pipelineId || null,
                       acao: !op ? "criar" : (op.pipelineId === PIPE && op.pipelineStageId === alvo.id ? "ja esta certo" : "mover") });
          continue;
        }

        if (!op) {
          const r = await ghl("POST", "/opportunities/upsert", {
            pipelineId: PIPE, locationId: LOC, contactId: L.contact_id, status: "open",
            pipelineStageId: alvo.id, name: nomeCard,
          });
          feito.push({ lead: L.id, nome: nomeCard, acao: r.ok ? "criado" : "falhou ao criar",
                       etapa: alvo.nome, http: r.status });
        } else if (op.pipelineId === PIPE && op.pipelineStageId === alvo.id) {
          feito.push({ lead: L.id, nome: nomeCard, acao: "ja esta certo", etapa: alvo.nome });
        } else {
          const r = await ghl("PUT", `/opportunities/${op.id}`, {
            pipelineId: PIPE, pipelineStageId: alvo.id, status: "open", name: nomeCard,
          });
          const rd = r.ok ? null : await r.text().catch(() => "");
          feito.push({ lead: L.id, nome: nomeCard, acao: r.ok ? "movido" : "falhou ao mover",
                       de: op.pipelineId, etapa: alvo.nome, http: r.status,
                       ...(rd ? { detalhe: String(rd).slice(0, 200) } : {}) });
        }
      } catch (e) {
        feito.push({ lead: L.id, nome: nomeCard, acao: "erro", detalhe: String(e).slice(0, 200) });
      }
    }

    const conta = (a: string) => feito.filter((f) => f.acao === a).length;
    return j({ ok: true, previa, pipeline: PIPE, leads: leads.length,
               resumo: { criar_ou_criados: conta("criar") + conta("criado"),
                         mover_ou_movidos: conta("mover") + conta("movido"),
                         ja_certos: conta("ja esta certo"),
                         falhas: feito.filter((f) => String(f.acao).startsWith("falhou") || f.acao === "erro").length },
               feito });
  } catch (e) {
    return j({ ok: false, erro: String(e).slice(0, 400) }, 500);
  }
});
