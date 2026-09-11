import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { QuickAddProvider } from './components/QuickAdd';
import { Login } from './pages/Login';
import { Projects } from './pages/Projects';
import { ProjectDetail } from './pages/ProjectDetail';
import { PasteParse } from './pages/PasteParse';
import { AllBugs } from './pages/AllBugs';
import { AllChangelog, AllCredentials, AllMcp, AllTime } from './pages/GlobalPages';
import { useAuth } from './lib/auth';
import { useStore } from './lib/store';

export function App() {
  const { session, ready } = useAuth();
  const { error, localMode } = useStore();

  // Yerel mod uyarısı bir kez görünür, sonra içeriğin önünden çekilir.
  const [showLocalHint, setShowLocalHint] = useState(true);
  useEffect(() => {
    if (!localMode) return undefined;
    const timer = window.setTimeout(() => setShowLocalHint(false), 4000);
    return () => window.clearTimeout(timer);
  }, [localMode]);

  if (!ready) return <div className="empty">Yükleniyor…</div>;

  if (!session) {
    return (
      <Routes>
        <Route path="/giris" element={<Login />} />
        <Route path="*" element={<Navigate to="/giris" replace />} />
      </Routes>
    );
  }

  return (
    <QuickAddProvider>
      <Shell>
        <Routes>
          <Route path="/" element={<Projects />} />
          <Route path="/proje/:slug" element={<ProjectDetail />} />
          <Route path="/proje/:slug/:tab" element={<ProjectDetail />} />
          <Route path="/yapistir" element={<PasteParse />} />
          <Route path="/hatalar" element={<AllBugs />} />
          <Route path="/changelog" element={<AllChangelog />} />
          <Route path="/sifreler" element={<AllCredentials />} />
          <Route path="/mcp" element={<AllMcp />} />
          <Route path="/zaman" element={<AllTime />} />
          <Route path="/giris" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>

      {error && <div className="toast">Veri hatası: {error}</div>}
      {localMode && !error && showLocalHint && (
        <button type="button" className="toast" onClick={() => setShowLocalHint(false)}>
          Yerel mod — Appwrite bağlı değil
        </button>
      )}
    </QuickAddProvider>
  );
}
