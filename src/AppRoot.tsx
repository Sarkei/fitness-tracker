import { Suspense } from 'react';
import { BrowserRouter, useLocation } from 'react-router-dom';
import App from './App.tsx';
import LoginScreen from './components/auth/LoginScreen.tsx';
import ResetPasswordScreen from './components/auth/ResetPasswordScreen.tsx';
import { AuthBootLoader, AuthProvider, useAuth } from './lib/AuthContext.tsx';
import { AppDataProvider } from './lib/AppDataContext.tsx';
import { ActiveWorkoutSessionProvider } from './lib/ActiveWorkoutSessionContext.tsx';
import { I18nProvider } from './lib/i18n.tsx';

function AppGate() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (location.pathname === '/reset-password') {
    return <ResetPasswordScreen />;
  }
  /** Admin hat eigenes Basic-Auth — nicht hinter App-JWT-Login sperren. */
  if (location.pathname === '/admin') {
    return (
      <Suspense fallback={<AuthBootLoader />}>
        <App />
      </Suspense>
    );
  }
  if (loading) return <AuthBootLoader />;
  if (!user) return <LoginScreen />;
  return (
    <AppDataProvider>
      <ActiveWorkoutSessionProvider>
        <Suspense fallback={<AuthBootLoader />}>
          <App />
        </Suspense>
      </ActiveWorkoutSessionProvider>
    </AppDataProvider>
  );
}

export default function AppRoot() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <I18nProvider>
          <AppGate />
        </I18nProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
