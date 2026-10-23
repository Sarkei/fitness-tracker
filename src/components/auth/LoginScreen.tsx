import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { Loader2, Moon, Sun } from 'lucide-react';
import { useAuth } from '@/src/lib/AuthContext';
import { useI18n } from '@/src/lib/i18n';
import { api } from '@/src/lib/api';
import { formatUserError } from '@/src/lib/formatUserError';
import { cn } from '@/src/lib/utils';
import { uiBtnPrimary, uiChoice } from '@/src/lib/uiChoices';
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
      <div className="min-h-[100dvh] bg-[var(--background)] flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-[var(--card-bg)] p-8 rounded-2xl border border-[var(--border-muted)]">
          <h2 className="text-xl font-bold mb-2">{t('auth.forgotTitle')}</h2>
          <p className="text-sm text-[var(--text-muted)] mb-6">{t('auth.forgotHint')}</p>
          <form onSubmit={handleForgot} className="space-y-4">
            <input
              type="email"
              required
              className={inputClass}
              value={forgotEmail}
              onChange={e => setForgotEmail(e.target.value)}
              placeholder={t('auth.placeholderEmail')}
            />
            {forgotMsg && <p className="text-xs font-bold text-brand">{forgotMsg}</p>}
            {forgotDevLink && (
              <a href={forgotDevLink} className="text-[10px] font-bold text-brand underline break-all">
                {forgotDevLink}
              </a>
            )}
            <button type="submit" disabled={isSubmitting} className={cn(uiBtnPrimary, 'w-full py-3 text-[10px] disabled:opacity-50')}>
              {isSubmitting ? t('auth.submitting') : t('auth.forgotSubmit')}
            </button>
            <button type="button" onClick={() => setShowForgot(false)} className="w-full text-[10px] font-bold uppercase text-[var(--text-muted)]">
              {t('auth.backToSignIn')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[var(--background)] text-[var(--text-primary)] flex flex-col items-center justify-center p-4 font-sans selection:bg-brand selection:text-white transition-colors duration-300">
      <div className="w-full max-w-sm bg-[var(--card-bg)] p-8 rounded-2xl border border-[var(--border-muted)] shadow-sm">
        <div className="flex justify-between items-start gap-3 mb-6">
          <div className="flex justify-center flex-1 min-w-0">
            <h1 className="text-4xl font-black tracking-tighter uppercase italic text-[var(--text-primary)]">
              VRTX<span className="text-brand">.</span>
            </h1>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => void setLocale('de')}
                className={cn('px-2 py-1 rounded-lg text-[9px] font-black uppercase', uiChoice(locale === 'de'))}
              >
                DE
              </button>
              <button
                type="button"
                onClick={() => void setLocale('en')}
                className={cn('px-2 py-1 rounded-lg text-[9px] font-black uppercase', uiChoice(locale === 'en'))}
              >
                EN
              </button>
            </div>
            <div className="flex gap-1 p-0.5 rounded-xl bg-[var(--background)] border border-[var(--border-muted)]">
              <button
                type="button"
                onClick={() => setThemeMode('light')}
                aria-label={t('profile.theme.light')}
                className={cn(
                  'min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg',
                  theme === 'light' ? 'bg-brand/20 text-brand' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
                )}
              >
                <Sun size={16} />
              </button>
              <button
                type="button"
                onClick={() => setThemeMode('dark')}
                aria-label={t('profile.theme.dark')}
                className={cn(
                  'min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg',
                  theme === 'dark' ? 'bg-brand/20 text-brand' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]',
                )}
              >
                <Moon size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="text-center mb-8">
          <h2 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
            {isAuthLogin ? t('auth.welcomeBack') : t('auth.createAccount')}
          </h2>
          <p className="text-[10px] text-[var(--text-muted)] mt-1 uppercase tracking-widest font-bold">
            {isAuthLogin ? t('auth.signInSubtitle') : t('auth.registerSubtitle')}
          </p>
        </div>

        <div className="flex mb-6 bg-[var(--background)] rounded-xl p-1 border border-[var(--border-muted)]">
          <button
            type="button"
            onClick={() => {
              setIsAuthLogin(true);
              setAuthError('');
            }}
            className={cn(
              'flex-1 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all',
              isAuthLogin
                ? 'bg-[var(--card-bg)] shadow-sm text-[var(--text-primary)]'
                : 'text-[var(--text-muted)]',
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
              'flex-1 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all',
              !isAuthLogin
                ? 'bg-[var(--card-bg)] shadow-sm text-[var(--text-primary)]'
                : 'text-[var(--text-muted)]',
            )}
          >
            {t('auth.register')}
          </button>
        </div>

        <form onSubmit={isAuthLogin ? handleLogin : handleRegister} className="space-y-4">
          {!isAuthLogin && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest block mb-1">
                  {t('auth.firstName')}
                </label>
                <input
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
                <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest block mb-1">
                  {t('auth.lastName')}
                </label>
                <input
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
            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest block mb-1">
              {t('auth.email')}
            </label>
            <input
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
            <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest block mb-1">
              {t('auth.password')}
            </label>
            <input
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
                  'text-[9px] font-bold uppercase tracking-widest mt-1',
                  passwordStrength === 'weak' && 'text-red-500',
                  passwordStrength === 'ok' && 'text-amber-600',
                  passwordStrength === 'strong' && 'text-brand',
                )}
              >
                {t(`auth.passwordStrength.${passwordStrength}`)}
              </p>
            )}
            {isAuthLogin && (
              <button
                type="button"
                onClick={() => {
                  setShowForgot(true);
                  setForgotEmail(authEmail);
                }}
                className="text-[9px] font-bold uppercase tracking-widest text-brand mt-2 hover:underline"
              >
                {t('auth.forgotLink')}
              </button>
            )}
          </div>

          {authError && authError !== '__email_in_use__' && (
            <div className="text-red-400 text-xs font-bold bg-red-500/10 border border-red-500/20 p-3 rounded-xl">
              {authError}
            </div>
          )}
          {authError === '__email_in_use__' && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
              <p className="text-amber-700 dark:text-amber-200 text-xs font-bold mb-2">{t('auth.emailInUse')}</p>
              <button
                type="button"
                onClick={() => {
                  setIsAuthLogin(true);
                  setAuthError('');
                }}
                className={cn(uiBtnPrimary, 'text-[10px] px-3 py-1.5')}
              >
                {t('auth.switchToSignIn')}
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(uiBtnPrimary, 'w-full py-3 text-[10px] mt-2 disabled:opacity-60 flex items-center justify-center gap-2')}
          >
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            {isSubmitting
              ? t('auth.submitting')
              : isAuthLogin
                ? t('auth.submitSignIn')
                : t('auth.submitRegister')}
          </button>
        </form>
      </div>
    </div>
  );
}

