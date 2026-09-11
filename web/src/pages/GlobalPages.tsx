import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CHANGE_KIND_LABELS,
  compareVersions,
  formatDate,
  formatDuration,
  relativeTime,
  startOfWeek,
} from '@takip/shared';
import { Topbar } from '../components/Topbar';
import { CredentialsTab } from '../components/tabs/CredentialsTab';
import { useStore } from '../lib/store';
import { CHANGE_KIND_CLASS } from '../lib/ui';

/** Tüm projelerin sürümleri tek akışta. */
export function AllChangelog() {
  const { releases, changeEntries, projects } = useStore();
  const navigate = useNavigate();

  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const ordered = useMemo(
    () =>
      [...releases]
        .filter((release) => changeEntries.some((entry) => entry.releaseId === release.id))
        .sort((a, b) => b.date.localeCompare(a.date) || compareVersions(b.version, a.version)),
    [releases, changeEntries],
  );

  return (
    <>
      <Topbar title="Changelog" />
      <div className="scroll">
        <div className="changelog">
          {ordered.map((release) => {
            const project = projectsById.get(release.projectId);
            const entries = changeEntries.filter((entry) => entry.releaseId === release.id);

            return (
              <section className="release" key={release.id}>
                <div className="release__side">
                  <span className="release__version">{release.version}</span>
                  <span className="release__date">{formatDate(release.date)}</span>
                  <span className={`pill ${release.status === 'draft' ? 'pill--neutral' : 'pill--green'}`}>
                    {release.status === 'draft' ? 'TASLAK' : 'YAYINDA'}
                  </span>
                </div>

                <div className="release__spine">
                  <i />
                </div>

                <div className="release__entries">
                  <button
                    type="button"
                    className="release__project"
                    onClick={() => project && navigate(`/proje/${project.slug}/changelog`)}
                  >
                    {project?.name ?? '—'}
                  </button>

                  {entries.map((entry) => (
                    <div className="entry" key={entry.id}>
                      <span className={`entry__kind ${CHANGE_KIND_CLASS[entry.kind]}`}>
                        {CHANGE_KIND_LABELS[entry.kind].toLocaleUpperCase('tr')}
                      </span>
                      <span className="entry__text">{entry.text}</span>
                      {entry.refNo && <span className="entry__ref">#{entry.refNo}</span>}
                    </div>
                  ))}
                </div>
              </section>
            );
          })}

          {ordered.length === 0 && <div className="empty">Henüz sürüm kaydı yok.</div>}
        </div>
      </div>
    </>
  );
}

/** Tüm projelerin şifreleri — proje sekmesindeki tabloyu kapsamsız kullanır. */
export function AllCredentials() {
  return <CredentialsTab project={null} />;
}

/** MCP açık olan projelerin özeti. */
export function AllMcp() {
  const { projects, mcpConfigs, mcpLogs } = useStore();
  const navigate = useNavigate();

  const rows = useMemo(
    () =>
      mcpConfigs
        .map((config) => ({
          config,
          project: projects.find((project) => project.id === config.projectId) ?? null,
          lastLog: mcpLogs
            .filter((log) => log.projectId === config.projectId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
        }))
        .filter((row) => row.project),
    [mcpConfigs, projects, mcpLogs],
  );

  return (
    <>
      <Topbar title="MCP sunucuları" showDefaultActions={false} />
      <div className="scroll">
        <div className="card-grid">
          {rows.map(({ config, project, lastLog }) => (
            <button
              key={config.id}
              type="button"
              className="project-card"
              onClick={() => navigate(`/proje/${project!.slug}/mcp`)}
            >
              <div className="project-card__head">
                <div className="cell-stack">
                  <span className="project-card__name">{project!.name}</span>
                  <span className="project-card__domain">/mcp/{project!.slug}/sse</span>
                </div>
                <span className={`pill ${config.enabled ? 'pill--green' : 'pill--neutral'}`}>
                  {config.enabled ? 'AÇIK' : 'KAPALI'}
                </span>
              </div>

              <div className="chips">
                <span className="chip">{config.enabledTools.length} araç</span>
                <span className="chip">
                  otomatik uygula {config.autoApply ? 'açık' : 'kapalı'}
                </span>
              </div>

              <div className="project-card__foot">
                <span>{lastLog ? lastLog.tool : 'hareket yok'}</span>
                <span>{lastLog ? relativeTime(lastLog.createdAt) : '—'}</span>
              </div>
            </button>
          ))}

          {rows.length === 0 && (
            <div className="empty">
              Hiçbir projede MCP açık değil. Bir projenin MCP sekmesinden açabilirsin.
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** Projelere göre toplam ve haftalık süre dağılımı. */
export function AllTime() {
  const { timeEntries, projects } = useStore();
  const navigate = useNavigate();

  const weekStart = startOfWeek().getTime();

  const rows = useMemo(() => {
    return projects
      .map((project) => {
        const mine = timeEntries.filter((entry) => entry.projectId === project.id);
        return {
          project,
          total: mine.reduce((sum, entry) => sum + entry.minutes, 0),
          week: mine
            .filter((entry) => new Date(entry.startedAt).getTime() >= weekStart)
            .reduce((sum, entry) => sum + entry.minutes, 0),
          last: mine.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0],
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [projects, timeEntries, weekStart]);

  const longest = Math.max(...rows.map((row) => row.total), 1);
  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);
  const weekTotal = rows.reduce((sum, row) => sum + row.week, 0);

  return (
    <>
      <Topbar title="Zaman" showDefaultActions={false} />
      <div className="scroll">
        <div className="stat-strip stat-strip--2">
          <div className="stat">
            <span className="stat__label">TOPLAM SÜRE</span>
            <span className="stat__value">{formatDuration(grandTotal)}</span>
          </div>
          <div className="stat">
            <span className="stat__label">BU HAFTA</span>
            <span className="stat__value">{formatDuration(weekTotal)}</span>
          </div>
        </div>

        <div className="time-grid">
          {rows.map((row) => (
            <button
              key={row.project.id}
              type="button"
              className="bar-row"
              onClick={() => navigate(`/proje/${row.project.slug}/zaman`)}
            >
              <span className="bar-row__name">
                <i className={`dot dot--${row.project.status}`} />
                {row.project.name}
              </span>
              <div>
                <div className="bar-row__track">
                  <div
                    className="bar-row__fill"
                    style={{ width: `${(row.total / longest) * 100}%` }}
                  />
                </div>
                <span className="bar-row__sub">
                  bu hafta {formatDuration(row.week)}
                  {row.last ? ` · son ${relativeTime(row.last.startedAt)}` : ''}
                </span>
              </div>
              <span className="bar-row__value">{formatDuration(row.total)}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
