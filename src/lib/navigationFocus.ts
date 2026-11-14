export type NavigationFocus = 'workout' | 'nutrition' | 'hybrid';

export const DEFAULT_NAVIGATION_FOCUS: NavigationFocus = 'hybrid';

export function resolveNavigationFocus(raw: unknown): NavigationFocus {
  if (raw === 'workout' || raw === 'nutrition' || raw === 'hybrid') return raw;
  return DEFAULT_NAVIGATION_FOCUS;
}

export type NavItem = {
  path: string;
  messageKey: string;
};

const ALL: NavItem[] = [
  { path: '/', messageKey: 'nav.dashboard' },
  { path: '/workouts', messageKey: 'nav.workouts' },
  { path: '/nutrition', messageKey: 'nav.nutrition' },
  { path: '/coach', messageKey: 'nav.coach' },
  { path: '/stats', messageKey: 'nav.stats' },
  { path: '/social', messageKey: 'nav.social' },
  { path: '/profile', messageKey: 'nav.profile' },
];

export function splitNavItems(focus: NavigationFocus): { primary: NavItem[]; overflow: NavItem[] } {
  if (focus === 'hybrid') {
    // Coach in Primary für Discoverability; Stats/Social/Profil im Overflow
    const primaryPaths = new Set(['/', '/workouts', '/nutrition', '/coach']);
    return {
      primary: ALL.filter(i => primaryPaths.has(i.path)),
      overflow: ALL.filter(i => !primaryPaths.has(i.path)),
    };
  }
  if (focus === 'workout') {
    const primaryPaths = new Set(['/', '/workouts', '/coach', '/stats']);
    return {
      primary: ALL.filter(i => primaryPaths.has(i.path)),
      overflow: ALL.filter(i => !primaryPaths.has(i.path)),
    };
  }
  // nutrition-first
  const primaryPaths = new Set(['/', '/nutrition', '/coach', '/stats']);
  return {
    primary: ALL.filter(i => primaryPaths.has(i.path)),
    overflow: ALL.filter(i => !primaryPaths.has(i.path)),
  };
}
