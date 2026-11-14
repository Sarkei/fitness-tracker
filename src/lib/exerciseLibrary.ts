/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getCachedCatalogExercise } from './exerciseCatalogCache';
import { isExerciseDbCatalogKey } from './exerciseDb';

/** Übungstypen + Filter-UI; Katalog nur ExerciseDB (RapidAPI). */
export type LibraryExerciseCategory = 'strength' | 'cardio';

/** Primäre Muskelgruppe / Filter-ID (Übungen können mehrere `tags` haben). */
export type LibraryMuscleFilterId =
  | 'all'
  | 'beine'
  | 'brust'
  | 'rücken'
  | 'schulter'
  | 'arme'
  | 'core'
  | 'ganzkörper'
  | 'cardio_art';

export interface LibraryExercise {
  key: string;
  name: string;
  category: LibraryExerciseCategory;
  tags?: string[];
  exerciseId?: string;
  source?: 'local' | 'exercisedb';
  gifUrl?: string;
  imageUrl?: string;
  videoUrl?: string;
  bodyPart?: string;
  targetMuscle?: string;
  equipment?: string;
  secondaryMuscles?: string[];
  instructions?: string[];
  overview?: string;
  exerciseTips?: string[];
  variations?: string[];
  difficulty?: string;
}

export const LIBRARY_MUSCLE_FILTERS: { id: LibraryMuscleFilterId; label: string }[] = [
  { id: 'all', label: 'Alle' },
  { id: 'beine', label: 'Beine' },
  { id: 'brust', label: 'Brust' },
  { id: 'rücken', label: 'Rücken' },
  { id: 'schulter', label: 'Schulter' },
  { id: 'arme', label: 'Arme' },
  { id: 'core', label: 'Core' },
  { id: 'ganzkörper', label: 'Ganzkörper' },
  { id: 'cardio_art', label: 'Cardio' },
];

export const LIBRARY_MUSCLE_FILTER_ROW_IDS: LibraryMuscleFilterId[][] = [
  ['all', 'beine', 'brust', 'rücken', 'schulter', 'arme'],
  ['core', 'ganzkörper', 'cardio_art'],
];

/** Deaktiviert — keine eingebettete Übungsliste mehr. */
export const EXERCISE_LIBRARY: LibraryExercise[] = [];

export function getLibraryExercise(key: string): LibraryExercise | undefined {
  return getCachedCatalogExercise(key);
}

/** Kein lokaler Namensindex — Coach/Client nutzen ExerciseDB-Suche. */
export function findLibraryExerciseByName(_name: string): LibraryExercise | undefined {
  return undefined;
}

export function filterLibrary(
  _q: string,
  _cat: 'all' | LibraryExerciseCategory,
  _muscle: LibraryMuscleFilterId = 'all',
): LibraryExercise[] {
  return [];
}
