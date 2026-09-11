# Proje Takip Sistemi

Dokuz ekranlı proje takip paneli: React + Vite + TypeScript arayüz,
Appwrite veri katmanı ve proje başına ayrı bir MCP sunucusu.

## Ne var

| Klasör | İçerik |
|---|---|
| `shared/` | Tipler, iş kuralları (yapıldı → changelog), ayrıştırıcı, Appwrite ve yerel veri adaptörleri |
| `web/` | Arayüz — 9 ekranın tamamı |
| `mcp/` | Çalışan MCP sunucusu (SSE + Streamable HTTP) |
| `scripts/setup-appwrite.mjs` | Appwrite koleksiyonlarını, alanlarını ve index'lerini kurar |

## Hızlı başlangıç

```bash
npm install
npm run dev          # http://localhost:5173
```

`web/.env` yoksa uygulama **yerel modda** açılır: örnek (kurgusal) veriyle dolu gelir,
kayıtlar tarayıcıda (`localStorage`) durur. Giriş ekranına herhangi bir e-posta ve
en az 4 karakterlik bir şifre yeter.

## Appwrite'a bağlama

1. Appwrite konsolunda `takip` kimliğiyle bir proje aç.
2. `databases.write` + `collections.write` yetkisi olan bir API anahtarı üret.
3. Kökteki `.env.example` dosyasını `.env` olarak kopyala, anahtarı yaz.
4. Koleksiyonları kur:

```bash
node scripts/setup-appwrite.mjs           # sadece şema
node scripts/setup-appwrite.mjs --seed    # şema + örnek veri
```

Script tekrar çalıştırılabilir — var olan kaynakları atlar, eksikleri tamamlar.

5. `web/.env.example` dosyasını `web/.env` olarak kopyala ve doldur. Bundan sonra
   arayüz gerçek backend'e bağlanır, giriş Appwrite hesabıyla yapılır.

Kurulan koleksiyonlar: `projects`, `items`, `notes`, `releases`, `change_entries`,
`credentials`, `links`, `time_entries`, `mcp_configs`, `mcp_clients`, `mcp_logs`.

## MCP sunucusu

```bash
npm run build
npm run mcp          # :8787
```

Her projenin kendi adresi ve kendi tokenı var; token yalnızca kendi projesinin
verisini açar:

```
GET  /mcp/<proje-slug>/sse       SSE akışı
POST /mcp/<proje-slug>/messages  SSE oturumunun mesaj kanalı
ALL  /mcp/<proje-slug>           Streamable HTTP (yeni istemciler)
GET  /health
```

Claude Desktop / Claude Code yapılandırması — adres ve token arayüzdeki MCP
sekmesinden kopyalanır:

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

### Araçlar

| Araç | Erişim | Varsayılan |
|---|---|---|
| `list_bugs` | okuma | açık |
| `get_bug` | okuma | açık |
| `add_bug` | yazma | açık |
| `update_status` | yazma | açık |
| `add_note` | yazma | açık |
| `get_changelog` | okuma | açık |
| `get_credentials` | gizli | **kapalı** |
| `delete_item` | riskli | **kapalı** |

Kapalı araçlar sunucuya hiç kaydedilmez — istemci onları göremez, çağırırsa
"tool not found" alır. MCP sekmesindeki anahtarlardan açılıp kapanır.

Her çağrı `mcp_logs`'a düşer ve arayüzdeki "yapay zeka hareketleri" panelinde görünür.

Uçtan uca deneme:

```bash
npm run mcp &
node mcp/test-client.mjs
```

## Ana akış

Kullanıcının istediği döngü tek yerde tanımlı (`shared/src/service.ts`):

1. Dışarıdan hata gelir → ⌘K ile tek satır, ya da uzun mesaj → **Yapıştır & ayrıştır**
   ekranı maddelere böler, tür ve öncelik önerir.
2. Madde açık hatalar listesine düşer.
3. Kutucuk işaretlenince madde kapanır ve **açık taslak sürümün changelog'una**
   otomatik eklenir (yoksa bir sonraki yama sürümü açılır).
4. "Yeni sürüm aç" taslağı yayına alır ve projenin sürüm numarasını günceller.

Aynı akış MCP'nin `update_status` aracından da geçer — yapay zeka bir hatayı
kapattığında changelog kendiliğinden güncellenir.

## Ekranlar

| Ekran | Rota |
|---|---|
| 01 Giriş | `/giris` |
| 02 Ana ekran | `/` |
| 03 Proje detay | `/proje/:slug` |
| 04 Hata listesi | `/proje/:slug/hatalar` |
| 05 Hızlı ekleme | ⌘K / Ctrl+K (her ekranda) |
| 06 Yapıştır & ayrıştır | `/yapistir` |
| 07 Changelog | `/proje/:slug/changelog` · `/changelog` |
| 08 Şifreler | `/proje/:slug/sifreler` · `/sifreler` |
| 09 MCP | `/proje/:slug/mcp` · `/mcp` |

Sol menüdeki "Açık hatalar" (`/hatalar`) ve "Zaman" (`/zaman`) tüm projeleri
kapsayan görünümlerdir.

## Kısayollar

| Tuş | Ne yapar |
|---|---|
| `⌘K` / `Ctrl+K` | Hızlı ekleme paneli |
| `/` | Arama alanına odaklan |
| `↵` | Kaydet · `⇧↵` kaydet ve devam |
| `⇥` | Hızlı eklemede tür değiştir |
| `!kritik` `!yüksek` `!orta` `!düşük` | Satır içinde öncelik |
| `#etiket` | Satır içinde etiket |

## Komutlar

```bash
npm run dev          # arayüz (Vite)
npm run build        # shared → web → mcp
npm run typecheck    # üç paketi de kontrol et
npm run mcp          # MCP sunucusu
npm run setup:appwrite -- --seed
```

## Notlar

- Şifreler Appwrite'ta düz metin olarak durur; koleksiyon izinleri `users` rolüyle
  sınırlıdır. Gerçek bir kasa istiyorsan `credentials.secret` alanını yazmadan önce
  şifrelemek gerekir — şu an öyle bir katman yok.
- Yerel mod ile Appwrite modu arasındaki tek fark veri kaynağıdır; ekranlar ve iş
  kuralları aynı kodu kullanır.
- Arayüz FY tasarım dilindedir: Anton (başlık, daima büyük harf) + IBM Plex Mono (gövde,
  etiket), tek vurgu Coral, kart ve gölge yok. Token'lar `web/src/styles/tokens.css`,
  bileşen stilleri `web/src/styles/app.css`. Yeni bileşende inline renk/font yazma; sınıf ekle.
