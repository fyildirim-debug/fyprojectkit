import { useMemo, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@takip/shared';
import { useAuth } from '../lib/auth';
import { useStore } from '../lib/store';

/** Sol kolon: gezinme, durum filtreleri, kullanıcı. Tüm ekranlarda sabit. */
export function Shell({ children }: { children: ReactNode }) {
  const { projects, items } = useStore();
  const { session, signOut } = useAuth();
  const location = useLocation();

  const counts = useMemo(() => {
    const byStatus = new Map<ProjectStatus, number>();
    for (const project of projects) {
      byStatus.set(project.status, (byStatus.get(project.status) ?? 0) + 1);
    }
    return {
      projects: projects.length,
      openBugs: items.filter((item) => item.status === 'open' && item.type === 'bug').length,
      byStatus,
    };
  }, [projects, items]);

  const filters: ProjectStatus[] = ['canli', 'gelistirme', 'test', 'beklemede'];
  const activeFilter = new URLSearchParams(location.search).get('durum');
  const initials = (session?.name ?? 'Kullanıcı').slice(0, 2).toLocaleUpperCase('tr');

  return (
    <div className="shell">
      <nav className="rail">
        <div className="rail__brand">
          <span className="brand__name">
            TAKIP<span className="vx-accent">.</span>
          </span>
        </div>

        <div className="rail__group">
          <RailLink to="/" label="Projeler" count={counts.projects} end />
          <RailLink to="/hatalar" label="Açık hatalar" count={counts.openBugs} alert />
          <RailLink to="/changelog" label="Changelog" />
          <RailLink to="/sifreler" label="Şifreler" />
          <RailLink to="/mcp" label="MCP" />
          <RailLink to="/zaman" label="Zaman" />
        </div>

        <div className="rail__heading">FİLTRE</div>
        <div className="rail__group">
          {filters.map((status) => (
            <NavLink
              key={status}
              to={activeFilter === status ? '/' : `/?durum=${status}`}
              className={`rail__filter ${activeFilter === status ? 'rail__filter--on' : ''}`}
            >
              {PROJECT_STATUS_LABELS[status]}
              <span>{counts.byStatus.get(status) ?? 0}</span>
            </NavLink>
          ))}
        </div>

        <div className="rail__user">
          <div className="avatar">{initials}</div>
          <div className="rail__user-text">
            <span className="rail__user-name">{session?.name ?? 'Kullanıcı'}</span>
            <button
              type="button"
              className="rail__user-role"
              onClick={() => void signOut()}
              title="Çıkış yap"
            >
              çıkış yap
            </button>
          </div>
        </div>
      </nav>

      <main className="main">{children}</main>
    </div>
  );
}

function RailLink({
  to,
  label,
  count,
  alert,
  end,
}: {
  to: string;
  label: string;
  count?: number;
  /** Sayı dikkat gerektiriyorsa (açık hata) Coral. */
  alert?: boolean;
  end?: boolean;
}) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `rail__item ${isActive ? 'rail__item--on' : ''}`}>
      <span className="rail__dot" />
      <span>{label}</span>
      {count !== undefined && (
        <span className={`rail__count ${alert && count > 0 ? 'rail__count--alert' : ''}`}>
          {count}
        </span>
      )}
    </NavLink>
  );
}
