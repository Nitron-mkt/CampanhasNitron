// nitronmob-rampa — decide QUANTOS e-mails do lancamento saem hoje, e manda o nitronmob-disparar
// mandar. Nao envia nada por conta propria: so faz a conta e aperta o botao.
//
// Ordem do gestor, 20/10: "continue amanha e vai aumentando a quantidade para nao cair tanto no
// SPAM". A rampa mora em copiloto_config.nitronmob_rampa — um teto por DIA, em ordem:
// '100,250,500,1000,2000,2000'. O dia 1 foi hoje, com 100. Quem muda o ritmo e um UPDATE, nao um
// deploy.
//
// Separada do nitronmob-disparar de proposito: aquela funcao e a que toca em 5 mil clientes, e
// mexer nela para acrescentar um cron seria mexer no que ja esta validado. Aqui o raio e so a
// decisao.
//
// O FREIO: se a taxa de rejeicao passar de nitronmob_rejeicao_max (5%), o dia nao comeca e o
// gestor e avisado na hora. Dominio novo que insiste com rejeicao alta leva a base inteira para o
// spam, e dai nao tem volta — e o unico caso em que isto para sozinho. Parar de mandar e-mail
// promocional nao e travar campanha de ninguem: e a diferenca entre um lote perdido e o dominio.
//
// Uso:
//   ?dry=1   mostra a conta do dia sem mandar nada
//   (sem nada) o modo do cron
//
// Deploy: supabase functions deploy nitronmob-rampa

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const URL_ = () => Deno.env.get("SUPABASE_URL")!;

async function rest(path: string) {
  const k = srvKey();
  return await fetch(`${URL_()}/rest/v1/${path}`, { headers: { apikey: k, Authorization: "Bearer " + k } });
}
async function cfg(): Promise<Record<string, string>> {
  const r = await rest("copiloto_config?select=chave,valor");
  const o: Record<string, string> = {};
  for (const x of (await r.json()) || []) o[x.chave] = x.valor;
  return o;
}
async function avisar(fone: string, texto: string) {
  await fetch(`${URL_()}/functions/v1/campanhas-enviar`, {
    method: "POST",
    headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ canal: "whatsapp", fone, texto, instancia: "Camyla", usar_dono: true }),
  }).catch(() => {});
}

const diaSP = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

Deno.serve(async (req) => {
  try {
    const u = new URL(req.url);
    const dry = u.searchParams.get("dry") === "1";
    const c = await cfg();
    if (String(c.nitronmob_auto || "nao").toLowerCase() !== "sim" && !dry)
      return j({ ok: true, skip: "nitronmob_auto != sim" });

    const h = await rest("nitronmob_envio?select=enviado_em,ok,entrega");
    const linhas: any[] = h.ok ? await h.json() : [];
    const hoje = diaSP(new Date());
    const dias = new Set(linhas.map((x) => diaSP(new Date(x.enviado_em))));
    const enviadosHoje = linhas.filter((x) => diaSP(new Date(x.enviado_em)) === hoje).length;
    // o dia da rampa so avanca quando o dia MUDA, nao a cada chamada
    const diaRampa = dias.has(hoje) ? dias.size : dias.size + 1;

    const rampa = String(c.nitronmob_rampa || "100,250,500,1000,2000,2000")
      .split(",").map((x) => parseInt(x.trim(), 10) || 0).filter((x) => x > 0);
    const cap = rampa[Math.min(diaRampa, rampa.length) - 1] || 0;

    // taxa de rejeicao so vale com amostra: abaixo de 50 conferidos, 1 falha vira 2% ou 8%
    // conforme o acaso. Foi o que aconteceu no lote 1 — 1 em 12 parecia 8%, nos 100 deu 1%.
    const conferidos = linhas.filter((x) => x.ok && x.entrega);
    const rejeitados = conferidos.filter((x) => x.entrega === "failed").length;
    const taxa = conferidos.length >= 50 ? (100 * rejeitados) / conferidos.length : 0;
    const limite = Number(c.nitronmob_rejeicao_max || 5);
    const fone = String(c.nitronmob_avisar_fones || "").split(/[,;]/)[0].replace(/\D/g, "");

    const conta = { dia_da_rampa: diaRampa, teto_do_dia: cap, enviados_hoje: enviadosHoje,
                    falta_hoje: Math.max(0, cap - enviadosHoje),
                    conferidos: conferidos.length, rejeitados, taxa_rejeicao: taxa.toFixed(1) + "%", limite: limite + "%" };

    if (taxa > limite) {
      if (!dry && fone) await avisar(fone,
        "NITRON-MOB: a rampa de e-mail PAROU sozinha.\n\nTaxa de rejeicao em " + taxa.toFixed(1) +
        "%, acima do limite de " + limite + "%.\n\nNenhum e-mail novo sai ate alguem olhar. Insistir com rejeicao alta num dominio novo joga a base inteira no spam.");
      return j({ ok: false, parou: "rejeicao acima do limite", ...conta });
    }
    if (conta.falta_hoje <= 0) return j({ ok: true, skip: "teto do dia atingido", ...conta });
    if (dry) return j({ ok: true, previa: true, mandaria_agora: Math.min(40, conta.falta_hoje), ...conta });

    // o disparador tem teto de 40 por chamada; o cron roda de novo em alguns minutos e continua
    const r = await fetch(`${URL_()}/functions/v1/nitronmob-disparar?n=40&lote=${diaRampa}`, {
      headers: { Authorization: "Bearer " + srvKey() },
    });
    const d = await r.json().catch(() => ({}));
    return j({ ok: true, ...conta, disparo: { mandados: d?.mandados ?? null, falhas: (d?.falhas || []).length } });
  } catch (e) {
    return j({ ok: false, erro: String(e).slice(0, 300) }, 500);
  }
});
