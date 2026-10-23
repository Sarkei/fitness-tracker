/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Play, Loader2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import type { LibraryExercise } from '@/src/lib/exerciseLibrary';
import ExerciseMediaView from '@/src/components/workout/ExerciseMediaView';
import { ExerciseResolveError, resolveExerciseForDetail } from '@/src/services/exerciseDbService';
import { useAuth } from '@/src/lib/AuthContext';
import { useI18n } from '@/src/lib/i18n';
import { formatMuscleSummary, labelBodyPart, labelTargetMuscle } from '@/src/lib/exerciseMuscleLabels';
import {
  mobileSheetOverlayClass,
  overlayPortal,
  useMobileOverlaySheet,
} from '@/src/lib/mobileViewport';

export default function ExerciseDetailModal({
  open,
  exercise,
  onClose,
  onPick,
}: {
  open: boolean;
  exercise: LibraryExercise | null;
  onClose: () => void;
  onPick?: (ex: LibraryExercise) => void;
}) {
  const { t } = useI18n();
  useMobileOverlaySheet(open);
  const { profile } = useAuth();
  const gender =
    profile?.measurements?.gender === 'female'
      ? 'female'
      : profile?.measurements?.gender === 'male'
        ? 'male'
        : undefined;
  const [detail, setDetail] = useState<LibraryExercise | null>(exercise);
  const [loading, setLoading] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  useEffect(() => {
    setDetail(exercise);
    setResolveError(null);
  }, [exercise]);

  useEffect(() => {
    if (open) return;
    setDetail(null);
    setResolveError(null);
    setLoading(false);
  }, [open]);

  useEffect(() => {
    if (!open || !exercise) return;
    let cancelled = false;
    setLoading(true);
    setResolveError(null);
    resolveExerciseForDetail({
      exercise,
      exerciseKey: exercise.key,
      name: exercise.name,
    })
      .then(full => {
        if (!cancelled) {
          setDetail(full);
          setResolveError(null);
        }
      })
      .catch(err => {
        if (!cancelled) {
          const msg =
            err instanceof ExerciseResolveError
              ? err.message
              : err instanceof Error
                ? err.message
                : String(err);
          setResolveError(msg);
          setDetail(exercise);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, exercise?.key, exercise?.name, exercise?.exerciseId]);

  const ex = detail;
  const muscleLine = ex ? formatMuscleSummary(ex) : '';

  if (!open || !ex) return null;

  return overlayPortal(
        <motion.div
          key={ex.key}
          className={mobileSheetOverlayClass()}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button type="button" className="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-label="Schließen" onClick={onClose} />
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            className="relative z-10 flex max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)))] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-[var(--border-muted)] bg-[var(--card-bg)] shadow-2xl lg:max-h-[88dvh] lg:rounded-3xl"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--border-muted)] p-4 pt-[max(0.75rem,env(safe-area-inset-top))] md:pt-4">
              <h3 className="text-sm font-black italic uppercase tracking-tighter text-[var(--text-primary)] pr-2 line-clamp-2">
                {ex.name}
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="flex min-h-[44px] min-w-[44px] touch-manipulation items-center justify-center rounded-xl p-2 hover:bg-[var(--background)]"
                aria-label="Schließen"
              >
                <X size={20} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-4 space-y-4 [-webkit-overflow-scrolling:touch]">
              {loading && (
                <p className="text-center text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)] flex items-center justify-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  {t('exercise.detail.loading')}
                </p>
              )}

              {resolveError && !loading && (
                <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-3 space-y-1">
                  <p className="text-[9px] font-black uppercase tracking-widest text-orange-600">
                    {t('exercise.detail.unavailable')}
                  </p>
                  <p className="text-xs text-[var(--text-primary)] leading-relaxed">{resolveError}</p>
                </div>
              )}

              {ex && <ExerciseMediaView exercise={ex} gender={gender} />}

              {muscleLine && (
                <div className="rounded-xl border border-brand/25 bg-brand/5 p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-brand mb-1">
                    {t('exercise.detail.muscles')}
                  </p>
                  <p className="text-sm font-bold text-[var(--text-primary)]">{muscleLine}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {ex.bodyPart && (
                  <span className="rounded-lg bg-[var(--background)] px-2 py-1 text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)] border border-[var(--border-muted)]">
                    {labelBodyPart(ex.bodyPart)}
                  </span>
                )}
                {ex.targetMuscle && (
                  <span className="rounded-lg bg-brand/15 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-brand">
                    {labelTargetMuscle(ex.targetMuscle)}
                  </span>
                )}
                {ex.equipment && (
                  <span className="rounded-lg bg-[var(--background)] px-2 py-1 text-[8px] font-black uppercase tracking-widest text-[var(--text-muted)] border border-[var(--border-muted)]">
                    {ex.equipment}
                  </span>
                )}
                {ex.difficulty && (
                  <span className="rounded-lg bg-orange-500/15 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-orange-600">
                    {ex.difficulty}
                  </span>
                )}
              </div>

              {ex.secondaryMuscles && ex.secondaryMuscles.length > 0 && (
                <p className="text-xs text-[var(--text-muted)]">
                  <span className="font-black uppercase tracking-widest text-[9px]">
                    {t('exercise.detail.secondary')}:{' '}
                  </span>
                  {ex.secondaryMuscles.map(m => labelTargetMuscle(m) || m).join(', ')}
                </p>
              )}

              {ex.overview && (
                <p className="text-sm text-[var(--text-primary)] leading-relaxed">{ex.overview}</p>
              )}

              {ex.instructions && ex.instructions.length > 0 && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2">
                    {t('exercise.detail.instructions')}
                  </p>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-[var(--text-primary)]">
                    {ex.instructions.map((step, i) => (
                      <li key={i} className="leading-snug">
                        {step.replace(/^Step:\d+\s*/i, '')}
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {ex.exerciseTips && ex.exerciseTips.length > 0 && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2">
                    {t('exercise.detail.tips')}
                  </p>
                  <ul className="space-y-1.5 text-sm text-[var(--text-primary)]">
                    {ex.exerciseTips.map((tip, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-brand shrink-0">•</span>
                        <span>{tip}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {ex.variations && ex.variations.length > 0 && (
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-2">
                    {t('exercise.detail.variations')}
                  </p>
                  <ul className="space-y-1 text-sm text-[var(--text-muted)]">
                    {ex.variations.map((v, i) => (
                      <li key={i}>{v}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-[var(--border-muted)] p-4 flex flex-col gap-2">
              {onPick && (
                <button
                  type="button"
                  onClick={() => {
                    onPick(ex);
                    onClose();
                  }}
                  className={cn(
                    'w-full min-h-[52px] rounded-2xl font-black uppercase tracking-widest text-[10px]',
                    'ui-btn-brand flex items-center justify-center gap-2 touch-manipulation active:opacity-90',
                  )}
                >
                  <Play size={16} />
                  {t('exercise.detail.pick')}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>,
  );
}
