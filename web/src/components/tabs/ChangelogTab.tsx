import { useMemo, useState } from 'react';
import {
  CHANGE_KIND_LABELS,
  compareVersions,
  formatDate,
  releasesToMarkdown,
  type Project,
} from '@takip/shared';
import { useStore } from '../../lib/store';
import { CHANGE_KIND_CLASS, useCopy } from '../../lib/ui';

/**
 * 07 — Changelog. Kapanan maddeler otomatik olarak açık taslak sürüme düşer;
 * "Yeni sürüm aç" taslağı yayına alır.
 */
export function ChangelogTab({ project }: { project: Project }) {
  const { releases, changeEntries, publishRelease, deleteRelease } = useStore();
  const { copied, copy } = useCopy();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const projectReleases = useMemo(
    () =>
      releases
        .filter((release) => release.projectId === project.id)
        .sort((a, b) => compareVersions(b.version, a.version)),
    [releases, project.id],
  );

  const entriesByRelease = useMemo(() => {
    const map = new Map<string, typeof changeEntries>();
    for (const entry of changeEntries) {
      if (entry.projectId !== project.id) continue;
      const bucket = map.get(entry.releaseId) ?? [];
      bucket.push(entry);
      map.set(entry.releaseId, bucket);
    }
    return map;
  }, [changeEntries, project.id]);

  const draft = projectReleases.find((release) => release.status === 'draft') ?? null;
  const published = projectReleases.filter((release) => release.status === 'released');
  const draftEntries = draft ? (entriesByRelease.get(draft.id) ?? []) : [];

  const spread = useMemo(() => {
    const counts = { fix: 0, new: 0, improve: 0, removed: 0 };
    for (const entry of changeEntries) {
      if (entry.projectId === project.id) counts[entry.kind] += 1;
    }
    return counts;
  }, [changeEntries, project.id]);

  async function onPublish() {
    if (!draft || busy) return;
    setBusy(true);
    try {
      await publishRelease(draft.id);
    } finally {
      setBusy(false);
    }
  }

  /** İki tıklama: ilki "EMİN?" yapar, ikincisi siler. Geri alma yok. */
  async function onDelete(releaseId: string) {
    if (confirming !== releaseId) {
      setConfirming(releaseId);
      return;
    }
    setConfirming(null);
    setFailure(null);
    setDeleting(releaseId);
    setBusy(true);
    try {
      await deleteRelease(releaseId);
    } catch (cause) {
      // Sessizce yutulursa "sil dedim, olmadı" durumu doğuyor — sebebi göster.
      setFailure(cause instanceof Error ? cause.message : 'Sürüm silinemedi.');
    } finally {
      setDeleting(null);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="subbar">
        <span className="topbar__crumb">{project.name} /</span>
        <span className="topbar__title">Changelog</span>
        <div className="topbar__actions">
          <button
            type="button"
            className="btn"
            onClick={() =>
              copy(
                releasesToMarkdown(
                  projectReleases,
                  changeEntries.filter((entry) => entry.projectId === project.id),
                  project.name,
                ),
                'md',
              )
            }
          >
            {copied === 'md' ? 'Kopyalandı' : 'Markdown kopyala'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => void onPublish()}
            disabled={!draft || draftEntries.length === 0 || busy}
            title={draft ? `${draft.version} sürümünü yayına al` : 'Taslak sürüm yok'}
          >
            Yeni sürüm aç
          </button>
        </div>
      </div>

      {failure && (
        <div className="subbar">
          <span className="subbar__error">
            Silinemedi: {failure} — tekrar denemek kaldığı yerden devam eder.
          </span>
          <button type="button" className="icon-btn push-right" onClick={() => setFailure(null)}>
            KAPAT
          </button>
        </div>
      )}

      <div className="detail">
        <div className="changelog">
          {[...(draft ? [draft] : []), ...published].map((release, index) => {
            const entries = entriesByRelease.get(release.id) ?? [];
            if (entries.length === 0 && release.status !== 'draft') return null;
            const current = index === 0;

            return (
              <section className="release" key={release.id}>
                <div className="release__side">
                  <span className={`release__version ${current ? 'release__version--current' : ''}`}>
                    {release.version}
                  </span>
                  <span className="release__date">{formatDate(release.date)}</span>
                  {release.status === 'draft' ? (
                    <span className="pill pill--neutral">TASLAK</span>
                  ) : (
                    current && <span className="pill pill--green">YAYINDA</span>
                  )}

                  <button
                    type="button"
                    className={`icon-btn release__delete ${
                      confirming === release.id ? 'icon-btn--danger' : ''
                    }`}
                    disabled={busy}
                    title={
                      confirming === release.id
                        ? `${release.version} ve changelog satırları kalıcı olarak silinir`
                        : 'Sürümü sil'
                    }
                    onBlur={() => setConfirming(null)}
                    onClick={() => void onDelete(release.id)}
                  >
                    {deleting === release.id
                      ? 'SİLİNİYOR…'
                      : confirming === release.id
                        ? 'EMİN?'
                        : 'SİL'}
                  </button>
                </div>

                <div className={`release__spine ${current ? 'release__spine--current' : ''}`}>
                  <i />
                </div>

                <div className="release__entries">
                  {entries.map((entry) => (
                    <div className="entry" key={entry.id}>
                      <span className={`entry__kind ${CHANGE_KIND_CLASS[entry.kind]}`}>
                        {CHANGE_KIND_LABELS[entry.kind].toLocaleUpperCase('tr')}
                      </span>
                      <span className={`entry__text ${current ? 'entry__text--current' : ''}`}>
                        {entry.text}
                      </span>
                      {entry.refNo && <span className="entry__ref">#{entry.refNo}</span>}
                    </div>
                  ))}
                  {entries.length === 0 && (
                    <span className="entry__text">
                      Henüz madde yok — bir hatayı yapıldı işaretle, buraya düşsün.
                    </span>
                  )}
                </div>
              </section>
            );
          })}

          {projectReleases.length === 0 && <div className="empty">Henüz sürüm yok.</div>}
        </div>

        <aside className="aside aside--changelog">
          <span className="eyebrow">SIRADAKİ SÜRÜM</span>
          {draft ? (
            <div className="draft-release">
              <div className="row-between">
                <span className="draft-release__version">{draft.version}</span>
                <span className="pill pill--neutral">TASLAK</span>
              </div>

              <div className="stack stack--s">
                {draftEntries.map((entry) => (
                  <div className="draft-release__line" key={entry.id}>
                    <i />
                    <span>{entry.text}</span>
                  </div>
                ))}
                {draftEntries.length === 0 && (
                  <span className="aside__hint">Kapanan madde bekleniyor.</span>
                )}
              </div>

              <div className="draft-release__foot">
                Kapanan {draftEntries.length} madde otomatik eklendi
              </div>
            </div>
          ) : (
            <div className="draft-release">
              <span className="aside__hint">
                Açık taslak yok. Bir madde kapatıldığında yenisi açılır.
              </span>
            </div>
          )}

          <div className="divider" />

          <span className="eyebrow">DAĞILIM</span>
          <div className="stack stack--s">
            <div className="kv">
              <span>Düzeltme</span>
              <span>{spread.fix}</span>
            </div>
            <div className="kv">
              <span>Yeni</span>
              <span>{spread.new}</span>
            </div>
            <div className="kv">
              <span>İyileşme</span>
              <span>{spread.improve}</span>
            </div>
            <div className="kv">
              <span>Kaldırıldı</span>
              <span>{spread.removed}</span>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
