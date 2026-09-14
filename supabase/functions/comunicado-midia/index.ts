// comunicado-midia (v1) — sobe a imagem que vai junto com um comunicado e devolve a URL publica.
//
// POST  ?nome=banner.png   com a IMAGEM CRUA no corpo  -> { ok, url, bytes, tipo }
// GET                                                   -> { arquivos:[{url,nome,bytes,criado}] }
// POST  { apagar: "<url>" }                             -> remove do storage
//
// Por que URL publica e nao binario guardado no banco: quem monta o anexo e o GHL, e ele BUSCA a
// URL de fora. Anexo so funciona se o arquivo estiver alcancavel pela internet — por isso o bucket
// `comunicado-midia` e publico. Nao coloque aqui nada que nao possa ser visto por quem tiver o link.
//
// O upload passa por esta funcao (e nao direto do navegador para o Storage) de proposito: assim o
// painel nao depende da anon key ter permissao de escrita. A pendencia 2 do CLAUDE.md quer justamente
// TIRAR a escrita da anon key, e uma tela que dependesse dela quebraria no dia em que isso acontecer.
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const BUCKET = "comunicado-midia";
const MAX = 5 * 1024 * 1024;   // 5 MB — o mesmo limite do bucket
const TIPOS: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp", "image/gif": "gif",
};

// Nome previsivel e sem colisao: data + aleatorio + extensao do tipo real. O nome que veio da tela
// vira so um prefixo legivel, sem acento nem espaco — o Storage recusa varios caracteres.
function nomeArquivo(original: string, ext: string) {
  const base = String(original || "imagem")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "imagem";
  const d = new Date().toISOString().slice(0, 10);
  const r = Math.random().toString(36).slice(2, 8);
  return `${d}-${base}-${r}.${ext}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const base = Deno.env.get("SUPABASE_URL")!;
    const key = srvKey();
    if (!key) return j({ ok: false, erro: "sem chave de servico (secret SRV_JWT ausente)" }, 500);
    const pub = (nome: string) => `${base}/storage/v1/object/public/${BUCKET}/${nome}`;

    if (req.method === "GET") {
      const r = await fetch(`${base}/storage/v1/object/list/${BUCKET}`, {
        method: "POST",
        headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify({ prefix: "", limit: 100, sortBy: { column: "created_at", order: "desc" } }),
      });
      const d = await r.json().catch(() => []);
      if (!r.ok) return j({ ok: false, erro: "storage " + r.status }, 500);
      const arquivos = (Array.isArray(d) ? d : []).filter((f: any) => f?.name && f.name !== ".emptyFolderPlaceholder")
        .map((f: any) => ({ nome: f.name, url: pub(f.name), bytes: f?.metadata?.size ?? null, criado: f.created_at || null }));
      return j({ ok: true, arquivos });
    }

    const ct = String(req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();

    // apagar vem como JSON; imagem vem como image/*. O Content-Type separa os dois caminhos.
    if (ct === "application/json") {
      const b = await req.json().catch(() => ({}));
      const alvo = String(b.apagar || "");
      if (!alvo) return j({ ok: false, erro: "nada a apagar" }, 400);
      // aceita a URL inteira ou so o nome do arquivo
      const nome = alvo.split("/").pop() || "";
      if (!nome || nome.indexOf("..") >= 0) return j({ ok: false, erro: "nome invalido" }, 400);
      const r = await fetch(`${base}/storage/v1/object/${BUCKET}/${nome}`, {
        method: "DELETE", headers: { apikey: key, Authorization: "Bearer " + key },
      });
      return j({ ok: r.ok, status: r.status, apagado: nome });
    }

    const ext = TIPOS[ct];
    if (!ext) return j({ ok: false, erro: "tipo nao aceito: " + (ct || "(vazio)") + ". Use PNG, JPG, WEBP ou GIF." }, 400);

    const buf = new Uint8Array(await req.arrayBuffer());
    if (!buf.length) return j({ ok: false, erro: "arquivo vazio" }, 400);
    if (buf.length > MAX) return j({ ok: false, erro: "imagem de " + Math.round(buf.length / 1024) + " KB — o limite e 5 MB" }, 400);

    const nome = nomeArquivo(new URL(req.url).searchParams.get("nome") || "", ext);
    const r = await fetch(`${base}/storage/v1/object/${BUCKET}/${nome}`, {
      method: "POST",
      headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": ct, "cache-control": "max-age=31536000" },
      body: buf,
    });
    const txt = await r.text();
    if (!r.ok) return j({ ok: false, erro: "storage " + r.status + ": " + txt.slice(0, 200) }, 500);
    return j({ ok: true, url: pub(nome), nome, bytes: buf.length, tipo: ct });
  } catch (e) { return j({ ok: false, erro: String(e) }, 500); }
});
