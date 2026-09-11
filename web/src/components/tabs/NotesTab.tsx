import { useMemo, useState, type FormEvent } from 'react';
import {
  NOTE_IMPORTANCES,
  NOTE_IMPORTANCE_LABELS,
  NOTE_IMPORTANCE_WEIGHT,
  formatShortDate,
  relativeTime,
  type NoteImportance,
  type Project,
} from '@takip/shared';
import { useStore } from '../../lib/store';
import { NOTE_IMPORTANCE_PILL } from '../../lib/ui';

const CONTEXTS = ['not', 'telefon görüşmesi', 'teknik', 'toplantı', 'hatırlatma', 'fikir'];

/** Notlar sekmesi — dışarıdan gelen her şey önce buraya düşer. */
export function NotesTab({ project }: { project: Project }) {
  const { notes, addNote, deleteNote } = useStore();
  const [body, setBody] = useState('');
  const [context, setContext] = useState(CONTEXTS[0]);
  const [importance, setImportance] = useState<NoteImportance>('normal');
  const [onlyImportant, setOnlyImportant] = useState(false);
  const [busy, setBusy] = useState(false);

  // Önemli notlar üste çıkar; eşitse yeni olan önce gelir.
  const mine = useMemo(
    () =>
      notes
        .filter((note) => note.projectId === project.id)
        .filter((note) => (onlyImportant ? note.importance === 'cok_onemli' : true))
        .sort(
          (a, b) =>
            NOTE_IMPORTANCE_WEIGHT[b.importance] - NOTE_IMPORTANCE_WEIGHT[a.importance] ||
            b.createdAt.localeCompare(a.createdAt),
        ),
    [notes, project.id, onlyImportant],
  );

  const criticalCount = useMemo(
    () =>
      notes.filter((note) => note.projectId === project.id && note.importance === 'cok_onemli')
        .length,
    [notes, project.id],
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      await addNote(project.id, body.trim(), context, importance);
      setBody('');
      setImportance('normal');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="detail">
      <div className="detail__main">
        <section className="panel">
          <div className="panel__head">
            <span className="panel__title">Yeni not</span>
            <span className="panel__meta">{mine.length} not</span>
          </div>

          <form onSubmit={onSubmit} className="stack">
            <textarea
              rows={4}
              value={body}
              placeholder="Müşteri ne dedi, ne karar verildi, hangi ayar nerede…"
              onChange={(event) => setBody(event.target.value)}
              style={{ resize: 'vertical', lineHeight: 1.7 }}
            />
            <div className="chips">
              {CONTEXTS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`type-chip ${context === option ? 'type-chip--on' : ''}`}
                  onClick={() => setContext(option)}
                >
                  {option}
                </button>
              ))}
            </div>

            <div className="chips" style={{ alignItems: 'center' }}>
              <span className="eyebrow">ÖNEM</span>
              {NOTE_IMPORTANCES.map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`type-chip type-chip--imp-${level} ${
                    importance === level ? 'type-chip--on' : ''
                  }`}
                  onClick={() => setImportance(level)}
                >
                  {NOTE_IMPORTANCE_LABELS[level]}
                </button>
              ))}
              <button
                type="submit"
                className="btn btn--primary push-right"
                disabled={busy || !body.trim()}
              >
                Notu kaydet
              </button>
            </div>
          </form>
        </section>

        <section className="panel" style={{ flex: 1 }}>
          <div className="panel__head">
            <span className="panel__title">Notlar</span>
            {criticalCount > 0 && (
              <button
                type="button"
                className={`icon-btn ${onlyImportant ? 'icon-btn--on' : ''}`}
                onClick={() => setOnlyImportant((value) => !value)}
              >
                ÇOK ÖNEMLİ {criticalCount}
              </button>
            )}
          </div>

          {mine.length > 0 ? (
            <div className="stack" style={{ gap: 0 }}>
              {mine.map((note) => (
                <article
                  className={`note-card ${
                    note.importance === 'cok_onemli' ? 'note-card--critical' : ''
                  }`}
                  key={note.id}
                >
                  <p>{note.body}</p>
                  <div className="note-card__meta">
                    <span>
                      <span className={`pill ${NOTE_IMPORTANCE_PILL[note.importance]}`}>
                        {NOTE_IMPORTANCE_LABELS[note.importance].toLocaleUpperCase('tr')}
                      </span>{' '}
                      {formatShortDate(note.createdAt).toLocaleUpperCase('tr')} · {note.context} ·{' '}
                      {relativeTime(note.createdAt)}
                    </span>
                    <button
                      type="button"
                      className="icon-btn"
                      onClick={() => void deleteNote(note.id)}
                    >
                      SİL
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty">Henüz not yok.</div>
          )}
        </section>
      </div>
    </div>
  );
}
