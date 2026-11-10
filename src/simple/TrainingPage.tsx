import { useCallback, useEffect, useMemo, useState } from 'react';
import { Dumbbell, Moon, Play, Trash2 } from 'lucide-react';
import { Card, SectionTitle } from './ui';
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
    return WEEK_ORDER.map(
      (key) => schedule.find((d) => d.day === key) ?? { day: key, isRest: true, title: 'Ruhetag' },
    );
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
    <div className="mx-auto w-full max-w-2xl space-y-4 pb-6">
      <header className="pt-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Dein Plan</p>
        <h1 className="text-3xl font-black tracking-tighter">Training</h1>
        {week?.weekFocus && <p className="mt-1 text-sm text-[var(--text-muted)]">{week.weekFocus}</p>}
      </header>

      {!week && (
        <Card>
          <p className="text-sm font-semibold">Noch kein aktiver Trainingsplan.</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Unter „Mehr → Coach & Pläne“ kannst du einen Plan erzeugen. Bis dahin trägst du dein Training einfach direkt ein.
          </p>
        </Card>
      )}

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {days.map((day) => {
          const active = day.day === selected;
          const isToday = day.day === dayKeyOf(today);
          return (
            <button
              key={day.day}
              onClick={() => setSelected(day.day)}
              className={`flex min-w-[64px] flex-col items-center rounded-2xl border px-2 py-2 text-[11px] font-semibold transition ${
                active ? 'border-brand bg-brand/10 text-brand' : 'border-[var(--border-muted)] text-[var(--text-muted)]'
              }`}
            >
              <span>{DAY_LABELS[day.day]?.slice(0, 2)}</span>
              <span className="mt-1 h-1.5 w-1.5 rounded-full" style={{ background: day.isRest ? 'transparent' : 'currentColor' }} />
              {isToday && <span className="mt-0.5 text-[9px] uppercase tracking-widest">heute</span>}
            </button>
          );
        })}
      </div>

      <Card>
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/10 text-brand">
            {planDay?.isRest ? <Moon className="h-5 w-5" /> : <Dumbbell className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold">{planDay?.title || (planDay?.isRest ? 'Ruhetag' : 'Training')}</p>
            <p className="text-xs text-[var(--text-muted)]">
              {planDay?.description ||
                (planDay?.isRest
                  ? 'Erholung — kein Training geplant.'
                  : `${(planDay?.exercises ?? []).length} Übungen${planDay?.estimatedDuration ? ` · ca. ${planDay.estimatedDuration} min` : ''}`)}
            </p>
          </div>
        </div>

        {(planDay?.exercises ?? []).length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {(planDay?.exercises ?? []).map((exercise, index) => (
              <li key={`${exercise.name}-${index}`} className="flex items-baseline justify-between gap-2 rounded-xl bg-[var(--surface-gray)] px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{exercise.name}</span>
                <span className="shrink-0 text-xs text-[var(--text-muted)]">
                  {[exercise.sets && `${exercise.sets}×`, exercise.reps && `${exercise.reps}`, exercise.weight].filter(Boolean).join(' ')}
                </span>
              </li>
            ))}
          </ul>
        )}

        <button
          onClick={() => setShowSheet(true)}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand py-3 text-sm font-bold text-white"
        >
          <Play className="h-4 w-4" /> {planDay?.isRest ? 'Trotzdem erfassen' : 'Training starten'}
        </button>
      </Card>

      <div>
        <SectionTitle>Diese Woche</SectionTitle>
        <Card className="!p-4">
          {doneThisWeek.length === 0 ? (
            <p className="py-1 text-sm text-[var(--text-muted)]">Noch kein Training erfasst.</p>
          ) : (
            <ul className="divide-y divide-[var(--border-muted)]">
              {doneThisWeek.map((workout) => (
                <li key={workout.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{workout.name}</p>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {formatDay(String(workout.date).slice(0, 10))} · {workout.duration} min
                    </p>
                  </div>
                  <button className="rounded-lg p-1.5 text-[var(--text-muted)] hover:text-red-500" onClick={() => void remove(workout.id)} aria-label="Löschen">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500">{error}</p>}

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
