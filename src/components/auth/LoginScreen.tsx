import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { ArrowLeft, Dumbbell, Loader2, Moon, Sun } from 'lucide-react';
import { useAuth } from '@/src/lib/AuthContext';
import { useI18n } from '@/src/lib/i18n';
import { api } from '@/src/lib/api';
import { formatUserError } from '@/src/lib/formatUserError';
import { cn } from '@/src/lib/utils';
import { getStoredTheme, persistTheme, type ThemeMode } from '@/src/lib/themePreference';

const inputClass =
  'w-full text-sm font-medium bg-[var(--background)] border border-[var(--border-muted)] rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-brand transition-shadow text-[var(--text-primary)] placeholder:text-[var(--text-placeholder)]';

export default function LoginScreen() {
  const { loginWithEmail, registerWithEmail } = useAuth();
  const { t, locale, setLocale } = useI18n();

  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme());
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authFirstName, setAuthFirstName] = useState('');
  const [authLastName, setAuthLastName] = useState('');
  const [authError, setAuthError] = useState('');
  const [isAuthLogin, setIsAuthLogin] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotDevLink, setForgotDevLink] = useState<string | null>(null);

  const passwordStrength = useMemo(() => {
    const p = authPassword;
    if (!p) return null;
    if (p.length < 8) return 'weak' as const;
    const strong = p.length >= 12 && /[A-Z]/.test(p) && /[0-9]/.test(p);
    return strong ? ('strong' as const) : ('ok' as const);
  }, [authPassword]);

  useEffect(() => {
    persistTheme(theme);
  }, [theme]);

  const setThemeMode = (mode: ThemeMode) => {
    if (mode === theme) return;
    setTheme(mode);
    persistTheme(mode);
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setAuthError('');
    setIsSubmitting(true);
    try {
      await loginWithEmail(authEmail, authPassword);
      setAuthEmail('');
      setAuthPassword('');
    } catch (err: unknown) {
      setAuthError(formatUserError(err, t, 'auth.loginFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setAuthError('');
    const first = authFirstName.trim();
    const last = authLastName.trim();
    if (first.length < 2 || last.length < 2) {
      setAuthError(t('auth.nameRequired'));
      return;
    }
    if (authPassword.length < 8) {
      setAuthError(t('auth.passwordTooWeak'));
      return;
    }
    setIsSubmitting(true);
    try {
      await registerWithEmail(authEmail, authPassword, first, last);
      setAuthEmail('');
      setAuthPassword('');
      setAuthFirstName('');
      setAuthLastName('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'auth/email-already-in-use') setAuthError('__email_in_use__');
      else setAuthError(formatUserError(err, t, 'auth.registerFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgot = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setForgotMsg('');
    setForgotDevLink(null);
    setIsSubmitting(true);
    try {
      const res = await api<{ ok: boolean; devResetUrl?: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: forgotEmail.trim().toLowerCase() }),
      });
      setForgotMsg(t('auth.forgotSent'));
      if (res.devResetUrl) setForgotDevLink(res.devResetUrl);
    } catch (err: unknown) {
      setForgotMsg(formatUserError(err, t, 'auth.forgotFailed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (showForgot) {
    return (
      <div className="app auth-seite bg-[var(--background)] text-[var(--text-primary)]">
        <div className="w-full max-w-[420px]">
          <div className="mb-6 flex flex-col items-center text-center">
            <span className="app-brand__mark h-12 w-12">
              <Dumbbell className="h-6 w-6" aria-hidden />
            </span>
            <span className="mt-3 font-display text-xl leading-tight text-[var(--text-primary)]">
              Fitness-Tracker
            </span>
            <span className="app-label mt-1">Deine Werte</span>
          </div>

          <div className="app-card p-6 sm:p-7">
            <button
              type="button"
              className="mb-5 inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--simple-accent)]"
              onClick={() => setShowForgot(false)}
            >
              <ArrowLeft className="h-3.5 w-3.5" /> {t('auth.backToSignIn')}
            </button>

            <h2 className="text-lg font-semibold tracking-tight">{t('auth.forgotTitle')}</h2>
            <p className="mt-1 mb-5 text-sm text-[var(--text-muted)]">{t('auth.forgotHint')}</p>

            <form onSubmit={handleForgot} className="space-y-4">
              <div>
                <label className="app-label mb-1 block" htmlFor="forgot-email">
                  {t('auth.email')}
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  required
                  className={inputClass}
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  placeholder={t('auth.placeholderEmail')}
                />
              </div>
              {forgotMsg && <p className="text-sm font-medium text-[var(--simple-accent)]">{forgotMsg}</p>}
              {forgotDevLink && (
                <a href={forgotDevLink} className="block break-all text-xs font-medium underline">
                  {forgotDevLink}
                </a>
              )}
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--simple-accent)] px-4 text-sm font-semibold text-[var(--simple-accent-ink)] transition disabled:opacity-50"
              >
                {isSubmitting && <Loader2 size={16} className="animate-spin" />}
                {isSubmitting ? t('auth.submitting') : t('auth.forgotSubmit')}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app auth-seite bg-[var(--background)] text-[var(--text-primary)]">
      <div className="w-full max-w-[420px]">
        {/* Marke mittig, wie im Meal Planner: Kreis mit Symbol, Name, Unterzeile */}
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="app-brand__mark h-12 w-12">
            <Dumbbell className="h-6 w-6" aria-hidden />
          </span>
          <span className="mt-3 font-display text-xl leading-tight text-[var(--text-primary)]">
            Fitness-Tracker
          </span>
          <span className="app-label mt-1">Deine Werte</span>
        </div>

        <div className="app-card p-6 sm:p-7">
          {/* Umschalter wie im Meal Planner: helle Leiste, aktives Feld als Fläche */}
          <div className="mb-6 flex gap-2 rounded-xl bg-[var(--text-primary)]/5 p-1">
            <button
              type="button"
              onClick={() => {
                setIsAuthLogin(true);
                setAuthError('');
              }}
              className={cn(
                'flex-1 rounded-lg py-2 text-sm font-semibold transition',
                isAuthLogin
                  ? 'bg-[var(--card-bg)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-primary)]/55',
              )}
            >
              {t('auth.signIn')}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAuthLogin(false);
                setAuthError('');
              }}
              className={cn(
                'flex-1 rounded-lg py-2 text-sm font-semibold transition',
                !isAuthLogin
                  ? 'bg-[var(--card-bg)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-primary)]/55',
              )}
            >
              {t('auth.register')}
            </button>
          </div>

          <form onSubmit={isAuthLogin ? handleLogin : handleRegister} className="space-y-4">
            {!isAuthLogin && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="app-label mb-1 block" htmlFor="auth-first">
                    {t('auth.firstName')}
                  </label>
                  <input
                    id="auth-first"
                    type="text"
                    autoComplete="given-name"
                    required
                    minLength={2}
                    className={inputClass}
                    placeholder={t('auth.placeholderFirstName')}
                    value={authFirstName}
                    onChange={e => setAuthFirstName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="app-label mb-1 block" htmlFor="auth-last">
                    {t('auth.lastName')}
                  </label>
                  <input
                    id="auth-last"
                    type="text"
                    autoComplete="family-name"
                    required
                    minLength={2}
                    className={inputClass}
                    placeholder={t('auth.placeholderLastName')}
                    value={authLastName}
                    onChange={e => setAuthLastName(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="app-label mb-1 block" htmlFor="auth-email">
                {t('auth.email')}
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                required
                className={inputClass}
                placeholder={t('auth.placeholderEmail')}
                value={authEmail}
                onChange={e => setAuthEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="app-label mb-1 block" htmlFor="auth-password">
                {t('auth.password')}
              </label>
              <input
                id="auth-password"
                type="password"
                autoComplete={isAuthLogin ? 'current-password' : 'new-password'}
                required
                minLength={isAuthLogin ? undefined : 8}
                className={inputClass}
                placeholder={t('auth.placeholderPassword')}
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
              />
              {!isAuthLogin && passwordStrength && (
                <p
                  className={cn(
                    'mt-1 text-[11px] font-medium',
                    passwordStrength === 'weak' && 'text-[var(--danger)]',
                    passwordStrength === 'ok' && 'text-[var(--warn)]',
                    passwordStrength === 'strong' && 'text-[var(--simple-accent)]',
                  )}
                >
                  {t(`auth.passwordStrength.${passwordStrength}`)}
                </p>
              )}
            </div>

            {authError && authError !== '__email_in_use__' && (
              <p
                className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 py-2 text-sm font-medium text-[var(--danger)]"
                role="alert"
              >
                {authError}
              </p>
            )}
            {authError === '__email_in_use__' && (
              <div className="rounded-xl border border-[var(--warn)]/30 bg-[var(--warn)]/10 p-3">
                <p className="mb-2 text-sm font-medium text-[var(--warn)]">{t('auth.emailInUse')}</p>
                <button
                  type="button"
                  onClick={() => {
                    setIsAuthLogin(true);
                    setAuthError('');
                  }}
                  className="min-h-[36px] rounded-lg bg-[var(--simple-accent)] px-3 text-xs font-semibold text-[var(--simple-accent-ink)]"
                >
                  {t('auth.switchToSignIn')}
                </button>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--simple-accent)] px-4 text-sm font-semibold text-[var(--simple-accent-ink)] transition disabled:opacity-60"
            >
              {isSubmitting && <Loader2 size={16} className="animate-spin" />}
              {isSubmitting
                ? t('auth.submitting')
                : isAuthLogin
                  ? t('auth.submitSignIn')
                  : t('auth.submitRegister')}
            </button>
          </form>

          {isAuthLogin && (
            <button
              type="button"
              onClick={() => {
                setShowForgot(true);
                setForgotEmail(authEmail);
              }}
              className="mt-3 text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--simple-accent)]"
            >
              {t('auth.forgotLink')}
            </button>
          )}

          {/* DE/EN und Hell/Dunkel: im Meal Planner stehen sie unten in der Karte */}
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-[var(--border-muted)] pt-4">
            <div className="flex gap-1 rounded-xl border border-[var(--border-muted)] p-0.5">
              <button
                type="button"
                onClick={() => void setLocale('de')}
                className={cn(
                  'min-h-[32px] rounded-lg px-2.5 text-[11px] font-semibold uppercase transition',
                  locale === 'de'
                    ? 'bg-[var(--simple-accent)] text-[var(--simple-accent-ink)]'
                    : 'text-[var(--text-muted)]',
                )}
              >
                DE
              </button>
              <button
                type="button"
                onClick={() => void setLocale('en')}
                className={cn(
                  'min-h-[32px] rounded-lg px-2.5 text-[11px] font-semibold uppercase transition',
                  locale === 'en'
                    ? 'bg-[var(--simple-accent)] text-[var(--simple-accent-ink)]'
                    : 'text-[var(--text-muted)]',
                )}
              >
                EN
              </button>
            </div>

            <div className="flex gap-1 rounded-xl border border-[var(--border-muted)] p-0.5">
              <button
                type="button"
                onClick={() => setThemeMode('light')}
                aria-label={t('profile.theme.light')}
                className={cn(
                  'flex min-h-[32px] min-w-[32px] items-center justify-center rounded-lg transition',
                  theme === 'light'
                    ? 'bg-[var(--simple-accent)]/20 text-[var(--simple-accent)]'
                    : 'text-[var(--text-muted)]',
                )}
              >
                <Sun size={15} />
              </button>
              <button
                type="button"
                onClick={() => setThemeMode('dark')}
                aria-label={t('profile.theme.dark')}
                className={cn(
                  'flex min-h-[32px] min-w-[32px] items-center justify-center rounded-lg transition',
                  theme === 'dark'
                    ? 'bg-[var(--simple-accent)]/20 text-[var(--simple-accent)]'
                    : 'text-[var(--text-muted)]',
                )}
              >
                <Moon size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-[var(--text-muted)]">
        Selbst gehostet — deine Daten bleiben bei dir.
      </p>
    </div>
  );
}

