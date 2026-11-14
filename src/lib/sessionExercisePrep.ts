/**
 * Normalisiert Coach-/Plan-Rohdaten für den Session-Player (IDs + flache Reihenfolge).
 */

import type { Exercise } from '@/src/types';
import { coachExerciseToExercise } from '@/src/lib/coachTemplateMappers';
import { flattenExercisesForSession } from '@/src/lib/workoutTemplateStructure';

function randomExerciseId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `ex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function hasSetDetailRows(ex: Exercise): boolean {
  const setsArr = ex.sets;
  return Array.isArray(setsArr) && setsArr.length > 0 && typeof setsArr[0] === 'object' && setsArr[0] != null && 'reps' in setsArr[0];
}

/** Coach-JSON oder Template-Zeile → Exercise mit stabiler `id`. */
export function normalizeExerciseForSession(ex: Exercise | Record<string, unknown>): Exercise {
  const row = ex as Exercise;
  if (row.id) return row;
  if (row.exerciseKey || row.structureParentId || hasSetDetailRows(row)) {
    return { ...row, id: randomExerciseId() };
  }
  return coachExerciseToExercise(ex as Record<string, unknown>);
}

export function prepareExercisesForSession(list: Exercise[] | undefined | null): Exercise[] {
  const raw = Array.isArray(list) ? list : [];
  const normalized = raw.map(e => normalizeExerciseForSession(e as Exercise));
  return flattenExercisesForSession(normalized);
}
