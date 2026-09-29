// emp-copiloto-responder (v13) - a Nina atende, decide, faz andar e passa a humano quando e a altura.
//
// ESPERA (v6/v7). Ha tres tempos:
//   - conversa em que um HUMANO falou nas ultimas responder_humano_janela_h (24h) -> responder_apos_min (60 min);
//   - conversa sem humano recente -> responder_novo_min (3 min), com override por instancia em
//     copiloto_config "responder_novo_min:<instancia>" (no numero oficial "João" = 15 min: o Joao atende em pessoa);
//   - a saudacao automatica do workflow (source=workflow) nao conta como humano.
// v8 (caso Edgard): Instagram/Facebook respondidos no proprio canal; historico com canal e data.
// v9: humano respondeu + cliente so agradece = CALAR; saudacao imposta pela hora de Sao Paulo.
// v10: a Nina MARCA a call com o LINK FIXO da sala do Joao (copiloto_config.call_link).
// v11: decidido_em >= ultima mensagem do cliente -> salta sem gastar IA; limite conta so o que vai a IA.
// v12 (14/09, caso Beatriz/Growth Omega): "fornecedor sem relacao = calar" deixava cair parceiros que podem
//   trazer eventos. Regra do Ricardo: tudo o que for bom para o negocio merece resposta. Parceiro -> interesse,
//   perguntar o modelo e passar ao Joao (gatilho parceria); fornecedor -> proposta para o e-mail do Joao.
//   So cala spam, golpe e mensagens automaticas.
// v13 (29/09, caso Marcelo/Teak): QUEM falou passa a ser lido pelo userId e pelo provedor, nao por source.
//   Toda mensagem postada por API tem source="api" - inclusive a que uma PESSOA digita na caixa do CRM.
//   O resultado era a Nina ler mensagem de humano como se fosse dela. Agora: com userId = pessoa no CRM;
//   sem userId e pelo provedor de ENTRADA = pessoa no app do WhatsApp (o bridge espelha o que sai do
//   aparelho); o resto que sai por API = Nina/campanha. A espera de responder_apos_min nao muda.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const PROIB = ["public", "graphql_public", "auth", "storage", "extensions"];
const S = (x: any) => (x === null || x === undefined || String(x).trim() === "") ? null : String(x).trim();
const CHAVES = ["ANTHROPIC_API_KEY", "ANTHROPIC_KEY", "CLAUDE_API_KEY"];
const ehComando = (t: string) => t.startsWith("#contact_instance") || t.startsWith("[System]") || /^Opportunity (created|updated)/i.test(t);
const instanciaDe = (c: any) => (String(c?.lastMessageBody || "").match(/Instance Source:\s*([^\n\r]+)/i)?.[1] || "").trim();
const CANAL: Record<string, string> = { TYPE_SMS: "WhatsApp", TYPE_WHATSAPP: "WhatsApp", TYPE_INSTAGRAM: "Instagram", TYPE_FACEBOOK: "Facebook", TYPE_EMAIL: "E-mail", TYPE_CALL: "Ligacao", TYPE_LIVE_CHAT: "Chat do site" };
const fmtSlot = (s: string) => new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sp = new URL(req.url).searchParams;
    const b = await req.json().catch(() => ({} as any));
    const gav = String(sp.get("empresa") || b.empresa || "").toLowerCase().trim();
    if (!/^[a-z][a-z0-9_]{1,30}$/.test(gav) || PROIB.includes(gav)) return j({ ok: false, erro: "gaveta invalida" }, 400);
    const rascunho = sp.get("previa") === "1" || b.previa === true;

    const BASE = Deno.env.get("SUPABASE_URL")!;
    const SRV = Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(BASE, SRV, { db: { schema: gav } });
    const { data: cf } = await sb.from("config").select("chave,valor");
    const C: Record<string, string> = Object.fromEntries((cf || []).map((r: any) => [r.chave, r.valor]));
    const { data: cp } = await sb.from("copiloto_config").select("chave,valor");
    const P: Record<string, string> = Object.fromEntries((cp || []).map((r: any) => [r.chave, r.valor]));
    const TOKEN = (C.ghl_token_secret ? Deno.env.get(C.ghl_token_secret) : "") || C.ghl_token || "";
    const LOC = C.ghl_location;
    const KEY_IA = CHAVES.map((k) => Deno.env.get(k)).find(Boolean);
    if (!TOKEN || !LOC || !KEY_IA) return j({ ok: false, erro: "config sem token/location/chave de IA" }, 400);

    const ATIVO = P.copiloto_ativo === "sim";
    const MIN_NOVO = Math.max(0, Number(b.minutos ?? P.responder_novo_min ?? 3));
    const MIN_HUMANO = Math.max(0, Number(b.minutos_humano ?? P.responder_apos_min ?? 60));
    const JANELA_H = Math.max(1, Number(P.responder_humano_janela_h ?? 24));
    const MAXH = Math.max(1, Number(b.horas_max ?? P.responder_ate_horas ?? 48));
    const H0 = Number(P.responder_hora_inicio ?? 8), H1 = Number(P.responder_hora_fim ?? 21);
    const MODELO = P.modelo_ia || "claude-sonnet-4-5-20250929";
    const APRES = S(C.apresentacao_eventos_url) || "";
    const CALL_LINK = S(P.call_link) || "";
    const CALL_CAL = S(P.call_calendario_id) || "";
    const CALL_RESP = S(P.call_responsavel_id) || S(P.handoff_responsavel_id) || "";
    const CALL_MIN = Math.max(15, Number(P.call_duracao_min ?? 30));
    const FONES_AVISO = String(P.handoff_fones || "").split(",").map((x) => x.trim()).filter(Boolean);
    const LIMITE = Math.max(1, Number(b.limite || 6));
    const minNovo = (c: any) => {
      if (b.minutos !== undefined) return MIN_NOVO;
      const v = P["responder_novo_min:" + instanciaDe(c)];
      return v !== undefined && v !== "" ? Math.max(0, Number(v)) : MIN_NOVO;
    };

    const spNow = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const hora = spNow.getHours();
    const periodo = hora < 12 ? "manha" : hora < 18 ? "tarde" : "noite";
    const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
    if (!rascunho && (hora < H0 || hora >= H1)) return j({ ok: true, gaveta: gav, tratadas: 0, motivo: `fora da janela (${H0}h-${H1}h, agora ${hora}h)` });

    const ghl = (m: string, p: string, body?: any, v = "2021-07-28") =>
      fetch("https://services.leadconnectorhq.com" + p, { method: m, headers: { Authorization: "Bearer " + TOKEN, Version: v, "Content-Type": "application/json", Accept: "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const enviarWpp = (fone: string, texto: string, contactId?: string, instancia?: string) => fetch(`${BASE}/functions/v1/emp-enviar?empresa=${gav}`, {
      method: "POST", headers: { Authorization: "Bearer " + SRV, "Content-Type": "application/json" },
      body: JSON.stringify({ empresa: gav, canal: "whatsapp", fone, instancia: instancia || C.instancia_entrada || "", texto, contact_id: contactId }),
    }).then((r) => r.json()).catch(() => ({ ok: false }));

    // ---- agenda do Joao (so com link fixo configurado) ----
    let slots: string[] = [];
    if (CALL_LINK && CALL_CAL) {
      try {
        const ini = Date.now() + 60 * 60000;
        const rs = await ghl("GET", `/calendars/${CALL_CAL}/free-slots?startDate=${ini}&endDate=${Date.now() + 6 * 86400000}&timezone=America/Sao_Paulo`, undefined, "2021-04-15");
        const ds = await rs.json().catch(() => ({} as any));
        for (const [k, v] of Object.entries(ds || {})) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Array.isArray((v as any)?.slots)) slots.push(...(v as any).slots);
        slots = slots.filter((s) => new Date(s).getTime() > ini).sort();
      } catch { /* */ }
    }
    const porDia: Record<string, string[]> = {};
    for (const s of slots) (porDia[s.slice(0, 10)] ||= []).push(s.slice(11, 16));
    const agendaTxt = Object.entries(porDia).slice(0, 5).map(([d, hs]) =>
      `${new Date(d + "T12:00:00-03:00").toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" })} (${d}): ${hs.join(", ")}`).join("\n");
    const sugerir = () => {
      const dias = Object.keys(porDia); const out: string[] = [];
      for (const [d, h] of [[dias[0], "10:00"], [dias[0], "15:00"], [dias[1], "10:00"]] as [string, string][]) {
        if (!d) continue;
        const hit = slots.find((s) => s.slice(0, 10) === d && s.slice(11, 16) >= h);
        if (hit && !out.includes(hit)) out.push(hit);
      }
      return out.map(fmtSlot);
    };
    const CALL_ON = !!(CALL_LINK && CALL_CAL && slots.length);

    const r = await ghl("GET", `/conversations/search?locationId=${LOC}&limit=40&sortBy=last_message_date&lastMessageDirection=inbound`);
    if (!r.ok) return j({ ok: false, http: r.status, erro: (await r.text()).slice(0, 300) }, 200);
    const convs = (await r.json())?.conversations || [];

    const { data: sk } = await sb.from("copiloto_skills").select("nome,conteudo").eq("ativo", true);
    const peso = (n: string) => n === "sdr-conducao" ? 0 : n === "identidade" ? 1 : n === "apresentacao-eventos" ? 2 : n.startsWith("sdr-") ? 3 : 4;
    const manual = (sk || []).filter((x: any) => x.nome !== "voz" && x.nome !== "descoberta")
      .slice().sort((a: any, z: any) => peso(a.nome) - peso(z.nome))
      .map((x: any) => "[" + String(x.nome).toUpperCase() + "]\n" + x.conteudo).join("\n\n");

    const agora = Date.now();
    const soConv = S(b.conversa_id);
    const alvos = convs.filter((c: any) => {
      if (soConv) return String(c.id) === soConv;
      const q = Number(c.lastMessageDate || 0); if (!q) return false;
      const min = (agora - q) / 60000;
      return min >= minNovo(c) && min <= MAXH * 60 && String(c.lastMessageType) !== "TYPE_EMAIL";
    });

    const feitos: any[] = []; let foiIA = 0; let jaDecididas = 0;
    for (const c of alvos) {
      if (foiIA >= LIMITE) break;
      const convId = String(c.id);
      const nome = S(c.fullName) || S(c.contactName) || "";
      const ultEntrada = Number(c.lastMessageDate);
      const minEspera = Math.round((agora - ultEntrada) / 60000);

      const { data: est } = await sb.from("conversa_estado").select("assumida_em,humano_ate,humano_motivo,decidido_em").eq("conversa_id", convId).maybeSingle();
      const ninaEm = est?.assumida_em ? new Date(est.assumida_em).getTime() : 0;
      const decididoEm = est?.decidido_em ? new Date(est.decidido_em).getTime() : 0;
      // ja decidida para esta mesma mensagem do cliente: nao volta a IA
      if (!soConv && !b.reprocessar && ((ninaEm && ninaEm >= ultEntrada) || (decididoEm && decididoEm >= ultEntrada))) { jaDecididas++; continue; }
      if (est?.humano_ate && new Date(est.humano_ate).getTime() > agora) {
        feitos.push({ nome, decisao: "calar", motivo: `humano assumiu: ${est.humano_motivo || ""}`.slice(0, 140) }); continue;
      }

      const canalConv = String(c.lastMessageType || "");
      const social = canalConv === "TYPE_INSTAGRAM" || canalConv === "TYPE_FACEBOOK";
      let fone = S(c.phone);
      if (!fone && social && c.contactId) {
        try { const rc = await ghl("GET", `/contacts/${c.contactId}`); fone = S((await rc.json())?.contact?.phone); } catch { /* */ }
      }
      if (!fone && !social) { feitos.push({ nome, decisao: "calar", motivo: "sem telefone para responder" }); continue; }

      let historico = ""; let humanoFalou = false;
      try {
        const rm = await ghl("GET", `/conversations/${convId}/messages?limit=30`, undefined, "2021-04-15");
        const dm = await rm.json().catch(() => ({} as any));
        const ms = (dm?.messages?.messages || dm?.messages || []).slice().reverse();
        // Provedor por onde as mensagens do CLIENTE chegam nesta conversa. E a assinatura do bridge:
        // saida por ESSE provedor, sem userId, e o espelho do que alguem digitou no app do WhatsApp.
        const provEntrada = String((ms.find((x: any) => x?.direction !== "outbound" && x?.conversationProviderId) || {})?.conversationProviderId || "");
        const linhas: string[] = [];
        for (const m of ms) {
          const tipo = String(m?.messageType || "");
          if (tipo.startsWith("TYPE_ACTIVITY")) continue;
          let t = String(m?.body || "").replace(/Instance Source:.*/is, "").replace(/\s+/g, " ").trim();
          if (t && ehComando(t)) continue;
          const quando = m?.dateAdded ? new Date(m.dateAdded).getTime() : 0;
          const doWorkflow = String(m?.source || "").toLowerCase() === "workflow";
          const daNina = ninaEm && quando && Math.abs(quando - ninaEm) < 180000;
          // userId = uma PESSOA clicou enviar no CRM. Sem userId + provedor de entrada = pessoa no celular.
          const temUser = !!S(m?.userId);
          const doCelular = !temUser && !!provEntrada && String(m?.conversationProviderId || "") === provEntrada;
          const quem = m?.direction !== "outbound" ? "CLIENTE"
            : doWorkflow ? "ROGA (automatico)"
            : doCelular ? "ROGA (equipe, pelo celular)"
            : temUser ? "ROGA (equipe)"
            : (daNina || String(m?.source || "") === "api") ? "ROGA (Nina)" : "ROGA (equipe)";
          if (m?.direction === "outbound" && t && quando >= ultEntrada - JANELA_H * 3600000 && !doWorkflow && !daNina) humanoFalou = true;
          const q = quando ? new Date(quando).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
          if (!t) t = "(ficheiro/imagem/audio sem texto)";
          linhas.push(`[${q} ${CANAL[tipo] || ""}] ${quem}: ${t.slice(0, 500)}`);
        }
        historico = linhas.join("\n");
      } catch { /* */ }
      if (!historico) { feitos.push({ nome, decisao: "calar", motivo: "sem historico" }); continue; }

      if (humanoFalou && minEspera < MIN_HUMANO) {
        feitos.push({ nome, decisao: "calar", motivo: `humano na conversa: espero ${MIN_HUMANO} min antes de entrar (passaram ${minEspera})` }); continue;
      }

      const blocoCall = CALL_ON
        ? `"marcar_call" - CALL COM O JOAO. Quando a pessoa pede uma call/reuniao online (ou aceita a tua sugestao), VOCE MARCA na agenda do Joao. `
          + `Nunca peças a pessoa para mandar convite nem e-mail para convite.\n`
          + `  Horarios livres do Joao (${CALL_MIN} min, horario de Brasilia):\n${agendaTxt}\n`
          + `  - ainda nao ha horario escolhido: acao "responder" propondo 2 ou 3 destes horarios;\n`
          + `  - a pessoa escolheu ou propos um horario que ESTA na lista: acao "marcar_call" com "call_inicio":"AAAA-MM-DDTHH:MM"; `
          + `a mensagem confirma dia e hora e diz que quem atende e o Joao Henrique Martins. NAO escrevas link: o sistema acrescenta o link da sala;\n`
          + `  - o horario pedido nao esta na lista: acao "responder" propondo os mais proximos.\n\n`
        : "";

      const sistema = `Voce e a ${P.nome_assistente || "Nina"}, do ${C.empresa_nome || "Roga Village"} (Atibaia-SP). Esta conversa e no ${CANAL[canalConv] || "WhatsApp"}.\n`
        + `Agora sao ${spNow.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (periodo: ${periodo}).\n`
        + `${fone ? `Telefone que o contato ja nos deu: ${fone}. Nao voltes a pedir.\n` : ""}`
        + `O historico traz data, canal e quem falou (CLIENTE, ROGA (equipe) = pessoa da casa no CRM, ROGA (equipe, pelo celular) = pessoa da casa respondendo pelo WhatsApp do aparelho, ROGA (Nina) = voce, ROGA (automatico) = saudacao do sistema), inclusive de meses atras: conta TUDO.\n\n`
        + `Le a conversa INTEIRA e escolhe UMA accao:\n\n`
        + `"calar" - OBRIGATORIO quando:\n`
        + `  - a EQUIPE ja respondeu ao pedido do cliente e a ultima do cliente e agradecimento, confirmacao, "vou enviar", "ok" ou despedida - `
        + `mesmo que falte informacao para o orcamento: a pessoa da casa esta a conduzir e voce NAO entra por cima;\n`
        + `  - alguem da equipe prometeu algo hoje e ainda esta no prazo;\n`
        + `  - a ultima do cliente e so agradecimento, aceite, emoji ou despedida; so enviou ficheiro;\n`
        + `  - responder seria repetir ou reabrir assunto encerrado; spam, golpe, ou mensagem automatica de operadora, banco ou sistema.\n`
        + `  Na duvida entre cliente e spam, responde; na duvida sobre atropelar a equipe, calar.\n\n`
        + `PARCEIROS E FORNECEDORES NAO SAO SPAM: tudo o que puder ser bom para o negocio merece resposta. `
        + `Quem pode trazer eventos, clientes, datas ocupadas ou visibilidade (agencias, assessorias de marketing e vendas, cerimonialistas, produtores, influenciadores, turismo) `
        + `-> mostra interesse, responde o que souberes e pergunta como funciona o modelo (o que entrega, como cobra, que resultado garante), e passa ao Joao: acao "passar_humano", gatilho "parceria". `
        + `Fornecedor operacional (insumos, servicos, equipamento, conteudo) -> resposta cordial, pede a proposta para joao.martins@rogavillage.com.br e passa ao Joao: gatilho "fornecedor".\n\n`
        + `"passar_humano" - so quando o assunto SAI DO TEU ALCANCE ou o trabalho de SDR terminou:\n`
        + `  - o cliente ja deu tudo o que era preciso e so falta PRECO/PROPOSTA (gatilho "qualificado");\n`
        + `  - pede explicitamente falar com alguem ou pede o contato do Joao${CALL_ON ? "" : ", ou uma call"} (gatilho "pedido_explicito");\n`
        + `  - parceiro ou fornecedor com proposta para a casa (gatilho "parceria" ou "fornecedor");\n`
        + `  - pergunta valores, condicoes comerciais, exclusividade, contrato, confirmacao de data no calendario, ou reclama (gatilho "fora_do_alcance");\n`
        + `  - a conversa ja deu tres ou quatro voltas sem avancar (gatilho "em_circulos").\n`
        + `  Antes de passar, responde na mesma mensagem tudo o que souberes pelos manuais e passa so o resto.\n`
        + `  A "mensagem" e o que dizes AO CLIENTE: o que vais fazer e ATE QUANDO. Nao prometas valores.\n`
        + `  Preenche "resumo" (tudo o que se apurou, de todo o historico) e "falta" (o que o humano tem de fazer ou o que precisa constar no orcamento).\n\n`
        + `"responder" - a ultima do cliente traz pergunta por responder, ou ha promessa antiga da casa esquecida (dias atras), ou dados a recolher ao teu alcance.\n`
        + `  Identifica a FRENTE (se nao souberes, a primeira pergunta separa empresa, celebracao ou estadia), percorre o CHECKLIST, `
        + `separa o que JA SABES do que FALTA e pergunta so o que falta. Se pediu orcamento, recolhe o que falta numa unica `
        + `mensagem com o enquadramento de poupar o tempo dela, e NAO exijas visita para dar preco.\n\n`
        + blocoCall
        + `FORMA: mensagem curta de chat, 2 a 6 linhas, portugues do Brasil com acentos, sem markdown. `
        + `Se cumprimentares, usa exatamente "${saudacao}" - e a hora de Sao Paulo que manda, nao a saudacao que o cliente usou. `
        + `NUNCA inventes preco, disponibilidade, data, endereco de e-mail ou telefone que nao esteja nos manuais. `
        + `Link da visita, quando for a altura: ${P.link_visita || C.link_visita || ""}\n`
        + `${APRES ? `Apresentacao do espaco (PDF), quando pedirem material: ${APRES}\n` : ""}\n`
        + `DEVOLVE APENAS JSON: {"acao":"calar|responder|passar_humano${CALL_ON ? "|marcar_call" : ""}", "frente":"...", "gatilho":"...", `
        + `"ja_sei":"...", "falta":"...", "resumo":"...", "motivo":"uma frase", "mensagem":"texto ou vazio"${CALL_ON ? `, "call_inicio":"AAAA-MM-DDTHH:MM ou vazio"` : ""}}\n\n`
        + `### MANUAIS DA CASA (o de CONDUCAO manda; APRESENTACAO-EVENTOS tem os numeros oficiais)\n${manual}`;

      foiIA++;
      const ru = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", headers: { "x-api-key": KEY_IA, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODELO, max_tokens: 1100, system: sistema,
          messages: [{ role: "user", content: `Contato: ${nome || "sem nome"}\n\nCONVERSA:\n${historico}\n\nDecide e devolve o JSON.` }] }),
      });
      const du = await ru.json().catch(() => ({} as any));
      let dec: any = null;
      try { const raw = String(du?.content?.[0]?.text || ""); dec = JSON.parse((raw.match(/\{[\s\S]*\}/) || [raw])[0]); } catch { /* */ }
      if (!dec) { feitos.push({ nome, decisao: "erro", motivo: "IA nao devolveu JSON" }); continue; }

      let acao = String(dec.acao || "calar");
      let call: any = null;
      if (acao === "marcar_call") {
        if (!CALL_ON) acao = "passar_humano";
        else {
          const pedido = String(dec.call_inicio || "").slice(0, 16);
          const slot = slots.find((s) => s.slice(0, 16) === pedido) || null;
          call = { pedido, slot, livre: !!slot };
        }
      }
      const base = { nome, fone, canal: CANAL[canalConv] || canalConv, frente: dec.frente, gatilho: dec.gatilho, humano_na_conversa: humanoFalou, minutos_espera: minEspera, motivo: String(dec.motivo || "").slice(0, 200), call: call || undefined };
      if (acao === "calar" || !S(dec.mensagem)) {
        if (!rascunho) await sb.from("conversa_estado").upsert({ conversa_id: convId, contact_id: S(c.contactId), nome, fone, decidido_em: new Date().toISOString(), decisao: "calar" }, { onConflict: "conversa_id" });
        feitos.push({ ...base, decisao: "calar" }); continue;
      }
      if (rascunho || !ATIVO) { feitos.push({ ...base, decisao: acao, ja_sei: dec.ja_sei, falta: dec.falta, resumo: dec.resumo, rascunho: dec.mensagem }); continue; }

      // ---- marcar a call antes de responder ----
      let mensagemFinal = String(dec.mensagem).trim();
      let agendamento: any = null;
      if (acao === "marcar_call" && call) {
        if (call.slot) {
          try {
            const fim = new Date(new Date(call.slot).getTime() + CALL_MIN * 60000).toISOString();
            const ra = await ghl("POST", "/calendars/events/appointments", {
              calendarId: CALL_CAL, locationId: LOC, contactId: c.contactId, startTime: call.slot, endTime: fim,
              title: `Call Roga Village - ${nome || "contato"}`, appointmentStatus: "confirmed",
              ...(CALL_RESP ? { assignedUserId: CALL_RESP } : {}), address: CALL_LINK, meetingLocationType: "custom", toNotify: false,
            }, "2021-04-15");
            const da = await ra.json().catch(() => ({} as any));
            agendamento = ra.ok ? { ok: true, id: da?.id || da?.appointment?.id || null } : { ok: false, erro: JSON.stringify(da).slice(0, 200) };
          } catch (e) { agendamento = { ok: false, erro: String(e).slice(0, 200) }; }
        }
        if (agendamento?.ok) mensagemFinal = `${mensagemFinal}\n\nLink da call: ${CALL_LINK}`;
        else if (!call.slot) {
          const sug = sugerir();
          mensagemFinal = sug.length ? `Esse horário já não está livre na agenda do João. Tenho ${sug.join(" ou ")} (horário de Brasília). Qual fica melhor?`
            : `Vou confirmar um horário com o João e já te retorno por aqui.`;
        } else mensagemFinal = `Perfeito! Vou só confirmar esse horário na agenda do João e já te mando o link da call por aqui.`;
      }

      let enviadoOk = false; let motivoEnvio: any;
      if (social) {
        const rs = await ghl("POST", "/conversations/messages", { type: canalConv === "TYPE_INSTAGRAM" ? "IG" : "FB", contactId: c.contactId, message: mensagemFinal }, "2021-04-15");
        enviadoOk = rs.status >= 200 && rs.status < 300;
        if (!enviadoOk) motivoEnvio = `GHL ${rs.status}: ${(await rs.text()).slice(0, 200)}`;
      } else {
        const de = await enviarWpp(String(fone), mensagemFinal, c.contactId, instanciaDe(c) || C.instancia_entrada || "");
        enviadoOk = !!de?.ok; motivoEnvio = de?.motivo;
      }
      if (!enviadoOk) { feitos.push({ ...base, decisao: acao, enviado: false, agendamento, motivo_envio: motivoEnvio }); continue; }
      await sb.from("conversa_estado").upsert({ conversa_id: convId, contact_id: S(c.contactId), nome, fone, assumida_em: new Date().toISOString(), decidido_em: new Date().toISOString(), decisao: acao }, { onConflict: "conversa_id" });

      if (acao === "marcar_call" && call?.slot && FONES_AVISO.length) {
        const txtJ = agendamento?.ok
          ? `João, a Nina marcou uma call para você.\n\n${nome || "Contato"}${fone ? " — " + fone : ""}\n${fmtSlot(call.slot)} (${CALL_MIN} min)\nLink: ${CALL_LINK}\n\nContexto: ${S(dec.resumo) || S(dec.ja_sei) || "-"}`
          : `João, ${nome || "um contato"}${fone ? " (" + fone + ")" : ""} aceitou call em ${fmtSlot(call.slot)}, mas a agenda não aceitou a marcação. Confirma com ele por aqui e manda o link da sala.`;
        for (const f of FONES_AVISO) await enviarWpp(f, txtJ);
      }

      let handoff: any = null;
      if (acao === "passar_humano") {
        const rh = await fetch(`${BASE}/functions/v1/emp-handoff?empresa=${gav}`, {
          method: "POST", headers: { Authorization: "Bearer " + SRV, "Content-Type": "application/json" },
          body: JSON.stringify({ empresa: gav, abrir: { conversa_id: convId, contact_id: c.contactId, nome, fone, frente: dec.frente,
            gatilho: dec.gatilho || "qualificado", resumo: dec.resumo || dec.ja_sei, falta: dec.falta } }),
        });
        handoff = await rh.json().catch(() => ({ ok: false }));
      }
      feitos.push({ ...base, decisao: acao, enviado: true, agendamento: agendamento || undefined, handoff: handoff ? (handoff.ok ? handoff.handoff_id : handoff.erro) : undefined, texto: mensagemFinal });
    }

    const cont = (k: string) => feitos.filter((x) => x.decisao === k).length;
    const porInstancia = Object.fromEntries(Object.entries(P).filter(([k]) => k.startsWith("responder_novo_min:")).map(([k, v]) => [k.split(":")[1], Number(v)]));
    return j({ ok: true, gaveta: gav, copiloto_ativo: ATIVO, modo: (rascunho || !ATIVO) ? "rascunho" : "a agir",
      espera: { novo_min: MIN_NOVO, novo_min_por_instancia: porInstancia, com_humano_min: MIN_HUMANO, janela_humano_h: JANELA_H },
      call: { ligada: CALL_ON, link: CALL_LINK ? "configurado" : "falta call_link", horarios_livres: slots.length },
      candidatas: alvos.length, ja_decididas: jaDecididas, foram_a_ia: foiIA,
      analisadas: feitos.length, responder: cont("responder"), passar_humano: cont("passar_humano"), marcar_call: cont("marcar_call"), calar: cont("calar"), resultado: feitos });
  } catch (e) { return j({ ok: false, erro: String(e) }, 500); }
});
