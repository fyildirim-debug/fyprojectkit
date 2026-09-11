#!/usr/bin/env bash
#
# Proje takip paneli — uçtan uca kurulum.
#
# Üç aşamayı sırayla yapar: Appwrite koleksiyonları → Cloudflare DNS → Dokploy compose.
# Her aşama tekrar çalıştırılabilir; var olanı atlar, eksiği tamamlar.
#
#   export DOMAIN=takip.example.com ZONE=example.com
#   export GH_OWNER=<github-kullanıcı> GH_REPO=<repo>
#   export APPWRITE_ENDPOINT=https://appwrite.example.com/v1
#   export APPWRITE_API_KEY=...        # databases.write + collections.write yetkili
#   ./scripts/deploy.sh
#
# Sadece bir aşamayı çalıştırmak için:
#   ./scripts/deploy.sh appwrite | dns | dokploy | verify
#
# Gereksinim: appwrite, cloudflare ve dokploy skill'leri ~/.claude/skills/synced/
# altında kurulu olmalı (kimlik bilgileri onların config.json'larında).

set -euo pipefail

DOMAIN="${DOMAIN:?DOMAIN gerekli, örn. takip.example.com}"
ZONE="${ZONE:?ZONE gerekli, örn. example.com}"
APPWRITE_PROJECT="${APPWRITE_PROJECT_ID:-takip}"
APPWRITE_DB="${APPWRITE_DATABASE_ID:-takip}"
APPWRITE_ENDPOINT="${APPWRITE_ENDPOINT:?APPWRITE_ENDPOINT gerekli, örn. https://appwrite.example.com/v1}"
GH_OWNER="${GH_OWNER:?GH_OWNER gerekli}"
GH_REPO="${GH_REPO:?GH_REPO gerekli}"
GH_BRANCH="${GH_BRANCH:-main}"
COMPOSE_NAME="${COMPOSE_NAME:-takip}"
DOKPLOY_PROJECT="${DOKPLOY_PROJECT:-Projeler}"

SKILLS="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills/synced}"
DOK="$SKILLS/dokploy/scripts"
CF="$SKILLS/cloudflare/scripts"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

say()  { printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

need_skill() {
  [ -f "$1" ] || die "Skill betiği yok: $1
Skill'ler ~/.claude/skills/synced/ altında kurulu mu? CLAUDE_SKILLS_DIR ile yol verebilirsin."
}

# JSON alanı oku — jq'ya bağımlı olmamak için python3 kullanıyoruz.
jget() { python3 -c "
import json,sys
d=json.load(sys.stdin)
for k in sys.argv[1].split('.'):
    if d is None: break
    d = d.get(k) if isinstance(d, dict) else None
print(d if d is not None else '')
" "$1"; }

# ---------------------------------------------------------------- 1 · Appwrite

phase_appwrite() {
  say "1/3 · Appwrite koleksiyonları"
  [ -n "${APPWRITE_API_KEY:-}" ] || die "APPWRITE_API_KEY tanımlı değil.
Appwrite konsolunda '$APPWRITE_PROJECT' projesini aç, databases.write + collections.write
yetkili bir anahtar üret ve: export APPWRITE_API_KEY=..."

  APPWRITE_ENDPOINT="$APPWRITE_ENDPOINT" \
  APPWRITE_PROJECT_ID="$APPWRITE_PROJECT" \
  APPWRITE_DATABASE_ID="$APPWRITE_DB" \
  APPWRITE_API_KEY="$APPWRITE_API_KEY" \
    node "$ROOT/scripts/setup-appwrite.mjs" ${SEED:+--seed}

  ok "koleksiyonlar hazır"
}

# --------------------------------------------------------------------- 2 · DNS

phase_dns() {
  say "2/3 · Cloudflare DNS"
  need_skill "$CF/cf.py"

  local ip
  ip="$(cd "$DOK" && python3 dok.py call settings.getIp 2>/dev/null | tr -d '"[:space:]')"
  [ -n "$ip" ] || die "Sunucu IP'si alınamadı (dok.py call settings.getIp)."
  ok "sunucu IP: $ip"

  local sub="${DOMAIN%%.$ZONE}"
  if (cd "$CF" && python3 cf.py dns "$ZONE" --type A --name "$sub" 2>/dev/null) | grep -q "$ip"; then
    ok "A kaydı zaten doğru: $DOMAIN → $ip"
    return
  fi

  # Gri bulut şart: Traefik sertifikayı HTTP-01 ile alıyor.
  (cd "$CF" && python3 cf.py dns-add "$ZONE" A "$sub" "$ip" \
     --comment "$COMPOSE_NAME — proje takip paneli")
  ok "A kaydı eklendi: $DOMAIN → $ip (DNS only)"
}

# ----------------------------------------------------------------- 3 · Dokploy

phase_dokploy() {
  say "3/3 · Dokploy compose"
  need_skill "$DOK/dok.py"
  cd "$DOK"

  # Var olan compose'u ara; yoksa yarat.
  local composeId
  composeId="$(python3 dok.py call compose.search --name "$COMPOSE_NAME" 2>/dev/null \
    | python3 -c "
import json,sys
try: rows=json.load(sys.stdin)
except Exception: rows=[]
rows = rows if isinstance(rows,list) else rows.get('data',[])
print(next((r['composeId'] for r in rows if r.get('name')=='$COMPOSE_NAME'), ''))
" 2>/dev/null || true)"

  if [ -n "$composeId" ]; then
    ok "mevcut compose kullanılıyor: $composeId"
  else
    local envId
    envId="$(python3 dok.py tree 2>/dev/null | python3 -c "
import re,sys
# 'Projeler' projesinin ilk ortam id'si
txt=sys.stdin.read()
m=re.search(r'$DOKPLOY_PROJECT.*?environmentId[\"\s:=]+([A-Za-z0-9_-]{10,})', txt, re.S)
print(m.group(1) if m else '')
")"
    [ -n "$envId" ] || die "'$DOKPLOY_PROJECT' projesinin environmentId'si bulunamadı.
Elle bak: cd $DOK && python3 dok.py tree"
    ok "ortam: $envId"

    composeId="$(python3 dok.py post compose.create --data "{
      \"name\": \"$COMPOSE_NAME\",
      \"environmentId\": \"$envId\",
      \"composeType\": \"docker-compose\"
    }" | jget composeId)"
    [ -n "$composeId" ] || die "compose.create başarısız."
    ok "compose oluşturuldu: $composeId"
  fi

  # GitHub kaynağı
  local githubId
  githubId="$(python3 dok.py call github.githubProviders 2>/dev/null | python3 -c "
import json,sys
try: rows=json.load(sys.stdin)
except Exception: rows=[]
rows = rows if isinstance(rows,list) else rows.get('data',[])
print(rows[0]['githubId'] if rows else '')
")"
  [ -n "$githubId" ] || die "GitHub sağlayıcısı yok. Dokploy > Settings > Git Providers'tan bağla."

  python3 dok.py post compose.update --data "{
    \"composeId\": \"$composeId\",
    \"sourceType\": \"github\",
    \"githubId\": \"$githubId\",
    \"owner\": \"$GH_OWNER\",
    \"repository\": \"$GH_REPO\",
    \"branch\": \"$GH_BRANCH\",
    \"composePath\": \"./docker-compose.yml\",
    \"composeType\": \"docker-compose\",
    \"autoDeploy\": true,
    \"triggerType\": \"push\"
  }" > /dev/null
  ok "kaynak bağlandı: $GH_OWNER/$GH_REPO@$GH_BRANCH"

  # Ortam değişkenleri. VITE_* build anında gömülür, APPWRITE_* çalışma anında okunur.
  local env_block
  env_block="VITE_APPWRITE_ENDPOINT=$APPWRITE_ENDPOINT
VITE_APPWRITE_PROJECT_ID=$APPWRITE_PROJECT
VITE_APPWRITE_DATABASE_ID=$APPWRITE_DB
VITE_MCP_BASE_URL=https://$DOMAIN
APPWRITE_ENDPOINT=$APPWRITE_ENDPOINT
APPWRITE_PROJECT_ID=$APPWRITE_PROJECT
APPWRITE_DATABASE_ID=$APPWRITE_DB
APPWRITE_API_KEY=${APPWRITE_API_KEY:-}"

  python3 dok.py post compose.saveEnvironment --data "$(python3 -c "
import json,sys
print(json.dumps({'composeId': sys.argv[1], 'env': sys.argv[2]}))
" "$composeId" "$env_block")" > /dev/null
  ok "ortam değişkenleri yazıldı"

  # Domainler: kök → web, /mcp → mcp. stripPath false olmalı.
  local existing
  existing="$(python3 dok.py call domain.byComposeId --composeId "$composeId" 2>/dev/null || echo '[]')"

  add_domain() {
    local svc="$1" port="$2" path="$3"
    if echo "$existing" | grep -q "\"serviceName\":\"$svc\""; then
      ok "domain zaten var: $DOMAIN$path → $svc:$port"
      return
    fi
    python3 dok.py post domain.create --data "{
      \"host\": \"$DOMAIN\",
      \"composeId\": \"$composeId\", \"domainType\": \"compose\",
      \"serviceName\": \"$svc\", \"port\": $port, \"path\": \"$path\",
      \"https\": true, \"certificateType\": \"letsencrypt\", \"stripPath\": false
    }" > /dev/null
    ok "domain eklendi: $DOMAIN$path → $svc:$port"
  }

  add_domain web 80 "/"
  add_domain mcp 8787 "/mcp"

  python3 dok.py post compose.deploy --data "{\"composeId\": \"$composeId\"}" > /dev/null
  ok "deploy tetiklendi"
  warn "build 3-6 dakika sürer:  cd $DOK && python3 dok.py logs $COMPOSE_NAME --tail 200"

  echo "$composeId" > "/tmp/$COMPOSE_NAME.composeid"
}

# ------------------------------------------------------------------ doğrulama

phase_verify() {
  say "Doğrulama"

  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "https://$DOMAIN/" || echo 000)"
  if [ "$code" = "200" ]; then ok "arayüz: 200"
  else warn "arayüz: $code (sertifika/DNS henüz oturmamış olabilir, birkaç dakika bekle)"; fi

  local health mode
  health="$(curl -sS --max-time 20 "https://$DOMAIN/mcp/health" 2>/dev/null || echo '{}')"
  mode="$(echo "$health" | jget mode)"
  case "$mode" in
    appwrite) ok "MCP sunucusu: Appwrite'a bağlı" ;;
    local)    warn "MCP sunucusu YEREL modda — APPWRITE_* değişkenleri konteynere ulaşmamış" ;;
    *)        warn "MCP sağlık ucu yanıt vermedi: $health" ;;
  esac

  echo
  echo "  Panel:  https://$DOMAIN"
  echo "  MCP:    https://$DOMAIN/mcp/<proje-slug>/sse"
}

# ----------------------------------------------------------------------- main

case "${1:-all}" in
  appwrite) phase_appwrite ;;
  dns)      phase_dns ;;
  dokploy)  phase_dokploy ;;
  verify)   phase_verify ;;
  all)
    phase_appwrite
    phase_dns
    phase_dokploy
    say "Build'in bitmesi bekleniyor (90 sn)…"
    sleep 90
    phase_verify
    ;;
  *) die "Bilinmeyen aşama: $1  (appwrite | dns | dokploy | verify | all)" ;;
esac
