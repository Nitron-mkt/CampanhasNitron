// forca-teste — TEMPORARIA, v6: LEITOR DE PROTOCOLO, somente leitura.
//
// Em 19/11 esta funcao foi desarmada porque tinha `?teste=0`, que e POST e abre pedido de verdade
// no ERP. Esta versao **nao tem POST nenhum**: ela so faz `GET /api/crm/orcamento/{protocolo}`.
// Pelo contrato, o GET nao cria nada — ele apenas le e empurra o processamento de um protocolo que
// ja existe. Nao ha como abrir cadastro ou pedido por aqui.
//
// POR QUE ELA EXISTE: o gestor perguntou em 23/11 qual e a "regra interna" que recusou os leads
// 735 e 751. A resposta mora no campo `detalhe` da resposta de erro — e a `forca-cadastro` grava
// so `erro` + `mensagem` e **descarta o `detalhe`**. Como o protocolo ficou gravado
// (`copiloto_lead.forca_protocolo`), da para reconsultar e ler o texto cru do ERP.
//
// Uso: GET /forca-teste?protocolo=ORC-XXXXXXXX  (varios: ?protocolo=A,B)

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o, null, 2), { status: s, headers: { "Content-Type": "application/json" } });

const FORCA_BASE = "https://vendas.nitron.com.br";
const FORCA_ID = "crm-nitron";

async function token(): Promise<string> {
  const seg = Deno.env.get("CRM_PEDIDO_SECRET") || "";
  if (!seg) throw new Error("CRM_PEDIDO_SECRET nao configurado");
  const r = await fetch(`${FORCA_BASE}/api/crm/auth`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: FORCA_ID, client_secret: seg }),
    signal: AbortSignal.timeout(20_000),
  });
  const d = await r.json().catch(() => ({} as any));
  if (!r.ok || !d?.access_token) throw new Error(`auth ${r.status}: ${JSON.stringify(d).slice(0, 200)}`);
  return d.access_token;
}

Deno.serve(async (req) => {
  try {
    const auth = req.headers.get("Authorization") || "";
    const aceitas = [Deno.env.get("SRV_JWT"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")]
      .filter(Boolean).map((k) => "Bearer " + k);
    if (!aceitas.includes(auth)) return j({ ok: false, erro: "nao autorizado" }, 401);

    const u = new URL(req.url);
    const protos = (u.searchParams.get("protocolo") || "").split(",")
      .map((s) => s.trim()).filter((s) => /^ORC-[A-Z0-9]+$/i.test(s)).slice(0, 10);
    if (!protos.length) return j({ ok: false, erro: "passe ?protocolo=ORC-XXXXXXXX" }, 400);

    const H = { Authorization: "Bearer " + (await token()), "Content-Type": "application/json" };
    const out: Record<string, unknown>[] = [];
    for (const p of protos) {
      const t = Date.now();
      const r = await fetch(`${FORCA_BASE}/api/crm/orcamento/${p}`, { headers: H, signal: AbortSignal.timeout(120_000) });
      const d = await r.json().catch(() => ({} as any));
      out.push({ protocolo: p, http: r.status, segundos: Math.round((Date.now() - t) / 100) / 10, resposta: d });
    }
    return j({ ok: true, somente_leitura: true, resultados: out });
  } catch (e) {
    return j({ ok: false, erro: String(e).slice(0, 400) }, 500);
  }
});
