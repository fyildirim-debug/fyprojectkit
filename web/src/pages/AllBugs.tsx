import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PRIORITY_LABELS, PRIORITY_WEIGHT, relativeTime } from '@takip/shared';
import { ItemActions, ItemEditor } from '../components/ItemEditor';
import { Topbar } from '../components/Topbar';
import { useStore } from '../lib/store';
import { PRIORITY_PILL } from '../lib/ui';

/** Tüm projelerdeki açık hatalar tek listede — sol menüdeki "Açık hatalar". */
export function AllBugs() {
  const { items, projects, closeItem, deleteItem } = useStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const rows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('tr');
    return items
      .filter((item) => item.status === 'open')
      .filter((item) =>
        needle
          ? `${item.title} ${item.tag} ${projectsById.get(item.projectId)?.name ?? ''}`
              .toLocaleLowerCase('tr')
              .includes(needle)
          : true,
      )
      .sort(
        (a, b) =>
          PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority] ||
          b.createdAt.localeCompare(a.createdAt),
      );
  }, [items, query, projectsById]);

  async function close(itemId: string) {
    setBusy(itemId);
    try {
      await closeItem(itemId);
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

  return (
    <>
      <Topbar
        title="Açık hatalar"
        search={{ value: query, onChange: setQuery, placeholder: 'Hata ara' }}
      />

      <div className="grid-table">
        <div className="grid-table__head items-grid col-head">
          <span />
          <span>BAŞLIK</span>
          <span>ÖNCELİK</span>
          <span>PROJE</span>
          <span>ETİKET</span>
          <span>TARİH</span>
          <span />
        </div>
      </div>

      <div className="scroll">
        <div className="grid-table">
          {rows.map((item) => {
            const project = projectsById.get(item.projectId);

            if (editing === item.id) {
              return (
                <div className="grid-table__row" key={item.id}>
                  <ItemEditor item={item} onClose={() => setEditing(null)} />
                </div>
              );
            }

            return (
              <div className="grid-table__row items-grid" key={item.id}>
                <button
                  type="button"
                  className="checkbox"
                  disabled={busy === item.id}
                  title="Yapıldı işaretle"
                  onClick={() => void close(item.id)}
                >
                  ✓
                </button>

                <div className="cell-stack">
                  <span className="item-title">{item.title}</span>
                  {item.description && <span className="item-desc">{item.description}</span>}
                </div>

                <span className={`pill ${PRIORITY_PILL[item.priority]}`} style={{ justifySelf: 'start' }}>
                  {PRIORITY_LABELS[item.priority].toLocaleUpperCase('tr')}
                </span>

                <button
                  type="button"
                  className="cell-link"
                  onClick={() => project && navigate(`/proje/${project.slug}/hatalar`)}
                >
                  {project?.name ?? '—'}
                </button>

                {item.tag ? (
                  <span className="tag" style={{ justifySelf: 'start' }}>
                    {item.tag}
                  </span>
                ) : (
                  <span />
                )}

                <span className="row__time">{relativeTime(item.createdAt)}</span>

                <ItemActions
                  disabled={busy === item.id}
                  onEdit={() => setEditing(item.id)}
                  onDelete={() => void remove(item.id)}
                />
              </div>
            );
          })}

          {rows.length === 0 && <div className="empty">Açık hata yok.</div>}
        </div>
      </div>
    </>
  );
}
