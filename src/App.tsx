import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ResetPasswordScreen from './components/auth/ResetPasswordScreen';
import { useAuth } from './lib/AuthContext';
import Shell from './components/layout/Shell';
import OnboardingFlow from './components/onboarding/OnboardingFlow';
import { prefetchMainRoutes } from './lib/prefetchRoutes';
import { needsDataMigration } from './lib/dataMigration';
import DataMigrationOverlay from './components/system/DataMigrationOverlay';
import RouteErrorBoundary from './components/ui/RouteErrorBoundary';

const DashboardPage = lazy(() => import('./components/dashboard/DashboardPage'));
const WorkoutPage = lazy(() => import('./components/workout/WorkoutPage'));
const NutritionPage = lazy(() => import('./components/nutrition/NutritionPage'));
const CoachHubPage = lazy(() => import('./components/coach/CoachHubPage'));
const ProfilePage = lazy(() => import('./components/profile/ProfilePage'));
const StatisticsPage = lazy(() => import('./components/stats/StatisticsPage'));
const SocialPage = lazy(() => import('./components/social/SocialPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center p-8" role="status" aria-label="Loading">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
    </div>
  );
}

const AppContent = () => {
  const { user, profile } = useAuth();

  useEffect(() => {
    if (user && profile?.onboarded) {
      prefetchMainRoutes();
    }
  }, [user, profile?.onboarded]);

  if (!user) return null;

  if (profile && !profile.onboarded) {
    return <OnboardingFlow />;
  }

  if (profile && needsDataMigration(profile)) {
    return <DataMigrationOverlay />;
  }

  return (
    <Shell>
      <Routes>
        <Route
          path="/"
          element={
            <RouteErrorBoundary title="Dashboard konnte nicht geladen werden">
              <DashboardPage />
            </RouteErrorBoundary>
          }
        />
        <Route
          path="/workouts"
          element={
            <RouteErrorBoundary title="Workouts konnten nicht geladen werden">
              <WorkoutPage />
            </RouteErrorBoundary>
          }
        />
        <Route
          path="/nutrition"
          element={
            <RouteErrorBoundary title="Ernährung konnte nicht geladen werden">
              <NutritionPage />
            </RouteErrorBoundary>
          }
        />
        <Route
          path="/coach"
          element={
            <RouteErrorBoundary title="Coach konnte nicht geladen werden">
              <CoachHubPage />
            </RouteErrorBoundary>
          }
        />
        <Route
          path="/stats"
          element={
            <RouteErrorBoundary title="Statistiken konnten nicht geladen werden">
              <StatisticsPage />
            </RouteErrorBoundary>
          }
        />
        <Route
          path="/social"
          element={
            <RouteErrorBoundary title="Community konnte nicht geladen werden">
              <SocialPage />
            </RouteErrorBoundary>
          }
        />
        <Route
          path="/profile"
          element={
            <RouteErrorBoundary title="Profil konnte nicht geladen werden">
              <ProfilePage />
            </RouteErrorBoundary>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
};

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/reset-password" element={<ResetPasswordScreen />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<AppContent />} />
      </Routes>
    </Suspense>
  );
}
