import { useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  PRIORITY_LABELS,
  PRIORITY_WEIGHT,
  parseQuickAdd,
  relativeTime,
  type ItemStatus,
  type Project,
} from '@takip/shared';
import { useStore } from '../../lib/store';
import { PRIORITY_PILL } from '../../lib/ui';
import { ItemActions, ItemEditor } from '../ItemEditor';
import { ItemDetail } from '../ItemDetail';
import { TypePicker, useTypePicker } from '../TypePicker';

type Filter = 'planned' | 'open' | 'done' | 'all';

/**
 * Süzgeç adreste durur (`?durum=planlanan`): Genel'deki pano doğrudan doğru
 * süzgece götürebilsin, geri tuşu ve yer imi de çalışsın diye.
 */
const FILTER_SLUGS: Record<Filter, string> = {
  planned: 'planlanan',
  open: 'yapilacak',
  done: 'yapildi',
  all: 'tumu',
};

const FILTER_BY_SLUG: Record<string, Filter> = Object.fromEntries(
  Object.entries(FILTER_SLUGS).map(([filter, slug]) => [slug, filter as Filter]),
) as Record<string, Filter>;

/** Listede planlananlar üstte, sonra açıklar, en altta yapılmışlar. */
const STATUS_ORDER: Record<ItemStatus, number> = { planned: 0, open: 1, done: 2 };

/**
 * 04 — Hata / yapılacak listesi. Kutucuğu işaretlemek maddeyi kapatır ve
 * açık taslak sürümün changelog'una düşürür.
 */
/**
 * Hata ve yapılacak listesi tek bileşen. `scope` neyi gösterdiğini söyler:
 * `all` ana listedir — hata olarak işaretlenenler de burada durur; `bug` ise
 * aynı listenin hatalara süzülmüş hâli. Hataların ayrı bir kovası yok.
 */
export function ItemsTab({ project, scope }: { project: Project; scope: 'all' | 'bug' }) {
  const { items, closeItem, reopenItem, deleteItem, approveItem, unapproveItem } = useStore();
  const [params, setParams] = useSearchParams();
  const filter = FILTER_BY_SLUG[params.get('durum') ?? ''] ?? 'open';

  const setFilter = (next: Filter) => {
    const nextParams = new URLSearchParams(params);
    if (next === 'open') nextParams.delete('durum');
    else nextParams.set('durum', FILTER_SLUGS[next]);
    setParams(nextParams, { replace: true });
  };
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const picker = useTypePicker(scope === 'bug' ? 'bug' : 'task');
  const { addItem } = useStore();

  const scoped = useMemo(
    () =>
      items
        .filter((item) => item.projectId === project.id)
        .filter((item) => (scope === 'bug' ? item.type === 'bug' : true)),
    [items, project.id, scope],
  );

  const visible = useMemo(
    () =>
      scoped
        .filter((item) => (filter === 'all' ? true : item.status === filter))
        .sort((a, b) => {
          if (a.status !== b.status) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
          return (
            PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] ||
            b.createdAt.localeCompare(a.createdAt)
          );
        }),
    [scoped, filter],
  );

  const plannedCount = scoped.filter((item) => item.status === 'planned').length;
  const openCount = scoped.filter((item) => item.status === 'open').length;
  const doneCount = scoped.filter((item) => item.status === 'done').length;
  const noun = scope === 'bug' ? 'hata' : 'iş';

  async function approve(itemId: string, planned: boolean) {
    setBusy(itemId);
    try {
      if (planned) await approveItem(itemId);
      else await unapproveItem(itemId);
    } finally {
      setBusy(null);
    }
  }

  async function toggle(itemId: string, done: boolean) {
    setBusy(itemId);
    try {
      if (done) await reopenItem(itemId);
      else await closeItem(itemId);
    } finally {
      setBusy(null);
    }
  }

  async function remove(itemId: string) {
    setBusy(itemId);
    try {
      if (editing === itemId) setEditing(null);
      await deleteItem(itemId);
    } finally {
      setBusy(null);
    }
  }

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    const parsed = parseQuickAdd(draft);
    if (!parsed.title) return;
    setBusy('new');
    try {
      await addItem({
        projectId: project.id,
        title: parsed.title,
        type: picker.type,
        priority: parsed.priority ?? (picker.type === 'task' ? 'istek' : 'orta'),
        tag: parsed.tag ?? '',
      });
      picker.noteLanding(picker.type);
      setDraft('');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="subbar">
        <span className="topbar__crumb">{project.name} /</span>
        <span className="topbar__title">{scope === 'bug' ? 'Hatalar' : 'Yapılacaklar'}</span>
        <div className="segmented">
          <button
            type="button"
            aria-pressed={filter === 'planned'}
            title="Yapay zekanın önerdiği, onay bekleyen kayıtlar"
            onClick={() => setFilter('planned')}
          >
            PLANLANAN {plannedCount}
          </button>
          <button type="button" aria-pressed={filter === 'open'} onClick={() => setFilter('open')}>
            YAPILACAK {openCount}
          </button>
          <button type="button" aria-pressed={filter === 'done'} onClick={() => setFilter('done')}>
            YAPILDI {doneCount}
          </button>
          <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            TÜMÜ
          </button>
        </div>
      </div>

      <div className="grid-table">
        <div className="grid-table__head items-grid col-head">
          <span />
          <span>BAŞLIK</span>
          <span>ÖNCELİK</span>
          <span>BİLDİREN</span>
          <span>ETİKET</span>
          <span>TARİH</span>
          <span />
        </div>
      </div>

      <div className="scroll">
        <div className="grid-table">
          {visible.map((item) => {
            const done = item.status === 'done';

            if (editing === item.id) {
              return (
                <div key={item.id} className="grid-table__row">
                  <ItemEditor item={item} onClose={() => setEditing(null)} />
                </div>
              );
            }

            const planned = item.status === 'planned';

            return (
              <div
                key={item.id}
                className={`grid-table__row items-grid ${done ? 'grid-table__row--done' : ''} ${
                  planned ? 'grid-table__row--planned' : ''
                }`}
              >
                {planned ? (
                  // Planlanan kapatılamaz — önce onaylanır.
                  <button
                    type="button"
                    className="checkbox checkbox--plan"
                    disabled={busy === item.id}
                    title="Onayla — yapılacak listesine geçsin"
                    onClick={() => void approve(item.id, true)}
                  >
                    ⌛
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`checkbox ${done ? 'checkbox--on' : ''}`}
                    disabled={busy === item.id}
                    title={done ? 'Yeniden aç' : 'Yapıldı işaretle'}
                    onClick={() => void toggle(item.id, done)}
                  >
                    ✓
                  </button>
                )}

                <div className="cell-stack">
                  <button
                    type="button"
                    className={`item-title item-title--link ${done ? 'item-title--done' : ''}`}
                    onClick={() => setDetail(item.id)}
                  >
                    {planned && <span className="plan-badge">PLAN</span>}
                    {scope === 'all' && item.type === 'bug' && (
                      <span className="bug-badge">HATA</span>
                    )}
                    {item.title}
                  </button>
                  {done && item.releaseVersion ? (
                    <span className="item-shipped">→ changelog {item.releaseVersion}'a eklendi</span>
                  ) : (
                    item.description && <span className="item-desc">{item.description}</span>
                  )}
                </div>

                <span className={`pill ${PRIORITY_PILL[item.priority]}`} style={{ justifySelf: 'start' }}>
                  {PRIORITY_LABELS[item.priority].toLocaleUpperCase('tr')}
                </span>

                <span className="cell-muted">{item.reporter}</span>

                {item.tag ? (
                  <span className="tag" style={{ justifySelf: 'start' }}>
                    {item.tag}
                  </span>
                ) : (
                  <span />
                )}

                <span className="row__time">{relativeTime(done ? item.doneAt : item.createdAt)}</span>

                <ItemActions
                  disabled={busy === item.id}
                  approve={
                    planned
                      ? { label: 'ONAYLA', onClick: () => void approve(item.id, true) }
                      : item.status === 'open'
                        ? { label: 'PLANA AL', onClick: () => void approve(item.id, false) }
                        : undefined
                  }
                  onEdit={() => setEditing(item.id)}
                  onDelete={() => void remove(item.id)}
                />
              </div>
            );
          })}

          {visible.length === 0 && (
            <div className="empty">
              {filter === 'open' ? `Açık ${noun} yok.` : `Kayıt yok.`}
            </div>
          )}
        </div>
      </div>

      <form className="composer" onSubmit={onAdd}>
        <input
          value={draft}
          placeholder={`Yeni ${noun} yaz — !kritik ve #etiket yazabilirsin`}
          onChange={(event) => setDraft(event.target.value)}
        />
        <TypePicker value={picker.type} onChange={picker.setType} landed={picker.landed} />
        <button type="submit" className="btn btn--primary" disabled={busy === 'new' || !draft.trim()}>
          Ekle
        </button>
      </form>

      {detail && <ItemDetail itemId={detail} onClose={() => setDetail(null)} />}
    </>
  );
}
