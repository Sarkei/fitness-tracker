/**
 * Tagesdetail für Training und Ernährung.
 *
 * Zeigt, was an einem Tag tatsächlich passiert ist: Einheiten mit Übungen und
 * Sätzen, Mahlzeiten mit Makros, Tagesziele. Wird von Fortschritt, Training und
 * Heute genutzt.
 */

import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { FoodEntry, WorkoutEntry } from '@/src/simple/simpleApi';

type Uebung = { name?: string; sets?: unknown };

function datumLang(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00`);
  if (Number.isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

/** Trainingsdatensatz auf seine Übungen reduzieren, egal wie er abgelegt ist. */
function uebungenVon(w: WorkoutEntry): Uebung[] {
  const raw = (w.exercises ?? []) as unknown;
  return Array.isArray(raw) ? (raw as Uebung[]) : [];
}

export type TrainingTag = {
  datum: string;
  workouts: WorkoutEntry[];
  mahlzeiten: FoodEntry[];
  kcalZiel?: number | null;
};

export function TrainingTagesdetail({
  tag,
  fokus = 'alle',
  onClose,
}: {
  tag: TrainingTag;
  fokus?: 'alle' | 'training' | 'ernaehrung';
  onClose: () => void;
}): React.ReactElement {
  const zeigeTraining = fokus === 'alle' || fokus === 'training';
  const zeigeErnaehrung = fokus === 'alle' || fokus === 'ernaehrung';

  const kcal = tag.mahlzeiten.reduce((s, m) => s + (Number(m.calories) || 0), 0);
  const protein = tag.mahlzeiten.reduce((s, m) => s + (Number(m.protein) || 0), 0);
  const carbs = tag.mahlzeiten.reduce((s, m) => s + (Number(m.carbs) || 0), 0);
  const fat = tag.mahlzeiten.reduce((s, m) => s + (Number(m.fat) || 0), 0);
  const volumen = tag.workouts.reduce((s, w) => {
    return (
      s +
      uebungenVon(w).reduce((sum, ex) => {
        const sets = Array.isArray(ex.sets) ? ex.sets : [];
        return (
          sum +
          sets.reduce((ss, set) => {
            const s2 = set as { reps?: number; weight?: number; completed?: boolean };
            if (s2.completed === false) return ss;
            return ss + (Number(s2.reps) || 0) * (Number(s2.weight) || 0);
          }, 0)
        );
      }, 0)
    );
  }, 0);

  const inhalt = (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="max-h-[var(--vv-height,92dvh)] w-full max-w-lg overflow-hidden rounded-t-[1.75rem] bg-[var(--card-bg)] shadow-2xl sm:rounded-[1.75rem]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-muted)] p-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">Tag</p>
            <h2 className="text-base font-semibold text-[var(--foreground)]">{datumLang(tag.datum)}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] transition hover:text-[var(--foreground)]"
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[calc(92dvh-4.5rem)] space-y-3 overflow-y-auto p-4">
          {zeigeTraining && (
            <div className="rounded-xl border border-[var(--border-muted)] p-3">
              <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Training
              </p>
              {tag.workouts.length === 0 ? (
                <p className="py-1 text-[12px] text-[var(--text-muted)]">Kein Training an diesem Tag.</p>
              ) : (
                <>
                  <div className="flex justify-between border-b border-[var(--border-muted)] py-1.5">
                    <span className="text-[12px] text-[var(--text-muted)]">Einheiten</span>
                    <span className="text-[13px] font-semibold">{tag.workouts.length}</span>
                  </div>
                  <div className="flex justify-between border-b border-[var(--border-muted)] py-1.5">
                    <span className="text-[12px] text-[var(--text-muted)]">Volumen</span>
                    <span className="text-[13px] font-semibold tabular-nums">
                      {volumen >= 1000 ? `${(volumen / 1000).toFixed(1)}k` : Math.round(volumen)} kg
                    </span>
                  </div>
                  {tag.workouts.map((w) => (
                    <div key={w.id} className="mt-2 rounded-lg bg-[var(--surface-gray)] px-2.5 py-2">
                      <p className="text-[12.5px] font-semibold text-[var(--foreground)]">
                        {w.name ?? w.type ?? 'Einheit'}
                      </p>
                      {w.duration ? (
                        <p className="text-[11px] text-[var(--text-muted)]">{w.duration} min</p>
                      ) : null}
                      {uebungenVon(w).length > 0 && (
                        <ul className="mt-1 space-y-0.5">
                          {uebungenVon(w).map((ex, i) => {
                            const sets = Array.isArray(ex.sets) ? ex.sets : [];
                            return (
                              <li key={`${w.id}-${i}`} className="flex justify-between gap-2 text-[11.5px]">
                                <span className="truncate text-[var(--foreground)]">{ex.name ?? 'Übung'}</span>
                                <span className="shrink-0 tabular-nums text-[var(--text-muted)]">
                                  {sets.length > 0 ? `${sets.length} Sätze` : ''}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {zeigeErnaehrung && (
            <div className="rounded-xl border border-[var(--border-muted)] p-3">
              <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
                Ernährung
              </p>
              {tag.mahlzeiten.length === 0 ? (
                <p className="py-1 text-[12px] text-[var(--text-muted)]">Keine Mahlzeiten erfasst.</p>
              ) : (
                <>
                  <div className="flex justify-between border-b border-[var(--border-muted)] py-1.5">
                    <span className="text-[12px] text-[var(--text-muted)]">Kalorien</span>
                    <span className="text-[13px] font-semibold tabular-nums">
                      {Math.round(kcal)}
                      {tag.kcalZiel ? (
                        <span className="ml-1 text-[10.5px] font-normal text-[var(--text-muted)]">
                          / {Math.round(tag.kcalZiel)}
                        </span>
                      ) : null}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-[var(--border-muted)] py-1.5">
                    <span className="text-[12px] text-[var(--text-muted)]">Protein · K · F</span>
                    <span className="text-[13px] font-semibold tabular-nums">
                      {Math.round(protein)} · {Math.round(carbs)} · {Math.round(fat)} g
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {tag.mahlzeiten.map((m) => (
                      <li key={m.id} className="flex justify-between gap-2 text-[11.5px]">
                        <span className="truncate text-[var(--foreground)]">{m.meal}</span>
                        <span className="shrink-0 tabular-nums text-[var(--text-muted)]">
                          {Math.round(Number(m.calories) || 0)} kcal
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Portal statt Inline: der Sheet haengt an <body> und verschiebt die Seite nicht,
  // wenn nach dem Eintragen neue Werte dazukommen.
  return typeof document === 'undefined' ? inhalt : createPortal(inhalt, document.body);
}

/** Klickbare Zeile in einer Tages-Tabelle. */
export function TagesZeileKlick({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <tr onClick={onClick} className="cursor-pointer transition hover:bg-[var(--surface-gray)]">
      {children}
    </tr>
  );
}
