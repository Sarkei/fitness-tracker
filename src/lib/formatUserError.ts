/**
 * Maps API / network errors to user-facing messages (i18n keys or plain text).
 */
export function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes('failed to fetch') ||
    m.includes('network') ||
    m.includes('load failed') ||
    err.name === 'TypeError'
  );
}

export function formatUserError(
  err: unknown,
  t: (key: string) => string,
  fallbackKey = 'common.error.generic',
): string {
  if (isNetworkError(err)) return t('common.error.network');
  if (err instanceof Error) {
    const msg = err.message;
    if (msg === 'Invalid credentials') return t('auth.badCredentials');
    if (msg === 'auth/email-already-in-use') return t('auth.emailInUse');
    if (msg === 'password-required') return t('auth.passwordRequired');
    if (msg === 'password-wrong') return t('auth.passwordWrong');
    if (msg === 'password-too-weak') return t('auth.passwordTooWeak');
    if (msg === 'invalid-or-expired-token') return t('auth.resetInvalidToken');
    if (msg === 'follow-failed') return t('social.followFailed');
    if (msg.startsWith('HTTP ')) return t(fallbackKey);
    return msg;
  }
  return t(fallbackKey);
}
