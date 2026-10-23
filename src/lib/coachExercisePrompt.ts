import { isExerciseDbConfigured } from './exerciseDb';
import { formatExerciseDbCatalogForCoach } from './exerciseDbFetch';

const NO_EXERCISEDB_HINT =
  'ExerciseDB ist nicht konfiguriert (EXERCISEDB_RAPIDAPI_KEY). Kein lokaler Übungskatalog mehr — bitte API-Key setzen.';

/** ExerciseDB-Katalog für Coach (RapidAPI). */
export async function formatExerciseDbForCoachPromptAsync(): Promise<string> {
  if (!isExerciseDbConfigured()) {
    return NO_EXERCISEDB_HINT;
  }
  try {
    const remote = await formatExerciseDbCatalogForCoach(12);
    if (remote.trim()) {
      return `${remote}\n\nFormat: edb_<id> | name | muscle tags (target/body/equip). Use exerciseKey on every strength exercise. Balance push/pull/legs/core weekly.`;
    }
  } catch (e) {
    console.error('ExerciseDB coach catalog:', e);
  }
  return `${NO_EXERCISEDB_HINT}\n(ExerciseDB-Katalogabruf lieferte keine Treffer.)`;
}

/** @deprecated Sync-Fallback entfernt — nutze formatExerciseDbForCoachPromptAsync. */
export function formatExerciseDbForCoachPrompt(): string {
  return NO_EXERCISEDB_HINT;
}
