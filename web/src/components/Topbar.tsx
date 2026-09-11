import { useEffect, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuickAdd } from './QuickAdd';

interface TopbarProps {
  title: ReactNode;
  crumb?: string;
  search?: { value: string; onChange: (value: string) => void; placeholder?: string };
  actions?: ReactNode;
  /** Varsayılan sağ taraf: "Yapıştır & ayrıştır" + "Hızlı ekle ⌘K". */
  showDefaultActions?: boolean;
}

export function Topbar({ title, crumb, search, actions, showDefaultActions = true }: TopbarProps) {
  const navigate = useNavigate();
  const quickAdd = useQuickAdd();
  const inputRef = useRef<HTMLInputElement>(null);

  // "/" tuşu aramaya odaklanır — tasarımdaki kısayol.
  useEffect(() => {
    if (!search) return undefined;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';
      if (event.key === '/' && !typing) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [search]);

  return (
    <header className="topbar">
      {crumb && <span className="topbar__crumb">{crumb}</span>}
      <span className="topbar__title">{title}</span>

      {search && (
        <div className="search">
          <kbd>/</kbd>
          <input
            ref={inputRef}
            value={search.value}
            placeholder={search.placeholder ?? 'Proje, hata veya not ara'}
            onChange={(event) => search.onChange(event.target.value)}
          />
        </div>
      )}

      <div className="topbar__actions">
        {actions}
        {showDefaultActions && (
          <>
            <button type="button" className="btn" onClick={() => navigate('/yapistir')}>
              Yapıştır & ayrıştır
            </button>
            <button type="button" className="btn btn--primary" onClick={() => quickAdd.open()}>
              Hızlı ekle <kbd>⌘K</kbd>
            </button>
          </>
        )}
      </div>
    </header>
  );
}
