# Deploy

Dört aşama: Appwrite → DNS → Dokploy → doğrulama. Komutlar birebir çalıştırılabilir.

Aşağıdaki değerler örnektir; kendi alan adın, sunucun ve deponla değiştir:

| | |
|---|---|
| Domain | `takip.example.com` |
| Sunucu IP | `203.0.113.10` |
| Repo | `<github-kullanıcı>/<repo>` |
| Dokploy | `https://deploy.example.com` |
| Appwrite | `https://appwrite.example.com/v1` |

MCP sunucusu aynı alan altında `/mcp` yolunda durur:
`https://takip.example.com/mcp/<proje-slug>/sse`

---

## Tek komutla

Üç aşamayı da sırayla yapan betik hazır — aşağıdaki elle adımların otomatik hali:

```bash
export DOMAIN=takip.example.com ZONE=example.com
export GH_OWNER=<github-kullanıcı> GH_REPO=<repo>
export APPWRITE_ENDPOINT=https://appwrite.example.com/v1
export APPWRITE_API_KEY=...      # databases.write + collections.write yetkili
SEED=1 ./scripts/deploy.sh       # SEED=1 örnek veriyi de yazar
```

Tek aşama çalıştırmak için: `./scripts/deploy.sh appwrite | dns | dokploy | verify`

Betik `appwrite`, `cloudflare` ve `dokploy` skill'lerini `~/.claude/skills/synced/`
altında arar (kimlik bilgileri onların `config.json`'larında). Farklı bir yerdeyse
`CLAUDE_SKILLS_DIR` ile yolu ver. Her aşama tekrar çalıştırılabilir: var olan
koleksiyonu, DNS kaydını, compose'u ve domaini atlar.

> **Claude Code oturumundan çalıştırıyorsan** ortamın ağ politikası
> Appwrite, Dokploy ve `api.cloudflare.com` hostlarına
> izin vermeli. Vermiyorsa istekler `Host not in allowlist` ile 403 döner —
> ortam ayarlarındaki network egress listesine bu üç hostu ekle.

Aşağısı aynı işin elle yapılışı; betik bir yerde takılırsa buradan devam et.

## 1 · Appwrite

Konsolda `takip` kimliğiyle bir proje aç, ardından `databases.write` +
`collections.write` yetkili bir API anahtarı üret.

Kurulum scripti repo içinde. Kendi makinenden:

```bash
git clone <repo-adresi>
cd <repo>
cp .env.example .env          # APPWRITE_API_KEY'i doldur
node scripts/setup-appwrite.mjs --seed
```

Script 11 koleksiyonu, alanlarını ve index'lerini kurar; tekrar çalıştırılabilir.
`--seed` örnek (kurgusal) kayıtları da yazar — boş başlamak istersen çıkar.

Doğrulama:

```bash
curl -s -H "x-appwrite-project: takip" -H "x-appwrite-key: $APPWRITE_API_KEY" \
  "https://appwrite.example.com/v1/databases/takip/collections" \
  | python3 -c "import json,sys; print([c['\$id'] for c in json.load(sys.stdin)['collections']])"
```

11 koleksiyon adı dönmeli.

---

## 2 · DNS (Cloudflare)

`example.com` zone'una A kaydı:

```
takip.example.com   A   203.0.113.10   Proxy: DNS only (gri bulut)
```

> Gri bulut şart: Traefik sertifikayı HTTP-01 ile alır, turuncu bulut bunu
> engelleyebilir. Sertifika çıktıktan sonra istersen proxy'yi açarsın.

```bash
dig +short takip.example.com    # 203.0.113.10 dönmeli
```

---

## 3 · Dokploy

`cd <dokploy-skill>/scripts` altından. Sıra önemli.

```bash
# 3.1 — hedef ortamı bul ("Projeler" projesi altına koyuyoruz)
python3 dok.py tree                    # environmentId'yi buradan al → <envId>

# 3.2 — compose kabuğunu yarat
python3 dok.py post compose.create --data '{
  "name": "takip",
  "environmentId": "<envId>",
  "composeType": "docker-compose"
}'                                     # dönen composeId → <composeId>

# 3.3 — GitHub kaynağını bağla
python3 dok.py call github.githubProviders          # githubId → <githubId>
python3 dok.py post compose.update --data '{
  "composeId": "<composeId>",
  "sourceType": "github",
  "githubId": "<githubId>",
  "owner": "<github-kullanıcı>",
  "repository": "<repo>",
  "branch": "main",
  "composePath": "./docker-compose.yml",
  "composeType": "docker-compose",
  "autoDeploy": true,
  "triggerType": "push"
}'

# 3.4 — ortam değişkenleri
#   VITE_* arayüze BUILD anında gömülür, APPWRITE_* MCP sunucusunda çalışma anında okunur.
python3 dok.py post compose.saveEnvironment --data '{
  "composeId": "<composeId>",
  "env": "VITE_APPWRITE_ENDPOINT=https://appwrite.example.com/v1\nVITE_APPWRITE_PROJECT_ID=takip\nVITE_APPWRITE_DATABASE_ID=takip\nVITE_MCP_BASE_URL=https://takip.example.com\nAPPWRITE_ENDPOINT=https://appwrite.example.com/v1\nAPPWRITE_PROJECT_ID=takip\nAPPWRITE_DATABASE_ID=takip\nAPPWRITE_API_KEY=<appwrite-api-key>"
}'

# 3.5 — domainler: kök arayüze, /mcp sunucuya
python3 dok.py post domain.create --data '{
  "host": "takip.example.com",
  "composeId": "<composeId>", "domainType": "compose",
  "serviceName": "web", "port": 80, "path": "/",
  "https": true, "certificateType": "letsencrypt", "stripPath": false
}'
python3 dok.py post domain.create --data '{
  "host": "takip.example.com",
  "composeId": "<composeId>", "domainType": "compose",
  "serviceName": "mcp", "port": 8787, "path": "/mcp",
  "https": true, "certificateType": "letsencrypt", "stripPath": false
}'

# 3.6 — deploy
python3 dok.py post compose.deploy --data '{"composeId": "<composeId>"}'
```

**`stripPath: false` kritik.** MCP sunucusunun rotaları `/mcp` önekini içeriyor
(`/mcp/:slug/sse`); Traefik öneki keserse sunucu 404 döner.

Build 3–6 dakika sürer (iki imaj, `npm ci` iki kez). İzlemek için:

```bash
python3 dok.py logs takip --tail 200
```

---

## 4 · Doğrulama

```bash
# arayüz
curl -sI https://takip.example.com | head -3          # 200 + text/html

# MCP sağlık ucu
curl -s https://takip.example.com/mcp/health          # {"ok":true,"mode":"appwrite",...}
```

`mode` **`appwrite`** demeli. `local` diyorsa MCP konteyneri `APPWRITE_*`
değişkenlerini görmüyor — 3.4'ü tekrar et ve yeniden deploy et.

Arayüz tarafında: giriş ekranı Appwrite hesabıyla açılmalı. Sağ altta
"Yerel mod — Appwrite bağlı değil" uyarısı çıkıyorsa `VITE_*` değişkenleri
imaja gömülmemiş demektir; env'i düzeltip **yeniden build** gerekir
(sadece restart yetmez, değerler build anında gömülüyor).

Son adım: uygulamada bir projenin MCP sekmesini aç, "MCP'yi aç" de, çıkan
adresi ve tokenı Claude'a tanıt:

```json
{
  "mcpServers": {
    "nova-okul-takip": {
      "url": "https://takip.example.com/mcp/nova-okul/sse",
      "headers": { "Authorization": "Bearer mcp_nova_..." }
    }
  }
}
```

---

## Sonradan güncelleme

`autoDeploy: true` — `main`'e push atınca kendiliğinden yeniden deploy olur.
Elle tetiklemek için:

```bash
python3 dok.py deploy takip
python3 dok.py status takip
```

## Sorun çıkarsa

| Belirti | Sebep |
|---|---|
| Domain 404 / 522 | DNS henüz yayılmamış ya da Traefik sertifika alamamış — gri bulut mu? |
| `/mcp/...` 404 | `stripPath` `true` kalmış |
| `mode: local` | MCP konteyneri `APPWRITE_*` görmüyor |
| Arayüzde "Yerel mod" | `VITE_*` build'e girmemiş — env'i düzelt, yeniden **build** et |
| Build `npm ci` hatası | `package-lock.json` ile manifestler uyuşmuyor — lokalde `npm install` çalıştır, lock'u commit et |
