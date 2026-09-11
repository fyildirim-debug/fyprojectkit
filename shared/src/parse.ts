import type { ChangeKind, ItemType, Priority } from './types.js';
import { PRIORITIES } from './types.js';

/** ⌘K satırından ve ayrıştırıcıdan çıkan ortak taslak madde. */
export interface DraftItem {
  title: string;
  type: ItemType | 'note';
  priority: Priority;
  tag: string;
  selected: boolean;
}

const PRIORITY_ALIASES: Record<string, Priority> = {
  cokonemli: 'cok_onemli',
  çokönemli: 'cok_onemli',
  cok_onemli: 'cok_onemli',
  cok: 'cok_onemli',
  çok: 'cok_onemli',
  kritik: 'kritik',
  critical: 'kritik',
  acil: 'kritik',
  yuksek: 'yuksek',
  yüksek: 'yuksek',
  high: 'yuksek',
  orta: 'orta',
  medium: 'orta',
  dusuk: 'dusuk',
  düşük: 'dusuk',
  low: 'dusuk',
  istek: 'istek',
  feature: 'istek',
};

/**
 * Hızlı ekleme satırını ayrıştırır: `!kritik` önceliği, `#etiket` etiketi belirler
 * ve ikisi de başlıktan çıkarılır.
 */
export function parseQuickAdd(raw: string): {
  title: string;
  priority: Priority | null;
  tag: string | null;
} {
  let priority: Priority | null = null;
  let tag: string | null = null;

  const title = raw
    .replace(/(^|\s)!([\p{L}]+)/gu, (match, lead: string, word: string) => {
      const hit = PRIORITY_ALIASES[word.toLocaleLowerCase('tr')];
      if (!hit) return match;
      priority = hit;
      return lead;
    })
    .replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, (_match, lead: string, word: string) => {
      tag = word.toLocaleLowerCase('tr');
      return lead;
    })
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { title, priority, tag };
}

/** Ayrıştırma ekranındaki üç mod: satır satır, madde imi, cümle. */
export type SplitMode = 'line' | 'bullet' | 'sentence';

const BULLET = /^\s*(?:[-*•·–—]|\d+[.)])\s+/;

function splitRaw(text: string, mode: SplitMode): string[] {
  if (mode === 'sentence') {
    return text
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?…])\s+/)
      .map((s) => s.trim());
  }
  const lines = text.split(/\r?\n/);
  if (mode === 'bullet') {
    return lines.filter((line) => BULLET.test(line)).map((line) => line.replace(BULLET, '').trim());
  }
  return lines.map((line) => line.replace(BULLET, '').trim());
}

/** Selamlama, imza ve "birkaç şey var:" gibi taşıyıcı cümleleri madde saymayız. */
const NOISE =
  /^(merhaba|selam|iyi (günler|akşamlar|çalışmalar)|kolay gelsin|teşekkürler|sağ ol|saygılar|hocam)\b|(\bşey var\b|\bşunlar var\b|:\s*$)/i;

/**
 * Türkçe eklerle çalışan gövde eşleştirmesi. `\b` kullanılamaz: hem Türkçe
 * sondan eklemeli ("sözleşme" → "sözleşmeyi"), hem de ı/ö/ş/ğ/ü/ç JavaScript
 * regex'inde kelime karakteri sayılmadığı için sınırlar yanlış yerde oluşur.
 * Bu yüzden yalnızca gövdenin başı kelime başlangıcına sabitlenir.
 */
function hasStem(text: string, stems: string[]): boolean {
  return stems.some((stem) => {
    const index = text.indexOf(stem);
    if (index === -1) return false;
    // Gövde ya cümlenin başında ya da bir boşluk/noktalama sonrasında olmalı.
    return index === 0 || /[\s(,.;:'"«»\-–—/]/.test(text[index - 1]);
  });
}

const BUG_STEMS = [
  'hata', 'bug', 'çalışmıyor', 'calismiyor', 'patlı', 'bozuk', 'taşı', 'tasi',
  'kaybol', 'gitmiyor', 'dönüyor', 'donuyor', 'sorun', 'yanlış', 'yanlis',
  'kaydolmu', 'kaydetmi', 'görünmü', 'gorunmu', 'yavaş', 'yavas', 'açılmı',
  'acilmi', 'veriyor', 'düşü', 'dusu', 'çöküyor', 'cokuyor', '500', '404',
];

const TASK_STEMS = [
  'eklen', 'ekle', 'olsa', 'olsun', 'ister', 'yapıl', 'yapil', 'lazım', 'lazim',
  'gerek', 'güncelle', 'guncelle', 'yeni', 'destek', 'entegrasyon', 'olmalı',
  'olmali', 'geçir', 'gecir', 'taşın', 'tasin',
];

const NOTE_STEMS = [
  'sözleşme', 'sozlesme', 'görüşme', 'gorusme', 'konuştuk', 'konustuk',
  'hatırlat', 'hatirlat', 'fatura', 'ödeme', 'odeme', 'toplantı', 'toplanti',
  'karar ', 'anlaş', 'anlas', 'teklif',
];

const CRITICAL_STEMS = ['tc ', 'kimlik', 'giriş', 'giris', 'güvenlik', 'guvenlik', 'veri kaybı'];
const HIGH_STEMS = ['iki kere', 'çift', 'cift', 'sms', 'bildirim', 'mail', 'e-posta', '500'];
const LOW_STEMS = ['logo', 'renk', 'yazı tipi', 'imla', 'görsel', 'gorsel', 'metin', 'başlık', 'baslik'];

function classify(sentence: string): { type: ItemType | 'note'; priority: Priority } {
  const text = sentence.toLocaleLowerCase('tr');

  const looksLikeBug = hasStem(text, BUG_STEMS);
  const looksLikeTask = hasStem(text, TASK_STEMS);

  // Sözleşme, fatura, görüşme gibi konular iş kaydı değil not olarak durur —
  // aynı cümlede bir arıza tarifi yoksa.
  if (hasStem(text, NOTE_STEMS) && !looksLikeBug) {
    return { type: 'note', priority: 'dusuk' };
  }

  // "… yok" tek başına eksik özellik anlatır: hata değil, iş.
  const missingFeature = /\byok\b\s*$/.test(text) || text.endsWith(' yok');
  const type: ItemType = looksLikeBug ? 'bug' : looksLikeTask || missingFeature ? 'task' : 'bug';

  if (type === 'task') {
    if (hasStem(text, LOW_STEMS)) return { type, priority: 'dusuk' };
    return { type, priority: missingFeature ? 'orta' : 'istek' };
  }
  if (hasStem(text, CRITICAL_STEMS)) return { type, priority: 'kritik' };
  if (hasStem(text, HIGH_STEMS)) return { type, priority: 'yuksek' };
  if (hasStem(text, LOW_STEMS)) return { type, priority: 'dusuk' };
  return { type, priority: 'orta' };
}

/** İlk harfi büyütür, sonundaki noktalama artığını temizler. */
function tidy(sentence: string): string {
  const trimmed = sentence.replace(/\s*[,;]\s*$/, '').trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toLocaleUpperCase('tr') + trimmed.slice(1);
}

/**
 * Yapıştırılan uzun metni maddelere böler ve her maddeye tür + öncelik önerir.
 * Not olarak sınıflanan maddeler seçili gelmez — kullanıcı bilerek işaretler.
 */
export function parsePastedText(text: string, mode: SplitMode = 'line'): DraftItem[] {
  const seen = new Set<string>();

  return splitRaw(text, mode)
    .map((line) => line.trim())
    .filter((line) => line.length >= 8 && !NOISE.test(line))
    .map((line) => {
      const { title: stripped, priority, tag } = parseQuickAdd(line);
      const guess = classify(stripped);
      return {
        title: tidy(stripped),
        type: guess.type,
        priority: priority ?? guess.priority,
        tag: tag ?? '',
        selected: guess.type !== 'note',
      };
    })
    .filter((draft) => {
      const key = draft.title.toLocaleLowerCase('tr');
      if (!draft.title || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Kapanan bir madde changelog'a düşerken hangi başlık altına gireceğini belirler. */
export function changeKindForItem(type: ItemType, priority: Priority, title: string): ChangeKind {
  if (/\b(kaldır|kaldir|sil|devre dışı|devre disi|emekli)\b/i.test(title)) return 'removed';
  if (type === 'task') return priority === 'istek' ? 'new' : 'improve';
  return 'fix';
}

export function isPriority(value: string): value is Priority {
  return (PRIORITIES as readonly string[]).includes(value);
}
