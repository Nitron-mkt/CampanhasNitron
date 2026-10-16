// Redirecionamento do endereco ANTIGO do montador de pedido.
//
// Por que existe: em 15/10 saiu o link `bitter-math-090f.marketing-da5.workers.dev` para 11
// lojistas, pelo Zaptos da Nina. Renomear o Worker move a rota workers.dev junto com o nome, entao
// o endereco antigo deixaria de existir e os 11 links morreriam — nenhum deles abriu a pagina ainda.
// Depois do rename o nome `bitter-math-090f` fica livre: este Worker reivindica o nome de volta e
// devolve 301 para o endereco novo.
//
// O `#Sudeste-R01` do fim da URL NAO chega ao servidor (fragmento nunca e enviado), e o navegador
// o reanexa sozinho ao seguir um 301 cujo destino nao tem fragmento. Por isso o link antigo
// continua caindo no segmento certo do lojista — nao e preciso (nem possivel) tratar o hash aqui.
//
// Como publicar: Workers & Pages -> Create -> Worker -> nome EXATO `bitter-math-090f` -> colar isto.
// Pode sair do ar quando os 11 links nao importarem mais (meses, nao dias: WhatsApp nao expira).

const NOVO = "https://pedido-nitron.marketing-da5.workers.dev";

export default {
  async fetch(req) {
    const u = new URL(req.url);
    // leva caminho e querystring; o fragmento o navegador recoloca
    return Response.redirect(NOVO + u.pathname + u.search, 301);
  },
};
