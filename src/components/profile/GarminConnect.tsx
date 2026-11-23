/**
 * Garmin-Connect-Verbindung im Profil.
 *
 * Tim erzeugt den Personal API Key selbst in Garmin Connect Web und trägt ihn hier
 * ein. Der Server prüft ihn, holt Schlaf, HRV, Schritte, Stress, Body Battery und
 * SpO₂ und aktualisiert danach alle 5 Minuten automatisch.
 *
 * Der Key geht nie an den Browser zurück — die Karte zeigt nur, ob einer gesetzt ist.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  CheckCircle2,
  ExternalLink,
  Heart,
  Loader2,
  Moon,
  RefreshCw,
  Trash2,
  Watch,
} from 'lucide-react';
import { api } from '@/src/lib/api';

type GarminTag = {
  date: string;
  sleepSecs?: number;
  sleepScore?: number;
  sleepQuality?: number;
  deepSecs?: number;
  lightSecs?: number;
  remSecs?: number;
  awakeSecs?: number;
  hrv?: number;
  restingHr?: number;
  minHr?: number;
  maxHr?: number;
  steps?: number;
  floorsClimbed?: number;
  distanceMeters?: number;
  activeCalories?: number;
  totalCalories?: number;
  stressAvg?: number;
  stressMax?: number;
  bodyBatteryMin?: number;
  bodyBatteryMax?: number;
  spo2Avg?: number;
  respirationAvg?: number;
  vo2max?: number;
  fitnessAge?: number;
  weightKg?: number;
  bodyFat?: number;
};

type Status = {
  connected: boolean;
  connectedAt: string | null;
  displayName: string | null;
  lastSync: string | null;
  lastError: string | null;
  nichtVerfuegbar: string[];
  heute: GarminTag | null;
  tage: GarminTag[];
};

function fmtDatum(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function stunden(secs?: number): string {
  return secs ? `${(secs / 3600).toFixed(1)} h` : '—';
}

export default function GarminConnect() {
  const [status, setStatus] = useState<Status | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [arbeitet, setArbeitet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  const [offen, setOffen] = useState(false);
  const [key, setKey] = useState('');
  const [stats, setStats] = useState<{
    tage: number;
    schnitt: Record<string, number | null>;
    gesamt: { schritte: number; etagen: number; streckeKm: number; aktiveKcal: number };
  } | null>(null);

  const laden = useCallback(async () => {
    setLaedt(true);
    try {
      const st = await api<Status>('/api/integrations/garmin');
      setStatus(st);
      if (st.connected) {
        try {
          setStats(
            await api<{
              tage: number;
              schnitt: Record<string, number | null>;
              gesamt: { schritte: number; etagen: number; streckeKm: number; aktiveKcal: number };
            }>('/api/integrations/garmin/stats?days=30'),
          );
        } catch {
          setStats(null);
        }
      } else {
        setStats(null);
      }
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
      setFehler('Bitte den Garmin-API-Key einfügen.');
      return;
    }
    setArbeitet(true);
    setFehler(null);
    setErfolg(null);
    try {
      const r = await api<{ displayName: string | null; tage: number; nichtVerfuegbar: string[] }>(
        '/api/integrations/garmin/connect',
        { method: 'POST', body: JSON.stringify({ apiKey: key.trim() }) },
      );
      setKey('');
      setOffen(false);
      setErfolg(
        `${r.displayName ?? 'Garmin'} verbunden — ${r.tage} ${r.tage === 1 ? 'Tag' : 'Tage'} übernommen.`,
      );
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Verbindung fehlgeschlagen.');
    } finally {
      setArbeitet(false);
    }
  };

  const syncen = async () => {
    setArbeitet(true);
    setFehler(null);
    setErfolg(null);
    try {
      const r = await api<{ ms: number; tage: number }>('/api/integrations/garmin/sync', {
        method: 'POST',
      });
      setErfolg(`${r.tage} Tage abgeglichen in ${r.ms} ms.`);
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Sync fehlgeschlagen.');
    } finally {
      setArbeitet(false);
    }
  };

  const trennen = async () => {
    if (!window.confirm('Garmin-Verbindung trennen? Die Daten bleiben in der App.')) return;
    setArbeitet(true);
    try {
      await api('/api/integrations/garmin', { method: 'DELETE' });
      setErfolg('Verbindung getrennt.');
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Trennen fehlgeschlagen.');
    } finally {
      setArbeitet(false);
    }
  };

  const heute = status?.heute;

  return (
    <div className="rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--simple-accent-soft)] text-[var(--simple-accent)]">
          <Watch className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[12.5px] font-semibold text-[var(--foreground)]">Garmin Connect</p>
            {status?.connected && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--simple-accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--simple-accent)]">
                <CheckCircle2 className="h-3 w-3" /> verbunden
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-muted)]">
            {laedt
              ? 'Status wird geladen …'
              : status?.connected
                ? `Schlaf, HRV, Stress, Body Battery — direkt von deiner Uhr. Abgleich alle 5 Minuten.`
                : 'Personal API Key aus Garmin Connect Web eintragen — dann kommen die Daten direkt von deiner Uhr.'}
          </p>
          {status?.connected && (
            <p className="mt-0.5 text-[10.5px] text-[var(--text-muted)]">
              Zuletzt abgeglichen: {fmtDatum(status.lastSync)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {status?.connected ? (
            <>
              <button
                type="button"
                onClick={() => void syncen()}
                disabled={arbeitet}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-muted)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] transition hover:text-[var(--foreground)]"
                title="Jetzt abgleichen"
              >
                {arbeitet ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Sync
              </button>
              <button
                type="button"
                onClick={() => void trennen()}
                disabled={arbeitet}
                className="rounded-lg p-1.5 text-[var(--text-muted)] transition hover:text-[#f87171]"
                title="Verbindung trennen"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setOffen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-muted)] px-3 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] transition hover:text-[var(--foreground)]"
            >
              Verbinden
            </button>
          )}
        </div>
      </div>

      {offen && !status?.connected && (
        <div className="mt-3 space-y-2 border-t border-[var(--border-muted)] pt-3">
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              Personal API Key
            </span>
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Key einfügen (wird nur einmal angezeigt)"
              className="mt-1 w-full rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-3 py-2 font-mono text-[13px] outline-none focus:border-[var(--simple-accent)]"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void verbinden()}
              disabled={arbeitet}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--simple-accent)] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50"
            >
              {arbeitet ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Verbinden
            </button>
            <a
              href="https://connect.garmin.com/app/settings/personalApiToken"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--foreground)]"
            >
              Key in Garmin erzeugen <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <p className="text-[10.5px] leading-relaxed text-[var(--text-muted)]">
            Der Key wird einmalig angezeigt — wie ein Passwort behandeln. Er bleibt auf dem Server
            und wird nicht an den Browser zurückgegeben.
          </p>
        </div>
      )}

      {/* Heutige Werte direkt von der Uhr */}
      {status?.connected && heute && (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--border-muted)] pt-3 sm:grid-cols-4">
          <div className="rounded-xl bg-[var(--background)] px-2.5 py-2">
            <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              <Moon className="h-3 w-3" /> Schlaf
            </p>
            <p className="mt-0.5 text-[13px] font-semibold tabular-nums">{stunden(heute.sleepSecs)}</p>
            <p className="text-[10px] text-[var(--text-muted)]">
              {heute.sleepScore != null ? `Score ${Math.round(heute.sleepScore)}` : 'kein Score'}
            </p>
          </div>
          <div className="rounded-xl bg-[var(--background)] px-2.5 py-2">
            <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              <Heart className="h-3 w-3" /> HRV
            </p>
            <p className="mt-0.5 text-[13px] font-semibold tabular-nums">
              {heute.hrv != null ? `${Math.round(heute.hrv)} ms` : '—'}
            </p>
            <p className="text-[10px] text-[var(--text-muted)]">
              {heute.restingHr != null ? `Puls ${Math.round(heute.restingHr)}` : 'kein Puls'}
            </p>
          </div>
          <div className="rounded-xl bg-[var(--background)] px-2.5 py-2">
            <p className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
              <Activity className="h-3 w-3" /> Stress
            </p>
            <p className="mt-0.5 text-[13px] font-semibold tabular-nums">
              {heute.stressAvg != null ? Math.round(heute.stressAvg) : '—'}
            </p>
            <p className="text-[10px] text-[var(--text-muted)]">
              {heute.bodyBatteryMax != null ? `Akku ${Math.round(heute.bodyBatteryMax)}` : 'kein Akku'}
            </p>
          </div>
          <div className="rounded-xl bg-[var(--background)] px-2.5 py-2">
            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">Schritte</p>
            <p className="mt-0.5 text-[13px] font-semibold tabular-nums">
              {heute.steps != null ? heute.steps.toLocaleString('de-DE') : '—'}
            </p>
            <p className="text-[10px] text-[var(--text-muted)]">
              {heute.floorsClimbed != null ? `${heute.floorsClimbed} Etagen` : 'keine Etagen'}
            </p>
          </div>
          <div className="rounded-xl bg-[var(--background)] px-2.5 py-2">
            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">Body Battery</p>
            <p className="mt-0.5 text-[13px] font-semibold tabular-nums">
              {heute.bodyBatteryMax != null ? Math.round(heute.bodyBatteryMax) : '—'}
            </p>
            <p className="text-[10px] text-[var(--text-muted)]">
              {heute.bodyBatteryMin != null ? `Tief ${Math.round(heute.bodyBatteryMin)}` : 'kein Tief'}
            </p>
          </div>
          <div className="rounded-xl bg-[var(--background)] px-2.5 py-2">
            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">SpO₂</p>
            <p className="mt-0.5 text-[13px] font-semibold tabular-nums">
              {heute.spo2Avg != null ? `${Math.round(heute.spo2Avg)} %` : '—'}
            </p>
            <p className="text-[10px] text-[var(--text-muted)]">
              {heute.respirationAvg != null ? `${Math.round(heute.respirationAvg)}/min` : 'keine Atmung'}
            </p>
          </div>
          <div className="rounded-xl bg-[var(--background)] px-2.5 py-2">
            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">Fitness</p>
            <p className="mt-0.5 text-[13px] font-semibold tabular-nums">
              {heute.vo2max != null ? `VO₂ ${Math.round(heute.vo2max)}` : '—'}
            </p>
            <p className="text-[10px] text-[var(--text-muted)]">
              {heute.fitnessAge != null ? `Alter ${Math.round(heute.fitnessAge)}` : 'kein Alter'}
            </p>
          </div>
          <div className="rounded-xl bg-[var(--background)] px-2.5 py-2">
            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">Gewicht</p>
            <p className="mt-0.5 text-[13px] font-semibold tabular-nums">
              {heute.weightKg != null ? `${heute.weightKg} kg` : '—'}
            </p>
            <p className="text-[10px] text-[var(--text-muted)]">
              {heute.bodyFat != null ? `${Math.round(heute.bodyFat)} % Fett` : 'kein Fettanteil'}
            </p>
          </div>
        </div>
      )}

      {status?.connected && (status.nichtVerfuegbar?.length ?? 0) > 0 && (
        <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--text-muted)]">
          Deine Uhr liefert nicht: {status.nichtVerfuegbar.join(', ')}.
        </p>
      )}

      {fehler && (
        <p className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-[11px] font-semibold text-red-600">{fehler}</p>
      )}
      {erfolg && (
        <p className="mt-2 rounded-lg bg-[var(--simple-accent-soft)] px-3 py-2 text-[11px] font-semibold text-[var(--simple-accent)]">
          {erfolg}
        </p>
      )}

      {status?.connected && stats && stats.tage > 0 && (
        <div className="mt-3 border-t border-[var(--border-muted)] pt-3">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            Letzte {stats.tage} Tage im Schnitt
          </p>
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px] sm:grid-cols-3">
            {[
              ['Schlaf', stats.schnitt.schlafStunden != null ? `${stats.schnitt.schlafStunden} h` : '—'],
              ['Score', stats.schnitt.schlafScore != null ? String(stats.schnitt.schlafScore) : '—'],
              ['HRV', stats.schnitt.hrv != null ? `${stats.schnitt.hrv} ms` : '—'],
              ['Ruhepuls', stats.schnitt.ruhepuls != null ? `${stats.schnitt.ruhepuls}` : '—'],
              ['Schritte', stats.schnitt.schritte != null ? Math.round(Number(stats.schnitt.schritte)).toLocaleString('de-DE') : '—'],
              ['Stress', stats.schnitt.stress != null ? String(stats.schnitt.stress) : '—'],
              ['Body Battery', stats.schnitt.bodyBatteryMax != null ? String(stats.schnitt.bodyBatteryMax) : '—'],
              ['SpO₂', stats.schnitt.spo2 != null ? `${stats.schnitt.spo2} %` : '—'],
              ['Vo₂max', stats.schnitt.vo2max != null ? String(stats.schnitt.vo2max) : '—'],
              ['Gewicht', stats.schnitt.gewicht != null ? `${stats.schnitt.gewicht} kg` : '—'],
            ].map(([label, wert]) => (
              <div key={label} className="flex justify-between gap-2">
                <span className="text-[var(--text-muted)]">{label}</span>
                <span className="font-semibold tabular-nums">{wert}</span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">
            Gesamt: {stats.gesamt.schritte.toLocaleString('de-DE')} Schritte ·{' '}
            {stats.gesamt.streckeKm} km · {stats.gesamt.aktiveKcal.toLocaleString('de-DE')} kcal aktiv
          </p>
        </div>
      )}

      {status?.connected && (
        <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
          Hinweis: Garmins Personal API ist nur lesend — Trainings lassen sich damit nicht auf die
          Uhr schreiben. Der Rückweg (geplante Einheiten aufs Gerät) läuft weiter über
          Intervals.icu.
        </p>
      )}
    </div>
  );
}
