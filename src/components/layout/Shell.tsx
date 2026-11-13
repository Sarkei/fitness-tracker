/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReactNode, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/src/lib/AuthContext';
import { useI18n } from '@/src/lib/i18n';
import { initMobileViewportInsets, resetMobileChromeAfterRouteChange } from '@/src/lib/mobileViewport';

import { applyTheme, persistTheme, resolveTheme } from '@/src/lib/themePreference';
import { ExerciseDetailProvider } from '@/src/lib/exerciseDetailContext';
import AppHeader from './AppHeader';

interface ShellProps {
  children: ReactNode;
}

/** Seiten mit eigenem Vollbreite-Aufbau (Übersicht) bringen ihren Container selbst mit. */
const FULL_BLEED_ROUTES = new Set(['/']);

export default function Shell({ children }: ShellProps) {
  const location = useLocation();
  const { profile } = useAuth();
  const { t } = useI18n();

  useEffect(() => {
    resetMobileChromeAfterRouteChange();
  }, [location.pathname]);

  useEffect(() => initMobileViewportInsets(), []);

  useEffect(() => {
    const mode = resolveTheme(profile?.themePreference);
    applyTheme(mode);
    if (profile?.themePreference === 'light' || profile?.themePreference === 'dark') {
      persistTheme(mode);
    }
  }, [profile?.themePreference]);

  const fullBleed = FULL_BLEED_ROUTES.has(location.pathname);

  return (
    <ExerciseDetailProvider>
      <div className="app">
        <AppHeader />

        <main>
          {fullBleed ? (
            children
          ) : (
            <div className="shell-page mx-auto max-w-6xl px-4 pt-4 pb-16 sm:px-5 sm:pt-6 lg:px-5 lg:pt-8 lg:pb-20">
              {children}
            </div>
          )}
        </main>
      </div>
    </ExerciseDetailProvider>
  );
}
