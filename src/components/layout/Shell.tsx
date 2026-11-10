/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ReactNode } from 'react';
import SimpleTabBar from '../../simple/SimpleTabBar';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/src/lib/AuthContext';
import { useEffect } from 'react';
import { initMobileViewportInsets, resetMobileChromeAfterRouteChange } from '@/src/lib/mobileViewport';


import { applyTheme, persistTheme, resolveTheme } from '@/src/lib/themePreference';
import { ExerciseDetailProvider } from '@/src/lib/exerciseDetailContext';


interface ShellProps {
  children: ReactNode;
}

export default function Shell({ children }: ShellProps) {
  const location = useLocation();
  const { profile } = useAuth();

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

  return (
    <ExerciseDetailProvider>
      <div className="min-h-[100dvh] min-h-[-webkit-fill-available] bg-[var(--background)] text-[var(--foreground)] transition-colors duration-300">
        <SimpleTabBar />
        {/* Sidebar erst ab lg — Tablet behält Bottom-Nav */}
        <main className="min-h-[100dvh] min-h-[-webkit-fill-available] safe-area-pt lg:pt-0">
          <div
            className="shell-page max-w-6xl mx-auto px-3 pt-3 sm:px-4 sm:pt-6 max-lg:pb-[var(--shell-pad-bottom)] lg:px-10 lg:pt-12 lg:pb-12"
          >
            {children}
          </div>
        </main>
      </div>
    </ExerciseDetailProvider>
  );
}
