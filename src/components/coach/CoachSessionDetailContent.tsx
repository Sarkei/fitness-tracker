/**
 * Detail-Inhalt einer einzelnen Coach-Trainingseinheit (Warmup, Übungen, Cardio, Cooldown).
 */

import { Loader2, RefreshCw, Save } from 'lucide-react';
import { displayCoachExerciseName } from '@/src/lib/coachExerciseDisplay';
import {
  coachRowExercises,
  coachRowHasExercises,
} from '@/src/lib/coachTemplateMappers';
import { resolveCoachPhaseExerciseRows } from '@/src/lib/coachWarmupCooldown';
import type { UiLocale } from '@/src/lib/i18n';
import type { LibraryExercise } from '@/src/lib/exerciseLibrary';
import { formatCoachRowWeightDisplay } from '@/src/lib/exerciseLibrarySwap';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

export type CoachSessionDetailProps = {
  session: Record<string, unknown>;
  locale: UiLocale;
  t: TFn;
  /** Vorschau in Workouts/This Week — ohne Übung tauschen */
  preview?: boolean;
  dayName?: string;
  templateBusy?: boolean;
  /** Einzelne Coach-Session als Workout-Vorlage speichern */
  onSaveAsTemplate?: () => void;
  onOpenExercise?: (payload: { exerciseKey?: string; name?: string }) => void;
  onOpenSwapPicker?: (payload: {
    exerciseKey?: string;
    name?: string;
    onSwap: (repl: LibraryExercise) => void;
  }) => void;
  onSwapExercise?: (dayName: string, exerciseIndex: number, repl: LibraryExercise) => void;
};

export default function CoachSessionDetailContent({
  session,
  locale,
  t,
  preview = false,
  dayName = String(session.day || ''),
  templateBusy = false,
  onSaveAsTemplate,
  onOpenExercise,
  onOpenSwapPicker,
  onSwapExercise,
}: CoachSessionDetailProps) {
  const d = session;
  const warmupRows = resolveCoachPhaseExerciseRows(d, 'warmup');
  const cooldownRows = resolveCoachPhaseExerciseRows(d, 'cooldown');
  const exercises = coachRowExercises(d);

  return (
    <div className="space-y-4 pt-3">
      {typeof d.description === 'string' && d.description.trim() ? (
        <p className="text-sm text-[var(--text-muted)] font-medium break-words">{d.description}</p>
      ) : null}

      {warmupRows.length > 0 ? (
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-brand mb-2">{t('coach.day.warmup')}</p>
          <div className="space-y-2">
            {warmupRows.map((ex, i) => (
              <div key={`w-${i}`} className="flex items-stretch gap-2 bg-[var(--background)] rounded-xl p-3">
                {onOpenExercise ? (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenExercise({
                        exerciseKey: typeof ex.exerciseKey === 'string' ? ex.exerciseKey : undefined,
                        name: typeof ex.name === 'string' ? ex.name : undefined,
                      })
                    }
                    className="flex-1 min-w-0 text-left space-y-1 touch-manipulation hover:opacity-90"
                  >
                    <ExerciseLine ex={ex} locale={locale} />
                  </button>
                ) : (
                  <div className="flex-1 min-w-0">
                    <ExerciseLine ex={ex} locale={locale} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {coachRowHasExercises(d) ? (
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-3">
            {t('coach.day.exercises')}
          </p>
          <div className="space-y-2">
            {exercises.map((ex, i) => (
              <div
                key={i}
                className="flex items-stretch gap-2 bg-[var(--background)] rounded-xl p-3 border border-transparent"
              >
                {onOpenExercise ? (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenExercise({
                        exerciseKey: typeof ex.exerciseKey === 'string' ? ex.exerciseKey : undefined,
                        name: typeof ex.name === 'string' ? ex.name : undefined,
                      })
                    }
                    className="flex-1 min-w-0 text-left space-y-1 touch-manipulation hover:opacity-90"
                  >
                    <ExerciseLine ex={ex} locale={locale} showCoachHint={!preview} t={t} />
                  </button>
                ) : (
                  <div className="flex-1 min-w-0">
                    <ExerciseLine ex={ex} locale={locale} />
                  </div>
                )}
                {!preview && onSwapExercise && onOpenSwapPicker ? (
                  <button
                    type="button"
                    title={t('exercise.action.swap')}
                    disabled={templateBusy}
                    onClick={e => {
                      e.stopPropagation();
                      onOpenSwapPicker({
                        exerciseKey: typeof ex.exerciseKey === 'string' ? ex.exerciseKey : undefined,
                        name: typeof ex.name === 'string' ? ex.name : undefined,
                        onSwap: repl => void onSwapExercise(dayName, i, repl),
                      });
                    }}
                    className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-[var(--border-muted)] bg-[var(--card-bg)] text-[var(--text-muted)] hover:border-brand hover:text-brand transition-colors disabled:opacity-50"
                  >
                    {templateBusy ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <CardioBlock session={d} t={t} />

      {cooldownRows.length > 0 ? (
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest text-brand mb-2">{t('coach.day.cooldown')}</p>
          <div className="space-y-2">
            {cooldownRows.map((ex, i) => (
              <div key={`c-${i}`} className="flex items-stretch gap-2 bg-[var(--background)] rounded-xl p-3">
                {onOpenExercise ? (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenExercise({
                        exerciseKey: typeof ex.exerciseKey === 'string' ? ex.exerciseKey : undefined,
                        name: typeof ex.name === 'string' ? ex.name : undefined,
                      })
                    }
                    className="flex-1 min-w-0 text-left space-y-1 touch-manipulation hover:opacity-90"
                  >
                    <ExerciseLine ex={ex} locale={locale} />
                  </button>
                ) : (
                  <div className="flex-1 min-w-0">
                    <ExerciseLine ex={ex} locale={locale} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {typeof d.notes === 'string' && d.notes.trim() ? (
        <p className="text-xs font-medium italic leading-relaxed text-[var(--text-primary)]/85">{d.notes}</p>
      ) : null}

      {!preview && onSaveAsTemplate ? (
        <button
          type="button"
          disabled={templateBusy}
          onClick={e => {
            e.stopPropagation();
            onSaveAsTemplate();
          }}
          className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[var(--border-muted)] bg-[var(--card-bg)] px-4 py-3 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] hover:border-brand hover:text-brand transition-colors disabled:opacity-50"
        >
          {templateBusy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {t('coach.tpl.saveSession')}
        </button>
      ) : null}
    </div>
  );
}

function ExerciseLine({
  ex,
  locale,
  showCoachHint,
  t,
}: {
  ex: Record<string, unknown>;
  locale: UiLocale;
  showCoachHint?: boolean;
  t?: TFn;
}) {
  const weightLabel = formatCoachRowWeightDisplay(ex);

  return (
    <>
      <p className="font-black uppercase text-sm tracking-tight text-[var(--text-primary)] break-words leading-snug">
        {displayCoachExerciseName(
          {
            name: String(ex.name ?? ''),
            exerciseKey: typeof ex.exerciseKey === 'string' ? ex.exerciseKey : undefined,
          },
          locale,
        )}
      </p>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {(ex.sets || ex.reps) ? (
          <p className="text-[10px] font-black text-brand">
            {String(ex.sets ?? '')}×{String(ex.reps ?? '')}
          </p>
        ) : null}
        {weightLabel ? (
          <p className="text-[10px] text-[var(--text-muted)] font-bold">{weightLabel}</p>
        ) : null}
        {ex.rest ? (
          <p className="text-[10px] text-[var(--text-muted)] font-bold">
            {t ? t('coach.day.restColon') : 'Rest'}: {String(ex.rest)}
          </p>
        ) : null}
      </div>
      {typeof ex.notes === 'string' && ex.notes.trim() ? (
        <p className="text-[10px] text-[var(--text-muted)] font-medium break-words leading-relaxed">{ex.notes}</p>
      ) : null}
      {showCoachHint && t ? (
        <p className="text-[8px] font-black uppercase tracking-widest text-brand/80 pt-0.5">
          {t('exercise.action.info')} →
        </p>
      ) : null}
    </>
  );
}

function CardioBlock({ session, t }: { session: Record<string, unknown>; t: TFn }) {
  const c = session.cardio && typeof session.cardio === 'object' ? (session.cardio as Record<string, unknown>) : null;
  const hasCardioPayload =
    !!c && !!(c.type || c.details || c.duration || c.distance || c.pace || c.zones);
  const looksCardio =
    !session.isRest &&
    !coachRowHasExercises(session) &&
    /cardio|interval|run|ride|bike|swim|row|aerobic|tempo|endurance|hiit|\b5k\b|\b10k\b/i.test(
      `${session.sessionType || ''} ${session.title || ''}`,
    );
  const fallbackDesc = typeof session.description === 'string' ? session.description.trim() : '';

  if (!hasCardioPayload && looksCardio && fallbackDesc) {
    return (
      <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
        <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-cyan-600 dark:text-cyan-400">
          {t('coach.day.cardio')}
        </p>
        <p className="break-words text-sm font-medium leading-relaxed text-[var(--text-primary)]">{fallbackDesc}</p>
      </div>
    );
  }
  if (!hasCardioPayload) return null;

  return (
    <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-4">
      <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-cyan-600 dark:text-cyan-400">
        {t('coach.day.cardio')}
      </p>
      {c!.details ? (
        <p className="mb-3 break-words text-sm font-medium leading-relaxed text-[var(--text-primary)]">
          {String(c!.details)}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3 text-sm">
        {c!.distance ? <span className="font-black text-[var(--text-primary)]">{String(c!.distance)}</span> : null}
        {c!.duration ? <span className="font-bold text-[var(--text-primary)]">{String(c!.duration)}</span> : null}
        {c!.pace ? (
          <span className="font-bold text-[var(--text-primary)]">Pace: {String(c!.pace)}</span>
        ) : null}
        {c!.zones ? <span className="font-bold text-[var(--text-primary)]">{String(c!.zones)}</span> : null}
      </div>
    </div>
  );
}
