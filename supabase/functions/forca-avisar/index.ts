// forca-avisar — O LEAD BARRADO NO CADASTRO PRECISA DE RESPOSTA.
//
// Ordem do gestor em 18/11: "quando acontecer de barrar na Inscricao Estadual tem que mandar para
// o lead que nao consegue continuar com o pedido".
//
// E, no mesmo dia, o limite dessa ordem, com todas as letras: "nao e para fazer teste nem disparo
// desse novo link para esses clientes que ja vieram, tudo e para os clientes novos". Por isso o
// corte fixo abaixo (`forca_aviso_desde`) existe ao lado da janela de horas.
//
// O QUE ACONTECIA ATE AQUI: o ERP recusava o cadastro, a `forca-cadastro` gravava `forca_erro` e
// passava a PULAR aquele lead para sempre — e a Nina, do outro lado, seguia dizendo "ja estou
// preparando o seu acesso" a cada vez que chamava o `link_pedido`. Um acesso que nunca ia chegar.
// Silencio depois de o lojista entregar CNPJ, CEP e e-mail e o pior final possivel desta jornada.
//
// POR QUE E FUNCAO PROPRIA, e nao mais um bloco na `forca-cadastro`:
//   1. A `forca-cadastro` roda de 5 em 5 min abrindo PEDIDO DE VERDADE no ERP. Publicar 38 KB por
//      cima dela para acrescentar uma mensagem e risco sem motivo.
//   2. Regra nova que fala sozinha com o lojista tem de poder ser desligada sem publicar por cima
//      de quem esta atendendo — `forca_aviso_ativo`, mais o cron. E a licao de 16/09.
//
// O TEXTO E ESCRITO EM CODIGO, NAO PELO MODELO. Ele diz "nao consigo seguir com o pedido", que e
// uma porta se fechando: o motivo nao pode ser improvisado nem virar promessa de prazo.
//
// E ELE PERGUNTA EM VEZ DE ACUSAR. O que a gente sabe e que o ERP pediu a Inscricao Estadual e nao
// achou — nao sabemos se a empresa e isenta, se tem IE fora da base, ou se a loja esta noutro
// CNPJ. Dizer "a sua empresa nao pode comprar" seria afirmar o que nao foi medido. Dos quatro
// primeiros casos, TRES eram empresa de servico (contabilidade, consultoria, apoio administrativo)
// e UM era lojista de verdade (comercio varejista de saneantes, CNAE 4789-0/05). A mesma frase tem
// de servir aos dois sem mentir para nenhum.
//
// Uso (chave de servico no Authorization):
//   ?dry=1      quem receberia, com o texto pronto, sem mandar nada
//   ?limite=N   manda ate N (respeita `forca_aviso_lote`)
//   ?lead=N     um so, ignorando a janela de horas — mas NUNCA o corte fixo

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o, null, 2), { status: s, headers: { "Content-Type": "application/json" } });

const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const URL_ = () => Deno.env.get("SUPABASE_URL")!;

// O que o ERP devolve e "Insc. Estadual, deve ser informada." — abreviado e com ponto no meio.
// O padrao cobre "Insc. Estadual", "Inscricao Estadual" e "Inscrição Estadual".
const RE_IE = /insc\w*\.?\s*estadual/i;

// O nome vem como a pessoa digitou, e muita gente escreve tudo em minuscula. "Oi, wellington!"
// numa mensagem que ja e uma noticia ruim soa descuidado — a primeira letra sobe.
const primeiroNome = (n: unknown) => {
  const p = String(n || "").trim().split(/\s+/)[0] || "";
  return p ? p.charAt(0).toUpperCase() + p.slice(1) : "";
};

async function rest(path: string, init?: RequestInit) {
  const k = srvKey();
  return await fetch(`${URL_()}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: k, Authorization: "Bearer " + k, "Content-Type": "application/json", ...(init?.headers || {}) },
  });
}

async function cfg(chave: string, padrao = ""): Promise<string> {
  try {
    const q = await rest(`copiloto_config?select=valor&chave=eq.${chave}`);
    const v = q.ok ? String((await q.json())[0]?.valor ?? "").trim() : "";
    return v || padrao;
  } catch { return padrao; }
}

async function enviar(contact_id: string, texto: string, instancia: string) {
  const r = await fetch(URL_() + "/functions/v1/campanhas-enviar", {
    method: "POST", headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ canal: "whatsapp", texto, instancia, contact_id }),
    signal: AbortSignal.timeout(90_000),
  });
  return await r.json().catch(() => ({ ok: false, motivo: "resposta ilegivel do campanhas-enviar" }));
}

async function patch(id: number, campos: Record<string, unknown>) {
  await rest(`copiloto_lead?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(campos) });
}

// A MENSAGEM. Tres movimentos, nesta ordem, e cada um tem um porque:
//   1. diz que e um RETORNO — ele esta esperando um acesso, nao pode levar um assunto novo;
//   2. diz o que barrou e que o pedido NAO SEGUE, sem rodeio e sem culpar ninguem;
//   3. abre as duas saidas reais (tem IE / e isenta ou e outro CNPJ) e pede que ele responda.
// Nao promete prazo, nao diz "vou verificar e te aviso", nao manda ele procurar o contador.
function textoDoAviso(L: { nome: string }): string {
  const nome = primeiroNome(L.nome);
  return [
    nome ? `Oi, ${nome}! Vim te dar um retorno.` : "Oi! Vim te dar um retorno.",
    "",
    "Na hora de abrir o seu cadastro aqui, o sistema pediu a Inscricao Estadual do CNPJ e nao encontrou. Sem ela eu nao consigo seguir com o pedido: a nossa venda e para revenda e sai com nota de mercadoria.",
    "",
    "Se a sua empresa tiver Inscricao Estadual, me manda o numero por aqui que eu retomo de onde a gente parou.",
    "",
    "Se ela for isenta, ou se a loja estiver noutro CNPJ, me conta tambem — eu passo para a nossa equipe ver o caminho certo com voce.",
  ].join("\n");
}

Deno.serve(async (req) => {
  try {
    const auth = req.headers.get("Authorization") || "";
    const aceitas = [Deno.env.get("SRV_JWT"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")]
      .filter(Boolean).map((k) => "Bearer " + k);
    if (!aceitas.includes(auth)) return j({ ok: false, erro: "nao autorizado" }, 401);

    const u = new URL(req.url);
    const dry = u.searchParams.get("dry") === "1";
    const soLead = Number(u.searchParams.get("lead") || 0) || 0;

    const janelaH = Number(await cfg("forca_aviso_janela_h", "36")) || 36;
    const lote = Math.max(1, Math.min(Number(u.searchParams.get("limite") || await cfg("forca_aviso_lote", "3")) || 3, 10));
    const inst = await cfg("forca_link_instancia", "Nina");
    const ligado = (await cfg("forca_aviso_ativo", "nao")).toLowerCase() === "sim";

    // Hora de Sao Paulo, fixa. Esta mensagem e iniciativa NOSSA e e uma noticia ruim: nao chega as
    // 2 da manha, e nao chega no domingo.
    const brt = new Date(Date.now() - 3 * 3600 * 1000);
    const hIni = parseInt(await cfg("forca_cutuca_hora_ini", "9")) || 9;
    const hFim = parseInt(await cfg("forca_cutuca_hora_fim", "20")) || 20;
    const fora = brt.getUTCDay() === 0 ? "domingo"
               : (brt.getUTCHours() < hIni || brt.getUTCHours() >= hFim)
                 ? `fora de ${hIni}h-${hFim}h de Sao Paulo (agora ${brt.getUTCHours()}h)` : null;

    // A mesma porta da `forca-cadastro`: lead da landing OU lead que a Nina encaminhou.
    const origens = (await cfg("forca_origens", "nitron-direto-lp%,lp-nitron%")).split(",").map((x) => x.trim()).filter(Boolean);
    const filtro = "(" + [...origens.map((o) => `origem.ilike.${o}`), "forca_pedir_em.not.is.null"].join(",") + ")";
    const sel = "id,nome,empresa,cnpj,contact_id,forca_erro,forca_aviso_em,forca_pedir_em,criado";
    const url = soLead
      ? `copiloto_lead?select=${sel}&id=eq.${soLead}`
      : `copiloto_lead?select=${sel}&or=${filtro}&forca_erro=not.is.null&forca_aviso_em=is.null` +
        `&descartado_em=is.null&contact_id=not.is.null&order=criado.desc&limit=200`;
    const q = await rest(url);
    const todos: any[] = q.ok ? await q.json() : [];

    // SO A INSCRICAO ESTADUAL. Para as outras recusas eu nao sei o que dizer ao lojista sem
    // inventar, e `CLIENTE_COM_REPRESENTANTE`/`CLIENTE_CLUBE` nem sao erro: ali ele ja tem quem o
    // atenda, e quem fala com ele e uma pessoa.
    const doIE = todos.filter((L) => RE_IE.test(String(L.forca_erro || "")));

    // DUAS TRAVAS, e a segunda e a que o gestor pediu com todas as letras em 18/11:
    //   "nao e para fazer teste nem disparo desse novo link para esses clientes que ja vieram,
    //    tudo e para os clientes novos".
    //
    // 1) A JANELA, igual a do link: conta do maior entre nascer e ser encaminhado, porque um lead
    //    que a Nina acabou de atender E o fluxo de hoje mesmo que a linha seja antiga.
    // 2) O CORTE FIXO (`forca_aviso_desde`): uma data, nao um intervalo. A janela e aritmetica e
    //    anda com o relogio; o corte e uma linha no chao. Lead que ja existia quando a regra
    //    nasceu NAO recebe, hoje nem daqui a um mes. Alargar para tras e UPDATE nessa chave, e e
    //    decisao do gestor — do mesmo jeito que o `reativa_max_dias` segurou a onda de 03/11.
    //    O `?lead=` fura a janela de horas, mas NAO fura o corte: ele existe para destravar um
    //    caso novo, nao para alcancar quem ficou para tras.
    const corte = Date.now() - janelaH * 3600_000;
    const desdeTxt = await cfg("forca_aviso_desde", "");
    const desde = desdeTxt ? new Date(desdeTxt).getTime() : 0;
    const quando = (L: any) =>
      Math.max(new Date(L.criado || 0).getTime(), new Date(L.forca_pedir_em || 0).getTime());
    const recente = (L: any) => quando(L) >= corte && quando(L) >= desde;
    const cands = soLead ? doIE.filter((L: any) => quando(L) >= desde) : doIE.filter(recente);
    const foraDaJanela = doIE.length - cands.length;
    const fila = cands.slice(0, lote);

    if (dry || !ligado || (fora && !soLead)) {
      return j({
        ok: true, previa: true, ligado, instancia: inst, janela_h: janelaH,
        fora_do_horario: fora || undefined,
        barrados_na_ie: doIE.length, a_avisar: cands.length, fora_da_janela: foraDaJanela,
        so_a_partir_de: desdeTxt || "sem corte configurado",
        motivo: ligado ? null : "forca_aviso_ativo nao esta 'sim' — ligar e UPDATE em copiloto_config",
        fila: fila.map((L) => ({ lead: L.id, nome: L.nome, empresa: L.empresa,
                                 erro: String(L.forca_erro || "").slice(0, 120), texto: textoDoAviso(L) })),
      });
    }

    const feito: Record<string, unknown>[] = [];
    for (const L of fila) {
      // ANTES do envio, como em todo o resto do projeto: o envio leva 12s de checagem de entrega,
      // e duas rodadas que se cruzam mandariam a mesma noticia duas vezes. (`toques`, 02/10.)
      await patch(L.id, { forca_aviso_em: new Date().toISOString(), forca_aviso_erro: null });
      try {
        const env = await enviar(L.contact_id, textoDoAviso(L), inst);
        if (env?.ok) feito.push({ lead: L.id, nome: L.nome, acao: "avisado" });
        else {
          await patch(L.id, { forca_aviso_erro: String(env?.motivo || "recusado").slice(0, 300) });
          feito.push({ lead: L.id, nome: L.nome, acao: "recusado", motivo: env?.motivo });
        }
      } catch (e) {
        await patch(L.id, { forca_aviso_erro: String(e).slice(0, 300) });
        feito.push({ lead: L.id, nome: L.nome, acao: "erro", detalhe: String(e).slice(0, 200) });
      }
    }
    return j({ ok: true, instancia: inst, barrados_na_ie: doIE.length,
               avisados: feito.filter((f) => f.acao === "avisado").length,
               restam: cands.length - fila.length, fora_da_janela: foraDaJanela, feito });
  } catch (e) {
    return j({ ok: false, erro: String(e).slice(0, 400) }, 500);
  }
});
