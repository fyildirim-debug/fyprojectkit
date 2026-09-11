import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  PRIORITY_LABELS,
  formatDate,
  parsePastedText,
  type DraftItem,
  type SplitMode,
} from '@takip/shared';
import { Topbar } from '../components/Topbar';
import { useStore } from '../lib/store';

const MODES: { key: SplitMode; label: string }[] = [
  { key: 'line', label: 'Satır satır' },
  { key: 'bullet', label: 'Madde imi' },
  { key: 'sentence', label: 'Cümle' },
];

const SAMPLE = `Merhaba, birkaç şey var:
- öğrenci kaydında tc hatası veriyor
- rapor sayfası telefonda taşıyor
- devamsızlık smsi iki kere gidiyor
- excel çıktısı da olsa çok iyi olur
- veli girişinde şifre sıfırlama yok
- ana sayfadaki logo eski logo
- bir de sözleşmeyi yenilemeliyiz`;

/**
 * 06 — Yapıştır & ayrıştır. Müşteri mesajı maddelere bölünür, her maddeye
 * tür ve öncelik önerilir; seçilenler tek seferde projeye eklenir.
 */
export function PasteParse() {
  const { projects, addItem, addNote } = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const handoff = location.state as { text?: string; projectId?: string | null } | null;

  const [text, setText] = useState(handoff?.text ?? SAMPLE);
  const [mode, setMode] = useState<SplitMode>('line');
  const [projectId, setProjectId] = useState<string | null>(handoff?.projectId ?? null);
  const [drafts, setDrafts] = useState<DraftItem[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!projectId && projects.length > 0) setProjectId(projects[0].id);
  }, [projects, projectId]);

  // Metin ya da mod değişince öneriler baştan üretilir.
  useEffect(() => {
    setDrafts(parsePastedText(text, mode));
  }, [text, mode]);

  const project = useMemo(
    () => projects.find((candidate) => candidate.id === projectId) ?? null,
    [projects, projectId],
  );

  const selectedCount = drafts.filter((draft) => draft.selected).length;

  function toggle(index: number) {
    setDrafts((current) =>
      current.map((draft, position) =>
        position === index ? { ...draft, selected: !draft.selected } : draft,
      ),
    );
  }

  async function commit() {
    if (!project || selectedCount === 0 || busy) return;
    setBusy(true);
    try {
      // Sırayla ekleniyor: refNo hesabı bir önceki kayda bağlı.
      for (const draft of drafts) {
        if (!draft.selected) continue;
        if (draft.type === 'note') {
          await addNote(project.id, draft.title, 'yapıştırılan mesaj');
        } else {
          await addItem({
            projectId: project.id,
            title: draft.title,
            type: draft.type,
            priority: draft.priority,
            tag: draft.tag,
            reporter: 'Müşteri mesajı',
          });
        }
      }
      navigate(`/proje/${project.slug}/hatalar`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Topbar
        title="Yapıştır & ayrıştır"
        showDefaultActions={false}
        actions={
          <span className="panel__meta">
            {drafts.length} madde bulundu · {selectedCount} seçili
          </span>
        }
      />

      <div className="parse">
        <div className="parse__source">
          <span className="eyebrow">YAPIŞTIRILAN METİN</span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Müşteri mesajını buraya yapıştır…"
          />

          <div className="mode-switch">
            {MODES.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={mode === option.key}
                onClick={() => setMode(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="stack stack--s">
            <span className="eyebrow">HEDEF PROJE</span>
            <div className="chips">
              {projects.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={`type-chip ${projectId === entry.id ? 'type-chip--on' : ''}`}
                  onClick={() => setProjectId(entry.id)}
                >
                  <i className={`dot dot--${entry.status}`} />
                  {entry.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="parse__result">
          <div className="row-between">
            <span className="eyebrow">AYRIŞTIRILAN MADDELER</span>
            <span className="panel__meta">tür ve öncelik önerildi</span>
          </div>

          <div className="parse__list">
            {drafts.map((draft, index) => (
              <button
                key={`${draft.title}-${index}`}
                type="button"
                className={`draft ${draft.selected ? '' : 'draft--off'}`}
                onClick={() => toggle(index)}
              >
                <span className={`draft__check ${draft.selected ? 'draft__check--on' : ''}`}>✓</span>
                <span className="draft__title">{draft.title}</span>
                <span
                  className={`draft__kind ${draft.type === 'note' ? '' : `draft__kind--${draft.priority}`}`}
                >
                  {draft.type === 'note'
                    ? 'NOT'
                    : `${draft.type === 'bug' ? 'HATA' : 'İŞ'} · ${PRIORITY_LABELS[
                        draft.priority
                      ].toLocaleUpperCase('tr')}`}
                </span>
              </button>
            ))}

            {drafts.length === 0 && (
              <div className="empty">Metinden madde çıkarılamadı — başka bir mod dene.</div>
            )}
          </div>

          <div className="parse__foot">
            <span className="panel__meta push-right">
              Kaynak: müşteri mesajı · {formatDate(new Date().toISOString())}
            </span>
            <button
              type="button"
              className="btn"
              onClick={() =>
                setDrafts((current) => current.map((draft) => ({ ...draft, selected: false })))
              }
            >
              Tümünü kaldır
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void commit()}
              disabled={busy || selectedCount === 0 || !project}
            >
              {busy ? 'Ekleniyor…' : `${selectedCount} maddeyi ekle`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
