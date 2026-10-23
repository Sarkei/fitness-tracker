import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { UserProfile } from '../types';
import { api, getToken, setToken, clearToken } from './api';
import { applyTheme, getStoredTheme, persistTheme, resolveTheme } from './themePreference';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuthContextType {
  user: { id: number; email: string; uid: string } | null;
  profile: UserProfile | null;
  loading: boolean;
  logout: () => void;
  /** Löscht Account + Session, nur wenn Onboarding noch nicht abgeschlossen. */
  cancelRegistration: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (data: Partial<UserProfile> & Record<string, unknown>) => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
  ) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  logout: () => {},
  cancelRegistration: async () => {},
  deleteAccount: async () => {},
  refreshProfile: async () => {},
  updateProfile: async () => {},
  loginWithEmail: async () => {},
  registerWithEmail: async () => {},
  loginWithGoogle: async () => {},
});

// ─── Provider ────────────────────────────────────────────────────────────────

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthContextType['user']>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const applyProfile = (p: UserProfile & { id?: number }) => {
    const uid = p.uid || String((p as any).id || '');
    const numId = parseInt(uid);
    setUser({ id: numId, email: p.email, uid });
    setProfile({ ...p, uid });
    const mode = resolveTheme(p.themePreference);
    applyTheme(mode);
    if (p.themePreference === 'light' || p.themePreference === 'dark') {
      persistTheme(mode);
    }
  };

  const refreshProfile = useCallback(async () => {
    if (!getToken()) return;
    try {
      const p = await api<UserProfile>('/api/profile');
      applyProfile(p);
    } catch {
      clearToken();
      setUser(null);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    refreshProfile().finally(() => setLoading(false));
  }, [refreshProfile]);

  const clearSession = () => {
    clearToken();
    setUser(null);
    setProfile(null);
    applyTheme(getStoredTheme());
  };

  const logout = () => {
    clearSession();
  };

  const deleteAccount = async (password: string) => {
    await api<{ ok?: boolean }>('/api/auth/delete-account', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    clearSession();
  };

  const updateProfile = async (data: Partial<UserProfile> & Record<string, unknown>) => {
    const updated = await api<UserProfile>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    applyProfile(updated);
  };

  const loginWithEmail = async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const { token, profile: p } = await api<{ token: string; profile: UserProfile }>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify({ email: normalizedEmail, password }) }
    );
    setToken(token);
    applyProfile(p);
    const localTheme = getStoredTheme();
    if (p.themePreference !== localTheme) {
      try {
        const updated = await api<UserProfile>('/api/profile', {
          method: 'PATCH',
          body: JSON.stringify({ themePreference: localTheme }),
        });
        applyProfile(updated);
      } catch {
        applyTheme(localTheme);
        persistTheme(localTheme);
      }
    }
  };

  const registerWithEmail = async (
    email: string,
    password: string,
    firstName: string,
    lastName: string,
  ) => {
    const first = firstName.trim();
    const last = lastName.trim();
    const displayName = `${first} ${last}`.trim();
    const { token, profile: p } = await api<{ token: string; profile: UserProfile }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({
          name: displayName,
          firstName: first,
          lastName: last,
          email: email.trim().toLowerCase(),
          password,
          themePreference: getStoredTheme(),
        }),
      }
    );
    setToken(token);
    applyProfile(p);
  };

  const loginWithGoogle = async () => {
    throw new Error('Google-Anmeldung ist für diese App nicht konfiguriert.');
  };

  const cancelRegistration = async () => {
    await api<{ ok?: boolean }>('/api/auth/cancel-registration', { method: 'POST' });
    clearSession();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        logout,
        cancelRegistration,
        deleteAccount,
        refreshProfile,
        updateProfile,
        loginWithEmail,
        registerWithEmail,
        loginWithGoogle,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

/** Volllast-Ladezustand beim Start (Token-Refresh). */
export function AuthBootLoader() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[var(--background)] text-[var(--text-primary)]">
      <div className="text-center">
        <h1 className="text-4xl font-black tracking-tighter uppercase italic mb-6">
          VRTX<span className="text-brand">.</span>
        </h1>
        <Loader2 className="animate-spin text-brand mx-auto" size={32} />
      </div>
    </div>
  );
}
