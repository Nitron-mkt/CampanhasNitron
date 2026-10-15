#!/bin/bash
cd "$(dirname "$0")"
K=$(cat .k)
U="https://bwbeieumxcuomtrvlqxs.supabase.co/functions/v1/campanhas-enviar"
N=$(python3 -I -c "import json,io;print(len(json.load(io.open('fup.json',encoding='utf-8'))))")
for i in $(seq 0 $((N-1))); do
  ROT=$(python3 -I -c "
import json,io
d=json.load(io.open('fup.json',encoding='utf-8'))[$i]
print('#%s %s'%(d['_id'],d['_rot']))
io.open('fx.json','w',encoding='utf-8').write(json.dumps({k:v for k,v in d.items() if not k.startswith('_')},ensure_ascii=False))
")
  printf '%s  %s  ' "$(date -u +%H:%M:%S)" "$ROT"
  curl -s -m 180 -X POST "$U" -H "Authorization: Bearer $K" -H "apikey: $K" \
    -H "Content-Type: application/json" --data-binary @fx.json \
  | python3 -I -c "
import sys,json
try: d=json.load(sys.stdin)
except Exception: print('  RESPOSTA ILEGIVEL'); raise SystemExit
r=d.get('resultado') or {}
print('ok=%s dono=%r caiu=%s motivo=%s'%(d.get('ok'),d.get('dono_crm'),r.get('instancia_caiu','nao'),(d.get('motivo') or '-')[:110]))
"
  [ $i -lt $((N-1)) ] && sleep 45
done
echo "=== fim $(date -u +%H:%M:%S) UTC ==="
