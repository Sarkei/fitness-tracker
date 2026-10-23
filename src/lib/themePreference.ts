/**
 * Theme für Login (ohne Profil) und App (mit Profil) — Standard: Dark.
 */

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'vrtx_theme';

export function getStoredTheme(): ThemeMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark') return raw;
  } catch {
    /* ignore */
  }
  return 'dark';
}

export function setStoredTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function applyTheme(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  if (mode === 'dark') document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
  document.documentElement.removeAttribute('data-theme-variant');
}

/** Gespeichertes Theme setzen und sofort auf <html> anwenden */
export function persistTheme(mode: ThemeMode): void {
  setStoredTheme(mode);
  applyTheme(mode);
}

export function resolveTheme(profilePreference?: string | null): ThemeMode {
  if (profilePreference === 'light') return 'light';
  if (profilePreference === 'dark') return 'dark';
  return getStoredTheme();
}
