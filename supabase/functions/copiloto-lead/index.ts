// copiloto-lead (v20) — A PRACA DECIDE A CESTA E O FRETE, E NESSA ORDEM.
// Erro que o gestor pegou em 27/10: a Alexa (lead 523) tem DDD 81, Pernambuco, e recebeu a cesta
// Sudeste-R01. A causa era o `UF2REG[uf] || "Sudeste"`: quando ninguem sabia a UF, o codigo
// escolhia o Sudeste CALADO. Sete leads sairam assim. E havia um segundo vao, aberto pela propria
// v19: a cesta era escolhida ANTES do freteCIF, entao um lead com CEP de PE podia levar o
// percentual certo numa cesta do Sudeste.
// Agora o freteCIF roda primeiro e a UF que ele resolveu manda nas duas decisoes; sem ele, a
// ordem das pistas e L.uf > o que a Nina mandou > o DDD do telefone. O DDD serve so para a CESTA:
// o percentual muda dentro do mesmo estado, entao ele nao substitui a trava do CEP.
// Quando nem assim da para saber, a resposta DIZ que a praca nao foi apurada em vez de fingir.
//
// Tambem nesta versao: a Nina de lead PULA quem tem a tag `raspagem`/`raspagem-onda1` — essa acao
// tem funcao e roteiro proprios (`nina-raspagem`), e o publico e distribuidor, nao lojista.
//
// A v19 (o frete CIF entrando no link pelo CEP) tambem esta no historico — ela e a base desta:
// o freteCIF() e dela, e aqui ele so mudou de LUGAR, passando a rodar antes da escolha da cesta.
//
// As versoes v18 e v17 sairam deste cabecalho em 27/10 e estao em docs/copiloto-lead-historico.md
// junto com as v4 a v16. A v18 e a trava de CNPJ+endereco e a conta /0,90; a v17 e a faixa unica
// de desconto. Leia la antes de desfazer qualquer uma das duas.
//
// O historico das versoes v4 a v16 saiu daqui em 26/10 e esta em
// docs/copiloto-lead-historico.md — inteiro, sem corte. Nao e enfeite: cada bloco explica um erro
// que ja custou caro e a razao de uma trava que ainda esta neste arquivo (o telefone decapitado da
// v10, a instancia caida da v13, o status que voltava atras da v5). Leia antes de desfazer algo.
//
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const SUPA_URL = Deno.env.get("SUPABASE_URL")!;
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GHL = (Deno.env.get("GHL_TOKEN") || "").trim();
const LOC = "rZ8y7lzqV7fzxsartaX2";
const MODELO = "claude-sonnet-5";

const digits = (s: any) => String(s || "").replace(/\D/g, "");
// GRAVAR O NUMERO INTEIRO. Ate a v9 a coluna guardava d10() — os ULTIMOS 10 digitos — e o telefone
// vem do CRM com DDI: "+5511982408982" (13 digitos) virava "1982408982". Nao e so o 55 que sai: o
// primeiro digito do DDD sai junto, e o nono digito do celular ocupa o lugar dele. O numero gravado
// passa a ser de OUTRA praca e, pior, as vezes existe: (49) 9186-5299 (SC) e (99) 9794-1046 (MA)
// foram entregues a representante como se fossem o lead. Cinco dos oito leads repassados sairam
// assim, e os leads ficaram esperando uma ligacao que nunca chegou.
// Quebrava todo celular de 11 digitos (DDD + nono digito), ou seja praticamente todo DDD de 11 a 28.
// Demorou a aparecer porque numero de 12 digitos (celular antigo, sem o nono) passa ileso: ali os
// ultimos 10 sao o nacional inteiro. Por isso os leads de DDD alto sairam certos.
const foneNac = (s: any) => { let d = digits(s); if (d.length >= 12 && d.startsWith("55")) d = d.slice(2); return d; };
// so para achar registro GRAVADO antes da correcao, que tem 10 digitos. Nao usar para gravar.
const d10 = (s: any) => digits(s).slice(-10);
function foneFmt(s: any): string {
  const d = foneNac(s);
  if (d.length === 11) return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
  if (d.length === 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
  return String(s || "");
}
const fk8 = (s: any) => { let d = digits(s).replace(/^0+/, "").replace(/^55/, ""); if (d.length > 8) d = d.slice(-8); return d; };
const norm = (s: any) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const prim = (s: any) => (String(s || "").trim().split(/\s+/)[0] || String(s || ""));
function hojeBRT(): string { const d = new Date(Date.now() - 3 * 3600 * 1000); const p = (n: number) => String(n).padStart(2, "0"); return p(d.getUTCDate()) + "/" + p(d.getUTCMonth() + 1) + "/" + d.getUTCFullYear(); }

// A instancia do Zaptos vem escrita no rodape da propria mensagem: nao existe como campo do contato
// no GHL (conferido em 100 custom fields). E o unico jeito de saber por qual numero ela entrou.
function instDe(t: any): string | null { const m = String(t || "").match(/Instance Source:\s*([^\n\r]+)/i); return m ? m[1].trim() : null; }
function limpa(t: any): string { return String(t || "").replace(/Instance Source:.*/is, "").replace(/#contact_instance:\S+/gi, "").replace(/\s+/g, " ").trim(); }

// Ruido que chega na instancia da Nina: codigo de confirmacao do Facebook, mensagem que o WhatsApp
// nao decifrou e autoresposta de OUTRA empresa. Chegaram mais de 20 em 10 dias — sem este filtro a
// Nina conversa com robo alheio e gasta o numero dela nisso.
// A lista cresce com a operacao: muitos leads sao numeros comerciais com resposta automatica
// propria. O da loja da Natalie ("Nao estamos disponiveis... responderemos assim que possivel")
// escapou da versao no singular em 10/09 e a Nina quase respondeu ao robo dela. Padrao extra em
// copiloto_config.lead_ruido_extra, para o proximo formato entrar por UPDATE, sem deploy.
const RE_RUIDO = /(codigo de confirmacao|undecryptable|descriptografar|ative as listas|agradece(mos)? (seu contato|sua mensagem)|atendente virtual|horario de atendimento|entraremos em contato|selecione (a|uma|um) (opcao|assunto)|(estou|estamos) indisponive|nao (estou|estamos) disponive|retornare(i|mos) assim que|respondere(i|mos) assim que|ouvidoria|mensagem automatica)/;
// Abertura de quem veio do anuncio. O texto que o META pre-enche no clique e "Ola! Posso ter mais
// informacoes sobre isso?" — e o caso mais comum e o mais generico, por isso esta na lista.
const RE_ABRE = /(mais informacoe?s sobre isso|posso ter mais informacoe?s|quero saber mais|vim pelo (anuncio|face|insta)|vi (o|um) (anuncio|video|reels|post)|como (faco|fazer) (para|pra) (comprar|revender)|revend|atacado|catalogo|abastecer|sou (lojista|dono)|tenho (uma )?(loja|bazar|mercad)|preciso (de|comprar))/;
let RUIDO_EXTRA: RegExp | null = null;
const ehRuido = (t: any) => RE_RUIDO.test(norm(t)) || (!!RUIDO_EXTRA && RUIDO_EXTRA.test(norm(t)));
const ehAbertura = (t: any) => !ehRuido(t) && RE_ABRE.test(norm(t));

// documento so aparece formatado em CODIGO. A IA nunca escreve CNPJ — regra do gestor de 28/08: um
// digito trocado manda o comercial para outra empresa.
function docFmt(d: any): string {
  const x = digits(d);
  if (x.length === 14) return x.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") + " (CNPJ)";
  if (x.length === 11) return x.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") + " (CPF)";
  return x ? x + " (documento fora do padrao)" : "";
}

const ghl = (m: string, p: string, v = "2021-07-28", body?: any) => fetch("https://services.leadconnectorhq.com" + p, { method: m, headers: { Authorization: "Bearer " + GHL, Version: v, Accept: "application/json", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

async function anthropic(system: string, messages: any[], tools: any[]): Promise<any> {
  const key = Deno.env.get("ANTHROPIC_API_KEY"); if (!key) throw new Error("sem ANTHROPIC_API_KEY");
  const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: MODELO, max_tokens: 1500, system, tools, messages }) });
  if (!r.ok) throw new Error("anthropic " + r.status + " " + (await r.text()).slice(0, 300));
  return await r.json();
}

// Instancia caida: pausar na PRIMEIRA recusa, nao na quinquagesima. O campanhas-enviar ja sabe
// distinguir "o GHL aceitou" de "o ZaptosWPP entregou" e devolve instancia_caiu=true — faltava
// alguem agir sobre isso. Quem escreve a pausa aqui e esta funcao; quem avisa o gestor e o
// vigia-instancia, que varre as conversas e cobre tambem as quedas que acontecem fora daqui.
async function pausarInstancia(sb: any, instancia: string, motivo: string) {
  if (!instancia) return { ok: false, motivo: "sem instancia" };
  try {
    const { error } = await sb.from("instancia_ghl")
      .update({ pausada_em: new Date().toISOString(), pausada_motivo: motivo.slice(0, 400) })
      .eq("instancia", instancia).is("pausada_em", null);
    return error ? { ok: false, motivo: error.message } : { ok: true };
  } catch (e) { return { ok: false, motivo: String(e).slice(0, 160) }; }
}
async function instanciasPausadas(sb: any): Promise<Set<string>> {
  try {
    const { data } = await sb.from("instancia_ghl").select("instancia").not("pausada_em", "is", null);
    return new Set((data || []).map((x: any) => norm(x.instancia)));
  } catch (_e) { return new Set(); }
}

async function enviar(contact_id: string | null, fone: string, texto: string, instancia: string) {
  const body: any = { canal: "whatsapp", texto, instancia };
  if (contact_id) body.contact_id = contact_id; else body.fone = fone;
  const r = await fetch(SUPA_URL + "/functions/v1/campanhas-enviar", { method: "POST", headers: { Authorization: "Bearer " + srvKey(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return await r.json().catch(() => ({ ok: false, motivo: "resposta ilegivel do campanhas-enviar" }));
}

// Envio pelo WHATSAPP NATIVO do GHL (canal oficial da Meta, numero 11 94793-4107). Nada a ver com
// o Zaptos: nao existe instancia, nao ha bind de dono, e o remetente e o proprio WABA da conta. O
// campanhas-enviar nao serve aqui — ele e Zaptos e EXIGE instancia.
async function enviarNativo(contact_id: string, texto: string) {
  const r = await ghl("POST", "/conversations/messages", "2021-04-15", { type: "WhatsApp", contactId: contact_id, message: texto });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, motivo: r.ok ? undefined : (d?.message || JSON.stringify(d).slice(0, 200)), id: d?.messageId };
}

// O CRM guarda de onde o lead veio (`source`, preenchido pelo formulario da landing) e o CNPJ que
// ele mesmo digitou (campo CF_CNPJ). Ler isso evita o erro mais caro da qualificacao: pedir de novo
// um dado que o lead ja deu — foi o que a sugestao automatica do CRM fez com a Natalie.
const CF_CNPJ = "TLRZeTrxxPBsMNRqbdHO";
async function contatoCrm(contact_id: string | null): Promise<any> {
  if (!contact_id) return {};
  try {
    const r = await ghl("GET", `/contacts/${contact_id}`);
    if (!r.ok) return {};
    const c = (await r.json().catch(() => ({})))?.contact || {};
    const cf = Array.isArray(c.customFields) ? c.customFields : [];
    const at = c.attributionSource || c.lastAttributionSource || {};
    return {
      source: c.source || null,
      cnpj: digits((cf.find((x: any) => x.id === CF_CNPJ) || {}).value || ""),
      email: c.email || null,
      empresa: c.companyName || c.businessName || null,
      url: at.url || null, utm: at.utmSource || null, canal_origem: at.sessionSource || null, meio: at.medium || null,
      dono: c.assignedTo || null,
    };
  } catch (_e) { return {}; }
}

// ---- assinatura da landing "Acelera Nitron" (campanha do Google) ------------------------------
// O formulario da landing so monta um texto e abre o wa.me da Nina: nao persiste linha nenhuma, nao
// escreve `source` no contato e nao carrega gclid/UTM. Quem chega por ali e, para o CRM,
// indistinguivel de quem achou o numero na rua — e o que ele digitou (nome, CNPJ, e-mail) so existe
// dentro do texto que ele mandou. Ler a assinatura aqui e o que permite CONTAR o lead do Google sem
// varrer conversa a mao, e o que evita pedir de novo o dado que ele ja deu.
// A linha "Origem: Campanha Acelera Nitron" e a marca; a frase de abertura fica como rede, para o
// caso de alguem mexer no texto da landing e tirar so a linha de origem.
const ACELERA_ORIGEM = "google-acelera";
const ACELERA_RE = /origem:\s*campanha\s+acelera\s+nitron/i;
const ACELERA_RE2 = /equipe\s+nitron[\s\S]{0,160}?tabela\s+acelera\s+nitron/i;
function acelera(txt: any): { origem: string; nome: string | null; cnpj: string | null; email: string | null } | null {
  const t = String(txt || "");
  if (!ACELERA_RE.test(t) && !ACELERA_RE2.test(t)) return null;
  const g = (re: RegExp) => { const m = t.match(re); return m ? String(m[1]).trim() : ""; };
  const cnpj = digits(g(/cnpj:\s*([\d.\/\-\s]{14,25})/i));
  const email = g(/e-?mail:\s*([^\s<>,;]+@[^\s<>,;]+)/i);
  return {
    origem: ACELERA_ORIGEM,
    nome: g(/\bsou\s+(.{2,60}?)\s+e\s+quero\s+conhecer/i) || null,
    cnpj: cnpj.length === 14 ? cnpj : null,
    email: email || null,
  };
}

// ---- pagina de pedido -------------------------------------------------------------------------
// Mesmo endereco do app/pedido/ponte.sh. O fragmento (#Regiao-Ramo) nao chega ao servidor: quem le
// e o proprio app, no navegador do lojista.
const PEDIDO_URL = "https://pedido-nitron.marketing-da5.workers.dev";
const UF2REG: Record<string, string> = {};
for (const [reg, ufs] of [["Norte", "AC AP AM PA RO RR TO"], ["Nordeste", "AL BA CE MA PB PE PI RN SE"],
  ["Centro-Oeste", "DF GO MT MS"], ["Sudeste", "ES MG RJ SP"], ["Sul", "PR RS SC"]] as [string, string][]) {
  for (const u of ufs.split(" ")) UF2REG[u] = reg;
}
// O DDD DO TELEFONE E A ULTIMA PISTA DA PRACA, e e melhor que o silencio. Ate a v19, quando
// ninguem sabia a UF do lead o codigo caia em "Sudeste" CALADO — a Alexa (lead 523) tem DDD 81,
// Pernambuco, e recebeu cesta Sudeste-R01 em 24/10; outros seis leads sairam do mesmo jeito.
// SERVE SO PARA ESCOLHER A CESTA. Nao serve para frete: o percentual muda DENTRO do mesmo estado
// (SP capital e 0%, interior e 8%), entao o DDD nao substitui a trava do CEP.
const DDD2UF: Record<string, string> = {};
for (const [uf, ds] of [["SP", "11 12 13 14 15 16 17 18 19"], ["RJ", "21 22 24"], ["ES", "27 28"],
  ["MG", "31 32 33 34 35 37 38"], ["PR", "41 42 43 44 45 46"], ["SC", "47 48 49"],
  ["RS", "51 53 54 55"], ["DF", "61"], ["GO", "62 64"], ["TO", "63"], ["MT", "65 66"], ["MS", "67"],
  ["AC", "68"], ["RO", "69"], ["BA", "71 73 74 75 77"], ["SE", "79"], ["PE", "81 87"], ["AL", "82"],
  ["PB", "83"], ["RN", "84"], ["CE", "85 88"], ["PI", "86 89"], ["PA", "91 93 94"], ["AM", "92 97"],
  ["RR", "95"], ["AP", "96"], ["MA", "98 99"]] as [string, string][]) {
  for (const d of ds.split(" ")) DDD2UF[d] = uf;
}
const ufDoDdd = (fone: any) => { const d = foneNac(fone); return d.length >= 10 ? (DDD2UF[d.slice(0, 2)] || "") : ""; };

// Ordem do gestor em 23/10: faixa UNICA de 10% a partir de R$ 5.000. A de 15% acima de R$ 15.000
// foi retirada junto com a virada de preco para a Tabela Gestor + 10% — o preco caiu ~18%, e o
// desconto deixou de ter degrau. Este texto e o que a Nina repete de boca: se a regra mudar na
// pagina (discountRate do order_app.html) e nao mudar aqui, ela promete um numero que a tela nao
// faz — foi o erro de 16/09 em outra escala.
const DESCONTO_PAGINA = "automatico no total do pedido: 10% a partir de R$ 5.000";

// ---- frete CIF: a praca do lead vira percentual, e o percentual vira preco de tela -------------
// Ordem do gestor em 26/10: "tinha que mostrar ja no valor final". A pagina sabe fazer isso desde
// 26/10 — a marca ~F<perc> no link multiplica o preco de CADA item uma vez so, no carregamento, e
// por isso tela, PDF, texto do WhatsApp, pedido gravado e planilha anexa dizem o mesmo numero.
// Faltava quem pusesse a marca no link: e esta funcao.
//
// A CHAVE E O COD_IBGE, nunca o nome da cidade. A base do Sankhya tem "Guarulhoss" sem IBGE e
// nomes com e sem acento; casar por nome erra calado e erra no preco. O CEP resolve o IBGE pelo
// ViaCEP, e o IBGE acha a linha em pedido_frete_cidade (5.569 cidades, cada uma ja com o perc_cif
// da regiao dela).
//
// O NOME DA CIDADE SO ENTRA COMO SEGUNDA OPCAO, e so quando a busca normalizada devolve UMA linha
// na UF. Duas linhas = ambiguidade = nao resolve. Melhor nao mandar link do que mandar preco de
// outra praca: um link com o frete errado e preco que a gente nao cumpre, e o erro so aparece no
// faturamento.
const cepDigits = (s: any) => {
  const d = String(s || "").replace(/\D/g, "");
  return d.length === 8 ? d : "";
};
// o lojista costuma mandar o CEP dentro do endereco, nao no campo dele
function cepDoTexto(s: any): string {
  const m = /(\d{5})[-.\s]?(\d{3})(?!\d)/.exec(String(s || ""));
  return m ? m[1] + m[2] : "";
}
// pedido_frete_cidade.cidade_busca e MINUSCULA e sem acento ("sao paulo", "mogi guacu"): esta
// funcao tem de devolver exatamente esse formato, senao o desempate por nome nunca casa.
const semAcento = (s: any) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

async function freteCIF(sb: any, L: any): Promise<{ perc: number; regiao: string; cidade: string; uf: string; via: string } | { erro: string }> {
  const cep = cepDigits(L?.cep) || cepDoTexto(L?.cep) || cepDoTexto(L?.endereco);
  // 1) CEP -> IBGE -> linha da cidade. O caminho certo.
  if (cep) {
    try {
      const r = await fetch("https://viacep.com.br/ws/" + cep + "/json/", { signal: AbortSignal.timeout(6000) });
      if (r.ok) {
        const v = await r.json();
        const ibge = Number(String(v?.ibge || "").replace(/\D/g, ""));
        if (ibge) {
          const { data } = await sb.from("pedido_frete_cidade").select("cidade, uf, regiao, perc_cif").eq("cod_ibge", ibge).maybeSingle();
          if (data) return { perc: Number(data.perc_cif) || 0, regiao: data.regiao, cidade: data.cidade, uf: data.uf, via: "CEP " + cep };
          return { erro: "o CEP " + cep + " aponta a cidade " + (v?.localidade || "?") + "/" + (v?.uf || "?") + ", que nao esta na tabela de frete do Sankhya" };
        }
      }
    } catch (_e) { /* ViaCEP fora do ar: cai para o nome da cidade */ }
  }
  // 2) nome da cidade + UF, so se for UNICO na UF
  const cid = semAcento(L?.cidade); const uf = String(L?.uf || "").toUpperCase().slice(0, 2);
  if (cid && uf) {
    const { data } = await sb.from("pedido_frete_cidade").select("cidade, uf, regiao, perc_cif").eq("uf", uf).eq("cidade_busca", cid).limit(2);
    const achou: any[] = data || [];
    if (achou.length === 1) {
      const d: any = achou[0];
      return { perc: Number(d.perc_cif) || 0, regiao: d.regiao, cidade: d.cidade, uf: d.uf, via: "cidade " + d.cidade + "/" + d.uf };
    }
    if (achou.length > 1) return { erro: "existe mais de uma " + L.cidade + " em " + uf + " na tabela de frete — so o CEP desempata" };
  }
  return { erro: cep ? "nao consegui resolver o CEP " + cep + " agora" : "sem CEP para achar a praca" };
}

// ---- ferramentas -----------------------------------------------------------------------------
// Conjunto CURTO de proposito: sem codparc, as ferramentas de preco/boleto/pedido/entrega so
// responderiam "codparc invalido" e convidariam a IA a inventar.
const TOOLS = [
  { name: "buscar_cliente", description: "Confere se a loja JA tem cadastro na Nitron, por CNPJ (14 digitos) ou por nome/razao. Use assim que tiver o CNPJ.", input_schema: { type: "object", properties: { termo: { type: "string", description: "CNPJ (so digitos) ou nome da loja" } }, required: ["termo"] } },
  { name: "consultar_conhecimento", description: "Base de conhecimento da casa (produto, mercado, playbook). Use quando ele perguntar algo que voce nao sabe de cabeca.", input_schema: { type: "object", properties: { termo: { type: "string" } }, required: ["termo"] } },
  { name: "produtos", description: "Produtos por categoria/nome/ramo: devolve nome e LINK da foto. SEM preco.", input_schema: { type: "object", properties: { termo: { type: "string" } }, required: ["termo"] } },
  { name: "salvar_lead", description: "Anota/atualiza o que voce JA apurou deste lead. Chame assim que descobrir um dado novo. Mande so o que ele disse — nao preencha por deducao.", input_schema: { type: "object", properties: { nome: { type: "string", description: "nome da pessoa COMO ELA MESMA ESCREVEU nesta conversa, com sobrenome. NUNCA o nome do perfil do WhatsApp (apelido, emoji, frase, nome da loja)." }, nome_confirmado: { type: "boolean", description: "true SOMENTE quando a propria pessoa disse o nome nesta conversa. Falso/ausente se voce pegou do perfil ou deduziu." }, empresa: { type: "string", description: "nome da loja / razao social" }, cnpj: { type: "string" }, cidade: { type: "string" }, uf: { type: "string" }, endereco: { type: "string", description: "endereco da loja COMO ELE ESCREVEU: rua, numero, bairro, cidade/UF. Pedido ANTES do link, porque a tabela de preco muda com a praca." }, cep: { type: "string", description: "CEP da loja, so digitos. E o dado que define o PRECO: e por ele que o frete CIF da praca entra no valor de cada produto da pagina." }, pagamento: { type: "string", description: "como ele pretende pagar. Na primeira compra so existe a vista ou 6x no cartao sem juros." }, tipo_loja: { type: "string", description: "bazar, utilidades, variedades, presentes, supermercado, magazine, material de construcao..." }, ja_revende: { type: "string", description: "de quem ele compra hoje, ou que nao compra direto de fabrica" }, interesse: { type: "string", description: "linha/produto que ele quer abastecer" }, sabe_minimo: { type: "boolean", description: "true depois de VOCE dizer o pedido minimo nesta conversa" }, temperatura: { type: "string", enum: ["frio", "morno", "quente"] }, resumo: { type: "string", description: "2 a 3 frases do caso, para o comercial ler" } }, required: [] } },
  { name: "passar_comercial", description: "PEDIDO DE ATENDIMENTO HUMANO. NAO e o fim da qualificacao e NAO tira o lead de voce — quem fecha a venda e VOCE, pela pagina de pedido. Chame isto so em tres casos: (1) ele PEDIU falar com uma atendente; (2) o CNPJ dele ja tem cadastro na Nitron, entao ele ja tem consultor; (3) voce esta genuinamente travada em algo que so uma pessoa resolve. Nunca como \"ja qualifiquei, entrego pra outro\". Abre a tarefa e devolve o protocolo; voce continua na conversa.", input_schema: { type: "object", properties: { resumo: { type: "string", description: "o caso em 2 a 4 frases: quem e, o que quer, em que pe esta" }, falta: { type: "string", description: "o que o comercial ainda precisa levantar ou combinar" }, temperatura: { type: "string", enum: ["frio", "morno", "quente"] } }, required: ["resumo"] } },
  { name: "link_pedido", description: "Monta o LINK da pagina de pedido da Nitron para ESTE lead e devolve a URL pronta. Na pagina cada produto aparece COM O PRECO, o total soma na tela e o desconto por volume entra sozinho — e por isso ela resolve a objecao de catalogo sem preco. ORDEM DO GESTOR EM 26/10: esta ferramenta SO entrega o link depois que voce tiver o CNPJ E o ENDERECO da loja. O CNPJ escolhe o MIX (pelo CNAE) e o ENDERECO escolhe o PRECO: desde 27/10 o frete CIF da praca dele entra no preco de CADA item da pagina, e quem diz a praca e o CEP. Se faltar o CNPJ, o endereco ou o CEP, ela recusa e te diz o que pedir. Pergunte, salve com salvar_lead, e so entao chame aqui.", input_schema: { type: "object", properties: { ramo: { type: "string", enum: ["R01", "R02", "R03", "R04", "R05", "R06", "R07", "R08", "R09", "R10"], description: "a cesta que combina com a loja dele: R01 = casa de utilidades, variedades, bazar, 1,99, armarinho; R02 = loja de departamento, magazine, loja grande com varias secoes; R03 = joalheria, bijuteria, presentes, festa; R04 = supermercado, mercearia, mercado, atacarejo; R05 = cama, mesa, banho, tecidos, enxoval; R06 = vestuario, calcados, moda; R07 = papelaria, livraria, escritorio; R08 = material de construcao, ferragem, tintas; R09 = farmacia, perfumaria, cosmeticos, higiene; R10 = esporte, brinquedo, lazer, pet. Na duvida, R01." }, uf: { type: "string", description: "UF dele (2 letras), se voce souber e ainda nao tiver salvado com salvar_lead" } }, required: ["ramo"] } },
  { name: "descartar_lead", description: "Use quando NAO e revenda: consumidor final querendo uma peca, curriculo, fornecedor oferecendo servico, engano de numero. Marca como descartado e NAO abre tarefa pro comercial.", input_schema: { type: "object", properties: { motivo: { type: "string" } }, required: ["motivo"] } },
];
const CAMPOS = ["nome", "empresa", "cnpj", "cidade", "uf", "endereco", "cep", "pagamento", "tipo_loja", "ja_revende", "interesse", "resumo", "temperatura"];
// nome do perfil do WhatsApp nao e nome de gente: emoji, frase ("Deus E Fiel"), nome da loja,
// um primeiro nome solto. So vale como nome confirmado o que a PESSOA escreveu, com sobrenome.
const EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F000}-\u{1F02F}]/u;
function nomePlausivel(n: any): boolean {
  const t = String(n || "").replace(EMOJI_RE, " ").replace(/\s+/g, " ").trim();
  if (t.length < 5 || /\d/.test(t)) return false;
  const ps = t.split(" ").filter((x) => x.length > 1);
  return ps.length >= 2;
}
function partesNome(n: string): { first: string; last: string } {
  const ps = String(n).replace(EMOJI_RE, " ").replace(/\s+/g, " ").trim().split(" ");
  return { first: ps[0] || "", last: ps.slice(1).join(" ") };
}
// O gestor pediu em 22/09: com o nome confirmado, o CONTATO DO CRM passa a ter o nome de
// verdade — nao adianta a Nina saber e o CRM continuar mostrando "🙂" para quem for atender.
async function nomeNoCrm(contact_id: string, nome: string) {
  const { first, last } = partesNome(nome);
  if (!first || !last) return { ok: false, motivo: "nome sem sobrenome — nao grava no CRM" };
  try {
    const r = await ghl("PUT", `/contacts/${contact_id}`, "2021-07-28", { firstName: first, lastName: last, name: first + " " + last });
    if (!r.ok) return { ok: false, motivo: "GHL " + r.status };
    return { ok: true, nome: first + " " + last };
  } catch (e) { return { ok: false, motivo: String(e).slice(0, 120) }; }
}

async function upsertLead(sb: any, ctx: any, patch: any): Promise<{ lead?: any; erro?: string }> {
  const col = ctx.contact_id ? "contact_id" : "fone"; const val = ctx.contact_id || ctx.fone;
  if (!val) return { erro: "lead sem contact_id e sem fone" };
  const { data: atual } = await sb.from("copiloto_lead").select("*").eq(col, val).order("id", { ascending: false }).limit(1).maybeSingle();
  const row: any = { atualizado: new Date().toISOString() };
  for (const k in patch) { const v = patch[k]; if (v !== null && v !== undefined && String(v).trim() !== "") row[k] = v; }
  if (atual?.id) { const { data, error } = await sb.from("copiloto_lead").update(row).eq("id", atual.id).select("*").maybeSingle(); return error ? { erro: error.message } : { lead: data }; }
  row.contact_id = ctx.contact_id || null; row.fone = ctx.fone || null; row.instancia = ctx.instancia || null;
  const { data, error } = await sb.from("copiloto_lead").insert(row).select("*").maybeSingle();
  return error ? { erro: error.message } : { lead: data };
}

async function runTool(sb: any, ctx: any, name: string, input: any): Promise<any> {
  try {
    if (ctx.dry && ["salvar_lead", "passar_comercial", "descartar_lead"].includes(name)) return { ok: true, previa: true, simulado: name, aviso: "previa: nada foi gravado" };
    if (name === "buscar_cliente") {
      const termo = String(input?.termo || "").trim(); const dig = digits(termo);
      let q = sb.from("ghl_cliente").select("codparc, razao, cnpj, situacao, canal, ramo, dias").limit(5);
      q = dig.length >= 11 ? q.ilike("cnpj", "%" + dig + "%") : q.ilike("razao", "%" + termo + "%");
      const { data } = await q;
      if (!data || !data.length) return { encontrados: 0, aviso: "nenhum cadastro com esse dado — trate como lead novo" };
      return { encontrados: data.length, clientes: data, aviso: "JA E CLIENTE: nao trate como lead novo, diga isso a ele e passe pro comercial" };
    }
    if (name === "consultar_conhecimento") {
      const termo = String(input?.termo || "").trim(); if (!termo) return { erro: "termo vazio" };
      const { data, error } = await sb.rpc("buscar_conhecimento", { q: termo });
      if (error) return { erro: error.message };
      if (!data || !data.length) return { encontrados: 0, aviso: "nada na base p/ '" + termo + "'" };
      return { encontrados: data.length, conhecimento: (data as any[]).slice(0, 4).map((d) => ({ titulo: d.titulo, texto: String(d.conteudo).slice(0, 1500) })) };
    }
    if (name === "produtos") {
      const termo = String(input?.termo || "").trim();
      if (!termo) return { erro: "termo vazio" };
      const like = "%" + termo + "%";
      const { data } = await sb.from("produto_web").select("categoria, nome, url, ramo").eq("ativo", true).or(`nome.ilike.${like},categoria.ilike.${like},ramo.ilike.${like}`).limit(6);
      if (!data || !data.length) return { encontrados: 0, aviso: "nenhum produto com esse termo" };
      return { encontrados: data.length, produtos: data, dica: "mande o url; sem preco (o lead ainda nao tem tabela)." };
    }
    // LINK DA PAGINA DE PEDIDO. Tres decisoes moram aqui:
    //   1. A REGIAO sai da UF do lead (nao da cidade): e so o que a cesta precisa saber.
    //   2. O RAMO vem da Nina, nao do CNAE — ver o cabecalho.
    //   3. A marca ~L<id> e o que torna a visita atribuivel. Sem linha de lead nao ha marca, e o
    //      link sai mesmo assim: melhor um link sem atribuicao do que lead sem link.
    if (name === "link_pedido") {
      const ufIn = String(input?.uf || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
      let L: any = null;
      if (ctx.dry) {
        const { data } = await sb.from("copiloto_lead").select("id, uf, cidade, cnpj, endereco, cep, fone, link_vezes, link_seg")
          .or(`contact_id.eq.${ctx.contact_id || "__none__"},fone.eq.${ctx.fone || "__none__"}`)
          .order("id", { ascending: false }).limit(1).maybeSingle();
        L = data || null;
      } else {
        const up = await upsertLead(sb, ctx, ufIn ? { uf: ufIn } : {});
        if (up.erro) return { erro: up.erro };
        L = up.lead || null;
      }
      // TRAVA DE CNPJ E ENDERECO — ordem do gestor em 26/10.
      // Nao e conselho no prompt, e recusa da ferramenta: o prompt ja mandou "nao espere o CNPJ"
      // entre 20 e 26/10 e foi obedecido a risca (o Luis Carlos recebeu o link sem CNPJ porque a
      // instrucao mandava). Texto no prompt o modelo pondera; recusa da ferramenta ele nao contorna.
      // Afrouxar nao exige deploy: copiloto_config.link_exige_cnpj / link_exige_endereco = 'nao'.
      const falta: string[] = [];
      if (ctx.exigeCnpj && String(L?.cnpj || "").replace(/\D/g, "").length < 14) falta.push("o CNPJ da loja (14 digitos)");
      if (ctx.exigeEndereco && !String(L?.endereco || "").trim() && !String(L?.cep || "").trim()) falta.push("o endereco da loja COM O CEP (o CEP e o que resolve a tabela da praca)");
      if (falta.length) {
        return {
          ok: false, link_nao_enviado: true, falta,
          o_que_fazer: "NAO mande link nenhum agora. Peca " + falta.join(" e ") + " na mesma mensagem, de forma leve, explicando POR QUE: com o CNPJ a gente confere o cadastro e monta a lista do ramo dele, e com o endereco — principalmente com o CEP — a gente aplica a tabela certa da praca dele, de modo que o preco que ele ve na tela ja seja o final, com a entrega inclusa. Quando ele responder, salve com salvar_lead e chame esta ferramenta de novo.",
          ja_tenho: { cnpj: !!String(L?.cnpj || "").trim(), endereco: !!String(L?.endereco || "").trim(), cep: !!String(L?.cep || "").trim() },
        };
      }
      // A PRACA VEM PRIMEIRO, E ELA DECIDE AS DUAS COISAS: a cesta e o frete.
      // Ate a v19 a cesta era escolhida antes, so com L.uf, e o frete vinha depois — entao um lead
      // com CEP de Pernambuco podia levar o percentual certo numa cesta do Sudeste. E quando a UF
      // era desconhecida o `|| "Sudeste"` resolvia calado: foi o que deu cesta Sudeste a sete
      // leads, a Alexa (523, DDD 81) entre eles.
      const f: any = await freteCIF(sb, L);
      if (f?.erro && ctx.exigeFrete) {
        return {
          ok: false, link_nao_enviado: true, falta: ["o CEP da loja"],
          por_que: f.erro,
          o_que_fazer: "NAO mande link agora. Peca o CEP da loja, de leve, explicando que e com ele que o sistema aplica a tabela certa da praca dele — assim o preco que ele ve na tela ja e o preco final, sem surpresa depois. Salve com salvar_lead e chame esta ferramenta de novo.",
        };
      }
      // ordem das pistas: o que o CEP resolveu > o que esta salvo > o que a Nina mandou > o DDD.
      const uf = String((!f?.erro && f.uf) || L?.uf || ufIn || ufDoDdd(L?.fone) || "").toUpperCase().slice(0, 2);
      const reg = UF2REG[uf] || "Sudeste";
      const pracaAdivinhada = !UF2REG[uf];
      let ramo = String(input?.ramo || "").toUpperCase().trim();
      if (!/^R\d{2}$/.test(ramo)) ramo = "R01";
      const { data: segs } = await sb.from("pedido_base").select("pedido_id, ramo_nome, n_itens");
      const por = new Map((segs || []).map((x: any) => [x.pedido_id, x]));
      let alvo = reg + "-" + ramo; let como = "exato";
      if (!por.has(alvo)) {
        for (const [c, r] of [["Sudeste-" + ramo, "mesmo ramo, cesta do Sudeste"], [reg + "-R01", "R01 da regiao"], ["Sudeste-R01", "cesta geral"]] as [string, string][]) {
          if (por.has(c)) { alvo = c; como = r; break; }
        }
      }
      const seg: any = por.get(alvo);
      if (!seg) return { erro: "nenhuma cesta montada no pedido_base — nao mande link nenhum" };

      // Sem a marca ~F<perc> a pagina mostra o preco SEM frete, que nao e o que a gente fatura.
      // Afrouxar e UPDATE: copiloto_config.link_exige_frete='nao'.
      const perc = f?.erro ? 0 : Math.max(0, Math.min(50, Number(f.perc) || 0));
      // perc 0 (SP capital, metropolitano, litoral, Campinas, ABC, Sorocaba, S.J. Campos) nao
      // precisa de marca: a pagina trata F0 como "sem frete" e pula a multiplicacao.
      const url = PEDIDO_URL + "/#" + alvo + (L?.id ? "~L" + L.id : "") + (perc > 0 ? "~F" + String(perc) : "");
      if (!ctx.dry && L?.id) {
        const patch: any = {
          link_em: new Date().toISOString(), link_seg: alvo, link_url: url,
          link_vezes: (Number(L.link_vezes) || 0) + 1, atualizado: new Date().toISOString(),
        };
        // o ViaCEP devolve cidade e UF de brinde: aproveitar, porque o repasse precisa da praca e
        // ate aqui ela so existia se o lead a tivesse dito com todas as letras.
        if (!f?.erro) { if (!String(L.cidade || "").trim() && f.cidade) patch.cidade = f.cidade; if (!String(L.uf || "").trim() && f.uf) patch.uf = f.uf; }
        await sb.from("copiloto_lead").update(patch).eq("id", L.id);
      }
      return {
        ok: true, link: url, segmento: alvo, cesta: seg.ramo_nome, itens: seg.n_itens,
        escolha: como, ja_mandei_antes: !!L?.link_seg,
        praca: pracaAdivinhada ? "NAO APURADA — a cesta caiu no Sudeste por falta de UF. Confirme a cidade dele antes de falar de mix." : (uf + " (" + reg + ")"),
        desconto_da_pagina: DESCONTO_PAGINA,
        frete_cif: f?.erro ? "nao aplicado (" + f.erro + ")" : "ja embutido no preco de cada item, pela praca " + f.regiao + " (" + f.via + ")",
        pedido_minimo: "R$ " + Number(ctx.pedidoMin || 2500).toLocaleString("pt-BR"),
        como_mandar: "Mande a URL EXATAMENTE como esta, sozinha numa linha, sem encurtar e sem colar texto nela. Diga que cada produto aparece COM O PRECO e que o total soma na tela — ele nao fecha nada sem ver o valor. Pode citar o desconto por volume, que esta impresso na propria pagina. O preco da tela JA E o preco final para a praca dele, com a entrega inclusa — pode dizer isso, e e uma boa noticia. O que voce NAO faz e abrir a conta: nunca diga o percentual do frete, nem quanto dele e frete, nem prometa prazo de entrega. Se ele perguntar o valor do frete, diga que ja esta no preco e que o detalhamento quem faz e o comercial.",
      };
    }
    if (["salvar_lead", "passar_comercial", "descartar_lead"].includes(name)) {
      const patch: any = {};
      for (const k of CAMPOS) if (input?.[k] != null && String(input[k]).trim()) patch[k] = String(input[k]).trim().slice(0, 400);
      if (patch.cnpj) patch.cnpj = digits(patch.cnpj).slice(0, 14);
      if (patch.uf) patch.uf = String(patch.uf).toUpperCase().slice(0, 2);
      if (input?.sabe_minimo === true) patch.sabe_minimo = true;
      // nome so vira "confirmado" quando a pessoa disse E tem sobrenome. Sem isso ele continua
      // sendo o apelido do WhatsApp, e o CRM nao e tocado.
      let crmNome: any = null;
      if (patch.nome && input?.nome_confirmado === true && nomePlausivel(patch.nome)) {
        patch.nome_confirmado = true;
        if (ctx.contact_id) {
          crmNome = await nomeNoCrm(String(ctx.contact_id), patch.nome);
          if (crmNome?.ok) patch.nome_crm_em = new Date().toISOString();
        }
      } else if (patch.nome && !nomePlausivel(patch.nome)) {
        // nao apaga o que ja existe, mas nao promove apelido a nome
        patch.nome_confirmado = false;
      }
      if (name === "salvar_lead") { const r = await upsertLead(sb, ctx, patch); return r.erro ? { erro: r.erro } : { ok: true, anotado: true, nome_no_crm: crmNome || undefined, lead: { nome: r.lead?.nome, nome_confirmado: !!r.lead?.nome_confirmado, empresa: r.lead?.empresa, praca: [r.lead?.cidade, r.lead?.uf].filter(Boolean).join("/"), interesse: r.lead?.interesse, status: r.lead?.status } }; }
      if (name === "descartar_lead") { const r = await upsertLead(sb, ctx, { ...patch, status: "descartado", motivo: String(input?.motivo || "").slice(0, 300) }); return r.erro ? { erro: r.erro } : { ok: true, descartado: true, aviso: "marcado como descartado. Encerre com gentileza, sem insistir." }; }
      // passar_comercial: o texto da tarefa e montado AQUI, a partir da linha do lead. A IA escreve
      // o resumo em volta; documento e telefone entram em codigo.
      const up = await upsertLead(sb, ctx, { ...patch, status: "qualificado" });
      if (up.erro) return { erro: up.erro };
      const L = up.lead || {};
      const det = [
        L.empresa ? "Loja: " + L.empresa : null,
        L.nome ? ("Contato: " + L.nome + (L.nome_confirmado ? "" : " (nome do perfil do WhatsApp — nao confirmado com ele)")) : null,
        ctx.fone ? "WhatsApp: " + foneFmt(ctx.fone) : null,
        docFmt(L.cnpj) || "Sem documento informado",
        (L.cidade || L.uf) ? "Praca: " + [L.cidade, L.uf].filter(Boolean).join("/") : null,
        L.endereco ? "Endereco: " + L.endereco : null,
        L.cep ? "CEP: " + L.cep : null,
        L.pagamento ? "Pagamento que ele quer: " + L.pagamento : null,
        L.tipo_loja ? "Tipo de loja: " + L.tipo_loja : null,
        L.interesse ? "Quer abastecer: " + L.interesse : null,
        L.ja_revende ? "Compra hoje: " + L.ja_revende : null,
        "Sabe do pedido minimo: " + (L.sabe_minimo ? "sim" : "NAO — diga na abordagem"),
        L.temperatura ? "Temperatura: " + L.temperatura : null,
        "",
        "Resumo da Nina: " + String(input?.resumo || L.resumo || "").slice(0, 700),
        input?.falta ? "Falta: " + String(input.falta).slice(0, 400) : null,
        "",
        "Origem: " + (ctx.source ? ("campanha \"" + ctx.source + "\"") : "campanha nao registrada no CRM") + ", atendido pela Nina " + (ctx.instancia === "ghl-nativo" ? "no WhatsApp oficial do GHL (numero da conta)" : ("no Zaptos, instancia " + ctx.instancia)) + ".",
        ctx.contact_id ? "Conversa: https://app.gohighlevel.com/v2/location/" + LOC + "/contacts/detail/" + ctx.contact_id : null,
      ].filter((x) => x !== null).join("\n");
      const { data: tf, error: eT } = await sb.from("copiloto_tarefas").insert({ area: "comercial", tipo: "lead-anuncio", acao: ("Fechar lead do anuncio: " + (L.empresa || L.nome || "lead sem nome")).slice(0, 500), detalhe: det.slice(0, 1500), cliente_nome: L.empresa || L.nome || null, contact_id: ctx.contact_id || null, origem: "nina-lead", prioridade: 1 }).select("id").maybeSingle();
      if (eT) return { erro: eT.message };
      // NAO grava status='passado'. Era isso que tirava o lead do seguimento (`seguir` so olha
      // qualificando/qualificado) e o deixava sem ninguem: o comercial achava que a Nina cuidava, a
      // Nina ja tinha saido. Fica 'qualificado' — ela continua com ele ate alguem assumir de fato.
      await upsertLead(sb, ctx, { tarefa_id: tf?.id || null });
      return { ok: true, protocolo: tf?.id, aviso: "tarefa #" + tf?.id + " aberta na area comercial. VOCE CONTINUA NA CONVERSA: nao se despeca, nao diga que outra pessoa assume daqui a menos que ele tenha pedido atendimento humano. Siga ajudando a montar o pedido pela pagina, sem prometer preco, prazo nem data." };
    }
    return { erro: "ferramenta desconhecida: " + name };
  } catch (e) { return { erro: String(e) }; }
}

// ---- prompt ----------------------------------------------------------------------------------
const ESTILO = `\n\nESTILO (pessoa de verdade, nao IA): frases curtas e naturais, sem negrito, sem listas, sem textao, emoji quase nunca. NAO diga que e IA/bot. Responda primeiro o que ele perguntou e so depois puxe a conversa.`;

async function playbook(sb: any): Promise<string> {
  const { data } = await sb.from("copiloto_skills").select("nome,conteudo").eq("ativo", true).in("nome", ["lead", "vendas"]);
  const ordem = (n: string) => n === "lead" ? 0 : 1;
  return (data || []).sort((a: any, b: any) => ordem(a.nome) - ordem(b.nome)).map((r: any) => "[" + String(r.nome).toUpperCase() + "]\n" + r.conteudo).join("\n\n");
}
async function licoes(sb: any): Promise<string> {
  try { const { data } = await sb.from("copiloto_licoes").select("licao").eq("ativo", true).order("id"); const ls = (data || []).map((r: any) => "- " + r.licao); return ls.length ? "\n\nLICOES DO GESTOR (tem PRIORIDADE, siga a risca):\n" + ls.join("\n") : ""; } catch (_e) { return ""; }
}

// ---- uma conversa ----------------------------------------------------------------------------
async function atender(sb: any, cfg: Record<string, string>, cv: any, opts: { dry: boolean; ativo: boolean; pedidoMin: number; inst: string; nativoOn: boolean; janelaH: number; pb: string; lic: string; reps: Set<string>; internos: Set<string>; exigeCnpj: boolean; exigeEndereco: boolean; exigeFrete: boolean }) {
  const contact_id = cv.contactId || cv.contact_id || null;
  const fone = String(cv.phone || "").trim();
  const nomeCrm = String(cv.fullName || cv.contactName || "").trim();
  const base = { contato: nomeCrm || fone || contact_id, contact_id };

  // conversa como ela esta no GHL — inclusive o que pessoa de verdade escreveu no meio
  const rm = await ghl("GET", `/conversations/${cv.id}/messages?limit=25`, "2021-04-15");
  if (!rm.ok) return { ...base, decisao: "erro", motivo: "GHL " + rm.status + " nas mensagens" };
  const dm = await rm.json().catch(() => ({}));
  const arr = (dm?.messages?.messages || dm?.messages || []) as any[];
  const msgs = arr.slice().reverse().filter((m: any) => String(m?.body || "").trim());
  if (!msgs.length) return { ...base, decisao: "pular", motivo: "sem mensagem com texto" };

  const ultima = msgs[msgs.length - 1];
  if (ultima.direction !== "inbound") return { ...base, decisao: "pular", motivo: "a ultima e nossa — alguem respondeu" };
  // DOIS CANAIS, e eles nao se misturam:
  //  - Zaptos: a mensagem traz "Instance Source: <instancia>" no rodape e a resposta sai pelo numero
  //    daquela instancia, via campanhas-enviar.
  //  - WhatsApp NATIVO do GHL (type 19 / TYPE_WHATSAPP): sem marcador, numero oficial da conta. A
  //    resposta TEM de sair por ele — mandar pelo Zaptos faria o lead receber mensagem de um numero
  //    estranho e partiria a conversa em duas.
  const nativo = String(ultima.messageType || "") === "TYPE_WHATSAPP" || Number(ultima.type) === 19 || String(cv.lastMessageType) === "TYPE_WHATSAPP";
  const instancia = instDe(ultima.body) || instDe(cv.lastMessageBody) || "";
  if (!nativo && norm(instancia) !== norm(opts.inst)) return { ...base, decisao: "pular", motivo: "outra instancia: " + (instancia || "sem marcador") };
  if (nativo && !opts.nativoOn) return { ...base, decisao: "pular", motivo: "canal nativo desligado (lead_nativo=nao)" };

  const texto = limpa(ultima.body);
  if (!texto) return { ...base, decisao: "pular", motivo: "mensagem sem texto (midia)" };
  if (ehRuido(texto)) return { ...base, decisao: "pular", motivo: "ruido (sistema ou autoresposta de terceiro)" };
  if (fone && opts.reps.has(fk8(fone))) return { ...base, decisao: "pular", motivo: "e representante — quem atende e o copiloto-conversa" };
  // NUMERO DE CASA nunca e lead. O aviso interno do encerramento sai pelo Zaptos da Nina, e o
  // contato do gestor tem `source` preenchido no CRM ("Form 38") — sem esta linha, a resposta dele
  // ("ok, obrigado") entraria pela porta da frente e a Nina tentaria qualificar o proprio gestor.
  if (fone && opts.internos.has(fk8(fone))) return { ...base, decisao: "pular", motivo: "numero interno (copiloto_responsaveis) — aviso da casa, nao lead" };

  // A assinatura da landing do Google vem na PRIMEIRA mensagem, que nem sempre e a ultima quando o
  // lead manda duas seguidas antes de a rodada de 5 min passar. Por isso olha o que ele escreveu na
  // conversa inteira, nao so o texto desta passada.
  const acl = acelera(msgs.filter((m: any) => m.direction === "inbound").map((m: any) => String(m.body || "")).join("\n"));

  // O fluxo do GHL marca quem vem do anuncio com a tag "ads" (e a instancia com "nina"). Isso e
  // MUITO mais confiavel do que adivinhar pela frase: o texto que o META pre-enche pode mudar a
  // qualquer momento no gerenciador, a tag nao. O regex fica como rede, para o caso de o contato
  // chegar sem tag.
  const tags = (Array.isArray(cv.tags) ? cv.tags : []).map((x: any) => norm(x));
  // A ACAO DE RASPAGEM TEM ROTEIRO PROPRIO (`nina-raspagem`), e publico oposto: distribuidor, nao
  // lojista. Se a Nina de lead pegar essa conversa primeiro, ela aplica o roteiro de loja em quem
  // compra para revender. Ordem do gestor em 27/10: "nao e para confundir com as outras".
  if (tags.includes("raspagem") || tags.includes("raspagem-onda1")) return { ...base, decisao: "pular", motivo: "contato da acao raspagem — quem atende e o nina-raspagem" };
  const ehAds = tags.includes("ads") || tags.includes("lead") || tags.includes("anuncio");
  // A busca aceita as DUAS formas de proposito: a nova (numero inteiro) e a antiga (10 digitos).
  // Os registros gravados ate a v9 tem 10 digitos; se a busca so procurasse a forma nova, o mesmo
  // lead viraria dois registros e a conversa recomecaria do zero para quem ja tinha respondido.
  const { data: leadRow } = await sb.from("copiloto_lead").select("*").or(`contact_id.eq.${contact_id || "__none__"},fone.eq.${foneNac(fone)},fone.eq.${d10(fone)}`).order("id", { ascending: false }).limit(1).maybeSingle();
  if (leadRow?.ultima_msg_id && leadRow.ultima_msg_id === ultima.id) return { ...base, decisao: "pular", motivo: "ja respondi esta mensagem (o envio pode estar a caminho)" };
  // O CRM tambem diz de onde ele veio: `source` e preenchido pelo formulario da landing (ex.
  // "Atacado Nitron Pro"). Isso e sinal de lead tao bom quanto a tag, e serve para campanha que
  // ninguem aqui conhece ainda.
  const crm = await contatoCrm(contact_id);
  if (!leadRow && !ehAds && !acl && !crm.source && !ehAbertura(texto)) return { ...base, decisao: "pular", motivo: "sem tag, sem source no CRM e a mensagem nao parece lead: " + texto.slice(0, 60) };

  // JANELA DE 24h DA META (so no canal nativo): passadas 24h da ultima mensagem do lead, texto
  // livre e RECUSADO — so template aprovado passa. Entao a Nina nao tenta: registra e chama humano,
  // em vez de gastar a tentativa e deixar o lead sem resposta.
  const nascida = new Date(ultima.dateAdded || cv.lastInboundWhatsappMessageDate || cv.lastMessageDate || Date.now()).getTime();
  const idadeH = (Date.now() - nascida) / 3600000;
  if (nativo && idadeH > opts.janelaH) {
    if (leadRow?.status === "janela_fechada") return { ...base, decisao: "pular", motivo: "janela de 24h fechada, humano ja avisado" };
    if (opts.dry) return { ...base, decisao: "janela_fechada", motivo: "passaram " + idadeH.toFixed(1) + "h da mensagem dele: a Meta so aceita template agora (previa, nada gravado)" };
    const up = await upsertLead(sb, { contact_id, fone: foneNac(fone), instancia: "ghl-nativo" }, { nome: nomeCrm || null, empresa: crm.empresa || null, cnpj: crm.cnpj || null, status: "janela_fechada", motivo: "janela de 24h da Meta fechada antes da primeira resposta" });
    const { data: tfj } = await sb.from("copiloto_tarefas").insert({ area: "comercial", tipo: "lead-janela-24h", acao: ("Lead sem resposta e janela de 24h fechada: " + (nomeCrm || fone)).slice(0, 500), detalhe: ["Canal: WhatsApp nativo do GHL", "Contato: " + (nomeCrm || "sem nome"), "WhatsApp: " + foneFmt(fone), docFmt(crm.cnpj) || "Sem documento", crm.source ? "Origem (CRM): " + crm.source : null, crm.url ? "Landing: " + crm.url : null, "Escreveu: \"" + texto.slice(0, 200) + "\"", "", "Passaram " + idadeH.toFixed(1) + "h: texto livre nao passa mais pela Meta. Responder por template aprovado, ou ligar."].filter(Boolean).join("\n").slice(0, 1500), cliente_nome: nomeCrm || null, contact_id, origem: "nina-lead", prioridade: 2 }).select("id").maybeSingle();
    return { ...base, decisao: "janela_fechada", lead_id: up.lead?.id || null, tarefa: tfj?.id || null, motivo: "passaram " + idadeH.toFixed(1) + "h — tarefa aberta p/ o comercial (template ou ligacao)" };
  }

  const ctx: any = { contact_id, fone: foneNac(fone), instancia: nativo ? "ghl-nativo" : instancia, dry: opts.dry, pedidoMin: opts.pedidoMin, exigeCnpj: opts.exigeCnpj, exigeEndereco: opts.exigeEndereco, exigeFrete: opts.exigeFrete, source: acl?.origem || crm.source || (ehAds ? "anuncio META" : null) };
  // Se ele ja informou o CNPJ no formulario, a Nina NAO pede de novo — e o codigo ja confere se
  // esse CNPJ tem cadastro, para ela nao tratar cliente antigo como lead novo.
  // O CNPJ pode vir do campo do CRM (formulario que grava no contato) ou da propria assinatura da
  // landing do Google, que nao grava em lugar nenhum. Nos dois casos ele JA informou.
  const cnpjForm = crm.cnpj || acl?.cnpj || "";
  let cadastro: any = null;
  if (cnpjForm && cnpjForm.length >= 11) { const { data } = await sb.from("ghl_cliente").select("codparc, razao, situacao, dias").ilike("cnpj", "%" + cnpjForm + "%").limit(1).maybeSingle(); cadastro = data || null; }
  // nome do CRM entra so como provisorio: se a Nina JA confirmou o nome com a pessoa, esta linha
  // nao pode reescrever com o apelido do perfil (era o mesmo vao que fazia o status voltar na v4).
  // NOME: o que ele DIGITOU no formulario e ele mesmo escrevendo, nao o apelido do perfil — passa
  // pela mesma peneira (nomePlausivel) e vale como confirmado. Continua valendo a regra da v11: se
  // ja havia nome confirmado, nada aqui reescreve.
  const aclNome = (acl?.nome && nomePlausivel(acl.nome)) ? acl.nome.replace(/\s+/g, " ").trim() : "";
  const nomeConf = leadRow?.nome_confirmado ? String(leadRow.nome || "") : aclNome;
  if (!opts.dry && (cnpjForm || crm.source || acl)) {
    await upsertLead(sb, ctx, {
      nome: leadRow?.nome_confirmado ? null : (aclNome || nomeCrm || null),
      nome_confirmado: (!leadRow?.nome_confirmado && aclNome) ? true : null,
      empresa: crm.empresa || cadastro?.razao || null,
      cnpj: cnpjForm || null,
      codparc: cadastro?.codparc || null,
      origem: ctx.source,
    });
    // e o CRM tambem: nao adianta a Nina saber o nome e quem for atender continuar vendo "🙂".
    if (aclNome && contact_id && !leadRow?.nome_confirmado && !leadRow?.nome_crm_em) {
      const cr = await nomeNoCrm(contact_id, aclNome);
      if (cr.ok) await upsertLead(sb, ctx, { nome_crm_em: new Date().toISOString() });
    }
  }
  const jaSei = leadRow ? [(leadRow.nome && leadRow.nome_confirmado) && "nome: " + leadRow.nome, leadRow.empresa && "loja: " + leadRow.empresa, leadRow.cnpj && "CNPJ ja informado", (leadRow.cidade || leadRow.uf) && "praca: " + [leadRow.cidade, leadRow.uf].filter(Boolean).join("/"), leadRow.endereco && "endereco ja informado", leadRow.pagamento && "pagamento: " + leadRow.pagamento, leadRow.tipo_loja && "tipo: " + leadRow.tipo_loja, leadRow.ja_revende && "compra hoje: " + leadRow.ja_revende, leadRow.interesse && "interesse: " + leadRow.interesse, leadRow.sabe_minimo && "JA sabe do pedido minimo", leadRow.link_seg && "JA RECEBEU o link da pagina de pedido (cesta " + leadRow.link_seg + ") — nao mande de novo", "status: " + leadRow.status].filter(Boolean).join(" | ") : "";

  const nome = prim(cfg.nome_assistente || opts.inst || "Nina");
  const sys = `Voce e a ${nome}, do time comercial da Nitronplast (Nitron), por WhatsApp. Calorosa e natural, pessoa de verdade da equipe.` + ESTILO
    + `\n\nHOJE e ${hojeBRT()} (data atual REAL; datas de 2026 sao normais).`
    + (opts.pb ? `\n\nMANUAIS DA CASA (o [LEAD] manda aqui):\n${opts.pb}` : "")
    + `\n\nQUEM E ESTE CONTATO: um LEAD, nao representante. ${acl ? "Veio da landing \"Acelera Nitron\" — a campanha da Nitron no GOOGLE — e preencheu o formulario de la antes de te escrever." : ehAds ? "Veio do anuncio da Nitron no META (tag ads no CRM)." : crm.source ? ("Veio da campanha/landing \"" + crm.source + "\" — foi o que o CRM registrou como origem" + (crm.url ? (", pela pagina " + crm.url) : "") + (crm.utm ? (", chegando por " + crm.utm) : "") + ".") : "A origem nao esta registrada no CRM."}`
    + `\n${(ehAds || acl) ? "" : "VOCE NAO SABE qual criativo ou promessa ele viu, e NAO PODE adivinhar: nao invente oferta, valor, brinde nem condicao que possa ter sido anunciada. Se ele citar algo que viu, pergunte o que exatamente foi oferecido antes de confirmar qualquer coisa — e diga que confirma com o consultor. Comece perguntando, de leve, que tipo de loja ele tem e o que quer abastecer."}`
    + (cadastro ? `\nATENCAO: o CNPJ que ele informou JA TEM CADASTRO na Nitron — ${cadastro.razao} (codparc ${cadastro.codparc}, situacao ${cadastro.situacao}). Nao trate como lead novo: reconheca que ele ja e cliente e passe pro comercial com passar_comercial.` : "")
    + (cnpjForm && !cadastro ? `\nELE JA INFORMOU O CNPJ no formulario e NAO tem cadastro ainda. NAO peca o CNPJ de novo — isso irrita. Se precisar confirmar, confirme a EMPRESA pelo nome, nao o numero.` : "")
    + `\nPEDIDO MINIMO da Nitron: R$ ${opts.pedidoMin.toLocaleString("pt-BR")}. Diga quando a conversa chegar em volume, mix ou como comprar — nunca na abertura.`
    + (cfg.catalogo_url ? `\nCATALOGO (mande o LINK quando ele quiser ver produtos): ${cfg.catalogo_url}` : "")
    + `\nQUEM FECHA E VOCE — ordem do gestor, repetida em 21/10: "nao vai passar mais, vai fazer o combinado da Nina fechar". NENHUM lead vai para representante. Voce leva a conversa do inicio ao fim, pela pagina de pedido. So existe UMA passagem possivel, e e para a venda interna (Monica), quando ele PEDIR atendimento humano e ja estiver qualificado. Nao se despeca do lead dizendo que alguem assume daqui.`
    + `\nPAGINA DE PEDIDO: existe uma pagina com a cesta sugerida para o ramo dele, onde cada produto aparece COM O PRECO, o total soma na tela e o desconto por volume entra sozinho. Se ele JA recebeu o link nesta conversa, nao mande de novo sem um motivo novo.`
    + `\nANTES DO LINK, DOIS DADOS — ordem do gestor em 26/10, e isto MUDOU em relacao ao que valia ate ontem: o link SO sai depois que voce tiver (1) o CNPJ da loja e (2) o ENDERECO dela. Nao e burocracia, cada um resolve uma coisa: o CNPJ diz o ramo (CNAE) e com isso a lista certa de produtos; o ENDERECO diz a praca, e a TABELA DE PRECO MUDA conforme a regiao. Mandar link sem endereco e arriscar mostrar preco que nao vale para ele. Peca os dois de uma vez, de leve, explicando o porque — e se ele pedir o link antes, diga que ja vai mandar e aproveite para pedir os dois na mesma mensagem, sem travar a conversa. Com os dados em maos, chame salvar_lead e depois link_pedido. A ferramenta RECUSA o link enquanto faltar um deles.`
    + `\nO CEP E O QUE DEFINE O PRECO. Desde 27/10 a pagina ja mostra o valor COM A ENTREGA INCLUSA, item a item, e o percentual vem da praca dele — que sai do CEP. Entao peca o CEP junto com o endereco, sempre. O que voce pode dizer: que o preco da tela ja e o final para a cidade dele, com entrega, sem surpresa depois. O que voce NAO diz, nunca: o percentual do frete, quanto do preco e frete, ou prazo de entrega. Se ele perguntar quanto fica o frete, a resposta e que ja esta no preco e que o detalhamento quem faz e o comercial.`
    + `\nFORMA DE PAGAMENTO (ordem do gestor, 26/10): pergunte tambem como ele pretende pagar e ja diga o que existe NA PRIMEIRA COMPRA — a vista, ou 6x no cartao sem juros. So isso; nao invente boleto, prazo, faturamento 30/60/90 nem nada diferente, e nao prometa condicao especial. Salve a resposta em salvar_lead (campo pagamento).`
    + (cfg.site_url ? `\nSITE: ${cfg.site_url}` : "")
    + `\n${jaSei ? "JA APURADO (nao pergunte de novo): " + jaSei : "AINDA NAO SEI NADA sobre ele — comece pelo tipo de loja e o que ele precisa abastecer."}`
    + (nomeConf
      ? `\nNOME JA CONFIRMADO por ele: ${nomeConf}. Use esse e NAO pergunte de novo.`
      : `\nNOME — regra do gestor (22/09): ${nomeCrm ? `no CRM esta "${nomeCrm}", e isso vem do perfil do WhatsApp: pode ser apelido, emoji, versiculo ou o nome da loja. NAO trate como o nome dele.` : "voce ainda nao sabe o nome dele."} Pergunte o nome COMPLETO (nome e sobrenome), de leve e UMA vez, cedo na conversa — algo como "antes de a gente seguir, com quem eu falo? seu nome completo" — e nunca deduza nem complete sobrenome por conta propria. Quando ele responder, chame salvar_lead com nome (nome e sobrenome, como ele escreveu) e nome_confirmado=true. Sem isso o consultor recebe o lead sem saber com quem vai falar.`)
    + opts.lic;

  const messages: any[] = [{ role: "user", content: msgs.map((m: any) => (m.direction === "inbound" ? "CONTATO: " : "VOCE (Nitron): ") + limpa(m.body).slice(0, 500)).join("\n") + "\n\n(Responda so a proxima mensagem sua, sem prefixo.)" }];
  let reply = ""; const usadas: string[] = [];
  for (let i = 0; i < 5; i++) {
    const resp = await anthropic(sys, messages, TOOLS);
    const bl = resp.content || []; messages.push({ role: "assistant", content: bl });
    const tus = bl.filter((x: any) => x.type === "tool_use");
    if (resp.stop_reason !== "tool_use" || !tus.length) { reply = bl.filter((x: any) => x.type === "text").map((x: any) => x.text).join("\n").trim(); break; }
    const rs: any[] = [];
    for (const tu of tus) { usadas.push(tu.name); const out = await runTool(sb, ctx, tu.name, tu.input); rs.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out).slice(0, 6000) }); }
    messages.push({ role: "user", content: rs });
  }
  if (!reply) return { ...base, decisao: "erro", motivo: "o modelo nao devolveu texto", ferramentas: usadas };

  if (opts.dry || !opts.ativo) return { ...base, decisao: "previa", canal: nativo ? "whatsapp-nativo-ghl" : ("zaptos:" + instancia), origem: (acl ? "landing Acelera Nitron (Google) — google-acelera" : null) || crm.source || (ehAds ? "anuncio META (tag ads)" : null), cnpj_do_form: cnpjForm ? docFmt(cnpjForm) : null, ja_cliente: cadastro ? (cadastro.razao + " / codparc " + cadastro.codparc) : null, horas_desde_a_mensagem: Number(idadeH.toFixed(1)), ferramentas: usadas, recebido: texto.slice(0, 200), rascunho: reply, motivo: opts.dry ? "previa (dry=1)" : "lead_ativo=nao" };

  const env = nativo ? await enviarNativo(String(contact_id), reply) : await enviar(contact_id, fone, reply, opts.inst);
  // NAO escreve status aqui. Quem manda no status sao as ferramentas (descartar_lead,
  // passar_comercial), e elas rodaram DEPOIS de leadRow ser lido: reescrever com o valor antigo
  // desfazia o que elas acabaram de gravar — o Fiver Metalurgica virou "descartado" e voltou para
  // "qualificando" na mesma rodada (10/09). Pelo mesmo motivo nao escreve mais o NOME: a ferramenta
  // pode ter acabado de gravar o nome confirmado, e o valor antigo o apagaria.
  const up = await upsertLead(sb, ctx, { ultima_msg_id: ultima.id, ultima_resposta_em: new Date().toISOString() });
  if (!env?.ok) {
    // QUEDA: para tudo agora. Sem isto a rodada seguinte escreve outra mensagem, e a seguinte outra.
    if (env?.instancia_caiu) {
      const p = await pausarInstancia(sb, opts.inst, "queda detectada ao responder lead: " + String(env?.recusado || env?.motivo || "").slice(0, 200));
      return { ...base, decisao: "instancia_caiu", canal: "zaptos:" + instancia, instancia_pausada: p.ok, motivo: env?.recusado || env?.motivo, abortar: true };
    }
    // recusa comum (fixo, numero sem WhatsApp, dono errado): poe de molho para nao tentar de 5 em 5 min
    if (!opts.dry) await upsertLead(sb, ctx, { envio_erro: String(env?.motivo || "envio recusado").slice(0, 300), envio_erro_em: new Date().toISOString() });
    return { ...base, decisao: "falhou", canal: nativo ? "whatsapp-nativo-ghl" : ("zaptos:" + instancia), ferramentas: usadas, motivo: env?.motivo || "envio recusado", texto: reply };
  }
  return { ...base, decisao: "respondeu", canal: nativo ? "whatsapp-nativo-ghl" : ("zaptos:" + instancia), origem: (acl ? "landing Acelera Nitron (Google) — google-acelera" : null) || crm.source || (ehAds ? "anuncio META (tag ads)" : null), ferramentas: usadas, lead_id: up.lead?.id || null, status: up.lead?.status, recebido: texto.slice(0, 200), texto: reply };
}

// ---- seguimento: o toque em quem nao respondeu ----------------------------------------------
// Ate a v6 a Nina so falava quando o lead falava: quem nao respondia a primeira mensagem morria
// ali. Agora ela da um toque leve depois de lead_seguir_min, no maximo lead_toques_max vezes, e
// quem nao responde nem assim fica 'frio' (sem tarefa: lead que nunca falou nao e trabalho pro
// comercial).
// Horario de Sao Paulo, fixo — a PRIMEIRA resposta nao espera horario (o lead acabou de escrever),
// mas o toque e iniciativa nossa e as 22h e falta de educacao.
function foraHorarioComercial(): boolean {
  const brt = new Date(Date.now() - 3 * 3600 * 1000);
  const dow = brt.getUTCDay(); const h = brt.getUTCHours();
  if (dow === 0) return true;
  if (dow === 6) return h < 8 || h >= 13;
  return h < 8 || h >= 18;
}

async function seguir(sb: any, cfg: Record<string, string>, o: any) {
  const feitos: any[] = [];
  const { data: cands } = await sb.from("copiloto_lead").select("*")
    .in("status", ["qualificando", "qualificado"])
    .not("ultima_resposta_em", "is", null)
    .lt("toques", o.toquesMax)
    .order("ultima_resposta_em", { ascending: true }).limit(30);
  let tocados = 0;
  for (const L of (cands || [])) {
    if (tocados >= o.limite) break;
    const base = { contato: L.nome || L.empresa || L.fone, lead_id: L.id };
    if (!L.contact_id) { feitos.push({ ...base, decisao: "pular", motivo: "lead sem contact_id" }); continue; }
    const rc = await ghl("GET", `/conversations/search?locationId=${LOC}&contactId=${L.contact_id}&limit=1`);
    if (!rc.ok) { feitos.push({ ...base, decisao: "erro", motivo: "GHL " + rc.status }); continue; }
    const cv = (((await rc.json().catch(() => ({})))?.conversations) || [])[0];
    if (!cv) { feitos.push({ ...base, decisao: "pular", motivo: "conversa nao encontrada" }); continue; }
    // "ultima mensagem e dele" nao significa que ele respondeu: pode ser o robo da propria loja
    // dele. A Natalie caiu exatamente nesse vao em 10/09 — o inbound pulava por ruido e o
    // seguimento pulava por "ele respondeu", e ninguem falava com ela.
    const ultimaDele = String(cv.lastMessageDirection) === "inbound";
    const ultimaERuido = ultimaDele && ehRuido(limpa(cv.lastMessageBody));
    if (ultimaDele && !ultimaERuido) { feitos.push({ ...base, decisao: "pular", motivo: "ele respondeu — o caminho normal cuida" }); continue; }
    const nativo = String(cv.lastMessageType) === "TYPE_WHATSAPP";
    const minDesde = (Date.now() - new Date(L.ultima_resposta_em).getTime()) / 60000;
    // janela de 24h da Meta: medida da ULTIMA mensagem DELE, nao da nossa
    let restamMin = Infinity;
    if (nativo && Number(cv.lastInboundWhatsappMessageDate || 0)) restamMin = o.janelaH * 60 - (Date.now() - Number(cv.lastInboundWhatsappMessageDate)) / 60000;
    if (restamMin <= 0) {
      if (!o.dry) await sb.from("copiloto_lead").update({ status: "frio", motivo: "nao respondeu e a janela de 24h da Meta fechou", atualizado: new Date().toISOString() }).eq("id", L.id);
      feitos.push({ ...base, decisao: "esfriou", motivo: "janela de 24h fechada sem resposta dele" }); continue;
    }
    // toca quando ja passou a espera, OU quando a janela vai fechar e ele nunca foi tocado
    const naHora = minDesde >= o.seguirMin;
    const ultimaChance = nativo && restamMin <= o.avisoMin && Number(L.toques || 0) === 0;
    // de molho: um envio recusado ha pouco nao se repete na passada seguinte. Sem isto, um numero
    // fixo ou um dono errado no CRM gera uma mensagem nova do modelo a cada 5 minutos, para sempre.
    if (L.envio_erro_em && (Date.now() - new Date(L.envio_erro_em).getTime()) / 60000 < o.erroEsperaMin) {
      feitos.push({ ...base, decisao: "pular", motivo: "envio recusado ha pouco (" + String(L.envio_erro || "").slice(0, 80) + ") — de molho ate " + o.erroEsperaMin + "min" }); continue;
    }
    if (!naHora && !ultimaChance) { feitos.push({ ...base, decisao: "pular", motivo: "ainda cedo (" + Math.round(minDesde) + "min de " + o.seguirMin + (nativo ? ("; janela fecha em " + Math.round(restamMin) + "min") : "") + ")" }); continue; }
    if (o.soHorario && foraHorarioComercial()) { feitos.push({ ...base, decisao: "pular", motivo: "fora do horario comercial de SP" }); continue; }

    const rm = await ghl("GET", `/conversations/${cv.id}/messages?limit=25`, "2021-04-15");
    if (!rm.ok) { feitos.push({ ...base, decisao: "erro", motivo: "GHL " + rm.status + " nas mensagens" }); continue; }
    const arr = (((await rm.json().catch(() => ({})))?.messages?.messages) || []) as any[];
    const msgs = arr.slice().reverse().filter((m: any) => String(m?.body || "").trim() && !/^#contact_instance|^\[System\]/i.test(String(m.body)));
    if (!msgs.length) { feitos.push({ ...base, decisao: "pular", motivo: "sem historico legivel" }); continue; }

    const toqueN = Number(L.toques || 0) + 1;
    const jaSei = [L.empresa && "loja: " + L.empresa, L.tipo_loja && "tipo: " + L.tipo_loja, (L.cidade || L.uf) && "praca: " + [L.cidade, L.uf].filter(Boolean).join("/"), L.endereco && "endereco ja informado", L.interesse && "interesse: " + L.interesse, L.cnpj && "CNPJ ja informado", L.sabe_minimo && "ja sabe do pedido minimo"].filter(Boolean).join(" | ");
    const sys = `Voce e a ${prim(cfg.nome_assistente || o.inst || "Nina")}, do time comercial da Nitronplast (Nitron), por WhatsApp. Calorosa e natural, pessoa de verdade da equipe.` + ESTILO
      + `\n\nHOJE e ${hojeBRT()} (data atual REAL).`
      + (o.pb ? `\n\nMANUAIS DA CASA (o [LEAD] manda aqui):\n${o.pb}` : "")
      + `\n\nTOQUE DE SEGUIMENTO (toque ${toqueN} de ${o.toquesMax}): ele NAO respondeu sua ultima mensagem, mandada ha ${Math.round(minDesde / 60)}h. Mande UMA mensagem curta, leve e SEM cobranca.`
      + `\nNAO repita o que voce ja disse nem reformule a mesma pergunta: troque de angulo.`
      + `\nO ANGULO E O CONTORNO (ordem do gestor, 22/10) — use UM dos dois, o que couber na conversa: (a) o DESCONTO QUE ELE JA TEM, sem negociar nada: a partir de R$ 5.000 entram 10%, somando sozinho na tela enquanto ele monta; (b) que montando so com os itens que ELE precisa pode haver CONDICAO ESPECIAL, porque ao concluir o pedido voce passa para um dos nossos vendedores, e e ele quem abre outras tabelas e condicoes que voce nao libera sozinha. Concluir nao obriga a nada — poe um vendedor na conversa. NUNCA prometa percentual, tabela ou prazo especifico, e nao use pressa nem escassez.`
      + `\nNAO ofereca o catalogo como saida: ele NAO tem preco, e foi essa a reclamacao que ja nos custou um lead. O que resolve e a pagina de pedido.`
      + `\nFaca no maximo UMA pergunta facil de responder.`
      + `\nNUNCA use pressa, escassez, "so hoje" nem cobranca de resposta.`
      + (toqueN >= o.toquesMax ? `\nESTE E O ULTIMO TOQUE, entao e ele que tem de carregar o contorno inteiro: diga o desconto que ele ja tem na pagina E que concluir o pedido coloca um vendedor na conversa, com poder de ver tabela e condicao. NAO se despeca, nao diga "fico a disposicao" e pare por ai — quem se despede perde o lead. Deixe a porta aberta COM um motivo concreto para ele voltar.` : "")
      + `\n\nQUEM E: lead de campanha, nao representante e sem cadastro de cliente. ${L.origem === ACELERA_ORIGEM ? "Veio da landing \"Acelera Nitron\", a campanha da Nitron no GOOGLE." : L.origem ? ("Origem registrada no CRM: \"" + L.origem + "\".") : "Origem nao registrada."} Nao invente oferta nem condicao que possa ter sido anunciada.`
      + `\nPEDIDO MINIMO: R$ ${o.pedidoMin.toLocaleString("pt-BR")}.`
      + (cfg.catalogo_url ? `\nCATALOGO (link): ${cfg.catalogo_url}` : "")
      + (L.link_seg ? `\nELE JA RECEBEU O LINK da pagina de pedido (cesta ${L.link_seg}). Nao mande de novo: se for falar dele, fale do que tem dentro.` : `\nPAGINA DE PEDIDO: este toque e um bom lugar para caminhar para o link — la cada produto aparece COM O PRECO e o total soma na tela. Mas desde 26/10 o link SO sai com o CNPJ E o ENDERECO da loja na mao (o CNPJ escolhe a lista, o endereco escolhe a tabela de preco da praca). Se ainda faltar algum dos dois, use o toque para pedir o que falta, explicando o porque — nao para mandar link. Com os dois, chame link_pedido.`)
      + `\n${jaSei ? "JA APURADO (nao pergunte de novo): " + jaSei : "Nao sei nada sobre a loja dele ainda."}`
      + (L.nome_confirmado ? `\nNOME JA CONFIRMADO por ele: ${L.nome}. Use esse.` : `\nVoce ainda NAO confirmou o nome dele (o que aparece e o do perfil do WhatsApp). Se couber no toque, pergunte o nome completo de leve — e chame salvar_lead com nome e nome_confirmado=true quando ele responder.`)
      + o.lic;
    const messages: any[] = [{ role: "user", content: msgs.map((m: any) => (m.direction === "inbound" ? "CONTATO: " : "VOCE (Nitron): ") + limpa(m.body).slice(0, 400)).join("\n") + "\n\n(Escreva SO o toque de seguimento, sem prefixo.)" }];
    const ctx: any = { contact_id: L.contact_id, fone: L.fone, instancia: L.instancia, dry: o.dry, pedidoMin: o.pedidoMin, exigeCnpj: o.exigeCnpj, exigeEndereco: o.exigeEndereco, exigeFrete: o.exigeFrete, source: L.origem };
    let texto = ""; const usadas: string[] = [];
    for (let i = 0; i < 4; i++) {
      const resp = await anthropic(sys, messages, TOOLS);
      const bl = resp.content || []; messages.push({ role: "assistant", content: bl });
      const tus = bl.filter((x: any) => x.type === "tool_use");
      if (resp.stop_reason !== "tool_use" || !tus.length) { texto = bl.filter((x: any) => x.type === "text").map((x: any) => x.text).join("\n").trim(); break; }
      const rs: any[] = [];
      for (const tu of tus) { usadas.push(tu.name); const out = await runTool(sb, ctx, tu.name, tu.input); rs.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(out).slice(0, 4000) }); }
      messages.push({ role: "user", content: rs });
    }
    if (!texto) { feitos.push({ ...base, decisao: "erro", motivo: "o modelo nao devolveu texto" }); continue; }
    if (o.dry || !o.ativo) { feitos.push({ ...base, decisao: "previa_toque", toque: toqueN, canal: nativo ? "whatsapp-nativo-ghl" : ("zaptos:" + (L.instancia || o.inst)), horas_sem_resposta: Math.round(minDesde / 60), janela_fecha_em_min: restamMin === Infinity ? null : Math.round(restamMin), rascunho: texto }); continue; }
    const env = nativo ? await enviarNativo(String(L.contact_id), texto) : await enviar(L.contact_id, L.fone || "", texto, L.instancia || o.inst);
    if (!env?.ok) {
      if (env?.instancia_caiu) {
        const p = await pausarInstancia(sb, L.instancia || o.inst, "queda detectada no toque ao lead: " + String(env?.recusado || env?.motivo || "").slice(0, 200));
        feitos.push({ ...base, decisao: "instancia_caiu", instancia: L.instancia || o.inst, instancia_pausada: p.ok, motivo: env?.recusado || env?.motivo });
        break; // nao adianta tentar os proximos leads: a instancia e a mesma
      }
      if (!o.dry) await sb.from("copiloto_lead").update({ envio_erro: String(env?.motivo || "envio recusado").slice(0, 300), envio_erro_em: new Date().toISOString(), atualizado: new Date().toISOString() }).eq("id", L.id);
      feitos.push({ ...base, decisao: "falhou", motivo: env?.motivo || "envio recusado", texto });
      continue;
    }
    await sb.from("copiloto_lead").update({ toques: toqueN, ultimo_toque_em: new Date().toISOString(), ultima_resposta_em: new Date().toISOString(), atualizado: new Date().toISOString() }).eq("id", L.id);
    tocados++;
    feitos.push({ ...base, decisao: "tocou", toque: toqueN, canal: nativo ? "whatsapp-nativo-ghl" : ("zaptos:" + (L.instancia || o.inst)), texto });
  }
  // quem estourou o teto de toques e continua calado vira 'frio'
  let esfriados = 0;
  if (!o.dry) {
    const { data: velhos } = await sb.from("copiloto_lead").select("id").eq("status", "qualificando").gte("toques", o.toquesMax).lt("ultima_resposta_em", new Date(Date.now() - o.seguirMin * 60000).toISOString());
    for (const v of (velhos || [])) { await sb.from("copiloto_lead").update({ status: "frio", motivo: "nao respondeu aos " + o.toquesMax + " toques", atualizado: new Date().toISOString() }).eq("id", v.id); esfriados++; }
  }
  const conta = (k: string) => feitos.filter((x) => x.decisao === k).length;
  return { candidatos: (cands || []).length, tocou: conta("tocou"), previa_toque: conta("previa_toque"), esfriou: conta("esfriou") + esfriados, pulou: conta("pular"), falhou: conta("falhou"), erro: conta("erro"), resultado: feitos };
}

// ---- rodada ----------------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (!GHL) return j({ ok: false, erro: "sem GHL_TOKEN" }, 500);
    const sb = createClient(SUPA_URL, srvKey());
    const sp = new URL(req.url).searchParams;
    const b = await req.json().catch(() => ({} as any));
    const dry = sp.get("dry") === "1" || b.dry === true;
    const limite = Math.min(parseInt(sp.get("limite") || b.limite || "6") || 6, 20);

    // ---- REPARO: regrava copiloto_lead.fone com o telefone real do CRM ----
    // Existe por causa do d10(): ate a v9 a coluna guardou numero decapitado, e nao da para
    // reconstruir o que foi cortado (o digito perdido e o primeiro do DDD). A unica fonte de verdade
    // e o contato no GHL. ?acao=fone_crm&dry=1 mostra o que mudaria sem gravar.
    if (String(sp.get("acao") || b.acao || "").toLowerCase() === "fone_crm") {
      const { data: leads } = await sb.from("copiloto_lead").select("id, contact_id, nome, empresa, fone").order("id");
      const mud: any[] = [];
      for (const L of (leads || [])) {
        if (!L.contact_id) { mud.push({ id: L.id, situacao: "sem contact_id" }); continue; }
        const rc = await ghl("GET", "/contacts/" + L.contact_id);
        if (!rc.ok) { mud.push({ id: L.id, situacao: "GHL " + rc.status }); continue; }
        const dc = await rc.json().catch(() => ({} as any));
        const novo = foneNac(dc?.contact?.phone || "");
        if (!novo) { mud.push({ id: L.id, situacao: "contato sem telefone no CRM" }); continue; }
        if (novo === digits(L.fone)) { mud.push({ id: L.id, situacao: "ja certo", fone: foneFmt(novo) }); continue; }
        if (!dry) await sb.from("copiloto_lead").update({ fone: novo }).eq("id", L.id);
        mud.push({ id: L.id, quem: L.empresa || L.nome, situacao: dry ? "mudaria" : "corrigido", antes: foneFmt(L.fone), depois: foneFmt(novo) });
      }
      return j({ ok: true, acao: "fone_crm", dry, total: mud.length, corrigidos: mud.filter((x) => x.situacao === "corrigido" || x.situacao === "mudaria").length, resultado: mud });
    }

    const { data: cfgRows } = await sb.from("copiloto_config").select("*");
    const cfg: Record<string, string> = {}; (cfgRows || []).forEach((r: any) => cfg[r.chave] = r.valor);
    if (String(cfg.copiloto_ativo || "sim").toLowerCase() === "nao") return j({ ok: true, desligado: "copiloto_ativo=nao" });
    const ativo = String(cfg.lead_ativo || "nao").toLowerCase() === "sim";
    const inst = String(cfg.lead_inst || cfg.nome_assistente || "Nina").split(",")[0].trim();
    const pedidoMin = parseInt(digits(cfg.pedido_minimo || "2500")) || 2500;
    const esperaMin = Math.max(0, parseInt(cfg.lead_espera_min || "2") || 0);
    const ateHoras = Math.max(1, parseInt(cfg.lead_ate_horas || "48") || 48);
    const nativoOn = String(cfg.lead_nativo || "sim").toLowerCase() === "sim";
    const janelaH = Math.max(1, parseFloat(cfg.lead_janela_h || "23.5") || 23.5);
    const seguirMin = Math.max(15, parseInt(cfg.lead_seguir_min || "180") || 180);
    const toquesMax = Math.max(0, parseInt(cfg.lead_toques_max || "2") || 0);
    const soHorario = String(cfg.lead_toque_horario || "sim").toLowerCase() === "sim";
    const avisoMin = Math.max(0, parseInt(cfg.lead_janela_aviso_min || "90") || 0);
    const erroEsperaMin = Math.max(5, parseInt(cfg.lead_erro_espera_min || "120") || 120);
    // o link so sai com CNPJ e endereco (ordem do gestor, 26/10). Afrouxar e UPDATE, sem deploy.
    const exigeCnpj = String(cfg.link_exige_cnpj || "sim").toLowerCase() === "sim";
    const exigeEndereco = String(cfg.link_exige_endereco || "sim").toLowerCase() === "sim";
    // o link so sai com a praca resolvida, porque sem ela o preco da tela sai SEM o frete CIF.
    const exigeFrete = String(cfg.link_exige_frete || "sim").toLowerCase() === "sim";
    const acao = String(sp.get("acao") || b.acao || "tudo").toLowerCase();
    RUIDO_EXTRA = null;
    if (String(cfg.lead_ruido_extra || "").trim()) { try { RUIDO_EXTRA = new RegExp(String(cfg.lead_ruido_extra).trim(), "i"); } catch (_e) { RUIDO_EXTRA = null; } }

    // Instancia pausada nao tenta NADA — nem responder, nem tocar. Esta leitura faltava: o
    // campanhas-enviar filtra por `ativa`, nao por `pausada_em`, entao o copiloto seguia batendo
    // numa sessao morta. Quem religa a sessao no Zaptos tira a pausa (ou o vigia-instancia tira).
    const pausadas = await instanciasPausadas(sb);
    if (pausadas.has(norm(inst))) {
      return j({ ok: true, instancia: inst, pausado: true,
        motivo: "instancia '" + inst + "' esta pausada em instancia_ghl — nada foi enviado. Religue a sessao no Zaptos e limpe pausada_em." });
    }

    // as conversas em que a ULTIMA mensagem e do contato: ninguem respondeu ainda
    const r = await ghl("GET", `/conversations/search?locationId=${LOC}&limit=100&sortBy=last_message_date&sort=desc&lastMessageDirection=inbound`);
    if (!r.ok) return j({ ok: false, http: r.status, erro: (await r.text()).slice(0, 300) });
    const convs = ((await r.json())?.conversations || []) as any[];
    const agora = Date.now();
    // A INSTANCIA JA VEM NA BUSCA, no rodape da ultima mensagem (lastMessageBody): filtrar aqui, e
    // so depois cortar em `limite`. Na v1 o corte vinha antes do filtro e num dia normal de
    // operacao as conversas de representante empurravam o lead para fora da fila — as 20 primeiras
    // eram todas de outra instancia ou ja respondidas, e o lead do anuncio nunca era olhado.
    // De quebra, so busca as mensagens de quem interessa (uma chamada ao GHL por conversa).
    const daNina = (c: any) => { const i = instDe(c.lastMessageBody); return !!i && norm(i) === norm(inst); };
    // canal nativo: sem marcador de instancia, o proprio GHL diz o tipo
    const ehNativo = (c: any) => String(c.lastMessageType) === "TYPE_WHATSAPP";
    const naJanela = (c: any) => { const q = Number(c.lastMessageDate || 0); if (!q) return false; const min = (agora - q) / 60000; return min >= esperaMin && min <= ateHoras * 60; };
    const candidatas = convs.filter((c: any) => String(c.lastMessageType) !== "TYPE_EMAIL" && (daNina(c) || (nativoOn && ehNativo(c))) && naJanela(c));
    const alvos = candidatas.slice(0, limite);

    const { data: reps } = await sb.from("snap_rep").select("celular, fone_parc").limit(3000);
    const setReps = new Set<string>();
    (reps || []).forEach((x: any) => { const a = fk8(x.celular); const c = fk8(x.fone_parc); if (a) setReps.add(a); if (c) setReps.add(c); });
    // os numeros da casa (quem recebe o aviso do encerramento) — nunca sao lead
    const setInternos = new Set<string>();
    try {
      const { data: resp } = await sb.from("copiloto_responsaveis").select("fone");
      (resp || []).forEach((x: any) => { const a = fk8(x.fone); if (a) setInternos.add(a); });
    } catch (_e) { /* sem cadastro, so a trava dos reps vale */ }

    const pb = await playbook(sb); const lic = await licoes(sb);
    const opts = { dry, ativo, pedidoMin, inst, nativoOn, janelaH, pb, lic, reps: setReps, internos: setInternos, exigeCnpj, exigeEndereco, exigeFrete };
    const feitos: any[] = [];
    if (acao !== "seguir") for (const cv of alvos) { try { feitos.push(await atender(sb, cfg, cv, opts)); } catch (e) { feitos.push({ contato: cv.fullName || cv.phone, decisao: "erro", motivo: String(e).slice(0, 200) }); } }

    // segundo toque em quem nao respondeu. Roda DEPOIS do inbound: se ele acabou de responder, a
    // conversa ja foi atendida acima e o seguimento a pula.
    let seg: any = null;
    if (acao !== "inbound" && toquesMax > 0) {
      try { seg = await seguir(sb, cfg, { dry, ativo, pedidoMin, inst, janelaH, seguirMin, toquesMax, soHorario, avisoMin, erroEsperaMin, pb, lic, exigeCnpj, exigeEndereco, exigeFrete, limite: Math.max(1, Math.min(limite, 4)) }); }
      catch (e) { seg = { erro: String(e).slice(0, 200) }; }
    }

    const conta = (k: string) => feitos.filter((x) => x.decisao === k).length;
    return j({
      ok: true, instancia: inst, lead_ativo: ativo, modo: dry ? "previa" : (ativo ? "atendendo" : "so rascunho (lead_ativo=nao)"),
      inbound_sem_resposta: convs.length, da_instancia_na_janela: candidatas.length, analisadas: feitos.length,
      respondeu: conta("respondeu"), previa: conta("previa"), pulou: conta("pular"), falhou: conta("falhou"), janela_fechada: conta("janela_fechada"), erro: conta("erro"),
      resultado: feitos,
      seguimento: seg,
    });
  } catch (e) { return j({ ok: false, erro: String(e) }, 500); }
});
