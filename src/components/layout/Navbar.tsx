/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Home, Dumbbell, Utensils, BarChart2, Users, User, Moon, Sun, ChevronRight, Menu, Brain } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/src/lib/utils';
import { useAuth } from '@/src/lib/AuthContext';
import { useI18n } from '@/src/lib/i18n';
import { resolveNavigationFocus, splitNavItems, type NavItem } from '@/src/lib/navigationFocus';
import MobileQuickActionsSheet from '@/src/components/layout/MobileQuickActionsSheet';
import { resetMobileChromeAfterOverlay } from '@/src/lib/mobileViewport';
import { persistTheme } from '@/src/lib/themePreference';

const ICONS: Record<string, typeof Home> = {
  '/': Home,
  '/workouts': Dumbbell,
  '/nutrition': Utensils,
  '/coach': Brain,
  '/stats': BarChart2,
  '/social': Users,
  '/profile': User,
};

const SHORT_LABEL_KEYS: Record<string, string> = {
  '/': 'nav.dashboard.short',
  '/workouts': 'nav.workouts.short',
  '/nutrition': 'nav.nutrition.short',
  '/coach': 'nav.coach.short',
  '/stats': 'nav.stats.short',
  '/social': 'nav.social.short',
  '/profile': 'nav.profile.short',
};

function NavRowLink({
  item,
  label,
  shortLabel,
  isActive,
  compact,
  profilePhotoURL,
}: {
  item: NavItem;
  label: string;
  shortLabel?: string;
  isActive: boolean;
  compact?: boolean;
  profilePhotoURL?: string;
}) {
  const Icon = ICONS[item.path] ?? Home;
  const isProfile = item.path === '/profile';
  const profilePic = profilePhotoURL?.trim();
  const compactLabel = shortLabel || label;

  return (
    <Link
      to={item.path}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        compact
          ? 'flex flex-1 min-w-0 flex-col items-center justify-center transition-colors relative min-h-[52px] py-1 gap-0.5'
          : 'flex items-center space-x-3 px-4 py-3.5 rounded-xl font-bold uppercase tracking-tight text-[10px] transition-colors duration-200',
        compact
          ? isActive
            ? 'text-brand'
            : 'text-[var(--text-muted)]'
          : isActive
            ? 'ui-mark-selected'
            : 'text-[var(--text-muted)] hover:bg-[var(--border-muted)] hover:text-[var(--text-primary)]',
      )}
    >
      {compact && isActive && (
        <span className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-1 bg-brand rounded-full" />
      )}
      <div
        className={cn(
          compact
            ? 'p-1.5 rounded-xl transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center'
            : '',
          compact && isActive ? 'bg-brand/10' : '',
        )}
      >
        {isProfile && profilePic ? (
          <img
            src={profilePic}
            alt={compact ? label : ''}
            className={cn(
              'w-[22px] h-[22px] rounded-lg object-cover',
              isActive ? 'ring-2 ring-brand' : 'ring-1 ring-[var(--border-muted)]',
            )}
            referrerPolicy="no-referrer"
          />
        ) : (
          <Icon size={compact ? 20 : 18} aria-hidden />
        )}
      </div>
      {compact ? (
        <span className="max-w-full px-0.5 text-center text-[9px] sm:text-[10px] font-black uppercase tracking-wide leading-tight line-clamp-2 break-words">
          {compactLabel}
        </span>
      ) : (
        <span>{label}</span>
      )}
    </Link>
  );
}

export default function Navbar() {
  const location = useLocation();
  const { profile, updateProfile } = useAuth();
  const { t } = useI18n();
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const mobileMoreRef = useRef<HTMLDivElement | null>(null);
  const mobileMoreWasOpenRef = useRef(false);

  const focus = resolveNavigationFocus(profile?.navigationFocus);
  const { primary, overflow } = splitNavItems(focus);
  const desktopOverflow = overflow.filter(i => i.path !== '/profile');
  const mobileOverflow = overflow;

  const mobileFabSplitIdx = Math.ceil(primary.length / 2);
  const mobilePrimaryLeft = primary.slice(0, mobileFabSplitIdx);
  const mobilePrimaryRight = primary.slice(mobileFabSplitIdx);

  useEffect(() => {
    if (!mobileMoreOpen) {
      if (mobileMoreWasOpenRef.current) resetMobileChromeAfterOverlay();
      mobileMoreWasOpenRef.current = false;
      return;
    }
    mobileMoreWasOpenRef.current = true;
    const onDoc = (e: MouseEvent) => {
      const node = e.target as Node;
      if (mobileMoreRef.current?.contains(node)) return;
      const el = e.target as HTMLElement;
      if (el.closest?.('[data-mobile-quick-menu]')) return;
      setMobileMoreOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [mobileMoreOpen]);

  const toggleTheme = async () => {
    if (!profile) return;
    const nextPref = profile.themePreference === 'light' ? 'dark' : 'light';
    persistTheme(nextPref);
    try {
      await updateProfile({ themePreference: nextPref });
    } catch (error) {
      console.error(error);
    }
  };

  const labelFor = (item: NavItem) => t(item.messageKey);
  const shortLabelFor = (item: NavItem) => t(SHORT_LABEL_KEYS[item.path] ?? item.messageKey);
  const closeMore = () => setMobileMoreOpen(false);

  const profilePicUrl = profile?.photoURL?.trim();

  const mobileBottomNav = (
    <nav
      className="mobile-bottom-nav fixed left-0 right-0 z-40 isolate flex w-full max-w-[100vw] flex-row items-end justify-between gap-0 border-t border-[var(--border-muted)] bg-[var(--card-bg)] backdrop-blur-xl supports-[backdrop-filter]:bg-[var(--card-bg)]/95 lg:hidden [transform:translateZ(0)] px-1 pt-1"
    >
      {mobileOverflow.length === 0 ? (
        primary.map(item => (
          <NavRowLink
            key={item.path}
            item={item}
            label={labelFor(item)}
            shortLabel={shortLabelFor(item)}
            isActive={location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path))}
            compact
            profilePhotoURL={profile?.photoURL}
          />
        ))
      ) : (
        <>
          <div className="flex flex-1 min-w-0 justify-evenly items-end">
            {mobilePrimaryLeft.map(item => (
              <NavRowLink
                key={item.path}
                item={item}
                label={labelFor(item)}
                shortLabel={shortLabelFor(item)}
                isActive={location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path))}
                compact
                profilePhotoURL={profile?.photoURL}
              />
            ))}
          </div>

          <div
            className="relative flex-none flex flex-col items-center justify-end px-1 pb-1 z-[45]"
            ref={mobileMoreRef}
          >
            <button
              type="button"
              onClick={() => setMobileMoreOpen(o => !o)}
              aria-expanded={mobileMoreOpen}
              aria-haspopup="menu"
              aria-label={t('nav.more')}
              className={cn(
                'mobile-nav-fab flex h-14 w-14 shrink-0 items-center justify-center rounded-full ui-btn-brand shadow-xl shadow-brand/35 ring-[5px] ring-[var(--card-bg)] transition-transform active:scale-95 mb-0.5',
                mobileMoreOpen && 'ring-brand/40 scale-[1.02]',
              )}
            >
              <Menu size={24} strokeWidth={2.25} />
            </button>
          </div>

          <div className="flex flex-1 min-w-0 justify-evenly items-end">
            {mobilePrimaryRight.map(item => (
              <NavRowLink
                key={item.path}
                item={item}
                label={labelFor(item)}
                shortLabel={shortLabelFor(item)}
                isActive={location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path))}
                compact
                profilePhotoURL={profile?.photoURL}
              />
            ))}
          </div>
        </>
      )}
    </nav>
  );

  const quickSheet =
    typeof document !== 'undefined'
      ? createPortal(
          <MobileQuickActionsSheet
            open={mobileMoreOpen}
            onClose={closeMore}
            overflowItems={mobileOverflow}
            profilePicUrl={profilePicUrl}
            pathname={location.pathname}
            labelFor={labelFor}
          />,
          document.body,
        )
      : null;

  return (
    <>
      <aside className="hidden lg:flex fixed top-0 left-0 bottom-0 w-64 bg-[var(--card-bg)] border-r border-[var(--border-muted)] flex-col z-50">
        <div className="p-8 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <h1 className="text-3xl font-black tracking-tighter uppercase italic">
              VRTX<span className="text-brand">.</span>
            </h1>
          </Link>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={
              profile?.themePreference === 'light' ? t('nav.theme.toDark') : t('nav.theme.toLight')
            }
            className="min-h-[44px] min-w-[44px] p-2 rounded-xl hover:bg-[var(--border-muted)] transition-colors text-[var(--text-muted)] flex items-center justify-center"
          >
            {profile?.themePreference === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>

        <nav className="flex-1 px-6 space-y-1 overflow-y-auto">
          {primary.map(item => (
            <NavRowLink
              key={item.path}
              item={item}
              label={labelFor(item)}
              isActive={location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path))}
              profilePhotoURL={profile?.photoURL}
            />
          ))}

          {desktopOverflow.length > 0 ? (
            <div className="pt-4 mt-2 border-t border-[var(--border-muted)] space-y-1">
              <p className="px-4 pb-1 text-[9px] font-black uppercase tracking-[0.2em] text-[var(--text-muted)]">
                {t('nav.more')}
              </p>
              {desktopOverflow.map(item => (
                <NavRowLink
                  key={item.path}
                  item={item}
                  label={labelFor(item)}
                  isActive={location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path))}
                  profilePhotoURL={profile?.photoURL}
                />
              ))}
            </div>
          ) : null}
        </nav>

        <Link
          to="/profile"
          className={cn(
            'p-6 border-t border-[var(--border-muted)] flex items-center space-x-4 hover:bg-[var(--border-muted)] transition-colors group',
            location.pathname === '/profile' ? 'bg-[var(--border-muted)]' : '',
          )}
        >
          <div
            className={cn(
              'w-12 h-12 rounded-2xl overflow-hidden border-2 flex-shrink-0 transition-all',
              location.pathname === '/profile'
                ? 'border-brand'
                : 'border-brand/20 group-hover:border-brand/50',
            )}
          >
            {profile?.photoURL ? (
              <img
                src={profile.photoURL}
                alt={profile.displayName || ''}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted bg-[var(--background)]">
                <User size={16} />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-black uppercase tracking-tighter truncate">
              {profile?.displayName || t('profile.elite')}
            </p>
            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-[0.2em] font-black mt-0.5">
              {t('nav.profile')}
            </p>
          </div>
          <ChevronRight
            size={14}
            className="text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
          />
        </Link>
      </aside>

      {typeof document !== 'undefined' ? createPortal(mobileBottomNav, document.body) : null}
      {quickSheet}
    </>
  );
}
