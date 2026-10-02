// vigia-instancia (v1) — AVISAR NA HORA QUE A SESSAO CAI, E PARAR DE TENTAR.
//
// Ordem do gestor em 02/10, depois de ver a Nina monologando com o lead Martins:
//   "quando aparecer que esta desconectado tem que me avisar na hora e nao continuar tentando".
//
// O QUE ACONTECEU: o Zaptos da Nina caiu as 08:02 e ninguem percebeu ate ele abrir o CRM as 12:30.
// Nesse meio tempo o copiloto tocou de 5 em 5 minutos: 200 envios recusados em 8 conversas, e no
// lead Martins 41 mensagens DIFERENTES escritas pelo modelo — uma por passada, cada uma puxando
// assunto de novo. O lead recebeu a primeira e mais nada; as outras 40 ficaram no CRM sem sair.
//
// POR QUE UMA FUNCAO NOVA, e nao um remendo em cada lugar: a queda nao e problema do copiloto-lead,
// e da INSTANCIA. Ela derruba igual o repasse, o feedback, a fila e a campanha do painel. O unico
// sinal observavel e a linha que o ZaptosWPP escreve NA CONVERSA — "[System]: <inst> - The instance
// is disconnected." — entao quem varre as conversas ve a queda venha ela de onde vier, sem que
// nenhuma funcao que esta atendendo precise ser republicada.
//
// O QUE FAZ, nesta ordem:
//   1. varre as mensagens da location na janela de `vigia_inst_janela_min` (padrao 15 min);
//   2. agrupa as quedas por instancia;
//   3. PAUSA a instancia (instancia_ghl.pausada_em) — a trava que faltava: o campanhas-enviar filtra
//      por `ativa`, nao por pausa, e a pausa so era escrita por quem passa pela fila;
//   4. AVISA quem tem avisar=true em copiloto_responsaveis, por Zaptos de uma instancia VIVA
//      (nunca a que caiu — seria mandar recado pelo telefone quebrado), com e-mail de reserva;
//   5. registra em instancia_queda para nao avisar a mesma queda duas vezes (`vigia_inst_reavisar_h`).
//
// O QUE NAO FAZ: nao religa sessao (isso e no painel do Zaptos, na mao) e nao tira a pausa sozinho.
// Tirar a pausa e o ato de quem religou — se ele tirasse sozinho, voltaria a bater na sessao morta.
//
// NASCE DESLIGADA e sem cron (`vigia_inst_ativo='nao'`): e a licao de 16/09 — uma linha de
// configuracao nao pode ser a unica coisa entre o silencio e todo mundo recebendo mensagem.
// Ligar exige as duas coisas, e e decisao do gestor.
//
// ?dry=1 mostra o que faria sem pausar nem avisar.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GHL = (Deno.env.get("GHL_TOKEN") || "").trim();
const LOC = "rZ8y7lzqV7fzxsartaX2";

const ghl = (m: string, p: string, v = "2021-07-28", body?: any) =>
  fetch("https://services.leadconnectorhq.com" + p, { method: m, headers: { Authorization: "Bearer " + GHL, Version: v, Accept: "application/json", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

const norm = (s: any) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const digits = (s: any) => String(s || "").replace(/\D/g, "");
const fk8 = (s: any) => digits(s).slice(-8);
const hl = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

// o UNICO sinal observavel de que o Zaptos nao entregou. Nao ha campo no CRM nem status de contato.
const QUEDA_RE = /\[System\]:\s*(.+?)\s*-\s*The instance is disconnected/i;

async function enviarZaptos(contact_id: string, texto: string, instancia: string) {
  const r = await fetch(SUPA_URL + "/functions/v1/campanhas-enviar", {
    method: "POST",
    headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ canal: "whatsapp", texto, instancia, contact_id }),
  });
  return await r.json().catch(() => ({ ok: false, motivo: "resposta ilegivel do campanhas-enviar" }));
}
async function enviarEmail(contact_id: string, assunto: string, texto: string) {
  const r = await fetch(SUPA_URL + "/functions/v1/campanhas-enviar", {
    method: "POST",
    headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ canal: "email", texto, assunto, contact_id }),
  });
  return await r.json().catch(() => ({ ok: false, motivo: "resposta ilegivel do campanhas-enviar" }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!GHL) return j({ ok: false, erro: "sem GHL_TOKEN" }, 500);
    const sp = new URL(req.url).searchParams;
    const dry = sp.get("dry") === "1";
    const sb = createClient(SUPA_URL, srvKey());

    const { data: cfgRows } = await sb.from("copiloto_config").select("*");
    const cfg: Record<string, string> = {}; (cfgRows || []).forEach((r: any) => cfg[r.chave] = r.valor);
    const ativo = String(cfg.vigia_inst_ativo || "nao").toLowerCase() === "sim";
    const janelaMin = Math.max(3, parseInt(cfg.vigia_inst_janela_min || "15") || 15);
    const reavisarH = Math.max(1, parseInt(cfg.vigia_inst_reavisar_h || "6") || 6);

    // 1) varre as mensagens recentes da location
    const desde = new Date(Date.now() - janelaMin * 60000);
    const url = `/conversations/messages/export?locationId=${LOC}&startDate=${encodeURIComponent(desde.toISOString())}&endDate=${encodeURIComponent(new Date().toISOString())}&limit=1000&sortBy=createdAt&sortOrder=desc`;
    const r = await ghl("GET", url, "2021-04-15");
    if (!r.ok) return j({ ok: false, http: r.status, erro: (await r.text()).slice(0, 300) });
    const msgs = ((await r.json())?.messages || []) as any[];

    // 2) agrupa por instancia
    const quedas = new Map<string, { inst: string; n: number; contatos: Set<string>; primeira: string }>();
    for (const m of msgs) {
      const mm = QUEDA_RE.exec(String(m?.body || ""));
      if (!mm) continue;
      const inst = mm[1].trim();
      const k = norm(inst);
      const cur = quedas.get(k) || { inst, n: 0, contatos: new Set<string>(), primeira: String(m.dateAdded || "") };
      cur.n++; if (m.contactId) cur.contatos.add(String(m.contactId));
      if (String(m.dateAdded || "") < cur.primeira) cur.primeira = String(m.dateAdded || "");
      quedas.set(k, cur);
    }
    if (!quedas.size) return j({ ok: true, janela_min: janelaMin, mensagens: msgs.length, quedas: 0, ativo, dry });

    const { data: insts } = await sb.from("instancia_ghl").select("instancia, ativa, pausada_em");
    const vivas = (insts || []).filter((x: any) => x.ativa && !x.pausada_em);
    const { data: resp } = await sb.from("copiloto_responsaveis").select("nome, fone, email, contact_id, avisar").eq("avisar", true);

    const out: any[] = [];
    for (const q of quedas.values()) {
      const cad = (insts || []).find((x: any) => norm(x.instancia) === norm(q.inst));
      const linha: any = { instancia: q.inst, ocorrencias: q.n, contatos: q.contatos.size, desde: q.primeira, cadastrada: !!cad };

      // 5) ja avisamos esta queda ha pouco?
      const limite = new Date(Date.now() - reavisarH * 3600000).toISOString();
      const { data: ja } = await sb.from("instancia_queda").select("id, avisou_em")
        .eq("instancia", q.inst).is("resolvida_em", null).gte("detectada_em", limite)
        .order("id", { ascending: false }).limit(1).maybeSingle();
      if (ja?.avisou_em) { linha.decisao = "ja avisado ha menos de " + reavisarH + "h"; out.push(linha); continue; }

      if (dry || !ativo) { linha.decisao = dry ? "previa (dry=1)" : "vigia_inst_ativo=nao — nada feito"; out.push(linha); continue; }

      // 3) pausa a instancia. So escreve se ainda nao estava pausada.
      if (cad && !cad.pausada_em) {
        const { error } = await sb.from("instancia_ghl")
          .update({ pausada_em: new Date().toISOString(), pausada_motivo: "queda detectada pelo vigia-instancia: o ZaptosWPP escreveu na conversa que a propria " + q.inst + " estava desconectada (" + q.n + " vezes em " + janelaMin + "min)" })
          .eq("instancia", q.inst).is("pausada_em", null);
        linha.pausou = !error; if (error) linha.pausa_erro = error.message;
      } else linha.pausou = false;

      // 4) avisa por uma instancia VIVA — nunca pela que caiu
      const emissora = vivas.find((x: any) => norm(x.instancia) !== norm(q.inst) && norm(x.instancia) === "camyla")
        || vivas.find((x: any) => norm(x.instancia) !== norm(q.inst));
      const texto = [
        "⚠️ A instancia *" + q.inst + "* caiu no Zaptos.",
        "",
        "Primeira recusa: " + hl(new Date(q.primeira)) + " (horario de Sao Paulo).",
        "Tentativas recusadas na ultima janela: " + q.n + ", em " + q.contatos.size + " conversa(s).",
        "",
        linha.pausou ? "Ja pausei os envios por ela — nada mais vai ser tentado ate religar." : "ATENCAO: nao consegui pausar os envios por ela.",
        "",
        "O que fazer: religar a sessao no painel do ZaptosWPP. Depois disso me avise para liberar a instancia e as conversas pendentes voltam a andar sozinhas.",
      ].join("\n");

      const avisos: any[] = [];
      const vistos = new Set<string>();
      for (const p of (resp || [])) {
        const k = fk8(p.fone);
        if (k && vistos.has(k)) continue; if (k) vistos.add(k);
        if (!p.contact_id) { avisos.push({ quem: p.nome, ok: false, motivo: "sem contact_id em copiloto_responsaveis" }); continue; }
        let env: any = { ok: false, motivo: "nenhuma instancia viva para avisar" };
        if (emissora) env = await enviarZaptos(String(p.contact_id), texto, String(emissora.instancia));
        if (!env?.ok) {
          const e = await enviarEmail(String(p.contact_id), "Instancia " + q.inst + " caiu no Zaptos", texto);
          avisos.push({ quem: p.nome, ok: !!e?.ok, canal: "email", zaptos_erro: env?.motivo, motivo: e?.motivo });
        } else avisos.push({ quem: p.nome, ok: true, canal: "zaptos:" + (emissora?.instancia || "?") });
      }
      linha.emissora = emissora?.instancia || null;
      linha.avisos = avisos;

      const okAlgum = avisos.some((a) => a.ok);
      await sb.from("instancia_queda").insert({
        instancia: q.inst, primeira_msg_em: q.primeira, ocorrencias: q.n, contatos: q.contatos.size,
        pausou: !!linha.pausou, avisou_em: okAlgum ? new Date().toISOString() : null,
        aviso_erro: okAlgum ? null : JSON.stringify(avisos).slice(0, 500),
      });
      linha.decisao = okAlgum ? "pausada e avisada" : "pausada, mas NAO consegui avisar";
      out.push(linha);
    }

    return j({ ok: true, ativo, dry, janela_min: janelaMin, mensagens: msgs.length, quedas: out.length, resultado: out });
  } catch (e) {
    return j({ ok: false, erro: String(e).slice(0, 400) }, 500);
  }
});
