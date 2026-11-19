// forca-teste — TEMPORARIA. Roda o processo da API de orcamento do Forca DO COMECO AO FIM,
// em MODO DE TESTE, para o gestor ver como funciona.
//
// O QUE ELA NAO FAZ: nao grava nada. Todo POST vai com `"teste": true`, que a secao 5 do
// contrato (docs/api-pedidos-crm.md) descreve assim: "nada e gravado: nao cadastra cliente, nao
// cria orcamento, nao gera link e nao consulta credito". Foi exatamente o que faltava em 17/11,
// quando 22 orcamentos de verdade nasceram no ERP numa rodada de teste.
//
// POR QUE E FUNCAO SEPARADA, E NAO UM PARAMETRO NA `forca-cadastro`: aquela roda de 5 em 5 min
// abrindo pedido de verdade e esta atendendo lead. Publicar por cima dela para experimentar e
// risco sem motivo — a licao de 16/09.
//
// `teste=0` existe, mas e a chamada DE VERDADE: cadastra, abre orcamento e gera link no ERP.
// Nao use sem ordem explicita do gestor.
//
// Uso (sempre com a chave de servico no Authorization):
//   GET /forca-teste                       roda os casos embutidos em modo teste
//   GET /forca-teste?cnpj=<14 digitos>     roda so esse CNPJ
//   GET /forca-teste?auth=1                so confere a credencial, sem chamar orcamento

const j = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o, null, 2), { status: s, headers: { "Content-Type": "application/json" } });

const FORCA_BASE = "https://vendas.nitron.com.br";
const FORCA_ID = "crm-nitron";
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

// OS CASOS. Escolhidos no Sankhya em 19/11 pelos dados que decidem o resultado — a CODTAB do
// cadastro e a data da ultima compra —, nao pelo nome. A licao da LOJAS PRADO (03/11): quem manda
// na recusa por Clube e a CODTAB, nao o contrato.
const CASOS = [
  { papel: "cliente INATIVO (338 dias sem comprar)", cnpj: "09330604000170",
    loja: "DMX ATACADISTA", codparc: 63716, praca: "Joao Pessoa/PB",
    tabela: "PV0003 - TABELA PADRAO", vendedor: "WALDEMAR (32)", ultima_compra: "16/12/2025",
    espero: "passaria=true, cadastro=aproveita — passou dos 180 dias, entao a trava de representante nao deve pegar" },
  { papel: "cliente ATIVO (59 dias sem comprar)", cnpj: "34471636000133",
    loja: "CASA TOP MIX", codparc: 422, praca: "Sao Paulo/SP",
    tabela: "PV0003 - TABELA PADRAO", vendedor: "ADAO (16)", ultima_compra: "21/09/2026",
    espero: "CLIENTE_COM_REPRESENTANTE — comprou dentro dos 180 dias" },
  { papel: "cliente de CLUBE", cnpj: "35675991000197",
    loja: "MUNDO DAS MENINAS", codparc: 102684, praca: "Sao Paulo/SP",
    tabela: "153 - CLUBE NITRON VAREJO 8%", vendedor: "MILTON (17)", ultima_compra: "21/09/2026",
    espero: "CLIENTE_CLUBE — a CODTAB 153 e tabela de Clube" },
];

// Dados de contato: a API exige os tres, e em modo teste nada e gravado. Ficam explicitamente
// marcados como teste para que, se um dia alguem rodar isto com teste=0 por engano, apareca.
const CONTATO = { contato: "Teste CRM Nitron", email: "teste@exemplo.com.br", whatsapp: "11912345678" };

async function token(): Promise<string> {
  const seg = Deno.env.get("CRM_PEDIDO_SECRET") || "";
  if (!seg) throw new Error("CRM_PEDIDO_SECRET nao configurado");
  const r = await fetch(`${FORCA_BASE}/api/crm/auth`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: FORCA_ID, client_secret: seg }),
    signal: AbortSignal.timeout(20_000),
  });
  const d = await r.json().catch(() => ({} as any));
  if (!r.ok || !d?.access_token) throw new Error(`auth ${r.status}: ${JSON.stringify(d).slice(0, 200)}`);
  return d.access_token;
}

Deno.serve(async (req) => {
  try {
    const auth = req.headers.get("Authorization") || "";
    const aceitas = [Deno.env.get("SRV_JWT"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")]
      .filter(Boolean).map((k) => "Bearer " + k);
    if (!aceitas.includes(auth)) return j({ ok: false, erro: "nao autorizado" }, 401);

    const u = new URL(req.url);
    // `teste` so deixa de ser true se alguem pedir explicitamente. O padrao nunca grava.
    const modoTeste = u.searchParams.get("teste") !== "0";

    const t0 = Date.now();
    const tk = await token();
    const passo1 = { passo: "1. POST /api/crm/auth", ok: true, segundos: Math.round((Date.now() - t0) / 100) / 10,
                     token_recebido: true, validade_min: 60 };
    if (u.searchParams.get("auth") === "1") return j({ ok: true, modo_teste: modoTeste, passo1 });

    const H = { Authorization: "Bearer " + tk, "Content-Type": "application/json" };
    const um = digits(u.searchParams.get("cnpj"));
    const casos = um.length === 14
      ? [{ papel: "avulso", cnpj: um, loja: "", codparc: null, praca: "", tabela: "", vendedor: "", ultima_compra: "", espero: "" }]
      : CASOS;

    const resultados: Record<string, unknown>[] = [];
    for (const c of casos) {
      // `entrega` opcional: a secao 5 do contrato promete `mix` e `valor` (com percentual CIF e
      // regiao) na resposta de teste, e sem endereco nao ha regiao — entao a hipotese e que seja
      // isso que falta. Testar e barato; supor sai caro.
      const cep = digits(u.searchParams.get("cep"));
      const num = (u.searchParams.get("numero") || "").trim().slice(0, 10);
      const corpo: Record<string, unknown> = { ...(modoTeste ? { teste: true } : {}), cnpj: c.cnpj, ...CONTATO };
      if (cep.length === 8 && num) corpo.entrega = { cep, numero: num };
      const t = Date.now();
      const r = await fetch(`${FORCA_BASE}/api/crm/orcamento`, {
        method: "POST", headers: H, body: JSON.stringify(corpo), signal: AbortSignal.timeout(120_000),
      });
      const d = await r.json().catch(() => ({} as any));
      const seg = Math.round((Date.now() - t) / 100) / 10;

      // O contrato manda decidir pelo `resolve`, nao pelo `erro` — assim um codigo novo que
      // apareca um dia continua roteavel. Em modo teste as recusas vem em `problemas[]`.
      const problemas = Array.isArray(d?.problemas) ? d.problemas : [];
      const leitura = modoTeste
        ? (d?.passaria === true
            ? "ABRIRIA o pedido"
            : "NAO abriria — " + problemas.map((p: any) => `${p.erro} (resolve=${p.resolve})`).join("; "))
        : (d?.status || "sem status");

      resultados.push({
        caso: c.papel, loja: c.loja, codparc: c.codparc, cnpj: c.cnpj, praca: c.praca,
        tabela_do_cadastro: c.tabela, vendedor_do_cadastro: c.vendedor, ultima_compra: c.ultima_compra,
        eu_esperava: c.espero,
        http: r.status, segundos: seg,
        LEITURA: leitura,
        resposta_crua: d,
      });
    }

    return j({
      ok: true,
      modo_teste: modoTeste,
      aviso: modoTeste
        ? "MODO TESTE: nada foi gravado no Forca nem no ERP — nenhum cadastro, nenhum orcamento, nenhum link."
        : "ATENCAO: modo REAL. Isto cadastrou cliente e abriu orcamento no ERP.",
      passo1,
      passo2: "2. POST /api/crm/orcamento com \"teste\": true — um por caso, abaixo",
      passo3: modoTeste
        ? "3. GET /api/crm/orcamento/{protocolo} NAO se aplica: em modo teste nao nasce protocolo, porque nada e criado."
        : "3. GET /api/crm/orcamento/{protocolo} ate o status sair de 'processando'.",
      total_segundos: Math.round((Date.now() - t0) / 100) / 10,
      resultados,
    });
  } catch (e) {
    return j({ ok: false, erro: String(e).slice(0, 400) }, 500);
  }
});
