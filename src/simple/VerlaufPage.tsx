/**
 * Vollständiger Trainingsverlauf — alle Einheiten, die es je gab.
 *
 * Warum eine eigene Seite und nicht der Block auf der Trainingsseite: dort
 * stehen aus Gründen der Übersicht nur die letzten 10. Wer ältere Einheiten
 * ansehen will, musste bisher auf die Statistik ausweichen — dort gab es aber
 * keine Details. Diese Seite listet alles, gruppiert nach Monat, und jede Zeile
 * führt zur vollen Detailansicht:
 *  - Einheit von der Uhr → /einheit/<id> (Route, Zonen, Effekt, Diagramme)
 *  - selbst erfasste Einheit → /training (Tagesdetail mit Übungen und Sätzen)
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Dumbbell, Loader2, Search } from 'lucide-react';
import { Card, EmptyState, PageHeader } from './ui';
import { dauerMinuten, fetchWorkouts, formatDay, type WorkoutEntry } from './simpleApi';
import { toYmd } from './analytics';

/** Monatsname für die Gruppenüberschrift. */
function monatLabel(ymd: string): string {
  const d = new Date(`${ymd.slice(0, 7)}-01T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd.slice(0, 7);
  return d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
}

export default function VerlaufPage() {
  const navigate = useNavigate();
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);
  const [suche, setSuche] = useState('');
  /** 'alle' | 'uhr' | 'eigene' — Filter nach Herkunft. */
  const [filter, setFilter] = useState<'alle' | 'uhr' | 'eigene'>('alle');

  useEffect(() => {
    let ab = false;
    setLaedt(true);
    fetchWorkouts()
      .then((liste) => {
        if (!ab) setWorkouts(liste);
      })
      .catch((e) => {
        if (!ab) setFehler(e instanceof Error ? e.message : 'Verlauf konnte nicht geladen werden.');
      })
      .finally(() => {
        if (!ab) setLaedt(false);
      });
    return () => {
      ab = true;
    };
  }, []);

  /** Gefiltert und nach Datum absteigend — neueste zuerst. */
  const gefiltert = useMemo(() => {
    const q = suche.trim().toLowerCase();
    return workouts
      .filter((w) => {
        if (filter === 'uhr' && w.source !== 'garmin') return false;
        if (filter === 'eigene' && w.source === 'garmin') return false;
        if (q && !String(w.name ?? '').toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => String(toYmd(b.date)).localeCompare(String(toYmd(a.date))));
  }, [workouts, suche, filter]);

  /** Nach Monat gruppieren, Reihenfolge bleibt erhalten. */
  const gruppen = useMemo(() => {
    const map = new Map<string, WorkoutEntry[]>();
    for (const w of gefiltert) {
      const ymd = toYmd(w.date);
      const schluessel = ymd.slice(0, 7) || 'unbekannt';
      const liste = map.get(schluessel);
      if (liste) liste.push(w);
      else map.set(schluessel, [w]);
    }
    return [...map.entries()].map(([key, liste]) => ({
      key,
      label: key === 'unbekannt' ? 'Ohne Datum' : monatLabel(`${key}-01`),
      liste,
    }));
  }, [gefiltert]);

  /** Gesamtzahlen für den Kopf. */
  const summe = useMemo(() => {
    let minuten = 0;
    let km = 0;
    for (const w of gefiltert) {
      minuten += dauerMinuten(w);
      const d = Number(w.distance_km);
      if (Number.isFinite(d) && d > 0) km += d;
    }
    return { einheiten: gefiltert.length, minuten: Math.round(minuten), km: Math.round(km * 10) / 10 };
  }, [gefiltert]);

  return (
    <div className="space-y-4 lg:space-y-5">
      <PageHeader
        eyebrow="Training"
        title="Verlauf"
        hint={`${summe.einheiten} Einheiten · ${summe.minuten} min${summe.km > 0 ? ` · ${summe.km.toFixed(1)} km` : ''}`}
        action={
          <button
            type="button"
            onClick={() => navigate('/training')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border-muted)] px-3 py-1.5 text-[11.5px] font-semibold text-[var(--text-muted)] transition hover:text-[var(--foreground)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Zum Training
          </button>
        }
      />

      {/* Filter und Suche */}
      <Card className="space-y-3 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="search"
            value={suche}
            onChange={(e) => setSuche(e.target.value)}
            placeholder="Nach Name suchen"
            className="w-full rounded-xl border border-[var(--border-muted)] bg-[var(--card-bg)] py-2 pl-9 pr-3 text-[13px] outline-none focus:border-[var(--simple-accent)]"
          />
        </div>
        <div className="flex gap-1.5">
          {(
            [
              { id: 'alle', label: 'Alle' },
              { id: 'uhr', label: 'Von der Uhr' },
              { id: 'eigene', label: 'Selbst erfasst' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition ${
                filter === f.id
                  ? 'border-[var(--simple-accent)] bg-[var(--simple-accent)] text-[var(--simple-accent-ink)]'
                  : 'border-[var(--border-muted)] text-[var(--text-muted)] hover:border-[var(--simple-accent)]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </Card>

      {fehler && (
        <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600">{fehler}</p>
      )}

      {laedt ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Verlauf wird geladen …
        </div>
      ) : gruppen.length === 0 ? (
        <EmptyState
          icon={<Dumbbell className="h-6 w-6" />}
          title={workouts.length === 0 ? 'Noch keine Einheiten' : 'Kein Treffer'}
          hint={
            workouts.length === 0
              ? 'Sobald du trainierst, erscheint hier jede Einheit.'
              : 'Andere Suche oder Filter versuchen.'
          }
        />
      ) : (
        gruppen.map((g) => (
          <Card key={g.key} className="p-4">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
              {g.label} · {g.liste.length}
            </p>
            <ul className="divide-y divide-[var(--border-muted)]">
              {g.liste.map((w) => {
                const istGarmin = w.source === 'garmin';
                const minuten = Math.round(dauerMinuten(w));
                const km = Number(w.distance_km);
                const uebungen = Array.isArray(w.exercises) ? w.exercises.length : 0;
                return (
                  <li key={w.id}>
                    <button
                      type="button"
                      onClick={() =>
                        istGarmin
                          ? navigate(`/einheit/${encodeURIComponent(w.id)}`)
                          : navigate('/training')
                      }
                      className="flex w-full items-center gap-3 py-2.5 text-left transition hover:opacity-80"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block line-clamp-2 text-[13px] font-medium leading-snug">
                          {w.name}
                        </span>
                        <span className="mt-0.5 block text-[11px] tabular-nums text-[var(--text-muted)]">
                          {formatDay(toYmd(w.date))}
                          {minuten > 0 ? ` · ${minuten} min` : ''}
                          {Number.isFinite(km) && km > 0 ? ` · ${km.toFixed(2)} km` : ''}
                          {uebungen ? ` · ${uebungen} Übungen` : ''}
                          {istGarmin ? ' · Uhr' : ''}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-muted)]" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
