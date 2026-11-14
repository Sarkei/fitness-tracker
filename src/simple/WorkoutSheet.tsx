import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Minus, Plus, Timer, X } from 'lucide-react';
import { PrimaryButton } from './ui';
import { saveWorkout, type PlanDay, type PlanExercise } from './simpleApi';

type SetRow = { weight: number; reps: number; done: boolean };
type Exercise = { name: string; plan: string; rows: SetRow[] };

function parseNumber(value: unknown, fallback: number): number {
  const parsed = Number(String(value ?? '').replace(/[^0-9.,]/g, '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toExercise(entry: PlanExercise): Exercise {
  const sets = Math.min(8, Math.max(1, parseNumber(entry.sets, 3)));
  const reps = parseNumber(entry.reps, 10);
  const weight = parseNumber(entry.weight, 0);
  return {
    name: entry.name,
    plan: `${sets} × ${reps}${weight ? ` · ${weight} kg` : ''}`,
    rows: Array.from({ length: sets }, () => ({ weight, reps, done: false })),
  };
}

/** Trainingsbildschirm im Stil von openGym: Übung für Übung, Satz für Satz, mit Pausentimer. */
export default function WorkoutSheet({
  day,
  name,
  date,
  onClose,
  onSaved,
}: {
  day: PlanDay | null;
  name: string;
  date: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [exercises, setExercises] = useState<Exercise[]>(() =>
    (day?.exercises ?? []).map(toExercise).length
      ? (day?.exercises ?? []).map(toExercise)
      : [{ name: 'Erste Übung', plan: '3 × 10', rows: Array.from({ length: 3 }, () => ({ weight: 0, reps: 10, done: false })) }],
  );
  const [active, setActive] = useState(0);
  const [rest, setRest] = useState(0);
  const [restTotal, setRestTotal] = useState(90);
  const [startedAt] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
      setRest((value) => (value > 0 ? value - 1 : 0));
    }, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const doneSets = exercises.reduce((sum, exercise) => sum + exercise.rows.filter((row) => row.done).length, 0);
  const totalSets = exercises.reduce((sum, exercise) => sum + exercise.rows.length, 0);
  const volume = exercises.reduce(
    (sum, exercise) => sum + exercise.rows.filter((row) => row.done).reduce((s, row) => s + row.weight * row.reps, 0),
    0,
  );

  const change = (exerciseIndex: number, rowIndex: number, patch: Partial<SetRow>) => {
    setExercises((prev) =>
      prev.map((exercise, index) =>
        index === exerciseIndex
          ? { ...exercise, rows: exercise.rows.map((row, i) => (i === rowIndex ? { ...row, ...patch } : row)) }
          : exercise,
      ),
    );
  };

  const toggleDone = (exerciseIndex: number, rowIndex: number) => {
    const row = exercises[exerciseIndex].rows[rowIndex];
    change(exerciseIndex, rowIndex, { done: !row.done });
    if (!row.done) {
      setRest(restTotal);
      const nextFree = exercises[exerciseIndex].rows.findIndex((r, i) => i > rowIndex && !r.done);
      if (nextFree === -1 && exerciseIndex < exercises.length - 1) setActive(exerciseIndex + 1);
    }
  };

  const minutes = useMemo(() => Math.max(1, Math.round(elapsed / 60)), [elapsed]);

  const finish = async () => {
    const payload = exercises
      .map((exercise) => {
        const done = exercise.rows.filter((row) => row.done);
        if (!done.length) return null;
        return {
          name: exercise.name,
          sets: done.length,
          reps: Math.round(done.reduce((sum, row) => sum + row.reps, 0) / done.length),
          weight: done[0].weight,
        };
      })
      .filter((value): value is { name: string; sets: number; reps: number; weight: number } => Boolean(value));

    if (!payload.length) {
      setError('Noch kein Satz abgehakt.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveWorkout({ name, date, duration: minutes, exercises: payload });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Training konnte nicht gespeichert werden.');
      setSaving(false);
    }
  };

  const clock = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(Math.max(0, seconds % 60)).padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--background)]">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3">
        <button className="rounded-full border border-[var(--border-muted)] p-2 text-[var(--text-muted)]" onClick={onClose} aria-label="Schließen">
          <X className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="text-[11px] text-[var(--text-muted)]">
            {clock(elapsed)} · {doneSets}/{totalSets} Sätze
          </p>
        </div>
        <button
          className="rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-40"
          style={{ background: 'var(--simple-accent)', color: 'var(--simple-accent-ink)' }}
          onClick={() => void finish()}
          disabled={saving}
        >
          {saving ? '…' : 'Fertig'}
        </button>
      </div>

      <div className="mx-auto w-full max-w-3xl px-4">
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border-muted)]">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${(doneSets / Math.max(1, totalSets)) * 100}%`, background: 'var(--simple-accent)' }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-[var(--text-muted)]">
          <span>{Math.round(volume).toLocaleString('de-DE')} kg bewegt</span>
          <span>{exercises.length} Übungen</span>
        </div>
      </div>

      <div className="mx-auto mt-3 flex w-full max-w-3xl gap-1.5 overflow-x-auto px-4 pb-2">
        {exercises.map((exercise, index) => {
          const complete = exercise.rows.every((row) => row.done);
          return (
            <button
              key={`${exercise.name}-${index}`}
              onClick={() => setActive(index)}
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition ${
                index === active
                  ? 'border-[var(--simple-accent)] bg-[var(--simple-accent-soft)] text-[var(--simple-accent)]'
                  : complete
                    ? 'border-[var(--simple-accent)]/40 text-[var(--simple-accent)]'
                    : 'border-[var(--border-muted)] text-[var(--text-muted)]'
              }`}
            >
              {index + 1}
            </button>
          );
        })}
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 pb-40">
        <div className="rounded-2xl border border-[var(--border-muted)] bg-[var(--card-bg)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold leading-tight">{exercises[active].name}</h2>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">Plan: {exercises[active].plan}</p>
            </div>
            <div className="flex gap-1">
              <button
                className="rounded-lg border border-[var(--border-muted)] p-1.5 text-[var(--text-muted)] disabled:opacity-30"
                onClick={() => setActive((index) => Math.max(0, index - 1))}
                disabled={active === 0}
                aria-label="Vorherige Übung"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
              <button
                className="rounded-lg border border-[var(--border-muted)] p-1.5 text-[var(--text-muted)] disabled:opacity-30"
                onClick={() => setActive((index) => Math.min(exercises.length - 1, index + 1))}
                disabled={active === exercises.length - 1}
                aria-label="Nächste Übung"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-[36px_1fr_1fr_44px] items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
            <span>Satz</span>
            <span className="text-center">Gewicht</span>
            <span className="text-center">Wdh</span>
            <span />
          </div>

          <div className="mt-1 space-y-1.5">
            {exercises[active].rows.map((row, rowIndex) => (
              <div
                key={rowIndex}
                className={`grid grid-cols-[36px_1fr_1fr_44px] items-center gap-2 rounded-xl border px-1.5 py-1.5 transition ${
                  row.done ? 'border-[var(--simple-accent)]/50 bg-[var(--simple-accent-soft)]' : 'border-[var(--border-muted)]'
                }`}
              >
                <span className="text-center text-xs font-semibold text-[var(--text-muted)]">{rowIndex + 1}</span>
                <div className="flex items-center justify-between gap-1">
                  <button
                    className="rounded-md p-1 text-[var(--text-muted)]"
                    onClick={() => change(active, rowIndex, { weight: Math.max(0, row.weight - 2.5) })}
                    aria-label="Gewicht kleiner"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-[38px] text-center text-sm font-semibold tabular-nums">{row.weight}</span>
                  <button
                    className="rounded-md p-1 text-[var(--text-muted)]"
                    onClick={() => change(active, rowIndex, { weight: row.weight + 2.5 })}
                    aria-label="Gewicht größer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-1">
                  <button
                    className="rounded-md p-1 text-[var(--text-muted)]"
                    onClick={() => change(active, rowIndex, { reps: Math.max(1, row.reps - 1) })}
                    aria-label="Wiederholungen kleiner"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="min-w-[26px] text-center text-sm font-semibold tabular-nums">{row.reps}</span>
                  <button
                    className="rounded-md p-1 text-[var(--text-muted)]"
                    onClick={() => change(active, rowIndex, { reps: row.reps + 1 })}
                    aria-label="Wiederholungen größer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button
                  className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                    row.done ? 'bg-[var(--simple-accent)]' : 'border border-[var(--border-muted)] text-[var(--text-muted)]'
                  }`}
                  style={row.done ? { color: 'var(--simple-accent-ink)' } : undefined}
                  onClick={() => toggleDone(active, rowIndex)}
                  aria-label="Satz abhaken"
                >
                  <Check className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>

          <button
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--border-muted)] py-2 text-xs font-semibold text-[var(--text-muted)]"
            onClick={() =>
              setExercises((prev) =>
                prev.map((exercise, index) =>
                  index === active
                    ? {
                        ...exercise,
                        rows: [
                          ...exercise.rows,
                          { ...exercise.rows[exercise.rows.length - 1], done: false },
                        ],
                      }
                    : exercise,
                ),
              )
            }
          >
            <Plus className="h-3.5 w-3.5" /> Satz hinzufügen
          </button>
        </div>

        {error && <p className="mt-3 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}
      </div>

      {rest > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border-muted)] bg-[var(--card-bg)]/95 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
            <Timer className="h-5 w-5 text-[var(--simple-accent)]" />
            <span className="text-2xl font-semibold tabular-nums">{clock(rest)}</span>
            <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">Pause</span>
            <div className="ml-auto flex gap-1.5">
              <button
                className="rounded-lg border border-[var(--border-muted)] px-2.5 py-1.5 text-xs font-semibold"
                onClick={() => setRest((value) => Math.max(0, value - 15))}
              >
                −15s
              </button>
              <button
                className="rounded-lg border border-[var(--border-muted)] px-2.5 py-1.5 text-xs font-semibold"
                onClick={() => {
                  setRestTotal((value) => value + 15);
                  setRest((value) => value + 15);
                }}
              >
                +15s
              </button>
              <button
                className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                style={{ background: 'var(--simple-accent)', color: 'var(--simple-accent-ink)' }}
                onClick={() => setRest(0)}
              >
                Weiter
              </button>
            </div>
          </div>
        </div>
      )}

      {!rest && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-muted)] bg-[var(--card-bg)]/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-3xl gap-2">
            <PrimaryButton full onClick={() => void finish()} disabled={saving}>
              Training speichern
            </PrimaryButton>
          </div>
        </div>
      )}
    </div>
  );
}
