// nina-raspagem (v1) — PROSPECCAO DE DISTRIBUIDORAS, A ACAO DA TAG `raspagem-onda1`.
// Documento do Dan, 27/10. Autorizada pelo gestor no mesmo dia: "Pode fazer".
//
// ISTO NAO E O FLUXO DE LEAD DO ANUNCIO, e a separacao e o ponto principal desta funcao.
// O publico e outro (distribuidor, nao lojista), o roteiro e outro (secao 6 do documento), a
// regua e outra (dia 0 / dia 3 util / dia 7 util, teto de 3) e as tags de resultado sao outras.
// Ordem do gestor: "e como se fosse uma campanha nova (...) nao e para confundir com as outras,
// inclusive porque estamos mandando apenas para a galera que tem a TAG".
// Por isso o `copiloto-lead` pula quem tem a tag `raspagem`/`raspagem-onda1`: sem esse desvio as
// duas IAs disputam a mesma conversa e a de lead aplica o roteiro de LOJISTA num distribuidor.
//
// NASCE DESLIGADA e sem cron (`raspagem_ativo='nao'`). E a licao de 16/09: uma linha de
// configuracao nao pode ser a unica coisa entre o silencio e 26 empresas recebendo mensagem.
//
// O E-MAIL NAO SAI ENQUANTO `raspagem_assinatura_fone` ESTIVER VAZIA. O modelo do documento tem
// "[WhatsApp comercial]" como placeholder; mandar o placeholder para 17 empresas seria pior do
// que nao mandar, e inventar um numero e pior ainda.
//
// MINIMO: 3.570 em Extremo de Campinas e Extremo de Sorocaba, 2.500 no resto — regra do
// documento, que e a `venda_min_cif` do Sankhya (conferido nas 22 cidades da lista, todas com
// frete CIF 0%). NAO e o minimo de R$ 3.500 que a Nina fala ao LOJISTA: publico diferente,
// regua diferente. Se um dia tiver de ser igual, muda aqui e no documento, juntos.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GHL = (Deno.env.get("GHL_TOKEN") || "").trim();
const LOC = "rZ8y7lzqV7fzxsartaX2";
const MODELO = "claude-sonnet-5";

const ghl = (m: string, p: string, v = "2021-07-28", body?: any) => fetch("https://services.leadconnectorhq.com" + p, { method: m, headers: { Authorization: "Bearer " + GHL, Version: v, Accept: "application/json", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const limpa = (t: any) => String(t || "").replace(/Instance Source:.*/is, "").replace(/#contact_instance:\S+/gi, "").replace(/\s+/g, " ").trim();
const brl = (n: number) => "R$ " + Number(n).toLocaleString("pt-BR");

// campos personalizados do CRM usados por esta acao (ids conferidos em 27/10)
const CF = { cargo: "3lzATNWZF98wdLnuVbJl", comentario: "XKUtKSM1hxPxoqLwXivp" };

// ---- horario: dia util, 9h as 17h de Brasilia (secao 3 do documento) -------------------------
// Brasilia = UTC-3 o ano todo. O mesmo truque do resto do projeto: desloca e le em UTC.
function agoraBRT(): Date { return new Date(Date.now() - 3 * 3600 * 1000); }
function diaUtil(d: Date): boolean { const w = d.getUTCDay(); return w >= 1 && w <= 5; }
function naJanela(cfg: Record<string, string>): boolean {
  const d = agoraBRT(); if (!diaUtil(d)) return false;
  const h = d.getUTCHours();
  return h >= (parseInt(cfg.raspagem_hora_ini || "9") || 9) && h < (parseInt(cfg.raspagem_hora_fim || "17") || 17);
}
// "dia 3 util" conta DIAS UTEIS a frente, nao 3x24h: mandar o seguimento no sabado e queimar o toque.
function somaDiasUteis(base: Date, n: number): Date {
  const d = new Date(base.getTime()); let faltam = n;
  while (faltam > 0) { d.setUTCDate(d.getUTCDate() + 1); if (diaUtil(new Date(d.getTime() - 3 * 3600 * 1000))) faltam--; }
  return d;
}

// ---- as mensagens (secao 4 e 5 do documento) --------------------------------------------------
const minimoDa = (praca: any, cfg: Record<string, string>) =>
  /extremo/i.test(String(praca || "")) ? (parseInt(cfg.raspagem_min_extremo || "3570") || 3570)
                                       : (parseInt(cfg.raspagem_min_padrao || "2500") || 2500);

function txtWpp(c: any): string {
  return `Olá! Aqui é a Nina, da Nitron, fabricante de potes, organizadores e utilidades domésticas. `
    + `Estamos buscando distribuidores em ${c.cidade} e a ${c.empresa} chamou nossa atenção. `
    + `Posso te enviar nossa condição para distribuidor? O frete é CIF sem adicional para a sua cidade.`;
}
function txtEmail(c: any, cfg: Record<string, string>): { assunto: string; texto: string } {
  const fone = String(cfg.raspagem_assinatura_fone || "").trim();
  return {
    assunto: `Nitron: condição para distribuidores em ${c.cidade}`,
    texto: [
      "Olá, tudo bem?", "",
      "Aqui é a Nina, da Nitron, fabricante de potes, organizadores, lixeiras e utilidades plásticas.", "",
      `Estamos ampliando nossa rede de distribuidores no interior de SP e a ${c.empresa} chamou nossa atenção como distribuidora de utilidades em ${c.cidade}.`, "",
      `- Frete CIF sem adicional para ${c.cidade} (pedido mínimo de ${brl(minimoDa(c.praca, cfg))})`,
      "- Tabela específica para distribuidor",
      "- Organização e Potes são as linhas que mais giram nas distribuidoras da região", "",
      "Posso te enviar a tabela e o catálogo? Se não for com você, pode me indicar quem cuida das compras?", "",
      "Nina · Nitron", fone, "",
      'Se não quiser receber nossos contatos, é só responder "sair".',
    // SEM filter aqui: as linhas vazias sao os PARAGRAFOS do e-mail. Um filter((x)=>x!=="")
    // engoliria todas e o texto chegaria como um paredao. O `fone` nunca vem vazio neste ponto:
    // o envio por e-mail e bloqueado antes quando raspagem_assinatura_fone esta vazia.
    ].join("\n"),
  };
}
// os dois seguimentos sao texto fixo do documento: nao passam pelo modelo de proposito, para
// ninguem acordar com a Nina reescrevendo a cadencia de uma acao fria.
function txtSeguimento(c: any, toque: number): string {
  return toque === 2
    ? `Oi! Passando para saber se faz sentido te enviar nossa condição para distribuidor em ${c.cidade}. Se não for com você, me indica quem cuida das compras?`
    : `Última mensagem por aqui: se em algum momento quiser conhecer a linha Nitron para distribuidor, é só responder. Obrigada!`;
}

async function enviar(c: any, cfg: Record<string, string>, texto: string, assunto?: string) {
  const inst = String(cfg.raspagem_instancia || "Nina").trim();
  const body: any = c.canal === "email"
    ? { canal: "email", instancia: inst, email: c.email, nome: c.empresa, assunto, texto }
    : { canal: "whatsapp", instancia: inst, contact_id: c.contact_id, nome: c.empresa, texto };
  const r = await fetch(SUPA_URL + "/functions/v1/campanhas-enviar", {
    method: "POST", headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return await r.json().catch(() => ({ ok: false, motivo: "resposta ilegivel do campanhas-enviar" }));
}

async function tagear(contactId: string, tags: string[]) {
  try { const r = await ghl("POST", `/contacts/${contactId}/tags`, "2021-07-28", { tags }); return r.ok; } catch { return false; }
}
async function campos(contactId: string, pares: { id: string; value: any }[]) {
  try { const r = await ghl("PUT", `/contacts/${contactId}`, "2021-07-28", { customFields: pares }); return r.ok; } catch { return false; }
}

async function anthropic(system: string, messages: any[], tools: any[]): Promise<any> {
  const key = Deno.env.get("ANTHROPIC_API_KEY"); if (!key) throw new Error("sem ANTHROPIC_API_KEY");
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: MODELO, max_tokens: 1200, system, tools, messages }) });
  if (!r.ok) throw new Error("anthropic " + r.status + " " + (await r.text()).slice(0, 300));
  return await r.json();
}

// ---- ferramentas da conversa (secoes 6, 7 e 8) ------------------------------------------------
const TOOLS = [
  { name: "anotar", description: "Grava o que voce apurou com esta distribuidora. Chame assim que souber algo novo.", input_schema: { type: "object", properties: {
    cargo: { type: "string", enum: ["Comprador", "Proprietário", "Financeiro", "Expedição"], description: "cargo de quem respondeu, se ele disse" },
    comentario: { type: "string", description: "2 linhas: quem respondeu, o que quer e as marcas que trabalha" },
    marcas: { type: "string", description: "marcas que ele trabalha hoje nessa linha" },
    cidades: { type: "string", description: "cidades que ele atende" } }, required: [] } },
  { name: "marcar_resultado", description: "Fecha o desfecho desta conversa. Use UMA vez, quando ficar claro.", input_schema: { type: "object", properties: {
    resultado: { type: "string", enum: ["qualificado", "sem_interesse", "fora_do_perfil", "contato_invalido", "optout"],
      description: "qualificado = e distribuidor E quer receber a tabela; fora_do_perfil = e fabrica ou nao distribui; optout = pediu para sair" },
    motivo: { type: "string" } }, required: ["resultado"] } },
  { name: "passar_humano", description: "Passa a conversa para uma pessoa do time. Use quando pedirem tabela, preco, catalogo, condicao de pagamento, cadastro ou pedido; quando o comprador topar receber contato; ou quando a duvida for algo que voce nao pode responder.", input_schema: { type: "object", properties: {
    resumo: { type: "string", description: "2 linhas: quem respondeu, o que quer, marcas que trabalha" } }, required: ["resumo"] } },
];

async function runTool(sb: any, c: any, cfg: Record<string, string>, name: string, input: any): Promise<any> {
  try {
    if (name === "anotar") {
      const com = [input?.comentario, input?.marcas && ("Marcas: " + input.marcas), input?.cidades && ("Atende: " + input.cidades)].filter(Boolean).join(" | ").slice(0, 900);
      const patch: any = { atualizado: new Date().toISOString() };
      if (input?.cargo) patch.cargo = String(input.cargo).slice(0, 40);
      if (com) patch.comentario = com;
      await sb.from("raspagem_contato").update(patch).eq("contact_id", c.contact_id);
      const pares: any[] = [];
      if (input?.cargo) pares.push({ id: CF.cargo, value: [String(input.cargo)] });
      if (com) pares.push({ id: CF.comentario, value: com });
      if (pares.length) await campos(c.contact_id, pares);
      return { ok: true, anotado: true };
    }
    if (name === "marcar_resultado") {
      const res = String(input?.resultado || "");
      const tag = { qualificado: "raspagem-qualificado", sem_interesse: "raspagem-sem-interesse", fora_do_perfil: "raspagem-fora-do-perfil", contato_invalido: "raspagem-contato-invalido", optout: "raspagem-optout" }[res];
      if (!tag) return { erro: "resultado invalido" };
      await tagear(c.contact_id, [tag]);
      // optout: alem da tag, DND em todos os canais — o documento manda respeitar na hora.
      if (res === "optout") { try { await ghl("PUT", `/contacts/${c.contact_id}`, "2021-07-28", { dnd: true }); } catch { /* a tag ja barra o proximo envio */ } }
      await sb.from("raspagem_contato").update({ resultado: res, status: "encerrado", comentario: input?.motivo ? String(input.motivo).slice(0, 900) : c.comentario, atualizado: new Date().toISOString() }).eq("contact_id", c.contact_id);
      await sb.from("raspagem_evento").insert({ contact_id: c.contact_id, tipo: "tag", detalhe: { tag, resultado: res, motivo: input?.motivo || null } });
      return { ok: true, resultado: res, tag };
    }
    if (name === "passar_humano") {
      // Regiao Central SP e area da Modenuti: o documento manda avisar o Sebastiao em qualquer
      // resposta de la. Por isso a area vai no texto da tarefa, nao numa constante escondida.
      const central = /central/i.test(String(c.praca || ""));
      const det = [
        "Empresa: " + (c.empresa || "?"),
        c.cnpj ? "CNPJ: " + c.cnpj : "Sem CNPJ registrado",
        "Praca: " + [c.cidade, c.praca].filter(Boolean).join(" / "),
        "Canal: " + c.canal + (c.canal === "email" ? (" (" + c.email + ")") : (" (" + (c.fone_wpp || "") + ")")),
        "Pedido minimo da praca: " + brl(minimoDa(c.praca, cfg)) + " — frete CIF sem adicional",
        c.cargo ? "Cargo de quem respondeu: " + c.cargo : null,
        "",
        "Resumo da Nina: " + String(input?.resumo || "").slice(0, 700),
        "",
        central ? ("ATENCAO: Regiao Central SP, area da Modenuti — avisar o " + (cfg.raspagem_avisar_central || "Sebastiao") + " antes de qualquer contato.") : null,
        "Conversa: https://app.gohighlevel.com/v2/location/" + LOC + "/contacts/detail/" + c.contact_id,
      ].filter((x) => x !== null).join("\n");
      const { data: tf, error } = await sb.from("copiloto_tarefas").insert({
        area: "comercial", tipo: "raspagem-distribuidor",
        acao: ("Distribuidor respondeu (raspagem): " + (c.empresa || c.contact_id)).slice(0, 500),
        detalhe: det.slice(0, 1500), cliente_nome: c.empresa || null, contact_id: c.contact_id,
        origem: "nina-raspagem", prioridade: central ? 1 : 2,
      }).select("id").maybeSingle();
      if (error) return { erro: error.message };
      await sb.from("raspagem_contato").update({ tarefa_id: tf?.id || null, passado_em: new Date().toISOString(), atualizado: new Date().toISOString() }).eq("contact_id", c.contact_id);
      await sb.from("raspagem_evento").insert({ contact_id: c.contact_id, tipo: "passagem", detalhe: { tarefa: tf?.id, central } });
      return { ok: true, protocolo: tf?.id, aviso: "tarefa aberta. Diga a ele que o comercial envia a tabela; NAO prometa preco, prazo nem desconto." };
    }
    return { erro: "ferramenta desconhecida: " + name };
  } catch (e) { return { erro: String(e) }; }
}

// ---- o roteiro do documento, secao 6 ----------------------------------------------------------
function prompt(c: any, cfg: Record<string, string>): string {
  return `Voce e a Nina, do time comercial da Nitronplast (Nitron). Fala por ${c.canal === "email" ? "e-mail" : "WhatsApp"}, natural e direta, frases curtas, sem textao e sem emoji. Nao diga que e IA.

QUEM E ESTE CONTATO: uma DISTRIBUIDORA/ATACADISTA — nao e lojista. Compra em volume e revende para lojas, bazares e mercados da regiao. NAO use roteiro de loja ("sua loja esta preparada...").
Empresa: ${c.empresa}. Cidade: ${c.cidade}. Praca: ${c.praca || "nao informada"}.
${c.info_ai ? "O que sabemos dela: " + String(c.info_ai).slice(0, 700) : ""}

DE ONDE VEIO: cadastro publico de CNPJ da Receita Federal. NUNCA falou com a Nitron — e contato frio, e quem atende pode ser do administrativo, nao o comprador. Se perguntarem de onde veio o contato, responda com transparencia: "encontramos a empresa no cadastro publico de CNPJ como distribuidora de utilidades da regiao".

OBJETIVO: descobrir se e distribuidor de verdade, quem e o comprador, e se topam receber a tabela de distribuidor. A meta e a CONVERSA QUALIFICADA, nao fechar pedido.

PERGUNTE UMA DE CADA VEZ, sem interrogatorio: (1) distribuem utilidades domesticas para lojas e mercados da regiao? (2) quais marcas trabalham hoje nessa linha? (3) quais cidades atendem? (4) quem decide as compras, nome e cargo? (5) qual o melhor contato direto dessa pessoa?

PODE FALAR:
- A Nitron e FABRICANTE de potes, organizadores, lixeiras, linha cozinha, banheiro e frasqueiras.
- Frete CIF SEM ADICIONAL para a cidade dele, com pedido minimo de ${brl(minimoDa(c.praca, cfg))}.
- Existe tabela especifica para distribuidor, que o time comercial envia.

NAO PODE, em hipotese nenhuma:
- Informar preco, desconto, prazo de pagamento ou prazo de entrega — diga que o comercial envia junto com a tabela.
- Prometer exclusividade de regiao.
- Citar outros clientes da Nitron pelo nome.
- Insistir depois de um "nao".

RESPOSTAS PRONTAS:
- "Ja temos fornecedor." -> "Entendo! Muitas distribuidoras trabalham com mais de uma marca para completar o mix. Posso te mandar a tabela so para comparar?"
- "Manda por e-mail." -> peca o e-mail do comprador, chame anotar e passe para o time com passar_humano.
- "Quanto custa?" -> "Os precos dependem do mix e do volume. Vou pedir para o nosso comercial te enviar a tabela de distribuidor. Qual o melhor contato para isso?"
- "Somos fabrica / nao somos distribuidor." -> agradeca, encerre e chame marcar_resultado com fora_do_perfil.
- "Sair" / "nao quero receber" -> confirme o descadastro, encerre e chame marcar_resultado com optout.

QUANDO PASSAR PARA UMA PESSOA (passar_humano): pedirem tabela, preco, catalogo ou condicao de pagamento; quiserem pedido ou cadastro; o comprador for identificado e topar receber contato; ou duvida que voce nao sabe responder.`;
}

// ---- rodada -----------------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!GHL) return j({ ok: false, erro: "sem GHL_TOKEN" }, 500);
    const sb = createClient(SUPA_URL, srvKey());
    const sp = new URL(req.url).searchParams;
    const b = await req.json().catch(() => ({} as any));
    const dry = sp.get("dry") === "1" || b.dry === true;
    const acao = String(sp.get("acao") || b.acao || "enviar").toLowerCase();

    const { data: cfgRows } = await sb.from("copiloto_config").select("*");
    const cfg: Record<string, string> = {}; (cfgRows || []).forEach((r: any) => cfg[r.chave] = r.valor);
    const ativo = String(cfg.raspagem_ativo || "nao").toLowerCase() === "sim";
    const toquesMax = Math.max(1, Math.min(3, parseInt(cfg.raspagem_toques_max || "3") || 3));
    const lote = Math.max(1, Math.min(10, parseInt(cfg.raspagem_lote || "5") || 5));
    const onda = String(cfg.raspagem_onda || "onda1");

    // ---- RELATORIO (secao 10) ----
    if (acao === "relatorio") {
      const { data } = await sb.from("raspagem_contato").select("canal, status, resultado, toques, em_espera, respondeu_em").eq("onda", onda);
      const rs = data || [];
      const conta = (f: (x: any) => boolean) => rs.filter(f).length;
      return j({ ok: true, onda, total: rs.length,
        enviados: { whatsapp: conta((x) => x.canal === "whatsapp" && x.toques > 0), email: conta((x) => x.canal === "email" && x.toques > 0) },
        em_espera: conta((x) => x.em_espera), tarefas_de_ligacao: conta((x) => x.canal === "ligacao"),
        responderam: conta((x) => !!x.respondeu_em),
        qualificados: conta((x) => x.resultado === "qualificado"), sem_interesse: conta((x) => x.resultado === "sem_interesse"),
        fora_do_perfil: conta((x) => x.resultado === "fora_do_perfil"), contato_invalido: conta((x) => x.resultado === "contato_invalido"),
        optout: conta((x) => x.resultado === "optout"), sem_resposta: conta((x) => x.resultado === "sem_resposta") });
    }

    // ---- TAREFAS DE LIGACAO: os que nao tem WhatsApp nem e-mail (secao 3) ----
    if (acao === "tarefas") {
      const { data } = await sb.from("raspagem_contato").select("*").eq("onda", onda).eq("canal", "ligacao").is("tarefa_id", null);
      const feitos: any[] = [];
      for (const c of (data || [])) {
        if (c.em_espera) { feitos.push({ empresa: c.empresa, pulou: "Regiao Central SP — espera liberacao" }); continue; }
        if (dry) { feitos.push({ empresa: c.empresa, abriria_tarefa: true, fone: c.fone_fixo }); continue; }
        const det = ["Empresa: " + c.empresa, c.cnpj ? "CNPJ: " + c.cnpj : null, "Praca: " + [c.cidade, c.praca].filter(Boolean).join(" / "),
          "Telefone (Receita): " + (c.fone_fixo || "nao informado"), "Sem WhatsApp e sem e-mail na Receita — por isso e ligacao, nao mensagem.",
          "Pedido minimo da praca: " + brl(minimoDa(c.praca, cfg)) + " — frete CIF sem adicional",
          c.info_ai ? ("\n" + String(c.info_ai).slice(0, 700)) : null].filter(Boolean).join("\n");
        const { data: tf } = await sb.from("copiloto_tarefas").insert({ area: "comercial", tipo: "raspagem-ligacao",
          acao: ("Ligar para distribuidora (raspagem): " + c.empresa).slice(0, 500), detalhe: det.slice(0, 1500),
          cliente_nome: c.empresa, contact_id: c.contact_id, origem: "nina-raspagem", prioridade: 2 }).select("id").maybeSingle();
        await sb.from("raspagem_contato").update({ tarefa_id: tf?.id || null, atualizado: new Date().toISOString() }).eq("contact_id", c.contact_id);
        feitos.push({ empresa: c.empresa, tarefa: tf?.id });
      }
      return j({ ok: true, acao: "tarefas", dry, total: feitos.length, resultado: feitos });
    }

    // ---- RESPOSTAS (secao 6) ----
    if (acao === "responder") {
      const { data } = await sb.from("raspagem_contato").select("*").eq("onda", onda)
        .in("status", ["enviado", "respondeu"]).is("resultado", null).limit(lote);
      const feitos: any[] = [];
      for (const c of (data || [])) {
        const rc = await ghl("GET", `/conversations/search?locationId=${LOC}&contactId=${c.contact_id}&limit=1`);
        if (!rc.ok) { feitos.push({ empresa: c.empresa, erro: "GHL " + rc.status }); continue; }
        const cv = (((await rc.json().catch(() => ({})))?.conversations) || [])[0];
        if (!cv || String(cv.lastMessageDirection) !== "inbound") { feitos.push({ empresa: c.empresa, decisao: "sem resposta nova" }); continue; }
        const rm = await ghl("GET", `/conversations/${cv.id}/messages?limit=20`, "2021-04-15");
        if (!rm.ok) { feitos.push({ empresa: c.empresa, erro: "GHL " + rm.status + " nas mensagens" }); continue; }
        const arr = (((await rm.json().catch(() => ({})))?.messages?.messages) || []) as any[];
        const msgs = arr.slice().reverse().filter((m: any) => String(m?.body || "").trim() && !/^#contact_instance|^\[System\]/i.test(String(m.body)));
        const ultima = msgs[msgs.length - 1];
        if (!ultima || ultima.direction !== "inbound") { feitos.push({ empresa: c.empresa, decisao: "a ultima e nossa" }); continue; }
        if (c.ultima_msg_id === ultima.id) { feitos.push({ empresa: c.empresa, decisao: "ja respondi esta" }); continue; }

        const sys = prompt(c, cfg);
        const messages: any[] = [{ role: "user", content: msgs.map((m: any) => (m.direction === "inbound" ? "CONTATO: " : "VOCE (Nitron): ") + limpa(m.body).slice(0, 500)).join("\n") + "\n\n(Responda so a proxima mensagem sua, sem prefixo.)" }];
        let reply = ""; const usadas: string[] = [];
        for (let i = 0; i < 5; i++) {
          const resp = await anthropic(sys, messages, TOOLS);
          const bl = resp.content || []; messages.push({ role: "assistant", content: bl });
          const tus = bl.filter((x: any) => x.type === "tool_use");
          if (resp.stop_reason !== "tool_use" || !tus.length) { reply = bl.filter((x: any) => x.type === "text").map((x: any) => x.text).join("\n").trim(); break; }
          const rs: any[] = [];
          for (const tu of tus) { usadas.push(tu.name); const out = dry ? { ok: true, previa: true } : await runTool(sb, c, cfg, tu.name, tu.input); rs.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out).slice(0, 4000) }); }
          messages.push({ role: "user", content: rs });
        }
        if (!reply) { feitos.push({ empresa: c.empresa, erro: "o modelo nao devolveu texto" }); continue; }
        if (dry || !ativo) { feitos.push({ empresa: c.empresa, decisao: "previa", recebido: limpa(ultima.body).slice(0, 160), ferramentas: usadas, rascunho: reply }); continue; }
        // a resposta PARA a regua: o documento manda parar a sequencia assim que houver resposta
        await tagear(c.contact_id, ["raspagem-respondeu"]);
        const env = c.canal === "email"
          ? await enviar(c, cfg, reply, "Re: " + `Nitron: condição para distribuidores em ${c.cidade}`)
          : await enviar(c, cfg, reply);
        await sb.from("raspagem_contato").update({ status: "respondeu", respondeu_em: new Date().toISOString(), ultima_msg_id: ultima.id, proximo_em: null, erro: env?.ok ? null : String(env?.motivo || "").slice(0, 300), erro_em: env?.ok ? null : new Date().toISOString(), atualizado: new Date().toISOString() }).eq("contact_id", c.contact_id);
        await sb.from("raspagem_evento").insert({ contact_id: c.contact_id, tipo: env?.ok ? "resposta" : "erro", canal: c.canal, texto: reply.slice(0, 2000), detalhe: { recebido: limpa(ultima.body).slice(0, 500), ferramentas: usadas, envio: env?.ok ? "ok" : (env?.motivo || null) } });
        feitos.push({ empresa: c.empresa, decisao: env?.ok ? "respondeu" : "falhou", motivo: env?.ok ? undefined : env?.motivo, ferramentas: usadas, texto: reply });
      }
      return j({ ok: true, acao: "responder", dry, ativo, analisados: feitos.length, resultado: feitos });
    }

    // ---- ENVIO: dia 0, dia 3 util, dia 7 util (secoes 3, 4 e 5) ----
    const assinatura = String(cfg.raspagem_assinatura_fone || "").trim();
    const agora = new Date();
    const { data: fila } = await sb.from("raspagem_contato").select("*").eq("onda", onda)
      .eq("em_espera", false).in("canal", ["whatsapp", "email"]).is("resultado", null)
      .in("status", ["novo", "enviado"]).lt("toques", toquesMax)
      .order("toques", { ascending: true }).order("criado", { ascending: true }).limit(60);

    const janelaOk = naJanela(cfg);
    const feitos: any[] = [];
    let mandados = 0;
    for (const c of (fila || [])) {
      if (mandados >= lote) break;
      const base = { empresa: c.empresa, cidade: c.cidade, canal: c.canal };
      if (c.toques > 0 && (!c.proximo_em || new Date(c.proximo_em) > agora)) { feitos.push({ ...base, decisao: "ainda cedo", proximo_em: c.proximo_em }); continue; }
      if (!janelaOk) { feitos.push({ ...base, decisao: "fora da janela (dia util, 9h-17h de Brasilia)" }); continue; }
      // o placeholder "[WhatsApp comercial]" do documento nao pode ir para 17 empresas
      if (c.canal === "email" && !assinatura) { feitos.push({ ...base, decisao: "bloqueado", motivo: "copiloto_config.raspagem_assinatura_fone esta vazia — o e-mail sairia sem telefone na assinatura" }); continue; }
      const toque = Number(c.toques || 0) + 1;
      const corpo = toque === 1
        ? (c.canal === "email" ? txtEmail(c, cfg) : { assunto: undefined as any, texto: txtWpp(c) })
        : { assunto: c.canal === "email" ? ("Re: " + `Nitron: condição para distribuidores em ${c.cidade}`) : undefined as any, texto: txtSeguimento(c, toque) };
      if (dry || !ativo) { feitos.push({ ...base, decisao: "previa", toque, assunto: corpo.assunto, texto: corpo.texto, minimo: brl(minimoDa(c.praca, cfg)) }); mandados++; continue; }
      const env = await enviar(c, cfg, corpo.texto, corpo.assunto);
      const prox = toque >= toquesMax ? null : somaDiasUteis(new Date(), toque === 1 ? (parseInt(cfg.raspagem_dia_2 || "3") || 3) : (parseInt(cfg.raspagem_dia_3 || "7") || 7) - (parseInt(cfg.raspagem_dia_2 || "3") || 3));
      if (!env?.ok) {
        await sb.from("raspagem_contato").update({ erro: String(env?.motivo || "envio recusado").slice(0, 300), erro_em: new Date().toISOString(), atualizado: new Date().toISOString() }).eq("contact_id", c.contact_id);
        await sb.from("raspagem_evento").insert({ contact_id: c.contact_id, tipo: "erro", toque, canal: c.canal, detalhe: { motivo: env?.motivo || null } });
        feitos.push({ ...base, decisao: "falhou", toque, motivo: env?.motivo }); continue;
      }
      await sb.from("raspagem_contato").update({ toques: toque, status: "enviado", ultimo_toque_em: new Date().toISOString(), proximo_em: prox ? prox.toISOString() : null, erro: null, erro_em: null, atualizado: new Date().toISOString() }).eq("contact_id", c.contact_id);
      await sb.from("raspagem_evento").insert({ contact_id: c.contact_id, tipo: "envio", toque, canal: c.canal, assunto: corpo.assunto || null, texto: corpo.texto.slice(0, 2000) });
      feitos.push({ ...base, decisao: "enviou", toque, proximo_em: prox ? prox.toISOString() : "ultimo toque" });
      mandados++;
    }
    // quem estourou os 3 toques e continuou calado vira sem_resposta + tarefa de ligacao (secao 5)
    let esfriados = 0;
    if (!dry && ativo) {
      const { data: calados } = await sb.from("raspagem_contato").select("contact_id, empresa").eq("onda", onda)
        .gte("toques", toquesMax).is("resultado", null).is("respondeu_em", null);
      for (const v of (calados || [])) {
        await tagear(v.contact_id, ["raspagem-sem-resposta"]);
        await sb.from("raspagem_contato").update({ resultado: "sem_resposta", status: "encerrado", atualizado: new Date().toISOString() }).eq("contact_id", v.contact_id);
        esfriados++;
      }
    }
    const conta = (k: string) => feitos.filter((x) => x.decisao === k).length;
    return j({ ok: true, acao: "enviar", dry, ativo, onda, janela_ok: janelaOk,
      assinatura_fone: assinatura || "(VAZIA — e-mail bloqueado)",
      candidatos: (fila || []).length, enviou: conta("enviou"), previa: conta("previa"),
      ainda_cedo: conta("ainda cedo"), bloqueado: conta("bloqueado"), falhou: conta("falhou"),
      sem_resposta_encerrados: esfriados, resultado: feitos });
  } catch (e) { return j({ ok: false, erro: String(e) }, 500); }
});
