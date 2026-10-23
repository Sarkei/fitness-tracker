/**
 * Deutsche Anzeigenamen für Coach-Hauptübungen (ExerciseDB-Key bleibt für Video/Infos).
 */

import type { CoachWorkoutWeek } from './coachScheduleZod';
import { looksGermanExerciseName, translateExerciseNameToGerman } from './coachExerciseDisplay';
import { isExerciseDbCatalogKey } from './exerciseDb';
import {
  collectExerciseDbKeysFromCoachWeek,
  collectLocalizationRowsFromCoachWeek,
  hydrateCoachWorkoutWeekGermanNames,
  type ExerciseNameLocalizationStore,
} from './exerciseNameLocalizationDb';
import { getLibraryExercise } from './exerciseLibrary';
import { normalizeExerciseSearchText } from './exerciseResolve';
import type { UiLocale } from './i18n';
import { parseJsonLoose } from './parseCoachJson';
import { rememberCachedGermanExerciseName } from './exerciseNameLocalizationCache';

const germanNameByExerciseKey = new Map<string, string>();

type MainExerciseRow = { name?: string; exerciseKey?: string };

/** Nach ExerciseDB-Resolve: deutschen KI-Namen behalten, sonst Katalogname. */
export function pickCoachExerciseNameAfterResolve(storedName: string, catalogName: string): string {
  const stored = String(storedName || '').trim();
  const catalog = String(catalogName || '').trim();
  if (stored && looksGermanExerciseName(stored)) return stored;
  return catalog || stored;
}

function catalogEnglishName(exerciseKey: string): string | undefined {
  if (!isExerciseDbCatalogKey(exerciseKey)) return undefined;
  return getLibraryExercise(exerciseKey)?.name?.trim() || undefined;
}

function collectMainRows(week: CoachWorkoutWeek): MainExerciseRow[] {
  const rows: MainExerciseRow[] = [];
  for (const day of week.schedule || []) {
    if (day.isRest) continue;
    for (const ex of day.exercises || []) {
      if (ex && typeof ex === 'object') rows.push(ex as MainExerciseRow);
    }
  }
  return rows;
}

function rememberGermanName(exerciseKey: string, nameDe: string): void {
  if (!exerciseKey || !nameDe) return;
  germanNameByExerciseKey.set(exerciseKey, nameDe);
  rememberCachedGermanExerciseName(exerciseKey, nameDe);
}

function applyStaticOrCachedName(
  row: MainExerciseRow,
  english: string,
  exerciseKey: string,
  dbNames?: Map<string, string>,
): boolean {
  if (exerciseKey && dbNames?.has(exerciseKey)) {
    row.name = dbNames.get(exerciseKey);
    rememberGermanName(exerciseKey, row.name!);
    return true;
  }
  if (exerciseKey && germanNameByExerciseKey.has(exerciseKey)) {
    row.name = germanNameByExerciseKey.get(exerciseKey);
    return true;
  }
  const staticDe = translateExerciseNameToGerman(english);
  if (staticDe !== english && looksGermanExerciseName(staticDe)) {
    row.name = staticDe;
    if (exerciseKey) rememberGermanName(exerciseKey, staticDe);
    return true;
  }
  return false;
}

/** Wendet gespeicherte DB-Übersetzungen auf die Woche an (ohne KI). */
export async function applyDbGermanNamesToCoachWorkoutWeek(
  week: CoachWorkoutWeek,
  store: ExerciseNameLocalizationStore,
): Promise<CoachWorkoutWeek> {
  const keys = collectExerciseDbKeysFromCoachWeek(week);
  if (!keys.length) return week;
  const dbNames = await store.getGermanNamesByKeys(keys);
  for (const [key, de] of dbNames) rememberGermanName(key, de);
  const { week: hydrated, changed } = hydrateCoachWorkoutWeekGermanNames(week, dbNames);
  if (changed) appendLocalizationConstraint(hydrated);
  return hydrated;
}

async function persistWeekLocalizationsToStore(
  week: CoachWorkoutWeek,
  store: ExerciseNameLocalizationStore | undefined,
  source: 'static' | 'ai',
): Promise<void> {
  if (!store) return;
  const rows = collectLocalizationRowsFromCoachWeek(week, catalogEnglishName, source).filter(r =>
    looksGermanExerciseName(r.nameDe),
  );
  if (rows.length) await store.upsertMany(rows);
}

/**
 * Setzt für locale=de deutsche `name`-Felder; `exerciseKey` bleibt für ExerciseDB.
 */
export async function applyGermanNamesToCoachWorkoutWeek(
  week: CoachWorkoutWeek,
  locale: UiLocale,
  callAi?: (prompt: string) => Promise<string>,
  store?: ExerciseNameLocalizationStore,
): Promise<CoachWorkoutWeek> {
  if (locale !== 'de') return week;

  let working = week;
  if (store) {
    working = await applyDbGermanNamesToCoachWorkoutWeek(week, store);
  }

  const dbNames = store
    ? await store.getGermanNamesByKeys(collectExerciseDbKeysFromCoachWeek(working))
    : new Map<string, string>();

  const rows = collectMainRows(working);
  if (!rows.length) return working;

  type Pending = { id: string; english: string; rows: MainExerciseRow[] };
  const pendingById = new Map<string, Pending>();
  let changedCount = 0;

  for (const row of rows) {
    const key = typeof row.exerciseKey === 'string' ? row.exerciseKey.trim() : '';
    const stored = String(row.name || '').trim();
    const english = (key ? catalogEnglishName(key) : undefined) || stored;
    if (!english) continue;

    if (stored && looksGermanExerciseName(stored)) {
      if (key && looksGermanExerciseName(stored)) rememberGermanName(key, stored);
      continue;
    }

    if (applyStaticOrCachedName(row, english, key, dbNames)) {
      changedCount += 1;
      continue;
    }

    const id = key || `n:${normalizeExerciseSearchText(english)}`;
    if (!pendingById.has(id)) pendingById.set(id, { id, english, rows: [] });
    pendingById.get(id)!.rows.push(row);
  }

  const needsAi = [...pendingById.values()];
  if (!needsAi.length) {
    if (changedCount > 0) appendLocalizationConstraint(working);
    await persistWeekLocalizationsToStore(working, store, 'static');
    return working;
  }

  const applyFallback = (p: Pending) => {
    const de = translateExerciseNameToGerman(p.english);
    const final = de !== p.english ? de : p.english;
    for (const r of p.rows) r.name = final;
    if (p.id.startsWith('edb_')) rememberGermanName(p.id, final);
    if (final !== p.english) changedCount += 1;
  };

  if (!callAi) {
    for (const p of needsAi) applyFallback(p);
    if (changedCount > 0) appendLocalizationConstraint(working);
    await persistWeekLocalizationsToStore(working, store, 'static');
    return working;
  }

  const CHUNK = 20;
  for (let i = 0; i < needsAi.length; i += CHUNK) {
    const chunk = needsAi.slice(i, i + CHUNK);
    const list = chunk.map(p => ({ id: p.id, nameEn: p.english }));
    const prompt = `Du bist Fitness-Coach und übersetzt Übungsnamen ins Deutsche.
Gib für jede Übung einen kurzen, gut verständlichen deutschen Gym-Namen (natürliches Deutsch, keine wörtliche 1:1-Übersetzung langer Englischstitel).
Regeln:
- Maximal 6 Wörter, keine Klammern, kein Englisch
- Title Case (z. B. "Schrägbankdrücken", "Rotierende Liegestütze im Knienstand")
- Nur JSON ausgeben, kein Markdown

Eingabe:
${JSON.stringify(list)}

Antwortformat:
{"items":[{"id":"<id>","nameDe":"..."}]}`;

    try {
      const raw = await callAi(prompt);
      const parsed = parseJsonLoose(raw) as { items?: Array<{ id?: string; nameDe?: string }> };
      const items = Array.isArray(parsed?.items) ? parsed.items : [];
      const byId = new Map<string, string>();
      for (const it of items) {
        const id = String(it?.id || '').trim();
        const nameDe = String(it?.nameDe || '').trim();
        if (id && nameDe && looksGermanExerciseName(nameDe)) byId.set(id, nameDe);
      }
      for (const p of chunk) {
        const de = byId.get(p.id);
        if (de) {
          for (const r of p.rows) r.name = de;
          if (p.id.startsWith('edb_')) rememberGermanName(p.id, de);
          changedCount += 1;
        } else {
          applyFallback(p);
        }
      }
    } catch {
      for (const p of chunk) applyFallback(p);
    }
  }

  if (changedCount > 0) appendLocalizationConstraint(working);
  await persistWeekLocalizationsToStore(working, store, 'ai');
  return working;
}

function appendLocalizationConstraint(week: CoachWorkoutWeek): void {
  week.applied_constraints = [
    ...(Array.isArray(week.applied_constraints) ? week.applied_constraints : []),
    'localized:exercise_names_de',
  ].slice(0, 8);
}
