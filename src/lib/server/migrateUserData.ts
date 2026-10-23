/**
 * Server: Migration bestehender Nutzerdaten auf ExerciseDB + Open Food Facts.
 * Zielversion: DATA_MIGRATION_VERSION in ../dataMigration.ts (bei Schema-Änderungen erhöhen).
 */

import type { Pool } from "pg";
import { DATA_MIGRATION_VERSION } from "../dataMigration";
import { isExerciseDbCatalogKey, isExerciseDbConfigured } from "../exerciseDb";
import { getExerciseDbEnvDiagnostics } from "./exerciseDbEnv";
import { searchExerciseDbByName } from "../exerciseDbFetch";
import { searchOpenFoodFactsProducts } from "../openFoodFactsFetch";
import { matchFoodExactFromPool, mergeCatalogFoodPool } from "../mealAiShared";
import type { Food } from "../foodDatabase";

export function parseProfileExtras(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw || "{}") as unknown;
      return typeof p === "object" && p !== null && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

export function userNeedsDataMigration(
  extras: Record<string, unknown>,
  targetVersion: number = DATA_MIGRATION_VERSION,
): boolean {
  if (extras.migrationRequired === true || extras.migrationV2Required === true) return true;
  const v = extras.dataMigrationVersion;
  return v == null || Number(v) < targetVersion;
}

async function resolveExerciseKey(name: string, existingKey?: string): Promise<string | undefined> {
  const key = String(existingKey || "").trim();
  if (key && isExerciseDbCatalogKey(key)) return key;
  const n = String(name || "").trim();
  if (!n && key) return key;
  if (isExerciseDbConfigured() && n) {
    try {
      const hits = await searchExerciseDbByName(n, 8);
      const exact = hits.find((h) => h.name.toLowerCase() === n.toLowerCase());
      if (exact) return exact.key;
      if (hits[0]) return hits[0].key;
    } catch {
      /* skip */
    }
  }
  return existingKey || undefined;
}

async function migrateExerciseArray(exercises: unknown): Promise<unknown> {
  if (!Array.isArray(exercises)) return exercises;
  const out = [];
  for (const row of exercises) {
    if (!row || typeof row !== "object") {
      out.push(row);
      continue;
    }
    const ex = row as Record<string, unknown>;
    const name = String(ex.name || "");
    const key = await resolveExerciseKey(name, typeof ex.exerciseKey === "string" ? ex.exerciseKey : undefined);
    out.push(key ? { ...ex, exerciseKey: key, name: name || ex.name } : ex);
  }
  return out;
}

async function migrateCoachSchedule(schedule: unknown): Promise<unknown> {
  if (!schedule || typeof schedule !== "object") return schedule;
  const s = schedule as Record<string, unknown>;
  const days = s.schedule ?? s.days;
  if (!Array.isArray(days)) return schedule;
  const newDays = [];
  for (const day of days) {
    if (!day || typeof day !== "object") {
      newDays.push(day);
      continue;
    }
    const d = day as Record<string, unknown>;
    if (Array.isArray(d.exercises)) {
      newDays.push({ ...d, exercises: await migrateExerciseArray(d.exercises) });
    } else {
      newDays.push(d);
    }
  }
  return { ...s, schedule: newDays };
}

async function migrateWeekPlan(weekPlan: unknown): Promise<unknown> {
  if (!Array.isArray(weekPlan)) return weekPlan;
  const out = [];
  for (const day of weekPlan) {
    if (!day || typeof day !== "object") {
      out.push(day);
      continue;
    }
    const d = day as Record<string, unknown>;
    out.push({
      ...d,
      exercises: await migrateExerciseArray(d.exercises),
    });
  }
  return out;
}

async function migrateProfileExtras(
  extras: Record<string, unknown>,
  foodPool: Food[],
): Promise<Record<string, unknown>> {
  const out = { ...extras };

  if (out.workoutPlan && typeof out.workoutPlan === "object") {
    const wp = out.workoutPlan as Record<string, unknown>;
    if (Array.isArray(wp.schedule)) {
      const schedule = [];
      for (const day of wp.schedule) {
        if (!day || typeof day !== "object") {
          schedule.push(day);
          continue;
        }
        const d = day as Record<string, unknown>;
        schedule.push({
          ...d,
          exercises: await migrateExerciseArray(d.exercises),
        });
      }
      out.workoutPlan = { ...wp, schedule };
    }
  }

  if (Array.isArray(out.freeWorkoutSchedule)) {
    const days = [];
    for (const day of out.freeWorkoutSchedule) {
      if (!day || typeof day !== "object") {
        days.push(day);
        continue;
      }
      const d = day as Record<string, unknown>;
      days.push({
        ...d,
        exercises: await migrateExerciseArray(d.exercises),
      });
    }
    out.freeWorkoutSchedule = days;
  }

  if (out.workoutSessionDraft && typeof out.workoutSessionDraft === "object") {
    const draft = out.workoutSessionDraft as Record<string, unknown>;
    if (Array.isArray(draft.exercises)) {
      out.workoutSessionDraft = {
        ...draft,
        exercises: await migrateExerciseArray(draft.exercises),
      };
    }
  }

  return out;
}

async function resolveFoodIdForIngredient(
  ing: Record<string, unknown>,
  pool: Food[],
): Promise<Record<string, unknown>> {
  const name = String(ing.name || "").trim();
  if (!name) return ing;
  const id = ing.id != null ? String(ing.id) : "";
  if (id && !id.startsWith("est_")) {
    const hit = pool.find((f) => f.id === id);
    if (hit && matchFoodExactFromPool(name, [hit])) return ing;
  }
  const exact = matchFoodExactFromPool(name, pool);
  if (exact) {
    return { ...ing, id: exact.id, name: exact.name, nutrientSource: "database" };
  }
  try {
    const off = await searchOpenFoodFactsProducts(name, 8);
    const merged = mergeCatalogFoodPool(off);
    const hit2 = matchFoodExactFromPool(name, merged) ?? merged[0];
    if (hit2) return { ...ing, id: hit2.id, name: hit2.name, nutrientSource: "database" };
  } catch {
    /* skip */
  }
  return ing;
}

async function migrateIngredients(ingredients: unknown, foodPool: Food[]): Promise<unknown> {
  if (!Array.isArray(ingredients)) return ingredients;
  const out = [];
  for (const row of ingredients) {
    if (!row || typeof row !== "object") {
      out.push(row);
      continue;
    }
    out.push(await resolveFoodIdForIngredient(row as Record<string, unknown>, foodPool));
  }
  return out;
}

export type MigrationResult = {
  ok: boolean;
  exercisesUpdated: number;
  nutritionUpdated: number;
  coachWeeksUpdated: number;
  errors: string[];
};

export async function runUserDataMigration(pool: Pool, userId: number): Promise<MigrationResult> {
  const errors: string[] = [];
  let exercisesUpdated = 0;
  let nutritionUpdated = 0;
  let coachWeeksUpdated = 0;

  const globalFoods: Food[] = [];

  try {
    const templates = await pool.query(
      `SELECT id, exercises, week_plan FROM workout_templates WHERE user_id=$1`,
      [userId],
    );
    for (const row of templates.rows) {
      const ex = await migrateExerciseArray(row.exercises);
      const wp = row.week_plan ? await migrateWeekPlan(row.week_plan) : row.week_plan;
      await pool.query(`UPDATE workout_templates SET exercises=$2::jsonb, week_plan=$3::jsonb WHERE id=$1`, [
        row.id,
        JSON.stringify(ex),
        wp ? JSON.stringify(wp) : null,
      ]);
      exercisesUpdated += 1;
    }
  } catch (e) {
    errors.push(`templates: ${e}`);
  }

  try {
    const workouts = await pool.query(`SELECT id, exercises FROM workouts WHERE user_id=$1`, [userId]);
    for (const row of workouts.rows) {
      const ex = await migrateExerciseArray(row.exercises);
      await pool.query(`UPDATE workouts SET exercises=$2::jsonb WHERE id=$1`, [row.id, JSON.stringify(ex)]);
      exercisesUpdated += 1;
    }
  } catch (e) {
    errors.push(`workouts: ${e}`);
  }

  try {
    const plans = await pool.query(`SELECT id FROM coach_plans WHERE user_id=$1`, [userId]);
    for (const p of plans.rows) {
      const weeks = await pool.query(
        `SELECT id, schedule FROM coach_weekly_schedules WHERE plan_id=$1`,
        [p.id],
      );
      for (const w of weeks.rows) {
        const sched = await migrateCoachSchedule(w.schedule);
        await pool.query(`UPDATE coach_weekly_schedules SET schedule=$2::jsonb WHERE id=$1`, [
          w.id,
          JSON.stringify(sched),
        ]);
        coachWeeksUpdated += 1;
      }
    }
  } catch (e) {
    errors.push(`coach: ${e}`);
  }

  try {
    const meals = await pool.query(`SELECT id, ingredients FROM meal_templates WHERE user_id=$1`, [userId]);
    for (const row of meals.rows) {
      const ing = await migrateIngredients(row.ingredients, globalFoods);
      await pool.query(`UPDATE meal_templates SET ingredients=$2::jsonb WHERE id=$1`, [
        row.id,
        JSON.stringify(ing),
      ]);
      nutritionUpdated += 1;
    }
  } catch (e) {
    errors.push(`meal_templates: ${e}`);
  }

  try {
    const logs = await pool.query(`SELECT id, ingredients FROM nutrition WHERE user_id=$1`, [userId]);
    for (const row of logs.rows) {
      const ing = await migrateIngredients(row.ingredients, globalFoods);
      await pool.query(`UPDATE nutrition SET ingredients=$2::jsonb WHERE id=$1`, [row.id, JSON.stringify(ing)]);
      nutritionUpdated += 1;
    }
  } catch (e) {
    errors.push(`nutrition: ${e}`);
  }

  try {
    const ucf = await pool.query(
      `SELECT id, composite_ingredients FROM user_custom_foods WHERE user_id=$1 AND composite_ingredients IS NOT NULL`,
      [userId],
    );
    for (const row of ucf.rows) {
      const ing = await migrateIngredients(row.composite_ingredients, globalFoods);
      await pool.query(`UPDATE user_custom_foods SET composite_ingredients=$2::jsonb WHERE id=$1`, [
        row.id,
        JSON.stringify(ing),
      ]);
      nutritionUpdated += 1;
    }
  } catch (e) {
    errors.push(`user_custom_foods: ${e}`);
  }

  const cur = await pool.query(`SELECT profile_extras FROM users WHERE id=$1`, [userId]);
  const prev = parseProfileExtras(cur.rows[0]?.profile_extras);
  const migratedExtras = await migrateProfileExtras(prev, globalFoods);
  await pool.query(`UPDATE users SET profile_extras=$2::jsonb, updated_at=NOW() WHERE id=$1`, [
    userId,
    JSON.stringify({
      ...migratedExtras,
      dataMigrationVersion: DATA_MIGRATION_VERSION,
      migrationRequired: false,
    }),
  ]);

  return {
    ok: errors.length === 0,
    exercisesUpdated,
    nutritionUpdated,
    coachWeeksUpdated,
    errors,
  };
}

export type MigrationStatus = {
  targetVersion: number;
  pendingUsers: number;
  upToDateUsers: number;
  totalActiveUsers: number;
  exerciseDbConfigured: boolean;
  exerciseDbSource: string | null;
  exerciseDbHost: string;
  exerciseDbEnvHints: string[];
  envFilePath: string;
  envFileProblem?: string | null;
  envReloadApplied?: number;
};

export async function getDataMigrationStatus(pool: Pool): Promise<MigrationStatus> {
  const r = await pool.query(`SELECT id, profile_extras FROM users WHERE is_active=true`);
  let pending = 0;
  let upToDate = 0;
  for (const row of r.rows) {
    const prev = parseProfileExtras(row.profile_extras);
    if (userNeedsDataMigration(prev)) pending += 1;
    else upToDate += 1;
  }
  const edb = getExerciseDbEnvDiagnostics();
  return {
    targetVersion: DATA_MIGRATION_VERSION,
    pendingUsers: pending,
    upToDateUsers: upToDate,
    totalActiveUsers: r.rows.length,
    exerciseDbConfigured: edb.configured,
    exerciseDbSource: edb.source,
    exerciseDbHost: edb.host,
    exerciseDbEnvHints: edb.envFileHints,
    envFilePath: edb.envFilePath,
    envFileProblem: edb.envFileProblem,
    envReloadApplied: edb.envReloadApplied,
  };
}

export type BatchMigrationResult = {
  ok: boolean;
  targetVersion: number;
  usersMigrated: number;
  usersSkipped: number;
  usersFailed: number;
  exercisesUpdated: number;
  nutritionUpdated: number;
  coachWeeksUpdated: number;
  errors: string[];
};

export type BatchMigrationProgressEvent = {
  userId: number;
  status: "started" | "skipped" | "success" | "failed";
  message: string;
};

/** Migriert alle Nutzer, die noch nicht auf targetVersion sind (optional: force = alle erneut). */
export async function runBatchDataMigrationForAllUsers(
  pool: Pool,
  opts?: { force?: boolean; onProgress?: (event: BatchMigrationProgressEvent) => void },
): Promise<BatchMigrationResult> {
  const r = await pool.query(`SELECT id, profile_extras FROM users WHERE is_active=true ORDER BY id`);
  let usersMigrated = 0;
  let usersSkipped = 0;
  let usersFailed = 0;
  let exercisesUpdated = 0;
  let nutritionUpdated = 0;
  let coachWeeksUpdated = 0;
  const errors: string[] = [];

  for (const row of r.rows) {
    const prev = parseProfileExtras(row.profile_extras);
    if (!opts?.force && !userNeedsDataMigration(prev)) {
      usersSkipped += 1;
      opts?.onProgress?.({
        userId: row.id,
        status: "skipped",
        message: "Bereits auf aktueller Version",
      });
      continue;
    }
    try {
      opts?.onProgress?.({
        userId: row.id,
        status: "started",
        message: "Migration gestartet",
      });
      const result = await runUserDataMigration(pool, row.id);
      usersMigrated += 1;
      exercisesUpdated += result.exercisesUpdated;
      nutritionUpdated += result.nutritionUpdated;
      coachWeeksUpdated += result.coachWeeksUpdated;
      if (!result.ok) {
        usersFailed += 1;
        opts?.onProgress?.({
          userId: row.id,
          status: "failed",
          message: result.errors[0] ?? "Migration mit Fehlern abgeschlossen",
        });
        for (const e of result.errors) errors.push(`User #${row.id}: ${e}`);
      } else {
        opts?.onProgress?.({
          userId: row.id,
          status: "success",
          message: "Migration erfolgreich",
        });
      }
    } catch (e) {
      usersFailed += 1;
      errors.push(`User #${row.id}: ${e}`);
      opts?.onProgress?.({
        userId: row.id,
        status: "failed",
        message: String(e),
      });
    }
  }

  return {
    ok: usersFailed === 0,
    targetVersion: DATA_MIGRATION_VERSION,
    usersMigrated,
    usersSkipped,
    usersFailed,
    exercisesUpdated,
    nutritionUpdated,
    coachWeeksUpdated,
    errors: errors.slice(0, 50),
  };
}

/** Markiert Nutzer für Client-Migration beim nächsten Login (Fallback). */
export async function flagAllUsersForMigration(pool: Pool): Promise<number> {
  const r = await pool.query(`SELECT id, profile_extras FROM users WHERE is_active=true`);
  let n = 0;
  const authInvalidBefore = Math.floor(Date.now() / 1000);
  for (const row of r.rows) {
    const prev = parseProfileExtras(row.profile_extras);
    if (!userNeedsDataMigration(prev)) continue;
    await pool.query(`UPDATE users SET profile_extras=$2::jsonb WHERE id=$1`, [
      row.id,
      JSON.stringify({
        ...prev,
        migrationRequired: true,
        authInvalidBefore,
      }),
    ]);
    n += 1;
  }
  return n;
}
