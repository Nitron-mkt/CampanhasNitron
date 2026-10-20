// rep-aviso-enviar — manda a ultima mensagem sobre os leads de campanha aos 55 representantes.
//
// Ordem do gestor, 20/10, em tres partes, porque os tres grupos sao diferentes:
//   A (15) — o cliente disse que nao foi procurado: avisa que nao recebe mais leads por enquanto
//   B (5)  — o cliente confirmou que foi atendido: pesquisa, por que nao fechou?
//   C (35) — nunca soubemos nada: pergunta o que aconteceu
// Dizer a mesma frase para os tres seria acusar de nao atender cinco pessoas que o proprio
// cliente confirmou que atenderam. O texto de cada um ja esta pronto em rep_aviso_lead.
//
// Cadencia: o teto e 2 mensagens por minuto por instancia (fila_config.wpp_max_min). Esta funcao
// manda POUCAS por chamada, com pausa, e e o cron que repete — assim nenhuma chamada chega perto
// do limite de tempo da edge function e nada estoura o teto do Zaptos.
//
// Uso:  ?n=4   manda ate 4 e para   |   ?status=1   quanto falta
// Deploy: supabase functions deploy rep-aviso-enviar

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const URL_ = () => Deno.env.get("SUPABASE_URL")!;
const dorme = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rest(path: string, init?: RequestInit) {
  const k = srvKey();
  return await fetch(`${URL_()}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: k, Authorization: "Bearer " + k, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
}

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    if (u.searchParams.get("status") === "1") {
      const r = await rest("rep_aviso_lead?select=grupo,ok,enviado_em,rep,erro");
      const l: any[] = await r.json();
      const por: Record<string, any> = {};
      for (const x of l) {
        por[x.grupo] ||= { total: 0, enviados: 0, falharam: 0, faltam: 0 };
        por[x.grupo].total++;
        if (x.enviado_em && x.ok) por[x.grupo].enviados++;
        else if (x.enviado_em) por[x.grupo].falharam++;
        else por[x.grupo].faltam++;
      }
      return j({ ok: true, por_grupo: por,
                 falhas: l.filter((x) => x.enviado_em && !x.ok).map((x) => ({ rep: x.rep, erro: String(x.erro || "").slice(0, 120) })) });
    }

    const n = Math.min(Math.max(1, Number(u.searchParams.get("n") || 4) | 0), 6);
    const r = await rest(`rep_aviso_lead?select=id,rep,fone,grupo,texto&enviado_em=is.null&order=grupo,id&limit=${n}`);
    const fila: any[] = await r.json();
    if (!fila.length) return j({ ok: true, fim: "fila vazia" });

    const saida: any[] = [];
    for (const x of fila) {
      const env = await fetch(`${URL_()}/functions/v1/campanhas-enviar`, {
        method: "POST",
        headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" },
        // usar_dono: o contato do rep no CRM e da assistente dele (Camyla, Beatriz, Isadora...).
        // O numero de saida E o assignedTo, entao honrar o dono e o que faz a mensagem sair; e de
        // quebra espalha a carga entre instancias em vez de empilhar tudo numa so.
        body: JSON.stringify({ canal: "whatsapp", fone: x.fone, texto: x.texto,
                               instancia: "Camyla", usar_dono: true }),
      });
      const d = await env.json().catch(() => ({}));
      const ok = !!d?.ok;
      await rest(`rep_aviso_lead?id=eq.${x.id}`, {
        method: "PATCH",
        body: JSON.stringify({ enviado_em: new Date().toISOString(), ok,
                               erro: ok ? null : String(d?.motivo || "recusado").slice(0, 200) }),
      });
      saida.push({ rep: x.rep, grupo: x.grupo, ok });
      await dorme(25000);   // 25s entre uma e outra: abaixo do teto de 2/min por instancia
    }
    return j({ ok: true, mandados: saida.filter((s) => s.ok).length, detalhe: saida });
  } catch (e) {
    return j({ ok: false, erro: String(e).slice(0, 300) }, 500);
  }
});
