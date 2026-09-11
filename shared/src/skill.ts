import { MCP_TOOL_CATALOG } from './types.js';
import type { Link, McpConfig, Project } from './types.js';

export interface ProjectSkillInput {
  project: Project;
  config: McpConfig;
  /** Projenin bağlantıları — repo adresi varsa skill'e yazılır. */
  links?: Link[];
  /** MCP sunucusunun kök adresi, örn. `https://takip.example.com`. */
  mcpBase: string;
}

const ACCESS_LABEL = {
  read: 'okuma',
  write: 'yazma',
  secret: 'gizli',
  risky: 'riskli',
} as const;

/**
 * Projeye özel, tek dosyalık Claude Code skill'i üretir.
 *
 * Amaç: dosyayı `~/.claude/skills/` ya da projenin `.claude/skills/` altına
 * kopyalayan bir yapay zekanın başka hiçbir şey sormadan sisteme bağlanması —
 * MCP adresi, tokenı, açık araçları ve onay akışı dosyanın içinde hazır gelir.
 */
export function buildProjectSkill({
  project,
  config,
  links = [],
  mcpBase,
}: ProjectSkillInput): string {
  const endpoint = `${mcpBase.replace(/\/$/, '')}/mcp/${project.slug}/sse`;
  const name = `takip-${project.slug}`;
  const repo = links.find((link) => link.kind === 'repo');
  const live = links.find((link) => link.kind === 'live');

  // Ad ile slug aynıysa tetikleyici iki kez yazılmasın.
  const triggers = [project.name, project.slug]
    .filter((value, index, all) => value && all.indexOf(value) === index)
    .map((value) => `"${value}"`)
    .join(', ');

  const enabled = MCP_TOOL_CATALOG.filter((tool) => config.enabledTools.includes(tool.name));
  const disabled = MCP_TOOL_CATALOG.filter((tool) => !config.enabledTools.includes(tool.name));

  const can = (tool: string) => config.enabledTools.includes(tool as never);

  const facts: [string, string | null][] = [
    ['Proje', project.name],
    ['Durum', project.status],
    ['Sürüm', project.version],
    ['Domain', project.domain || null],
    ['Sunucu', project.server || null],
    ['Repo', repo?.url ?? null],
    ['Canlı', live?.url ?? null],
  ];

  return `---
name: ${name}
description: >-
  "${project.name}" projesinin takip panelini yönetir: açık işleri ve hataları
  okur, yeni iş önerir, yapılanları kapatır, changelog ve not yazar. Bu projede
  çalışırken işe başlamadan önce ne yapılacağını buradan öğren, bitirince buraya
  işle. ÖNEMLİ: yapmayı önerdiğin her şey önce PLANLANAN olarak yazılır, yönetici
  onaylayınca yapılacağa düşer. Tetikleyiciler: ${triggers}, "ne yapmam gerekiyor",
  "açık hatalar", "bunu plana ekle", "planı güncelle", "yapıldı işaretle",
  "changelog'a yaz", "takip paneli".
---

# ${project.name} — takip paneli

Bu skill ${project.name} projesinin takip paneline bağlanman için gereken her
şeyi taşır. Panel: ${mcpBase.replace(/\/$/, '')}

| | |
|---|---|
${facts
  .filter(([, value]) => value)
  .map(([key, value]) => `| ${key} | \`${value}\` |`)
  .join('\n')}

---

## 1 · Bağlan

Projenin kökündeki \`.mcp.json\` dosyasına ekle:

\`\`\`json
{
  "mcpServers": {
    "takip": {
      "url": "${endpoint}",
      "headers": { "Authorization": "Bearer ${config.token}" }
    }
  }
}
\`\`\`

> Bu token yalnızca **${project.name}** projesinin verisini açar, başka projeye
> erişmez. Yine de bir sırdır: \`.mcp.json\` dosyasını \`.gitignore\`'a ekle.
> Sızarsa panelin MCP sekmesinden "Anahtarı yenile" ile iptal edilir.

Bağlandığını doğrula: \`project_status\` çağır, projenin durumu dönmeli.

---

## 2 · Oturum açılışına bağlam koy

\`.claude/settings.json\` içine bu hook'u ekle; her oturum, ne yapman
gerektiğini bilerek başlar:

\`\`\`json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo '${project.name} takip paneline bağlısın. İşe başlamadan project_status ve list_bugs çağır. Yeni fikirleri add_plan ile PLANLANAN yaz — onaylanmadan yapma.'"
          }
        ]
      }
    ]
  }
}
\`\`\`

---

## 3 · Nasıl çalışırsın

\`\`\`
   sen önerirsin              yönetici onaylar           sen yaparsın
        │                            │                        │
   add_plan                     (panelden)              update_status
        ▼                            ▼                        ▼
   PLANLANAN  ──────────────►   YAPILACAK   ──────────────►  YAPILDI
   (iş değil)                   (iş budur)              (changelog'a düşer)
\`\`\`

**Üç kural:**

1. **Yapmayı düşündüğün hiçbir şeye doğrudan başlama.** Önce \`add_plan\` ile
   planlanan olarak yaz. Planlananlar iş listesine düşmez, onay bekler.
2. **İşe yalnızca \`list_bugs\`'ın döndürdüğü kayıtlardan başla.** Varsayılan
   \`status: "open"\`, yani onaylanmış iş. \`update_status\` zaten onaylanmamış
   bir kaydı kapatmayı reddeder.
3. **Kendi planını serbestçe yönet.** \`update_plan\` ile düzelt, \`delete_plan\`
   ile geri çek. Bu araçlar yalnızca onay bekleyen kayıtlara dokunur.

Onay yöneticinin kararıdır, panelden verilir.

---

## 4 · Tipik oturum

\`\`\`
project_status                          → nerede olduğunu gör
list_bugs { min_priority: "yuksek" }    → onaylanmış işe bak
get_bug { ref_no: 131 }                 → detayı + ilgili notlar
   … işi yap …
update_status { ref_no: 131, changelog_text: "…" }
add_note { body: "öğrendiğin şey", importance: "cok_onemli" }
log_time { minutes: 45, ref_no: 131 }
\`\`\`

Aklına başka bir şey geldiyse yapma, yaz:

\`\`\`
add_plan { items: [{ title: "…", description: "neden", priority: "yuksek" }] }
\`\`\`

---

## 5 · \`add_bug\` mı \`add_plan\` mı?

| Durum | Araç |
|---|---|
| Kullanıcı "şu bozuk" dedi | \`add_bug\` |
| Kodda bir hata gördün, bildiriyorsun | \`add_bug\` |
| "Şunu da yapsak iyi olur" — senin önerin | \`add_plan\` |
| Refactor, iyileştirme, teknik borç fikri | \`add_plan\` |

Emin değilsen \`add_plan\` — onay bir tık, yanlış başlanmış iş değil.

**\`type\` hangi listeye düşeceğini belirler:** \`bug\` → Yapılacaklar ana
listesinde \`HATA\` rozetiyle ve Hatalar süzgecinde; \`task\` → yalnızca ana
listede. Hataların ayrı kovası yok.

**Öncelik altı kademeli:** \`cok_onemli\` > \`kritik\` > \`yuksek\` > \`orta\` >
\`dusuk\` > \`istek\`.

---

## 6 · Bu projede açık araçlar

${enabled.map((tool) => `| \`${tool.name}\` | ${ACCESS_LABEL[tool.access]} | ${tool.description} |`).length > 0
  ? `| Araç | Erişim | Ne yapar |\n|---|---|---|\n${enabled
      .map((tool) => `| \`${tool.name}\` | ${ACCESS_LABEL[tool.access]} | ${tool.description} |`)
      .join('\n')}`
  : '_Hiçbir araç açık değil — panelin MCP sekmesinden aç._'}

${disabled.length > 0
  ? `**Kapalı:** ${disabled.map((tool) => `\`${tool.name}\``).join(', ')}. Bunlar sunucuya hiç kaydedilmez; çağırırsan "tool not found" alırsın.`
  : ''}

---

## 7 · Alışkanlıklar

- Oturuma \`project_status\` ile başla.
- Bir işe başlamadan \`get_bug\` ile detayına ve ilgili notlara bak.
- Bitirdiğinde \`update_status\` çağır; changelog kendiliğinden yazılır.
- Bir daha lazım olacak şeyi \`add_note\` ile bırak; kritikse
  \`importance: "cok_onemli"\`.
${can('log_time') ? '- Uzun süren işlerde `log_time` ile süreyi işle.\n' : ''}- Her çağrın panelin "yapay zeka hareketleri" günlüğüne düşer.

---

_Bu dosya ${project.name} için panelden üretildi. Araç listesi ve token o anki
ayarları yansıtır; MCP ayarlarını değiştirdiysen yeniden indir._
`;
}
