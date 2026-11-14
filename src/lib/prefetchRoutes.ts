/**
 * Lädt Route-Chunks im Hintergrund vor, damit Tab-Wechsel ohne Chunk-Wartezeit auskommt.
 */

const MAIN_ROUTE_IMPORTS = [
  () => import('../pages/OverviewPage'),
  () => import('../simple/TodayPage'),
  () => import('../simple/TrainingPage'),
  () => import('../simple/FoodPage'),
  () => import('../components/workout/WorkoutPage'),
  () => import('../components/nutrition/NutritionPage'),
  () => import('../components/coach/CoachHubPage'),
  () => import('../components/profile/ProfilePage'),
  () => import('../components/stats/StatisticsPage'),
  () => import('../components/social/SocialPage'),
] as const;

let prefetched = false;

export function prefetchMainRoutes(): void {
  if (prefetched || typeof window === 'undefined') return;
  prefetched = true;

  const run = () => {
    for (const load of MAIN_ROUTE_IMPORTS) {
      void load().catch(() => {
        /* ignore – retry on next navigation */
      });
    }
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 2500 });
  } else {
    setTimeout(run, 150);
  }
}
