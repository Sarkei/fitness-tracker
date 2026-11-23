/**
 * Mealplanner-Verbindung im Profil.
 *
 * Der Kopplungscode wird im Mealplanner unter Profil erzeugt und hier eingetragen.
 * Der Fitness-Tracker liest damit den Wochenplan (Gerichte pro Tag) und zeigt ihn
 * im Coach-Kontext. Der Code bleibt serverseitig und geht nie an den Browser zurück.
 */
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Link2, Loader2, RefreshCw, Trash2, Utensils } from 'lucide-react';
import { api } from '@/src/lib/api';

type Status = {
  connected: boolean;
  baseUrl: string;
  householdName: string | null;
  connectedAt: string | null;
  lastSync: string | null;
  lastError: string | null;
  hasCode: boolean;
};

type WochenEintrag = {
  tag: string;
  mahlzeit: string;
  titel: string;
  portionen: number | null;
  kcal: number | null;
};

type WochenPlan = { woche: string; anzahl: number; kcalSumme: number; eintraege: WochenEintrag[] };

function fmtDatum(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function MealplannerConnect() {
  const [status, setStatus] = useState<Status | null>(null);
  const [woche, setWoche] = useState<WochenPlan | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [arbeitet, setArbeitet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  const [offen, setOffen] = useState(false);
  const [code, setCode] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://meal-planner.nas-timgreen.com');

  const laden = useCallback(async () => {
    setLaedt(true);
    try {
      const s = await api<Status>('/api/integrations/mealplanner');
      setStatus(s);
      setBaseUrl(s.baseUrl);
      if (s.connected) {
        try {
          setWoche(await api<WochenPlan>('/api/integrations/mealplanner/week'));
        } catch {
          setWoche(null);
        }
      } else {
        setWoche(null);
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
    if (!code.trim()) {
      setFehler('Bitte den Kopplungscode aus dem Mealplanner einfügen.');
      return;
    }
    setArbeitet(true);
    setFehler(null);
    setErfolg(null);
    try {
      // Eigene Adresse mitgeben: der Mealplanner meldet Planänderungen sofort hierher.
      const eigeneAdresse = `${window.location.origin}/api/integrations/mealplanner/webhook`;
      const res = await api<{ householdName: string | null }>('/api/integrations/mealplanner/connect', {
        method: 'POST',
        body: JSON.stringify({
          code: code.trim(),
          baseUrl: baseUrl.trim(),
          callbackUrl: eigeneAdresse,
        }),
      });
      setCode('');
      setOffen(false);
      setErfolg(`Verbunden mit ${res.householdName || 'dem Mealplanner'}.`);
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Verbindung fehlgeschlagen.');
    } finally {
      setArbeitet(false);
    }
  };

  /** Echter Sync: fragt den Mealplanner nach dem aktuellen Wochenplan. */
  const synchronisieren = async () => {
    setArbeitet(true);
    setFehler(null);
    setErfolg(null);
    try {
      const r = await api<{ ms: number; anzahl: number; kcalSumme: number }>(
        '/api/integrations/mealplanner/sync',
        { method: 'POST' },
      );
      setErfolg(
        r.anzahl > 0
          ? `${r.anzahl} Mahlzeiten · ${r.kcalSumme} kcal — in ${r.ms} ms abgeglichen.`
          : 'Abgeglichen — für diese Woche ist nichts geplant.',
      );
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Sync fehlgeschlagen.');
    } finally {
      setArbeitet(false);
    }
  };

  const trennen = async () => {
    if (!window.confirm('Mealplanner-Verbindung trennen? Der Wochenplan wird dann nicht mehr gelesen.')) return;
    setArbeitet(true);
    try {
      await api('/api/integrations/mealplanner', { method: 'DELETE' });
      setErfolg('Verbindung getrennt.');
      await laden();
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Trennen fehlgeschlagen.');
    } finally {
      setArbeitet(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--simple-accent-soft)] text-[var(--simple-accent)]">
          <Utensils className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[12.5px] font-semibold text-[var(--foreground)]">Mealplanner</p>
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
                ? `Erfolgreich verbunden${status.householdName ? ` · ${status.householdName}` : ''}`
                : 'Kopplungscode im Mealplanner unter Profil erzeugen und hier eintragen.'}
          </p>
          {status?.connected && (
            <p className="mt-0.5 text-[10.5px] text-[var(--text-muted)]">
              Zuletzt synchronisiert: {fmtDatum(status.lastSync ?? status.connectedAt)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {status?.connected ? (
            <>
              <button
                type="button"
                onClick={() => void synchronisieren()}
                disabled={arbeitet}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-muted)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--text-muted)] transition hover:text-[var(--foreground)]"
                title="Jetzt mit dem Mealplanner abgleichen"
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
              <Link2 className="h-3.5 w-3.5" /> Verbinden
            </button>
          )}
        </div>
      </div>

      {status?.connected && (
        <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--text-muted)]">
          Änderungen an der Woche kommen sofort an — die App meldet jede Planänderung. Der
          Sync-Knopf ist nur für den manuellen Abgleich nötig.
        </p>
      )}

      {offen && !status?.connected && (
        <div className="mt-3 space-y-2 border-t border-[var(--border-muted)] pt-3">
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              Kopplungscode
            </span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="XXXX-XXXX-XXXX"
              className="mt-1 w-full rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-3 py-2 font-mono text-sm tracking-wider outline-none focus:border-[var(--simple-accent)]"
            />
          </label>
          <label className="block">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
              Adresse
            </span>
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--border-muted)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--simple-accent)]"
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void verbinden()}
              disabled={arbeitet}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--simple-accent)] px-3 py-2 text-[11px] font-semibold text-white disabled:opacity-50"
            >
              {arbeitet ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              Verbinden
            </button>
            <a
              href={`${baseUrl.replace(/\/$/, '')}/#/settings`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--text-muted)] hover:text-[var(--foreground)]"
            >
              Code im Mealplanner holen <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}

      {status?.connected && woche && woche.anzahl > 0 && (
        <p className="mt-2 border-t border-[var(--border-muted)] pt-2 text-[11px] text-[var(--text-muted)]">
          Wochenplan gelesen: {woche.anzahl} {woche.anzahl === 1 ? 'Gericht' : 'Gerichte'} ·{' '}
          {woche.kcalSumme} kcal
        </p>
      )}
      {status?.connected && (!woche || woche.anzahl === 0) && !laedt && (
        <p className="mt-3 border-t border-[var(--border-muted)] pt-2 text-[11px] text-[var(--text-muted)]">
          Für diese Woche ist im Mealplanner nichts geplant.
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
    </div>
  );
}
