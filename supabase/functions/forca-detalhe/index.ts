// forca-detalhe — GUARDA O MOTIVO DA RECUSA, E REABRE O PEDIDO QUANDO O LOJISTA CORRIGE O DADO.
//
// Ordem do gestor em 23/11, em duas partes: *"guarde o detalhe sim"* e *"tem como passar essa
// resposta novamente pro forca de vendas de novo?"*.
//
// O PROBLEMA: a `forca-cadastro` grava so `erro` + `mensagem` em `copiloto_lead.forca_erro` e
// DESCARTA o campo `detalhe` — que e o unico que diz O QUE travou. Resultado: toda recusa virava
// "A Nitron recusou o cadastro ou o pedido por uma regra interna", e descobrir o motivo exigia
// reconsultar o protocolo a mao.
//
// POR QUE ESTA FUNCAO E SEPARADA, e o detalhe nao e gravado la na hora:
//   1. A `forca-cadastro` roda de 5 em 5 min ABRINDO PEDIDO DE VERDADE no ERP, e tem 32 KB. Sem
//      CLI nesta sessao, publicar exige transcrever o arquivo inteiro numa chamada — e em 18/11
//      isso ja produziu duas armadilhas de transcricao. Trocar risco alto por atraso de minutos
//      num campo de diagnostico e barganha boa.
//   2. **O GET do protocolo devolve o `detalhe` de novo, dias depois** (medido em 23/11 nos leads
//      735 e 751). Entao o dado nao se perde: ele pode ser buscado depois.
//   3. De quebra, esta funcao preenche o PASSADO — os leads que ja travaram antes de 23/11.
//
// O QUE ELA FAZ, nas duas passadas:
//   A) DETALHE — lead com `forca_erro` e sem `forca_erro_detalhe`: consulta o protocolo, grava
//      `forca_erro_cod`, `_detalhe`, `_etapa`, `_resolve`. E grava o RETRATO (`forca_enviado`) dos
//      dados de hoje, que e o que torna a retomada possivel.
//   B) RETOMADA — lead com `forca_erro` cujo retrato NAO bate com os dados de hoje: limpa o erro e
//      o protocolo, e o cron da `forca-cadastro` abre pedido novo na rodada seguinte.
//
// A CONDICAO DA RETOMADA E O QUE SEPARA CONSERTO DE LACO. So reabre quando mudou um dos dados que
// a API ACEITA (`cnpj`, `email`, `whatsapp`, `cep`, `numero`). Se nada mudou, reenviar devolve a
// mesma recusa a cada 5 minutos — e e exatamente o caso do lead 751, onde o que falta e a RUA e a
// API nao tem campo para ela. Reabrir ali seria barulho sem conserto.
//
// Uso (chave de servico no Authorization):
//   ?dry=1             previa das duas passadas, sem escrever nada
//   ?acao=detalhe      so busca e grava o motivo
//   ?acao=retomar      so a retomada
//   ?lead=N            um lead so (na retomada, DISPENSA a comparacao de dados — e o destravar a mao)
//   ?limite=N          teto da rodada (padrao `forca_detalhe_lote`)

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o, null, 2), { status: s, headers: { "Content-Type": "application/json" } });

const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const URL_ = () => Deno.env.get("SUPABASE_URL")!;
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

async function patch(id: number, campos: Record<string, unknown>) {
  await rest(`copiloto_lead?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(campos) });
}

// A mesma porta da `forca-cadastro`: lead da landing OU lead que a Nina encaminhou.
async function filtro(): Promise<string> {
  const origens = (await cfg("forca_origens", "nitron-direto-lp%,lp-nitron%"))
    .split(",").map((s) => s.trim()).filter(Boolean);
  return "(" + [...origens.map((o) => `origem.ilike.${o}`), "forca_pedir_em.not.is.null"].join(",") + ")";
}

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
  const d = await r.json().catch(() => ({} as any));
  if (!r.ok || !d?.access_token) throw new Error(`auth ${r.status}: ${JSON.stringify(d).slice(0, 160)}`);
  tok = { t: d.access_token, exp: Date.now() + (Number(d.expires_in) || 3600) * 1000 };
  return tok.t;
}

// O RETRATO dos dados de hoje — as cinco coisas que a API aceita no corpo. Guardado em
// `forca_enviado` quando o motivo e registrado, e comparado depois para decidir a retomada.
const retrato = (L: any) => ({
  cnpj: digits(L.cnpj),
  email: String(L.email || "").trim().toLowerCase(),
  whatsapp: digits(L.fone),
  cep: digits(L.cep),
  numero: String(L.numero || "").trim().slice(0, 10),
});

function mudou(L: any): string[] {
  const env = L.forca_enviado;
  if (!env || typeof env !== "object") return [];
  const hoje: Record<string, string> = retrato(L) as any;
  return Object.keys(hoje).filter((k) => String((env as any)[k] ?? "") !== hoje[k]);
}

const SEL = "id,nome,empresa,cnpj,cep,fone,email,numero,forca_protocolo,forca_pedido,forca_erro," +
            "forca_erro_cod,forca_erro_detalhe,forca_erro_resolve,forca_enviado,forca_retomadas,forca_em";

Deno.serve(async (req) => {
  try {
    const auth = req.headers.get("Authorization") || "";
    const aceitas = [Deno.env.get("SRV_JWT"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")]
      .filter(Boolean).map((k) => "Bearer " + k);
    if (!aceitas.includes(auth)) return j({ ok: false, erro: "nao autorizado" }, 401);

    const u = new URL(req.url);
    const dry = u.searchParams.get("dry") === "1";
    const acao = u.searchParams.get("acao") || "";
    const soLead = Number(u.searchParams.get("lead") || 0) || 0;
    const lote = Math.max(1, Math.min(
      Number(u.searchParams.get("limite") || await cfg("forca_detalhe_lote", "10")) || 10, 40));
    const f = await filtro();

    // ---------- A) O MOTIVO ---------------------------------------------------------------
    // So quem tem protocolo: sem ele nao ha o que consultar. Recusa nossa (o "sem e-mail", que a
    // `forca-cadastro` grava antes de chamar a API) nunca teve protocolo e fica de fora — e o
    // motivo dela ja esta escrito por extenso em `forca_erro`.
    const detalhes: Record<string, unknown>[] = [];
    if (!acao || acao === "detalhe") {
      const url = soLead
        ? `copiloto_lead?select=${SEL}&id=eq.${soLead}`
        : `copiloto_lead?select=${SEL}&or=${f}&forca_erro=not.is.null&forca_protocolo=not.is.null` +
          `&forca_erro_detalhe=is.null&descartado_em=is.null&order=forca_em.desc&limit=${lote}`;
      const q = await rest(url);
      const rows: any[] = q.ok ? await q.json() : [];
      const alvo = rows.filter((L) => L.forca_erro && L.forca_protocolo && !L.forca_erro_detalhe);

      if (alvo.length) {
        const H = { Authorization: "Bearer " + (await forcaToken()), "Content-Type": "application/json" };
        for (const L of alvo) {
          try {
            const r = await fetch(`${FORCA_BASE}/api/crm/orcamento/${L.forca_protocolo}`,
              { headers: H, signal: AbortSignal.timeout(120_000) });
            const d = await r.json().catch(() => ({} as any));
            const campos = {
              forca_erro_cod: String(d?.erro || "").slice(0, 60) || null,
              forca_erro_detalhe: String(d?.detalhe || "").slice(0, 2000) || null,
              forca_erro_etapa: String(d?.etapa || "").slice(0, 40) || null,
              forca_erro_resolve: String(d?.resolve || "").slice(0, 20) || null,
              forca_enviado: retrato(L),
            };
            // Se o protocolo ja NAO esta em erro (alguem resolveu do lado deles), nao inventamos
            // detalhe: so registramos o retrato, e a passada B decide o resto.
            if (!campos.forca_erro_detalhe && d?.status !== "erro") campos.forca_erro_detalhe = null;
            if (!dry) await patch(L.id, campos);
            detalhes.push({ lead: L.id, empresa: L.empresa, protocolo: L.forca_protocolo,
                            status: d?.status ?? null, cod: campos.forca_erro_cod,
                            etapa: campos.forca_erro_etapa, resolve: campos.forca_erro_resolve,
                            detalhe: campos.forca_erro_detalhe });
          } catch (e) {
            detalhes.push({ lead: L.id, erro: String(e).slice(0, 160) });
          }
        }
      }
    }

    // ---------- B) A RETOMADA -------------------------------------------------------------
    // Reabrir e so LIMPAR: a `forca-cadastro` pula quem tem `forca_erro`, entao sem a coluna o lead
    // volta para a fila de "nunca enviados" e o cron de 5 em 5 min abre pedido novo.
    // O `forca_protocolo` e limpo junto — senao a varredura consultaria o protocolo recusado em vez
    // de abrir outro.
    const retomados: Record<string, unknown>[] = [];
    const ligado = (await cfg("forca_retomar_ativo", "nao")).toLowerCase() === "sim";
    const teto = Number(await cfg("forca_retomar_max", "2")) || 2;
    if (!acao || acao === "retomar") {
      const url = soLead
        ? `copiloto_lead?select=${SEL}&id=eq.${soLead}`
        : `copiloto_lead?select=${SEL}&or=${f}&forca_erro=not.is.null&forca_pedido=is.null` +
          `&forca_enviado=not.is.null&forca_retomadas=lt.${teto}&descartado_em=is.null` +
          `&order=forca_em.desc&limit=50`;
      const q = await rest(url);
      const rows: any[] = q.ok ? await q.json() : [];
      for (const L of rows) {
        if (!L.forca_erro || L.forca_pedido) continue;
        if (Number(L.forca_retomadas || 0) >= teto && !soLead) continue;
        // `?lead=N` dispensa a comparacao: e o destravar a mao, quando uma pessoa ja sabe que o
        // dado foi corrigido. A rodada automatica NUNCA dispensa.
        const campos = soLead ? ["(manual)"] : mudou(L);
        if (!campos.length) continue;
        retomados.push({ lead: L.id, empresa: L.empresa, mudou: campos,
                         erro_anterior: String(L.forca_erro).slice(0, 90),
                         tentativa: Number(L.forca_retomadas || 0) + 1 });
        if (!dry && (ligado || soLead)) {
          await patch(L.id, {
            forca_erro: null, forca_erro_cod: null, forca_erro_detalhe: null,
            forca_erro_etapa: null, forca_erro_resolve: null, forca_protocolo: null,
            forca_retomado_em: new Date().toISOString(),
            forca_retomadas: Number(L.forca_retomadas || 0) + 1,
          });
        }
        if (retomados.length >= lote) break;
      }
    }

    return j({
      ok: true, previa: dry,
      detalhe: { gravados: detalhes.length, itens: detalhes },
      retomada: {
        ligado, teto, reabertos: retomados.length, itens: retomados,
        nota: ligado ? undefined : "forca_retomar_ativo nao esta 'sim' — a previa mostra, mas nada e reaberto",
      },
    });
  } catch (e) {
    return j({ ok: false, erro: String(e).slice(0, 400) }, 500);
  }
});
