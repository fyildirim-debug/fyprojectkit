import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { appwriteConfigured, getAccount } from './appwrite';

interface Session {
  name: string;
  email: string;
}

interface AuthValue {
  session: Session | null;
  ready: boolean;
  /** Appwrite bağlı değilken giriş yerel olarak tutulur; ekranda belirtilir. */
  localMode: boolean;
  signIn: (email: string, password: string, remember: boolean) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

const LOCAL_KEY = 'takip.session.v1';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      if (appwriteConfigured) {
        try {
          const account = await getAccount().get();
          if (!cancelled) setSession({ name: account.name || 'Kullanıcı', email: account.email });
        } catch {
          if (!cancelled) setSession(null);
        }
      } else {
        const raw = window.localStorage.getItem(LOCAL_KEY) ?? window.sessionStorage.getItem(LOCAL_KEY);
        if (!cancelled && raw) {
          try {
            setSession(JSON.parse(raw) as Session);
          } catch {
            setSession(null);
          }
        }
      }
      if (!cancelled) setReady(true);
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string, remember: boolean) => {
    const trimmed = email.trim();
    if (!trimmed) throw new Error('E-posta gerekli.');

    if (appwriteConfigured) {
      const account = getAccount();
      await account.createEmailPasswordSession(trimmed, password);
      const me = await account.get();
      setSession({ name: me.name || 'Kullanıcı', email: me.email });
      return;
    }

    // Yerel mod: backend yokken paneli açabilmek için oturum tarayıcıda tutulur.
    if (password.length < 4) throw new Error('Şifre en az 4 karakter olmalı.');
    const next: Session = { name: trimmed.split('@')[0] || 'Kullanıcı', email: trimmed };
    const store = remember ? window.localStorage : window.sessionStorage;
    store.setItem(LOCAL_KEY, JSON.stringify(next));
    setSession(next);
  }, []);

  const signOut = useCallback(async () => {
    if (appwriteConfigured) {
      try {
        await getAccount().deleteSession('current');
      } catch {
        // Oturum zaten düşmüş olabilir.
      }
    }
    window.localStorage.removeItem(LOCAL_KEY);
    window.sessionStorage.removeItem(LOCAL_KEY);
    setSession(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ session, ready, localMode: !appwriteConfigured, signIn, signOut }),
    [session, ready, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth, AuthProvider içinde kullanılmalı.');
  return value;
}
