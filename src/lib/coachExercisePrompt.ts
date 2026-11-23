import { isExerciseDbConfigured } from './exerciseDb';
import { formatExerciseDbCatalogForCoach } from './exerciseDbFetch';
import { katalogFuerPrompt } from './exerciseCatalogLocal';

const NO_EXERCISEDB_HINT =
  'ExerciseDB ist nicht konfiguriert (EXERCISEDB_RAPIDAPI_KEY). Kein lokaler Übungskatalog mehr — bitte API-Key setzen.';

/**
 * Übungskatalog für den Coach.
 *
 * Mit ExerciseDB-Key kommt der große Bestand; ohne Key greift der lokale Katalog
 * (317 Übungen mit Videos, Schritten und Formhinweisen). So entstehen auch ohne
 * RapidAPI-Abo brauchbare Einheiten mit echten Übungsnamen.
 */
export async function formatExerciseDbForCoachPromptAsync(): Promise<string> {
  if (isExerciseDbConfigured()) {
    try {
      const remote = await formatExerciseDbCatalogForCoach(12);
      if (remote.trim()) {
        return `${remote}\n\nFormat: edb_<id> | name | muscle tags (target/body/equip). Use exerciseKey on every strength exercise. Balance push/pull/legs/core weekly.`;
      }
    } catch (e) {
      console.error('ExerciseDB coach catalog:', e);
    }
  }
  return formatEigenerKatalogForCoachPrompt();
}

/** Lokaler Katalog als Prompt-Block — immer verfügbar, ohne Netz. */
export function formatEigenerKatalogForCoachPrompt(): string {
  const katalog = katalogFuerPrompt(5);
  if (!katalog.trim()) return NO_EXERCISEDB_HINT;
  return [
    'ÜBUNGSKATALOG (verbindlich — nutze genau diese Namen):',
    katalog,
    '',
    'Regeln: nur Übungen aus dieser Liste verwenden. Jede Einheit braucht 4–7 Hauptübungen mit Sätzen, Wiederholungen und Pause.',
  ].join('\n');
}

/** @deprecated Sync-Fallback entfernt — nutze formatExerciseDbForCoachPromptAsync. */
export function formatExerciseDbForCoachPrompt(): string {
  return NO_EXERCISEDB_HINT;
}
