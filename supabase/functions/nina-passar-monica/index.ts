// nina-passar-monica — a UNICA porta que leva um lead da Nina para a venda interna.
//
// Ordem do gestor, 20/10: a Nina atende do inicio ao fim; so passa para a Monica "quando a nina
// perguntar se pode seguir com o atendimento ou quer um atendimento humano, porem so depois que
// qualificar o lead, isso e, quando o lead falar o CNPJ, saber do pedido minimo e disser que
// realmente quer comprar com a Nitron".
//
// Por isso o repasse automatico foi DESLIGADO (copiloto_config.repasse_ativa=nao). Nada mais cai
// na Monica por decisao de maquina. O que abre a porta e o CLIENTE pedir atendente humano — e a
// Nina registra isso abrindo tarefa com a acao "PASSAR PARA VENDA INTERNA" (licao 324).
//
// Esta funcao faz tres perguntas antes de passar, e as tres tem de dar sim:
//   1. existe tarefa da Nina pedindo a passagem?
//   2. o lead tem CNPJ?
//   3. o lead sabe do pedido minimo?
// Faltando uma, nao passa e diz qual faltou. O gestor pediu "so depois que qualificar", e
// qualificar aqui tem definicao, nao opiniao.
//
// Uso:  ?dry=1  mostra quem passaria e por que   |   (sem nada) passa
// Deploy: supabase functions deploy nina-passar-monica

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const URL_ = () => Deno.env.get("SUPABASE_URL")!;

async function rest(path: string, init?: RequestInit) {
  const k = srvKey();
  return await fetch(`${URL_()}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: k, Authorization: "Bearer " + k, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
}
const pad = (s: unknown) =>
  String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

Deno.serve(async (req) => {
  try {
    const dry = new URL(req.url).searchParams.get("dry") === "1";

    // a Nina pode escrever a acao de varios jeitos; o que nao pode e a porta depender de uma
    // frase exata. Qualquer tarefa aberta nas ultimas 72h que fale em venda interna ou atendente
    // humano e lida como o pedido do cliente.
    const tr = await rest("copiloto_tarefas?select=id,contact_id,acao,tipo,detalhe,criado,status" +
                          "&criado=gte." + new Date(Date.now() - 72 * 3600_000).toISOString() +
                          "&order=id.desc&limit=200");
    const tarefas: any[] = tr.ok ? await tr.json() : [];
    const pedem = tarefas.filter((t) => {
      const s = pad([t.acao, t.tipo, t.detalhe].filter(Boolean).join(" "));
      return /venda interna/.test(s) || /atendente humano/.test(s) || /falar com (uma |um )?atendente/.test(s);
    });
    if (!pedem.length) return j({ ok: true, nada: "nenhuma tarefa pedindo passagem nas ultimas 72h" });

    const saida: any[] = [];
    for (const t of pedem) {
      if (!t.contact_id) { saida.push({ tarefa: t.id, passou: false, falta: "tarefa sem contact_id" }); continue; }
      const lr = await rest("copiloto_lead?select=id,nome,empresa,cnpj,sabe_minimo,repasse_em,repasse_tipo" +
                            "&contact_id=eq." + encodeURIComponent(t.contact_id) + "&limit=1");
      const L = ((await lr.json()) || [])[0];
      if (!L) { saida.push({ tarefa: t.id, passou: false, falta: "nao achei o lead desse contato" }); continue; }
      if (L.repasse_em) { saida.push({ lead: L.id, passou: false, falta: "ja repassado em " + L.repasse_em }); continue; }

      const temCnpj = !!L.cnpj && String(L.cnpj).replace(/\D/g, "").length === 14;
      const faltas: string[] = [];
      if (!temCnpj) faltas.push("sem CNPJ");
      if (L.sabe_minimo !== true) faltas.push("nao consta que sabe do pedido minimo");
      if (faltas.length) {
        saida.push({ lead: L.id, quem: L.empresa || L.nome, passou: false, falta: faltas.join(" e ") });
        continue;
      }
      if (dry) { saida.push({ lead: L.id, quem: L.empresa || L.nome, passaria: true }); continue; }

      // o modo manual do copiloto-repasse ignora repasse_ativa=nao, que e exatamente o que
      // queremos: a porta automatica esta fechada, esta aqui e a unica que abre
      const r = await fetch(`${URL_()}/functions/v1/copiloto-repasse?lead=${L.id}`, {
        headers: { Authorization: "Bearer " + srvKey() },
      });
      const d = await r.json().catch(() => ({}));
      const feito = (d?.resultado || [])[0] || {};
      saida.push({ lead: L.id, quem: L.empresa || L.nome, passou: !!feito.enviado,
                   destino: feito.destino || feito.escopo || null, erro: feito.erro || null });
    }
    return j({ ok: true, previa: dry, avaliados: saida.length, passaram: saida.filter((x) => x.passou).length, detalhe: saida });
  } catch (e) {
    return j({ ok: false, erro: String(e).slice(0, 300) }, 500);
  }
});
