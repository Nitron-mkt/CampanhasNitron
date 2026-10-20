#!/bin/bash
# ponte.sh <cnpj> [RXX] — CNPJ -> ramo -> regiao -> segmento -> link do pedido.
# Modo manual: enquanto a funcao nina-pedido-sugerido nao existe, esta e a ponte.
# Fontes, na ordem do LOGICA-NINA.md:
#   1) ja e cliente Nitron? sai do cadastro, sem API externa
#   2) senao, publica.cnpj.ws (a BrasilAPI esta com o endpoint de CNPJ em 503)
#   3) o que a pessoa DISSE na conversa vence o CNAE, quando discordam
set -u
cd "$(dirname "$0")"
K=$(cat .k); B=https://bwbeieumxcuomtrvlqxs.supabase.co/rest/v1
H=(-H "apikey: $K" -H "Authorization: Bearer $K")
BASE="https://pedido-nitron.marketing-da5.workers.dev"
C=$(echo "${1:-}" | tr -cd '0-9')
[ ${#C} -ne 14 ] && { echo "uso: ./ponte.sh <cnpj 14 digitos> [ramo forcado, ex R01]"; exit 1; }

curl -s -m 25 "https://publica.cnpj.ws/cnpj/$C" -o ws.json
curl -s -m 20 "$B/contato_enriquecido?cnpj=eq.$C&select=codparc,nomeparc,codvend,dias_sem_compra,situacao,praca" "${H[@]}" -o cli.json
curl -s -m 20 "$B/cnae_ramo?select=cnae7,ramo_sigla,n" "${H[@]}" -o dep.json
curl -s -m 20 "$B/pedido_base?select=pedido_id,regiao,ramo_sigla,ramo_nome,base_clientes,n_itens,valor_estimado" "${H[@]}" -o seg.json
curl -s -m 20 "$B/copiloto_lead?cnpj=eq.$C&select=id,nome,empresa,tipo_loja,interesse,status,temperatura&order=id.desc&limit=1" "${H[@]}" -o lead.json

python3 -I - "$C" "$BASE" "${2:-}" <<'PY'
# -*- coding: utf-8 -*-
import json, io, sys
C, BASE, FORCA = sys.argv[1], sys.argv[2], (sys.argv[3] if len(sys.argv) > 3 else "")
def j(f):
    try: return json.load(io.open(f, encoding="utf-8"))
    except Exception: return []
ws, cli, dep, seg, lead = j("ws.json"), j("cli.json"), j("dep.json"), j("seg.json"), j("lead.json")

UF2REG = {}
for reg, ufs in [("Norte","AC AP AM PA RO RR TO"),("Nordeste","AL BA CE MA PB PE PI RN SE"),
                 ("Centro-Oeste","DF GO MT MS"),("Sudeste","ES MG RJ SP"),("Sul","PR RS SC")]:
    for u in ufs.split(): UF2REG[u] = reg
ramo_de = {str(r["cnae7"]): (r["ramo_sigla"], r.get("n") or 0) for r in dep}
porseg  = {s["pedido_id"]: s for s in seg}
fmtdoc  = lambda c: f"{c[:2]}.{c[2:5]}.{c[5:8]}/{c[8:12]}-{c[12:]}"

est   = (ws or {}).get("estabelecimento") or {}
razao = (ws or {}).get("razao_social") or "?"
uf    = ((est.get("estado") or {}).get("sigla")) or ""
cid   = ((est.get("cidade") or {}).get("nome")) or ""
cnaes = [str((est.get("atividade_principal") or {}).get("id") or "")] + \
        [str(a.get("id")) for a in (est.get("atividades_secundarias") or [])]
cnaes = [c for c in cnaes if c]

print("=" * 64)
print(f"  {razao}")
print(f"  CNPJ {fmtdoc(C)}   ·   {cid}/{uf}   ·   {est.get('situacao_cadastral','?')}")
print("=" * 64)

if cli:
    c = cli[0]
    print(f"  JA E CLIENTE — codparc {c['codparc']} · rep codvend {c.get('codvend')} · "
          f"{c.get('praca')} · {c.get('dias_sem_compra')}d sem compra ({c.get('situacao')})")
    print("  >> Nao e lead novo: ele ja tem dono. Confira antes de abordar.")
else:
    print("  Sem cadastro na Nitron — lead novo.")

achou = next(((c, ramo_de[c][0], ramo_de[c][1]) for c in cnaes if c in ramo_de), None)
if achou:
    cnae, ramo, n = achou
    via = f"CNAE {cnae} ({n} clientes Nitron nesse ramo)"
else:
    ramo, via = "R01", f"nenhum CNAE casou ({', '.join(cnaes[:5])}) — caiu no R01"
reg = UF2REG.get(uf, "Sudeste")
print(f"\n  Ramo pelo CNAE : {ramo}   <- {via}")
print(f"  Regiao         : {reg}   <- UF {uf or '??'}")

if lead:
    L = lead[0]
    diz = " / ".join(x for x in [L.get("tipo_loja"), L.get("interesse")] if x)
    print(f"\n  NA CONVERSA ELE DISSE (lead #{L['id']}, {L.get('status')}, {L.get('temperatura')}):")
    print(f"    {diz or '(nada registrado)'}")
    print("  >> Se isso discordar do ramo acima, VALE O QUE ELE DISSE. O CNAE e o que o contador")
    print("     escreveu na abertura, nao necessariamente o que a loja vende.")

if FORCA.upper().startswith("R"):
    ramo = FORCA.upper()
    print(f"\n  >> RAMO FORCADO NA MAO: {ramo}")

alvo, como = f"{reg}-{ramo}", "exato"
if alvo not in porseg:
    for cand, rot in [(f"Sudeste-{ramo}", "FALLBACK: mesmo ramo, cesta do Sudeste"),
                      (f"{reg}-R01",      "FALLBACK: R01 da regiao"),
                      ("Sudeste-R01",     "FALLBACK geral")]:
        if cand in porseg: alvo, como = cand, rot; break
s = porseg[alvo]
val = f"{float(s['valor_estimado'] or 0):,.0f}".replace(",", ".")
print(f"\n  SEGMENTO: {alvo}   [{como}]")
print(f"  {s['ramo_nome']} · {s['n_itens']} itens · base de {s['base_clientes']} lojas · cesta ~R$ {val}")
# A marca ~L<id> e o que torna "abriu a pagina" atribuivel A PESSOA. Sem ela o pedido_visita so
# sabe que alguem com aquela cesta entrou — e a cesta repete entre lojistas do mesmo ramo.
# O lojista nao ve a marca: a pagina limpa a URL no primeiro carregamento (history.replaceState).
marca = f"~L{lead[0]['id']}" if lead else ""
print(f"\n  LINK PARA O CLIENTE:")
print(f"    {BASE}/#{alvo}{marca}")
if not marca:
    print("    (sem lead no copiloto_lead: este link NAO fica atribuivel a ninguem no relatorio)")
print(f"  (interno, com curva e penetracao: {BASE}/#{alvo}~adm)\n")
PY
