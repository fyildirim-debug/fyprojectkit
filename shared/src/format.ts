/** Tasarımdaki metin biçimleri — "2s önce", "32s 10d", "18 AĞU". */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const MONTHS_SHORT = [
  'OCA',
  'ŞUB',
  'MAR',
  'NİS',
  'MAY',
  'HAZ',
  'TEM',
  'AĞU',
  'EYL',
  'EKİ',
  'KAS',
  'ARA',
];

/** "şimdi" · "6d önce" · "2s önce" · "dün" · "3 gün" · "3 hafta" · "2 ay" */
export function relativeTime(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';

  const diff = now.getTime() - then;
  if (diff < MINUTE) return 'şimdi';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}d önce`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}s önce`;

  const days = Math.floor(diff / DAY);
  if (days === 1) return 'dün';
  if (days < 7) return `${days} gün`;
  if (days < 30) return `${Math.floor(days / 7)} hafta`;
  if (days < 365) return `${Math.floor(days / 30)} ay`;
  return `${Math.floor(days / 365)} yıl`;
}

/** Dakikayı "32s 10d" biçimine çevirir. */
export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${hours}s ${String(rest).padStart(2, '0')}d`;
}

/** Saniyeyi kronometre biçimine çevirir: "01:42:18". */
export function formatStopwatch(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return [h, m, s].map((part) => String(part).padStart(2, '0')).join(':');
}

/** "25.08.2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return [
    String(date.getDate()).padStart(2, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    date.getFullYear(),
  ].join('.');
}

/** "18 AĞU" — not kartlarındaki kısa biçim. */
export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}`;
}

export function startOfWeek(now: Date = new Date()): Date {
  const date = new Date(now);
  // Pazartesi haftanın ilk günü.
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}
