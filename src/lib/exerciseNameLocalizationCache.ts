/**
 * Client-seitiger Cache für deutsche ExerciseDB-Anzeigenamen (von /api/exercise-name-localizations).
 */

const germanByExerciseKey = new Map<string, string>();

export function setExerciseGermanNameCache(entries: Record<string, string> | Map<string, string>): void {
  germanByExerciseKey.clear();
  if (entries instanceof Map) {
    for (const [k, v] of entries) {
      const key = k.trim();
      const de = String(v || '').trim();
      if (key && de) germanByExerciseKey.set(key, de);
    }
    return;
  }
  for (const [k, v] of Object.entries(entries)) {
    const key = k.trim();
    const de = String(v || '').trim();
    if (key && de) germanByExerciseKey.set(key, de);
  }
}

export function mergeExerciseGermanNameCache(entries: Record<string, string>): void {
  for (const [k, v] of Object.entries(entries)) {
    const key = k.trim();
    const de = String(v || '').trim();
    if (key && de) germanByExerciseKey.set(key, de);
  }
}

export function getCachedGermanExerciseName(exerciseKey: string): string | undefined {
  const key = exerciseKey.trim();
  if (!key) return undefined;
  return germanByExerciseKey.get(key);
}

export function rememberCachedGermanExerciseName(exerciseKey: string, nameDe: string): void {
  const key = exerciseKey.trim();
  const de = nameDe.trim();
  if (key && de) germanByExerciseKey.set(key, de);
}

export function getExerciseGermanNameCacheSnapshot(): Record<string, string> {
  return Object.fromEntries(germanByExerciseKey);
}
