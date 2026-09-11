import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ITEM_STATUS_LABELS,
  PRIORITY_LABELS,
  formatDate,
  relativeTime,
  type Item,
} from '@takip/shared';
import { useStore } from '../lib/store';
import { PRIORITY_PILL } from '../lib/ui';
import { ItemEditor } from './ItemEditor';

const STATUS_PILL: Record<Item['status'], string> = {
  planned: 'pill--accent',
  open: 'pill--neutral',
  done: 'pill--green',
};

/**
 * Bir maddenin detay penceresi. Listede satıra tıklanınca açılır: açıklama,
 * ilgili notlar ve maddeye yapılabilecek her şey tek yerde. Esc ya da dışarı
 * tıklamak kapatır.
 */
export function ItemDetail({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const { items, notes, closeItem, reopenItem, deleteItem, approveItem, unapproveItem } = useStore();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const item = items.find((entry) => entry.id === itemId) ?? null;

  // İlgili notlar: başlıktaki anlamlı kelimeleri içerenler — MCP'deki get_bug
  // ile aynı mantık, aynı yerden bakılsın diye.
  const related = useMemo(() => {
    if (!item) return [];
    const words = item.title
      .toLocaleLowerCase('tr')
      .split(/\s+/)
      .filter((word) => word.length > 4);
    if (words.length === 0) return [];
    return notes
      .filter((note) => note.projectId === item.projectId)
      .filter((note) => words.some((word) => note.body.toLocaleLowerCase('tr').includes(word)))
      .slice(0, 4);
  }, [item, notes]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Madde silinince (ya da başka sekmeden kaybolunca) pencere kendini kapatır.
  useEffect(() => {
    if (!item) onClose();
  }, [item, onClose]);

  if (!item) return null;

  const planned = item.status === 'planned';
  const done = item.status === 'done';

  const run = async (work: Promise<unknown>, close = false) => {
    setBusy(true);
    try {
      await work;
      if (close) onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="palette item-detail"
        role="dialog"
        aria-label={`#${item.refNo} ${item.title}`}
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={(event) => event.key === 'Escape' && onClose()}
      >
        <div className="palette__input item-detail__head">
          <span className="item-detail__ref">#{item.refNo}</span>
          <span className={`pill ${STATUS_PILL[item.status]}`}>
            {ITEM_STATUS_LABELS[item.status].toLocaleUpperCase('tr')}
          </span>
          <span className={`pill ${PRIORITY_PILL[item.priority]}`}>
            {PRIORITY_LABELS[item.priority].toLocaleUpperCase('tr')}
          </span>
          <span className="item-detail__type">{item.type === 'bug' ? 'hata' : 'özellik'}</span>
          <span className="palette__esc">ESC</span>
        </div>

        <div className="item-detail__body">
          {editing ? (
            <ItemEditor item={item} onClose={() => setEditing(false)} />
          ) : (
            <>
              <h2 className="item-detail__title">{item.title}</h2>

              {item.description ? (
                <p className="item-detail__desc">{item.description}</p>
              ) : (
                <p className="item-detail__desc item-detail__desc--empty">
                  Açıklama yok — Düzenle'ye basıp ekleyebilirsin.
                </p>
              )}

              <div className="item-detail__facts">
                <div className="kv">
                  <span>Bildiren</span>
                  <span>{item.reporter || '—'}</span>
                </div>
                <div className="kv">
                  <span>Etiket</span>
                  <span>{item.tag ? `#${item.tag}` : '—'}</span>
                </div>
                <div className="kv">
                  <span>Açılış</span>
                  <span>
                    {formatDate(item.createdAt)} · {relativeTime(item.createdAt)}
                  </span>
                </div>
                {done && (
                  <div className="kv">
                    <span>Kapanış</span>
                    <span>
                      {item.doneAt ? `${formatDate(item.doneAt)} · ${relativeTime(item.doneAt)}` : '—'}
                    </span>
                  </div>
                )}
                {item.releaseVersion && (
                  <div className="kv">
                    <span>Sürüm</span>
                    <span>{item.releaseVersion}</span>
                  </div>
                )}
              </div>

              {related.length > 0 && (
                <div className="item-detail__notes">
                  <span className="eyebrow">İLGİLİ NOTLAR</span>
                  {related.map((note) => (
                    <p key={note.id}>{note.body}</p>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {!editing && (
          <div className="item-detail__foot">
            {planned ? (
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => void run(approveItem(item.id))}
              >
                Onayla
              </button>
            ) : done ? (
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => void run(reopenItem(item.id))}
              >
                Yeniden aç
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={busy}
                  onClick={() => void run(closeItem(item.id))}
                >
                  Yapıldı işaretle
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() => void run(unapproveItem(item.id))}
                >
                  Plana al
                </button>
              </>
            )}

            <button type="button" className="btn" disabled={busy} onClick={() => setEditing(true)}>
              Düzenle
            </button>

            <button
              type="button"
              className={`btn push-right ${confirming ? 'btn--danger' : ''}`}
              disabled={busy}
              onBlur={() => setConfirming(false)}
              onClick={() => {
                if (!confirming) {
                  setConfirming(true);
                  return;
                }
                setConfirming(false);
                void run(deleteItem(item.id), true);
              }}
            >
              {confirming ? 'Emin misin?' : 'Sil'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
