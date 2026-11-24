import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import ResetPasswordScreen from './components/auth/ResetPasswordScreen';
import { useAuth } from './lib/AuthContext';
import Shell from './components/layout/Shell';
import OnboardingFlow from './components/onboarding/OnboardingFlow';
import { prefetchMainRoutes } from './lib/prefetchRoutes';
import { needsDataMigration } from './lib/dataMigration';
import DataMigrationOverlay from './components/system/DataMigrationOverlay';
import RouteErrorBoundary from './components/ui/RouteErrorBoundary';

const TodayPage = lazy(() => import('./simple/TodayPage'));
const TrainingPage = lazy(() => import('./simple/TrainingPage'));
const FoodPage = lazy(() => import('./simple/FoodPage'));
const EinheitPage = lazy(() => import('./simple/EinheitPage'));
const ProgressPage = lazy(() => import('./simple/ProgressPage'));
const TrainingsplanPage = lazy(() => import('./simple/TrainingsplanPage'));
const WorkoutPage = lazy(() => import('./components/workout/WorkoutPage'));
const NutritionPage = lazy(() => import('./components/nutrition/NutritionPage'));
const CoachHubPage = lazy(() => import('./components/coach/CoachHubPage'));
const ProfilePage = lazy(() => import('./components/profile/ProfilePage'));
const StatisticsPage = lazy(() => import('./components/stats/StatisticsPage'));
const WellnessPage = lazy(() => import('./components/wellness/WellnessPage'));
const SocialPage = lazy(() => import('./components/social/SocialPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center p-8" role="status" aria-label="Loading">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
    </div>
  );
}

/** Alte /wellness-Links auf /health umbiegen — inklusive Unterseite. */
function WellnessUmleitung() {
  const { pathname } = useLocation();
  return <Navigate to={pathname.replace('/wellness', '/health')} replace />;
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
            <RouteErrorBoundary title="Heute konnte nicht geladen werden">
              <TodayPage />
            </RouteErrorBoundary>
          }
        />
        <Route path="/today" element={<Navigate to="/" replace />} />
        <Route path="/dashboard" element={<Navigate to="/" replace />} />
        <Route
          path="/einheit/:id"
          element={
            <RouteErrorBoundary title="Einheit konnte nicht geladen werden">
              <EinheitPage />
            </RouteErrorBoundary>
          }
        />
        <Route
          path="/training"
          element={
            <RouteErrorBoundary title="Training konnte nicht geladen werden">
              <TrainingPage />
            </RouteErrorBoundary>
          }
        />
        <Route
          path="/foods"
          element={
            <RouteErrorBoundary title="Essen konnte nicht geladen werden">
              <FoodPage />
            </RouteErrorBoundary>
          }
        />
        <Route
          path="/progress"
          element={
            <RouteErrorBoundary title="Fortschritt konnte nicht geladen werden">
              <ProgressPage />
            </RouteErrorBoundary>
          }
        />
        <Route
          path="/plan"
          element={
            <RouteErrorBoundary title="Trainingsplan konnte nicht geladen werden">
              <TrainingsplanPage />
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
          path="/health/*"
          element={
            <RouteErrorBoundary title="Health-Daten konnten nicht geladen werden">
              <WellnessPage />
            </RouteErrorBoundary>
          }
        />
        {/* Alter Pfad: bleibt als Umleitung und behält die Unterseite bei. */}
        <Route path="/wellness/*" element={<WellnessUmleitung />} />
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
