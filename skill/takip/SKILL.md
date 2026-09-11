---
name: takip
description: >-
  Proje Takip paneline (takip.example.com) MCP üzerinden bağlanır: hataları ve
  işleri okur, yeni iş önerir, yapılanları kapatır, changelog ve not yazar.
  ÖNEMLİ — onay akışı vardır: yapmayı önerdiğin her şey önce `add_plan` ile
  PLANLANAN olarak yazılır, yönetici panelden onaylayınca yapılacağa düşer,
  işe ancak o zaman başlanır. Tetikleyiciler: "takip paneli", "projede ne var",
  "açık hatalar", "ne yapmam gerekiyor", "bunu plana ekle", "planı güncelle",
  "yapıldı işaretle", "changelog'a yaz", "sürüm ekle", "mcp/takip",
  "takip.example.com". Panele bağlı bir projede çalışırken; işe başlamadan
  önce ne yapılacağını buradan öğren, bitirince buraya işle.
---

# Proje Takip — MCP Skill'i

Bu skill, proje takip panelindeki bir projeye bağlanıp o projenin
hatalarını, işlerini, planlarını, notlarını ve changelog'unu yönetmen için.

- **Panel:** https://takip.example.com
- **MCP adresi:** `https://takip.example.com/mcp/<proje-slug>/sse`
- **Kimlik:** `Authorization: Bearer <token>` — her projenin kendi tokenı var

---

## En önemli kural: onay akışı

```
   sen önerirsin              yönetici onaylar           sen yaparsın
        │                            │                        │
   add_plan                     (panelden)              update_status
        ▼                            ▼                        ▼
   PLANLANAN  ──────────────►   YAPILACAK   ──────────────►  YAPILDI
   (iş değil)                   (iş budur)              (changelog'a düşer)
```

**Yapmayı düşündüğün hiçbir şeye doğrudan başlama.** Önce `add_plan` ile
planlanan olarak yaz. Planlananlar iş listesine düşmez, onay bekler.

**İşe yalnızca `list_bugs`'ın döndürdüğü kayıtlardan başla.** Varsayılan
`status: "open"`, yani onaylanmış iş. Planlanan bir maddeyi kendiliğinden
yapma — `update_status` zaten onaylanmamış kaydı kapatmayı reddeder.

Kendi planını serbestçe yönetebilirsin: `update_plan` ile düzeltir,
`delete_plan` ile geri çekersin. Bu araçlar yalnızca `planned` durumdaki
kayıtlara dokunur; onaylanmış işe zarar veremezler.

Onay yöneticinin kararıdır. `approve_plan` diye bir araç var ama **kapalı
doğar** — sana görünüyorsa yönetici bilerek açmıştır.

---

## Bağlanma

Projenin MCP sekmesinden adresi ve tokenı al, `.mcp.json`'a ekle:

```json
{
  "mcpServers": {
    "takip": {
      "url": "https://takip.example.com/mcp/<proje-slug>/sse",
      "headers": { "Authorization": "Bearer mcp_..." }
    }
  }
}
```

Token projeye özeldir ve yalnızca o projenin verisini açar. Başka projeye
erişemezsin.

---

## Tipik oturum

**1. Nerede olduğunu öğren.**

```
project_status
```

Durum, sürüm, %ilerleme, açık hata/iş sayısı, kritikler, harcanan süre.
Nereden başlayacağını bilmiyorsan ilk çağrın bu olsun.

**2. Onaylanmış işe bak.**

```
list_bugs { min_priority: "yuksek" }
```

Dönen her kayıt üzerinde çalışabilirsin. `get_bug { ref_no }` detayını ve
ilgili notları verir.

**3. Aklına başka bir şey geldiyse plana yaz, yapma.**

```
add_plan { items: [
  { title: "Rapor sorgularını indeksle", description: "3 sorgu tam tarama yapıyor",
    type: "task", priority: "yuksek", tag: "performans" }
]}
```

**4. Bitirdiğin işi kapat.**

```
update_status { ref_no: 131, changelog_text: "TC doğrulama Safari'de düzeltildi" }
```

Kapanan madde açık taslak sürümün changelog'una otomatik düşer.

**5. Öğrendiğin şeyi not bırak.**

```
add_note { body: "Safari regex lookbehind desteklemiyor, polyfill kondu",
           importance: "cok_onemli" }
```

---

## Araçlar

### Okuma

| Araç | Ne verir |
|---|---|
| `project_status` | Durum, sürüm, %ilerleme, açık sayılar, kritikler, süre |
| `list_bugs` | Kayıtlar — varsayılan `open` (onaylanmış iş) |
| `get_bug` | Tek kaydın detayı + başlığıyla eşleşen notlar |
| `list_plans` | Onay bekleyen öneriler |
| `list_notes` | Notlar; `min_importance` ile süzülür |
| `search` | Hata, iş, not ve changelog metinlerinde arar |
| `get_changelog` | Sürüm geçmişi |

### Plan (senin kulvarın)

| Araç | Ne yapar |
|---|---|
| `add_plan` | Öneri yazar — tek çağrıda 50'ye kadar. İş listesine düşmez. |
| `update_plan` | Onay bekleyen planı düzenler |
| `delete_plan` | Vazgeçtiğin planı siler |

### Yazma (onaylanmış iş üzerinde)

| Araç | Ne yapar |
|---|---|
| `update_status` | Yapıldı işaretler, changelog'a düşürür |
| `update_bug` | Başlık, açıklama, öncelik, bildiren, etiket düzeltir |
| `reopen_bug` | Yanlış kapatılanı geri açar |
| `add_bug` | Doğrudan iş açar — dışarıdan gelen bir hatayı kaydederken |
| `add_note` | Not yazar (`importance`: cok_onemli / normal / az_onemli) |
| `log_time` | Harcanan süreyi kaydeder |

### Geçmiş doldurma

| Araç | Ne yapar |
|---|---|
| `add_release` | Geçmiş sürüm + changelog satırları |
| `add_changelog_entries` | Var olan sürüme satır ekler |
| `add_done_items` | Geçmişte çözülmüş kayıtlar, tek çağrıda 100'e kadar |
| `set_project_version` | Projenin görünen sürüm numarasını belirler |

Sıra önemli: önce `add_release`, sonra `release_version` vererek
`add_done_items`.

### Kapalı doğanlar

`approve_plan`, `publish_release`, `delete_item`, `delete_release`,
`get_credentials`. Listede görünmüyorlarsa kapalıdırlar; çağırırsan
"tool not found" alırsın. Şifrelere erişim ve kalıcı silme bilinçli
bir kararla açılır.

---

## `add_bug` mi `add_plan` mi?

| Durum | Araç |
|---|---|
| Kullanıcı "şu bozuk" dedi, gerçek bir hata | `add_bug` |
| Kodda bir hata gördün, bildiriyorsun | `add_bug` |
| "Şunu da yapsak iyi olur" — senin önerin | `add_plan` |
| Bir işi alt adımlara böldün | `add_plan` |
| Refactor, iyileştirme, teknik borç fikri | `add_plan` |

Kısaca: **var olan bir sorunu bildiriyorsan `add_bug`, yapılmasını
öneriyorsan `add_plan`.** Emin değilsen `add_plan` — onay bir tık,
yanlış başlanmış iş değil.

### `type` hangi listeye düşeceğini belirler

Her iki araçta da `type` alanı var ve kaydın panelde nerede görüneceğini
o belirler:

| `type` | Panelde nereye düşer |
|---|---|
| `bug` | **Yapılacaklar** ana listesinde `HATA` rozetiyle + **Hatalar** süzgecinde |
| `task` | Yalnızca **Yapılacaklar** ana listesinde |

Hataların ayrı bir kovası yok: Yapılacaklar her şeyi taşır, Hatalar onun
süzülmüş hâlidir.

Öncelik altı kademeli: `cok_onemli` > `kritik` > `yuksek` > `orta` > `dusuk` >
`istek`. Listeler bu sıraya göre dizilir, `list_bugs --min_priority` bununla süzer.

`add_bug` varsayılanı `bug`, `add_plan` varsayılanı `task`. Yanlış yere
düşen bir kaydı `update_bug { ref_no, type }` (onaylanmış) ya da
`update_plan { ref_no, type }` (onay bekleyen) ile taşıyabilirsin.

---

## Alışkanlıklar

- Oturuma `project_status` ile başla, ne olduğunu gör.
- Bir işe başlamadan `get_bug` ile detayına ve ilgili notlara bak.
- Bitirdiğinde `update_status` çağır; changelog kendiliğinden yazılır.
- Öğrendiğin, bir daha lazım olacak şeyi `add_note` ile bırak; kritikse
  `importance: "cok_onemli"`.
- Uzun süren işlerde `log_time` ile süreyi işle.
- Her çağrın panelin "yapay zeka hareketleri" günlüğüne düşer; yönetici
  ne yaptığını oradan görür.
