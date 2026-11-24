/**
 * Garmin-Zugang über Anmeldedaten (inoffiziell).
 *
 * Ergänzt die Personal API: kein 100-Anfragen-Limit und Felder, die die
 * offizielle API vorenthält (Schlafphasen, nächtlicher SpO₂, Atemfrequenz,
 * Body Battery). Die Zugangsdaten verlassen den Server nicht.
 */

import { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, LogIn, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '@/src/lib/api';

type Status = {
  verbunden: boolean;
  email?: string | null;
  fehler?: string | null;
  verbundenAm?: string | null;
  tokensGueltig?: boolean;
};

/** „vor 3 Tagen" aus einem ISO-Zeitstempel. */
function seit(wert?: string | null): string {
  if (!wert) return '—';
  const t = Date.parse(wert);
  if (!Number.isFinite(t)) return '—';
  const tage = Math.floor((Date.now() - t) / 86_400_000);
  if (tage <= 0) return 'heute';
  if (tage === 1) return 'gestern';
  return `vor ${tage} Tagen`;
}

export default function GarminLogin() {
  const [offen, setOffen] = useState(false);
  const [email, setEmail] = useState('');
  const [passwort, setPasswort] = useState('');
  const [code, setCode] = useState('');
  const [mfa, setMfa] = useState(false);
  const [arbeitet, setArbeitet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [laedt, setLaedt] = useState(true);

  const laden = async () => {
    setLaedt(true);
    try {
      const r = await api<Status>('/api/integrations/garmin/login');
      setStatus(r);
    } catch {
      setStatus({ verbunden: false });
    } finally {
      setLaedt(false);
    }
  };

  /*
   * Status beim Einbinden einmal holen. Vorher stand der Aufruf direkt im
   * Render-Body — das setzt State waehrend des Renderns und kann React zum
   * Absturz bringen (Fehler #301 nach dem Umbau).
   */
  useEffect(() => {
    let abgebrochen = false;
    api<Status>('/api/integrations/garmin/login')
      .then((r) => {
        if (!abgebrochen) setStatus(r);
      })
      .catch(() => {
        if (!abgebrochen) setStatus({ verbunden: false });
      })
      .finally(() => {
        if (!abgebrochen) setLaedt(false);
      });
    return () => {
      abgebrochen = true;
    };
  }, []);

  const absenden = async () => {
    setArbeitet(true);
    setFehler(null);
    setErfolg(null);
    try {
      const r = await api<{ ok: boolean; mfa?: boolean; hinweis?: string }>(
        '/api/integrations/garmin/login',
        { method: 'POST', body: JSON.stringify({ email, password: passwort }) },
      );
      if (r.mfa) {
        setMfa(true);
        setErfolg(r.hinweis ?? 'Code eingeben.');
      } else if (r.ok) {
        setErfolg('Verbunden. Die Werte kommen ab jetzt über deinen Garmin-Zugang.');
        setPasswort('');
        setOffen(false);
        await laden();
      }
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Anmeldung fehlgeschlagen.');
    } finally {
      setArbeitet(false);
    }
  };

  const codeAbsenden = async () => {
    setArbeitet(true);
    setFehler(null);
    try {
      await api('/api/integrations/garmin/login/mfa', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      setMfa(false);
      setCode('');
      setErfolg('Bestätigt. Die Verbindung steht.');
      setOffen(false);
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Code wurde abgelehnt.');
    } finally {
      setArbeitet(false);
    }
  };

  const trennen = async () => {
    setArbeitet(true);
    try {
      await api('/api/integrations/garmin/login', { method: 'DELETE' });
      setStatus({ verbunden: false });
      setErfolg(null);
      setOffen(false);
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Trennen fehlgeschlagen.');
    } finally {
      setArbeitet(false);
    }
  };

  const klebt = status?.verbunden;

  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <div className="flex items-start gap-3">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[var(--simple-accent)]" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[12px] font-semibold text-[var(--foreground)]">Garmin-Login</p>
            {klebt && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--simple-accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--simple-accent)]">
                <CheckCircle2 className="h-3 w-3" /> verbunden
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--muted)]">
            {laedt
              ? 'Status wird geladen …'
              : klebt
                ? `Anmeldedaten seit ${seit(status?.verbundenAm)} gespeichert. Kein Tageslimit, dafür alle Schlafwerte.`
                : 'Zusätzlicher Weg zur Uhr: kein Tageslimit und alle Schlafwerte. E-Mail und Passwort werden verschlüsselt gespeichert.'}
          </p>
          {klebt && status?.fehler && (
            <p className="mt-1 text-[10.5px] text-[#f08a7a]">{status.fehler}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {klebt ? (
            <>
              <button
                type="button"
                onClick={() => setOffen((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-muted)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--muted)] transition hover:text-[var(--foreground)]"
              >
                Neu anmelden
              </button>
              <button
                type="button"
                onClick={() => void trennen()}
                disabled={arbeitet}
                aria-label="Garmin-Login trennen"
                title="Zugangsdaten löschen"
                className="rounded-lg p-1.5 text-[var(--muted)] transition hover:text-[#f87171]"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setOffen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-muted)] px-3 py-1.5 text-[11px] font-semibold text-[var(--muted)] transition hover:text-[var(--foreground)]"
            >
              <LogIn className="h-3.5 w-3.5" /> Anmelden
            </button>
          )}
        </div>
      </div>

      {offen && (
        <div className="mt-3 space-y-2 border-t border-[var(--border-muted)] pt-3">
          {!mfa ? (
            <>
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                  E-Mail
                </span>
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="deine@garmin-mail.de"
                  className="mt-1 w-full rounded-lg border border-[var(--border-muted)] bg-[var(--background)] px-3 py-2 text-[12.5px] outline-none focus:border-[var(--simple-accent)]"
                />
              </label>
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Passwort
                </span>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={passwort}
                  onChange={(e) => setPasswort(e.target.value)}
                  placeholder="Garmin-Passwort"
                  className="mt-1 w-full rounded-lg border border-[var(--border-muted)] bg-[var(--background)] px-3 py-2 text-[12.5px] outline-none focus:border-[var(--simple-accent)]"
                />
              </label>
              <button
                type="button"
                onClick={() => void absenden()}
                disabled={arbeitet || !email || !passwort}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[var(--simple-accent)] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50"
              >
                {arbeitet ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Anmelden
              </button>
            </>
          ) : (
            <>
              <p className="text-[11px] leading-relaxed text-[var(--simple-accent)]">{erfolg}</p>
              <label className="block">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Bestätigungscode
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  placeholder="123456"
                  className="mt-1 w-full rounded-lg border border-[var(--border-muted)] bg-[var(--background)] px-3 py-2 font-mono text-[15px] tracking-[0.3em] outline-none focus:border-[var(--simple-accent)]"
                />
              </label>
              <button
                type="button"
                onClick={() => void codeAbsenden()}
                disabled={arbeitet || code.length < 4}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[var(--simple-accent)] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50"
              >
                {arbeitet ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Bestätigen
              </button>
            </>
          )}

          {fehler && <p className="text-[10.5px] leading-relaxed text-[#f08a7a]">{fehler}</p>}
          {!mfa && erfolg && !fehler && (
            <p className="text-[10.5px] leading-relaxed text-[var(--simple-accent)]">{erfolg}</p>
          )}

          <p className="flex items-start gap-1.5 text-[10px] leading-relaxed text-[var(--muted)]">
            <ShieldCheck className="mt-0.5 h-3 w-3 shrink-0" />
            E-Mail und Passwort liegen verschlüsselt auf dem Server und gehen nie an den Browser
            zurück. Zwei-Faktor bleibt eingeschaltet — der Code wird einmalig abgefragt, danach
            laufen Tokens.
          </p>
        </div>
      )}
    </div>
  );
}
