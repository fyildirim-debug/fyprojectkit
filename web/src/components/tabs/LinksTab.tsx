import { useMemo, useState, type FormEvent } from 'react';
import { type LinkKind, type Project } from '@takip/shared';
import { useStore } from '../../lib/store';
import { useCopy } from '../../lib/ui';

const KIND_LABELS: Record<LinkKind, string> = {
  live: 'Canlı',
  repo: 'Repo',
  panel: 'Panel',
  console: 'Konsol',
  other: 'Diğer',
};

/** Bağlantılar sekmesi — canlı site, repo, panel, konsol adresleri. */
export function LinksTab({ project }: { project: Project }) {
  const { links, addLink, deleteLink } = useStore();
  const { copied, copy } = useCopy();

  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<LinkKind>('live');
  const [busy, setBusy] = useState(false);

  const mine = useMemo(
    () => links.filter((link) => link.projectId === project.id),
    [links, project.id],
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!label.trim() || !url.trim() || busy) return;
    setBusy(true);
    try {
      const normalized = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
      await addLink({ projectId: project.id, label: label.trim(), url: normalized, kind });
      setLabel('');
      setUrl('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="detail">
      <div className="detail__main">
        <section className="panel">
          <div className="panel__head">
            <span className="panel__title">Bağlantılar</span>
            <span className="panel__meta">{mine.length} kayıt</span>
          </div>

          <div className="stack" style={{ gap: 0 }}>
            {mine.map((link) => (
              <div className="link-row" key={link.id}>
                <span className="link-row__dot" />
                <a href={link.url} target="_blank" rel="noreferrer noopener" className="link-row__grow">
                  <span>{link.label}</span>
                  <span className="link-row__url">{link.url}</span>
                </a>
                <button type="button" className="icon-btn" onClick={() => copy(link.url, link.id)}>
                  {copied === link.id ? 'KOPYALANDI' : 'KOPYALA'}
                </button>
                <button type="button" className="icon-btn" onClick={() => void deleteLink(link.id)}>
                  SİL
                </button>
              </div>
            ))}
            {mine.length === 0 && <div className="empty">Bağlantı yok.</div>}
          </div>

          <form onSubmit={onSubmit} className="stack">
            <div className="divider" />
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <input
                value={label}
                placeholder="Etiket — Canlı site"
                onChange={(event) => setLabel(event.target.value)}
                style={{ flex: '1 1 160px' }}
              />
              <input
                value={url}
                placeholder="ornek.com"
                onChange={(event) => setUrl(event.target.value)}
                style={{ flex: '2 1 240px' }}
              />
            </div>
            <div className="chips" style={{ alignItems: 'center' }}>
              {(Object.keys(KIND_LABELS) as LinkKind[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`type-chip ${kind === option ? 'type-chip--on' : ''}`}
                  onClick={() => setKind(option)}
                >
                  {KIND_LABELS[option]}
                </button>
              ))}
              <button
                type="submit"
                className="btn btn--primary push-right"
                disabled={busy || !label.trim() || !url.trim()}
              >
                Bağlantı ekle
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
