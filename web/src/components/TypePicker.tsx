import { useState } from 'react';
import type { ItemType } from '@takip/shared';

const LABELS: Record<ItemType, string> = { task: 'Özellik', bug: 'Hata' };
const LISTS: Record<ItemType, string> = { task: 'Yapılacaklar', bug: 'Hatalar' };

/**
 * Ekleme kutusunun yanındaki tür seçimi. Seçilen tür maddenin hangi listeye
 * düşeceğini belirler — hata seçilince kayıt Hatalar sekmesine gider.
 */
export function useTypePicker(initial: ItemType) {
  const [type, setType] = useState<ItemType>(initial);
  const [landed, setLanded] = useState<ItemType | null>(null);

  return {
    type,
    setType,
    /** Ekleme sonrası "nereye düştü" bilgisi; farklı listeye gittiyse gösterilir. */
    landed,
    noteLanding: (added: ItemType) => {
      if (added === initial) {
        setLanded(null);
        return;
      }
      setLanded(added);
      window.setTimeout(() => setLanded((current) => (current === added ? null : current)), 4000);
    },
    reset: () => setType(initial),
  };
}

export function TypePicker({
  value,
  onChange,
  landed,
}: {
  value: ItemType;
  onChange: (type: ItemType) => void;
  landed?: ItemType | null;
}) {
  return (
    <div className="type-picker">
      {(['task', 'bug'] as ItemType[]).map((option) => (
        <button
          key={option}
          type="button"
          className={`type-chip ${value === option ? `type-chip--on type-chip--${option}` : ''}`}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
        >
          {LABELS[option]}
        </button>
      ))}
      {landed && <span className="type-picker__note">→ {LISTS[landed]} sekmesine eklendi</span>}
    </div>
  );
}
