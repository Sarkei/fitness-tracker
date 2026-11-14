/**
 * Progressive-Overload-Vorschläge aus Workout-Historie.
 */

import type { Exercise, SetDetail, Workout } from '@/src/types';
import { normalizeExerciseName } from '@/src/lib/fitnessInsights';
import { strengthSetsForStats } from '@/src/lib/workoutSetStats';

export interface SetSuggestion {
  weightKg: number;
  reps: number;
  reasonKey: 'progressive.overload.same' | 'progressive.overload.up' | 'progressive.overload.deload';
}

function lastWorkingSet(ex: Exercise): SetDetail | null {
  const sets = strengthSetsForStats(ex);
  return sets.length ? sets[sets.length - 1] : null;
}

/** Letzte Session mit gleicher Übung (neueste zuerst). */
function findLastExerciseLog(
  workouts: Workout[],
  exerciseName: string,
  excludeWorkoutId?: string,
): Exercise | null {
  const key = normalizeExerciseName(exerciseName);
  const sorted = [...workouts]
    .filter(w => w.id !== excludeWorkoutId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  for (const w of sorted) {
    for (const ex of w.exercises || []) {
      if (normalizeExerciseName(ex.name) !== key) continue;
      const last = lastWorkingSet(ex);
      if (last) return ex;
    }
  }
  return null;
}

/** Deload-Woche: Ø RPE der letzten 14 Tage ≥ 8,5 oder 3+ harte Sessions in 7 Tagen. */
export function isDeloadWeek(workouts: Workout[], refDate = new Date()): boolean {
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const twoWeekMs = 14 * 24 * 60 * 60 * 1000;
  const ref = refDate.getTime();
  let rpeSum = 0;
  let rpeCount = 0;
  let sessions7 = 0;

  for (const w of workouts) {
    const t = new Date(w.date).getTime();
    if (ref - t > twoWeekMs) continue;
    if (ref - t <= weekMs) sessions7 += 1;
    for (const ex of w.exercises || []) {
      const sets = strengthSetsForStats(ex);
      for (const s of sets) {
        if (s.rpe != null && s.rpe > 0) {
          rpeSum += s.rpe;
          rpeCount += 1;
        }
      }
    }
  }

  if (sessions7 >= 4 && rpeCount >= 8) {
    const avg = rpeSum / rpeCount;
    if (avg >= 8.5) return true;
  }
  return sessions7 >= 5;
}

export function suggestSetForExercise(
  workouts: Workout[],
  exerciseName: string,
  setIndex: number,
  excludeWorkoutId?: string,
): SetSuggestion | null {
  const prevEx = findLastExerciseLog(workouts, exerciseName, excludeWorkoutId);
  if (!prevEx || !Array.isArray(prevEx.sets)) return null;

  const working = strengthSetsForStats(prevEx);
  if (!working.length) return null;

  const ref = working[Math.min(setIndex, working.length - 1)];
  const deload = isDeloadWeek(workouts);

  if (deload) {
    return {
      weightKg: Math.round(ref.weight * 0.9 * 2) / 2,
      reps: ref.reps,
      reasonKey: 'progressive.overload.deload',
    };
  }

  const avgRpe =
    working.filter(s => s.rpe).reduce((a, s) => a + (s.rpe || 0), 0) /
    Math.max(1, working.filter(s => s.rpe).length);

  if (avgRpe > 0 && avgRpe <= 7) {
    const bump = ref.reps >= 10 ? 0 : ref.weight < 20 ? 2.5 : 5;
    return {
      weightKg: Math.round((ref.weight + bump) * 2) / 2,
      reps: ref.reps,
      reasonKey: 'progressive.overload.up',
    };
  }

  return {
    weightKg: ref.weight,
    reps: ref.reps,
    reasonKey: 'progressive.overload.same',
  };
}

/** Füllt leere Sätze mit Vorschlägen (nur weight/reps = 0). */
export function applySuggestionsToExercise(
  ex: Exercise,
  workouts: Workout[],
  excludeWorkoutId?: string,
): Exercise {
  if (!Array.isArray(ex.sets)) return ex;
  const sets = (ex.sets as SetDetail[]).map((s, i) => {
    if (s.completed || (s.weight > 0 && s.reps > 0)) return s;
    const sug = suggestSetForExercise(workouts, ex.name, i, excludeWorkoutId);
    if (!sug) return s;
    return { ...s, weight: sug.weightKg, reps: sug.reps };
  });
  return { ...ex, sets };
}
