/**
 * Passwort-Reset-Mail über Resend.
 *
 * Vorher lief das über SMTP (nötig: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
 * `SMTP_PASS`, `SMTP_FROM`) — diese Variablen waren nie gesetzt, deshalb gab die
 * Funktion sofort `false` zurück und niemand bekam eine Mail. Jetzt geht es über
 * die Resend-API, denselben Kanal wie das TSV-Kontaktformular.
 *
 * Benötigt nur `RESEND_API_KEY`. Reply-To steht auf `noreply@nas-timgreen.com`,
 * Antworten laufen ins Leere (Catch-all der Domain ist auf „drop").
 */

import { readFileSync } from 'node:fs';

const RESEND_URL = 'https://api.resend.com/emails';

/**
 * Wert aus der .env-Datei lesen.
 *
 * Nötig, weil der Server beim Start nur **leere** Variablen aus der Datei füllt.
 * Steht `RESEND_API_KEY` nicht schon in der docker-compose.yaml, kommt er sonst
 * nie im Prozess an — die Mail würde stumm ausbleiben.
 */
function ausEnvDatei(schluessel: string): string {
  const pfad = String(process.env.ENV_FILE_PATH ?? '/app/.env');
  try {
    for (const zeile of readFileSync(pfad, 'utf8').split('\n')) {
      const m = zeile.match(new RegExp(`^${schluessel}\\s*=\\s*(.+)$`));
      if (m) return m[1].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    /* keine Datei — dann gilt die Umgebung */
  }
  return '';
}

export async function sendPasswordResetEmail(to: string, resetUrl: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY?.trim() || ausEnvDatei('RESEND_API_KEY');
  if (!key) {
    console.warn('[mail] RESEND_API_KEY fehlt — Reset-Mail nicht gesendet.');
    return false;
  }

  const appName = process.env.APP_NAME?.trim() || ausEnvDatei('APP_NAME') || 'Fitness-Tracker';
  const absender = `${appName} <fitness@nas-timgreen.com>`;

  const text = [
    'Hallo,',
    `für dein Konto bei ${appName} wurde ein neues Passwort angefordert. Der Link ist 1 Stunde gültig:`,
    resetUrl,
    'Wenn du das nicht angefordert hast, ignoriere diese Mail — dein Passwort bleibt unverändert.',
    'Diese Nachricht wurde automatisch erstellt — bitte antworte nicht darauf.',
  ].join('\n\n');

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: absender,
        to: [to],
        reply_to: 'noreply@nas-timgreen.com',
        subject: `${appName} — Passwort zurücksetzen`,
        text,
        html: `<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.65;color:#121a16;max-width:520px">
<p style="margin:0 0 14px">Hallo,</p>
<p style="margin:0 0 18px">für dein Konto bei <strong>${appName}</strong> wurde ein neues Passwort angefordert. Der Link ist <strong>1 Stunde</strong> gültig.</p>
<p style="margin:0 0 20px"><a href="${resetUrl}" style="display:inline-block;background:#2f7d5a;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600">Neues Passwort setzen</a></p>
<p style="margin:0 0 14px;font-size:13px;color:#55635c;word-break:break-all">${resetUrl}</p>
<p style="margin:0 0 10px;font-size:13px;color:#55635c">Wenn du das nicht angefordert hast, ignoriere diese Mail — dein Passwort bleibt unverändert.</p>
<p style="margin:0;font-size:11.5px;color:#8a978f">Diese Nachricht wurde automatisch erstellt — bitte antworte nicht darauf.</p>
</div>`,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const grund = await res.text().catch(() => '');
      console.error('[mail] Resend lehnte ab:', res.status, grund.slice(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[mail] Reset-Mail fehlgeschlagen:', err);
    return false;
  }
}
