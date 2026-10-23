/**
 * Persistente deutsche Übungsnamen (ExerciseDB-Key → name_de).
 * Server: PostgreSQL. Client: In-Memory-Cache via API.
 */

import type { CoachWorkoutWeek } from './coachScheduleZod';
import { isExerciseDbCatalogKey } from './exerciseDb';

export type ExerciseNameLocalizationSource = 'static' | 'ai' | 'manual';

export type ExerciseNameLocalizationRow = {
  exerciseKey: string;
  nameEn: string;
  nameDe: string;
  source: ExerciseNameLocalizationSource;
};

/** Abstraktion für Server (Pool) und Tests. */
export interface ExerciseNameLocalizationStore {
  getGermanNamesByKeys(keys: string[]): Promise<Map<string, string>>;
  upsertMany(rows: ExerciseNameLocalizationRow[]): Promise<void>;
}

type PgQueryable = {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
};

export function createPgExerciseNameLocalizationStore(pool: PgQueryable): ExerciseNameLocalizationStore {
  return {
    async getGermanNamesByKeys(keys: string[]): Promise<Map<string, string>> {
      const uniq = [...new Set(keys.map(k => k.trim()).filter(k => k && isExerciseDbCatalogKey(k)))];
      if (!uniq.length) return new Map();
      const r = await pool.query(
        `SELECT exercise_key, name_de FROM exercise_name_localizations WHERE exercise_key = ANY($1::text[])`,
        [uniq],
      );
      const out = new Map<string, string>();
      for (const row of r.rows) {
        const key = String(row.exercise_key || '').trim();
        const de = String(row.name_de || '').trim();
        if (key && de) out.set(key, de);
      }
      return out;
    },

    async upsertMany(rows: ExerciseNameLocalizationRow[]): Promise<void> {
      const valid = rows.filter(
        r =>
          r.exerciseKey &&
          isExerciseDbCatalogKey(r.exerciseKey) &&
          r.nameDe.trim() &&
          r.nameEn.trim(),
      );
      if (!valid.length) return;
      for (const row of valid) {
        await pool.query(
          `INSERT INTO exercise_name_localizations (exercise_key, name_en, name_de, source, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (exercise_key) DO UPDATE SET
             name_en = EXCLUDED.name_en,
             name_de = EXCLUDED.name_de,
             source = EXCLUDED.source,
             updated_at = NOW()
           WHERE exercise_name_localizations.name_de IS DISTINCT FROM EXCLUDED.name_de
              OR exercise_name_localizations.name_en IS DISTINCT FROM EXCLUDED.name_en`,
          [row.exerciseKey, row.nameEn.trim(), row.nameDe.trim(), row.source],
        );
      }
    },
  };
}

export function collectExerciseDbKeysFromCoachWeek(week: CoachWorkoutWeek): string[] {
  const keys = new Set<string>();
  for (const day of week.schedule || []) {
    if (day.isRest) continue;
    for (const ex of day.exercises || []) {
      if (!ex || typeof ex !== 'object') continue;
      const key = typeof (ex as { exerciseKey?: string }).exerciseKey === 'string'
        ? (ex as { exerciseKey: string }).exerciseKey.trim()
        : '';
      if (key && isExerciseDbCatalogKey(key)) keys.add(key);
    }
  }
  return [...keys];
}

export function hydrateCoachWorkoutWeekGermanNames(
  week: CoachWorkoutWeek,
  dbNames: Map<string, string>,
): { week: CoachWorkoutWeek; changed: boolean } {
  if (!dbNames.size) return { week, changed: false };
  let changed = false;
  for (const day of week.schedule || []) {
    if (day.isRest || !Array.isArray(day.exercises)) continue;
    for (const ex of day.exercises) {
      if (!ex || typeof ex !== 'object') continue;
      const row = ex as { exerciseKey?: string; name?: string };
      const key = typeof row.exerciseKey === 'string' ? row.exerciseKey.trim() : '';
      if (!key) continue;
      const de = dbNames.get(key);
      if (!de || row.name === de) continue;
      row.name = de;
      changed = true;
    }
  }
  return { week, changed };
}

export function collectLocalizationRowsFromCoachWeek(
  week: CoachWorkoutWeek,
  catalogEnglish: (exerciseKey: string) => string | undefined,
  source: ExerciseNameLocalizationSource = 'ai',
): ExerciseNameLocalizationRow[] {
  const rows: ExerciseNameLocalizationRow[] = [];
  const seen = new Set<string>();
  for (const day of week.schedule || []) {
    if (day.isRest) continue;
    for (const ex of day.exercises || []) {
      if (!ex || typeof ex !== 'object') continue;
      const row = ex as { exerciseKey?: string; name?: string };
      const key = typeof row.exerciseKey === 'string' ? row.exerciseKey.trim() : '';
      const nameDe = String(row.name || '').trim();
      if (!key || !isExerciseDbCatalogKey(key) || !nameDe || seen.has(key)) continue;
      const nameEn = catalogEnglish(key) || nameDe;
      seen.add(key);
      rows.push({ exerciseKey: key, nameEn, nameDe, source });
    }
  }
  return rows;
}
