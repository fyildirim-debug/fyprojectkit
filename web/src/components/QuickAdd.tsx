import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PRIORITY_LABELS,
  parseQuickAdd,
  type ItemType,
  type Priority,
} from '@takip/shared';
import { useStore } from '../lib/store';

type DraftKind = ItemType | 'note';

const KINDS: { key: DraftKind; label: string }[] = [
  { key: 'bug', label: 'HATA' },
  { key: 'task', label: 'İŞ' },
  { key: 'note', label: 'NOT' },
];

interface QuickAddValue {
  open: (projectId?: string) => void;
  close: () => void;
}

const QuickAddContext = createContext<QuickAddValue | null>(null);

export function useQuickAdd(): QuickAddValue {
  const value = useContext(QuickAddContext);
  if (!value) throw new Error('useQuickAdd, QuickAddProvider içinde kullanılmalı.');
  return value;
}

/**
 * 05 — Her ekrandan ⌘K ile açılan tek satırlık ekleme paneli.
 * Satırda `!kritik` ve `#etiket` yazılabilir; uzun metin yapıştırılırsa
 * ayrıştırma ekranına devreder.
 */
export function QuickAddProvider({ children }: { children: ReactNode }) {
  const { projects, items, addItem, addNote } = useStore();
  const navigate = useNavigate();

  const [isOpen, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [kind, setKind] = useState<DraftKind>('bug');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const open = useCallback(
    (preselect?: string) => {
      setProjectId(preselect ?? projects[0]?.id ?? null);
      setHighlight(0);
      setOpen(true);
    },
    [projects],
  );

  const close = useCallback(() => {
    setOpen(false);
    setText('');
    setKind('bug');
    setBusy(false);
  }, []);

  // ⌘K / Ctrl+K her yerde çalışır.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (isOpen) close();
        else open();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, open, close]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const parsed = useMemo(() => parseQuickAdd(text), [text]);

  const openCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      if (item.status !== 'open') continue;
      counts.set(item.projectId, (counts.get(item.projectId) ?? 0) + 1);
    }
    return counts;
  }, [items]);

  const priority: Priority = parsed.priority ?? (kind === 'task' ? 'istek' : 'orta');
  const selected = projects[highlight] ?? projects.find((project) => project.id === projectId) ?? null;

  async function save(keepOpen: boolean) {
    const target = selected;
    if (!target || !parsed.title.trim() || busy) return;
    setBusy(true);
    try {
      if (kind === 'note') {
        await addNote(target.id, parsed.title, 'hızlı ekleme');
      } else {
        await addItem({
          projectId: target.id,
          title: parsed.title,
          type: kind,
          priority,
          tag: parsed.tag ?? '',
        });
      }
      if (keepOpen) {
        setText('');
        setBusy(false);
      } else {
        close();
      }
    } catch {
      setBusy(false);
    }
  }

  const value = useMemo<QuickAddValue>(() => ({ open, close }), [open, close]);

  return (
    <QuickAddContext.Provider value={value}>
      {children}

      {isOpen && (
        <div
          className="overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <div className="palette" role="dialog" aria-label="Hızlı ekleme">
            <div className="palette__input">
              <span className={`pill ${selected ? 'pill--accent' : 'pill--neutral'}`}>
                {selected?.name ?? 'proje yok'}
              </span>
              <input
                ref={inputRef}
                value={text}
                placeholder="Ne oldu? — !kritik ve #etiket yazabilirsin"
                onChange={(event) => setText(event.target.value)}
                onPaste={(event) => {
                  // Uzun metin: tek satır yerine ayrıştırma ekranına gitmek daha doğru.
                  const pasted = event.clipboardData.getData('text');
                  if (pasted.split('\n').filter((line) => line.trim()).length > 2) {
                    event.preventDefault();
                    close();
                    navigate('/yapistir', {
                      state: { text: pasted, projectId: selected?.id ?? null },
                    });
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') close();
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setHighlight((current) => Math.min(current + 1, projects.length - 1));
                  }
                  if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setHighlight((current) => Math.max(current - 1, 0));
                  }
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void save(event.shiftKey);
                  }
                  if (event.key === 'Tab') {
                    event.preventDefault();
                    const index = KINDS.findIndex((entry) => entry.key === kind);
                    setKind(KINDS[(index + 1) % KINDS.length].key);
                  }
                }}
              />
              <span className="palette__esc">ESC</span>
            </div>

            <div className="palette__meta">
              {KINDS.map((entry) => (
                <button
                  key={entry.key}
                  type="button"
                  className={`type-chip ${kind === entry.key ? 'type-chip--on' : ''}`}
                  onClick={() => setKind(entry.key)}
                >
                  {entry.label}
                </button>
              ))}

              {kind !== 'note' && (
                <span className={`type-chip push-right type-chip--p-${priority}`}>
                  !{PRIORITY_LABELS[priority].toLocaleLowerCase('tr')}
                </span>
              )}
              {parsed.tag && <span className="type-chip">#{parsed.tag}</span>}
            </div>

            <div className="palette__list">
              <div className="palette__section">PROJE SEÇ</div>
              {projects.map((project, index) => (
                <button
                  key={project.id}
                  type="button"
                  className={`palette__option ${index === highlight ? 'palette__option--on' : ''}`}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => {
                    setHighlight(index);
                    void save(false);
                  }}
                >
                  <i className={`dot dot--${project.status}`} />
                  <span>{project.name}</span>
                  <em>{openCounts.get(project.id) ?? 0} açık</em>
                  {index === highlight && <span className="palette__enter">↵</span>}
                </button>
              ))}
            </div>

            <div className="palette__foot">
              <span>↵ kaydet</span>
              <span>⇧↵ kaydet ve devam</span>
              <span>⇥ tür değiştir</span>
              <span>⌘V uzun metin → ayrıştır</span>
            </div>
          </div>
        </div>
      )}
    </QuickAddContext.Provider>
  );
}
