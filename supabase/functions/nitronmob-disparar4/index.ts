// nitronmob-disparar4 — o QUARTO e-mail da cadencia Nitron-Mob.
//
// Funcao separada da `nitronmob-disparar2` pelo mesmo motivo que separou aquela da primeira: cada
// tabela de onda tem um indice unico em lower(email), e e ele a ultima trava contra reenvio DENTRO
// daquela onda. Mexer nele para caber a onda seguinte afrouxaria a anterior.
//
// POR QUE ELA EXISTE, E O QUE ISSO IMPLICA (19/11)
// O 3o e-mail (`app/nitronmob-email3.html`, a tabela de precos) foi preparado em 12/11 para sair
// pela CAMPANHA DO GHL, usando a tag `nitronmob-comunicacao` — ordem do gestor, porque campanha do
// GHL tem relatorio de abertura e clique e envio por API nao tem. Ate 19/11 ele NAO FOI DISPARADO
// por nenhum caminho: nao ha linha em `fila_envio`, nao ha tabela de envio, nao ha registro.
// Por isso nao existe `nitronmob-disparar3`: aquele e-mail nunca teve funcao aqui, e a lacuna no
// numero e proposital — o numero segue o E-MAIL, nao a funcao.
//
// O QUE ESTA FUNCAO NAO FAZ, de proposito:
//  - nao escolhe publico por palpite: a audiencia e a view `nitronmob_apto4`.
//  - nao passa por modelo de IA: o corpo e HTML fixo, lido de `nitronmob_arte` (nome='email4').
//    Nao ha o que inventar — nem preco, nem prazo, nem promessa.
//  - nao manda com assunto de rascunho: se `nitronmob4_assunto` ainda estiver com o marcador
//    `<<DEFINIR>>`, ela RECUSA. E a licao do `raspagem_assinatura_fone`: mandar o placeholder para
//    milhares de pessoas e pior do que nao mandar, e inventar um no lugar e pior ainda.
//
// RAMPA. Dois tetos, e quem manda e o do dia:
//   TETO       (40)   por chamada, porque a edge function corta em 150s de ociosidade
//   dia_max  (1000)   por DIA de Sao Paulo, lido de copiloto_config, contado na propria tabela
// A regra medida e DOBRAR, NAO PULAR: a onda 1 do 2o e-mail fez 500 com 0,40% de rejeicao e a
// onda 2 fez 1.000 com 0,91% — os dois abaixo dos 2%. O que derrubou a cadencia do 1o e-mail foi
// saltar de 507 para 4.240 num dia so.
//
// RITMO REAL: ~9 e-mails/min, nao 13. Entre o cron disparar e a funcao comecar passa ate 1 minuto
// (a fila do `pg_net` tem atraso proprio, maior que o tempo da propria funcao). Os 500 da onda 1
// levaram 39 min, nao 30. Quem planejar lote por "40 a cada 3 min" tem de contar com isso.
//
// Uso:
//   ?dry=1&n=40    ve quem receberia e quanto resta do teto do dia, sem mandar
//   ?n=40          manda ate 40, respeitando o teto do dia
//   ?status=1      como esta a onda: por lote, entrega real, taxa de rejeicao
//   ?entrega=1     pergunta ao GHL o que aconteceu com cada mensagem e grava (chame ate faltam=0)
//
// Ligar:    update copiloto_config set valor='sim' where chave='nitronmob4_ativo';
// Desligar: o mesmo, com 'nao'.

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const URL_ = () => Deno.env.get("SUPABASE_URL")!;
const API = "https://services.leadconnectorhq.com";
const UA = "Mozilla/5.0 (compatible; NitronBot/1.0)";

const TETO = 40;
const PAUSA_MS = 1000;
const ARTE = "email4";

function ghl(method: string, path: string, body: any, version = "2021-04-15") {
  return fetch(API + path, {
    method,
    headers: { Authorization: "Bearer " + Deno.env.get("GHL_TOKEN"), Version: version,
               "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function rest(path: string, init?: RequestInit) {
  const k = srvKey();
  return await fetch(`${URL_()}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: k, Authorization: "Bearer " + k, "Content-Type": "application/json",
               ...(init?.headers || {}) },
  });
}

const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function cfg(): Promise<Record<string, string>> {
  const r = await rest("copiloto_config?select=chave,valor&chave=like.nitronmob4_*");
  const linhas: any[] = r.ok ? await r.json() : [];
  const m: Record<string, string> = {};
  for (const x of linhas) m[x.chave] = x.valor;
  return m;
}

// Dia de Sao Paulo, nao UTC: o teto diario tem de virar a meia-noite daqui, senao as mensagens da
// tarde contam no dia seguinte e o teto deixa de ser teto.
function inicioDoDiaSP(): string {
  const agora = new Date();
  const sp = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const dif = agora.getTime() - sp.getTime();
  const meiaNoiteSP = new Date(sp.getFullYear(), sp.getMonth(), sp.getDate(), 0, 0, 0, 0);
  return new Date(meiaNoiteSP.getTime() + dif).toISOString();
}

async function mandadosHoje(): Promise<number> {
  const r = await rest(`nitronmob_envio4?select=id&enviado_em=gte.${inicioDoDiaSP()}`);
  return r.ok ? (await r.json()).length : 0;
}

// O assunto e a arte sao as duas coisas que nao podem sair pela metade. O marcador `<<` so existe
// enquanto alguem nao decidiu o texto — e um e-mail com "<<DEFINIR>>" no assunto chegando em 4.800
// caixas nao tem desfazimento.
const ehRascunho = (s: string) => !s.trim() || s.includes("<<") || /definir/i.test(s);

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const c = await cfg();

    // ?entrega=1 — "o GHL aceitou" (ok=true) NAO e "chegou". Na onda 1 do 1o e-mail, 209 de 5.032
    // aceitos deram `failed`. Num dominio em rampa e esse numero que decide o lote de amanha.
    if (u.searchParams.get("entrega") === "1") {
      const r = await rest("nitronmob_envio4?select=id,message_id&ok=is.true&message_id=not.is.null" +
                           "&entrega=is.null&order=id&limit=60");
      const pend: any[] = await r.json();
      let lidos = 0;
      for (const x of pend) {
        try {
          const g = await ghl("GET", `/conversations/messages/email/${x.message_id}`, null);
          const d = await g.json().catch(() => ({} as any));
          const st = d?.emailMessage?.status || null;
          if (st) {
            await rest(`nitronmob_envio4?id=eq.${x.id}`, {
              method: "PATCH", body: JSON.stringify({ entrega: st, entrega_em: new Date().toISOString() }),
            });
            lidos++;
          }
        } catch { /* uma leitura perdida volta na proxima chamada */ }
      }
      const f = await rest("nitronmob_envio4?select=id&ok=is.true&message_id=not.is.null&entrega=is.null");
      return j({ ok: true, lidos, faltam: (await f.json()).length });
    }

    if (u.searchParams.get("status") === "1") {
      const r = await rest("nitronmob_envio4?select=id,email,nome,lote,ok,erro,enviado_em,entrega&order=id");
      const linhas: any[] = await r.json();
      const porLote: Record<string, any> = {};
      for (const x of linhas) {
        const k = "lote " + x.lote;
        // ok=false SEM erro = a funcao morreu entre gravar e mandar. O e-mail pode ter saido ou
        // nao, e nao sera reenviado (o indice unico barra) — entao tem nome proprio, em vez de
        // mentir numa das duas colunas.
        porLote[k] ||= { enviados: 0, falharam: 0, desconhecidos: 0 };
        porLote[k][x.ok ? "enviados" : (x.erro ? "falharam" : "desconhecidos")]++;
      }
      const entrega: Record<string, number> = {};
      for (const x of linhas) if (x.ok) entrega[x.entrega || "(ainda nao conferido)"] = (entrega[x.entrega || "(ainda nao conferido)"] || 0) + 1;
      const aceitos = linhas.filter((x) => x.ok).length;
      const ap = await rest("nitronmob_apto4?select=prioridade");
      const aptos: any[] = ap.ok ? await ap.json() : [];
      return j({ ok: true, total: linhas.length, por_lote: porLote, entrega_real: entrega,
                 taxa_rejeicao: aceitos ? (100 * (entrega["failed"] || 0) / aceitos).toFixed(2) + "%" : "0%",
                 mandados_hoje: await mandadosHoje(), teto_do_dia: Number(c.nitronmob4_dia_max || 0),
                 aptos_restantes: aptos.length,
                 rejeitados: linhas.filter((x) => x.entrega === "failed").map((x) => x.email).slice(0, 60),
                 falhas: linhas.filter((x) => !x.ok && x.erro)
                               .map((x) => ({ email: x.email, erro: String(x.erro).slice(0, 120) })).slice(0, 40) });
    }

    const dry = u.searchParams.get("dry") === "1";
    if ((c.nitronmob4_ativo || "nao") !== "sim" && !dry)
      return j({ ok: false, erro: "nitronmob4_ativo nao esta 'sim'" }, 409);

    const pedido = Math.min(Number(u.searchParams.get("n") || 0) | 0, TETO);
    const lote = Number(u.searchParams.get("lote") || 1) | 0;
    if (pedido <= 0) return j({ ok: false, erro: "informe ?n=<quantos> (teto " + TETO + " por chamada). ?dry=1 para ver antes." }, 400);

    const tetoDia = Number(c.nitronmob4_dia_max || 0) | 0;
    const jaHoje = await mandadosHoje();
    const resta = Math.max(0, tetoDia - jaHoje);
    if (resta <= 0 && !dry)
      return j({ ok: true, nada: "teto do dia atingido", mandados_hoje: jaHoje, teto_do_dia: tetoDia });
    const n = Math.min(pedido, dry ? pedido : resta);

    const r = await rest(`nitronmob_apto4?select=email,nome,codparc,situacao,engajamento,recebeu_2o,faturamento_12m,prioridade` +
                         `&order=prioridade.asc,faturamento_12m.desc.nullslast&limit=${n}`);
    if (!r.ok) return j({ ok: false, erro: "audiencia: " + (await r.text()).slice(0, 200) }, 500);
    const alvos: any[] = await r.json();
    if (!alvos.length) return j({ ok: true, nada: "a audiencia do 4o e-mail acabou" });

    const assunto = c.nitronmob4_assunto || "";
    const de = c.nitronmob4_de || "comercial@crm.nitron.com.br";

    const ha = await rest(`nitronmob_arte?select=html&nome=eq.${ARTE}`);
    const html = ha.ok ? ((await ha.json())[0]?.html || "") : "";

    // As duas recusas que valem tambem na previa: e aqui que se descobre que falta decidir algo,
    // nao no meio de um disparo.
    const faltando: string[] = [];
    if (ehRascunho(assunto)) faltando.push("o assunto (copiloto_config.nitronmob4_assunto ainda e rascunho)");
    if (html.length < 1000) faltando.push(`a arte (nitronmob_arte, nome='${ARTE}')`);

    if (dry) {
      const porEng: Record<string, number> = {};
      for (const a of alvos) porEng[a.engajamento || "(nao conferido)"] = (porEng[a.engajamento || "(nao conferido)"] || 0) + 1;
      return j({ ok: true, previa: true, quantos: alvos.length, remetente: de,
                 assunto: ehRascunho(assunto) ? "(ainda nao definido)" : assunto,
                 arte_bytes: html.length, falta_para_poder_mandar: faltando.length ? faltando : null,
                 ativo: (c.nitronmob4_ativo || "nao") === "sim",
                 mandados_hoje: jaHoje, teto_do_dia: tetoDia, resta_hoje: resta,
                 por_engajamento: porEng,
                 ja_receberam_o_2o: alvos.filter((a) => a.recebeu_2o).length,
                 primeiros: alvos.slice(0, 10).map((a) => `${a.nome} <${a.email}> (engajamento: ${a.engajamento || "-"})`) });
    }

    if (faltando.length) return j({ ok: false, erro: "falta " + faltando.join(" e ") }, 409);

    const envios: any[] = [];
    for (const a of alvos) {
      // GRAVA ANTES DE MANDAR. Se a funcao morrer no meio, o que saiu fica registrado e a proxima
      // chamada nao repete. E tambem o conserto da corrida do `toques`: contador escrito depois do
      // envio mente quando duas chamadas se cruzam.
      const ins = await rest("nitronmob_envio4", {
        method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ email: a.email, nome: a.nome, codparc: a.codparc, situacao: a.situacao, lote }),
      });
      if (!ins.ok) { envios.push({ email: a.email, ok: false, erro: "ja registrado" }); continue; }
      const linha = (await ins.json())[0];

      let ok = false, erro: string | null = null, msgId: string | null = null;
      try {
        const lk = await fetch(`${URL_()}/functions/v1/campanhas-enviar`, {
          method: "POST",
          headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" },
          body: JSON.stringify({ lookup: true, canal: "email", email: a.email, nome: a.nome }),
        });
        const d = await lk.json().catch(() => ({}));
        const contactId = d?.contactId;
        if (!contactId) throw new Error("sem contactId");

        const er = await ghl("POST", "/conversations/messages",
          { type: "Email", contactId, subject: assunto, html, emailFrom: de });
        const txt = (await er.text()).slice(0, 300);
        ok = er.status >= 200 && er.status < 300;
        if (ok) { try { msgId = JSON.parse(txt)?.emailMessageId || null; } catch { /* nao-JSON */ } }
        else erro = txt;
      } catch (e) { erro = String(e).slice(0, 200); }

      await rest(`nitronmob_envio4?id=eq.${linha.id}`, {
        method: "PATCH", body: JSON.stringify({ ok, erro, message_id: msgId }),
      });
      envios.push({ email: a.email, ok, erro });
      await dorme(PAUSA_MS);
    }

    return j({ ok: true, lote, remetente: de, assunto,
               mandados: envios.filter((x) => x.ok).length,
               mandados_hoje: jaHoje + envios.length,
               teto_do_dia: tetoDia,
               falhas: envios.filter((x) => !x.ok) });
  } catch (e) {
    return j({ ok: false, erro: String(e).slice(0, 300) }, 500);
  }
});
