import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Dumbbell, Flame, Moon, Play, Timer, Trash2, TrendingUp } from 'lucide-react';
import { Card, GhostButton, PageHeader, SectionTitle } from './ui';
import WorkoutSheet from './WorkoutSheet';
import {
  DAY_LABELS,
  dayKeyOf,
  deleteWorkout,
  fetchActivePlan,
  fetchWorkouts,
  formatDay,
  todayYmd,
  type CoachWeek,
  type PlanDay,
  type WorkoutEntry,
} from './simpleApi';

const WEEK_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function dayNumber(key: string): number {
  const today = new Date();
  const todayIndex = WEEK_ORDER.indexOf(dayKeyOf(todayYmd()));
  const offset = WEEK_ORDER.indexOf(key) - todayIndex;
  const date = new Date(today);
  date.setDate(date.getDate() + offset);
  return date.getDate();
}

export default function TrainingPage() {
  const today = todayYmd();
  const [week, setWeek] = useState<CoachWeek>(null);
  const [workouts, setWorkouts] = useState<WorkoutEntry[]>([]);
  const [selected, setSelected] = useState<string>(dayKeyOf(today));
  const [running, setRunning] = useState(false);
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
  const thisWeek = workouts.filter((w) => {
    const ymd = String(w.date).slice(0, 10);
    const diff = (new Date(`${today}T12:00:00`).getTime() - new Date(`${ymd}T12:00:00`).getTime()) / 86400000;
    return diff >= 0 && diff < 7;
  });
  const minutesThisWeek = thisWeek.reduce((sum, w) => sum + (Number(w.duration) || 0), 0);

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
      <PageHeader eyebrow="Dein Plan" title="Training" hint={week?.weekFocus || 'Wähle einen Tag und starte die Einheit.'} />

      <Card className="p-3">
        <div className="flex gap-1.5">
          {days.map((day) => {
            const active = day.day === selected;
            const isToday = day.day === dayKeyOf(today);
            return (
              <button
                key={day.day}
                onClick={() => setSelected(day.day)}
                className={`flex flex-1 flex-col items-center gap-1 rounded-xl border px-1 py-2 transition ${
                  active
                    ? 'border-[var(--simple-accent)] bg-[var(--simple-accent-soft)]'
                    : 'border-transparent hover:border-[var(--border-muted)]'
                }`}
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                  {DAY_LABELS[day.day].slice(0, 2)}
                </span>
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${
                    isToday
                      ? 'text-[var(--simple-accent-ink)]'
                      : active
                        ? 'text-[var(--simple-accent)]'
                        : 'text-[var(--foreground)]'
                  }`}
                  style={isToday ? { background: 'var(--simple-accent)' } : undefined}
                >
                  {dayNumber(day.day)}
                </span>
                <span
                  className={`h-1 w-1 rounded-full ${
                    day.isRest ? 'bg-transparent' : active || isToday ? 'bg-[var(--simple-accent)]' : 'bg-[var(--text-muted)]'
                  }`}
                />
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--simple-accent-soft)] text-[var(--simple-accent)]">
              {planDay?.isRest ? <Moon className="h-5 w-5" /> : <Dumbbell className="h-5 w-5" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                {DAY_LABELS[selected]}
              </p>
              <p className="text-lg font-semibold leading-tight">
                {planDay?.title || (planDay?.isRest ? 'Ruhetag' : 'Training')}
              </p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                {planDay?.isRest
                  ? 'Erholung — kein Training geplant.'
                  : `${(planDay?.exercises ?? []).length} Übungen${planDay?.estimatedDuration ? ` · ca. ${planDay.estimatedDuration} min` : ''}`}
              </p>
            </div>
            <button
              className="flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold"
              style={{ background: 'var(--simple-accent)', color: 'var(--simple-accent-ink)' }}
              onClick={() => setRunning(true)}
            >
              <Play className="h-4 w-4" /> Start
            </button>
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
        </Card>

        <Card className="p-5">
          <SectionTitle>Diese Woche</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-[var(--border-muted)] p-3">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                <Flame className="h-3 w-3" /> Einheiten
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{thisWeek.length}</p>
            </div>
            <div className="rounded-xl border border-[var(--border-muted)] p-3">
              <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
                <Timer className="h-3 w-3" /> Minuten
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{minutesThisWeek}</p>
            </div>
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
            <TrendingUp className="h-3.5 w-3.5 text-[var(--simple-accent)]" />
            {workouts.length} Einheiten insgesamt
          </p>
          {!week && (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              Noch kein aktiver Plan — unter „Mehr → Coach &amp; Pläne" erzeugen.
            </p>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <SectionTitle>Verlauf</SectionTitle>
        {workouts.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Noch kein Training erfasst.</p>
        ) : (
          <ul className="divide-y divide-[var(--border-muted)]">
            {workouts.slice(0, 8).map((workout) => (
              <li key={workout.id} className="flex items-center justify-between gap-3 py-2.5">
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
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { to: '/coach', title: 'Trainingsplan erzeugen', hint: 'KI baut eine Woche nach deinen Zielen' },
          { to: '/workouts', title: 'Vorlagen & Verlauf', hint: 'Eigene Einheiten und Historie' },
          { to: '/stats', title: 'Statistik', hint: 'Volumen, Fortschritt, Bestleistungen' },
        ].map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="group rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-4 transition hover:border-[var(--simple-accent)]"
          >
            <p className="flex items-center justify-between text-sm font-semibold">
              {item.title}
              <ChevronRight className="h-4 w-4 text-[var(--text-muted)] transition group-hover:text-[var(--simple-accent)]" />
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{item.hint}</p>
          </Link>
        ))}
      </div>

      {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}

      {running && (
        <WorkoutSheet
          day={planDay}
          name={planDay?.title || `Training ${formatDay(today)}`}
          date={today}
          onClose={() => setRunning(false)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}
