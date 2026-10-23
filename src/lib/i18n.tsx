import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import { MESSAGES } from './i18nMessages';

export type UiLocale = 'de' | 'en';

const STORAGE_KEY = 'vrtx_ui_locale';

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
    vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ''
  );
}

type I18nContextType = {
  locale: UiLocale;
  t: (key: string, vars?: Record<string, string | number>) => string;
  setLocale: (l: UiLocale) => Promise<void>;
};

const I18nContext = createContext<I18nContextType | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { profile, updateProfile } = useAuth();
  const [guestLocale, setGuestLocale] = useState<UiLocale>(() => {
    try {
      const s = localStorage.getItem(STORAGE_KEY);
      if (s === 'de' || s === 'en') return s;
    } catch {
      /* ignore */
    }
    return 'en';
  });

  const locale = useMemo<UiLocale>(() => {
    if (profile?.uiLocale === 'de' || profile?.uiLocale === 'en') return profile.uiLocale;
    return guestLocale;
  }, [profile?.uiLocale, guestLocale]);

  useEffect(() => {
    document.documentElement.lang = locale === 'de' ? 'de' : 'en';
  }, [locale]);

  const setLocale = useCallback(
    async (l: UiLocale) => {
      try {
        localStorage.setItem(STORAGE_KEY, l);
      } catch {
        /* ignore */
      }
      setGuestLocale(l);
      if (profile) {
        await updateProfile({ uiLocale: l });
      }
    },
    [profile, updateProfile]
  );

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const row = MESSAGES[key];
      const raw = row ? (locale === 'de' ? row.de : row.en) : key;
      return interpolate(raw, vars);
    },
    [locale]
  );

  return <I18nContext.Provider value={{ locale, t, setLocale }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextType {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
