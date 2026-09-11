import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PRIORITY_LABELS,
  PRIORITY_WEIGHT,
  computeStats,
  formatDate,
  formatDuration,
  formatShortDate,
  parseQuickAdd,
  relativeTime,
  type Project,
} from '@takip/shared';
import { useStore } from '../../lib/store';
import { PRIORITY_PILL } from '../../lib/ui';
import { BacklogBoard } from '../BacklogBoard';
import { TypePicker, useTypePicker } from '../TypePicker';

/** 03 — Genel sekmesi: açık işler, notlar ve sağda durum/sunucu/bağlantılar. */
export function Overview({ project }: { project: Project }) {
  const { items, notes, timeEntries, links, addItem } = useStore();
  const navigate = useNavigate();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const picker = useTypePicker('task');

  const stats = useMemo(
    () => computeStats(project.id, items, notes, timeEntries),
    [project.id, items, notes, timeEntries],
  );

  const openItems = useMemo(
    () =>
      items
        .filter((item) => item.projectId === project.id && item.status === 'open')
        .sort(
          (a, b) =>
            PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] ||
            b.createdAt.localeCompare(a.createdAt),
        )
        .slice(0, 6),
    [items, project.id],
  );

  const projectNotes = useMemo(
    () =>
      notes
        .filter((note) => note.projectId === project.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 4),
    [notes, project.id],
  );

  const projectLinks = useMemo(
    () => links.filter((link) => link.projectId === project.id),
    [links, project.id],
  );

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    const parsed = parseQuickAdd(draft);
    if (!parsed.title || busy) return;
    setBusy(true);
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
      setBusy(false);
    }
  }

  return (
    <div className="detail">
      <div className="detail__main">
        <section className="panel">
          <div className="panel__head">
            <span className="panel__title">Açık işler</span>
            <span className="panel__meta">
              {stats.openBugs} hata · {stats.openTasks} iş
            </span>
          </div>

          {openItems.length > 0 ? (
            <div className="rows">
              {openItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="row"
                  onClick={() =>
                    navigate(`/proje/${project.slug}/${item.type === 'bug' ? 'hatalar' : 'yapilacaklar'}`)
                  }
                >
                  <span className={`row__dot row__dot--${item.priority}`} />
                  <span className="row__title">{item.title}</span>
                  <span className={`pill ${PRIORITY_PILL[item.priority]}`}>
                    {PRIORITY_LABELS[item.priority].toLocaleUpperCase('tr')}
                  </span>
                  <span className="row__time">{relativeTime(item.createdAt)}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="empty">Açık iş yok.</div>
          )}

          <form className="quick-line" onSubmit={onAdd}>
            <span>+</span>
            <input
              value={draft}
              placeholder="Bu projeye satır ekle — yaz ve Enter"
              onChange={(event) => setDraft(event.target.value)}
            />
            <TypePicker value={picker.type} onChange={picker.setType} landed={picker.landed} />
          </form>
        </section>

        <BacklogBoard project={project} />

        <section className="panel" style={{ flex: 1 }}>
          <div className="panel__head">
            <span className="panel__title">Notlar</span>
            <span className="panel__meta">{stats.notes} not</span>
          </div>

          {projectNotes.length > 0 ? (
            <div className="stack" style={{ gap: 0 }}>
              {projectNotes.map((note) => (
                <article className="note-card" key={note.id}>
                  <p>{note.body}</p>
                  <div className="note-card__meta">
                    <span>
                      {formatShortDate(note.createdAt).toLocaleUpperCase('tr')} · {note.context}
                    </span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty">Henüz not yok.</div>
          )}
        </section>
      </div>

      <aside className="aside">
        <div className="aside__group">
          <span className="eyebrow">DURUM</span>
          <div className="stack stack--s">
            <div className="kv">
              <span>İlerleme</span>
              <span>{project.progress}%</span>
            </div>
            <div className="progress__track" style={{ marginTop: 0 }}>
              <div className="progress__fill" style={{ width: `${project.progress}%` }} />
            </div>
            <div className="kv">
              <span>Sürüm</span>
              <span>{project.version}</span>
            </div>
            <div className="kv">
              <span>Başlangıç</span>
              <span>{formatDate(project.startDate)}</span>
            </div>
            <div className="kv">
              <span>Toplam süre</span>
              <span>{formatDuration(stats.minutes)}</span>
            </div>
          </div>
        </div>

        <div className="divider" />

        <div className="aside__group">
          <span className="eyebrow">SUNUCU & DOMAIN</span>
          <div className="stack stack--s">
            <div className="kv">
              <span>Sunucu</span>
              <span>{project.server || '—'}</span>
            </div>
            <div className="kv">
              <span>Domain</span>
              <span>{project.domain || '—'}</span>
            </div>
            <div className="kv">
              <span>SSL</span>
              <span>
                {project.sslDays === null
                  ? project.sslStatus || '—'
                  : `${project.sslStatus} · ${project.sslDays} gün`}
              </span>
            </div>
            <div className="kv">
              <span>DNS</span>
              <span>{project.dns || '—'}</span>
            </div>
          </div>
        </div>

        <div className="divider" />

        <div className="aside__group">
          <span className="eyebrow">BAĞLANTILAR</span>
          <div className="stack" style={{ gap: 0 }}>
            {projectLinks.map((link) => (
              <a
                key={link.id}
                className="link-row"
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                <span className="link-row__dot" />
                <span>{link.label}</span>
                <span className="link-row__arrow" aria-hidden="true">
                  ↗
                </span>
              </a>
            ))}
            {projectLinks.length === 0 && (
              <button
                type="button"
                className="link-row"
                onClick={() => navigate(`/proje/${project.slug}/baglantilar`)}
              >
                <span className="link-row__dot" />
                <span>Bağlantı ekle</span>
                <span className="link-row__arrow" aria-hidden="true">
                  +
                </span>
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
