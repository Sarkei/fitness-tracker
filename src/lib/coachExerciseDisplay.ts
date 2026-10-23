/**
 * Anzeigenamen für Coach-Übungen (UI-Sprache vs. ExerciseDB-Katalog).
 */

import { isExerciseDbCatalogKey } from './exerciseDb';
import { getCachedGermanExerciseName } from './exerciseNameLocalizationCache';
import { DE_EXERCISE_ALIASES, normalizeExerciseSearchText } from './exerciseResolve';
import { getLibraryExercise } from './exerciseLibrary';
import type { UiLocale } from './i18n';

function germanLabelFromAliasKey(key: string): string {
  return key
    .split(' ')
    .map(w => (w ? w.charAt(0).toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

const EN_NORM_TO_DE = (() => {
  const m = new Map<string, string>();
  for (const [deKey, enVal] of Object.entries(DE_EXERCISE_ALIASES)) {
    m.set(normalizeExerciseSearchText(enVal), germanLabelFromAliasKey(deKey));
  }
  const extra: Record<string, string> = {
    'chin up': 'Klimmzug',
    'chin ups': 'Klimmzüge',
    'chin-ups': 'Klimmzüge',
    'pull-ups': 'Klimmzüge',
    'pull up': 'Klimmzug',
    'pull ups': 'Klimmzüge',
    'push up': 'Liegestütz',
    'push ups': 'Liegestütze',
    'diamond press': 'Diamant-Liegestütz',
    'hammer press': 'Hammerdrücken',
    'incline press': 'Schrägbankdrücken',
    'bench press': 'Bankdrücken',
    'barbell squat': 'Kniebeuge',
    'front squat': 'Frontkniebeuge',
    'romanian deadlift': 'Rumänisches Kreuzheben',
    'barbell deadlift': 'Kreuzheben',
    'lat pulldown': 'Latzug',
    'leg press': 'Beinpresse',
    'leg curl': 'Beinbeuger',
    'leg extension': 'Beinstrecker',
    'calf raise': 'Wadenheben',
    'lateral raise': 'Seitheben',
    'shoulder press': 'Schulterdrücken',
    'triceps pushdown': 'Trizepsdrücken',
    'triceps dip': 'Trizeps-Dips',
    'bicep curl': 'Bizepscurl',
    'biceps curl': 'Bizepscurl',
    'dumbbell curl': 'Kurzhantelcurl',
    'barbell row': 'Langhantelrudern',
    'dumbbell row': 'Kurzhantelrudern',
    'jump squat': 'Sprungkniebeuge',
    'suspended row': 'Klimmzug am Ring',
    'inverted pullover': 'Invertierter Pullover',
    'self assisted inverted pullover': 'Unterstützter invertierter Pullover',
    'dumbbell incline one arm hammer press': 'Schrägbank Einarm-Hammerdrücken',
  };
  for (const [en, de] of Object.entries(extra)) {
    m.set(normalizeExerciseSearchText(en), de);
  }
  return m;
})();

export function translateExerciseNameToGerman(englishName: string): string {
  const n = normalizeExerciseSearchText(englishName);
  if (!n) return englishName;
  const exact = EN_NORM_TO_DE.get(n);
  if (exact) return exact;

  let best: { de: string; len: number } | null = null;
  for (const [en, de] of EN_NORM_TO_DE) {
    if (en.length < 4) continue;
    if (n.includes(en) || en.includes(n)) {
      if (!best || en.length > best.len) best = { de, len: en.length };
    }
  }
  if (best) return best.de;

  return englishName;
}

export function looksGermanExerciseName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    /[äöüß]/i.test(name) ||
    /\b(klimmzug|liegestütz|kniebeuge|bankdrücken|aufwärmen|mobilisation|schulter|seitheben|beinpresse|latzug|trizeps|bizeps|rudern|kreuzheben)\b/i.test(
      n,
    )
  );
}

function looksGermanName(name: string): boolean {
  return looksGermanExerciseName(name);
}

/** Anzeigename für Coach-Übung (Liste, Detail, Session). */
export function displayCoachExerciseName(
  ex: { name?: string; exerciseKey?: string },
  locale: UiLocale,
): string {
  const stored = String(ex.name || '').trim();
  const key = typeof ex.exerciseKey === 'string' ? ex.exerciseKey.trim() : '';
  const lib = key && isExerciseDbCatalogKey(key) ? getLibraryExercise(key) : undefined;
  const catalogEn = lib?.name?.trim();

  if (locale !== 'de') return stored || catalogEn || 'Exercise';

  if (key) {
    const cached = getCachedGermanExerciseName(key);
    if (cached) return cached;
  }

  if (stored && looksGermanName(stored)) return stored;

  const base = stored || catalogEn || '';
  if (!base) return 'Übung';
  const de = translateExerciseNameToGerman(base);
  return de !== base ? de : stored || base;
}
