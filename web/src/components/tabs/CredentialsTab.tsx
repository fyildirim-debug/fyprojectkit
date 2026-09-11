import { useMemo, useState, type FormEvent } from 'react';
import { relativeTime, type Credential, type Project, type TwoFactorState } from '@takip/shared';
import { useStore } from '../../lib/store';
import { isStale, maskSecret, useCopy } from '../../lib/ui';

const TWO_FACTOR_LABEL: Record<TwoFactorState, string> = {
  active: 'AKTİF',
  none: '—',
  expiring: 'SÜRE',
};

/** 08 — Şifreler & erişimler. Varsayılan gizli; tıkla-göster ve kopyala. */
export function CredentialsTab({ project }: { project: Project | null }) {
  const { credentials, projects, addCredential, deleteCredential } = useStore();
  const { copied, copy } = useCopy();
  const [shown, setShown] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => {
    const scoped = project
      ? credentials.filter((credential) => credential.projectId === project.id)
      : credentials;
    return [...scoped].sort((a, b) => a.service.localeCompare(b.service, 'tr'));
  }, [credentials, project]);

  const projectNames = useMemo(
    () => new Map(projects.map((entry) => [entry.id, entry.name])),
    [projects],
  );

  function toggle(id: string) {
    setShown((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <div className="subbar">
        {project && <span className="topbar__crumb">{project.name} /</span>}
        <span className="topbar__title">Şifreler</span>
        <span className="pill pill--amber">SADECE SEN GÖREBİLİRSİN</span>
        <button
          type="button"
          className="btn btn--primary push-right"
          onClick={() => setAdding(true)}
        >
          Kayıt ekle
        </button>
      </div>

      <div className="grid-table">
        <div className="grid-table__head creds-grid col-head">
          <span>SERVİS</span>
          <span>KULLANICI</span>
          <span>ŞİFRE</span>
          <span>2FA</span>
          <span>GÜNCELLENDİ</span>
        </div>
      </div>

      <div className="scroll">
        <div className="grid-table">
          {rows.map((credential) => {
            const visible = shown.has(credential.id);
            const stale = credential.twoFactor === 'expiring' || isStale(credential.updatedAt, 10);

            return (
              <div className="grid-table__row creds-grid" key={credential.id}>
                <div className="service">
                  <span className="service__dot" />
                  <div className="cell-stack">
                    <span className="service__name">{credential.service}</span>
                    {!project && (
                      <span className="project-card__domain">
                        {projectNames.get(credential.projectId) ?? '—'}
                      </span>
                    )}
                  </div>
                </div>

                <span className="cell-mono">{credential.username}</span>

                <div className="secret">
                  <span className={`secret__value ${visible ? 'secret__value--shown' : ''}`}>
                    {visible ? credential.secret : maskSecret(credential.secret)}
                  </span>
                  <button
                    type="button"
                    className={`icon-btn ${visible ? 'icon-btn--on' : ''}`}
                    onClick={() => toggle(credential.id)}
                  >
                    {visible ? 'GİZLE' : 'GÖSTER'}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => copy(credential.secret, credential.id)}
                  >
                    {copied === credential.id ? 'KOPYALANDI' : 'KOPYALA'}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => void deleteCredential(credential.id)}
                  >
                    SİL
                  </button>
                </div>

                <span
                  className={`pill pill--2fa-${credential.twoFactor}`}
                  style={{ justifySelf: 'start' }}
                >
                  {TWO_FACTOR_LABEL[credential.twoFactor]}
                </span>

                <span className={`row__time ${stale ? 'row__time--stale' : ''}`}>
                  {relativeTime(credential.updatedAt)}
                </span>
              </div>
            );
          })}

          {rows.length === 0 && <div className="empty">Kayıtlı şifre yok.</div>}
        </div>
      </div>

      {adding && (
        <CredentialDialog
          projectId={project?.id ?? projects[0]?.id ?? ''}
          projects={projects.map((entry) => ({ id: entry.id, name: entry.name }))}
          lockProject={Boolean(project)}
          onClose={() => setAdding(false)}
          onSave={async (input) => {
            await addCredential(input);
            setAdding(false);
          }}
        />
      )}
    </>
  );
}

function CredentialDialog({
  projectId,
  projects,
  lockProject,
  onClose,
  onSave,
}: {
  projectId: string;
  projects: { id: string; name: string }[];
  lockProject: boolean;
  onClose: () => void;
  onSave: (input: Omit<Credential, 'id'>) => Promise<void>;
}) {
  const [target, setTarget] = useState(projectId);
  const [service, setService] = useState('');
  const [username, setUsername] = useState('');
  const [secret, setSecret] = useState('');
  const [twoFactor, setTwoFactor] = useState<TwoFactorState>('none');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!service.trim() || !target || busy) return;
    setBusy(true);
    try {
      await onSave({
        projectId: target,
        service: service.trim(),
        username: username.trim(),
        secret,
        twoFactor,
        color: '',
        updatedAt: new Date().toISOString(),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form className="palette" onSubmit={onSubmit}>
        <div className="palette__input">
          <span className="pill pill--accent">YENİ KAYIT</span>
          <input
            autoFocus
            value={service}
            placeholder="Servis adı — Deploy paneli"
            onChange={(event) => setService(event.target.value)}
            onKeyDown={(event) => event.key === 'Escape' && onClose()}
          />
          <span className="palette__esc">ESC</span>
        </div>

        <div className="drawer__body">
          {!lockProject && (
            <div className="field">
              <span className="field__label">PROJE</span>
              <div className="chips">
                {projects.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`type-chip ${target === entry.id ? 'type-chip--on' : ''}`}
                    onClick={() => setTarget(entry.id)}
                  >
                    {entry.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="field">
            <span className="field__label">KULLANICI</span>
            <input value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>

          <label className="field">
            <span className="field__label">ŞİFRE / TOKEN</span>
            <input value={secret} onChange={(event) => setSecret(event.target.value)} />
          </label>

          <div className="field">
            <span className="field__label">2FA</span>
            <div className="chips">
              {(['active', 'none', 'expiring'] as TwoFactorState[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`type-chip ${twoFactor === option ? 'type-chip--on' : ''}`}
                  onClick={() => setTwoFactor(option)}
                >
                  {TWO_FACTOR_LABEL[option]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="palette__foot palette__foot--actions">
          <button type="button" className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy || !service.trim()}>
            Kaydet
          </button>
        </div>
      </form>
    </div>
  );
}
