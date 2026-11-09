// campanhas-enviar (v34) — email com ARTE + {{...}}. Garante contato. WhatsApp via SMS+#contact_instance. Recusa WhatsApp para telefone FIXO (10 digitos). ?diag mostra rate-limit.
// v22: TRAVA DE INSTANCIA. Antes, sem instancia ele mandava o texto SEM amarrar — a mensagem saia pela ultima instancia
//      a que aquele contato ficou preso (de outro assunto, de outro mes), e o cliente recebia algo desconexo.
//      Agora WhatsApp sem instancia e RECUSADO, e o token e conferido contra o cadastro instancia_ghl (cache de 5 min).
// v23: ESPERA A TROCA DE FATO ACONTECER. O sleep de 1500ms era chute e perdia a corrida: em 24/08 o bind foi aceito,
//      o texto saiu 4s depois e o cliente recebeu pela instancia ANTIGA. O ZaptosWPP grava "[System]: Contact Instance
//      Updated!" na conversa quando processa o comando, entao agora a gente fica lendo a conversa ate essa confirmacao
//      aparecer (com dateAdded posterior ao proprio bind) e SO ENTAO espera a margem de acomodacao e manda o texto.
//      Sem confirmacao dentro da janela, o texto NAO sai — melhor nao enviar do que enviar pelo numero errado.
//      A instancia nao existe como campo do contato no GHL (conferido: 100 custom fields, nenhum) — o app guarda no
//      banco dele, e a tela do CRM mostra cache (foi por isso que so apareceu certo depois do reload). A confirmacao
//      na conversa e o unico sinal observavel que temos.
//      Medicoes de 24/08: a confirmacao chega 2,2-2,3s depois do bind, sempre (3 amostras). E ela e
//      INCONDICIONAL — sai tambem quando o contato JA estava na instancia pedida (probe 16:57), entao
//      "sem confirmacao" significa de verdade que o comando nao foi processado, e recusar e seguro.
//      Margem em 20s: com 1,7s depois da confirmacao a mensagem saiu pela instancia antiga; com 22,6s
//      saiu certa. A fila manda 1 por instancia a cada 120s, entao a espera nao custa vazao.
// v25: CONFERE O PROPRIETARIO DO CONTATO NO CRM. O numero de saida e o do usuario remetente, e numa
//      mensagem de API o remetente e o assignedTo do contato — o #contact_instance manda na atribuicao
//      de entrada, nao na de saida. Entao antes de mandar a gente le o assignedTo: se ele e uma
//      instancia ATIVA do cadastro e nao e a instancia pedida, o texto NAO sai (sairia pelo numero da
//      outra assistente, com o [ASSISTENTE] do texto errado). Se o proprietario nao e nenhuma
//      instancia do cadastro, segue como antes — nao ha o que comparar, e recusar quebraria as
//      campanhas de cliente. Nunca mexemos no assignedTo: mudar o dono tira a visibilidade do contato
//      das outras assistentes (foi por isso que a gestao tirou aquele workflow do CRM).
// v26: CONTATO NOVO NASCE COM DONO. Os leads enriquecidos do Motor nao existem no CRM (conferido em
//      26/08: busca por telefone devolve zero), e o contato so nascia aqui, no envio, SEM proprietario.
//      Contato sem dono e o pior caso — o numero de saida fica indefinido. Agora, ao criar, o contato
//      ja e atribuido ao usuario da instancia pedida, entao a mensagem sai pelo numero certo na
//      primeira mensagem, sem precisar de passada previa de reatribuicao.
// v27: GRAVA CAMPO DO CRM ANTES DE ENVIAR. O template do GHL so sabe imprimir campo do contato, e e
//      renderizado no momento do envio — campo gravado depois sai vazio na arte. Entao `campos` vem no
//      corpo por chave semantica e e escrito no contato que esta recebendo, no mesmo ponto onde o
//      CODPARC ja era gravado. Escrever no contato do DESTINATARIO e o ponto: o percentual do voucher
//      existia no CRM so no contato da EMPRESA (tag sankhya-cliente), e a campanha manda para os
//      contatos das PESSOAS (comprador, financeiro), onde o campo vinha vazio.
// v28: A ARTE DO VOUCHER SAIA COM OS NUMEROS EM BRANCO. Quem troca as {{...}} do template somos nos
//      (a gente baixa o HTML e renderiza aqui), e o mapa do preencher() nao conhecia
//      contact.voucher_positivacao / adicional_positivacao / total_pontos / voucher_validade — as
//      quatro tags que o template "Campanha de Positivacao" usa. Tag desconhecida sai VAZIA, entao o
//      e-mail iria com "desconto total de  %" e "valido ate ". Agora id do campo e merge tag moram na
//      MESMA tabela (CAMPO), e o valor vem do mesmo `campos` que e gravado no contato.
//      Junto vem `previa: true`: devolve a arte preenchida pelo mesmo caminho do envio, sem mandar
//      nada, e lista as tags que ficaram sem valor. A tela mostra o resultado real antes do disparo.
// v29: POS-CHECAGEM DE ENTREGA. Em 26/08 oito mensagens foram marcadas "enviado" e NENHUMA chegou: a
//      instancia "Campanhas Nitron" estava desconectada. O GHL aceitou o POST (status sent) e quem
//      avisou foi o ZaptosWPP, escrevendo NA CONVERSA "[System]: <instancia> - The instance is
//      disconnected." — 2 a 8s depois do envio. Ninguem lia essa linha, entao "aceito pelo GHL" virava
//      "enviado" no banco. Nao ha outro sinal: a instancia nao aparece como campo do contato nem como
//      status no CRM (conferido), so essa mensagem de sistema.
//      Agora, depois de mandar o texto, a funcao fica lendo a conversa por ENTREGA_CHECK_MS (12s) a
//      procura dessa linha com dateAdded posterior ao envio. Se aparecer, a linha vira ERRO com o
//      motivo, em vez de "enviado" — e a fila_trava ja classifica isso como instancia_desconectada,
//      com "reconectar e reenviar" como acao.
//      Custa 12s por mensagem. A 2 por minuto isso nao aperta a vazao, e o preco de nao ter era um
//      lote inteiro marcado como entregue sem ter saido.
// v30: IMAGEM NO ZAPTOS. `imagens` (URLs publicas) vai como `attachments` no POST do TEXTO — uma
//      mensagem so, imagem com legenda, sem dobrar o consumo do teto de 2/min por instancia.
//      O anexo NAO vai no bind (`#contact_instance:<x>`), que e linha de servico.
//      SO no WhatsApp: o e-mail ja recebe as imagens como <img> montado pelo fila-processar, e
//      duplicar aqui faria a imagem aparecer duas vezes no corpo.
//      AVISO que vale para sempre: o GHL aceitar `attachments` nao significa que o ZaptosWPP
//      entregue a imagem — e a mesma armadilha do `status: sent` da v29. A pos-checagem de queda
//      continua valendo, mas ela so detecta instancia caida, nao anexo ignorado. Por isso a tela so
//      oferece imagem no Zaptos depois de um envio de teste conferido no aparelho.
// v31: A QUEDA DE INSTANCIA PASSOU A OLHAR O NOME. A linha do ZaptosWPP vem como
//      "[System]: <instancia> - The instance is disconnected." e o nome e a informacao inteira: ela
//      diz QUAL instancia caiu, que nem sempre e a que esta mandando. A v29 so procurava a frase.
//      Em 03/09 quatro conversas receberam essa linha nomeando a NINA enquanto o envio saia pela
//      Isadora, Juliete, Monica e Valeria — e a funcao condenou as quatro linhas e a fila pausou as
//      quatro instancias, todas sadias. A Nina, que era a caida de verdade, seguiu trabalhando; 174
//      mensagens ficaram presas de 03 a 15/09 e o gestor viu as assistentes mandando normalmente
//      enquanto o painel as dava por fora do ar.
//      Em 27/08, quando a queda foi real, a linha nomeava a propria instancia remetente ("Juliete"
//      mandando pela Juliete, "Campanhas Nitron" pela Campanhas Nitron) — esse e o unico caso em que
//      se pode concluir que ESTA instancia caiu, e agora e o unico que marca a linha como erro.
//      Nomeando outra, a mensagem segue valida e a funcao devolve `queda_outra` com o nome lido: a
//      instancia que caiu e a NOMEADA, e e ela que o fila-processar pausa.
// v32: MODO AVISO (`alerta: true`). O aviso de "a instancia X caiu" precisa sair mesmo quando a
//      instancia caida e justamente a DONA do contato de quem vai ser avisado — e o numero de saida
//      e o dono, entao sem isso o aviso morria exatamente no caso que mais importa (a Nina cair).
//      O gestor autorizou em 15/09: "pode usar qualquer instancia para me avisar". Avisar por outra
//      exige trocar o assignedTo, e e por isso que a regra de nunca mexer nesse campo ganha aqui uma
//      excecao — estreita de proposito: so vale para o telefone gravado em fila_config.alerta_fone,
//      conferido no momento do envio. Qualquer outro numero com `alerta: true` e ignorado e segue a
//      trava normal de divergencia de dono.
// v33: O MODO AVISO SO TROCA O DONO QUANDO PRECISA. A v32 trocava sempre que o dono era diferente
//      da instancia pedida — e isso custou caro em 15-17/09: um teste do aviso deixou o contato do
//      gestor com a Camyla, e como o aviso de lead novo sai pela NINA (copiloto_config.lead_inst),
//      a trava de dono passou a recusar todo aviso de lead por Zaptos. Ele so recebia por e-mail e
//      levou dois dias para perceber que tinha parado de chegar no celular.
//      Agora, no modo aviso: se o dono atual for uma instancia VIVA (ativa e nao pausada), a
//      mensagem sai por ELE e o contato nao e tocado. So troca quando o dono nao consegue mandar —
//      que e justamente o caso da instancia que acabou de cair. E a consulta ao estado da instancia
//      e FEITA NA HORA, sem passar pelo cache de 5 min: a fila pausa a caida e avisa em seguida, e
//      com cache quente a caida ainda pareceria viva e o aviso sairia pelo numero que morreu.
// v34: TRES COISAS, e a primeira e uma CORRECAO DE REGRESSAO (09/11).
//   (a) O PUBLICADO ESTAVA NA v30 DE OUTRA LINHA. Em 26/10 outra sessao partiu da v29 e acrescentou
//       anexo de e-mail, publicando por cima — entao v31 (queda que le o NOME da instancia), v32/v33
//       (modo aviso) e a imagem no Zaptos sumiram da producao, embora estivessem no repositorio e no
//       CLAUDE.md. Consequencia pratica: a deteccao de queda voltou a condenar a instancia errada (o
//       bug que prendeu 174 mensagens por 12 dias em 03/09) e `imagens` no Zaptos nao fazia nada.
//       Esta versao e a MESCLA: v33 do repositorio + o `anexos` de e-mail de 26/10, que e util e foi
//       pedido pelo gestor. Nenhuma das duas linhas foi descartada.
//   (b) ANEXO NO E-MAIL (de 26/10, preservado): `anexos` = lista de URLs publicas, opcional.
//   (c) #switch:<instancia> — COMANDO DE TROCA DE INSTANCIA DE SAIDA (`forcar_switch: true`).
//       O gestor informou em 09/11 que o ZaptosWPP aceita `#switch:<instancia>`, que troca a instancia
//       das PROXIMAS mensagens daquela conversa. Isso e diferente do `#contact_instance:<x>`, que
//       governa a ENTRADA. Se funcionar, resolve o problema do Conecta: o convite ao cliente precisa
//       sair pela Nina, mas o numero de saida e o `assignedTo` do contato e a fila manda campanha de
//       cliente com `usar_dono`, trocando para a dona de fato.
//       `forcar_switch: true` faz duas coisas, e as duas sao necessarias juntas:
//         1. a instancia PEDIDA prevalece — nao cai para a dona do contato nem recusa por divergencia;
//         2. manda `#switch:<instancia>` como linha de servico ANTES do conteudo.
//       O `#switch` vai logo depois do bind, de proposito: assim a espera do ack e a margem de 20s que
//       ja existem (e que em 24/08 provaram ser necessarias — com 1,7s a mensagem saiu pela instancia
//       antiga) valem para os dois comandos, sem somar outra espera.
//       NAO mexe em `assignedTo`. O gestor descreveu o comando mandando o codigo antes da imagem e de
//       novo antes do texto; aqui imagem e texto sao UMA mensagem so (attachments no POST do texto,
//       v30 do repositorio), entao um `#switch` basta. `switch_duplo: true` repete antes do conteudo
//       para quem quiser o comportamento literal.
//       ATENCAO: nao ha como confirmar o `#switch` lendo a conversa — nao se conhece linha de ack
//       para ele. Entao, ao contrario do bind, ele NAO tem trava: se o app ignorar o comando, a
//       mensagem sai pela instancia de antes e so o aparelho de quem recebe mostra isso. Por isso
//       `forcar_switch` e opt-in e exige teste em aparelho antes de lote.
//       TESTADO E DESCARTADO EM 09/11 — leia antes de tentar de novo. O comando NAO troca a
//       instancia de saida neste caminho de envio. Dois testes: com 41s e com 100s entre o
//       `#switch:Camyla` e o texto, a mensagem saiu pela DONA do contato nas duas vezes. No segundo,
//       o comando foi mandado sozinho e so uma mensagem veio depois; o gestor respondeu no mesmo
//       balao e o inbound entrou com "Instance Source: Nina", ou seja, ele digitou na thread da Nina,
//       que e onde a mensagem caiu. Houve um falso positivo no meio: um inbound com
//       "Instance Source: Camyla" que era resposta a OUTRA conversa, nao ao teste.
//       Coerente com o resto deste arquivo: o numero de saida e o `assignedTo`, o `fromNumber` nao
//       funciona e o `#contact_instance` governa so a entrada. `forcar_switch` fica aqui opt-in e
//       desligado, documentando o que foi testado. NAO USE.
//       O texto abaixo era a leitura ERRADA, mantida para ninguem refazer o mesmo caminho:
//       PROVADO EM 09/11, e o numero importa: o comando funciona, mas precisa de MUITO mais tempo
//       que o bind. Com 41s entre o `#switch:Camyla` e o texto, o texto ainda saiu pela Nina (a dona)
//       e quem pegou a troca foi a mensagem de servico SEGUINTE. Com 80s e uma unica mensagem depois,
//       a mensagem saiu pela Camyla — provado pela resposta do gestor, que entrou no CRM com
//       "Instance Source: Camyla". Por isso a margem do #switch e PROPRIA (SWITCH_MARGEM_MS, 80s) e
//       nao a do bind (20s): reaproveitar os 20s era justamente o que fazia o comando pegar a
//       mensagem errada.
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const j = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const API = "https://services.leadconnectorhq.com";
const LOC = "rZ8y7lzqV7fzxsartaX2";
const RENATO = "bnKA8BWCRaTeiBC2rjRs";
const FID_CODPARC = "HaDWHgnJSjDDdPF7XFDH";
// De-para das chaves semanticas para o campo personalizado do GHL. Uma tabela so, com o id (para
// gravar no contato) E a merge tag (para preencher na arte). Eram duas listas separadas e isso e
// pedir para divergirem: bastava o template usar {{contact.voucher_validade}} e o preencher() nao
// conhecer a tag para o e-mail sair com o percentual em branco — que era exatamente o caso.
// Os tres primeiros ja existiam (da positivacao) e sao alimentados tambem por outro processo, no
// contato da empresa; aqui a gente preenche no contato que recebe. O de validade foi criado em 26/08.
const CAMPO: Record<string, { fid: string; tag: string }> = {
  voucher_pct: { fid: "II773kLNc7R4Pw278zcf", tag: "contact.voucher_positivacao" },   // PERC_VOUCHER
  voucher_adic: { fid: "h6yFBPOnoe4af0BDWNIB", tag: "contact.adicional_positivacao" }, // PERC_ADIC
  voucher_total: { fid: "8YX7LVJcbwiqD8dHwUSe", tag: "contact.total_pontos" },         // a soma
  voucher_validade: { fid: "sQsGU460EXuId97hpKEi", tag: "contact.voucher_validade" },  // "31/08/2026"
};
const FID_CAMPO: Record<string, string> = Object.fromEntries(Object.entries(CAMPO).map(([k, v]) => [k, v.fid]));
// Grava no contato os campos pedidos. Devolve o que foi gravado, ou null quando nao havia nada.
async function gravarCampos(contactId: string, campos: any): Promise<string[] | null> {
  if (!campos || typeof campos !== "object") return null;
  const cf = Object.keys(campos)
    .filter((k) => FID_CAMPO[k] && campos[k] !== null && campos[k] !== undefined && String(campos[k]) !== "")
    .map((k) => ({ id: FID_CAMPO[k], value: String(campos[k]) }));
  if (!cf.length) return null;
  try {
    const r = await ghl("PUT", `/contacts/${contactId}`, { customFields: cf });
    if (!r.ok) return null;
    return cf.map((x) => x.id);
  } catch { return null; }
}
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/146.0 Safari/537.36";
const srvKey = () => Deno.env.get("SRV_JWT") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const numEnv = (nome: string, padrao: number) => { const v = Number(Deno.env.get(nome)); return Number.isFinite(v) && v > 0 ? v : padrao; };
// janela para a confirmacao aparecer, intervalo de leitura e margem depois de confirmada
const BIND_ESPERA_MS = numEnv("BIND_ESPERA_MS", 25000);
const BIND_POLL_MS = numEnv("BIND_POLL_MS", 1500);
const BIND_MARGEM_MS = numEnv("BIND_MARGEM_MS", 20000);
// janela de pos-checagem: quanto tempo esperar a queda da instancia aparecer na conversa
const ENTREGA_CHECK_MS = numEnv("ENTREGA_CHECK_MS", 12000);
// margem do #switch: medida em 09/11. 41s NAO bastou (o texto saiu pela dona e a troca pegou a
// mensagem seguinte); 80s bastou. Nao e a mesma margem do bind — sao comandos diferentes e o do
// bind tem ack para esperar, este nao tem.
const SWITCH_MARGEM_MS = numEnv("SWITCH_MARGEM_MS", 80000);
function ghl(method: string, path: string, body: any, version = "2021-07-28") {
  return fetch(API + path, { method, headers: { "Authorization": "Bearer " + Deno.env.get("GHL_TOKEN"), "Version": version, "Content-Type": "application/json", "Accept": "application/json", "User-Agent": UA }, body: body ? JSON.stringify(body) : undefined });
}
// ---- cadastro de instancias (cache de 5 min por isolate) ----
type Cadastro = { set: Set<string>; porUsuario: Record<string, string>; idDe: Record<string, string> };
let instCache: { at: number; c: Cadastro } | null = null;
async function cadastro(): Promise<Cadastro | null> {
  if (instCache && Date.now() - instCache.at < 300000) return instCache.c;
  try {
    const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, ""); const k = srvKey();
    if (!base || !k) return null;
    const r = await fetch(`${base}/rest/v1/instancia_ghl?ativa=eq.true&select=instancia,usuario_ghl_id`, { headers: { apikey: k, Authorization: "Bearer " + k } });
    if (!r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) return null;
    const set = new Set<string>(rows.map((x: any) => String(x.instancia)));
    const porUsuario: Record<string, string> = {}; const idDe: Record<string, string> = {};
    rows.forEach((x: any) => { if (x.usuario_ghl_id) { porUsuario[String(x.usuario_ghl_id)] = String(x.instancia); idDe[String(x.instancia)] = String(x.usuario_ghl_id); } });
    const c = { set, porUsuario, idDe };
    instCache = { at: Date.now(), c };
    return c;
  } catch { return null; }
}
async function instanciasValidas(): Promise<Set<string> | null> { const c = await cadastro(); return c ? c.set : null; }
// Quem o CRM diz que e o dono do contato — e portanto por qual numero o WhatsApp vai sair.
// null = nao deu para saber; "" = tem dono, mas ele nao e instancia nenhuma do cadastro ativo.
async function donoDoContato(contactId: string): Promise<string | null> {
  const c = await cadastro(); if (!c) return null;
  try {
    const r = await ghl("GET", `/contacts/${contactId}`, null);
    if (!r.ok) return null;
    const d = await r.json().catch(() => ({}));
    const uid = String(d?.contact?.assignedTo || d?.assignedTo || "");
    if (!uid) return "";
    return c.porUsuario[uid] || "";
  } catch { return null; }
}
// Numero autorizado a ter o dono trocado (o do aviso de queda). Le do banco no momento do envio:
// se a coluna mudar ou esvaziar, a excecao acompanha sem deploy.
async function foneDeAlerta(): Promise<string> {
  try {
    const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, ""); const k = srvKey();
    if (!base || !k) return "";
    const r = await fetch(`${base}/rest/v1/fila_config?id=eq.1&select=alerta_fone`, { headers: { apikey: k, Authorization: "Bearer " + k } });
    if (!r.ok) return "";
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? String(rows[0].alerta_fone || "") : "";
  } catch { return ""; }
}
// Estado da instancia AGORA, sem cache. O cadastro() guarda 5 min, e no aviso de queda esses 5 min
// sao exatamente a janela em que a instancia caida ainda parece viva.
async function instanciaViva(nome: string): Promise<boolean> {
  try {
    const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, ""); const k = srvKey();
    if (!base || !k || !nome) return false;
    const r = await fetch(`${base}/rest/v1/instancia_ghl?instancia=eq.${encodeURIComponent(nome)}&select=ativa,pausada_em`, { headers: { apikey: k, Authorization: "Bearer " + k } });
    if (!r.ok) return false;
    const rows = await r.json();
    const x = Array.isArray(rows) && rows[0] ? rows[0] : null;
    return !!x && x.ativa === true && !x.pausada_em;
  } catch { return false; }
}
// compara telefone por digito, sem o 55: "11970399053" e "+5511970399053" sao o mesmo numero
const soDigitos = (v: string) => String(v || "").replace(/\D/g, "").replace(/^55/, "");
const formaOk = (s: string) => /^[\p{L}\p{N} ._-]{2,40}$/u.test(s);
function foneVariants(fone: string): string[] {
  const d = String(fone || "").replace(/\D/g, ""); const out = new Set<string>();
  if (fone) out.add(String(fone).trim());
  if (d) { out.add(d); if (d.length <= 11) { out.add("55" + d); out.add("+55" + d); } out.add("+" + d); }
  return [...out].filter((x) => x && x.length >= 3);
}
function e164(fone: string): string { const d = String(fone || "").replace(/\D/g, ""); if (!d) return ""; if (d.length <= 11) return "+55" + d; return "+" + d; }
function foneFixo(fone: string): boolean { let d = String(fone || "").replace(/\D/g, "").replace(/^0+/, ""); if (d.slice(0, 2) === "55") d = d.slice(2); d = d.replace(/^0+/, ""); return d.length === 10; }
function preencher(str: string, nome?: string, texto?: string, merge?: any, campos?: any): string {
  if (!str) return str;
  const full = String(nome || "").trim(); const first = full.split(/\s+/)[0] || ""; const last = full.split(/\s+/).slice(1).join(" ");
  const msg = String(texto || "").replace(/\n/g, "<br>"); const m = merge || {};
  const map: Record<string, string> = {
    "contact.first_name": first, "first_name": first, "nome": first, "primeiro_nome": first,
    "contact.name": full || first, "contact.full_name": full || first, "nome_completo": full || first,
    "contact.last_name": last, "sobrenome": last,
    "document.recipient.firstname": first, "document.recipient.lastname": last,
    "location.name": "Nitron", "nitron": "Nitron", "empresa_nitron": "Nitron", "user.name": "Nitron",
    "mensagem": msg, "corpo": msg, "texto": msg,
    "cliente": String(m.cliente || m.empresa || full || ""), "empresa": String(m.empresa || m.cliente || full || ""),
    "saldo": String(m.saldo || ""), "validade": String(m.validade || ""), "valor": String(m.valor || m.saldo || ""), "dias": String(m.dias || ""), "lista": String(m.lista || ""),
    "rep": String(m.rep || ""), "representante": String(m.rep || ""), "assistente": String(m.instancia || m.assistente || ""),
  };
  // As tags dos campos personalizados. Quem renderiza a arte aqui somos nos, nao o GHL: a gente baixa
  // o HTML do template e troca as {{...}} — entao tag que o mapa nao conhece sai VAZIA. Sem estas
  // quatro linhas o e-mail do voucher saia com percentual e validade em branco, mesmo com o campo
  // gravado no contato. O valor vem de `campos` (o mesmo que foi escrito no CRM), com o merge como
  // reserva, para prévia, e-mail e campo do contato dizerem sempre a mesma coisa.
  const cp = campos && typeof campos === "object" ? campos : {};
  const reserva: Record<string, unknown> = { voucher_total: m.saldo, voucher_validade: m.validade };
  // o template imprime o "%" ele mesmo ({{contact.total_pontos}} %), entao o valor vai sem sinal —
  // senao sai "6% %". Na validade nao se mexe: e texto ("31/08/2026").
  const so = (v: string, chave: string) => chave === "voucher_validade" ? v : v.replace(/\s*%\s*$/, "").trim();
  for (const [chave, def] of Object.entries(CAMPO)) {
    const v = cp[chave] !== undefined && cp[chave] !== null && String(cp[chave]) !== "" ? cp[chave] : reserva[chave];
    const txt = v === undefined || v === null ? "" : so(String(v), chave);
    map[def.tag.toLowerCase()] = txt;
    map[def.tag.replace(/^contact\./, "").toLowerCase()] = txt;   // aceita a tag sem o prefixo
  }
  return str.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_full, key) => { const k = String(key).trim().toLowerCase(); return (k in map) ? map[k] : ""; });
}
async function buscarUm(q: string): Promise<any> {
  try { const r = await ghl("GET", `/contacts/?locationId=${LOC}&query=${encodeURIComponent(q)}&limit=1`, null); const d = await r.json(); return (d?.contacts || [])[0] || null; } catch { return null; }
}
async function upsertContato(fields: any): Promise<string | null> {
  try { const r = await ghl("POST", "/contacts/upsert", { locationId: LOC, ...fields }); const d = await r.json().catch(() => ({})); return d?.contact?.id || null; } catch { return null; }
}
async function garantirPorFone(fone: string, nome?: string, codparc?: any, dono?: string) {
  for (const v of foneVariants(fone)) { const c = await buscarUm(v); if (c?.id) return { id: c.id, via: "fone:" + v, criado: false }; }
  const fields: any = { phone: e164(fone), firstName: nome || ("Contato " + e164(fone)) };
  if (codparc) fields.customFields = [{ id: FID_CODPARC, value: String(codparc) }];
  if (dono) fields.assignedTo = dono;   // nasce com dono: sem isso o numero de saida fica indefinido
  return { id: await upsertContato(fields), via: "criado", criado: true };
}
async function garantirPorEmail(email: string, nome?: string, codparc?: any, dono?: string) {
  const c = await buscarUm(email.trim()); if (c?.id) return { id: c.id, via: "email", criado: false };
  const fields: any = { email: email.trim(), firstName: nome || email.trim() };
  if (codparc) fields.customFields = [{ id: FID_CODPARC, value: String(codparc) }];
  if (dono) fields.assignedTo = dono;
  return { id: await upsertContato(fields), via: "criado", criado: true };
}
async function arteHtml(templateId: string): Promise<string | null> {
  try {
    const r = await ghl("GET", `/emails/builder?locationId=${LOC}&limit=100`, null);
    const d = await r.json(); const lista = d?.builders || d?.data?.builders || [];
    const tpl = lista.find((t: any) => t.id === templateId); if (!tpl?.previewUrl) return null;
    const h = await fetch(tpl.previewUrl, { headers: { "User-Agent": UA } }); if (!h.ok) return null;
    const html = await h.text(); return html && html.length > 50 ? html : null;
  } catch { return null; }
}
async function sms(contactId: string, message: string, toNumber?: string, anexos?: string[]) {
  const payload: any = { type: "SMS", contactId, message }; if (toNumber) payload.toNumber = toNumber;
  // `attachments` = array de URLs publicas (documentado pelo GHL). So entra quando ha anexo: mandar
  // array vazio muda o payload sem motivo, e payload que muda sem motivo e como bug nasce.
  if (anexos && anexos.length) payload.attachments = anexos;
  const r = await ghl("POST", "/conversations/messages", payload, "2021-04-15");
  return { status: r.status, body: (await r.text()).slice(0, 400) };
}
// ---- confirmacao da troca de instancia ----
const ehAck = (m: any) => /contact\s+instance\s+updated/i.test(String(m?.body || ""));
// ---- aviso de queda da instancia, escrito pelo ZaptosWPP na propria conversa ----
// Le o NOME que a linha traz. A alternativa em portugues saiu junto: "instancia desconectada" e
// texto NOSSO (o motivo que gravamos em fila_envio.resultado), nunca do app — casar com ele so
// criava chance de falso positivo, e sem nome nao da para saber de quem se fala.
const RE_QUEDA = /(?:\[\s*system\s*\]\s*:?\s*)?([^\[\]\n:]{1,60}?)\s*[-\u2013]\s*the\s+instance\s+is\s+disconnected/i;
const nomeQueda = (m: any): string | null => { const g = RE_QUEDA.exec(String(m?.body || "")); const n = g ? String(g[1] || "").trim() : ""; return n || null; };
// compara sem acento e sem caixa: o cadastro tem "Monica" com circunflexo e a linha pode vir sem
const chaveInst = (s: string) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
async function lerConversa(cid: string): Promise<{ http: number; msgs: any[] }> {
  const r = await ghl("GET", `/conversations/${cid}/messages?limit=20`, null, "2021-04-15");
  if (!r.ok) return { http: r.status, msgs: [] };
  const d = await r.json().catch(() => ({}));
  const arr = d?.messages?.messages || d?.messages || [];
  return { http: 200, msgs: Array.isArray(arr) ? arr : [] };
}
// Espera o ZaptosWPP gravar a confirmacao na conversa, com dateAdded >= o dateAdded do proprio bind.
// Os dois horarios vem do GHL, entao nao ha risco de desencontro de relogio com o isolate.
async function esperarTroca(cid: string, bindId: string, janelaMs: number) {
  const t0 = Date.now(); let bindAt = 0; let http = 200;
  while (Date.now() - t0 < janelaMs) {
    const lida = await lerConversa(cid);
    http = lida.http;
    if (http !== 200) return { confirmado: null as boolean | null, ms: Date.now() - t0, http, motivo: "nao consegui ler a conversa (HTTP " + http + ")" };
    if (!bindAt) { const bm = lida.msgs.find((m: any) => m?.id === bindId); if (bm?.dateAdded) bindAt = new Date(bm.dateAdded).getTime(); }
    if (bindAt) {
      const ack = lida.msgs.find((m: any) => ehAck(m) && m?.dateAdded && new Date(m.dateAdded).getTime() >= bindAt);
      if (ack) return { confirmado: true, ms: Date.now() - t0, http, ack_em: ack.dateAdded, ack_id: ack.id };
    }
    await sleep(BIND_POLL_MS);
  }
  return { confirmado: false, ms: Date.now() - t0, http, motivo: "o app nao confirmou a troca em " + Math.round(janelaMs / 1000) + "s" };
}
// Espera a linha de queda aparecer. Nao ha como perguntar ao app se a instancia esta de pe: o unico
// sinal observavel e essa mensagem de sistema na conversa, depois da tentativa — e vale so para a
// instancia que ela NOMEIA. `caiu` significa "a instancia que acabou de mandar caiu"; a linha que
// nomeia outra vem em `outra`, porque e noticia sobre aquela, nao sobre esta mensagem.
async function esperarQueda(cid: string, desdeMs: number, janelaMs: number, instancia?: string) {
  const eu = chaveInst(instancia || "");
  const t0 = Date.now();
  let outra: any = null;
  while (Date.now() - t0 < janelaMs) {
    await sleep(BIND_POLL_MS);
    const lida = await lerConversa(cid);
    if (lida.http !== 200) continue;
    for (const m of lida.msgs) {
      if (!m?.dateAdded || new Date(m.dateAdded).getTime() < desdeMs) continue;
      const nome = nomeQueda(m); if (!nome) continue;
      const reg = { em: m.dateAdded, nome, texto: String(m.body || "").replace(/\s+/g, " ").slice(0, 160) };
      if (eu && chaveInst(nome) === eu) return { caiu: true, ...reg };
      outra = reg;
    }
  }
  return { caiu: false, outra: outra || undefined };
}
async function enviarMsg(contactId: string, canal: string, texto: string, assunto?: string, templateId?: string, instancia?: string, fone?: string, nome?: string, merge?: any, opts?: any) {
  // so URL http(s): o GHL busca o arquivo de fora, entao caminho relativo ou data: URI nao chegaria
  const anexos: string[] = (Array.isArray(opts?.imagens) ? opts.imagens : [])
    .map((u: any) => String(u || "").trim()).filter((u: string) => /^https?:\/\//i.test(u));
  if (canal === "email") {
    let html: string | null = null; let arte_ok = false;
    if (templateId) { const raw = await arteHtml(templateId); if (raw) { html = preencher(raw, nome, texto, merge, opts?.campos); arte_ok = true; } }
    if (!html) html = "<div>" + String(texto).replace(/\n/g, "<br>") + "</div>";
    const subj = preencher(assunto || "Nitron", nome, texto, merge, opts?.campos);
    // ANEXO (26/10, preservado da outra linha de desenvolvimento): o GHL aceita `attachments` como
    // lista de URLs publicas no envio de e-mail. Entrou para o pedido do lojista sair com a planilha
    // junto (ordem do gestor). Campanha que nao manda `anexos` monta o mesmo corpo de sempre.
    const anexosMail = Array.isArray(opts?.anexos)
      ? opts.anexos.map((x: any) => String(x || "").trim()).filter((x: string) => /^https?:\/\//i.test(x)).slice(0, 10)
      : [];
    const corpo: any = { type: "Email", contactId, subject: subj, html };
    if (anexosMail.length) corpo.attachments = anexosMail;
    const r = await ghl("POST", "/conversations/messages", corpo, "2021-04-15");
    return { status: r.status, body: (await r.text()).slice(0, 400), bind: null as any, arte_ok, anexos: anexosMail.length || undefined };
  }
  const to = fone ? e164(fone) : undefined;
  const janela = Number(opts?.espera_ms) > 0 ? Number(opts.espera_ms) : BIND_ESPERA_MS;
  const margem = opts?.margem_ms !== undefined && Number(opts?.margem_ms) >= 0 ? Number(opts.margem_ms) : BIND_MARGEM_MS;
  const exigir = opts?.exigir_confirmacao === false ? false : true;
  // 1) amarra o contato na instancia certa
  const bind = await sms(contactId, `#contact_instance:${instancia}`, to);
  if (!(bind.status >= 200 && bind.status < 300)) return { status: 0, body: "", bind, troca: { confirmado: false, motivo: "o GHL recusou o proprio bind" }, recusado: "bind nao aceito — texto nao enviado" };
  let cid = ""; let bindId = "";
  try { const d = JSON.parse(bind.body); cid = String(d?.conversationId || ""); bindId = String(d?.messageId || ""); } catch { /* corpo inesperado */ }
  // 1b) #switch — troca a instancia de SAIDA das proximas mensagens desta conversa.
  //     A margem e PROPRIA e somada (SWITCH_MARGEM_MS): o teste de 09/11 mostrou que reaproveitar os
  //     20s do bind faz o comando pegar a mensagem de servico seguinte em vez do texto.
  let sw: any = null;
  if (opts?.switch_inst === true && instancia) {
    const r0 = await sms(contactId, `#switch:${instancia}`, to);
    const esperaSw = Number(opts?.switch_margem_ms) >= 0 ? Number(opts.switch_margem_ms) : SWITCH_MARGEM_MS;
    sw = { status: r0.status, aceito: r0.status >= 200 && r0.status < 300, margem_ms: esperaSw };
    if (sw.aceito) await sleep(esperaSw);
  }
  // 2) espera o app confirmar a troca na conversa
  let troca: any;
  if (cid && bindId) troca = await esperarTroca(cid, bindId, janela);
  else troca = { confirmado: null, motivo: "o bind nao devolveu conversationId/messageId" };
  if (troca.confirmado === false && exigir) return { status: 0, body: "", bind, troca, recusado: "troca de instancia nao confirmada — texto nao enviado para nao sair pela instancia antiga" };
  // 3) margem de acomodacao: a confirmacao diz que o app processou, nao que a sessao de envio ja pegou a troca
  const esperaTotal = troca.confirmado === true ? margem : Math.max(margem, janela - (troca.ms || 0));
  await sleep(esperaTotal);
  // repeticao literal do comando, para quem quiser o comportamento que o gestor descreveu
  if (opts?.switch_duplo === true && opts?.switch_inst === true && instancia) {
    await sms(contactId, `#switch:${instancia}`, to);
    // mesma margem do bind: em 24/08 ficou provado que 1,7s nao basta para a sessao de envio pegar a
    // troca (a mensagem saiu pela instancia antiga) e 22,6s bastou. Margem curta aqui seria pior que
    // nada — o comando poderia ser processado DEPOIS da mensagem.
    await sleep(margem);
  }
  const enviadoAs = Date.now();
  // o anexo vai SO aqui, no texto — nunca no bind nem no #switch, que sao linhas de servico
  const res = await sms(contactId, texto, to, anexos);
  // 4) o GHL aceitar nao e o cliente receber. Se o ZaptosWPP disser na conversa que a instancia caiu,
  //    esta linha e ERRO — melhor uma linha para reenviar do que um lote marcado como entregue.
  //    A margem de 3s para tras cobre desencontro de relogio entre o isolate e o GHL.
  if (res.status >= 200 && res.status < 300 && cid && opts?.checar_entrega !== false) {
    const q = await esperarQueda(cid, enviadoAs - 3000, Number(opts?.checar_ms) > 0 ? Number(opts.checar_ms) : ENTREGA_CHECK_MS, instancia);
    if (q.caiu) {
      return { ...res, status: 0, bind, troca: { ...troca, margem_ms: esperaTotal },
        recusado: "instancia desconectada — o GHL aceitou mas o ZaptosWPP nao entregou: " + q.texto,
        instancia_caiu: true, queda: q };
    }
    // A linha nomeou OUTRA instancia: esta mensagem continua valida — condenar por ela foi o erro de
    // 03/09. Mas a nomeada caiu de verdade, e quem cuida da fila precisa saber: e assim que a queda
    // da Nina (escopo lead, fora das campanhas de rep) aparece para nos.
    if (q.outra) return { ...res, bind, troca: { ...troca, margem_ms: esperaTotal }, queda_outra: q.outra };
  }
  return { ...res, bind, troca: { ...troca, margem_ms: esperaTotal }, switch: sw || undefined };
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const b = await req.json().catch(() => ({}));
    if (b.diag) {
      const r = await ghl("GET", `/contacts/?locationId=${LOC}&query=milton&limit=1`, null);
      const hdr: Record<string, string> = {};
      for (const kk of ["x-ratelimit-limit-daily", "x-ratelimit-daily-remaining", "x-ratelimit-interval-milliseconds", "x-ratelimit-max", "x-ratelimit-remaining", "retry-after"]) { const v = r.headers.get(kk); if (v != null) hdr[kk] = v; }
      const body = (await r.text()).slice(0, 200);
      const set = await instanciasValidas();
      return j({ diag: true, status: r.status, headers: hdr, body, instancias_cadastradas: set ? [...set] : null, bind: { espera_ms: BIND_ESPERA_MS, poll_ms: BIND_POLL_MS, margem_ms: BIND_MARGEM_MS }, entrega_check_ms: ENTREGA_CHECK_MS });
    }
    const canal = b.canal || "whatsapp";
    const texto = b.texto || "";
    const instancia = String(b.instancia || "").trim();

    // ---- PREVIA: devolve a arte JA preenchida, sem tocar em contato nem mandar nada ----
    // Passa pelo mesmo arteHtml() + preencher() do envio de verdade, de proposito: previa que usa
    // outro caminho mente. Se a tag do template nao estiver no de-para, ela sai vazia aqui tambem —
    // e e isso que a tela precisa mostrar, para a pessoa ver o buraco ANTES de disparar.
    if (b.previa === true) {
      const raw = b.templateId ? await arteHtml(b.templateId) : null;
      if (b.templateId && !raw) return j({ ok: false, previa: true, motivo: "nao consegui baixar o HTML desta arte no GHL", template_id: b.templateId });
      const base = raw || ("<div style=\"font:15px/1.5 system-ui,sans-serif;padding:18px\">" + String(texto).replace(/\n/g, "<br>") + "</div>");
      const html = preencher(base, b.nome, texto, b.merge, b.campos);
      // que tags o template pede e quais delas ficaram sem valor — o aviso mais util da tela
      const tags = [...new Set([...String(base).matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)].map((x) => String(x[1])))];
      const vazias = tags.filter((t) => !String(preencher("{{" + t + "}}", b.nome, texto, b.merge, b.campos)).trim());
      return j({ ok: true, previa: true, arte: !!raw, template_id: b.templateId || null, assunto: preencher(b.assunto || "", b.nome, texto, b.merge, b.campos), html, tags, tags_vazias: vazias });
    }

    // ---- TRAVA DE INSTANCIA (so WhatsApp; email nao usa instancia) ----
    if (canal !== "email") {
      if (!instancia) return j({ ok: false, motivo: "sem instancia — WhatsApp nao enviado (a mensagem sairia pela instancia errada)", sem_instancia: true });
      if (!formaOk(instancia)) return j({ ok: false, motivo: "instancia com formato invalido: " + instancia, instancia_invalida: true });
      const validas = await instanciasValidas();
      if (validas && !validas.has(instancia)) return j({ ok: false, motivo: "instancia '" + instancia + "' nao esta no cadastro instancia_ghl (ativa)", instancia_invalida: true });
    }

    // dono para o caso de o contato ainda nao existir: o usuario da instancia pedida
    const cad = await cadastro();
    const donoNovo = (instancia && cad?.idDe[instancia]) || undefined;

    let contactId: string | null = null; let via: string | undefined; let criado = false;
    if (b.test) { contactId = RENATO; via = "teste"; }
    else if (b.contact_id) { contactId = b.contact_id; via = "id"; }
    else if (canal === "email") { if (!b.email) return j({ ok: false, motivo: "sem email" }); const a = await garantirPorEmail(b.email, b.nome, b.codparc, donoNovo); contactId = a.id; via = a.via; criado = a.criado; }
    else { if (!b.fone) return j({ ok: false, motivo: "sem telefone" }); if (foneFixo(b.fone)) return j({ ok: false, motivo: "telefone fixo (sem WhatsApp)", fixo: true, fone: b.fone }); const a = await garantirPorFone(b.fone, b.nome, b.codparc, donoNovo); contactId = a.id; via = a.via; criado = a.criado; }
    // ---- TRAVA DO PROPRIETARIO (so WhatsApp): o numero de saida e o do dono do contato ----
    // Vem antes do lookup de proposito: com lookup=true a tela consegue perguntar "por quem isso
    // sairia?" sem mandar nada.
    // usar_dono=true: em vez de recusar, manda PELA dona do contato (e o [ASSISTENTE] do texto passa
    // a ser ela tambem, senao a mensagem sai coerente no numero e incoerente no texto). E o que a
    // fila usa nas campanhas de cliente. Nas de representante a divergencia e recusada de proposito:
    // ali ela significa que o CRM esta desalinhado do organograma e a gestao precisa ver.
    let dono: string | null = null;
    let instUsada = instancia;
    if (contactId && canal !== "email" && b.ignorar_dono !== true) dono = await donoDoContato(contactId);
    if (b.lookup) return j({ ok: !!contactId, contactId, via, criado, instancia: instancia || null, dono_crm: dono, dono_divergente: !!(dono && dono !== instancia) });
    if (!texto && !b.templateId && b.so_campos !== true) return j({ ok: false, motivo: "sem texto nem arte" }, 400);
    if (!contactId) return j({ ok: false, motivo: "nao foi possivel achar/criar contato no CRM", email: b.email, fone: b.fone });
    // MODO AVISO (cabecalhos v32 e v33): so o telefone de fila_config.alerta_fone entra aqui, e a
    // troca de dono e o ultimo recurso — primeiro tenta mandar pelo proprio dono, se ele estiver de
    // pe. Se a troca falhar, nao inventa: cai na trava normal e a linha diz de quem e o contato.
    let donoForcado = false; let alertaPeloDono = false;
    if (b.alerta === true && canal !== "email" && dono !== instancia && instancia) {
      const alvo = soDigitos(await foneDeAlerta());
      if (alvo && alvo === soDigitos(b.fone || "")) {
        // O dono atual ainda consegue mandar? Entao manda por ele e NAO mexe no contato. Trocar
        // aqui por habito foi o erro da v32: deixou o contato do gestor com outra instancia e
        // derrubou, sem barulho, os avisos de lead que saem pela dona de origem.
        if (dono && await instanciaViva(dono)) alertaPeloDono = true;
        else {
          const uid = cad?.idDe[instancia];
          if (uid) {
            const rr = await ghl("PUT", `/contacts/${contactId}`, { assignedTo: uid });
            if (rr.ok) { dono = instancia; donoForcado = true; }
          }
        }
      }
    }
    // forcar_switch: a instancia PEDIDA prevalece. Sem isto o `usar_dono` da fila trocaria para a
    // dona do contato e o #switch perderia o sentido — seria um comando pedindo a instancia que ja
    // ia ser usada. Nao toca no assignedTo: o dono continua o mesmo, so a saida e desviada.
    const forcarSwitch = b.forcar_switch === true && canal !== "email";
    if (dono && dono !== instancia && !forcarSwitch) {
      if (b.usar_dono === true || alertaPeloDono) instUsada = dono;
      else return j({
        ok: false, contactId, via, criado, canal, instancia, dono_crm: dono, dono_divergente: true,
        motivo: "o contato e da " + dono + " no CRM, entao o WhatsApp sairia pelo numero dela e nao pelo da " + instancia + " — texto nao enviado. Ajuste o proprietario no CRM ou mande pela " + dono + ".",
      });
    }

    // campos do CRM antes do envio, para o template ter o que imprimir
    const camposGravados = await gravarCampos(contactId, b.campos);
    // so_campos: grava e para. Serve para conferir o de-para dos campos sem mandar mensagem nenhuma.
    if (b.so_campos === true) return j({ ok: !!camposGravados, contactId, via, criado, campos_gravados: camposGravados, motivo: camposGravados ? undefined : "nenhum campo reconhecido em `campos`" });

    // no WhatsApp o texto chega da tela ja com o [ASSISTENTE] trocado, entao se o envio passou para a
    // dona do contato o nome escrito no texto tambem precisa mudar — senao a mensagem sai do numero
    // de uma e assinada por outra.
    let textoUsado = texto; let textoAjustado = false;
    if (instUsada !== instancia && instancia && typeof texto === "string" && texto) {
      const re = new RegExp("(?<![\\p{L}\\p{N}])" + instancia.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![\\p{L}\\p{N}])", "giu");
      if (re.test(texto)) { textoUsado = texto.replace(re, instUsada); textoAjustado = true; }
    }
    const mergeUsado = (instUsada !== instancia && b.merge && typeof b.merge === "object") ? { ...b.merge, instancia: instUsada, assistente: instUsada } : b.merge;
    const res: any = await enviarMsg(contactId, canal, textoUsado, b.assunto, b.templateId, instUsada || undefined, b.fone, b.nome, mergeUsado, { espera_ms: b.espera_ms, margem_ms: b.margem_ms, exigir_confirmacao: b.exigir_confirmacao, campos: b.campos, checar_entrega: b.checar_entrega, checar_ms: b.checar_ms, imagens: b.imagens, anexos: b.anexos, switch_inst: forcarSwitch, switch_duplo: b.switch_duplo === true, switch_margem_ms: b.switch_margem_ms });
    const ok = res.status >= 200 && res.status < 300;
    return j({ ok, contactId, via, criado, canal, instancia: instUsada || null, instancia_pedida: instUsada !== instancia ? instancia : undefined, texto_ajustado: textoAjustado || undefined, campos_gravados: camposGravados || undefined, dono_crm: dono, arte: !!b.templateId, arte_ok: res.arte_ok, motivo: ok ? undefined : (res.recusado || ("GHL " + res.status + ": " + res.body)), bind_nao_confirmado: res.recusado ? true : undefined, instancia_caiu: res.instancia_caiu || undefined, queda_outra: res.queda_outra || undefined, dono_forcado: donoForcado || undefined, switch_pedido: forcarSwitch ? instancia : undefined, switch_aceito: res.switch ? res.switch.aceito : undefined, alerta_pelo_dono: alertaPeloDono || undefined, anexos: (Array.isArray(b.imagens) ? b.imagens.length : 0) || undefined, resultado: res, teste: !!b.test });
  } catch (e) { return j({ ok: false, erro: String(e) }, 500); }
});
