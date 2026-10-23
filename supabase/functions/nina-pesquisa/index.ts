// nina-pesquisa — "o que faltou para concluir a compra?"
//
// Ordem do gestor em 23/10: "para toda a galera que morreu e também quem clicou e tudo, quero que
// volte a falar com eles pedindo informação sobre o que faltou para concluir a compra conosco".
//
// POR QUE O TEXTO E MONTADO EM CODIGO, e nao escrito pelo modelo a cada envio: isto e uma PESQUISA.
// Se cada pessoa recebe uma pergunta diferente, as respostas nao se somam e no fim nao da para
// dizer "X disseram que foi preco". O texto ja esta pronto em lead_pesquisa.texto, montado por
// grupo, e sai igual para todo mundo do mesmo grupo. A conversa DEPOIS da resposta continua sendo
// da Nina, com o cerebro dela — o que e fixo e so a pergunta.
//
// TRES GRUPOS, tres perguntas, porque a historia de cada um e diferente:
//   clicou    — abriu a pagina de pedido e nao concluiu
//   rep       — foi encaminhado para representante/venda interna e a conversa morreu la
//   conversou — falou com a Nina e parou antes de qualquer encaminhamento
// Perguntar "ninguem te procurou?" para quem nunca foi encaminhado seria inventar uma falha nossa
// que nao aconteceu; perguntar "o que achou da pagina?" para quem nunca a viu e pior ainda.
//
// QUEM FICA DE FORA, e isso e trava, nao preferencia:
//   - representante (snap_rep) e numero da casa (copiloto_responsaveis) — filtrados ao montar a fila
//   - quem a Nina falou nas ultimas 24h entra como `espera`, nao como `fila`: mandar pesquisa em
//     cima de uma conversa viva atropela a propria conversa
//   - contato que hoje pertence a um humano no CRM: o campanhas-enviar RECUSA, e a recusa e certa.
//     Aqui isso vira `pulado`, nao `recusado` — nao e erro, e um atendente cuidando da pessoa.
//
// CADENCIA: o teto e 2 mensagens por minuto por instancia. Manda poucas por chamada, com pausa, e
// quem repete e o cron — mesmo desenho do rep-aviso-enviar, que foi o que fez 54 de 55 chegarem.
//
// Uso:  ?n=2   manda ate 2 e para   |   ?status=1   quanto falta   |   ?grupo=rep   so um grupo
//       ?liberar_espera=1   passa para a fila quem ja esfriou (24h sem a Nina falar)
// Deploy: supabase functions deploy nina-pesquisa

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

// A recusa "o contato e de FULANO no CRM" nao e falha de envio: e um humano com a conversa na mao.
// Distinguir isso de instancia caida importa, porque uma pede para parar e a outra pede para voltar.
const ehDono = (m: string) => /contato e d[ao] |dono|assignedTo|pertence/i.test(m);

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);

    if (u.searchParams.get("status") === "1") {
      const r = await rest("lead_pesquisa?select=grupo,situacao,ok,erro,resposta");
      const l: any[] = await r.json();
      const por: Record<string, any> = {};
      for (const x of l) {
        por[x.grupo] ||= { total: 0, fila: 0, espera: 0, enviados: 0, recusados: 0, pulados: 0, responderam: 0 };
        const p = por[x.grupo];
        p.total++;
        if (x.situacao === "fila") p.fila++;
        else if (x.situacao === "espera") p.espera++;
        else if (x.situacao === "enviado") p.enviados++;
        else if (x.situacao === "pulado") p.pulados++;
        else if (x.situacao === "recusado") p.recusados++;
        if (x.resposta) p.responderam++;
      }
      return j({ ok: true, por_grupo: por });
    }

    // quem estava em conversa viva quando a fila foi montada e ja esfriou entra agora
    if (u.searchParams.get("liberar_espera") === "1") {
      const corte = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const r = await rest(`lead_pesquisa?select=id,lead_id&situacao=eq.espera`);
      const esp: any[] = await r.json();
      let liberados = 0;
      for (const x of esp) {
        const rl = await rest(`copiloto_lead?select=ultima_resposta_em&id=eq.${x.lead_id}`);
        const [L] = await rl.json();
        if (L?.ultima_resposta_em && L.ultima_resposta_em < corte) {
          await rest(`lead_pesquisa?id=eq.${x.id}`, { method: "PATCH", body: JSON.stringify({ situacao: "fila" }) });
          liberados++;
        }
      }
      return j({ ok: true, em_espera: esp.length, liberados });
    }

    const n = Math.min(Math.max(1, Number(u.searchParams.get("n") || 1) | 0), 3);
    const g = String(u.searchParams.get("grupo") || "").trim();
    const filtro = g ? `&grupo=eq.${encodeURIComponent(g)}` : "";
    // ordem: quem clicou primeiro (tem mais a dizer), depois quem foi encaminhado, depois o resto
    const r = await rest(`lead_pesquisa?select=id,lead_id,nome,fone,grupo,texto&situacao=eq.fila${filtro}&order=grupo.asc,dias_parado.desc&limit=${n}`);
    const fila: any[] = await r.json();
    if (!fila.length) return j({ ok: true, fim: "fila vazia", grupo: g || "todos" });

    const saida: any[] = [];
    for (const x of fila) {
      const env = await fetch(`${URL_()}/functions/v1/campanhas-enviar`, {
        method: "POST",
        headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" },
        body: JSON.stringify({ canal: "whatsapp", fone: x.fone, texto: x.texto, instancia: "Nina", espera_ms: 45000 }),
      });
      const d = await env.json().catch(() => ({}));
      const ok = !!d?.ok;
      const motivo = String(d?.motivo || "").slice(0, 250);
      const situacao = ok ? "enviado" : (ehDono(motivo) ? "pulado" : "recusado");
      await rest(`lead_pesquisa?id=eq.${x.id}`, {
        method: "PATCH",
        body: JSON.stringify({ situacao, enviado_em: new Date().toISOString(), ok, erro: ok ? null : motivo }),
      });
      saida.push({ lead: x.lead_id, nome: x.nome, grupo: x.grupo, situacao, motivo: ok ? undefined : motivo });
      // a instancia caiu: parar a rodada inteira. Insistir numa sessao morta foi o que gerou 200
      // envios recusados em 02/10.
      if (d?.instancia_caiu) return j({ ok: false, parou: "instancia caiu", detalhe: saida });
      await dorme(8000);
    }
    return j({ ok: true, mandados: saida.filter((s) => s.situacao === "enviado").length, detalhe: saida });
  } catch (e) {
    return j({ ok: false, erro: String(e).slice(0, 300) }, 500);
  }
});
