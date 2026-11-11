// Mensagem 2 do Conecta — texto do gestor (11/11), palavra por palavra.
// Duas mudancas, as duas de FORMA, nenhuma de conteudo:
//  1. os marcadores "* " viraram "• ": no WhatsApp o asterisco e negrito, e quatro linhas
//     comecando com "*" sem fechar fazem o app parear os asteriscos entre si e embaralhar o
//     negrito do bloco inteiro. "•" e o marcador de lista que o resto do painel ja usa.
//  2. titulo, datas e vagas em negrito do WhatsApp (*assim*), como nas outras mensagens.
const ARTE="https://bwbeieumxcuomtrvlqxs.supabase.co/storage/v1/object/public/comunicado-midia/2026-11-11-nitron-conecta-arte-9srobf.jpg";
const LINK="https://nitron-agenda-conecta.replit.app";

const ZAP = [
"*NITRON CONECTA: O FUTURO DO VAREJO ESTÁ SENDO DISCUTIDO AGORA!*","",
"A Nitron preparou um encontro exclusivo para você do varejo de variedades, com foco em conexões estratégicas, troca de experiências e novas oportunidades de negócios.","",
"📌 *O que você vai encontrar?*","",
"• Bate-Papo sobre a Reforma Tributária",
"• Tendências e perspectivas para 2027",
"• Networking e troca de experiências entre empresários",
"• Showroom exclusivo com lançamentos e condições especiais para o final de ano","",
"🤝 Mais do que um evento, uma troca sobre o futuro do varejo.","",
"📅 *16, 17 ou 18 de novembro*",
"🎟️ *Apenas 15 empresas por data*",
"✅ *Participação gratuita, mediante confirmação.*","",
"Escolha a melhor data e garanta sua participação!","",
"Porque grandes decisões não nascem apenas de informações. Elas nascem das conversas certas, com as pessoas certas, no momento certo.","",
"🔗 "+LINK
].join("\n");

const esc=t=>String(t==null?"":t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const forte=t=>esc(t).replace(/\*([^*]+)\*/g,"<b>$1</b>");

// E-MAIL: a ARTE vai no TOPO, nao no fim. Por isso o <img> entra aqui no corpo e a linha de e-mail
// NAO leva o campo `imagens` — senao o fila-processar (blocoImagens) colaria a mesma arte de novo
// embaixo. No Zaptos e o contrario: a imagem vai em `imagens`, como anexo do proprio POST do texto.
function emailHTML(){
  const P=s=>'<p style="margin:0 0 14px;font-size:16px;line-height:1.65;color:#1b2b26">'+forte(s)+'</p>';
  const LI=s=>'<tr><td width="22" valign="top" style="padding:5px 0;font-size:16px;line-height:1.5;color:#0f7a46">•</td>'
            +'<td valign="top" style="padding:5px 0;font-size:16px;line-height:1.5;color:#1b2b26">'+forte(s)+'</td></tr>';
  let c="";
  c+='<a href="'+esc(LINK)+'"><img src="'+esc(ARTE)+'" alt="Nitron Conecta — 16, 17 ou 18 de novembro" width="620" style="display:block;width:100%;max-width:620px;height:auto;border:0"></a>';
  c+='<div style="padding:24px 24px 20px">';
  c+=P("A Nitron preparou um encontro exclusivo para você do varejo de variedades, com foco em conexões estratégicas, troca de experiências e novas oportunidades de negócios.");
  c+='<p style="margin:18px 0 10px;font-size:16px;font-weight:700;color:#0a5c34">📌 O que você vai encontrar?</p>';
  c+='<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:0 0 16px">'
    +LI("Bate-Papo sobre a Reforma Tributária")+LI("Tendências e perspectivas para 2027")
    +LI("Networking e troca de experiências entre empresários")
    +LI("Showroom exclusivo com lançamentos e condições especiais para o final de ano")+'</table>';
  c+=P("🤝 Mais do que um evento, uma troca sobre o futuro do varejo.");
  c+='<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:4px 0 20px;background:#f2f8f5;border:1px solid #cfe5d9;border-radius:12px"><tr><td style="padding:14px 18px;font-size:16px;line-height:1.9;color:#14211d">'
    +'📅 <b>16, 17 ou 18 de novembro</b><br>🎟️ <b>Apenas 15 empresas por data</b><br>✅ <b>Participação gratuita, mediante confirmação.</b>'
    +'</td></tr></table>';
  c+=P("Escolha a melhor data e garanta sua participação!");
  c+='<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:6px auto 12px"><tr><td style="background:#0f7a46;border-radius:12px">'
    +'<a href="'+esc(LINK)+'" style="display:inline-block;padding:16px 38px;color:#ffffff;font-size:17px;font-weight:800;text-decoration:none">Confirme sua participação</a></td></tr></table>';
  c+='<p style="margin:0 0 4px;text-align:center;font-size:12px;line-height:1.5;color:#5d7169">Ou copie e cole no navegador:<br><span style="color:#0f7a46">'+esc(LINK)+'</span></p>';
  c+='<p style="margin:20px 0 0;text-align:center;font-size:14px;font-style:italic;line-height:1.6;color:#5d7169">Porque grandes decisões não nascem apenas de informações.<br>Elas nascem das conversas certas, com as pessoas certas, no momento certo.</p>';
  c+='</div>';
  c+='<div style="padding:16px 24px 24px;text-align:center;border-top:1px solid #e6ece9">'
    +'<div style="font-size:13px;color:#5d7169;line-height:1.6">Nitronplast Indústria e Comércio<br>Rua Uruçuí, 600 — Cidade Aracília, Guarulhos/SP</div></div>';
  return '<div style="background:#eef3f0;padding:22px 12px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif">'
    +'<table role="presentation" cellpadding="0" cellspacing="0" align="center" width="620" style="max-width:620px;width:100%;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dfe8e4">'
    +'<tr><td>'+c+'</td></tr></table></div>';
}
const ASSUNTO="Nitron Conecta — o futuro do varejo está sendo discutido agora | 16, 17 ou 18/11";
module.exports={ZAP,ARTE,LINK,ASSUNTO,emailHTML};
if(require.main===module){
  const h=emailHTML().replace(/\n/g,"");
  if(h.indexOf("\n")>=0){console.error("ERRO: quebra de linha");process.exit(1);}
  require("fs").writeFileSync("/tmp/claude-0/-home-user-CampanhasNitron/47ac4c18-4b81-508f-b85a-e2925d247e17/scratchpad/c2/email.html","<!doctype html><meta charset=utf-8><title>Conecta 2</title>"+h);
  require("fs").writeFileSync("/tmp/claude-0/-home-user-CampanhasNitron/47ac4c18-4b81-508f-b85a-e2925d247e17/scratchpad/c2/zap.txt",ZAP);
  console.log("e-mail:",h.length,"chars (uma linha) · zaptos:",ZAP.length,"chars");
}
