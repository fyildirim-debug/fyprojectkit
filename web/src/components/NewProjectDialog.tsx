import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PROJECT_STATUSES, PROJECT_STATUS_LABELS, type ProjectStatus } from '@takip/shared';
import { useStore } from '../lib/store';

/** Ad → slug: Türkçe karakterler sadeleşir, URL'de güvenli kalır. */
function slugify(value: string): string {
  const map: Record<string, string> = {
    ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u',
    Ç: 'c', Ğ: 'g', İ: 'i', Ö: 'o', Ş: 's', Ü: 'u',
  };
  return value
    .split('')
    .map((char) => map[char] ?? char)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const { createProject, projects } = useStore();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [domain, setDomain] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('teklif');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    const slug = slugify(trimmed);
    if (projects.some((project) => project.slug === slug)) {
      setError('Bu isimde bir proje zaten var.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const project = await createProject({
        slug,
        name: trimmed,
        subtitle: subtitle.trim(),
        status,
        progress: 0,
        version: 'v0.1.0',
        startDate: new Date().toISOString(),
        server: '',
        domain: domain.trim(),
        sslStatus: '',
        sslDays: null,
        dns: '',
        mcpEnabled: false,
      });
      onClose();
      navigate(`/proje/${project.slug}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Proje oluşturulamadı.');
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
          <span className="pill pill--accent">YENİ PROJE</span>
          <input
            autoFocus
            value={name}
            placeholder="Proje adı"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => event.key === 'Escape' && onClose()}
          />
          <span className="palette__esc">ESC</span>
        </div>

        <div className="drawer__body">
          <label className="field">
            <span className="field__label">AÇIKLAMA</span>
            <input
              value={subtitle}
              placeholder="okul yönetim sistemi"
              onChange={(event) => setSubtitle(event.target.value)}
            />
          </label>

          <label className="field">
            <span className="field__label">DOMAIN</span>
            <input
              value={domain}
              placeholder="ornek.com"
              onChange={(event) => setDomain(event.target.value)}
            />
          </label>

          <div className="field">
            <span className="field__label">DURUM</span>
            <div className="chips">
              {PROJECT_STATUSES.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`type-chip ${status === option ? 'type-chip--on' : ''}`}
                  onClick={() => setStatus(option)}
                >
                  {PROJECT_STATUS_LABELS[option].toLocaleUpperCase('tr')}
                </button>
              ))}
            </div>
          </div>

          {error && <span className="login__error">{error}</span>}
        </div>

        <div className="palette__foot palette__foot--actions">
          <button type="button" className="btn" onClick={onClose}>
            Vazgeç
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy || !name.trim()}>
            Projeyi aç
          </button>
        </div>
      </form>
    </div>
  );
}
