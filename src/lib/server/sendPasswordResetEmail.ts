/**
 * Optional SMTP delivery for password-reset links.
 * Configure: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, APP_PUBLIC_URL
 */

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
  const host = process.env.SMTP_HOST?.trim();
  const from = process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim();
  if (!host || !from) return false;

  const port = parseInt(process.env.SMTP_PORT ?? '587', 10) || 587;
  const secure = process.env.SMTP_SECURE === '1' || port === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS ?? '';

  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user ? { user, pass } : undefined,
    });

    const appName = process.env.APP_NAME?.trim() || 'VRTX';
    await transporter.sendMail({
      from,
      to,
      subject: `${appName} — Passwort zurücksetzen`,
      text: `Setze dein Passwort hier zurück (gültig 1 Stunde):\n\n${resetUrl}\n\nWenn du das nicht angefordert hast, ignoriere diese E-Mail.`,
      html: `<p>Setze dein <strong>${appName}</strong>-Passwort zurück (gültig 1 Stunde):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>Wenn du das nicht angefordert hast, ignoriere diese E-Mail.</p>`,
    });
    return true;
  } catch (err) {
    console.error('sendPasswordResetEmail:', err);
    return false;
  }
}
