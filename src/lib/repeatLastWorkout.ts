/**
 * Letztes abgeschlossenes Training als Vorlage für eine neue Session.
 */

import type { Exercise, SetDetail, Workout } from '@/src/types';
import { prepareExercisesForSession } from '@/src/lib/sessionExercisePrep';

function workoutSortTime(w: Workout): number {
  const completed = w.completedAt ? new Date(w.completedAt).getTime() : 0;
  if (completed > 0) return completed;
  return new Date(w.date).getTime();
}

/** Neuestes Workout mit mindestens einer Übung (nach Datum/Abgeschlossen). */
export function getLastCompletedWorkout(workouts: Workout[]): Workout | null {
  const candidates = workouts.filter(w => (w.exercises?.length ?? 0) > 0);
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => workoutSortTime(b) - workoutSortTime(a))[0] ?? null;
}

function cloneExerciseForRepeat(ex: Exercise): Exercise {
  const setsRaw = ex.sets;
  let sets: Exercise['sets'] = ex.sets;
  if (Array.isArray(setsRaw) && setsRaw.length > 0 && typeof setsRaw[0] === 'object' && setsRaw[0] != null && 'reps' in setsRaw[0]) {
    sets = (setsRaw as SetDetail[]).map(s => ({
      ...s,
      completed: false,
    }));
  }
  const { id: _id, routeData: _route, ...rest } = ex;
  return { ...rest, sets };
}

/** Session-Payload für `WorkoutSessionPlayer` (ohne IDs/Completion der alten Session). */
export function buildRepeatSessionFromWorkout(
  last: Workout,
  userId: string,
  nameSuffix?: string,
): Partial<Workout> {
  const cloned = (last.exercises || []).map(cloneExerciseForRepeat);
  const exercises = prepareExercisesForSession(cloned);
  const baseName = last.name?.trim() || 'Workout';
  const name = nameSuffix ? `${baseName} · ${nameSuffix}` : baseName;

  return {
    name,
    type: last.type || 'Strength',
    date: new Date().toISOString(),
    exercises,
    userId,
    isPlanned: false,
  };
}
