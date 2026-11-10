import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dumbbell, Moon, Play, Trash2 } from 'lucide-react';
import { Card, GhostButton, PageHeader, PrimaryButton, SectionTitle } from './ui';
import SessionSheet from './SessionSheet';
import {
  DAY_LABELS,
  deleteWorkout,
  dayKeyOf,
  fetchActivePlan,
  fetchWorkouts,
  formatDay,
  todayYmd,
  type CoachWeek,
  type PlanDay,
  type WorkoutEntry,
} from './simpleApi';

const WEEK_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function TrainingPage() {
  const today = todayYmd();
  const [week, setWeek] = useState<CoachWeek>(null);
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([]);
  const [selected, setSelected] = useState<string>(dayKeyOf(today));
  const [showSheet, setShowSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [plan, list] = await Promise.all([fetchActivePlan().catch(() => null), fetchWorkouts().catch(() => [])]);
      setWeek(plan?.week ?? null);
      setWorkouts(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Konnte nicht laden.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const days = useMemo<PlanDay[]>(() => {
    const schedule = week?.schedule ?? [];
    return WEEK_ORDER.map((key) => schedule.find((d) => d.day === key) ?? { day: key, isRest: true, title: 'Ruhetag' });
  }, [week]);

  const planDay = days.find((d) => d.day === selected) ?? null;
  const doneThisWeek = workouts.filter((w) => {
    const ymd = String(w.date).slice(0, 10);
    const diff = (new Date(`${today}T12:00:00`).getTime() - new Date(`${ymd}T12:00:00`).getTime()) / 86400000;
    return diff >= 0 && diff < 7;
  });

  const remove = async (id: string) => {
    if (!window.confirm('Training löschen?')) return;
    try {
      await deleteWorkout(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Löschen fehlgeschlagen.');
    }
  };

  return (
    <div className="space-y-5 lg:space-y-6">
      <PageHeader eyebrow="Dein Plan" title="Training" hint={week?.weekFocus} />

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {days.map((day) => {
          const active = day.day === selected;
          const isToday = day.day === dayKeyOf(today);
          return (
            <button
              key={day.day}
              onClick={() => setSelected(day.day)}
              className={`min-w-[72px] rounded-xl border px-3 py-2 text-xs font-medium transition ${
                active
                  ? 'border-[var(--simple-accent)] bg-[var(--simple-accent-soft)] text-[var(--simple-accent)]'
                  : 'border-[var(--border-muted)] text-[var(--text-muted)] hover:text-[var(--foreground)]'
              }`}
            >
              <span className="block">{DAY_LABELS[day.day]}</span>
              <span className="mt-0.5 block text-[10px] uppercase tracking-[0.14em] opacity-70">
                {isToday ? 'heute' : day.isRest ? 'frei' : 'Training'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--simple-accent-soft)] text-[var(--simple-accent)]">
              {planDay?.isRest ? <Moon className="h-5 w-5" /> : <Dumbbell className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold">{planDay?.title || (planDay?.isRest ? 'Ruhetag' : 'Training')}</p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                {planDay?.description ||
                  (planDay?.isRest
                    ? 'Erholung — kein Training geplant.'
                    : `${(planDay?.exercises ?? []).length} Übungen${planDay?.estimatedDuration ? ` · ca. ${planDay.estimatedDuration} min` : ''}`)}
              </p>
            </div>
          </div>

          {(planDay?.exercises ?? []).length > 0 && (
            <ul className="mt-4 divide-y divide-[var(--border-muted)]">
              {(planDay?.exercises ?? []).map((exercise, index) => (
                <li key={`${exercise.name}-${index}`} className="flex items-baseline justify-between gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{exercise.name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-[var(--text-muted)]">
                    {[exercise.sets && `${exercise.sets}×`, exercise.reps && `${exercise.reps}`, exercise.weight]
                      .filter(Boolean)
                      .join(' ')}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <PrimaryButton full className="mt-4" onClick={() => setShowSheet(true)}>
            <Play className="h-4 w-4" /> {planDay?.isRest ? 'Trotzdem erfassen' : 'Training starten'}
          </PrimaryButton>
        </Card>

        <Card className="p-5">
          <SectionTitle>Diese Woche</SectionTitle>
          {doneThisWeek.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Noch kein Training erfasst.</p>
          ) : (
            <ul className="divide-y divide-[var(--border-muted)]">
              {doneThisWeek.map((workout) => (
                <li key={workout.id} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{workout.name}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {formatDay(String(workout.date).slice(0, 10))} · {workout.duration} min
                    </p>
                  </div>
                  <button
                    className="rounded-lg p-1.5 text-[var(--text-muted)] transition hover:text-[var(--simple-clay)]"
                    onClick={() => void remove(workout.id)}
                    aria-label="Löschen"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!week && (
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              Noch kein aktiver Trainingsplan — unter „Mehr → Coach &amp; Pläne" erzeugen.
            </p>
          )}
        </Card>
      </div>

      {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}

      {showSheet && (
        <SessionSheet
          day={planDay}
          title={planDay?.title || `Training ${formatDay(today)}`}
          date={today}
          onClose={() => setShowSheet(false)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}
