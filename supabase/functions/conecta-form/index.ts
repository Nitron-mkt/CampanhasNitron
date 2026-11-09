/* conecta-form (v2) — endpoint unico do formulario do NITRON CONECTA (09/11/2026).
 *
 * Por que uma funcao e nao PostgREST direto:
 *   1) a pendencia 2 quer TIRAR a escrita da anon key. Formulario que escrevesse na tabela pela anon
 *      quebraria no dia em que isso acontecer. Aqui a escrita e toda pela service role, do lado de ca.
 *   2) "15 empresas por dia" tem de ser contado e gravado na MESMA transacao (public.conecta_inscrever
 *      trava por dia com pg_advisory_xact_lock). Dois cliques simultaneos na ultima vaga nao podem
 *      fechar o dia com 16.
 *
 * GET  /conecta-form              -> config da pagina + vagas por dia
 * GET  /conecta-form?token=abc    -> idem + pre-preenchimento do convidado
 * POST /conecta-form              -> grava a inscricao
 *
 * Erro volta como HTTP 200 com ok:false (mesma convencao do campanhas-comunicado-cliente e dos
 * refresh de cobranca): cliente que descarta o corpo em status != 2xx mostraria "status 409" no
 * lugar do motivo, justo num formulario em que o motivo E a resposta ("dia lotado").
 */
const SUPA = Deno.env.get("SUPABASE_URL") || "";
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "content-type": "application/json" } });

async function rest(path: string, init: RequestInit = {}) {
  const r = await fetch(`${SUPA}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: srvKey(),
      authorization: `Bearer ${srvKey()}`,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
  const t = await r.text();
  let b: any = null;
  try { b = t ? JSON.parse(t) : null; } catch { b = t; }
  if (!r.ok) throw new Error(typeof b === "string" ? b : (b?.message || b?.hint || `rest ${r.status}`));
  return b;
}

const DIA_SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
const MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function rotuloDia(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return { curto: `${d}/${String(m).padStart(2, "0")}`, longo: `${d} de ${MES[m - 1]}`, semana: DIA_SEMANA[dt.getUTCDay()] };
}

async function config() {
  const c = await rest(`campanhas?select=filtros_padrao,cadencia&codigo=eq.nitronconecta`);
  const f = (c?.[0]?.filtros_padrao) || {};
  const vagas = await rest(`conecta_vagas?select=*`);
  return {
    titulo: f.conecta_titulo || "NITRON CONECTA",
    texto: f.conecta_texto || "",
    horario: f.conecta_horario || "",
    local: f.conecta_local || "",
    vagas_dia: Number(f.conecta_vagas_dia ?? 15),
    dias: (vagas || []).map((v: any) => ({
      data: v.dia,
      ...rotuloDia(String(v.dia)),
      vagas_total: v.vagas_total,
      ocupadas: v.ocupadas,
      restantes: v.restantes,
      aberta: v.aberta,
    })),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (!srvKey()) return json({ ok: false, erro: "sem SRV_JWT" });

    if (req.method === "GET") {
      const url = new URL(req.url);
      const token = (url.searchParams.get("token") || "").trim();
      const out: any = { ok: true, ...(await config()) };
      if (token) {
        const c = await rest(`conecta_convite?select=*&token=eq.${encodeURIComponent(token)}`);
        out.convite = c?.[0]
          ? {
              token: c[0].token, publico: c[0].publico, codparc: c[0].codparc, codvend: c[0].codvend,
              nome: c[0].nome, razao_social: c[0].empresa, documento: c[0].documento,
              representante: c[0].rep, cidade: c[0].cidade, uf: c[0].uf,
              ja_respondeu: !!c[0].respondido_em,
            }
          : null;
        if (!out.convite) out.aviso = "convite não encontrado — o formulário segue aberto para preenchimento manual";
      }
      return json(out);
    }

    if (req.method !== "POST") return json({ ok: false, erro: "método não suportado" });

    const b = await req.json().catch(() => ({}));
    /* Acompanhantes: o gestor quer a contagem certa para comida e bebida, entao guardamos o primeiro
       nome de cada um. `pessoas` e o TOTAL, incluindo o contato principal. */
    const acomp = Array.isArray(b.acompanhantes)
      ? b.acompanhantes.map((x: any) => String(x ?? "").trim()).filter((x: string) => x).slice(0, 19)
      : [];
    const pessoas = Math.max(1, Number(b.pessoas ?? (acomp.length + 1)) || 1);

    const p = {
      token: b.token ?? null,
      publico: b.publico ?? "cliente",
      codparc: b.codparc ?? null,
      codvend: b.codvend ?? null,
      nome: String(b.nome ?? "").trim(),
      razao_social: String(b.razao_social ?? "").trim(),
      documento: String(b.documento ?? "").trim(),
      representante: String(b.representante ?? "").trim(),
      fone: String(b.fone ?? b.whatsapp ?? "").trim(),
      email: String(b.email ?? "").trim(),
      cargo: String(b.cargo ?? "").trim(),
      pessoas,
      acompanhantes: acomp,
      data_escolhida: String(b.data_escolhida ?? b.dia ?? "").trim(),
      observacao: String(b.observacao ?? "").trim(),
      origem: String(b.origem ?? "form").trim(),
    };

    const r = await rest(`rpc/conecta_inscrever`, { method: "POST", body: JSON.stringify({ p }) });
    const res: any = (Array.isArray(r) ? r[0] : r) || {};

    /* v2 — PIPELINE DO CRM. Respondeu o formulario => o lead anda para "Formulario preenchido".
       Nao e uma linha nova no pipeline: o conecta-pipeline procura a oportunidade que o convite ja
       criou e AVANCA aquela mesma, e nunca anda para tras (quem ja estava adiante fica onde esta).
       Quem preencheu sem token (abriu o link direto) e achado pelo CNPJ em contato_enriquecido.
       Se isso falhar, a inscricao NAO e desfeita: o registro no banco vale mais que a coluna do CRM,
       e `crm` na resposta diz o que aconteceu. */
    if (res.ok === true) {
      try {
        let codparc: any = p.codparc ?? null;
        if (!codparc && b.token) {
          const c = await rest(`conecta_convite?select=codparc&token=eq.${encodeURIComponent(String(b.token))}`);
          codparc = c?.[0]?.codparc ?? null;
        }
        if (!codparc) {
          const doc = p.documento.replace(/\D/g, "");
          if (doc) {
            const ce = await rest(`contato_enriquecido?select=codparc&cnpj=eq.${doc}&limit=1`);
            codparc = ce?.[0]?.codparc ?? null;
          }
        }
        const alvo: any = { nome: p.razao_social || p.nome, fone: p.fone };
        if (codparc) alvo.codparc = codparc;
        const mv = await fetch(`${SUPA}/functions/v1/conecta-pipeline`, {
          method: "POST",
          headers: { apikey: srvKey(), authorization: `Bearer ${srvKey()}`, "content-type": "application/json" },
          body: JSON.stringify({ acao: "formulario", alvos: [alvo] }),
        });
        const mb = await mv.json().catch(() => null);
        res.crm = mb?.itens?.[0]?.resultado || (mb?.erro ? `erro: ${mb.erro}` : "sem resposta");
      } catch (e) {
        res.crm = `falhou: ${String((e as Error).message || e)}`;
      }
    }
    /* Mesmo quando recusa, devolve as vagas atualizadas: se o dia lotou enquanto a pessoa preenchia,
       a pagina precisa poder redesenhar os botoes sem um segundo pedido. */
    const cfg = await config();
    return json({ ...res, ok: res.ok === true, dias: cfg.dias });
  } catch (e) {
    return json({ ok: false, erro: String((e as Error).message || e) });
  }
});
