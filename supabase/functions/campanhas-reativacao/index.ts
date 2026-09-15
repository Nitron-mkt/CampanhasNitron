// campanhas-reativacao (v2) — E-MAIL DE RETOMADA AO CLIENTE PARADO HA 180+ DIAS.
//
// Pedido do gestor em 15/09: o Zaptos frio nao deu resultado, entao a reativacao passa a ser por
// e-mail, "entendendo o contexto do que ja estava acontecendo com aquele contato".
//
// POR QUE E UMA FUNCAO NOVA e nao mais um ramo do campanhas-disparar: as campanhas de la falam com o
// REPRESENTANTE sobre o cliente (levam CNPJ, lista de lojas, cobranca de acao). Esta fala com o
// LOJISTA, sobre a loja dele — outro destinatario, outro tom, e nenhuma linha em comum a nao ser a
// fila. Enfiar aqui dentro obrigaria a espalhar `if publico==cliente` pela funcao inteira.
//
// A AUDIENCIA MORA NA VIEW `reativacao_email_apto`, nao aqui: tela e disparo tem de contar a mesma
// coisa (mesma regra do roteiro_cliente_apto). As travas dela: um e-mail so recebe uma vez mesmo
// atendendo varias lojas do grupo, e-mail de representante nunca entra (a licao do rep_contato_extra
// em agosto), quem tem titulo vencido fica fora, e so quem ja comprou alguma vez.
//
// CONTEXTO REAL SO EXISTE NA FAIXA DE 180-364 DIAS. `contato_enriquecido` calcula compra_linhas,
// ticket_medio e faturamento em janela de 12 MESES: para quem esta parado ha mais de um ano essas
// colunas vem vazias, e a unica coisa que sabemos e a data da ultima nota. Por isso `faixa` e
// parametro: mandar "senti falta das suas compras de organizacao" para quem parou ha tres anos
// seria invencao, e a IA esta proibida de preencher esse buraco.
//
// O QUE A IA ESCREVE E O QUE NAO ESCREVE: ela escreve o texto em volta. Nao escreve preco, desconto,
// prazo, frete, condicao de pagamento nem promessa de campanha — nada disso foi autorizado, e um
// numero inventado num e-mail de retomada vira discussao comercial depois. A lista do que o cliente
// comprava entra montada em CODIGO, como nas campanhas ao representante.
//
// ?dry=1 monta tudo e NAO enfileira (devolve os textos para conferir).
// ?limite=N quantos nesta rodada. ?faixa=180-364d restringe a faixa de inatividade.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const MODELO = "claude-sonnet-5";
const CAMPANHA = "reativacao_email_cliente";

const prim = (s: any) => (String(s || "").trim().split(/\s+/)[0] || "");
const cap = (s: any) => { const t = String(s || "").trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : ""; };
const brl = (n: any) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const dataBR = (d: any) => { if (!d) return ""; const x = new Date(String(d) + "T12:00:00Z"); return x.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); };

// "ha 8 meses" le melhor que "ha 247 dias" num e-mail para lojista.
function tempoParado(dias: number): string {
  const m = Math.round(dias / 30);
  if (m < 12) return "cerca de " + m + " meses";
  const a = Math.floor(dias / 365); const r = Math.round((dias % 365) / 30);
  if (a >= 3) return "mais de " + a + " anos";
  return a === 1 ? (r >= 3 ? "um ano e " + r + " meses" : "cerca de um ano") : a + " anos";
}

// A lista do que ele comprava entra montada AQUI. Mesma razao das campanhas ao representante: onde a
// IA reescrevia a lista, ela abreviava nome e trocava numero.
function linhasQueComprava(s: any): string[] {
  return String(s || "").split(/[;,|]/).map((x) => x.trim()).filter(Boolean).slice(0, 6);
}

async function anthropic(system: string, messages: any[]): Promise<any> {
  const key = Deno.env.get("ANTHROPIC_API_KEY"); if (!key) throw new Error("sem ANTHROPIC_API_KEY");
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: MODELO, max_tokens: 900, system, messages }) });
  if (!r.ok) throw new Error("anthropic " + r.status + " " + (await r.text()).slice(0, 200));
  return await r.json();
}

const TOM = `Voce escreve um e-mail curto da Nitronplast (Nitron), industria de utilidades domesticas em plastico, para um LOJISTA que ja foi cliente e parou de comprar. Quem assina e a Nina, do time comercial.

O QUE O E-MAIL E: uma retomada de contato, honesta e sem drama. Reconhece o tempo parado sem cobrar, lembra o que ele comprava, e pergunta como esta a loja hoje. O objetivo e ele RESPONDER — nao comprar agora.

REGRAS DURAS (quebrar qualquer uma invalida o e-mail):
- NUNCA escreva preco, desconto, porcentagem, prazo de entrega, condicao de pagamento, frete, prazo de pagamento, valor minimo, promocao, campanha, brinde ou bonificacao. Nada disso foi autorizado. Se o texto pedir, escreva que isso quem acerta e o consultor.
- NUNCA invente produto, linha, pedido, data ou numero. Use SO o que esta no contexto abaixo.
- NUNCA use pressao, escassez, urgencia, "ultima chance", "so ate", "nao perca", nem cobranca de resposta.
- NUNCA use o angulo de concorrencia ("sair na frente", "antes que outro leve").
- NUNCA diga que e IA, robo ou automacao.
- NAO escreva o CNPJ nem documento nenhum.
- Se o contexto nao disser o que ele comprava, NAO invente: fale da loja e do segmento dele em termos gerais.

FORMA: assunto de no maximo 60 caracteres, sem emoji e sem CAPS. Corpo de 90 a 150 palavras, em 3 ou 4 paragrafos curtos, tratamento por voce, portugues do Brasil, tom de gente — nao de marketing. Sem bullet, sem negrito, sem link. Termine com UMA pergunta aberta e facil de responder, convidando a responder este proprio e-mail.

Responda SO com JSON valido, sem texto em volta:
{"assunto":"...","corpo":"..."}  (o corpo com \\n entre os paragrafos)`;

async function escrever(c: any): Promise<{ assunto: string; corpo: string }> {
  const linhas = linhasQueComprava(c.compra_linhas);
  const ctx = [
    "Loja: " + c.nomeparc,
    c.contato_nome ? "Pessoa de contato: " + c.contato_nome : null,
    c.praca ? "Praca: " + c.praca : null,
    c.ramo ? "Ramo: " + c.ramo : null,
    c.canal ? "Canal: " + c.canal : null,
    "Parou de comprar ha " + tempoParado(Number(c.dias_sem_compra || 0)) + " (ultima nota em " + dataBR(c.ult_fat) + ")",
    linhas.length ? "Linhas que ele comprava da Nitron: " + linhas.join(", ") : "NAO SABEMOS o que ele comprava (a janela de historico nao alcanca) — nao invente linha nenhuma",
    Number(c.num_compras || 0) > 0 ? "Comprou " + c.num_compras + " vezes no ultimo ciclo" : null,
    c.rep_nome ? "Representante que atende a praca dele: " + cap(c.rep_nome) + " (NAO cite o nome dele neste e-mail)" : null,
  ].filter(Boolean).join("\n");

  const r = await anthropic(TOM, [{ role: "user", content: "CONTEXTO DESTE CLIENTE:\n\n" + ctx + "\n\nEscreva o e-mail." }]);
  const t = (r.content || []).filter((x: any) => x.type === "text").map((x: any) => x.text).join("").trim();
  const m = t.match(/\{[\s\S]*\}/);
  const o = JSON.parse(m ? m[0] : t);
  const assunto = String(o.assunto || "").trim().slice(0, 120);
  const corpo = String(o.corpo || "").trim();
  if (!assunto || corpo.length < 80) throw new Error("texto curto demais do modelo");
  return { assunto, corpo };
}

// Rede de seguranca: se a IA escapar e escrever numero comercial, a linha NAO vai. Melhor perder um
// e-mail do que mandar uma condicao que ninguem autorizou e ter de desdizer depois.
const PROIBIDO = /(\bR\$|\d+\s*%|desconto|promo[cç][aã]o|frete gr[aá]tis|parcel|boleto|prazo de (entrega|pagamento)|[uú]ltima chance|n[aã]o perca|só at[eé]|apenas hoje|oferta)/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = createClient(SUPA_URL, srvKey());
    const sp = new URL(req.url).searchParams;
    const b = await req.json().catch(() => ({} as any));
    const dry = sp.get("dry") === "1" || b.dry === true;
    const faixa = String(sp.get("faixa") || b.faixa || "").trim();

    const { data: camp } = await sb.from("campanhas").select("ativa, filtros_padrao").eq("codigo", CAMPANHA).maybeSingle();
    if (!camp) return j({ ok: false, erro: "campanha " + CAMPANHA + " nao cadastrada" }, 400);
    const f: any = camp.filtros_padrao || {};
    if (camp.ativa === false && !dry) return j({ ok: true, desligado: "campanha inativa (campanhas.ativa=false)" });
    const limite = Math.min(Math.max(1, parseInt(String(sp.get("limite") || b.limite || f.reativ_lote || "40")) || 40), 300);

    // quem JA recebeu (ou esta na fila) desta campanha — para sempre, nao nas ultimas 12h. A trava do
    // fila-enfileirar e de 12h e serve contra clique duplo; aqui a regra e outra: reativacao se manda
    // UMA vez por cliente, e insistir mes que vem e decisao do gestor, nao efeito colateral do cron.
    const jaFoi = new Set<string>();
    for (let de = 0; ; de += 1000) {
      const { data } = await sb.from("fila_envio").select("email").eq("campanha", CAMPANHA).range(de, de + 999);
      (data || []).forEach((r: any) => { const e = String(r.email || "").trim().toLowerCase(); if (e) jaFoi.add(e); });
      if (!data || data.length < 1000) break;
    }

    let q = sb.from("reativacao_email_apto").select("*").order("dias_sem_compra", { ascending: true }).limit(limite + jaFoi.size + 200);
    if (faixa) q = q.eq("faixa", faixa);
    const { data: alvos, error } = await q;
    if (error) return j({ ok: false, erro: error.message }, 500);

    const fila: any[] = []; const feitos: any[] = []; let pulados = 0;
    for (const c of (alvos || [])) {
      if (fila.length >= limite) break;
      if (jaFoi.has(String(c.email).toLowerCase())) { pulados++; continue; }
      let txt: any;
      try { txt = await escrever(c); }
      catch (e) { feitos.push({ codparc: c.codparc, loja: c.nomeparc, decisao: "erro", motivo: String(e).slice(0, 160) }); continue; }
      if (PROIBIDO.test(txt.assunto + " " + txt.corpo)) {
        feitos.push({ codparc: c.codparc, loja: c.nomeparc, decisao: "barrado", motivo: "o texto trouxe condicao comercial que ninguem autorizou", assunto: txt.assunto });
        continue;
      }
      // o e-mail sai com <br>: o campanhas-enviar envolve o texto num <div> e o \n cru some no HTML
      const corpoHtml = txt.corpo.replace(/\n/g, "<br>");
      fila.push({
        campanha: CAMPANHA, publico: "cliente", canal: "email", email: c.email,
        nome: c.contato_nome || c.nomeparc, assunto: txt.assunto, corpo: corpoHtml, codparc: c.codparc,
        merge: { cliente: c.nomeparc, empresa: c.nomeparc, rep: c.rep_nome || "", dias: String(c.dias_sem_compra) },
      });
      feitos.push({ codparc: c.codparc, loja: c.nomeparc, contato: c.contato_nome, email: c.email, faixa: c.faixa,
        dias_parado: c.dias_sem_compra, comprava: linhasQueComprava(c.compra_linhas), assunto: txt.assunto,
        corpo: dry ? txt.corpo : txt.corpo.slice(0, 160) + "…", decisao: dry ? "previa" : "enfileirado" });
    }

    if (dry) return j({ ok: true, dry: true, campanha: CAMPANHA, faixa: faixa || "todas", candidatos: (alvos || []).length, ja_receberam: jaFoi.size, montados: fila.length, pulados_ja_receberam: pulados, resultado: feitos });
    if (!fila.length) return j({ ok: true, campanha: CAMPANHA, enfileirados: 0, motivo: "ninguem novo nesta faixa", ja_receberam: jaFoi.size, resultado: feitos });

    const r = await fetch(SUPA_URL + "/functions/v1/fila-enfileirar", { method: "POST", headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" }, body: JSON.stringify({ itens: fila }) });
    const ef = await r.json().catch(() => ({ erro: "resposta ilegivel do fila-enfileirar" }));

    // a AGENDA le o realizado da propria fila_envio (view agenda_realizado), entao o progresso
    // aparece sozinho. Esta linha e o outro lado: diz que a campanha FOI RODADA hoje, com objetivo e
    // alvo, para o dia nao mostrar so um numero sem dono.
    // status TEM de ser um dos quatro de agenda_status_chk: planejado / em_andamento / concluido /
    // cancelado. "rodando" parecia obvio e a linha nao entrava — e o erro do upsert estava sendo
    // engolido, entao a campanha disparava e o dia da agenda ficava sem dono, sem ninguem saber.
    const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
    const jaNaAgenda = await sb.from("agenda_campanha").select("alvo_estimado").eq("data", hoje).eq("campanha_codigo", CAMPANHA).eq("publico", "cliente").maybeSingle();
    const acumulado = Number(jaNaAgenda.data?.alvo_estimado || 0) + (ef?.enfileirados ?? 0);
    const { error: eAg } = await sb.from("agenda_campanha").upsert({
      data: hoje, campanha_codigo: CAMPANHA, publico: "cliente", canais: ["email"], origem: "humano",
      status: "em_andamento", objetivo: "Retomar contato com cliente parado ha 180+ dias, por e-mail, com o contexto do que ele comprava",
      alvo_estimado: acumulado,
      observacao: "Faixa " + (faixa || "todas") + " — " + acumulado + " e-mails enfileirados hoje. A Nina assume quem responder.",
    }, { onConflict: "data,campanha_codigo,publico" });

    return j({ ok: true, campanha: CAMPANHA, faixa: faixa || "todas", montados: fila.length, enfileirar: ef, agenda_erro: eAg?.message, ja_receberam: jaFoi.size, pulados_ja_receberam: pulados, resultado: feitos });
  } catch (e) { return j({ ok: false, erro: String(e) }, 500); }
});
