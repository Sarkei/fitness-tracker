/**
 * Auswertung geloggter Sätze für PR, Volumen & Verlauf (nur sinnvolle Kraft-Sätze).
 */

import type { Exercise, SetDetail } from '@/src/types';
import { isBlockMetaExercise, isSetDetailArray, isCardioExercise } from '@/src/lib/workoutSessionUtils';

export { isCardioExercise };

/** Für Statistik: abgeschlossen, kein Warm-up, Kraftübung. */
export function strengthSetsForStats(ex: Exercise): SetDetail[] {
  if (isBlockMetaExercise(ex) || isCardioExercise(ex)) return [];
  if (!isSetDetailArray(ex.sets)) return [];
  return ex.sets.filter(s => s.completed !== false && s.type !== 'warmup');
}

export function strengthVolumeFromSets(sets: SetDetail[]): number {
  return sets.reduce((sum, s) => sum + (s.weight || 0) * (s.reps || 0), 0);
}

export function maxWeightFromSets(sets: SetDetail[]): number {
  let max = 0;
  for (const s of sets) {
    if (typeof s.weight === 'number' && s.weight > max) max = s.weight;
  }
  return max;
}

export interface CardioLogSummary {
  minutes: number;
  distanceKm: number;
}

export function cardioSummaryFromExercise(ex: Exercise): CardioLogSummary | null {
  if (!isCardioExercise(ex) || !isSetDetailArray(ex.sets)) return null;
  const done = ex.sets.filter(s => s.completed !== false);
  if (done.length === 0) return null;
  const s = done[0];
  return {
    minutes: s.reps || 0,
    distanceKm: s.weight || 0,
  };
}
