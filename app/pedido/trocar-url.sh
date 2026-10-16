#!/bin/bash
# trocar-url.sh — troca o endereco do montador de pedido em TODO lugar que o cita.
#
# Rodar DEPOIS que o Worker novo responder, nao antes: enquanto o endereco novo nao existe, o
# repositorio tem de continuar batendo com a realidade, senao a proxima sessao manda link morto.
#
# Uso: ./trocar-url.sh https://pedido-nitron.marketing-da5.workers.dev
set -eu
NOVO="${1:-}"
[ -z "$NOVO" ] && { echo "uso: ./trocar-url.sh https://<novo-nome>.marketing-da5.workers.dev"; exit 1; }
NOVO="${NOVO%/}"   # sem barra no fim: o ponte.sh e o template ja colam o /# depois
cd "$(dirname "$0")/../.."

echo "conferindo se o endereco novo responde..."
COD=$(curl -s -o /dev/null -w '%{http_code}' -m 60 "$NOVO/" || echo 000)
[ "$COD" != "200" ] && { echo "  $NOVO respondeu HTTP $COD — nao troquei nada."; exit 1; }
echo "  HTTP 200, ok."

VELHO="https://bitter-math-090f.marketing-da5.workers.dev"
for f in app/pedido/ponte.sh app/pedido/followup-15-10.py; do
  if grep -q "$VELHO" "$f"; then
    sed -i "s|$VELHO|$NOVO|g" "$f"
    echo "  trocado em $f"
  fi
done
echo
echo "Falta a mao (de proposito, porque mexem em coisa ao vivo):"
echo "  - copiloto_licoes: a licao 271 e a 280 nao citam a URL, entao nao precisam. Confira com:"
echo "      select id from copiloto_licoes where licao ilike '%workers.dev%' and ativo;"
echo "  - deploy/worker/redirect-antigo.js: publicar com o nome ANTIGO, para os 11 links de 15/10."
