/**
 * Client-seitiger Cache für ExerciseDB-Treffer (nach Suche / Detail).
 */

import type { LibraryExercise } from './exerciseLibrary';

const cache = new Map<string, LibraryExercise>();

export function cacheCatalogExercise(ex: LibraryExercise): void {
  if (ex?.key) cache.set(ex.key, ex);
}

export function getCachedCatalogExercise(key: string): LibraryExercise | undefined {
  return cache.get(key);
}

export function clearExerciseCatalogCache(): void {
  cache.clear();
}
