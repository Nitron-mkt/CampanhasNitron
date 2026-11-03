// nina-reativa (v4) — reativa os leads em aberto: o desconto que ele JA tem, e o que falta para
// montar o mix dele.
//
// Ordem do gestor em 03/11: "Os leads que estao em aberto preciso que reativem os mesmos falando
// do desconto disponivel e falando para passarem o restante dos dados para definir o melhor mix
// pra eles."
//
// FUNCAO SEPARADA, de proposito, pelas mesmas duas razoes do `nina-poslink`:
//   1. o `copiloto-lead` ja esta no limite de tamanho que o deploy aceita;
//   2. regra nova que FALA SOZINHA tem de poder ser desligada sem publicar por cima da funcao que
//      esta atendendo. Aqui isso pesa mais que nunca: a audiencia sao ~590 leads, e a licao de
//      16/09 e literal — uma linha de configuracao nao pode ser a unica coisa entre o silencio e
//      centenas de mensagens. Por isso NASCE DESLIGADA (`reativa_ativo='nao'`) e SEM CRON: quem
//      dispara e uma pessoa, chamando a funcao, lote a lote.
//
// O MODELO RODA SEM FERRAMENTA. Ele escreve UMA frase de reabertura — nao faz uma rodada de
// qualificacao. Sem ferramenta ele nao tem como inventar preco, praca, prazo nem compromisso, que
// e a doenca de 16/09. Quem cuida da resposta do lead e o `copiloto-lead`, que ja sabe gravar
// CNPJ e CEP, resolver o CNAE e mandar o link com o frete certo.
//
// O QUE FALTA E CALCULADO AQUI, EM CODIGO, nao pelo modelo: CNPJ (14 digitos) e CEP. O modelo so
// recebe a lista do que pedir. Pedir de novo o que o lead ja deu foi o que fez o Cassio (lead 617)
// ir embora em 02/11 depois de entregar quatro dados.
//
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GHL = (Deno.env.get("GHL_TOKEN") || "").trim();
const LOC = "rZ8y7lzqV7fzxsartaX2";
const MODELO = "claude-sonnet-5";

const digits = (s: any) => String(s || "").replace(/\D/g, "");
const norm = (s: any) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const prim = (s: any) => (String(s || "").trim().split(/\s+/)[0] || String(s || ""));
const limpa = (t: any) => String(t || "").replace(/Instance Source:.*/is, "").replace(/#contact_instance:\S+/gi, "").replace(/\s+/g, " ").trim();

const ghl = (m: string, p: string, v = "2021-07-28", body?: any) => fetch("https://services.leadconnectorhq.com" + p, { method: m, headers: { Authorization: "Bearer " + GHL, Version: v, Accept: "application/json", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

async function anthropic(system: string, user: string): Promise<string> {
  const key = Deno.env.get("ANTHROPIC_API_KEY"); if (!key) throw new Error("sem ANTHROPIC_API_KEY");
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: MODELO, max_tokens: 600, system, messages: [{ role: "user", content: user }] }) });
  if (!r.ok) throw new Error("anthropic " + r.status + " " + (await r.text()).slice(0, 300));
  const d = await r.json();
  return (d?.content || []).filter((x: any) => x.type === "text").map((x: any) => x.text).join("\n").trim();
}

async function enviar(contact_id: string, texto: string, instancia: string) {
  const r = await fetch(SUPA_URL + "/functions/v1/campanhas-enviar", { method: "POST", headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" }, body: JSON.stringify({ canal: "whatsapp", texto, instancia, contact_id }) });
  return await r.json().catch(() => ({ ok: false, motivo: "resposta ilegivel do campanhas-enviar" }));
}

async function pausarInstancia(sb: any, instancia: string, motivo: string) {
  if (!instancia) return { ok: false };
  try {
    const { error } = await sb.from("instancia_ghl").update({ pausada_em: new Date().toISOString(), pausada_motivo: motivo.slice(0, 400) }).eq("instancia", instancia).is("pausada_em", null);
    return { ok: !error };
  } catch (_e) { return { ok: false }; }
}

// O DONO DO CONTATO E QUEM DECIDE SE A MENSAGEM SAI — o numero de saida e o `assignedTo`. Contato
// de lead que a Nina atende nasce SEM dono (quem cria e o inbound do ZaptosWPP) e o
// `#contact_instance` resolve a saida. Quando alguem do time ASSUME o contato, o campanhas-enviar
// recusa o envio da Nina, e isso e bom: significa que um humano esta na conversa.
// Aqui essa checagem vem ANTES da chamada ao modelo e ANTES de gravar `reativa_em`. Se viesse
// depois, o lead gastaria a unica tentativa dele numa recusa: dos 591 da fila, 7 estao assim e
// todos eles estavam na frente, porque sao os mais recentes.
// De quebra ela protege de um caso pior: o MIRAIYAA (lead 230) esta com a Monica E tem tag
// `sankhya-cliente` com codparc 171123 — e CLIENTE da casa, nao lead. Mandar roteiro de lead novo
// para cliente com consultor e o erro que a trava `buscar_cliente` ja evita na conversa.
async function donoDoContato(contact_id: string): Promise<{ ok: boolean; dono?: string; erro?: string }> {
  try {
    const r = await ghl("GET", `/contacts/${contact_id}`);
    if (!r.ok) return { ok: false, erro: "GHL " + r.status };
    const c = (await r.json().catch(() => ({})))?.contact || {};
    return { ok: true, dono: String(c.assignedTo || "").trim() };
  } catch (e) { return { ok: false, erro: String(e).slice(0, 120) }; }
}

const horaBRT = () => new Date(Date.now() - 3 * 3600 * 1000).getUTCHours();
const diaBRT = () => new Date(Date.now() - 3 * 3600 * 1000).getUTCDay();
function haDias(iso: any): number { const t = new Date(iso || 0).getTime(); return t ? Math.floor((Date.now() - t) / 86400000) : 0; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!GHL) return j({ ok: false, erro: "sem GHL_TOKEN" }, 500);
    const sb = createClient(SUPA_URL, srvKey());
    const sp = new URL(req.url).searchParams;
    const b = await req.json().catch(() => ({} as any));
    const dry = sp.get("dry") === "1" || b.dry === true;

    const { data: cfgRows } = await sb.from("copiloto_config").select("*");
    const cfg: Record<string, string> = {}; (cfgRows || []).forEach((r: any) => cfg[r.chave] = r.valor);
    if (String(cfg.copiloto_ativo || "sim").toLowerCase() === "nao") return j({ ok: true, desligado: "copiloto_ativo=nao" });

    const ativo = String(cfg.reativa_ativo || "nao").toLowerCase() === "sim";
    const inst = String(cfg.lead_inst || cfg.nome_assistente || "Nina").split(",")[0].trim();
    const lote = Math.max(1, Math.min(parseInt(sp.get("limite") || b.limite || cfg.reativa_lote || "3") || 3, 10));
    const hIni = parseInt(cfg.reativa_hora_ini || "9") || 9;
    const hFim = parseInt(cfg.reativa_hora_fim || "19") || 19;
    const silencioH = Math.max(1, parseInt(cfg.reativa_silencio_h || "48") || 48);
    // TETO DE IDADE — a onda sai POR FAIXA, e a faixa e ordem do gestor, nao preferencia minha.
    // Em 03/11 ele liberou "os 96 mais quentes" (ate 7 dias) e nada alem disso. Sem este corte a
    // fila escorregaria sozinha para os 444 leads mais velhos assim que os 100 da faixa acabassem
    // — a ordenacao e "mais recente primeiro", entao ela NAO para onde a autorizacao para.
    // Vazio = sem teto. Mudar e UPDATE em `reativa_max_dias`, ou `?max_dias=` na chamada.
    const maxDiasRaw = String(sp.get("max_dias") || b.max_dias || cfg.reativa_max_dias || "").trim();
    const maxDias = maxDiasRaw ? Math.max(1, parseInt(maxDiasRaw) || 0) : 0;
    const pedidoMin = parseInt(digits(cfg.pedido_minimo || "3500")) || 3500;
    // Lista de `assignedTo` que ainda assim podem receber (o proprio usuario da Nina, se um dia o
    // contato for atribuido a ela). Vazia por padrao: contato com dono nao recebe.
    const donosOk = new Set(String(cfg.reativa_dono_ok || "").split(",").map((x) => x.trim()).filter(Boolean));
    const nome = prim(cfg.nome_assistente || inst || "Nina");

    // ---- relatorio: quem esta na fila, sem mandar nada -----------------------------------------
    if (String(sp.get("acao") || b.acao || "").toLowerCase() === "fila") {
      const { data } = await sb.from("copiloto_lead")
        .select("status, cnpj, cep, link_seg, atualizado, ultima_resposta_em, reativa_pulado")
        .in("status", ["frio", "passado", "qualificando", "qualificado"])
        .eq("instancia", inst).not("contact_id", "is", null).is("reativa_em", null);
      const ls = data || [];
      const temCnpj = (x: any) => digits(x.cnpj).length === 14;
      const temCep = (x: any) => String(x.cep || "").trim() !== "";
      const faixa = (x: any) => { const d = haDias(x.ultima_resposta_em || x.atualizado); return d < 7 ? "a) ate 7 dias" : d < 21 ? "b) 7 a 21 dias" : d < 45 ? "c) 21 a 45 dias" : "d) mais de 45 dias"; };
      const agg: Record<string, any> = {};
      for (const x of ls) {
        const k = faixa(x) + " | " + x.status;
        agg[k] = agg[k] || { leads: 0, ja_viu_link: 0, falta_so_cep: 0, falta_so_cnpj: 0, falta_os_dois: 0, nao_falta_nada: 0 };
        agg[k].leads++;
        if (x.link_seg) agg[k].ja_viu_link++;
        if (temCnpj(x) && temCep(x)) agg[k].nao_falta_nada++;
        else if (temCnpj(x)) agg[k].falta_so_cep++;
        else if (temCep(x)) agg[k].falta_so_cnpj++;
        else agg[k].falta_os_dois++;
      }
      const fora = ls.filter((x: any) => x.reativa_pulado).length;
      return j({ ok: true, acao: "fila", instancia: inst, na_fila: ls.length, ja_pulados_por_motivo_estrutural: fora, teto_de_idade: maxDias ? (maxDias + " dias") : "sem teto", por_faixa: agg });
    }

    // Instancia pausada nao tenta NADA. A pausa e trava manual: a coluna nao se solta sozinha, e
    // bater numa sessao morta foi o que gerou 200 envios recusados em 8 conversas em 02/10.
    const { data: pz } = await sb.from("instancia_ghl").select("instancia").not("pausada_em", "is", null);
    if ((pz || []).some((x: any) => norm(x.instancia) === norm(inst))) {
      return j({ ok: true, pausado: true, instancia: inst, motivo: "instancia '" + inst + "' esta pausada em instancia_ghl — nada foi enviado." });
    }

    const h = horaBRT(); const dow = diaBRT();
    const foraDeHora = h < hIni || h >= hFim || dow === 0;
    if (foraDeHora && !dry) return j({ ok: true, parado: "fora da janela", hora_sp: h, dia_semana: dow, janela: hIni + "h-" + hFim + "h, sem domingo" });

    // ---- a fila -------------------------------------------------------------------------------
    // Mais recente primeiro ENTRE OS ELEGIVEIS: quem parou ha uma semana responde melhor do que
    // quem parou ha dois meses, e se a onda for interrompida o que sobra e o mais frio.
    //
    // O CORTE DE SILENCIO E FILTRO DE SQL, nao de codigo. Na primeira previa real (03/11) ele so
    // existia depois da leitura: a funcao trouxe os 24 mais recentes, TODOS em conversa viva, e
    // pulou os 24. Cada lote relia os mesmos 24 e nenhum lead antigo era alcancado — a fila
    // simplesmente nao andava. Com o corte aqui, quem ainda esta conversando nem entra na lista.
    const limiteSilencio = new Date(Date.now() - silencioH * 3600000).toISOString();
    const reavaliarApos = new Date(Date.now() - 24 * 3600000).toISOString();
    const { data: cands } = await sb.from("copiloto_lead").select("*")
      .in("status", ["frio", "passado", "qualificando", "qualificado"])
      .eq("instancia", inst).not("contact_id", "is", null).is("reativa_em", null)
      .lt("atualizado", limiteSilencio)
      .or(`reativa_pulado_em.is.null,reativa_pulado_em.lt.${reavaliarApos}`)
      .order("atualizado", { ascending: false }).limit(lote * 8);
    const fila = maxDias
      ? (cands || []).filter((x: any) => (Date.now() - new Date(x.atualizado || 0).getTime()) <= maxDias * 86400000)
      : (cands || []);

    const feitos: any[] = []; let mandados = 0;
    for (const L of fila) {
      if (mandados >= lote) break;
      const base = { lead_id: L.id, contato: L.empresa || L.nome || L.fone, status: L.status, parado_ha_dias: haDias(L.ultima_resposta_em || L.atualizado) };

      // ---- quem ja e CLIENTE nao e lead -------------------------------------------------------
      // `codparc` preenchido, ou o CNPJ dele achado em ghl_cliente, quer dizer que a loja tem
      // cadastro e consultor. Reabrir com roteiro de lead novo seria atropelar quem a atende.
      // Motivo ESTRUTURAL fica marcado por 24h (reativa_pulado_em): nao muda de uma rodada para a
      // outra, e sem a marca cada lote gastaria as mesmas chamadas de GHL com os mesmos leads.
      // Nao e `reativa_em` de proposito — o dono pode sair do contato, e ai o lead volta a ser
      // avaliado amanha em vez de ter queimado a unica tentativa dele.
      const pular = async (motivo: string) => {
        if (!dry) await sb.from("copiloto_lead").update({ reativa_pulado_em: new Date().toISOString(), reativa_pulado: motivo.slice(0, 300) }).eq("id", L.id);
        feitos.push({ ...base, decisao: "pular", motivo });
      };
      if (L.codparc) { await pular("ja e CLIENTE da Nitron (codparc " + L.codparc + ") — quem fala com ele e o consultor dele"); continue; }
      if (digits(L.cnpj).length === 14) {
        const { data: cli } = await sb.from("ghl_cliente").select("codparc, razao, situacao").ilike("cnpj", "%" + digits(L.cnpj) + "%").limit(1).maybeSingle();
        if (cli) { await pular("o CNPJ dele ja tem cadastro na Nitron (" + cli.razao + ", codparc " + cli.codparc + ", " + cli.situacao + ") — quem fala com ele e o consultor dele"); continue; }
      }

      // ---- contato com DONO nao recebe pela Nina ----------------------------------------------
      const dn = await donoDoContato(String(L.contact_id));
      if (!dn.ok) { feitos.push({ ...base, decisao: "erro", motivo: "nao consegui ler o contato no CRM: " + dn.erro }); continue; }
      if (dn.dono && !donosOk.has(dn.dono)) {
        await pular("o contato tem dono no CRM (" + dn.dono + "), entao o Zaptos sairia pelo numero dele e nao pelo da Nina — e um humano ja esta na conversa");
        continue;
      }

      // ---- a conversa no CRM manda, nao a nossa tabela ----------------------------------------
      const rc = await ghl("GET", `/conversations/search?locationId=${LOC}&contactId=${L.contact_id}&limit=1`);
      if (!rc.ok) { feitos.push({ ...base, decisao: "erro", motivo: "GHL " + rc.status }); continue; }
      const cv = (((await rc.json().catch(() => ({})))?.conversations) || [])[0];
      if (!cv) { feitos.push({ ...base, decisao: "pular", motivo: "conversa nao encontrada no CRM" }); continue; }

      const rm = await ghl("GET", `/conversations/${cv.id}/messages?limit=20`, "2021-04-15");
      if (!rm.ok) { feitos.push({ ...base, decisao: "erro", motivo: "GHL " + rm.status + " nas mensagens" }); continue; }
      const arr = (((await rm.json().catch(() => ({})))?.messages?.messages) || []) as any[];
      const msgs = arr.slice().reverse().filter((m: any) => String(m?.body || "").trim() && !/^#contact_instance|^\[System\]/i.test(String(m.body)));
      if (!msgs.length) { feitos.push({ ...base, decisao: "pular", motivo: "sem historico legivel" }); continue; }

      const ultima = msgs[msgs.length - 1];
      // Ele escreveu e ninguem respondeu: isso e trabalho do copiloto-lead, nao da reativacao.
      // Reativar por cima seria responder a pergunta dele com uma mensagem de campanha.
      if (String(ultima.direction) === "inbound") { feitos.push({ ...base, decisao: "pular", motivo: "a ultima mensagem e DELE — o copiloto-lead e que tem de responder" }); continue; }
      // Conversa viva nao se reativa, se responde.
      const horasCaladas = (Date.now() - new Date(ultima.dateAdded || 0).getTime()) / 3600000;
      if (horasCaladas < silencioH) { feitos.push({ ...base, decisao: "pular", motivo: "falamos com ele ha " + Math.round(horasCaladas) + "h (teto: " + silencioH + "h) — conversa ainda viva" }); continue; }

      // ---- o que falta e conta de codigo, nao palpite do modelo -------------------------------
      const temCnpj = digits(L.cnpj).length === 14;
      const temCep = String(L.cep || "").trim() !== "";
      const falta: string[] = [];
      if (!temCnpj) falta.push("o CNPJ da loja");
      if (!temCep) falta.push("o CEP de entrega");

      const sei = [
        L.nome_confirmado && L.nome ? "o nome dele e " + L.nome : null,
        L.empresa ? "a loja e " + L.empresa : null,
        L.tipo_loja ? "e uma loja de " + L.tipo_loja : null,
        L.interesse ? "ele queria abastecer: " + L.interesse : null,
        (L.cidade || L.uf) ? "praca: " + [L.cidade, L.uf].filter(Boolean).join("/") : null,
        temCnpj ? "o CNPJ ja esta com a gente" : null,
        temCep ? "o CEP ja esta com a gente" : null,
        L.link_seg ? "ele JA recebeu o link da pagina de pedido uma vez" : null,
        L.sabe_minimo ? "ele ja sabe do pedido minimo" : null,
      ].filter(Boolean).join("; ");

      const sys = `Voce e a ${nome}, do time comercial da Nitronplast (Nitron), por WhatsApp. Pessoa de verdade da equipe, calorosa e direta.`
        + `\n\nESTILO: frases curtas e naturais, sem negrito, sem listas, sem textao, emoji quase nunca. No maximo 4 linhas. Nao diga que e IA.`
        + `\n\nO QUE ESTA ACONTECENDO: esta conversa parou ha ${base.parado_ha_dias} dias. Voce esta reabrindo ela. NAO e um "oi, tudo bem?" — mensagem de reabertura sem motivo e a que ninguem responde.`
        + `\n\nO MOTIVO DA REABERTURA, e ele tem de aparecer: o DESCONTO que ele ja tem na nossa pagina de pedido — a partir de R$ 5.000 entram 10%, automatico, somando sozinho na tela enquanto ele monta o pedido. Nao e negociacao, nao e promocao com prazo, nao e favor: e o que esta impresso na pagina.`
        + (falta.length
          ? `\n\nO QUE VOCE PRECISA DELE: ${falta.join(" e ")}. PECA OS DOIS — ou o que faltar — NA MESMA MENSAGEM, numa frase so, dizendo para que serve cada um: o CNPJ e para o sistema ver o tipo de empresa e montar a lista de produtos certa para o ramo dele; o CEP e para saber para onde vai a mercadoria e ja mostrar o preco com a entrega inclusa. NAO peca rua, numero nem bairro — o CEP basta. NAO peca mais nada alem desses.`
          : `\n\nVOCE JA TEM TUDO O QUE PRECISA dele (CNPJ e CEP). Entao nao peca dado nenhum: diga que ja consegue montar a lista do ramo dele com os precos e pergunte se quer que voce mande.`)
        + `\n\nO QUE VOCE NAO FAZ, NUNCA: nao promete prazo de entrega, nao fala o percentual do frete nem quanto do preco e frete, nao oferece desconto diferente do que esta na pagina, nao inventa produto, tabela nem condicao, nao usa pressa, escassez nem "so hoje", e nao cobra resposta.`
        + `\n\nPEDIDO MINIMO da Nitron: R$ ${pedidoMin.toLocaleString("pt-BR")}. Na primeira compra o pagamento e a vista ou 6x no cartao sem juros. So cite se couber naturalmente.`
        + `\n${base.parado_ha_dias >= 7 ? "Reconheca o tempo passado de leve, sem se desculpar demais e sem explicar por que sumimos." : ""}`
        + `\n\n${sei ? "O QUE VOCE JA SABE DELE (nao pergunte de novo nada disto): " + sei : "Voce quase nao sabe nada sobre a loja dele."}`;

      const user = msgs.map((m: any) => (m.direction === "inbound" ? "CONTATO: " : "VOCE (Nitron): ") + limpa(m.body).slice(0, 300)).join("\n")
        + "\n\n(Escreva SO a mensagem de reabertura, sem prefixo e sem aspas.)";

      let texto = "";
      try { texto = await anthropic(sys, user); } catch (e) { feitos.push({ ...base, decisao: "erro", motivo: String(e).slice(0, 180) }); continue; }
      if (!texto) { feitos.push({ ...base, decisao: "erro", motivo: "o modelo nao devolveu texto" }); continue; }

      if (dry || !ativo) {
        feitos.push({ ...base, decisao: "previa", falta: falta.length ? falta : "nada — ja temos CNPJ e CEP", calado_ha_horas: Math.round(horasCaladas), rascunho: texto, motivo: dry ? "previa (dry=1)" : "reativa_ativo=nao" });
        mandados++; continue;
      }

      // GRAVA ANTES DE MANDAR. E a licao do `toques`: contador escrito depois do envio (que leva
      // 12s de checagem de entrega) mente quando duas rodadas se cruzam, e o lead leva duas
      // mensagens quase iguais. Aqui o lead sai da fila no instante em que e escolhido.
      await sb.from("copiloto_lead").update({ reativa_em: new Date().toISOString(), reativa_texto: texto.slice(0, 2000), reativa_erro: null, atualizado: new Date().toISOString() }).eq("id", L.id);

      const env = await enviar(String(L.contact_id), texto, inst);
      if (!env?.ok) {
        await sb.from("copiloto_lead").update({ reativa_erro: String(env?.motivo || "envio recusado").slice(0, 300) }).eq("id", L.id);
        if (env?.instancia_caiu) {
          const p = await pausarInstancia(sb, inst, "queda detectada na reativacao de lead: " + String(env?.recusado || env?.motivo || "").slice(0, 200));
          feitos.push({ ...base, decisao: "instancia_caiu", instancia_pausada: p.ok, motivo: env?.recusado || env?.motivo });
          break; // a instancia e a mesma para todos: nao adianta tentar os proximos
        }
        feitos.push({ ...base, decisao: "falhou", motivo: env?.motivo || "envio recusado", texto });
        mandados++; continue;
      }
      mandados++;
      feitos.push({ ...base, decisao: "reativou", falta: falta.length ? falta : "nada", calado_ha_horas: Math.round(horasCaladas), texto });
    }

    const { count: restam } = await sb.from("copiloto_lead").select("id", { count: "exact", head: true })
      .in("status", ["frio", "passado", "qualificando", "qualificado"])
      .eq("instancia", inst).not("contact_id", "is", null).is("reativa_em", null);

    const conta = (k: string) => feitos.filter((x) => x.decisao === k).length;
    return j({
      ok: true, instancia: inst, reativa_ativo: ativo, modo: dry ? "previa" : (ativo ? "enviando" : "so rascunho (reativa_ativo=nao)"),
      hora_sp: h, lote, candidatos_lidos: (cands || []).length,
      teto_de_idade: maxDias ? (maxDias + " dias") : "sem teto", na_faixa: fila.length,
      reativou: conta("reativou"), previa: conta("previa"), pulou: conta("pular"), falhou: conta("falhou"), erro: conta("erro"),
      ainda_na_fila: restam ?? null,
      resultado: feitos,
    });
  } catch (e) { return j({ ok: false, erro: String(e) }, 500); }
});
