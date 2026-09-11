import { useMemo, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { relativeTime } from '@takip/shared';
import { useAuth } from '../lib/auth';
import { useStore } from '../lib/store';

/** 01 — Giriş. Sağ panelde son hareketler ve proje dağılımı. */
export function Login() {
  const { session, signIn, localMode } = useAuth();
  const { projects, items } = useStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => {
    const live = projects.filter((project) => project.status === 'canli').length;
    const dev = projects.filter((project) => project.status === 'gelistirme').length;
    const test = projects.filter((project) => project.status === 'test').length;
    const openBugs = items.filter((item) => item.status === 'open' && item.type === 'bug').length;
    const total = Math.max(projects.length, 1);
    return {
      live,
      dev,
      test,
      openBugs,
      livePct: (live / total) * 100,
      devPct: (dev / total) * 100,
      testPct: (test / total) * 100,
    };
  }, [projects, items]);

  /** Son hareketler: en yeni üç madde, projesiyle birlikte. */
  const activity = useMemo(() => {
    const byId = new Map(projects.map((project) => [project.id, project.name]));
    return [...items]
      .sort((a, b) => (b.doneAt ?? b.createdAt).localeCompare(a.doneAt ?? a.createdAt))
      .slice(0, 3)
      .map((item) => ({
        id: item.id,
        text: `${byId.get(item.projectId) ?? 'proje'} · ${
          item.status === 'done' ? 'kapatıldı' : 'yeni kayıt'
        }: ${item.title}`,
        at: item.doneAt ?? item.createdAt,
      }));
  }, [items, projects]);

  if (session) return <Navigate to="/" replace />;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password, remember);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Giriş yapılamadı.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login__form-side">
        <form className="login__form" onSubmit={onSubmit}>
          <div className="brand">
            <span className="brand__name">
              TAKIP<span className="vx-accent">.</span>
            </span>
          </div>

          <div className="stack">
            <h2>
              Tekrar hoş geldin<span className="vx-accent">.</span>
            </h2>
            <p className="login__sub">Panele erişmek için giriş yap.</p>
          </div>

          <div className="stack stack--l">
            <label className="field">
              <span className="field__label">E-POSTA</span>
              <input
                type="email"
                value={email}
                placeholder="sen@example.com"
                autoComplete="username"
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>

            <label className="field field--secret">
              <span className="field__label">ŞİFRE</span>
              <input
                type={reveal ? 'text' : 'password'}
                value={password}
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
              />
              <button type="button" onClick={() => setReveal((current) => !current)}>
                {reveal ? 'GİZLE' : 'GÖSTER'}
              </button>
            </label>

            <div className="login__row">
              <button
                type="button"
                className="check"
                onClick={() => setRemember((current) => !current)}
              >
                <span className={`check__box ${remember ? 'check__box--on' : ''}`}>✓</span>
                Beni hatırla
              </button>
              <a href="#sifremi-unuttum" className="login__link">
                Şifremi unuttum
              </a>
            </div>

            {error && <div className="login__error">{error}</div>}

            <button type="submit" className="login__submit" disabled={busy}>
              {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
            </button>

            <div className="login__or">
              <i />
              <span>veya</span>
              <i />
            </div>

            <button type="button" className="login__alt" disabled>
              Passkey ile giriş
            </button>

            {localMode && (
              <p className="login__sub">
                Yerel mod — backend bağlı değil, veriler bu tarayıcıda tutuluyor.
              </p>
            )}
          </div>
        </form>
      </div>

      <aside className="login__aside">
        <div className="stack stack--l">
          <div className="eyebrow">SON HAREKET</div>
          <div className="activity">
            {activity.map((entry) => (
              <div className="activity__row" key={entry.id}>
                <span>{entry.text}</span>
                <time>{relativeTime(entry.at)}</time>
              </div>
            ))}
            {activity.length === 0 && <div className="activity__row"><span>Henüz hareket yok</span></div>}
          </div>
        </div>

        <div className="stack">
          <div className="login__stats">
            {projects.length} proje · {summary.openBugs} açık hata · {summary.live} canlı
          </div>
          <div className="meter">
            <div className="meter__live" style={{ width: `${summary.livePct}%` }} />
            <div className="meter__dev" style={{ width: `${summary.devPct}%` }} />
            <div className="meter__test" style={{ width: `${summary.testPct}%` }} />
          </div>
        </div>
      </aside>
    </div>
  );
}
