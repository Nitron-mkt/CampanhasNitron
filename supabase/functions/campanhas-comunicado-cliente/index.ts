// campanhas-comunicado-cliente (v1) — apoio a campanha `cliente_comunicado`: recado livre da gestao
// para a BASE DE CLIENTES do CRM. E o irmao do `campanhas-comunicado` (que fala com a rede de
// representantes), com tres diferencas que vem do tamanho e do destinatario:
//
//   1. QUEM ENFILEIRA E ESTA FUNCAO, NAO A TELA. O comunicado ao rep sao ~98 destinatarios e o
//      painel monta o payload no navegador. Aqui sao ~6.000: o mesmo desenho geraria um POST de
//      ~11 MB montado no browser. Pior, foi exatamente esse caminho (a tela compondo tudo e
//      mandando de uma vez) que em 03/09 pos 231 mensagens na fila num clique. Agora a tela manda
//      o TEXTO e os FILTROS; a audiencia e resolvida aqui e vai para `fila-enfileirar` em lotes,
//      que e quem tem a trava de duplicidade.
//
//   2. SO E-MAIL. O canal do cliente no Zaptos e o `assignedTo` do contato no GHL — teria de ser
//      resolvido contato por contato, e 6.000 mensagens a 2/min por instancia sao ~8h de disparo
//      com o numero da Campanhas Nitron JA restringido pelo WhatsApp desde 27/08. Comunicado em
//      massa por Zaptos e pedido de banimento. O campo existe no payload para o dia em que o
//      gestor decidir, mas esta funcao recusa `canal=whatsapp`.
//
//   3. SEM CNPJ E SEM "(N lojas)". Regra do CLAUDE.md: documento entra na comunicacao ao
//      REPRESENTANTE (ele precisa achar o cliente no sistema dele); na mensagem AO CLIENTE seria o
//      documento dele mesmo. E o sufixo `(N lojas)` e marcador interno das listas ao rep — vazou
//      para o cliente em 03/09 ("Ola DIEGO FAZZANI (2 lojas)!"). Aqui o nome vai limpo, e cada
//      contato recebe com o nome da PROPRIA loja: nao consolidamos por matriz, entao nao existe o
//      erro de casar nome de uma loja com o contato de outra.
//
// GET  ?base=&sem_inad=&sem_bloq=&sem_ka=&uf=  -> { total, clientes, cortes, amostra, salvos, cfg }
// POST { titulo, assunto, texto_email, id? }   -> grava/atualiza na biblioteca (publico='cliente')
// POST { apagar:<id> }                         -> remove da biblioteca
// POST { acao:"enfileirar", assunto, corpo, filtros, total_esperado, confirmar:true }
//        -> resolve a audiencia e enfileira. Recusa sem `confirmar`, e recusa se o total de agora
//           nao for o mesmo que a tela mostrou (`total_esperado`): tela velha nao dispara lote novo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const detalhar = (e: any) => [e?.message, e?.details, e?.hint, e?.code].filter(Boolean).join(" · ") || String(e);

const CAMPANHA = "cliente_comunicado";
const LOTE_FILA = 400;   // tamanho do lote no fila-enfileirar

// e-mail obviamente invalido nao vira linha na fila: o GHL responde 400 e a linha morre em "erro".
// Nao e validacao de existencia, e so descarte do que nunca poderia sair.
const JUNK = /^(dpo@|noreply|no-reply|nao-responda|naoresponda|mailer-daemon|postmaster@|abuse@)|@(example|teste?)\./i;
function mailOk(v: string) {
  const e = String(v || "").trim().toLowerCase();
  if (!e || e.length > 190) return false;
  if (!/^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(e)) return false;
  return !JUNK.test(e);
}
// [CLIENTE] e o unico marcador. Sem CNPJ, sem sufixo de lojas — ver nota 3 do cabecalho.
function fill(t: string, nome: string) { return String(t || "").replace(/\[CLIENTE\]/g, nome); }

// O nome vai numa saudacao ("Ola [CLIENTE],"), entao lixo de cadastro na frente aparece na cara do
// cliente. Limpeza deliberadamente conservadora — mexe em 5 dos 5.700 nomes da base:
//   ": Atacadao de Armarinhos"     -> "Atacadao de Armarinhos"
//   "004 - AUSTIM LOJAO VEM QUE TEM" -> "AUSTIM LOJAO VEM QUE TEM"
// O codigo de loja so cai quando vem seguido de separador: "3 IRMAOS COMERCIO" e "24 HORAS" ficam
// intactos, porque ali o numero e o nome.
function nomeLimpo(s: any) {
  return String(s || "").trim()
    .replace(/^[^0-9A-Za-zÀ-ÿ]+/, "")
    .replace(/^[0-9]{1,4}\s*[-–—/]\s*/, "")
    .trim();
}

// Le uma tabela inteira paginando: o PostgREST corta em 1.000 e a base tem ~6.5k contatos.
async function todas(sb: any, tabela: string, sel: string) {
  const out: any[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await sb.from(tabela).select(sel).range(de, de + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

type Filtros = { base: string; sem_inad: boolean; sem_bloq: boolean; sem_ka: boolean; uf: string };
function lerFiltros(get: (k: string) => any): Filtros {
  const v = (k: string) => String(get(k) ?? "");
  const b = v("base");
  return {
    base: (b === "carteira" || b === "nitron") ? b : "crm",
    sem_inad: v("sem_inad") === "1" || get("sem_inad") === true,
    sem_bloq: v("sem_bloq") === "1" || get("sem_bloq") === true,
    sem_ka: v("sem_ka") === "1" || get("sem_ka") === true,
    uf: v("uf").trim(),
  };
}

// Resolve a audiencia: um destinatario por E-MAIL (nao por contato nem por loja), com o nome da
// propria loja daquele contato.
async function audiencia(sb: any, f: Filtros) {
  const [contatos, cli, cart, reps, inad, bloq, kas] = await Promise.all([
    todas(sb, "ghl_contato", "codparc,nome,email"),
    todas(sb, "ghl_cliente", "codparc,razao,nitron"),
    todas(sb, "sankhya_carteira", "codparc,nome_parc,razao_social,uf"),
    todas(sb, "rep_carteira", "codparc"),
    todas(sb, "inadimplente", "codparc"),
    todas(sb, "parc_bloqueado", "codparc"),
    todas(sb, "ka_grupo", "matriz,membros"),
  ]);

  const eRep = new Set<number>(reps.map((r: any) => Number(r.codparc)).filter((n: number) => n > 0));
  const eInad = new Set<number>(inad.map((r: any) => Number(r.codparc)));
  const eBloq = new Set<number>(bloq.map((r: any) => Number(r.codparc)));
  const eKa = new Set<number>();
  kas.forEach((g: any) => { if (g.matriz) eKa.add(Number(g.matriz)); (g.membros || []).forEach((m: any) => eKa.add(Number(m))); });

  const razaoDe: Record<number, string> = {}; const nitronDe: Record<number, boolean> = {};
  cli.forEach((c: any) => { if (c.razao) razaoDe[Number(c.codparc)] = String(c.razao); nitronDe[Number(c.codparc)] = c.nitron === true; });
  const cartDe: Record<number, any> = {};
  cart.forEach((c: any) => { cartDe[Number(c.codparc)] = c; });

  // Cortes contados um a um, para a tela poder explicar cada exclusao em vez de mostrar so o total.
  const cortes = { representante: 0, sem_email: 0, email_invalido: 0, fora_da_base: 0, inadimplente: 0, bloqueado: 0, key_account: 0, uf: 0, email_repetido: 0 };
  const vistos = new Set<string>();
  const alvos: { codparc: number; nome: string; email: string; uf: string }[] = [];

  for (const c of contatos) {
    const cp = Number(c.codparc);
    if (!cp) { cortes.fora_da_base++; continue; }
    if (eRep.has(cp)) { cortes.representante++; continue; }            // regra: campanha de cliente nao vai para rep
    const email = String(c.email || "").trim().toLowerCase();
    if (!email) { cortes.sem_email++; continue; }
    if (!mailOk(email)) { cortes.email_invalido++; continue; }
    const emCart = !!cartDe[cp];
    if (f.base === "carteira" && !emCart) { cortes.fora_da_base++; continue; }
    if (f.base === "nitron" && nitronDe[cp] !== true) { cortes.fora_da_base++; continue; }
    if (f.sem_inad && eInad.has(cp)) { cortes.inadimplente++; continue; }
    if (f.sem_bloq && eBloq.has(cp)) { cortes.bloqueado++; continue; }
    if (f.sem_ka && eKa.has(cp)) { cortes.key_account++; continue; }
    const uf = String(cartDe[cp]?.uf || "").trim();
    if (f.uf && uf !== f.uf) { cortes.uf++; continue; }
    if (vistos.has(email)) { cortes.email_repetido++; continue; }      // um e-mail, uma mensagem
    vistos.add(email);
    const nome = nomeLimpo(razaoDe[cp] || cartDe[cp]?.nome_parc || cartDe[cp]?.razao_social || c.nome) || ("Cliente " + cp);
    alvos.push({ codparc: cp, nome, email, uf });
  }

  alvos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return { alvos, cortes, clientes: new Set(alvos.map((a) => a.codparc)).size };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const key = srvKey();
    if (!key) return j({ erro: "sem chave de servico (secret SRV_JWT ausente)" }, 500);
    const SUPA = Deno.env.get("SUPABASE_URL")!;
    const sb = createClient(SUPA, key);

    if (req.method === "POST") {
      const b = await req.json().catch(() => ({}));

      if (b.apagar) {
        const { error } = await sb.from("comunicado").delete().eq("id", Number(b.apagar)).eq("publico", "cliente");
        if (error) throw error;
        return j({ ok: true, apagado: Number(b.apagar) });
      }

      if (b.acao === "enfileirar") {
        const assunto = String(b.assunto || "").trim();
        const corpo = String(b.corpo || "").trim();
        if (!corpo) return j({ erro: "sem texto do comunicado" }, 400);
        if (!assunto) return j({ erro: "sem assunto — e-mail sem assunto nao sai" }, 400);
        if (String(b.canal || "email") !== "email") {
          return j({ erro: "esta campanha e SO por e-mail. Comunicado em massa por Zaptos precisa de decisao do gestor: sao ~8h de disparo e o numero da Campanhas Nitron esta restringido pelo WhatsApp desde 27/08." }, 400);
        }
        // Duas travas de proposito, por causa do disparo nao autorizado de 03/09:
        //   confirmar    -> ninguem enfileira 6.000 e-mails sem dizer que quer
        //   total_esperado -> se a audiencia mudou desde que a tela contou, o lote NAO sai
        if (b.confirmar !== true) return j({ erro: "falta confirmar:true" }, 400);

        const f = lerFiltros((k) => (b.filtros || {})[k]);
        const { alvos, cortes, clientes } = await audiencia(sb, f);
        if (!alvos.length) return j({ erro: "nenhum destinatario com os filtros escolhidos", cortes }, 400);
        // 200 com ok:false de proposito, e nao 409: o postJSON do painel joga fora o corpo quando o
        // status nao e 2xx e a tela mostraria "status 409" em vez do motivo. Recusa que o gestor
        // precisa LER volta como 200.
        const esperado = Number(b.total_esperado);
        if (!Number.isFinite(esperado) || esperado !== alvos.length) {
          return j({ ok: false, erro: "a audiencia mudou: a tela contou " + b.total_esperado + " e agora sao " + alvos.length + ". Recarregue a tela e confira antes de enviar.", total: alvos.length });
        }

        let enfileirados = 0; const falhas: string[] = [];
        for (let i = 0; i < alvos.length; i += LOTE_FILA) {
          const itens = alvos.slice(i, i + LOTE_FILA).map((a) => ({
            // `empresa` nao vai no payload de proposito: o fila-enfileirar nao copia esse campo, e
            // a coluna fila_envio.empresa tem default 'nitron' NOT NULL. Mandar aqui daria a falsa
            // impressao de que a origem e escolhida no item.
            campanha: CAMPANHA, publico: "cliente", canal: "email",
            codparc: a.codparc, nome: a.nome, email: a.email,
            assunto: fill(assunto, a.nome), corpo: fill(corpo, a.nome),
            merge: { cliente: a.nome },
          }));
          const r = await fetch(`${SUPA}/functions/v1/fila-enfileirar`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
            body: JSON.stringify({ itens }),
          });
          const d = await r.json().catch(() => ({}));
          if (d && d.ok) enfileirados += Number(d.enfileirados || 0);
          else falhas.push(String((d && d.erro) || ("lote " + (i / LOTE_FILA + 1) + " falhou")));
        }
        return j({ ok: !falhas.length, total: alvos.length, clientes, enfileirados, cortes, falhas: falhas.length ? falhas : undefined });
      }

      // gravar na biblioteca
      const titulo = String(b.titulo || "").trim();
      if (!titulo) return j({ erro: "sem titulo" }, 400);
      const linha = {
        titulo, publico: "cliente",
        texto_wpp: "", // esta campanha nao usa Zaptos; a coluna existe por causa do irmao do rep
        assunto: String(b.assunto || ""), texto_email: String(b.texto_email || ""),
        atualizado: new Date().toISOString(),
      };
      if (b.id) {
        const { data, error } = await sb.from("comunicado").update(linha).eq("id", Number(b.id)).eq("publico", "cliente").select().maybeSingle();
        if (error) throw error;
        return j({ ok: true, salvo: data });
      }
      const { data, error } = await sb.from("comunicado").insert(linha).select().maybeSingle();
      if (error) throw error;
      return j({ ok: true, salvo: data });
    }

    // ---- GET: a audiencia com os filtros pedidos ----
    const p = new URL(req.url).searchParams;
    const f = lerFiltros((k) => p.get(k));
    const { alvos, cortes, clientes } = await audiencia(sb, f);

    const { data: salvos, error: eS } = await sb.from("comunicado").select("*").eq("publico", "cliente").order("atualizado", { ascending: false }).limit(50);
    if (eS) throw eS;
    const { data: cfg } = await sb.from("fila_config").select("email_lote,email_ativo,wpp_ativo").eq("id", 1).maybeSingle();
    const { data: meta } = await sb.from("cache_meta").select("atualizado").eq("chave", "snapshot").maybeSingle();

    // UFs com contagem, para o filtro da tela. `sankhya_carteira.uf` e o CODUF numerico do Sankhya.
    const porUf: Record<string, number> = {};
    alvos.forEach((a) => { const k = a.uf || "?"; porUf[k] = (porUf[k] || 0) + 1; });

    return j({
      filtros: f, total: alvos.length, clientes, cortes, por_uf: porUf,
      amostra: alvos.slice(0, 40),
      salvos: salvos || [], cfg: cfg || null, atualizado: meta?.atualizado || null,
    });
  } catch (e) { return j({ erro: detalhar(e) }, 500); }
});
