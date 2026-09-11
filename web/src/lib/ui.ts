import { useCallback, useState } from 'react';
import type { ChangeKind, NoteImportance, Priority, ProjectStatus } from '@takip/shared';

/** Durum rozeti: anlam metinle verilir, sınıf yalnız opaklık kademesini seçer. */
export const STATUS_PILL: Record<ProjectStatus, string> = {
  teklif: 'pill--status-teklif',
  gelistirme: 'pill--status-gelistirme',
  test: 'pill--status-test',
  canli: 'pill--status-canli',
  beklemede: 'pill--status-beklemede',
  arsiv: 'pill--status-arsiv',
};

/** Öncelik rozeti: kritik ve çok önemli Coral, gerisi Paper opaklıkları. */
export const PRIORITY_PILL: Record<Priority, string> = {
  cok_onemli: 'pill--p-cok_onemli',
  kritik: 'pill--p-kritik',
  yuksek: 'pill--p-yuksek',
  orta: 'pill--p-orta',
  dusuk: 'pill--p-dusuk',
  istek: 'pill--p-istek',
};

export const NOTE_IMPORTANCE_PILL: Record<NoteImportance, string> = {
  cok_onemli: 'pill--imp-cok_onemli',
  normal: 'pill--imp-normal',
  az_onemli: 'pill--imp-az_onemli',
};

export const CHANGE_KIND_CLASS: Record<ChangeKind, string> = {
  fix: 'entry__kind--fix',
  new: 'entry__kind--new',
  improve: 'entry__kind--improve',
  removed: 'entry__kind--removed',
};

/** Panoya kopyalar ve kısa süreli "kopyalandı" durumu döndürür. */
export function useCopy(): { copied: string | null; copy: (text: string, key?: string) => void } {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = useCallback((text: string, key = text) => {
    const done = () => {
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 1400);
    };

    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text).then(done).catch(() => undefined);
      return;
    }

    // Güvenli bağlam dışında (http) clipboard API'si yok — eski yöntem.
    const helper = document.createElement('textarea');
    helper.value = text;
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    try {
      document.execCommand('copy');
      done();
    } finally {
      document.body.removeChild(helper);
    }
  }, []);

  return { copied, copy };
}

export function maskSecret(secret: string): string {
  return '•'.repeat(Math.min(Math.max(secret.length, 8), 14));
}

/** MEB tokenı gibi uzun süredir dokunulmamış kayıtları işaretler. */
export function isStale(iso: string, months = 6): boolean {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return false;
  return Date.now() - then > months * 30 * 24 * 60 * 60 * 1000;
}
