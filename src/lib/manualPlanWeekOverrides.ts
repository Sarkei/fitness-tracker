/**
 * Temporäre Übungstausche im manuellen Wochenplan (nur aktuelle Kalenderwoche).
 * Basis-`workoutPlan` und Plan-Vorlagen bleiben unverändert.
 */

import { weekMondayForWorkoutView, toLocalYmd } from '@/src/lib/coachWeekWindow';
import type { Exercise, ManualPlanExerciseSwap, ManualPlanWeekOverrides } from '@/src/types';

export function manualPlanWeekStartYmd(
  coachStartYmd: string | undefined | null,
  ref: Date = new Date(),
): string {
  return toLocalYmd(weekMondayForWorkoutView(coachStartYmd, ref));
}

export function applyManualPlanWeekOverrides<T extends { exercises?: Exercise[] }>(
  session: T,
  dayNumber: number,
  weekStartYmd: string,
  overrides: ManualPlanWeekOverrides | undefined,
): T {
  const daySwaps = overrides?.[weekStartYmd]?.[dayNumber];
  if (!daySwaps || !session.exercises?.length) return session;
  const exercises = session.exercises.map((ex, i) => {
    const swap = daySwaps[i];
    if (!swap) return ex;
    return {
      ...ex,
      id: swap.id || ex.id || `ex-${Date.now()}-${i}`,
      exerciseKey: swap.exerciseKey,
      name: swap.name,
      exerciseCategory: swap.exerciseCategory ?? ex.exerciseCategory,
    };
  });
  return { ...session, exercises };
}

export function upsertManualPlanWeekSwap(
  overrides: ManualPlanWeekOverrides | undefined,
  weekStartYmd: string,
  dayNumber: number,
  exerciseIndex: number,
  swap: ManualPlanExerciseSwap,
): ManualPlanWeekOverrides {
  const next: ManualPlanWeekOverrides = { ...(overrides || {}) };
  const week = { ...(next[weekStartYmd] || {}) };
  const day = { ...(week[dayNumber] || {}) };
  day[exerciseIndex] = swap;
  week[dayNumber] = day;
  next[weekStartYmd] = week;
  return next;
}

/** Alte Wochen-Overrides entfernen (Speicher in profile_extras begrenzen). */
export function pruneManualPlanWeekOverrides(
  overrides: ManualPlanWeekOverrides,
  ref: Date = new Date(),
): ManualPlanWeekOverrides {
  const monday = weekMondayForWorkoutView(null, ref);
  const cutoff = new Date(monday);
  cutoff.setDate(cutoff.getDate() - 8 * 7);
  const cutoffYmd = toLocalYmd(cutoff);
  const out: ManualPlanWeekOverrides = {};
  for (const [ymd, days] of Object.entries(overrides)) {
    if (ymd >= cutoffYmd) out[ymd] = days;
  }
  return out;
}
