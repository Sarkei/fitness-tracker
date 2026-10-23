/**
 * Zusammenfassung nach abgeschlossener Live-Session (Volumen, PRs, Muskelverteilung).
 */

import type { Exercise, Workout } from '@/src/types';
import { getPersonalRecordKg, normalizeExerciseName } from '@/src/lib/fitnessInsights';
import { isBodyweightByNameOrEquipment } from '@/src/lib/exerciseLibrarySwap';
import { computeMuscleVolumeSharesForWorkout, strengthVolumeForWorkout } from '@/src/lib/workoutAnalytics';
import {
  cardioSummaryFromExercise,
  isCardioExercise,
  maxWeightFromSets,
  strengthSetsForStats,
  strengthVolumeFromSets,
} from '@/src/lib/workoutSetStats';
import { isBlockMetaExercise } from '@/src/lib/workoutSessionUtils';

export type ExerciseWeightPR = {
  exerciseName: string;
  previousMaxKg: number;
  newMaxKg: number;
  /** Erster geloggter Max mit Gewicht */
  isFirstRecord: boolean;
};

export type WorkoutSessionSummary = {
  totalVolumeKg: number;
  totalReps: number;
  totalSets: number;
  exerciseCount: number;
  muscleShares: ReturnType<typeof computeMuscleVolumeSharesForWorkout>;
  weightPrs: ExerciseWeightPR[];
  hasStrengthWork: boolean;
  hasCardioWork: boolean;
  cardioMinutes: number;
  cardioDistanceKm: number;
};

function countStrengthTotals(exercises: Exercise[]): {
  volume: number;
  reps: number;
  sets: number;
  exerciseCount: number;
} {
  let volume = 0;
  let reps = 0;
  let sets = 0;
  let exerciseCount = 0;

  for (const ex of exercises) {
    if (isBlockMetaExercise(ex) || isCardioExercise(ex)) continue;
    const working = strengthSetsForStats(ex);
    if (working.length === 0) continue;
    exerciseCount += 1;
    volume += strengthVolumeFromSets(working);
    for (const s of working) {
      sets += 1;
      reps += s.reps || 0;
    }
  }

  return { volume, reps, sets, exerciseCount };
}

function detectWeightPrs(workout: Workout, priorWorkouts: Workout[]): ExerciseWeightPR[] {
  const prs: ExerciseWeightPR[] = [];

  for (const ex of workout.exercises || []) {
    if (isBlockMetaExercise(ex) || isCardioExercise(ex)) continue;
    if (isBodyweightByNameOrEquipment(ex.name, ex.exerciseKey)) continue;

    const working = strengthSetsForStats(ex);
    if (working.length === 0) continue;

    const newMax = maxWeightFromSets(working);
    if (newMax <= 0) continue;

    const previousMax = getPersonalRecordKg(priorWorkouts, ex.name);
    if (newMax > previousMax) {
      prs.push({
        exerciseName: ex.name,
        previousMaxKg: previousMax,
        newMaxKg: newMax,
        isFirstRecord: previousMax <= 0,
      });
    }
  }

  return prs.sort((a, b) => b.newMaxKg - a.newMaxKg);
}

/** Vermeidet doppelte PR-Zeilen bei gleichem normalisierten Namen */
export function dedupePrsByExerciseName(prs: ExerciseWeightPR[]): ExerciseWeightPR[] {
  const seen = new Set<string>();
  const out: ExerciseWeightPR[] = [];
  for (const p of prs) {
    const k = normalizeExerciseName(p.exerciseName);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

export function computeWorkoutSessionSummary(
  workout: Workout,
  priorWorkouts: Workout[],
): WorkoutSessionSummary {
  const exercises = workout.exercises || [];
  const { volume, reps, sets, exerciseCount } = countStrengthTotals(exercises);

  let cardioMinutes = 0;
  let cardioDistanceKm = 0;
  let hasCardioWork = false;

  for (const ex of exercises) {
    const c = cardioSummaryFromExercise(ex);
    if (!c) continue;
    hasCardioWork = true;
    cardioMinutes += c.minutes;
    cardioDistanceKm += c.distanceKm;
  }

  const hasStrengthWork = exerciseCount > 0 || volume > 0;

  return {
    totalVolumeKg: Math.round(volume || strengthVolumeForWorkout(workout)),
    totalReps: reps,
    totalSets: sets,
    exerciseCount,
    muscleShares: computeMuscleVolumeSharesForWorkout(workout),
    weightPrs: dedupePrsByExerciseName(detectWeightPrs(workout, priorWorkouts)),
    hasStrengthWork,
    hasCardioWork,
    cardioMinutes: Math.round(cardioMinutes),
    cardioDistanceKm: Math.round(cardioDistanceKm * 10) / 10,
  };
}
