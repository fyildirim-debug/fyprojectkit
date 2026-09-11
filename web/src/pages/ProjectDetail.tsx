import { useMemo } from 'react';
import { NavLink, Navigate, useParams } from 'react-router-dom';
import { PROJECT_STATUS_LABELS } from '@takip/shared';
import { useStore } from '../lib/store';
import { STATUS_PILL } from '../lib/ui';
import { useQuickAdd } from '../components/QuickAdd';
import { Timer } from '../components/Timer';
import { Overview } from '../components/tabs/Overview';
import { ItemsTab } from '../components/tabs/ItemsTab';
import { NotesTab } from '../components/tabs/NotesTab';
import { CredentialsTab } from '../components/tabs/CredentialsTab';
import { LinksTab } from '../components/tabs/LinksTab';
import { McpTab } from '../components/tabs/McpTab';
import { ChangelogTab } from '../components/tabs/ChangelogTab';
import { TimeTab } from '../components/tabs/TimeTab';

const TABS = [
  'genel',
  'hatalar',
  'yapilacaklar',
  'notlar',
  'sifreler',
  'baglantilar',
  'mcp',
  'changelog',
  'zaman',
] as const;

type TabKey = (typeof TABS)[number];

const TAB_LABELS: Record<TabKey, string> = {
  genel: 'Genel',
  hatalar: 'Hatalar',
  yapilacaklar: 'Yapılacaklar',
  notlar: 'Notlar',
  sifreler: 'Şifreler',
  baglantilar: 'Bağlantılar',
  mcp: 'MCP',
  changelog: 'Changelog',
  zaman: 'Zaman',
};

/** 03 — Proje detayı. Tüm sekmeler tek bir başlık ve sekme çubuğu altında. */
export function ProjectDetail() {
  const { slug, tab } = useParams<{ slug: string; tab?: string }>();
  const { projects, items, notes, loading } = useStore();
  const quickAdd = useQuickAdd();

  const project = useMemo(
    () => projects.find((candidate) => candidate.slug === slug) ?? null,
    [projects, slug],
  );

  const counts = useMemo(() => {
    if (!project) return { bugs: 0, tasks: 0, notes: 0 };
    const mine = items.filter((item) => item.projectId === project.id && item.status === 'open');
    return {
      bugs: mine.filter((item) => item.type === 'bug').length,
      tasks: mine.length,
      notes: notes.filter((note) => note.projectId === project.id).length,
    };
  }, [project, items, notes]);

  if (loading) return <div className="empty">Yükleniyor…</div>;
  if (!project) return <div className="empty">Proje bulunamadı.</div>;

  const active = (tab ?? 'genel') as TabKey;
  if (!TABS.includes(active)) return <Navigate to={`/proje/${project.slug}`} replace />;

  return (
    <>
      <header className="topbar">
        <span className="topbar__crumb">Projeler /</span>
        <span className="topbar__title">{project.name}</span>
        <span className={`pill ${STATUS_PILL[project.status]}`}>
          {PROJECT_STATUS_LABELS[project.status].toLocaleUpperCase('tr')}
        </span>

        <div className="topbar__actions">
          <Timer projectId={project.id} />
          <button type="button" className="btn btn--primary" onClick={() => quickAdd.open(project.id)}>
            Hızlı ekle
          </button>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((key) => (
          <NavLink
            key={key}
            to={key === 'genel' ? `/proje/${project.slug}` : `/proje/${project.slug}/${key}`}
            end={key === 'genel'}
            className={({ isActive }) => `tab ${isActive ? 'tab--on' : ''}`}
          >
            {TAB_LABELS[key]}
            {key === 'hatalar' && counts.bugs > 0 && (
              <span className="tab__count tab__count--bug">{counts.bugs}</span>
            )}
            {key === 'yapilacaklar' && counts.tasks > 0 && (
              <span className="tab__count">{counts.tasks}</span>
            )}
          </NavLink>
        ))}
      </nav>

      {active === 'genel' && <Overview project={project} />}
      {active === 'hatalar' && <ItemsTab project={project} scope="bug" />}
      {active === 'yapilacaklar' && <ItemsTab project={project} scope="all" />}
      {active === 'notlar' && <NotesTab project={project} />}
      {active === 'sifreler' && <CredentialsTab project={project} />}
      {active === 'baglantilar' && <LinksTab project={project} />}
      {active === 'mcp' && <McpTab project={project} />}
      {active === 'changelog' && <ChangelogTab project={project} />}
      {active === 'zaman' && <TimeTab project={project} />}
    </>
  );
}
