// pedido-visita — registra que alguem ABRIU a pagina de pedido.
//
// Por que existe: ate 20/10 ninguem sabia quantos dos lojistas que receberam o link chegaram a
// abrir a pagina. O Worker da Cloudflare nao registra visita e nao havia pixel, entao o relatorio
// do pedido-status dizia, com todas as letras, "isto eu nao sei". O gestor perguntou quantos
// clicaram e a resposta honesta era nao da para saber. Esta funcao fecha esse vao.
//
// Como e chamada: do navegador do lojista, sem autenticacao nenhuma — igual ao
// nina-pedido-recebido, que ja e publico pelo mesmo motivo (a pagina nao pode carregar chave).
// Deploy OBRIGATORIAMENTE com --no-verify-jwt, senao o navegador leva 401 calado.
//
// O que ela NAO faz: nao grava IP, nao grava cookie, nao segue ninguem pela internet. Grava o
// segmento (que e a cesta, nao a pessoa), a marca do link quando ela existe, e um id de aba para
// que recarregar a pagina nao vire visita nova.
//
// Deploy: supabase functions deploy pedido-visita --no-verify-jwt

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const URL_ = () => Deno.env.get("SUPABASE_URL")!;
const corta = (s: unknown, n: number) => String(s ?? "").slice(0, n) || null;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // A pagina manda e esquece: ela nao espera resposta e nao mostra erro. Por isso aqui nada
  // devolve 500 por uma visita perdida — perder um registro e melhor que atrapalhar a compra.
  try {
    const b = await req.json().catch(() => ({} as any));
    const marca = corta(b.marca, 40);
    // ~L23 -> 23. Qualquer outra marca fica guardada em texto e lead_id vazio.
    const m = /^L(\d{1,9})$/i.exec(marca || "");
    const linha = {
      segmento: corta(b.segmento, 60),
      marca,
      lead_id: m ? Number(m[1]) : null,
      sessao: corta(b.sessao, 40),
      ua: corta(req.headers.get("user-agent"), 300),
      referrer: corta(b.referrer, 300),
    };
    const k = srvKey();
    const r = await fetch(`${URL_()}/rest/v1/pedido_visita`, {
      method: "POST",
      headers: {
        apikey: k, Authorization: "Bearer " + k, "Content-Type": "application/json",
        // a mesma aba recarregando nao vira visita nova — o indice unico em `sessao` barra, e o
        // ignore-duplicates faz isso voltar 201 em vez de 409
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify(linha),
    });
    // 409 = a mesma aba recarregando. Isso nao e falha: a visita ja esta registrada.
    return j({ ok: r.ok || r.status === 409, repetida: r.status === 409 });
  } catch {
    return j({ ok: false });
  }
});
