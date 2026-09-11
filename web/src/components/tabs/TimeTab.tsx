import { useMemo } from 'react';
import { formatDate, formatDuration, startOfWeek, type Project } from '@takip/shared';
import { useStore } from '../../lib/store';

/** Zaman sekmesi — proje bazlı süre kayıtları ve haftalık dağılım. */
export function TimeTab({ project }: { project: Project }) {
  const { timeEntries, items } = useStore();

  const mine = useMemo(
    () =>
      timeEntries
        .filter((entry) => entry.projectId === project.id)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    [timeEntries, project.id],
  );

  const total = mine.reduce((sum, entry) => sum + entry.minutes, 0);
  const weekStart = startOfWeek().getTime();
  const thisWeek = mine
    .filter((entry) => new Date(entry.startedAt).getTime() >= weekStart)
    .reduce((sum, entry) => sum + entry.minutes, 0);

  const itemTitles = useMemo(() => new Map(items.map((item) => [item.id, item.title])), [items]);
  const longest = Math.max(...mine.map((entry) => entry.minutes), 1);

  return (
    <div className="detail">
      <div className="detail__main">
        <section className="panel">
          <div className="panel__head">
            <span className="panel__title">Süre</span>
            <span className="panel__meta">{mine.length} kayıt</span>
          </div>

          <div className="stat-row">
            <div className="stat">
              <span className="stat__label">TOPLAM</span>
              <span className="stat__value">{formatDuration(total)}</span>
            </div>
            <div className="stat">
              <span className="stat__label">BU HAFTA</span>
              <span className="stat__value">{formatDuration(thisWeek)}</span>
            </div>
            <div className="stat">
              <span className="stat__label">ORTALAMA OTURUM</span>
              <span className="stat__value">
                {formatDuration(mine.length ? total / mine.length : 0)}
              </span>
            </div>
          </div>
        </section>

        <section className="panel" style={{ flex: 1 }}>
          <div className="panel__head">
            <span className="panel__title">Kayıtlar</span>
            <span className="panel__meta">başlıktaki kronometre buraya yazar</span>
          </div>

          <div className="time-grid time-grid--flush">
            {mine.map((entry) => (
              <div className="bar-row" key={entry.id}>
                <span className="bar-row__name" title={entry.note}>
                  {entry.itemId ? (itemTitles.get(entry.itemId) ?? entry.note) : entry.note || '—'}
                </span>
                <div>
                  <div className="bar-row__track">
                    <div
                      className="bar-row__fill"
                      style={{ width: `${(entry.minutes / longest) * 100}%` }}
                    />
                  </div>
                  <span className="bar-row__sub">{formatDate(entry.startedAt)}</span>
                </div>
                <span className="bar-row__value">{formatDuration(entry.minutes)}</span>
              </div>
            ))}
            {mine.length === 0 && <div className="empty">Süre kaydı yok.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
