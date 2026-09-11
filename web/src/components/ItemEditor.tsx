import { useState, type FormEvent } from 'react';
import { PRIORITIES, PRIORITY_LABELS, type Item, type Priority } from '@takip/shared';
import { useStore } from '../lib/store';

/**
 * Satır içi madde düzenleme. Hata listesi (proje detayı) ve açık hatalar
 * ekranı aynı formu kullanır — alanlar `Item`'ın elle girilen kısmıdır.
 */
export function ItemEditor({ item, onClose }: { item: Item; onClose: () => void }) {
  const { updateItem } = useStore();
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description);
  const [priority, setPriority] = useState<Priority>(item.priority);
  const [reporter, setReporter] = useState(item.reporter);
  const [tag, setTag] = useState(item.tag);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await updateItem(item.id, {
        title: trimmed,
        description: description.trim(),
        priority,
        reporter: reporter.trim(),
        tag: tag.trim().replace(/^#/, ''),
      });
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="item-edit" onSubmit={onSubmit}>
      <input
        className="item-edit__title"
        value={title}
        autoFocus
        placeholder="Başlık"
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => event.key === 'Escape' && onClose()}
      />
      <input
        className="item-edit__desc"
        value={description}
        placeholder="Açıklama (isteğe bağlı)"
        onChange={(event) => setDescription(event.target.value)}
        onKeyDown={(event) => event.key === 'Escape' && onClose()}
      />

      <div className="item-edit__meta">
        <select value={priority} onChange={(event) => setPriority(event.target.value as Priority)}>
          {PRIORITIES.map((value) => (
            <option key={value} value={value}>
              {PRIORITY_LABELS[value]}
            </option>
          ))}
        </select>
        <input
          value={reporter}
          placeholder="Bildiren"
          onChange={(event) => setReporter(event.target.value)}
          onKeyDown={(event) => event.key === 'Escape' && onClose()}
        />
        <input
          value={tag}
          placeholder="Etiket"
          onChange={(event) => setTag(event.target.value)}
          onKeyDown={(event) => event.key === 'Escape' && onClose()}
        />

        <div className="item-edit__actions">
          <button type="button" className="icon-btn" onClick={onClose}>
            VAZGEÇ
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy || !title.trim()}>
            Kaydet
          </button>
        </div>
      </div>
    </form>
  );
}

/**
 * Satır sonundaki düzenle/sil düğmeleri. Silme iki tıklamalıdır — ilk tıklama
 * düğmeyi "EMİN?" haline getirir, ikincisi siler. Geri alma yok.
 */
export function ItemActions({
  onEdit,
  onDelete,
  approve,
  disabled = false,
}: {
  onEdit: () => void;
  onDelete: () => void;
  /** Planlananı onaylama ya da açığı plana geri alma — listeye göre değişir. */
  approve?: { label: string; onClick: () => void };
  disabled?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="item-actions">
      {approve && (
        <button
          type="button"
          className="icon-btn icon-btn--approve"
          disabled={disabled}
          onClick={approve.onClick}
        >
          {approve.label}
        </button>
      )}
      <button type="button" className="icon-btn" disabled={disabled} onClick={onEdit}>
        DÜZENLE
      </button>
      <button
        type="button"
        className={`icon-btn ${confirming ? 'icon-btn--danger' : ''}`}
        disabled={disabled}
        title={confirming ? 'Kalıcı olarak siler' : 'Sil'}
        onBlur={() => setConfirming(false)}
        onClick={() => {
          if (!confirming) {
            setConfirming(true);
            return;
          }
          setConfirming(false);
          onDelete();
        }}
      >
        {confirming ? 'EMİN?' : 'SİL'}
      </button>
    </div>
  );
}
