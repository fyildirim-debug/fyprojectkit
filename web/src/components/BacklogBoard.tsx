import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PRIORITY_LABELS, PRIORITY_WEIGHT, relativeTime, type Item, type Project } from '@takip/shared';
import { useStore } from '../lib/store';
import { ItemDetail } from './ItemDetail';

/** Bir sütunun neyi topladığı — dördü birlikte projeyi çakışmasız böler. */
interface Column {
  key: string;
  label: string;
  /** Sütuna tıklandığında gidilecek adres — süzgeç de taşınır. */
  href: string;
  match: (item: Item) => boolean;
  empty: string;
}

const COLUMNS: Column[] = [
  {
    key: 'planned',
    label: 'PLANLANAN',
    href: 'yapilacaklar?durum=planlanan',
    match: (item) => item.status === 'planned',
    empty: 'Onay bekleyen yok',
  },
  {
    key: 'todo',
    label: 'YAPILACAK',
    href: 'yapilacaklar?durum=yapilacak',
    match: (item) => item.status === 'open',
    empty: 'Açık iş yok',
  },
  {
    key: 'done',
    label: 'YAPILDI',
    href: 'yapilacaklar?durum=yapildi',
    match: (item) => item.status === 'done',
    empty: 'Henüz kapanan yok',
  },
];

const SHOWN = 8;

/**
 * Genel sekmesindeki backlog panosu. Üç sütun projenin bütün maddelerini
 * çakışmadan böler: onay bekleyenler, açık işler, kapananlar. Hata olarak
 * işaretliler rozetle ayrışır — ayrı sütunları yok, aksi hâlde aynı kayıt
 * iki sütunda birden sayılırdı.
 */
export function BacklogBoard({ project }: { project: Project }) {
  const { items } = useStore();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<string | null>(null);

  const openBugs = useMemo(
    () =>
      items.filter(
        (item) => item.projectId === project.id && item.status === 'open' && item.type === 'bug',
      ).length,
    [items, project.id],
  );

  const columns = useMemo(() => {
    const mine = items.filter((item) => item.projectId === project.id);
    return COLUMNS.map((column) => {
      const matched = mine.filter(column.match).sort((a, b) => {
        // Kapananlarda en yeni önce; açıklarda önce önem, sonra yenilik.
        if (column.key === 'done') {
          return (b.doneAt ?? b.createdAt).localeCompare(a.doneAt ?? a.createdAt);
        }
        return (
          PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] ||
          b.createdAt.localeCompare(a.createdAt)
        );
      });
      return { ...column, items: matched.slice(0, SHOWN), total: matched.length };
    });
  }, [items, project.id]);

  return (
    <section className="panel">
      <div className="panel__head">
        <span className="panel__title">Backlog</span>
        <span className="panel__meta">
          {columns[0].total} planlanan · {columns[1].total} açık ({openBugs} hata) ·{' '}
          {columns[2].total} yapıldı
        </span>
      </div>

      <div className="board">
        {columns.map((column) => (
          <div className="board__col" key={column.key}>
            <button
              type="button"
              className={`board__head board__head--${column.key}`}
              onClick={() => navigate(`/proje/${project.slug}/${column.href}`)}
            >
              {column.label}
              <span className="board__count">{column.total}</span>
            </button>

            <div className="board__list">
              {column.items.map((item) => (
                <button
                  type="button"
                  className="board__item"
                  key={item.id}
                  title={`${PRIORITY_LABELS[item.priority]} · ${relativeTime(
                    item.doneAt ?? item.createdAt,
                  )}`}
                  onClick={() => setDetail(item.id)}
                >
                  <i className={`board__dot board__dot--${item.priority}`} />
                  <span className="board__title">
                    {item.type === 'bug' && <span className="bug-badge">HATA</span>}
                    {item.title}
                  </span>
                  <span className="board__ref">#{item.refNo}</span>
                </button>
              ))}

              {column.total === 0 && <span className="board__empty">{column.empty}</span>}

              {column.total > SHOWN && (
                <button
                  type="button"
                  className="board__more"
                  onClick={() => navigate(`/proje/${project.slug}/${column.href}`)}
                >
                  +{column.total - SHOWN} daha
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {detail && <ItemDetail itemId={detail} onClose={() => setDetail(null)} />}
    </section>
  );
}
