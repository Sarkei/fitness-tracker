import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { PrimaryButton } from './ui';
import { saveWorkout, todayYmd, type PlanDay, type SaveExercise } from './simpleApi';

/** Training erfassen — bewusst eine Liste: Übung, Sätze, Wiederholungen, Gewicht. */
export default function SessionSheet({
  day,
  title,
  date,
  onClose,
  onSaved,
}: {
  day: PlanDay | null;
  title: string;
  date: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial = useMemo<SaveExercise[]>(() => {
    const fromPlan = (day?.exercises ?? []).map((e) => ({
      name: e.name,
      sets: Number(e.sets) || 3,
      reps: Number(String(e.reps ?? '').replace(/\D/g, '')) || 10,
      weight: Number(String(e.weight ?? '').replace(',', '.').replace(/[^\d.]/g, '')) || 0,
    }));
    return fromPlan.length ? fromPlan : [{ name: '', sets: 3, reps: 10, weight: 0 }];
  }, [day]);

  const [name, setName] = useState(title);
  const [rows, setRows] = useState<SaveExercise[]>(initial);
  const [minutes, setMinutes] = useState(day?.estimatedDuration ?? 60);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(title);
  }, [title]);

  const update = (index: number, patch: Partial<SaveExercise>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const save = async () => {
    const filled = rows.filter((r) => r.name.trim());
    if (!filled.length) {
      setError('Mindestens eine Übung eintragen.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveWorkout({ name: name.trim() || 'Training', date: date || todayYmd(), duration: minutes, exercises: filled });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Speichern fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6" onClick={onClose}>
      <div
        className="flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl border border-[var(--border-muted)] bg-[var(--card-bg)] sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-muted)] px-4 py-3">
          <p className="text-sm font-black uppercase tracking-tighter">Training</p>
          <button className="rounded-full p-1.5 text-[var(--text-muted)]" onClick={onClose} aria-label="Schließen">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          <div className="grid grid-cols-[1fr_84px] gap-2">
            <input
              className="rounded-xl border border-[var(--border-muted)] bg-transparent px-3 py-2 text-sm font-semibold"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name des Trainings"
            />
            <label className="flex items-center gap-1 rounded-xl border border-[var(--border-muted)] px-2 text-xs">
              <input
                type="number"
                min={0}
                max={300}
                className="w-full bg-transparent py-2 text-center text-sm font-semibold outline-none"
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value) || 0)}
              />
              min
            </label>
          </div>

          <div className="space-y-2">
            {rows.map((row, index) => (
              <div key={index} className="rounded-2xl border border-[var(--border-muted)] p-2.5">
                <div className="flex items-center gap-2">
                  <input
                    className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
                    value={row.name}
                    onChange={(e) => update(index, { name: e.target.value })}
                    placeholder="Übung (z. B. Bankdrücken)"
                  />
                  <button
                    className="rounded-lg p-1 text-[var(--text-muted)] hover:text-red-500"
                    onClick={() => setRows((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))}
                    aria-label="Übung entfernen"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  {[
                    { key: 'sets' as const, label: 'Sätze', step: 1 },
                    { key: 'reps' as const, label: 'Wdh.', step: 1 },
                    { key: 'weight' as const, label: 'kg', step: 2.5 },
                  ].map((field) => (
                    <label key={field.key} className="rounded-xl bg-[var(--surface-gray)] px-2 py-1.5">
                      <span className="block text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                        {field.label}
                      </span>
                      <input
                        type="number"
                        step={field.step}
                        min={0}
                        className="w-full bg-transparent text-center text-sm font-bold outline-none"
                        value={row[field.key]}
                        onChange={(e) => update(index, { [field.key]: Number(e.target.value) || 0 } as Partial<SaveExercise>)}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, { name: '', sets: 3, reps: 10, weight: 0 }])}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[var(--border-muted)] py-2.5 text-sm font-semibold text-[var(--text-muted)]"
          >
            <Plus className="h-4 w-4" /> Übung hinzufügen
          </button>

          {error && <p className="rounded-xl bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-500">{error}</p>}
        </div>

        <div className="border-t border-[var(--border-muted)] p-3">
          <PrimaryButton full onClick={() => void save()} disabled={busy}>
            <span className="inline-flex items-center justify-center gap-2">
              <Check className="h-4 w-4" /> {busy ? 'Speichert …' : 'Training speichern'}
            </span>
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
