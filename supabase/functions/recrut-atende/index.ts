// recrut-atende (v18, 27/11/2026) — a IA que AQUECE os candidatos a representante.
// v18: A CARTEIRA DELE VIRA REGRA, NAO SO INFORMACAO. Ordem do gestor em 27/11: antes de passar
//     para a Camyla o candidato tem de mandar a lista de clientes dele, ela e cruzada com o
//     Sankhya, e "se mais de 70% da carteira estiver ativa, o lead nao esta qualificado".
//     Ferramenta nova avaliar_carteira (RPC recrut_carteira_aval) e TRAVA no passar_camyla: com
//     motivo "quente" ele so passa se o veredito for qualificado. A trava mora na FERRAMENTA, nao
//     no prompt — texto no prompt o modelo pondera, recusa de ferramenta ele nao contorna.
//     Os outros motivos (nao_sei_responder, pediu_condicoes, grande_conta, conversa_tensa,
//     limite_turnos) continuam passando: sao a saida para um humano e travar isso seria pior.
//     Quando a entrega acontece sem carteira avaliada, o aviso a Camyla DIZ isso.
//     MAX_TURNOS foi de 8 para 10 para o passo novo caber antes do limite.
//     Chaves: recrut_carteira_trava (sim), recrut_carteira_pct (70), recrut_carteira_min (5),
//     recrut_carteira_dias (365) — afrouxar e UPDATE, sem deploy.
//     POR QUE NAO REUSAR O recrut_conflito: ele diz "JA E CLIENTE NITRON" casando PEDACO de nome,
//     sem olhar UF nem atividade. Medido no MAGA DECOR/SC: "Koch" casou com BARBOSA & KOCHEN LTDA,
//     do PR, que nao compra ha 445 dias. Como regua de desqualificacao isso seria ruido.
// v5: NOMES DE PARCEIROS. O Cleysson (MT) citou o "Goiandi" e a v4 disse que o nome "nao aparece aqui" —
//     falso: o GOIANDY e rep ativo em MT. A checagem tinha recebido "Mato Grosso" como cidade e voltou vazia.
//     Agora recrut_conflito tambem le o ESTADO inteiro (reps_ativos_no_estado) e a IA nunca confirma nem
//     nega nome de rep/parceiro, nem diz que a praca esta livre quando o estado ja tem reps nossos.
// v4: AUDIO OU ANEXO VAI PARA A CAMYLA. O Renato respondeu com um audio (corpo "ptt") e a v3 ia
//     responder sem ouvir. Agora, se a ultima mensagem dele e so midia, a IA nao escreve nada: entrega
//     para a Camyla (motivo nao_sei_responder) com o aviso de que ha um audio para ouvir.
// v3: as mensagens de ATIVIDADE que o GHL escreve na conversa (card criado, etapa mudada, tag) NAO
//     contam como pessoa da casa. Ligacao (TYPE_CALL) continua contando: se a Camyla ligou, e dela.
// v2: se o candidato pergunta se a Nitron ja atende um cliente especifico, a IA checa no Sankhya
//     (recrut_conflito, com a UF do cadastro) e RESPONDE direto, em vez de devolver outra pergunta.
// Ordem do Ricardo: "voce ira aquecer os representantes e quando estiver quente ou nao souber
// responder ira enviar para a Camyla". Roteiro = skill recrutamento-representantes: leve e
// progressivo, uma pergunta por vez -> regiao -> linhas e tipo de cliente -> 10 clientes ->
// checagem de conflito (recrut_conflito) antes de qualquer promessa. Nunca promete comissao,
// praca, exclusividade, preco nem stock.
// TRAVAS: (1) se uma PESSOA ja escreveu ou ligou (saida que nao e o convite nem texto desta IA nem
// atividade do GHL), a conversa e dela: status com_camyla e a IA nao fala mais. (2) so responde se
// a ultima mensagem e do candidato e ainda nao foi respondida. (3) espera 2 min depois da ultima
// mensagem dele (rajada). (4) no maximo 10 turnos; depois entrega. Chave geral:
// copiloto_config.recrut_ia_ativa = 'nao' desliga (a previa continua).
// ?dry=1 devolve os rascunhos sem mandar nem gravar. ?id=N so aquele candidato.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GHL = (Deno.env.get("GHL_TOKEN") || "").trim();
const LOC = "rZ8y7lzqV7fzxsartaX2";
const MODELO = "claude-sonnet-5";
const MAX_TURNOS = 10;
const ESPERA_MIN = 2;
const ghl = (p: string, v = "2021-07-28") => fetch("https://services.leadconnectorhq.com" + p, { headers: { Authorization: "Bearer " + GHL, Version: v, Accept: "application/json" } });
const digits = (s: any) => String(s || "").replace(/\D/g, "");
const e164 = (f: string) => { const d = digits(f); return d.length <= 11 ? "+55" + d : "+" + d; };
const limpa = (t: any) => String(t || "").replace(/Instance Source:.*/is, "").replace(/#contact_instance:\S+/gi, "").replace(/\s+/g, " ").trim();
const ehSistema = (t: string) => !t || /^\[System\]/i.test(t) || /contact instance updated|instance is disconnected/i.test(t);
const ehAtividade = (m: any) => /ACTIVITY/i.test(String(m?.messageType || "")) || String(m?.type || "") === "TYPE_ACTIVITY";
const ehLigacao = (m: any) => /CALL/i.test(String(m?.messageType || ""));
// so midia: audio (ptt), imagem, video, documento, figurinha — sem texto que a IA possa ler
const ehMidia = (m: any) => { const t = limpa(m?.body).toLowerCase(); return /^(ptt|audio|image|imagem|video|document|documento|sticker|figurinha|arquivo|\[?(audio|imagem|video|arquivo)\]?)$/.test(t) || (!t && Array.isArray(m?.attachments) && m.attachments.length > 0); };
const cmp = (t: string) => limpa(t).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 120);
const foneFmt = (f: string) => { let d = digits(f); if (d.startsWith("55") && d.length >= 12) d = d.slice(2); return d.length === 11 ? "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7) : d; };
const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

async function acharContato(fone: string): Promise<string | null> {
  const d = digits(fone);
  for (const q of [e164(fone), d, d.slice(-11), d.slice(-9)]) {
    try {
      const r = await ghl(`/contacts/?locationId=${LOC}&query=${encodeURIComponent(q)}&limit=3`);
      if (!r.ok) continue;
      const c = (((await r.json())?.contacts || []) as any[]).find((x: any) => digits(x.phone).slice(-8) === d.slice(-8));
      if (c?.id) return c.id;
    } catch (_e) { /* proxima forma */ }
  }
  return null;
}

async function anthropic(system: string, messages: any[], tools: any[]): Promise<any> {
  const key = Deno.env.get("ANTHROPIC_API_KEY"); if (!key) throw new Error("sem ANTHROPIC_API_KEY");
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: MODELO, max_tokens: 1200, system, tools, messages }) });
  if (!r.ok) throw new Error("anthropic " + r.status + " " + (await r.text()).slice(0, 300));
  return await r.json();
}

const TOOLS = [
  { name: "checar_conflito", description: "Checa no Sankhya se a praca e os clientes do candidato ja sao atendidos por representante ou distribuidor da Nitron. Use ASSIM QUE tiver a UF e as cidades, de novo quando ele mandar os clientes, e SEMPRE que ele perguntar se a Nitron ja atende um cliente especifico (use a UF do cadastro se ele ainda nao disse). Em cidades passe NOMES DE CIDADES (nunca o nome do estado); se ele disse que atende o estado todo, mande cidades vazias e leia reps_ativos_no_estado. Nunca prometa praca ou cliente sem ter rodado isto.", input_schema: { type: "object", properties: { uf: { type: "string", description: "sigla da UF (2 letras)" }, cidades: { type: "array", items: { type: "string" } }, clientes: { type: "array", items: { type: "string" }, description: "nomes (ou CNPJ) dos clientes que ele citou" } }, required: ["uf"] } },
  { name: "avaliar_carteira", description: "OBRIGATORIO antes de entregar o candidato para a Camyla como quente. Cruza a lista de clientes que ELE mandou com a base de clientes da Nitron no Sankhya e devolve quanto da carteira dele a gente ja atende hoje, mais o veredito. Passe a UF dele e os nomes (ou CNPJ) exatamente como ele escreveu, um por item. Se ele mandou poucos nomes o retorno vai pedir mais: peca e rode de novo. Rode tambem quando ele acrescentar clientes depois.", input_schema: { type: "object", properties: { uf: { type: "string", description: "sigla da UF (2 letras) da praca dele" }, clientes: { type: "array", items: { type: "string" }, description: "os clientes da carteira dele, como ele escreveu" } }, required: ["uf", "clientes"] } },
  { name: "salvar_ficha", description: "Anota o que voce JA apurou do candidato. Chame sempre que ele trouxer um dado novo. So o que ele disse, sem deduzir.", input_schema: { type: "object", properties: { regiao: { type: "string" }, uf: { type: "string" }, cidades: { type: "array", items: { type: "string" } }, linhas_que_leva: { type: "string" }, tipos_de_cliente: { type: "string", description: "supermercado, atacarejo, distribuidor, loja de utilidades, bazar..." }, clientes_relevantes: { type: "array", items: { type: "string" } }, vendedores_na_equipe: { type: "string" }, concorrente_direto: { type: "string" }, exclusividade: { type: "string" }, interesse: { type: "string", enum: ["alto", "medio", "baixo", "nao_sei"] }, resumo: { type: "string", description: "2 a 3 frases do caso, para a Camyla ler" } }, required: [] } },
  { name: "passar_camyla", description: "Entrega o candidato para a Camyla (pessoa do comercial). Use quando: (a) ele esta QUENTE — interesse claro, regiao e segmento aderentes, clientes checados e carteira ja avaliada por avaliar_carteira; (b) ele pede comissao/condicoes pela segunda vez, quer ligacao ou reuniao; (c) voce NAO SABE responder algo; (d) ele atende rede nacional ou grande conta; (e) a conversa ficou tensa; (f) ele insiste sobre um representante ou parceiro nosso na regiao dele. Com motivo quente a entrega e RECUSADA enquanto avaliar_carteira nao tiver dado qualificado. Depois disto voce manda so uma mensagem curta dizendo que a Camyla, do comercial, continua com ele.", input_schema: { type: "object", properties: { motivo: { type: "string", enum: ["quente", "nao_sei_responder", "pediu_condicoes", "grande_conta", "conversa_tensa", "limite_turnos"] }, resumo: { type: "string", description: "o caso em 2 a 4 frases: quem e, regiao, segmento, clientes, resultado da checagem, o que ele quer" }, temperatura: { type: "string", enum: ["quente", "morno", "frio"] } }, required: ["motivo", "resumo"] } },
  { name: "encerrar", description: "Encerra com gentileza: exclusividade com concorrente direto, segmento sem nada a ver, sem interesse, ou a carteira dele ja ser quase toda atendida pela Nitron (carteira_ja_atendida, quando avaliar_carteira devolveu nao_qualificado). Se ele pediu para nao ser contactado, use motivo nao_contatar.", input_schema: { type: "object", properties: { motivo: { type: "string", enum: ["exclusividade", "segmento", "sem_interesse", "praca_ocupada", "carteira_ja_atendida", "nao_contatar"] } }, required: ["motivo"] } },
];

function resumirConflito(r: any) {
  if (!r || typeof r !== "object") return r;
  return {
    uf: r.uf, leitura_praca: r.leitura_praca,
    reps_da_casa_nas_cidades: (r.praca_reps_ativos || []).slice(0, 10).map((x: any) => ({ cidade: x.cidade, clientes_ativos: x.clientes_ativos })),
    reps_da_casa_ativos_no_estado: (r.reps_ativos_no_estado || []).length,
    clientes_do_candidato: (r.clientes_do_candidato || []).map((x: any) => ({ cliente: x.pedido, situacao: x.situacao, onde: (x.achados || []).slice(0, 2).map((a: any) => a.razao + " / " + a.cidade) })),
    distribuidores_nossos_na_regiao: (r.distribuidores_e_redes || []).filter((x: any) => x.na_praca).slice(0, 6).map((x: any) => x.cliente + " (" + x.cidade + ")"),
    regra: "NAO revele nome de representante nem valores, e NUNCA confirme nem negue um nome de rep que ele citar. Pode dizer que um cliente ja e atendido pela Nitron e que naquela praca/estado ja temos parceiros, e por isso a conversa e sobre o que ele soma sem cruzar com eles. Se reps_da_casa_ativos_no_estado > 0, NUNCA diga ou insinue que a regiao esta livre.",
  };
}

// o que a IA pode ler do resultado da carteira — sem os achados linha a linha, que nao servem a ela
function resumirCarteira(r: any) {
  if (!r || typeof r !== "object") return r;
  const regra = r.veredito === "nao_qualificado"
    ? "NAO entregue para a Camyla. Encerre com gentileza por encerrar, motivo carteira_ja_atendida: agradeca, diga que neste momento a carteira dele se sobrepoe demais a quem a Nitron ja atende na regiao, e que voce guarda o contato para quando abrir frente nova. NAO diga percentual, NAO diga quantos clientes dele sao nossos, NAO leia a lista de volta e NAO diga que ele foi reprovado por um sistema."
    : r.veredito === "lista_curta"
    ? "Ainda nao da para concluir. Peca mais alguns clientes relevantes (nome e cidade), com naturalidade, e rode avaliar_carteira de novo. Nao diga que a lista e curta demais nem fale em minimo."
    : "Pode seguir o caminho normal. NAO diga percentual nem quantos clientes dele ja sao nossos.";
  return { veredito: r.veredito, leitura_interna: r.leitura, total_na_lista: r.total_na_lista, ja_sao_nossos_e_ativos: r.ativos, regra };
}

const SISTEMA = (c: any, ficha: any, hoje: string) => `Voce e a Nina, do time comercial da Nitronplast (Nitron), fabrica nacional de utilidades domesticas em plastico (organizadores e caixas, linha rattan, Kit NitronBox, potes hermeticos e modulares, lixeiras com pedal, frasqueiras de medicamento, cozinha, limpeza e banheiro). Voce conversa por WhatsApp com um CANDIDATO A REPRESENTANTE COMERCIAL que respondeu ao nosso convite. Ele NAO e cliente: nao venda produto, nao fale de preco nem de pedido.

HOJE e ${hoje}.

SEU PAPEL: aquecer o candidato e entender se ele soma a Nitron SEM cruzar com representantes ou distribuidores que ja trabalham com a gente. Estamos abrindo novas frentes de vendedores no Brasil todo, mas nunca invadindo regiao ou cliente de quem ja e parceiro.

ESTILO: pessoa de verdade, WhatsApp, frases curtas e calorosas, sem listas, sem negrito, emoji quase nunca. Responda primeiro o que ele perguntou, em uma ou duas frases, e depois faca UMA pergunta (no maximo duas curtas). Nunca despeje informacao. Trate pelo primeiro nome quando souber. Nao diga que e IA.

PERGUNTA DIRETA TEM RESPOSTA DIRETA: se ele perguntar se a Nitron ja atende um cliente especifico ("voces ja atendem a X?"), rode checar_conflito ANTES de responder, com a UF dele (use a do cadastro abaixo se ele nao disse) e o nome do cliente, e responda com clareza: se ja e cliente nosso, diga que sim, que a X ja e parceira da Nitron; se nao aparece, diga que hoje nao atendemos. Nunca desvie da pergunta. So depois puxe o proximo passo do caminho.

NOMES DE REPRESENTANTES E PARCEIROS: se ele citar o nome de alguem que seria nosso representante ou parceiro, NUNCA confirme nem negue, e nunca diga que o nome "nao aparece" ou que e confusao. Diga com naturalidade que temos parceiros em varias regioes, que voce nao comenta sobre parceiros especificos, e que justamente por isso quer entender a regiao e os clientes dele, para ele somar sem cruzar com ninguem. Se ele insistir no assunto, use passar_camyla (nao_sei_responder).

CAMINHO, um passo por vez e so quando o anterior foi respondido:
1) REGIAO: quais cidades/regiao ele atende hoje.
2) SEGMENTO: que linhas leva e para que tipo de cliente vende (supermercado, atacarejo, distribuidor, loja de utilidades, bazar). Entenda se ele tem interesse REAL no nosso segmento. Se leva concorrente direto em plastico (Plasutil, Sanremo, Jaguar, Paramount, Coza, Arqplast, Martiplast), pergunte com tato se tem exclusividade.
3) CLIENTES — ESTE PASSO E OBRIGATORIO e nao se pula: peca os 10 clientes mais relevantes da carteira dele (nome e cidade), explicando o motivo de verdade, que e bom para ele: e para ver onde ele SOMA sem bater com parceiros nossos, o que protege a carteira dele tambem. Se ele enrolar ou mandar poucos, insista com leveza uma vez, pedindo mais alguns nomes. Sem essa lista voce nao consegue seguir com ele.
4) CHECAGEM DE PRACA: rode checar_conflito assim que tiver UF e cidades, e de novo com os clientes. Em cidades passe nomes de cidades, nunca o nome do estado. Se um cliente dele ja e atendido pela Nitron, diga com naturalidade que esse ja e parceiro nosso e siga para os outros. NUNCA cite o nome do nosso representante nem valores. Se o estado ja tem reps nossos, nunca diga que a regiao esta livre.
5) AVALIACAO DA CARTEIRA: com a lista na mao, rode avaliar_carteira com a UF dele e os nomes como ele escreveu. O retorno manda no que vem depois, e voce segue o campo regra dele ao pe da letra. Enquanto isso nao for feito, voce NAO entrega o candidato para a Camyla como quente — a ferramenta recusa.
Se ele trouxer um dado, chame salvar_ficha.

O QUE VOCE NUNCA FAZ: prometer ou dizer comissao, percentual, prazo de pagamento, praca, exclusividade, preco, stock ou prazo de entrega. Nunca diga a ele quanto da carteira dele a Nitron ja atende, nem em numero nem em porcentagem, e nunca diga que ele foi avaliado ou reprovado por um sistema. Se ele perguntar comissao ou condicoes: diga que as condicoes sao apresentadas pelo nosso gestor comercial, e que antes voce quer entender a regiao e os clientes dele para a proposta ja vir certa. Se ele insistir uma segunda vez, use passar_camyla (pediu_condicoes).

QUANDO PASSAR PARA A CAMYLA (passar_camyla): ele esta quente (interesse claro + regiao/segmento aderentes + clientes checados + avaliar_carteira com veredito qualificado); pediu condicoes pela segunda vez; quer ligacao ou reuniao; voce nao sabe responder; ele atende rede nacional ou grande conta; a conversa ficou tensa; ele insiste sobre um representante nosso. Depois de passar, sua mensagem e so uma frase dizendo que a Camyla, do nosso comercial, vai continuar com ele por aqui.
QUANDO ENCERRAR (encerrar): exclusividade com concorrente, segmento sem nada a ver, sem interesse, carteira dele ja quase toda atendida pela Nitron (carteira_ja_atendida), ou pediu para nao ser contactado. Agradeca e encerre com gentileza, sem insistir e sem dar o motivo tecnico.

O CANDIDATO (da nossa base de prospeccao): ${c.empresa || "-"}${c.nome && c.nome !== c.empresa ? " / " + c.nome : ""}${c.cidade || c.uf ? " / " + [c.cidade, c.uf].filter(Boolean).join("-") : ""}.
JA APURADO (nao pergunte de novo): ${Object.keys(ficha || {}).length ? JSON.stringify(ficha) : "nada ainda"}.`;

async function enviar(contact_id: string, fone: string, texto: string) {
  const r = await fetch(SUPA_URL + "/functions/v1/campanhas-enviar", { method: "POST", headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" }, body: JSON.stringify({ canal: "whatsapp", texto, instancia: "Nina", contact_id, fone }) });
  return await r.json().catch(() => ({ ok: false, motivo: "resposta ilegivel do campanhas-enviar" }));
}

const MOTIVO_TXT: Record<string, string> = { quente: "ESTA QUENTE", nao_sei_responder: "perguntou algo que eu nao soube responder", pediu_condicoes: "quer saber das condicoes/comissao", grande_conta: "atende grande conta ou rede nacional", conversa_tensa: "a conversa precisa de uma pessoa", limite_turnos: "ja conversamos bastante, precisa de uma pessoa", midia: "mandou um AUDIO ou anexo que eu nao consigo ouvir" };

Deno.serve(async (req) => {
  try {
    if (!GHL) return j({ ok: false, erro: "sem GHL_TOKEN" }, 500);
    const sb = createClient(SUPA_URL, srvKey());
    const sp = new URL(req.url).searchParams;
    const dry = sp.get("dry") === "1";
    const so = sp.get("id");
    const { data: cfgRows } = await sb.from("copiloto_config").select("chave,valor").in("chave", ["recrut_aviso_fone", "recrut_aviso_nome", "recrut_aviso_inst", "recrut_ia_ativa", "recrut_carteira_trava", "recrut_carteira_pct", "recrut_carteira_min", "recrut_carteira_dias"]);
    const cfg: Record<string, string> = {}; (cfgRows || []).forEach((r: any) => cfg[r.chave] = r.valor);
    if (String(cfg.recrut_ia_ativa || "sim").toLowerCase() === "nao" && !dry) return j({ ok: true, desligada: "recrut_ia_ativa=nao" });
    const avisoFone = digits(cfg.recrut_aviso_fone || ""); const avisoNome = cfg.recrut_aviso_nome || "Camyla"; const avisoInst = cfg.recrut_aviso_inst || "Nina";
    const cartTrava = String(cfg.recrut_carteira_trava || "sim").toLowerCase() !== "nao";
    const cartPct = Number(cfg.recrut_carteira_pct || 70) || 70;
    const cartMin = Number(cfg.recrut_carteira_min || 5) || 5;
    const cartDias = Number(cfg.recrut_carteira_dias || 365) || 365;
    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10).split("-").reverse().join("/");
    const avisar = async (c: any, cvId: string, motivo: string, resumo: string, temperatura: string | null, ficha: any) => {
      if (!avisoFone) return;
      const link = "https://app.gohighlevel.com/v2/location/" + LOC + "/conversations/conversations/" + cvId;
      const cart = ficha?.carteira;
      const linhaCart = cart
        ? "Carteira dele: " + (cart.leitura || "") + "\n\n"
        : "Carteira dele: NAO AVALIADA — ele ainda nao mandou a lista de clientes. Vale pedir antes de abrir condicoes.\n\n";
      const aviso = "🔥 Recrutamento: " + (c.empresa || c.nome) + " — " + (MOTIVO_TXT[motivo] || motivo) + ".\n"
        + "WhatsApp: " + foneFmt(c.fone) + (temperatura ? " · " + temperatura : "") + "\n\n"
        + "Resumo: " + String(resumo || "").slice(0, 700) + "\n\n"
        + linhaCart
        + (ficha?.checagem ? "Checagem: " + (ficha.checagem.leitura || "") + (ficha.checagem.ja_clientes?.length ? " · ja sao nossos: " + ficha.checagem.ja_clientes.join(", ") : "") + "\n\n" : "")
        + "A Nina parou de responder: a conversa e sua, na conversa da Nina no GHL:\n" + link;
      await sb.from("fila_envio").insert({ canal: "whatsapp", status: "pendente", instancia: avisoInst, campanha: "recrutamento_aviso", publico: "interno", empresa: "nitron", fone: avisoFone, nome: avisoNome, corpo: aviso, criado_em: new Date().toISOString() });
    };

    let q = sb.from("recrut_candidato").select("*").in("status", ["enviado", "respondeu", "conversando"]).order("vigia_em", { ascending: true, nullsFirst: true }).limit(25);
    if (so) q = sb.from("recrut_candidato").select("*").eq("id", Number(so));
    const { data: cands, error } = await q;
    if (error) throw error;
    const feitos: any[] = [];
    for (const c of (cands || [])) {
      const base = { id: c.id, quem: c.empresa || c.nome };
      const marca = async (patch: any) => { if (!dry) await sb.from("recrut_candidato").update({ ...patch, vigia_em: new Date().toISOString(), atualizado_em: new Date().toISOString() }).eq("id", c.id); };
      try {
        let cid = c.contact_id as string | null;
        if (!cid) { cid = await acharContato(c.fone); if (!cid) { feitos.push({ ...base, decisao: "sem_contato" }); await marca({}); continue; } await marca({ contact_id: cid }); }
        const rc = await ghl(`/conversations/search?locationId=${LOC}&contactId=${cid}&limit=1`);
        const cv = rc.ok ? ((((await rc.json().catch(() => ({})))?.conversations) || [])[0]) : null;
        if (!cv) { feitos.push({ ...base, decisao: "sem_conversa" }); await marca({}); continue; }
        let conviteMs = 0; let conviteTxt = "";
        if (c.fila_id) { const { data: f } = await sb.from("fila_envio").select("enviado_em, corpo, mensagem").eq("id", c.fila_id).maybeSingle(); if (f?.enviado_em) conviteMs = new Date(f.enviado_em).getTime(); conviteTxt = f?.corpo || f?.mensagem || ""; }
        const rm = await ghl(`/conversations/${cv.id}/messages?limit=40`, "2021-04-15");
        if (!rm.ok) { feitos.push({ ...base, decisao: "erro", motivo: "GHL " + rm.status }); continue; }
        const todas = ((((await rm.json().catch(() => ({})))?.messages?.messages) || []) as any[]).slice().reverse();
        const nossos = new Set<string>([cmp(conviteTxt), ...((c.ia_textos || []) as string[]).map(cmp)]);
        const msgs = todas.filter((m: any) => new Date(m.dateAdded).getTime() >= conviteMs - 60000 && !ehAtividade(m) && (ehLigacao(m) || ehMidia(m) || (!ehSistema(limpa(m.body)) && !/^#contact_instance/i.test(String(m.body || "")))));
        // TRAVA 1: alguem da casa ja escreveu ou ligou -> a conversa e dela
        const humana = msgs.find((m: any) => m.direction === "outbound" && (ehLigacao(m) || !nossos.has(cmp(m.body))));
        if (humana) { feitos.push({ ...base, decisao: "com_camyla", motivo: "pessoa da casa na conversa", tipo: humana.messageType, trecho: limpa(humana.body).slice(0, 60) }); await marca({ status: "com_camyla", entregue_motivo: c.entregue_motivo || ("pessoa ja " + (ehLigacao(humana) ? "ligou" : "escreveu")) }); continue; }
        const conversa = msgs.filter((m: any) => !ehLigacao(m));
        const ultima = conversa[conversa.length - 1];
        if (!ultima || ultima.direction !== "inbound") { feitos.push({ ...base, decisao: "aguardando_ele" }); await marca({}); continue; }
        if (c.ultima_msg_id && c.ultima_msg_id === ultima.id) { feitos.push({ ...base, decisao: "ja_respondida" }); await marca({}); continue; }
        const minDesde = (Date.now() - new Date(ultima.dateAdded).getTime()) / 60000;
        if (minDesde < ESPERA_MIN && !dry) { feitos.push({ ...base, decisao: "esperando_rajada" }); continue; }
        // AUDIO / ANEXO: a IA nao ouve. Entrega para a Camyla sem escrever nada ao candidato.
        if (ehMidia(ultima)) {
          if (dry) { feitos.push({ ...base, decisao: "previa", recebido: "(midia: " + limpa(ultima.body) + ")", rascunho: "(nenhuma mensagem: vai para a Camyla ouvir)", entrega: { motivo: "midia" } }); continue; }
          await marca({ status: "com_camyla", ultima_msg_id: ultima.id, entregue_em: new Date().toISOString(), entregue_motivo: "midia" });
          await avisar(c, cv.id, "midia", "Ele mandou um audio ou anexo. Ouve e responde por la. O que ja sei: " + (Object.keys(c.ficha || {}).length ? JSON.stringify(c.ficha).slice(0, 400) : "nada ainda"), c.temperatura, c.ficha);
          feitos.push({ ...base, decisao: "entregue_camyla", motivo: "midia" }); continue;
        }

        let ficha: any = c.ficha || {}; let entrega: any = null; let fim: any = null; const usadas: string[] = []; const recusas: string[] = [];
        const turnos = Number(c.ia_turnos || 0);
        const hist = conversa.map((m: any) => (m.direction === "inbound" ? "CANDIDATO: " : "VOCE (Nitron): ") + (ehMidia(m) ? "(mandou um audio/anexo)" : limpa(m.body).slice(0, 600))).join("\n");
        const extra = turnos >= MAX_TURNOS ? "\n\nATENCAO: voce ja teve " + turnos + " trocas com ele. Use passar_camyla agora (motivo limite_turnos)." : "";
        const messages: any[] = [{ role: "user", content: hist + extra + "\n\n(Escreva so a sua proxima mensagem para ele, sem prefixo.)" }];
        let reply = "";
        for (let i = 0; i < 5; i++) {
          const resp = await anthropic(SISTEMA(c, ficha, hoje), messages, TOOLS);
          const bl = resp.content || []; messages.push({ role: "assistant", content: bl });
          const tus = bl.filter((x: any) => x.type === "tool_use");
          if (resp.stop_reason !== "tool_use" || !tus.length) { reply = bl.filter((x: any) => x.type === "text").map((x: any) => x.text).join("\n").trim(); break; }
          const rs: any[] = [];
          for (const tu of tus) {
            usadas.push(tu.name); let out: any;
            if (tu.name === "checar_conflito") {
              const uf = String(tu.input?.uf || "").toUpperCase().slice(0, 2);
              if (!UFS.includes(uf)) out = { erro: "UF invalida: pergunte a UF dele" };
              else { const { data, error: e } = await sb.rpc("recrut_conflito", { p_uf: uf, p_cidades: tu.input?.cidades || [], p_clientes: tu.input?.clientes || [] }); out = e ? { erro: e.message } : resumirConflito(data); ficha = { ...ficha, checagem: { uf, cidades: tu.input?.cidades || [], clientes: tu.input?.clientes || [], leitura: (data as any)?.leitura_praca, reps_no_estado: ((data as any)?.reps_ativos_no_estado || []).length, ja_clientes: ((data as any)?.clientes_do_candidato || []).filter((x: any) => x.situacao !== "nao e cliente Nitron").map((x: any) => x.pedido) } }; }
            } else if (tu.name === "avaliar_carteira") {
              const uf = String(tu.input?.uf || "").toUpperCase().slice(0, 2);
              const lista = ((tu.input?.clientes || []) as any[]).map((x: any) => String(x || "").trim()).filter((x: string) => x !== "");
              if (!UFS.includes(uf)) out = { erro: "UF invalida: pergunte a UF dele" };
              else if (!lista.length) out = { erro: "sem nomes: peca os clientes mais relevantes da carteira dele, com nome e cidade" };
              else {
                const { data, error: e } = await sb.rpc("recrut_carteira_aval", { p_uf: uf, p_clientes: lista, p_dias: cartDias, p_min_lista: cartMin, p_pct_limite: cartPct });
                if (e) out = { erro: e.message };
                else {
                  out = resumirCarteira(data);
                  ficha = { ...ficha, carteira: { uf, lista, veredito: (data as any)?.veredito, pct: (data as any)?.pct_ja_atendida, ativos: (data as any)?.ativos, total: (data as any)?.total_na_lista, leitura: (data as any)?.leitura, em: new Date().toISOString() } };
                }
              }
            } else if (tu.name === "salvar_ficha") {
              for (const [k, v] of Object.entries(tu.input || {})) if (v !== null && v !== undefined && String(v).trim() !== "") ficha[k] = v;
              out = { ok: true };
            } else if (tu.name === "passar_camyla") {
              const mot = String(tu.input?.motivo || "");
              const ver = ficha?.carteira?.veredito;
              // TRAVA DA CARTEIRA (ordem do gestor, 27/11): so vale para a entrega por QUENTE.
              // Os outros motivos sao saida para um humano e continuam passando.
              if (cartTrava && mot === "quente" && ver !== "qualificado") {
                recusas.push("passar_camyla/quente: carteira " + (ver || "nao avaliada"));
                out = { ok: false, recusado: true, o_que_fazer: ver === "nao_qualificado"
                  ? "A carteira dele ja e quase toda nossa (" + (ficha.carteira.leitura || "") + "). NAO entregue para a Camyla: encerre com gentileza por encerrar, motivo carteira_ja_atendida, sem dar numero nem motivo tecnico."
                  : ver === "lista_curta"
                  ? "A lista de clientes dele ainda e pequena demais para avaliar. Peca mais alguns clientes relevantes (nome e cidade) e rode avaliar_carteira de novo antes de entregar."
                  : "Antes de entregar como quente voce precisa pedir a lista dos clientes mais relevantes dele e rodar avaliar_carteira. Peca os clientes agora, explicando que e para ele somar sem bater com parceiros nossos." };
              } else { entrega = tu.input; out = { ok: true, aviso: "Camyla avisada. Mande so uma frase curta dizendo que a Camyla, do comercial, continua com ele por aqui." }; }
            }
            else if (tu.name === "encerrar") { fim = tu.input; out = { ok: true, aviso: "Encerre com gentileza, numa frase, sem dar o motivo tecnico." }; }
            else out = { erro: "ferramenta desconhecida" };
            rs.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out).slice(0, 5000) });
          }
          messages.push({ role: "user", content: rs });
        }
        if (!reply) { feitos.push({ ...base, decisao: "erro", motivo: "modelo sem texto", ferramentas: usadas, recusas }); continue; }
        if (dry) { feitos.push({ ...base, decisao: "previa", recebido: limpa(ultima.body).slice(0, 200), rascunho: reply, ferramentas: usadas, recusas, entrega, fim, carteira: ficha?.carteira || null, ficha }); continue; }

        const env = await enviar(cid, c.fone, reply);
        if (!env?.ok) { feitos.push({ ...base, decisao: "falhou_envio", motivo: env?.motivo || env?.erro }); await marca({ ficha }); continue; }
        const textos = [...((c.ia_textos || []) as string[]), reply].slice(-20);
        const novoStatus = fim ? (fim.motivo === "nao_contatar" ? "nao_contatar" : "descartado") : entrega ? "com_camyla" : "conversando";
        await marca({ ficha, ia_textos: textos, ia_turnos: turnos + 1, ultima_msg_id: ultima.id, status: novoStatus, temperatura: entrega?.temperatura || c.temperatura,
          entregue_em: entrega ? new Date().toISOString() : c.entregue_em, entregue_motivo: entrega ? entrega.motivo : (fim ? "encerrado: " + fim.motivo : c.entregue_motivo) });
        if (entrega) await avisar(c, cv.id, entrega.motivo, entrega.resumo, entrega.temperatura || null, ficha);
        feitos.push({ ...base, decisao: entrega ? "entregue_camyla" : fim ? "encerrado" : "respondeu", texto: reply, ferramentas: usadas, recusas, carteira: ficha?.carteira?.veredito || null });
      } catch (e) { feitos.push({ ...base, decisao: "erro", motivo: String(e).slice(0, 200) }); }
    }
    const conta = (k: string) => feitos.filter((x) => x.decisao === k).length;
    return j({ ok: true, dry, carteira_trava: cartTrava, carteira_pct: cartPct, carteira_min: cartMin, olhados: feitos.length, respondeu: conta("respondeu"), previa: conta("previa"), entregues: conta("entregue_camyla"), com_camyla: conta("com_camyla"), encerrados: conta("encerrado"), resultado: feitos });
  } catch (e: any) { return j({ ok: false, erro: [e?.message, e?.details, e?.hint].filter(Boolean).join(" · ") || String(e) }, 500); }
});
