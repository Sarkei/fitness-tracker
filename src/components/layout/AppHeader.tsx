import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Dumbbell, Menu, Moon, Sun, X } from 'lucide-react';
import { useAuth } from '@/src/lib/AuthContext';
import { useI18n } from '@/src/lib/i18n';
import { applyTheme, getStoredTheme, persistTheme, resolveTheme, type ThemeMode } from '@/src/lib/themePreference';

/**
 * Kopfzeile nach der Portfolio-Vorlage (knowledge/design-system/layout.md, Abschnitt 2):
 * Marke links, Navigation als Pillen mittig, Theme-Knopf und Mobilmenü rechts.
 */
type NavEntry = { to: string; labelKey: string; end?: boolean };

const PRIMARY: NavEntry[] = [
  { to: '/', labelKey: 'nav.dashboard', end: true },
  { to: '/today', labelKey: 'nav.today' },
  { to: '/training', labelKey: 'nav.training' },
  { to: '/foods', labelKey: 'nav.nutrition.short' },
  { to: '/coach', labelKey: 'nav.coach.short' },
  { to: '/stats', labelKey: 'nav.stats.short' },
  { to: '/profile', labelKey: 'nav.profile' },
];

const SECONDARY: NavEntry[] = [
  { to: '/workouts', labelKey: 'nav.workouts' },
  { to: '/nutrition', labelKey: 'nav.nutrition' },
  { to: '/social', labelKey: 'nav.social' },
];

/** Bereichsname für die Kopfzeile (11px, uppercase) — folgt der aktuellen Route. */
function sectionLabelKey(pathname: string): string {
  const all = [...PRIMARY, ...SECONDARY];
  const exact = all.find((item) => item.to === pathname);
  if (exact) return exact.labelKey;
  const nested = all
    .filter((item) => item.to !== '/' && pathname.startsWith(`${item.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0];
  return nested?.labelKey ?? 'nav.dashboard';
}

/**
 * Detailseiten liegen unter einem anderen Pfad als ihre Pille
 * (z. B. /workouts → Training, /nutrition → Ernährung).
 */
const PILL_MATCH: Record<string, string[]> = {
  '/training': ['/training', '/workouts'],
  '/foods': ['/foods', '/nutrition'],
};

function isPillActive(item: NavEntry, pathname: string): boolean {
  if (item.to === '/') return pathname === '/';
  const paths = PILL_MATCH[item.to] ?? [item.to];
  return paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default function AppHeader() {
  const { profile, updateProfile } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());

  useEffect(() => {
    const mode = resolveTheme(profile?.themePreference);
    applyTheme(mode);
    setTheme(mode);
  }, [profile?.themePreference]);

  // Mobilmenü schließt bei Navigation
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const toggleTheme = () => {
    const next: ThemeMode = theme === 'dark' ? 'light' : 'dark';
    persistTheme(next);
    setTheme(next);
    if (profile) {
      void updateProfile({ themePreference: next }).catch(() => {
        /* Theme bleibt lokal gesetzt, auch wenn das Profil nicht speichern kann */
      });
    }
  };

  return (
    <header className="app-header">
      <div className="app-container app-header__inner">
        <Link className="app-brand" to="/" aria-label={`${t('app.name')} — ${t('nav.dashboard')}`}>
          <span className="app-brand__mark" aria-hidden>
            <Dumbbell size={20} strokeWidth={1.8} />
          </span>
          <span className="app-brand__text">
            {t('app.name')}
            <span className="app-brand__sub">{t(sectionLabelKey(location.pathname))}</span>
          </span>
        </Link>

        <nav className="app-nav" aria-label={t('nav.primary')}>
          {PRIMARY.map((item) => {
            const active = isPillActive(item, location.pathname);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`app-nav-item${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>

        <div className="app-actions">
          <button
            type="button"
            className="app-iconbtn"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? t('nav.theme.toLight') : t('nav.theme.toDark')}
            title={theme === 'dark' ? t('nav.theme.toLight') : t('nav.theme.toDark')}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            type="button"
            className="app-iconbtn app-mobile-toggle"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? t('nav.closeMenu') : t('nav.openMenu')}
            aria-expanded={open}
          >
            {open ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {open ? (
        <nav className="app-mobile-nav" aria-label={t('nav.primary')}>
          {PRIMARY.map((item) => {
            const active = isPillActive(item, location.pathname);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`app-mobile-nav__item${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {t(item.labelKey)}
              </Link>
            );
          })}
          <p className="app-mobile-nav__label">{t('nav.more')}</p>
          {SECONDARY.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`app-mobile-nav__item${active ? ' is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>
      ) : null}
    </header>
  );
}
