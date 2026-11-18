// forca-cutucar — MANDOU O LINK DO FORCA E O LOJISTA SUMIU: pergunta o que aconteceu.
//
// Ordem do gestor em 17/11, no desenho da jornada: "Se o cliente ficar sem falar por mais de 45
// minutos e nao for identificado o pedido dele, perguntar se teve alguma dificuldade (...) Mas
// definitivamente nao podemos perder esse lead/venda."
//
// POR QUE NAO E A `nina-poslink`, QUE JA FAZ ISTO: sao dois links diferentes e dois relogios
// diferentes. A `nina-poslink` cutuca 3h depois da PAGINA DE PEDIDO antiga (`link_em`) e nao tem
// como saber se o lojista pediu. Esta cutuca 45 MINUTOS depois do link do FORCA (`forca_link_em`),
// que e pedido de verdade no ERP. Misturar as duas numa funcao so faria um relogio corromper o
// outro, e a antiga continua atendendo lead.
//
// O QUE AINDA NAO DA PARA SABER, E ESTA DITO EM VOZ ALTA: se o lojista ENVIOU o pedido.
// O gestor pediu "e nao for identificado o pedido dele". O sinal existe — e o `AD_STATUFORCA` do
// Sankhya (`ELAB_CLIENTE` = ainda montando; qualquer outro = enviou) — mas uma edge function nao
// alcanca o Sankhya daqui. Entao a trava usada e a CONSERVADORA: so cutuca quem NAO RESPONDEU
// nada depois do link. Quem respondeu esta conversando, e a conversa e do `copiloto-lead`.
// E o texto e escrito de forma que, mesmo que ele JA tenha enviado o pedido, a pergunta nao seja
// falsa: pergunta se deu certo abrir e se ficou duvida, NUNCA afirma que ele nao pediu.
// Afirmar o que nao se mediu e o erro de 16/09.
//
// TRAVAS (cada uma com motivo medido, as mesmas da `nina-poslink`):
//   - `forca_cutuca_ativo` nasce 'nao', e nao ha cron ate alguem criar. 16/09: uma linha de
//     configuracao nao pode ser a unica coisa entre o silencio e um disparo.
//   - `forca_cutuca_janela_h` (48h): quem recebeu link ha tres dias nao leva "cutucada de 45min".
//   - `forca_cutuca_max` (1): uma pergunta. Duas viram cobranca.
//   - TETO DE MENSAGENS ESPONTANEAS EM 24h (2), contado NA CONVERSA DO CRM e nao num contador
//     nosso — o `toques` do `copiloto_lead` mente (StarLuz, lead 564, 02/10 e 28/10). Espontanea e
//     a mensagem cuja anterior tambem e nossa: RESPONDER NAO E INSISTIR.
//   - `forca_cutuca_em` e gravado ANTES do envio. Licao do `toques` e do `reativa_em`: contador
//     escrito depois de um envio de 12s cruza com a rodada seguinte e manda duas vezes.
//   - 9h as 20h de Sao Paulo, sem domingo. A cutuca e iniciativa NOSSA.
//
// Uso: ?dry=1 (previa, com o texto pronto) | ?lead=N (um so) | ?limite=N

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o, null, 2), { status: s, headers: { "Content-Type": "application/json" } });

const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const URL_ = () => Deno.env.get("SUPABASE_URL")!;
const GHL = (Deno.env.get("GHL_TOKEN") || "").trim();
const LOC = "rZ8y7lzqV7fzxsartaX2";
const MODELO = "claude-sonnet-5";

const prim = (s: any) => (String(s || "").trim().split(/\s+/)[0] || "");
const norm = (s: any) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// Autoresposta da loja DELE nao e "ele respondeu" — a Natalie caiu nesse vao em 10/09.
const RE_RUIDO = /(codigo de confirmacao|undecryptable|descriptografar|ative as listas|agradece(mos)? (seu contato|sua mensagem)|atendente virtual|horario de atendimento|entraremos em contato|selecione (a|uma|um) (opcao|assunto)|(estou|estamos) indisponive|nao (estou|estamos) disponive|retornare(i|mos) assim que|respondere(i|mos) assim que|ouvidoria|mensagem automatica)/;
const ehRuido = (t: any) => RE_RUIDO.test(norm(t));
const limpa = (t: any) => String(t || "").replace(/Instance Source:.*/is, "").replace(/#contact_instance:\S+/gi, "").replace(/\s+/g, " ").trim();

async function rest(path: string, init?: RequestInit) {
  const k = srvKey();
  return await fetch(`${URL_()}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: k, Authorization: "Bearer " + k, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
}

const ghl = (m: string, p: string, v = "2021-07-28") =>
  fetch("https://services.leadconnectorhq.com" + p, {
    method: m, headers: { Authorization: "Bearer " + GHL, Version: v, Accept: "application/json", "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20_000),
  });

async function cfgAll(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  try {
    const q = await rest("copiloto_config?select=chave,valor&limit=1000");
    for (const r of (q.ok ? await q.json() : [])) out[r.chave] = String(r.valor ?? "").trim();
  } catch { /* vazio */ }
  return out;
}

async function licoes(): Promise<string> {
  try {
    const q = await rest("copiloto_licoes?select=licao&ativo=is.true&order=id");
    const ls = (q.ok ? await q.json() : []).map((r: any) => "- " + r.licao);
    return ls.length ? "\n\nLICOES DO GESTOR (tem PRIORIDADE, siga a risca):\n" + ls.join("\n") : "";
  } catch { return ""; }
}

async function enviar(contact_id: string, texto: string, instancia: string) {
  const r = await fetch(URL_() + "/functions/v1/campanhas-enviar", {
    method: "POST", headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ canal: "whatsapp", texto, instancia, contact_id }),
    signal: AbortSignal.timeout(90_000),
  });
  return await r.json().catch(() => ({ ok: false, motivo: "resposta ilegivel do campanhas-enviar" }));
}

async function anthropic(system: string, user: string): Promise<string> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("sem ANTHROPIC_API_KEY");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODELO, max_tokens: 300, system, messages: [{ role: "user", content: user }] }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!r.ok) throw new Error("anthropic " + r.status + " " + (await r.text()).slice(0, 200));
  const d = await r.json();
  return String(d?.content?.[0]?.text || "").trim();
}

// Horario de Sao Paulo, fixo. Domingo nao.
function foraDaJanela(c: Record<string, string>): string | null {
  const brt = new Date(Date.now() - 3 * 3600 * 1000);
  if (brt.getUTCDay() === 0) return "domingo";
  const h = brt.getUTCHours();
  const ini = parseInt(c.forca_cutuca_hora_ini || "9") || 9;
  const fim = parseInt(c.forca_cutuca_hora_fim || "20") || 20;
  if (h < ini || h >= fim) return `fora de ${ini}h-${fim}h de Sao Paulo (agora ${h}h)`;
  return null;
}

const hhmm = (ms: number) => {
  const h = Math.floor(ms / 3600000), m = Math.round((ms % 3600000) / 60000);
  return h > 0 ? h + "h" + (m ? String(m).padStart(2, "0") : "") : m + "min";
};

// O texto de reserva. Existe para que uma falha do modelo nao vire silencio: o gestor foi
// explicito — "definitivamente nao podemos perder esse lead/venda".
function textoReserva(nome: string): string {
  const n = prim(nome);
  return (n ? `Oi, ${n}! ` : "Oi! ") +
    "Passando rapidinho pra saber se voce conseguiu abrir o link e se ficou alguma duvida no que viu. " +
    "Se preferir, me diz o que voce costuma vender mais que eu te ajudo a montar.";
}

Deno.serve(async (req) => {
  try {
    const auth = req.headers.get("Authorization") || "";
    const aceitas = [Deno.env.get("SRV_JWT"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")]
      .filter(Boolean).map((k) => "Bearer " + k);
    if (!aceitas.includes(auth)) return j({ ok: false, erro: "nao autorizado" }, 401);
    if (!GHL) return j({ ok: false, erro: "sem GHL_TOKEN" }, 500);

    const u = new URL(req.url);
    const dry = u.searchParams.get("dry") === "1";
    const soLead = Number(u.searchParams.get("lead") || 0) || 0;

    const c = await cfgAll();
    const minutos = Number(c.forca_cutuca_min || "45") || 45;
    const janelaH = Number(c.forca_cutuca_janela_h || "48") || 48;
    const maxVezes = Number(c.forca_cutuca_max || "1") || 1;
    const maxDia = Number(c.forca_cutuca_max_dia || "2") || 2;
    const lote = Math.max(1, Math.min(Number(u.searchParams.get("limite") || c.forca_cutuca_lote || "3") || 3, 10));
    const inst = c.forca_link_instancia || "Nina";
    const ligado = (c.forca_cutuca_ativo || "nao").toLowerCase() === "sim";

    const fora = foraDaJanela(c);
    if (fora && !dry && !soLead) return j({ ok: true, fora_da_janela: fora, enviou: 0 });

    const agora = Date.now();
    const sel = "id,nome,empresa,cnpj,contact_id,forca_pedido,forca_link,forca_link_em,forca_cutuca_vezes,cidade,uf,interesse";
    const url = soLead
      ? `copiloto_lead?select=${sel}&id=eq.${soLead}`
      : `copiloto_lead?select=${sel}&forca_link_em=not.is.null&descartado_em=is.null&contact_id=not.is.null` +
        `&forca_cutuca_vezes=lt.${maxVezes}` +
        `&forca_link_em=lt.${new Date(agora - minutos * 60_000).toISOString()}` +
        `&forca_link_em=gt.${new Date(agora - janelaH * 3600_000).toISOString()}` +
        `&order=forca_link_em.asc&limit=30`;
    const q = await rest(url);
    const cands: any[] = q.ok ? await q.json() : [];

    const lic = dry ? "" : await licoes();
    const feito: Record<string, unknown>[] = [];
    let mandados = 0;

    for (const L of cands) {
      if (mandados >= lote) break;
      const base = { lead: L.id, nome: L.nome, empresa: L.empresa, pedido: L.forca_pedido };
      const desdeLink = agora - new Date(L.forca_link_em).getTime();

      // ---- a conversa manda, nao a nossa coluna ----
      const rc = await ghl("GET", `/conversations/search?locationId=${LOC}&contactId=${L.contact_id}&limit=1`);
      const cv = (((await rc.json().catch(() => ({} as any)))?.conversations) || [])[0];
      if (!cv?.id) { feito.push({ ...base, decisao: "pular", motivo: "sem conversa no CRM" }); continue; }

      const rm = await ghl("GET", `/conversations/${cv.id}/messages?limit=25`, "2021-04-15");
      const md = await rm.json().catch(() => ({} as any));
      const msgs: any[] = (md?.messages?.messages || md?.messages || []).slice();  // do mais novo ao mais velho

      // ELE RESPONDEU DEPOIS DO LINK: a conversa esta viva e e do copiloto-lead. Entrar por cima
      // seria o que a Nina fez com o representante em 16/09.
      const respondeu = msgs.some((m) =>
        String(m?.direction) === "inbound" &&
        new Date(m?.dateAdded || 0).getTime() > new Date(L.forca_link_em).getTime() &&
        !ehRuido(m?.body));
      if (respondeu) { feito.push({ ...base, decisao: "pular", motivo: "ele respondeu depois do link — quem atende e o copiloto-lead" }); continue; }

      // TETO DE ESPONTANEAS EM 24h. Conta na conversa, e so o que e iniciativa nossa.
      const ordem = msgs.slice().reverse();          // do mais velho ao mais novo
      let espontaneas = 0;
      for (let i = 0; i < ordem.length; i++) {
        const m = ordem[i];
        if (String(m?.direction) !== "outbound") continue;
        if (agora - new Date(m?.dateAdded || 0).getTime() > 24 * 3600_000) continue;
        const ant = ordem[i - 1];
        if (!ant || String(ant.direction) === "outbound") espontaneas++;
      }
      if (espontaneas >= maxDia) {
        feito.push({ ...base, decisao: "pular", motivo: `ja mandamos ${espontaneas} mensagens espontaneas nas ultimas 24h (teto ${maxDia})` });
        continue;
      }

      // ---- texto ----
      const hist = ordem.slice(-10).map((m: any) =>
        (String(m?.direction) === "inbound" ? "LOJISTA: " : "NINA: ") + limpa(m?.body).slice(0, 300)).join("\n");
      const sistema =
        "Voce e a Nina, da Nitron (utilidades domesticas, venda no atacado para lojistas). " +
        "Escreva UMA mensagem curta de WhatsApp, no maximo 2 frases, em portugues do Brasil, tom de gente.\n" +
        "SITUACAO: ha " + hhmm(desdeLink) + " voce mandou a este lojista o link onde ele monta e envia o pedido, " +
        "e ele nao respondeu nada desde entao.\n" +
        "REGRAS DURAS:\n" +
        "- NAO afirme que ele nao fez o pedido: voce NAO SABE se ele enviou. Pergunte se conseguiu abrir e se ficou duvida.\n" +
        "- NAO repita o link, NAO cite preco, percentual de desconto, prazo, frete nem pedido minimo.\n" +
        "- NAO diga que voce viu que ele abriu, nem fale de sistema, pagina, cadastro ou ERP.\n" +
        "- NAO comece com 'Oi, tudo bem?' se a conversa ja estava quente; va direto, com leveza.\n" +
        "- Ofereça ajuda concreta (montar junto, tirar duvida), sem cobrar.\n" +
        "Responda SO com o texto da mensagem, sem aspas e sem comentario." + lic;
      const usuario = `Lojista: ${L.nome}${L.empresa ? " (" + L.empresa + ")" : ""}` +
        `${L.cidade ? " — " + L.cidade + "/" + (L.uf || "") : ""}\n` +
        `${L.interesse ? "Interesse dito por ele: " + String(L.interesse).slice(0, 300) + "\n" : ""}` +
        `Ultimas mensagens da conversa:\n${hist || "(sem historico legivel)"}`;

      let texto = "";
      try { texto = await anthropic(sistema, usuario); } catch (_e) { texto = ""; }
      if (!texto || texto.length > 600) texto = textoReserva(L.nome);

      if (dry) {
        feito.push({ ...base, decisao: "previa", ha: hhmm(desdeLink), espontaneas_24h: espontaneas, rascunho: texto });
        mandados++;
        continue;
      }
      if (!ligado) { feito.push({ ...base, decisao: "pular", motivo: "forca_cutuca_ativo nao esta 'sim'" }); continue; }

      // ANTES do envio.
      await rest(`copiloto_lead?id=eq.${L.id}`, {
        method: "PATCH",
        body: JSON.stringify({ forca_cutuca_em: new Date().toISOString(), forca_cutuca_vezes: (L.forca_cutuca_vezes || 0) + 1 }),
      });
      const env = await enviar(L.contact_id, texto, inst);
      mandados++;
      feito.push({ ...base, decisao: env?.ok ? "cutucado" : "recusado", ha: hhmm(desdeLink), motivo: env?.ok ? undefined : env?.motivo, texto });
    }

    return j({ ok: true, ligado, previa: dry, instancia: inst,
               regra: `link do Forca mandado ha mais de ${minutos}min, dentro de ${janelaH}h, sem resposta dele, no maximo ${maxVezes} toque(s), teto de ${maxDia} espontaneas em 24h`,
               candidatos: cands.length, tratados: feito.length, feito });
  } catch (e) {
    return j({ ok: false, erro: String(e).slice(0, 400) }, 500);
  }
});
