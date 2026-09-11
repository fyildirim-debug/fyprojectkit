import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  PROJECT_STATUS_LABELS,
  computeGlobalStats,
  computeStats,
  formatDuration,
  latestReleaseOf,
  relativeTime,
  sortProjects,
  type ProjectStatus,
} from '@takip/shared';
import { Topbar } from '../components/Topbar';
import { NewProjectDialog } from '../components/NewProjectDialog';
import { useStore } from '../lib/store';
import { STATUS_PILL } from '../lib/ui';

/** 02 — Ana ekran: istatistik şeridi + proje kartları ızgarası. */
export function Projects() {
  const { projects, items, notes, timeEntries, releases, loading } = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  const statusFilter = params.get('durum') as ProjectStatus | null;

  const totals = useMemo(
    () => computeGlobalStats(items, timeEntries, releases),
    [items, timeEntries, releases],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('tr');
    return sortProjects(projects).filter((project) => {
      if (statusFilter && project.status !== statusFilter) return false;
      if (!needle) return true;
      const inProject = `${project.name} ${project.domain} ${project.subtitle}`
        .toLocaleLowerCase('tr')
        .includes(needle);
      const inItems = items.some(
        (item) =>
          item.projectId === project.id && item.title.toLocaleLowerCase('tr').includes(needle),
      );
      const inNotes = notes.some(
        (note) => note.projectId === project.id && note.body.toLocaleLowerCase('tr').includes(needle),
      );
      return inProject || inItems || inNotes;
    });
  }, [projects, items, notes, query, statusFilter]);

  return (
    <>
      <Topbar
        title={statusFilter ? `Projeler · ${PROJECT_STATUS_LABELS[statusFilter]}` : 'Projeler'}
        search={{ value: query, onChange: setQuery }}
      />

      <div className="scroll">
        <div className="stat-strip">
          <Stat label="AÇIK HATA" value={totals.openBugs} alert={totals.openBugs > 0} />
          <Stat label="BU HAFTA KAPANAN" value={totals.doneThisWeek} />
          <Stat label="BU HAFTA SÜRE" value={formatDuration(totals.minutesThisWeek)} />
          <Stat label="YENİ SÜRÜM" value={totals.newReleases} />
        </div>

        <div className="card-grid">
          {visible.map((project) => {
            const stats = computeStats(project.id, items, notes, timeEntries);
            const release = latestReleaseOf(releases, project.id);

            return (
              <button
                key={project.id}
                type="button"
                className="project-card"
                onClick={() => navigate(`/proje/${project.slug}`)}
              >
                <div className="project-card__head">
                  <div className="cell-stack">
                    <span className="project-card__name">{project.name}</span>
                    <span className="project-card__domain">{project.domain || project.subtitle}</span>
                  </div>
                  <span className={`pill ${STATUS_PILL[project.status]}`}>
                    {PROJECT_STATUS_LABELS[project.status].toLocaleUpperCase('tr')}
                  </span>
                </div>

                <div>
                  <div className="progress__row">
                    <span>İlerleme</span>
                    <b>{project.progress}%</b>
                  </div>
                  <div className="progress__track">
                    <div className="progress__fill" style={{ width: `${project.progress}%` }} />
                  </div>
                </div>

                <div className="chips">
                  {stats.openBugs > 0 && (
                    <span className={`chip ${stats.openBugs > 1 ? 'chip--bug' : 'chip--warn'}`}>
                      {stats.openBugs} hata
                    </span>
                  )}
                  {stats.openTasks > 0 && <span className="chip">{stats.openTasks} iş</span>}
                  {stats.notes > 0 && <span className="chip">{stats.notes} not</span>}
                  {project.mcpEnabled && <span className="chip">MCP ✓</span>}
                </div>

                <div className="project-card__foot">
                  <span>
                    {release ? `${release.version} · ${relativeTime(release.date)}` : 'sürüm yok'}
                  </span>
                  <span>{formatDuration(stats.minutes)}</span>
                </div>
              </button>
            );
          })}

          {!loading && (
            <button
              type="button"
              className="project-card project-card--new"
              onClick={() => setCreating(true)}
            >
              <div className="plus">+</div>
              <span>Yeni proje</span>
            </button>
          )}
        </div>

        {!loading && visible.length === 0 && <div className="empty">Eşleşen proje yok.</div>}
      </div>

      {creating && <NewProjectDialog onClose={() => setCreating(false)} />}
    </>
  );
}

function Stat({ label, value, alert }: { label: string; value: string | number; alert?: boolean }) {
  return (
    <div className={`stat ${alert ? 'stat--alert' : ''}`}>
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
    </div>
  );
}
