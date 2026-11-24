/**
 * Intervals.icu-Verbindung im Profil.
 *
 * Der API-Key wird einmal eingegeben, serverseitig gegen Intervals.icu geprueft
 * und danach nie wieder an den Browser ausgeliefert. Garmin-Daten kommen ueber
 * den Intervals.icu-Abgleich und landen im Coach-Kontext.
 */

import { useCallback, useEffect, useState } from 'react';
import { Activity, CheckCircle2, ExternalLink, Link2, Loader2, Trash2 } from 'lucide-react';
import { api } from '@/src/lib/api';

type Status = {
  connected: boolean;
  athleteId: string;
  athleteName: string | null;
  connectedAt: string | null;
  lastError: string | null;
  lastSync: string | null;
  activityCount: number;
  latestActivity: { date: string; type: string | null; name: string | null } | null;
  fitness: { ctl: number | null; atl: number | null; tsb: number | null } | null;
  syncIntervalHours: number;
  syncIntervalOptions: number[];
  syncWorkouts?: boolean;
};

const INTERVALL_LABEL: Record<number, string> = {
  0: 'Nur manuell',
  0.083: 'Alle 5 Minuten',
  0.25: 'Alle 15 Minuten',
  0.5: 'Alle 30 Minuten',
  1: 'Jede Stunde',
  3: 'Alle 3 Stunden',
  6: 'Alle 6 Stunden',
  12: 'Alle 12 Stunden',
  24: 'Einmal täglich',
};

function fmtDatum(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function IntervalsConnect() {
  const [status, setStatus] = useState<Status | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [arbeitet, setArbeitet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  const [key, setKey] = useState('');
  const [athleteId, setAthleteId] = useState('0');
  const [offen, setOffen] = useState(false);

  const laden = useCallback(async () => {
    setLaedt(true);
    try {
      const s = await api<Status>('/api/integrations/intervals');
      setStatus(s);
      setAthleteId(s.athleteId || '0');
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Status konnte nicht geladen werden.');
    } finally {
      setLaedt(false);
    }
  }, []);

  useEffect(() => {
    void laden();
  }, [laden]);

  const verbinden = async () => {
    if (!key.trim()) {
      setFehler('Bitte den API-Key aus Intervals.icu einfügen.');
      return;
    }
    setArbeitet(true);
    setFehler(null);
    setErfolg(null);
    try {
      const res = await api<{ athleteName: string | null; activityCount: number }>(
        '/api/integrations/intervals/connect',
        { method: 'POST', body: JSON.stringify({ apiKey: key.trim(), athleteId: athleteId.trim() || '0' }) },
      );
      setKey('');
      setOffen(false);
      setErfolg(
        `Verbunden mit ${res.athleteName || 'Intervals.icu'} — ${res.activityCount} Aktivitäten übernommen.`,
      );
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Verbindung fehlgeschlagen.');
    } finally {
      setArbeitet(false);
    }
  };

  /** Trainings aus der App nach Intervals (und damit auf die Uhr) übertragen. */
  const workoutSyncSetzen = async (an: boolean) => {
    setArbeitet(true);
    setFehler(null);
    setErfolg(null);
    try {
      await api('/api/integrations/intervals/settings', {
        method: 'PATCH',
        body: JSON.stringify({ syncWorkouts: an }),
      });
      setErfolg(an ? 'Trainings werden nach Intervals übertragen.' : 'Übertragung der Trainings aus.');
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Einstellung konnte nicht gespeichert werden.');
    } finally {
      setArbeitet(false);
    }
  };

  const intervallSetzen = async (stunden: number) => {
    setArbeitet(true);
    setFehler(null);
    setErfolg(null);
    try {
      await api('/api/integrations/intervals/settings', {
        method: 'PATCH',
        body: JSON.stringify({ syncIntervalHours: stunden }),
      });
      setErfolg(
        stunden === 0
          ? 'Automatischer Sync aus — nur noch manuell.'
          : `Automatischer Sync: ${INTERVALL_LABEL[stunden]}.`,
      );
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Intervall konnte nicht gespeichert werden.');
    } finally {
      setArbeitet(false);
    }
  };

  const trennen = async () => {
    if (!window.confirm('Verbindung zu Intervals.icu lösen? Der gespeicherte Key wird gelöscht.')) return;
    setArbeitet(true);
    setFehler(null);
    setErfolg(null);
    try {
      await api('/api/integrations/intervals', { method: 'DELETE' });
      setErfolg('Verbindung gelöst.');
      setStatus(null);
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Trennen fehlgeschlagen.');
    } finally {
      setArbeitet(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--simple-accent-soft)] text-[var(--simple-accent)]">
            <Activity className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)]">Intervals.icu · deine Quelle</p>
            <p className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--text-muted)]">
              Der Coach sieht dann deine Läufe, Einheiten und deine Form (CTL/ATL/TSB).
            </p>
          </div>
        </div>

        {laedt ? (
          <Loader2 className="h-4 w-4 animate-spin text-[var(--text-muted)]" />
        ) : status?.connected ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--simple-accent-soft)] px-2.5 py-1 text-[10.5px] font-semibold text-[var(--simple-accent)]">
            <CheckCircle2 className="h-3 w-3" /> verbunden
          </span>
        ) : (
          <span className="rounded-full bg-[var(--border-muted)]/40 px-2.5 py-1 text-[10.5px] font-semibold text-[var(--text-muted)]">
            nicht verbunden
          </span>
        )}
      </div>

      {status?.connected && (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-[11.5px] sm:grid-cols-4">
          <div>
            <dt className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">Athlet</dt>
            <dd className="truncate font-semibold text-[var(--foreground)]">{status.athleteName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">Letzter Sync</dt>
            <dd className="font-semibold text-[var(--foreground)]">{fmtDatum(status.lastSync)}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">Aktivitäten</dt>
            <dd className="font-semibold text-[var(--foreground)]">{status.activityCount}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">Form (TSB)</dt>
            <dd className="font-semibold text-[var(--foreground)]">
              {status.fitness?.tsb != null ? Math.round(status.fitness.tsb) : '—'}
            </dd>
          </div>
        </dl>
      )}

      {status?.connected && status.latestActivity && (
        <p className="mt-2 text-[11px] text-[var(--text-muted)]">
          Letzte Einheit: {status.latestActivity.date} · {status.latestActivity.type ?? 'Einheit'}
          {status.latestActivity.name ? ` · ${status.latestActivity.name}` : ''}
        </p>
      )}

      {!laedt && !status?.connected && (
        <div className="mt-3 space-y-2">
          {!offen ? (
            <button
              type="button"
              onClick={() => setOffen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--simple-accent)] px-3 py-2 text-[12px] font-semibold text-white transition hover:opacity-90"
            >
              <Link2 className="h-3.5 w-3.5" /> Verbinden
            </button>
          ) : (
            <div className="space-y-2">
              <ol className="list-decimal space-y-0.5 pl-4 text-[11.5px] text-[var(--text-muted)]">
                <li>
                  <a
                    href="https://intervals.icu/settings"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 font-semibold text-[var(--simple-accent)] underline"
                  >
                    intervals.icu/settings <ExternalLink className="h-3 w-3" />
                  </a>{' '}
                  öffnen, ganz unten „Developer Settings“
                </li>
                <li>API-Key erzeugen und hier einfügen</li>
                <li>Deine Uhr bzw. App (Garmin, Polar, Suunto, Whoop …) muss in Intervals.icu verbunden sein</li>
              </ol>
              <label className="block text-[11px] font-semibold text-[var(--text-muted)]">
                API-Key
                <input
                  type="password"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="z. B. 1l0nlqjq3j1obdhg08rz5rfhx"
                  autoComplete="off"
                  className="mt-1 w-full rounded-xl bg-[var(--surface-gray)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none focus:ring-1 focus:ring-[var(--simple-accent)]"
                />
              </label>
              <label className="block text-[11px] font-semibold text-[var(--text-muted)]">
                Athleten-ID (optional, „0“ = eigener Athlet)
                <input
                  value={athleteId}
                  onChange={(e) => setAthleteId(e.target.value)}
                  placeholder="0 oder i12345"
                  className="mt-1 w-full rounded-xl bg-[var(--surface-gray)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none focus:ring-1 focus:ring-[var(--simple-accent)]"
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void verbinden()}
                  disabled={arbeitet}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--simple-accent)] px-3 py-2 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                >
                  {arbeitet ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                  Verbindung prüfen
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOffen(false);
                    setKey('');
                    setFehler(null);
                  }}
                  className="rounded-xl border border-[var(--border-muted)] px-3 py-2 text-[12px] font-semibold text-[var(--text-muted)]"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {status?.connected && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex-1 text-[11px] font-semibold text-[var(--text-muted)] sm:max-w-[220px]">
              Automatisch synchronisieren
              <select
                value={status.syncIntervalHours ?? 6}
                onChange={(e) => void intervallSetzen(Number(e.target.value))}
                disabled={arbeitet}
                className="mt-1 w-full rounded-xl border border-[var(--border-muted)] bg-[var(--surface-gray)] px-3 py-2 text-[12.5px] font-medium text-[var(--foreground)] outline-none focus:ring-1 focus:ring-[var(--simple-accent)] disabled:opacity-50"
              >
                {(status.syncIntervalOptions ?? [0, 1, 3, 6, 12, 24]).map((h) => (
                  <option key={h} value={h}>
                    {INTERVALL_LABEL[h] ?? `Alle ${h} Stunden`}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => void workoutSyncSetzen(!(status.syncWorkouts !== false))}
              disabled={arbeitet}
              className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-muted)] px-3 py-2 text-[12px] font-semibold text-[var(--text-muted)] transition hover:text-[var(--simple-accent)] disabled:opacity-50"
              aria-pressed={status.syncWorkouts !== false}
              title="Trainings aus der App nach Intervals übertragen, damit sie auf der Uhr landen"
            >
              <span
                className={`inline-flex h-4 w-7 items-center rounded-full transition ${
                  status.syncWorkouts !== false ? 'bg-[var(--simple-accent)]' : 'bg-[var(--border-muted)]'
                }`}
              >
                <span
                  className={`ml-0.5 h-3 w-3 rounded-full bg-white transition ${
                    status.syncWorkouts !== false ? 'translate-x-3' : ''
                  }`}
                />
              </span>
              Trainings übertragen
            </button>
            <button
              type="button"
              onClick={() => void trennen()}
              disabled={arbeitet}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-muted)] px-3 py-2 text-[12px] font-semibold text-[var(--text-muted)] transition hover:text-red-500 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Trennen
            </button>
          </div>
        </div>
      )}

      {(fehler || status?.lastError) && (
        <p className="mt-2 rounded-xl bg-red-500/10 px-3 py-2 text-[11.5px] font-semibold text-red-600">
          {fehler || status?.lastError}
        </p>
      )}
      {erfolg && (
        <p className="mt-2 rounded-xl bg-[var(--simple-accent-soft)] px-3 py-2 text-[11.5px] font-semibold text-[var(--simple-accent)]">
          {erfolg}
        </p>
      )}
    </div>
  );
}
