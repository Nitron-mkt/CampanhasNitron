// Cloudflare Worker que serve o "Pedido Nitron" — o montador de pedido que o cliente recebe.
//
// Por que existe: o Supabase nao serve HTML. O Storage devolve `content-type: text/plain` com
// `content-security-policy: default-src 'none'; sandbox` (conferido em 14/10/2026 no proprio
// gestor.html), entao quem abre o link do Storage ve o codigo-fonte. O Worker busca o arquivo e
// devolve com o Content-Type certo — mesmo padrao do gestor-worker.js.
//
// O app e UM arquivo so: o order_app.html com o app_data.js (catalogo + 40 cestas) e o app_img.js
// (miniaturas embutidas) colados dentro. Sao 3,8 MB. Virou arquivo unico para poder subir pelo
// `host-upload`, que ja existe neste projeto e grava no bucket `app` — assim publicar o pedido e o
// mesmo gesto de publicar o painel, sem bucket novo e sem funcao nova.
//
// O segmento do cliente vai no HASH da URL, que nao chega ao servidor:
//   https://<dominio>/#Sudeste-R01        -> cliente (visao limpa)
//   https://<dominio>/#Sudeste-R01~adm    -> interno (curva, penetracao, seletor dos 40)
// Por isso qualquer caminho entrega a mesma pagina.
//
// Publicar o app:  POST host-upload?path=pedido.html com o HTML cru no corpo (ver README).
// Deploy do Worker: wrangler deploy   (ou colar no editor do dashboard da Cloudflare)

const BASE = "https://bwbeieumxcuomtrvlqxs.supabase.co/storage/v1/object/public/app/";
const ARQ = "pedido.html";

// 3,8 MB por request: sem cache de borda, toda abertura puxaria o arquivo inteiro do Storage.
// 5 minutos e o meio-termo — republicar aparece rapido e o Storage nao vira gargalo.
// `?v=<qualquer coisa>` fura o cache quando precisar ver a versao nova na hora.
const CACHE_S = 300;

export default {
  async fetch(req) {
    const u = new URL(req.url);
    const bust = u.searchParams.get("v");
    const alvo = BASE + ARQ + (bust ? "?v=" + encodeURIComponent(bust) : "");

    const r = await fetch(alvo, { cf: { cacheTtl: bust ? 0 : CACHE_S, cacheEverything: !bust } });
    if (!r.ok) {
      return new Response("erro ao carregar o pedido (" + r.status + ")", {
        status: 502,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    return new Response(r.body, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        // o Storage manda CSP sandbox; se vazar, o navegador nao renderiza
        "cache-control": bust ? "no-store" : "public, max-age=" + CACHE_S,
        // a pagina carrega a tabela de precos: nao e para o Google indexar
        "x-robots-tag": "noindex, nofollow",
      },
    });
  },
};
