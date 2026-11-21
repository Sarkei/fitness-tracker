import { useCallback, useEffect, useState } from 'react';
import { AlarmClock, Loader2, Pause, Play, Plus, Trash2, X } from 'lucide-react';
import { api } from '@/src/lib/api';

/**
 * Eigene Zeitplaene des Coaches: anzeigen, pausieren, loeschen.
 *
 * Die Eintraege entstehen im Chat ("mach nach jedem Training eine Analyse").
 * Hier verwaltet der Nutzer sie, ohne den Chat bemuehen zu muessen.
 */

type Zeitplan = {
  id: number;
  trigger: 'nach_training' | 'taeglich' | 'waechentlich' | 'monatlich';
  weekday: number | null;
  day_of_month: number | null;
  time_of_day: string | null;
  title: string;
  task: string;
  active: boolean;
  last_run_at: string | null;
  last_result: string | null;
  run_count: number;
  created_at: string;
};

const TAGE = ['', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

/** Wann laeuft dieser Zeitplan? Kurz und lesbar. */
function wann(p: Zeitplan): string {
  switch (p.trigger) {
    case 'nach_training':
      return 'nach jedem Training';
    case 'taeglich':
      return `täglich um ${p.time_of_day ?? '—'}`;
    case 'waechentlich':
      return `jeden ${TAGE[p.weekday ?? 1] ?? 'Montag'} um ${p.time_of_day ?? '—'}`;
    case 'monatlich':
      return `am ${p.day_of_month ?? 1}. jeden Monats um ${p.time_of_day ?? '—'}`;
    default:
      return p.trigger;
  }
}

function wannZuletzt(iso: string | null): string {
  if (!iso) return 'noch nie gelaufen';
  const d = new Date(iso);
  const minuten = Math.round((Date.now() - d.getTime()) / 60000);
  if (minuten < 60) return `vor ${Math.max(1, minuten)} Min.`;
  if (minuten < 60 * 24) return `vor ${Math.round(minuten / 60)} Std.`;
  return `vor ${Math.round(minuten / 1440)} Tagen`;
}

export default function CoachZeitplaene({
  offen,
  onSchliessen,
}: {
  offen: boolean;
  onSchliessen: () => void;
}) {
  const [plaene, setPlaene] = useState<Zeitplan[]>([]);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [arbeitet, setArbeitet] = useState<number | null>(null);
  const [zeigeVerlauf, setZeigeVerlauf] = useState<number | null>(null);

  const laden = useCallback(async () => {
    setLaedt(true);
    setFehler(null);
    try {
      setPlaene(await api<Zeitplan[]>('/api/coach/schedules'));
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Zeitpläne konnten nicht geladen werden.');
    } finally {
      setLaedt(false);
    }
  }, []);

  useEffect(() => {
    if (offen) void laden();
  }, [offen, laden]);

  const umschalten = useCallback(async (p: Zeitplan) => {
    setArbeitet(p.id);
    setFehler(null);
    try {
      await api(`/api/coach/schedules/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !p.active }),
      });
      setPlaene((prev) => prev.map((x) => (x.id === p.id ? { ...x, active: !p.active } : x)));
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Änderung fehlgeschlagen.');
    } finally {
      setArbeitet(null);
    }
  }, []);

  const loeschen = useCallback(async (p: Zeitplan) => {
    if (!window.confirm(`Zeitplan „${p.title}" wirklich löschen?`)) return;
    setArbeitet(p.id);
    setFehler(null);
    try {
      await api(`/api/coach/schedules/${p.id}`, { method: 'DELETE' });
      setPlaene((prev) => prev.filter((x) => x.id !== p.id));
    } catch (e) {
      setFehler(e instanceof Error ? e.message : 'Löschen fehlgeschlagen.');
    } finally {
      setArbeitet(null);
    }
  }, []);

  if (!offen) return null;

  return (
    <div className="rounded-2xl border border-[var(--border-muted)] bg-[var(--surface-gray)] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          <AlarmClock className="h-3.5 w-3.5" /> Eigene Zeitpläne
        </p>
        <button
          type="button"
          onClick={onSchliessen}
          className="rounded-lg p-1 text-[var(--text-muted)] transition hover:text-[var(--foreground)]"
          aria-label="Schließen"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {laedt && (
        <p className="flex items-center gap-2 py-2 text-[12px] text-[var(--text-muted)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Wird geladen …
        </p>
      )}

      {fehler && (
        <p className="rounded-lg bg-[var(--danger-soft,var(--surface-gray))] px-2 py-1.5 text-[11.5px] text-[var(--danger,#c2410c)]">
          {fehler}
        </p>
      )}

      {!laedt && plaene.length === 0 && (
        <p className="py-1 text-[12px] leading-relaxed text-[var(--text-muted)]">
          Noch keine Zeitpläne. Sag dem Coach zum Beispiel:{' '}
          <span className="text-[var(--foreground)]">
            „Mach nach jedem Training eine Analyse und schreib sie mir."
          </span>
        </p>
      )}

      <ul className="space-y-1.5">
        {plaene.map((p) => (
          <li
            key={p.id}
            className="rounded-xl border border-[var(--border-muted)] bg-[var(--surface)] px-2.5 py-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[12.5px] font-semibold text-[var(--foreground)]">{p.title}</p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  {wann(p)} · {wannZuletzt(p.last_run_at)}
                  {p.run_count > 0 && ` · ${p.run_count}× gelaufen`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => void umschalten(p)}
                  disabled={arbeitet === p.id}
                  title={p.active ? 'Pausieren' : 'Fortsetzen'}
                  className="rounded-lg p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--surface-gray)] hover:text-[var(--foreground)] disabled:opacity-40"
                >
                  {p.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => void loeschen(p)}
                  disabled={arbeitet === p.id}
                  title="Löschen"
                  className="rounded-lg p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--surface-gray)] hover:text-[var(--danger,#c2410c)] disabled:opacity-40"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {!p.active && (
              <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                pausiert
              </p>
            )}

            {p.last_result && (
              <>
                <button
                  type="button"
                  onClick={() => setZeigeVerlauf(zeigeVerlauf === p.id ? null : p.id)}
                  className="mt-1 text-[10.5px] font-semibold text-[var(--simple-accent)] hover:underline"
                >
                  {zeigeVerlauf === p.id ? 'Letztes Ergebnis verbergen' : 'Letztes Ergebnis'}
                </button>
                {zeigeVerlauf === p.id && (
                  <p className="mt-1 whitespace-pre-wrap rounded-lg bg-[var(--surface-gray)] p-2 text-[11.5px] leading-relaxed text-[var(--text-muted)]">
                    {p.last_result}
                  </p>
                )}
              </>
            )}
          </li>
        ))}
      </ul>

      {plaene.length > 0 && (
        <p className="mt-2 flex items-center gap-1 text-[10.5px] text-[var(--text-muted)]">
          <Plus className="h-3 w-3" /> Neue Zeitpläne legst du im Chat an.
        </p>
      )}
    </div>
  );
}
