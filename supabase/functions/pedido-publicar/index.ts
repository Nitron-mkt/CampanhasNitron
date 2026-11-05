// pedido-publicar — aplica a CESTA GERAL na pagina de pedido que ja esta publicada.
//
// POR QUE ELA EXISTE, e nao um upload do bundle montado aqui. O `pedido.html` tem 3,8 MB. Subir o
// bundle inteiro exigiria a chave de servico na mao de quem publica, e o gestor proibiu chave de
// API no chat. Esta funcao resolve pelos dois lados: ela e chamada por SQL com a chave que mora no
// cofre do proprio banco (`vault.decrypted_secrets`), entao a chave nunca sai de dentro do
// Supabase; e ela PATCHEIA a pagina que esta no ar em vez de sobrescrever com uma copia local —
// o que tambem protege do problema de 03/09, de uma sessao publicar por cima do trabalho de outra.
//
// O QUE ELA FAZ. Le o `window.DATA` de dentro da pagina publicada, monta os segmentos `Geral` e
// `Geral-<Regiao>` a partir dos que ja estao la, corrige o desvio silencioso do `pickSeg()` e
// regrava. E IDEMPOTENTE: rodar de novo recalcula do zero, nunca empilha.
//
// A CESTA GERAL, e por que ela precisava existir. A pagina escolhe a cesta pelo pedaco antes do
// "~" no link. Quando esse pedaco nao e uma cesta conhecida, o `pickSeg()` caia em `segIds[0]` —
// que e o Sudeste-R01, a cesta de Casa de Utilidades do Sudeste. Uma farmacia no Para via
// exatamente ela, calada. E nao e caso raro: o CNAE do lead pode nao cair em R01..R10, e ha
// combinacao regiao x ramo que nao existe (o Norte nao tem R03, R07, R08, R09 nem R10).
//
// COMO A CESTA GERAL E MONTADA — pela mesma regua das outras, penetracao real medida na base de
// clientes. Para cada regiao, a penetracao de cada produto e a media ponderada das cestas daquela
// regiao, com peso igual ao numero de clientes de cada ramo. Produto que nao entrou na cesta de um
// ramo conta 0 ali: e conservador e e o que o dado diz. Preco, descricao, embalagem e foto saem do
// CATALOGO da propria pagina — a cesta geral nao inventa nenhum numero novo, e por isso o frete
// CIF do `~F<perc>` continua valendo nela exatamente como nas outras.
//
// O FRETE CONTINUA SENDO DO LINK. O `aplicaFreteCIF()` multiplica o preco de todo item de
// `D.catalogo` e de `D.segs[*]` — inclusive os novos. Entao `#Geral-Sudeste~L123~F8.9` mostra
// preco final com entrega, igual a qualquer cesta de ramo.
//
// Uso (por SQL, com a chave do cofre):
//   select net.http_post(url := '.../pedido-publicar', headers := ...);
//   ?dry=1  calcula e devolve o resumo, sem publicar

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const URL_ = () => Deno.env.get("SUPABASE_URL")!;
const PAGINA = "pedido.html";
const N_ITENS = 56;                 // mesmo tamanho das cestas cheias
const REGIAO_ROTULO = "Mix Geral — os mais vendidos da regiao";
const BRASIL_ROTULO = "Mix Geral — os mais vendidos";

type Item = {
  cod: number; ref: string; desc: string; linha: string; emb: number; preco: number;
  fardos: number; curva?: string; pen?: number; tipo?: string; img?: string;
};
type Seg = { reg: string; sig: string; ramo: string; base: number; itens: Item[] };

// Monta UMA cesta geral a partir de um conjunto de cestas de ramo.
function monta(segs: Record<string, Seg>, ids: string[], cat: Map<number, Item>,
               reg: string, rotulo: string): { seg: Seg; valor: number } {
  const baseTotal = ids.reduce((s, i) => s + (segs[i].base || 0), 0) || 1;
  // acumula penetracao ponderada; `peso` guarda a maior base vista, para herdar dela a quantidade
  const acc = new Map<number, { pen: number; peso: number; fardos: number; curva: string }>();
  for (const i of ids) {
    const b = segs[i].base || 0;
    for (const it of segs[i].itens || []) {
      const a = acc.get(it.cod) || { pen: 0, peso: -1, fardos: 1, curva: "C" };
      a.pen += (Number(it.pen) || 0) * b;
      if (b > a.peso) { a.peso = b; a.fardos = Number(it.fardos) || 1; a.curva = it.curva || "C"; }
      acc.set(it.cod, a);
    }
  }
  const itens: Item[] = [];
  for (const [cod, a] of [...acc.entries()].sort((x, y) => y[1].pen - x[1].pen).slice(0, N_ITENS)) {
    const c = cat.get(cod);
    if (!c) continue;   // produto fora do catalogo nao entra: sem preco de catalogo nao ha preco
    itens.push({
      cod, ref: c.ref, desc: c.desc, linha: c.linha, emb: c.emb, preco: c.preco,
      fardos: a.fardos, curva: a.curva, pen: Math.round((a.pen / baseTotal) * 1000) / 1000,
      tipo: "sug", img: c.img,
    });
  }
  const valor = itens.reduce((s, i) => s + i.preco * i.emb * i.fardos, 0);
  return { seg: { reg, sig: "GERAL", ramo: rotulo, base: baseTotal, itens }, valor: Math.round(valor * 100) / 100 };
}

Deno.serve(async (req) => {
  try {
    const dry = new URL(req.url).searchParams.get("dry") === "1";
    const publicUrl = `${URL_()}/storage/v1/object/public/app/${PAGINA}`;

    const r = await fetch(publicUrl, { headers: { "cache-control": "no-cache" } });
    if (!r.ok) return j({ ok: false, erro: `nao li a pagina publicada (HTTP ${r.status})` }, 500);
    let html = await r.text();
    const bytesAntes = html.length;

    // ---- extrai o window.DATA de dentro da pagina ----
    const ini = html.indexOf("window.DATA=");
    if (ini < 0) return j({ ok: false, erro: "nao achei window.DATA na pagina publicada" }, 500);
    const fim = html.indexOf("\n</script>", ini);
    if (fim < 0) return j({ ok: false, erro: "nao achei o fim do bloco window.DATA" }, 500);
    const bruto = html.slice(ini + "window.DATA=".length, fim).trim().replace(/;$/, "");
    let D: { segs: Record<string, Seg>; catalogo: Item[] };
    try { D = JSON.parse(bruto); } catch (e) { return j({ ok: false, erro: "window.DATA nao e JSON: " + String(e).slice(0, 120) }, 500); }

    // ---- so as cestas de RAMO entram na conta (senao a segunda rodada comeria a propria saida) ----
    const deRamo = Object.keys(D.segs).filter((k) => k !== "Geral" && !k.startsWith("Geral-"));
    if (!deRamo.length) return j({ ok: false, erro: "nenhuma cesta de ramo na pagina" }, 500);
    const cat = new Map<number, Item>((D.catalogo || []).map((c) => [c.cod, c]));

    const porRegiao: Record<string, string[]> = {};
    for (const k of deRamo) (porRegiao[D.segs[k].reg] ||= []).push(k);

    const resumo: Array<{ cesta: string; ramos: number; itens: number; subtotal: number }> = [];
    const novos: Record<string, Seg> = {};
    for (const reg of Object.keys(porRegiao).sort()) {
      const { seg, valor } = monta(D.segs, porRegiao[reg], cat, reg, REGIAO_ROTULO);
      const chave = "Geral-" + reg.replace(/\s+/g, "-");
      novos[chave] = seg;
      resumo.push({ cesta: chave, ramos: porRegiao[reg].length, itens: seg.itens.length, subtotal: valor });
    }
    const nac = monta(D.segs, deRamo, cat, "Brasil", BRASIL_ROTULO);
    novos["Geral"] = nac.seg;
    resumo.push({ cesta: "Geral", ramos: deRamo.length, itens: nac.seg.itens.length, subtotal: nac.valor });

    if (dry) return j({ ok: true, dry: true, cestas_de_ramo: deRamo.length, resumo });

    // ---- grava os segmentos novos de volta no bloco ----
    for (const [k, v] of Object.entries(novos)) D.segs[k] = v;
    html = html.slice(0, ini) + "window.DATA=" + JSON.stringify(D) + ";" + html.slice(fim);

    // ---- as duas correcoes de codigo, idempotentes ----
    const patches: Array<[string, string, string]> = [
      ["REGORD",
       'var REGORD={Sudeste:1,Nordeste:2,Sul:3,"Centro-Oeste":4,Norte:5};',
       'var REGORD={Brasil:0,Sudeste:1,Nordeste:2,Sul:3,"Centro-Oeste":4,Norte:5};'],
      // o desvio silencioso: cesta desconhecida caia no Sudeste-R01
      ["pickSeg",
       'return (h&&D.segs[h])?h:segIds[0];}',
       'if(h&&D.segs[h]) return h; return D.segs["Geral"]?"Geral":segIds[0];}'],
    ];
    const aplicados: Record<string, string> = {};
    for (const [nome, de, para] of patches) {
      if (html.includes(para)) { aplicados[nome] = "ja estava"; continue; }
      const n = html.split(de).length - 1;
      if (n !== 1) { aplicados[nome] = `NAO aplicado (achei ${n} ocorrencias)`; continue; }
      html = html.replace(de, para);
      aplicados[nome] = "aplicado";
    }

    const up = await fetch(`${URL_()}/storage/v1/object/app/${PAGINA}`, {
      method: "PUT",
      headers: {
        apikey: srvKey(), Authorization: "Bearer " + srvKey(),
        "Content-Type": "text/html; charset=utf-8", "x-upsert": "true", "cache-control": "max-age=60",
      },
      body: html,
    });
    const txt = await up.text();
    return j({
      ok: up.ok, status: up.status, resp: txt.slice(0, 200),
      bytes_antes: bytesAntes, bytes_depois: html.length,
      cestas_de_ramo: deRamo.length, resumo, patches: aplicados, url: publicUrl,
    }, up.ok ? 200 : 500);
  } catch (e) {
    return j({ ok: false, erro: String(e).slice(0, 300) }, 500);
  }
});
