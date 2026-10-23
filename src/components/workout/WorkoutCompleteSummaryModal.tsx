/**
 * Motivations-Popup nach abgeschlossener Live-Session mit Kennzahlen & PRs.
 */

import { useMemo, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Share2, Trophy, Clock, Flame } from 'lucide-react';
import type { Workout } from '@/src/types';
import { useI18n } from '@/src/lib/i18n';
import {
  mobileSheetOverlayClass,
  MobileOverlayRoot,
  overlayPortal,
  useMobileOverlaySheet,
} from '@/src/lib/mobileViewport';
import { computeWorkoutSessionSummary } from '@/src/lib/workoutSessionSummary';
import { displayWeight, getWeightUnit } from '@/src/lib/workoutPreferences';
import { cn } from '@/src/lib/utils';

export type WorkoutCompleteSummaryModalProps = {
  open: boolean;
  workout: Partial<Workout>;
  priorWorkouts: Workout[];
  onClose: () => void;
  onShareFeed: () => void;
  onCopyShare: () => void;
  isPosting?: boolean;
};

function formatWeight(kg: number, unit: ReturnType<typeof getWeightUnit>): string {
  if (kg <= 0) return '—';
  const v = displayWeight(kg, unit);
  return unit === 'lb' ? `${v} lb` : `${v} kg`;
}

export default function WorkoutCompleteSummaryModal({
  open,
  workout,
  priorWorkouts,
  onClose,
  onShareFeed,
  onCopyShare,
  isPosting = false,
}: WorkoutCompleteSummaryModalProps) {
  const { t } = useI18n();
  const unit = getWeightUnit();

  const summary = useMemo(() => {
    if (!open) return null;
    return computeWorkoutSessionSummary(workout as Workout, priorWorkouts);
  }, [open, workout, priorWorkouts]);

  const prCount = summary?.weightPrs.length ?? 0;

  if (!open || !summary) return null;

  return (
    <MobileOverlayRoot open={open}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={mobileSheetOverlayClass('p-4 sm:p-6')}
          role="dialog"
          aria-modal="true"
          aria-labelledby="workout-complete-title"
        >
          <motion.div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 16 }}
            className="bg-[var(--card-bg)] w-full max-w-md max-h-[min(92vh,720px)] rounded-[2rem] sm:rounded-[2.5rem] relative z-10 border border-[var(--border-muted)] shadow-2xl flex flex-col overflow-hidden"
          >
            <div className="overflow-y-auto overscroll-contain flex-1 p-6 sm:p-8 pb-4">
              <div
                className={cn(
                  'w-16 h-16 sm:w-20 sm:h-20 rounded-[1.5rem] sm:rounded-[2rem] flex items-center justify-center mx-auto mb-5',
                  prCount > 0 ? 'bg-amber-500/15 text-amber-500' : 'bg-brand/10 text-brand',
                )}
              >
                {prCount > 0 ? <Trophy size={36} /> : <CheckCircle2 size={36} />}
              </div>

              <h3
                id="workout-complete-title"
                className="text-xl sm:text-2xl font-black italic uppercase tracking-tighter text-center mb-1"
              >
                {t('work.complete.title')}
              </h3>
              <p className="text-[var(--text-muted)] text-[10px] font-black uppercase tracking-widest text-center mb-6 leading-relaxed">
                {prCount > 0
                  ? t('work.complete.subtitlePr', { n: String(prCount) })
                  : t('work.complete.subtitle')}
              </p>

              {(summary.hasStrengthWork || summary.totalSets > 0) && (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <StatTile label={t('work.complete.volume')} value={`${summary.totalVolumeKg.toLocaleString()} kg`} />
                    <StatTile label={t('work.complete.reps')} value={String(summary.totalReps)} />
                    <StatTile label={t('work.complete.sets')} value={String(summary.totalSets)} />
                    <StatTile label={t('work.complete.exercises')} value={String(summary.exerciseCount)} />
                  </div>

                  {summary.muscleShares.length > 0 && (
                    <section className="mb-5 text-left">
                      <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-3">
                        {t('work.complete.muscles')}
                      </p>
                      <ul className="space-y-2.5">
                        {summary.muscleShares.map(row => (
                          <li key={row.muscleId}>
                            <div className="flex justify-between items-baseline gap-2 mb-1">
                              <span className="text-[10px] font-bold uppercase tracking-wide truncate">
                                {t(row.labelKey)}
                              </span>
                              <span className="text-[10px] font-black tabular-nums shrink-0">{row.percent}%</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-[var(--background)] overflow-hidden">
                              <div
                                className="h-full rounded-full bg-brand transition-all"
                                style={{ width: `${Math.min(100, row.percent)}%` }}
                              />
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  <section className="mb-5 text-left">
                    <p className="text-[8px] font-black text-[var(--text-muted)] uppercase tracking-widest mb-3">
                      {t('work.complete.prsTitle')}
                    </p>
                    {summary.weightPrs.length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)] leading-relaxed">{t('work.complete.noPrs')}</p>
                    ) : (
                      <ul className="space-y-2">
                        {summary.weightPrs.map(pr => (
                          <li
                            key={pr.exerciseName}
                            className="flex items-start justify-between gap-3 bg-[var(--background)] border border-[var(--border-muted)] rounded-xl px-3 py-2.5"
                          >
                            <span className="text-[11px] font-bold leading-snug min-w-0">{pr.exerciseName}</span>
                            <span className="text-[10px] font-black tabular-nums text-brand shrink-0 text-right">
                              {pr.isFirstRecord
                                ? t('work.complete.prFirst', { kg: formatWeight(pr.newMaxKg, unit) })
                                : t('work.complete.prFromTo', {
                                    from: formatWeight(pr.previousMaxKg, unit),
                                    to: formatWeight(pr.newMaxKg, unit),
                                  })}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </>
              )}

              {summary.hasCardioWork && !summary.hasStrengthWork && (
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <StatTile
                    label={t('work.complete.cardioMinutes')}
                    value={t('work.complete.minutesValue', { n: String(summary.cardioMinutes) })}
                  />
                  {summary.cardioDistanceKm > 0 && (
                    <StatTile
                      label={t('work.complete.cardioDistance')}
                      value={t('work.complete.kmValue', { n: String(summary.cardioDistanceKm) })}
                    />
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <StatTile
                  label={t('work.complete.duration')}
                  value={t('work.complete.minutesValue', { n: String(workout.duration ?? 0) })}
                  icon={<Clock size={12} className="text-[var(--text-muted)]" />}
                />
                <StatTile
                  label={t('work.complete.burn')}
                  value={`${workout.caloriesBurned ?? 0} ${t('dash.unit.kcal')}`}
                  icon={<Flame size={12} className="text-[var(--text-muted)]" />}
                />
              </div>
            </div>

            <div className="flex-shrink-0 p-5 sm:p-6 pt-2 border-t border-[var(--border-muted)] flex flex-col gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={onShareFeed}
                disabled={isPosting}
                className="w-full min-h-[48px] ui-btn-brand rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-brand/20 flex items-center justify-center gap-2 disabled:opacity-50 touch-manipulation"
              >
                <Share2 size={16} />
                {isPosting ? t('work.complete.sharing') : t('work.complete.share')}
              </button>
              <button
                type="button"
                onClick={onCopyShare}
                className="w-full min-h-[48px] bg-[var(--background)] border border-[var(--border-muted)] text-[var(--text-primary)] rounded-2xl font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 touch-manipulation"
              >
                <Share2 size={16} />
                {t('work.complete.copyShare')}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="w-full min-h-[44px] text-[var(--text-muted)] font-black uppercase tracking-widest text-[10px] touch-manipulation"
              >
                {t('work.complete.close')}
              </button>
            </div>
          </motion.div>
        </motion.div>
    </MobileOverlayRoot>
  );
}

function StatTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: ReactNode;
}) {
  return (
    <div className="bg-[var(--background)] p-3 sm:p-4 rounded-2xl border border-[var(--border-muted)] text-center">
      <p className="text-[8px] font-black text-[var(--text-muted)] uppercase mb-1 flex items-center justify-center gap-1">
        {icon}
        {label}
      </p>
      <p className="text-base sm:text-lg font-black italic tabular-nums">{value}</p>
    </div>
  );
}
