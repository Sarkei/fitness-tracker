import { useState, type FormEvent } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { api } from '@/src/lib/api';
import { useI18n } from '@/src/lib/i18n';
import { formatUserError } from '@/src/lib/formatUserError';
import { cn } from '@/src/lib/utils';

const inputClass =
  'w-full text-sm font-medium bg-[var(--background)] border border-[var(--border-muted)] rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-brand transition-shadow text-[var(--text-primary)]';

export default function ResetPasswordScreen() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < 8) {
      setError(t('auth.passwordTooWeak'));
      return;
    }
    if (password !== confirm) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    if (!token) {
      setError(t('auth.resetInvalidToken'));
      return;
    }
    setError('');
    setBusy(true);
    try {
      await api('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
    } catch (err: unknown) {
      setError(formatUserError(err, t, 'auth.resetFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[var(--background)] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-[var(--card-bg)] p-8 rounded-2xl border border-[var(--border-muted)] shadow-sm">
        <h1 className="text-xl font-black italic uppercase tracking-tighter text-[var(--text-primary)] mb-2">
          {t('auth.resetTitle')}
        </h1>
        <p className="text-sm text-[var(--text-muted)] font-medium mb-6">{t('auth.resetSubtitle')}</p>

        {done ? (
          <div className="space-y-4">
            <p className="text-sm font-bold text-brand">{t('auth.resetSuccess')}</p>
            <Link
              to="/"
              className="block w-full text-center ui-btn-brand rounded-xl py-3 text-[10px] font-bold uppercase tracking-widest"
            >
              {t('auth.submitSignIn')}
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              className={inputClass}
              placeholder={t('auth.newPassword')}
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
            <input
              type="password"
              autoComplete="new-password"
              required
              className={inputClass}
              placeholder={t('auth.confirmPassword')}
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
            />
            {error && (
              <p className="text-xs font-bold text-red-600 bg-red-50 dark:bg-red-950/30 p-3 rounded-xl">{error}</p>
            )}
            <button
              type="submit"
              disabled={busy || !token}
              className={cn(
                'w-full ui-btn-brand rounded-xl py-3 text-[10px] font-bold uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2',
              )}
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {t('auth.resetSubmit')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
