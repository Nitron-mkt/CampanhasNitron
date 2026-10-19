// pedido-status — o retorno dos contatos que receberam a pagina de pedido.
//
// Por que existe: em 15 e 16/10 o link foi para 21 lojistas e a unica forma de saber o que
// aconteceu era abrir o CRM conversa a conversa. Esta funcao responde, numa mensagem so: quem
// respondeu, quem mandou pedido, e quem continua calado.
//
// Quem recebe: os telefones de copiloto_config.pedido_avisar_fones (hoje o gestor e o Ricardo).
// DE PROPOSITO nao usa copiloto_responsaveis.avisar — aquela flag assina TODO espelho de repasse e
// de transferencia (copiloto-repasse, copiloto-feedback, copiloto-entrega). Quem quer o status do
// pedido nao necessariamente quer os 84 avisos de lead. Sao duas listas porque sao duas coisas.
//
// Como acha os 21: nao por lista chumbada. Todo toque com o link grava
// repasse_historico[].acao='followup_link', entao o filtro e `cs` (contains) em jsonb — quem
// receber o link amanha entra no relatorio sozinho, sem deploy.
//
// O que esta funcao NAO sabe: se a pessoa ABRIU o link. O Worker da Cloudflare nao registra visita
// e nao ha pixel na pagina. Entre "mandei" e "mandou pedido" existe um vao cego, e dizer o
// contrario seria inventar. Para fechar esse vao seria preciso log no Worker.
//
// Deploy: supabase functions deploy pedido-status
// Uso:    ?dry=1 para ver o texto sem mandar  |  ?fone=55... para mandar so para um numero

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const URL_ = () => Deno.env.get("SUPABASE_URL")!;

const d10 = (s: unknown) => String(s ?? "").replace(/\D/g, "");
const fk8 = (s: unknown) => { const x = d10(s); return x.length >= 8 ? x.slice(-8) : ""; };
const brl = (v: number) => (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function rest(path: string) {
  const k = srvKey();
  const r = await fetch(`${URL_()}/rest/v1/${path}`, { headers: { apikey: k, Authorization: "Bearer " + k } });
  if (!r.ok) throw new Error(path.split("?")[0] + ": " + (await r.text()).slice(0, 160));
  return await r.json();
}

async function cfg(): Promise<Record<string, string>> {
  const rows = await rest("copiloto_config?select=chave,valor");
  const o: Record<string, string> = {};
  for (const x of rows || []) o[x.chave] = x.valor;
  return o;
}

// "ha 2 dias", "hoje" — numero na boca da Nina tem de sair de conta, nunca da mao (licao de 16/09)
function haDias(iso: string | null) {
  if (!iso) return "";
  const n = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return n <= 0 ? "hoje" : n === 1 ? "ontem" : "ha " + n + " dias";
}
const sp = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

async function montar() {
  // os leads que receberam o link, ache quando receberem — nada chumbado aqui
  // DOIS jeitos de ter recebido o link: o toque de follow-up e a tomada de conta. O `or` do
  // PostgREST com `cs` em jsonb precisa dos parenteses e das virgulas escapadas pelo encodeURI.
  const cs = (acao: string) => 'repasse_historico.cs.' + encodeURIComponent('[{"acao":"' + acao + '"}]');
  const leads: any[] = await rest(
    'copiloto_lead?select=id,nome,empresa,fone,cnpj,cidade,uf,status,ultima_resposta_em,repasse_historico' +
    '&or=(' + cs("followup_link") + ',' + cs("nina_assumiu") + ')&order=id');
  const pedidos: any[] = await rest("pedido_recebido?select=id,codigo,loja,cnpj,fone,total,qtd_itens,criado,origem&order=id");

  const resp: any[] = [], mudos: any[] = [], comPedido: any[] = [];
  for (const L of leads) {
    const hist = Array.isArray(L.repasse_historico) ? L.repasse_historico : [];
    const toques = hist.filter((h: any) => h?.acao === "followup_link" || h?.acao === "nina_assumiu");
    const assumido = hist.some((h: any) => h?.acao === "nina_assumiu");
    const ultimo = toques[toques.length - 1];
    const quando = ultimo?.em || null;
    const linha = {
      id: L.id, nome: L.empresa || L.nome || L.fone, cnpj: d10(L.cnpj), fone: L.fone,
      praca: [L.cidade, L.uf].filter(Boolean).join("/"), toques: toques.length,
      toque_em: quando, segmento: ultimo?.segmento || "",
      assumido,
      respondeu: !!(quando && L.ultima_resposta_em && new Date(L.ultima_resposta_em) > new Date(quando)),
      resp_em: L.ultima_resposta_em,
    };
    // o pedido casa por CNPJ; sem CNPJ no pedido, pelos ultimos 8 digitos do telefone
    const ped = pedidos.find((p: any) =>
      (linha.cnpj && d10(p.cnpj) === linha.cnpj) || (fk8(p.fone) && fk8(p.fone) === fk8(linha.fone)));
    if (ped) comPedido.push({ ...linha, pedido: ped });
    else if (linha.respondeu) resp.push(linha);
    else mudos.push(linha);
  }
  // pedidos que chegaram de gente que NAO esta na lista: campanha de outro canal, ou alguem
  // repassando o link. Nao pode sumir do relatorio so porque nao casou com um lead.
  const idsCasados = new Set(comPedido.map((x: any) => x.pedido.id));
  const soltos = pedidos.filter((p: any) => !idsCasados.has(p.id) && String(p.origem || "").indexOf("teste") < 0);

  const L: string[] = [];
  L.push("PEDIDO NITRON — como estao os " + leads.length + " contatos que receberam o link");
  L.push(new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }));
  L.push("");
  L.push("Pediram: " + comPedido.length + "   |   Responderam sem pedir: " + resp.length + "   |   Calados: " + mudos.length);
  L.push("");

  if (comPedido.length) {
    L.push("--- MANDARAM PEDIDO ---");
    for (const x of comPedido) {
      L.push(`${x.pedido.codigo} — ${x.nome} (${x.praca || "praca nao apurada"})`);
      L.push(`   R$ ${brl(x.pedido.total)} em ${x.pedido.qtd_itens} produtos, ${haDias(x.pedido.criado)}`);
    }
    L.push("");
  }
  if (resp.length) {
    L.push("--- RESPONDERAM, AINDA SEM PEDIDO ---");
    for (const x of resp) L.push(`${x.nome} (${x.praca || "-"}) — respondeu ${haDias(x.resp_em)}${x.assumido ? " [a Nina assumiu]" : ""}`);
    L.push("");
  }
  if (mudos.length) {
    L.push("--- SEM RESPOSTA ATE AGORA ---");
    for (const x of mudos) L.push(`${x.nome} (${x.praca || "-"}) — link ${haDias(x.toque_em)}, ${x.toques} toque(s)${x.assumido ? " [a Nina assumiu]" : ""}`);
    L.push("");
  }
  if (soltos.length) {
    L.push("--- PEDIDOS DE FORA DA LISTA ---");
    for (const p of soltos) L.push(`${p.codigo} — ${p.loja || "(sem loja)"} — R$ ${brl(p.total)}, ${sp(p.criado)}`);
    L.push("");
  }
  L.push("Quem abriu o link e quem nao abriu, isto NAO sabe: o Worker nao registra visita.");
  return { texto: L.join("\n"), total: leads.length, pediram: comPedido.length, responderam: resp.length, mudos: mudos.length, soltos: soltos.length };
}

async function mandar(fone: string, texto: string, inst: string) {
  const r = await fetch(`${URL_()}/functions/v1/campanhas-enviar`, {
    method: "POST",
    headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" },
    // usar_dono: o contato interno pode estar em nome de outra pessoa no CRM; em vez de recusar,
    // sai pela instancia de quem e dono. Recado nao pode morrer por cadastro.
    body: JSON.stringify({ canal: "whatsapp", fone, texto, instancia: inst, usar_dono: true }),
  });
  const d = await r.json().catch(() => ({}));
  return { fone, ok: !!d?.ok, motivo: d?.ok ? undefined : String(d?.motivo || "recusado").slice(0, 180) };
}

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const dry = u.searchParams.get("dry") === "1";
    const so = (u.searchParams.get("fone") || "").replace(/\D/g, "");
    const c = await cfg();
    if (String(c.pedido_status_ativo || "sim").toLowerCase() !== "sim" && !dry && !so)
      return j({ ok: true, skip: "pedido_status_ativo != sim" });

    const r = await montar();
    const fones = (so ? [so] : (c.pedido_avisar_fones || "").split(/[,;]/).map((x) => x.replace(/\D/g, "")))
      .filter((x) => x.length >= 10);
    if (dry) return j({ ok: true, previa: true, destinos: fones, ...r });
    if (!fones.length) return j({ ok: false, erro: "sem destino em copiloto_config.pedido_avisar_fones", ...r });

    const inst = c.pedido_status_inst || "Camyla";
    const envios = [];
    for (const f of fones) envios.push(await mandar(f, r.texto, inst));
    return j({ ok: envios.every((x) => x.ok), instancia: inst, envios, total: r.total, pediram: r.pediram, responderam: r.responderam, mudos: r.mudos });
  } catch (e) {
    return j({ ok: false, erro: String(e).slice(0, 300) }, 500);
  }
});
