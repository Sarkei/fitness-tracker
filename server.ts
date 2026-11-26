import "./envBootstrap.ts";
import { readFileSync } from "node:fs";
import express, { Request, Response, NextFunction } from "express";
import {
  resolveAiCapabilities,
  completeCoachJson,
  completeMealAnalysis,
  completeWorkoutTemplateJson,
  setActiveProviderOverride,
  getActiveProviderOverride,
  syncActiveProviderFromEnv,
  testMistralApiKey,
  testGeminiApiKey,
  testDeepSeekApiKey,
  testOllamaConnection,
  pullOllamaModel,
  getOllamaBaseUrl,
  getLocalLlmModel,
  coachAreaForPlanType,
  completeCoachChat,
} from "./aiProviders";
import { reloadEnvFromFile, upsertEnvVar } from "./src/lib/envFileManager";
import {
  buildCoachChatSystemPrompt,
  parseCoachChatReply,
  applyCoachChatActions,
  sinnvollerPlanName,
} from "./src/lib/coachChat";
import {
  buildIntervalsContext,
  fetchAthlete,
  neuerStand,
  normalisiereIntervall,
  syncFaellig,
  syncIntervals,
  SYNC_INTERVAL_OPTIONS,
  type IntervalsSettings,
} from "./src/lib/intervals";
import { anmelden, bestaetigeMfa, entschluesseln, verschluesseln, tagVoll, historieVoll, koerperWerte, aktivitaeten as garminAktivitaetenLogin, schreibeGewicht, schreibeWasser, tokensGueltig, garminZeitreiheLogin, type LoginTag } from "./src/lib/garminLogin";
import { syncGarmin, syncGarminHeute, garminToken, syncGarminAktivitaeten, ladeEinheitZeitreihen, felderStand, type GarminCache, type GarminAktivitaet } from "./src/lib/garmin";
import {
  deleteEvent as intervalsDeleteEvent,
  syncWorkout as intervalsSyncWorkout,
  type SyncCall,
} from "./src/lib/intervalsWorkoutSync";
import {
  AI_MODEL_AREAS,
  AI_MODEL_AREA_LABELS,
  AI_MODEL_RECOMMENDATIONS,
  getAllAiModels,
  getModelSelectOptions,
  type AiModelArea,
  type AiProviderName,
} from "./src/lib/aiModelConfig";
import { addDaysYmd, calendarWeekMonday, coachWeekInclusiveEnd, parseLocalYmd, toLocalYmd } from "./src/lib/coachWeekWindow";
import { finalizeCoachWorkoutWeek } from "./src/lib/coachSchedulePostprocess";
import type { CoachWorkoutWeek } from "./src/lib/coachScheduleZod";
import {
  applyDbGermanNamesToCoachWorkoutWeek,
  applyGermanNamesToCoachWorkoutWeek,
  pickCoachExerciseNameAfterResolve,
} from "./src/lib/coachExerciseLocalization";
import { looksGermanExerciseName } from "./src/lib/coachExerciseDisplay";
import { createPgExerciseNameLocalizationStore } from "./src/lib/exerciseNameLocalizationDb";
import { workoutConstraintsFromOnboarding } from "./src/lib/coachConstraints";
import {
  resolveTrainingSlotPlanFromOnboarding,
  formatExtendedSlotPlanForPrompt,
} from "./src/lib/coachCustomWeekPlan";
import { formatSessionVolumeForPrompt, parseCoachSessionVolume } from "./src/lib/coachSessionVolume";
import {
  assessRecoverableSessionDraft,
  buildWorkoutFromRecoverableDraft,
} from "./src/lib/sessionDraftRecovery";
import { formatBenchmarksForCoachPrompt } from "./src/lib/coachBenchmarkProfile";
import { formatCoachEquipmentForPrompt } from "./src/lib/coachEquipment";

function parseCoachOnboarding(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown;
      return typeof p === "object" && p !== null && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return {};
}

function joinCoachList(value: unknown, fallback = "none"): string {
  if (Array.isArray(value)) {
    const s = value.map((x) => String(x)).filter(Boolean).join(", ");
    return s || fallback;
  }
  return fallback;
}
import { formatExerciseDbForCoachPrompt, formatExerciseDbForCoachPromptAsync } from "./src/lib/coachExercisePrompt";
import { isExerciseDbConfigured, isExerciseDbCatalogKey, testExerciseDbApiKey } from "./src/lib/exerciseDb";
import { getExerciseDbEnvDiagnostics } from "./src/lib/server/exerciseDbEnv";
import {
  fetchExerciseDbById,
  fetchExerciseDbFilterLists,
  findSimilarExercises,
  fetchExerciseDbByBodyPart,
  searchExerciseDbByName,
  searchExerciseDbCatalog,
} from "./src/lib/exerciseDbFetch";
import { buildUserContextForCoach } from "./src/lib/buildUserContextForCoach";
import {
  DEFAULT_COACH_PLAN_STATE,
  loadCoachPlanState,
  saveCoachPlanState,
} from "./src/lib/coach/coachPlanState";
import { buildAdaptationBlockFromReport } from "./src/lib/coach/coachPromptBlocks";
import { generateCoachWeeklyReport } from "./src/lib/coach/coachWeeklyReportService";
import { buildUserWeekFacts } from "./src/lib/weeklyReport/buildUserWeekFacts";
import { generateUserWeeklyReport } from "./src/lib/weeklyReport/generateUserWeeklyReport";
import {
  canGenerateLastWeekReport,
  getCompletedWeekRangeAtOffset,
  getLastCompletedWeekRange,
} from "./src/lib/weeklyReport/weekWindow";
import { userWeeklyReportSchema } from "./src/lib/weeklyReport/userWeeklyReportSchema";
import { loadWeekFactsSnapshot } from "./src/lib/coach/coachWeekFactsService";
import { buildCoachDashboardSummary } from "./src/lib/coach/coachDashboardSummary";
import { queryCoachOpsMetrics } from "./src/lib/coach/coachOpsMetrics";
import {
  generateCoachWorkoutWeekWithPipeline,
  generateCoachNutritionWeekWithPipeline,
  CoachGenerationError,
  formatCoachGenerationErrorMessage,
} from "./src/lib/coachGeneratePipeline";
import { weeklyReportSchema } from "./src/lib/coachScheduleZod";
import { workoutTemplateAiSchema } from "./src/lib/coach/workoutTemplateZod";
import { parseJsonLoose } from "./src/lib/parseCoachJson";
import { logCoachAiRun, logMealAiRun } from "./src/lib/aiRunLogger";
import { mealRecipeAiSchema } from "./src/lib/mealRecipeZod";
import {
  formatMealScheduleForCoachPrompt,
  resolveNutritionMealSchedule,
} from "./src/lib/coachNutritionSchedule";
import { computeMealTemplateNutritionForRecipe } from "./src/lib/mealTemplateComputedNutrition";
import {
  ensureNutritionSchema,
  registerNutritionRoutes,
  resolveBarcodeForApi,
} from "./src/lib/nutrition/nutritionRoutes";
import { getNutritionV3StatsSnapshot } from "./src/lib/nutrition/pipeline/pipelineMetrics";
import {
  getNutritionV3DbStats,
  listNutritionV3Incidents,
} from "./src/lib/nutrition/pipeline/nutritionMetricsStore";
import { createHash, randomBytes } from "crypto";
import { sendPasswordResetEmail } from "./src/lib/server/sendPasswordResetEmail.ts";
import {
  buildSuggestCustomFoodDraftPrompt,
  buildDailyNutritionReviewPrompt,
  buildMealRecipeDraftPrompt,
  buildMealRecipeRefinePrompt,
} from "./src/lib/aiPrompts/buildMealPrompts";
import {
  buildCoachWorkoutWeekPrompt,
  buildCoachNutritionWeekPrompt,
  buildCoachWeeklyReportPrompt,
  buildWorkoutTemplateGeneratePrompt,
} from "./src/lib/aiPrompts/buildWorkoutPrompts";
import { parseCustomFoodDraftFromAi } from "./src/lib/mealAiShared";
import type { Food } from "./src/lib/foodDatabase";
import { tierFoodsFromOffPool } from "./src/lib/catalogSearch";
import {
  fetchOpenFoodFactsByBarcode,
  fetchOffCatalogFoods,
  isOffSearchUnavailable,
  searchOpenFoodFactsProducts,
} from "./src/lib/openFoodFactsFetch";
import {
  getAppCustomFoodById,
  insertAppCustomFoodFromDraft,
  searchAppCustomFoods,
} from "./src/lib/server/appCustomFoods";
import type { CustomFoodDraft } from "./src/types";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { Ingredient, ProposedDbFood } from "./src/types";
import { buildDisplayName, resolveUserNameFields, splitNameParts, validateNameParts } from "./src/lib/userName";
import {
  runUserDataMigration,
  flagAllUsersForMigration,
  getDataMigrationStatus,
  runBatchDataMigrationForAllUsers,
} from "./src/lib/server/migrateUserData";
import type { BatchMigrationResult } from "./src/lib/server/migrateUserData";
import { pushoverRouter } from "./src/lib/server/pushover-route.ts";
import { pushRouter, sendePushAnNutzer, sendeEreignis } from "./server/push-route";
import { benachrichtige, benachrichtigungsRouter } from "./server/benachrichtigungen";
const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Database ────────────────────────────────────────────────────────────────

const pool = new Pool({
  host: process.env.POSTGRES_HOST || "localhost",
  port: parseInt(process.env.POSTGRES_PORT || "5432"),
  database: process.env.POSTGRES_DB || "fitness_tracker",
  user: process.env.POSTGRES_USER || "vrtx",
  password: process.env.POSTGRES_PASSWORD || "vrtx_secret",
});

const exerciseNameLocalizationStore = createPgExerciseNameLocalizationStore(pool);

async function initDb(): Promise<void> {
  // Base table – minimal columns guaranteed to exist from day one
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id             SERIAL PRIMARY KEY,
      name           VARCHAR(100) NOT NULL DEFAULT '',
      email          VARCHAR(200) UNIQUE NOT NULL,
      password_hash  VARCHAR(256),
      is_active      BOOLEAN NOT NULL DEFAULT TRUE,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Idempotent migrations – safe to run every startup
  const migrations = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name   VARCHAR(100)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url      TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS bio            TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded      BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS membership     VARCHAR(20) NOT NULL DEFAULT 'pro'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(10) NOT NULL DEFAULT 'dark'`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS goals          JSONB NOT NULL DEFAULT '{"type":"maintain","dailySteps":10000,"dailyCalories":2500}'::jsonb`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS measurements   JSONB`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS workout_plan   JSONB`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS coach_preferences JSONB`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS weight_history JSONB NOT NULL DEFAULT '[]'::jsonb`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS coaching_active BOOLEAN NOT NULL DEFAULT FALSE`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_extras JSONB NOT NULL DEFAULT '{}'::jsonb`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)`,
    `ALTER TABLE workouts ADD COLUMN IF NOT EXISTS intervals_event_id TEXT`,
    `ALTER TABLE workouts ADD COLUMN IF NOT EXISTS intervals_hash TEXT`,
    `ALTER TABLE workouts ADD COLUMN IF NOT EXISTS intervals_synced_at TIMESTAMPTZ`,
    /*
     * Zusatzfelder aus dem Garmin-Login: Schlafphasen, Schlaf-Stress,
     * naechtlicher SpO2/Atmung, Training Readiness und Trainingsstatus.
     * Die Personal API liefert diese Werte nicht.
     */
    `ALTER TABLE garmin_days ADD COLUMN IF NOT EXISTS deep_secs INTEGER`,
    `ALTER TABLE garmin_days ADD COLUMN IF NOT EXISTS light_secs INTEGER`,
    `ALTER TABLE garmin_days ADD COLUMN IF NOT EXISTS rem_secs INTEGER`,
    `ALTER TABLE garmin_days ADD COLUMN IF NOT EXISTS awake_secs INTEGER`,
    `ALTER TABLE garmin_days ADD COLUMN IF NOT EXISTS sleep_stress INTEGER`,
    `ALTER TABLE garmin_days ADD COLUMN IF NOT EXISTS sleep_hr INTEGER`,
    `ALTER TABLE garmin_days ADD COLUMN IF NOT EXISTS spo2_night REAL`,
    `ALTER TABLE garmin_days ADD COLUMN IF NOT EXISTS respiration_night REAL`,
    `ALTER TABLE garmin_days ADD COLUMN IF NOT EXISTS readiness INTEGER`,
    `ALTER TABLE garmin_days ADD COLUMN IF NOT EXISTS readiness_level TEXT`,
    /*
     * Bis wann Garmin für den Tag Daten hat.
     *
     * `updated_at` ist der Abrufzeitpunkt — der ist immer frisch und sagt
     * nichts darüber, wie alt die Daten sind. `daten_bis` kommt von Garmin
     * selbst (`wellnessEndTimeLocal`) und endet beim letzten Sync der Uhr.
     */
    `ALTER TABLE garmin_days ADD COLUMN IF NOT EXISTS daten_bis TEXT`,
    /*
     * Zeitreihen je Einheit (Puls, Pace, Höhe, Kadenz).
     *
     * Tims Vorgabe: Alles, was die App zeigt, soll aus der Datenbank kommen —
     * damit keine Seite auf Garmin warten muss. Die Detailseite einer Einheit
     * brauchte diese Werte bisher live; hier liegen sie jetzt einmal abgelegt
     * und werden beim Abgleich mitgeschrieben.
     */
    `CREATE TABLE IF NOT EXISTS garmin_activity_timeseries (
       user_id     INTEGER NOT NULL,
       activity_id BIGINT  NOT NULL,
       punkte      JSONB   NOT NULL,
       erstellt_am TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       PRIMARY KEY (user_id, activity_id)
     )`,
    `ALTER TABLE garmin_days ADD COLUMN IF NOT EXISTS training_status TEXT`,
    /* Merker fuer Rueckschreibvorgaenge — verhindert Endlosschleifen. */
    `CREATE TABLE IF NOT EXISTS garmin_schreibstand (
       user_id INTEGER NOT NULL,
       art TEXT NOT NULL,
       schluessel TEXT NOT NULL,
       wert TEXT NOT NULL,
       geschrieben_am TIMESTAMPTZ NOT NULL DEFAULT NOW(),
       PRIMARY KEY (user_id, art, schluessel)
     )`,
  ];
  for (const sql of migrations) {
    await pool.query(sql);
  }

  const legacyNames = await pool.query(
    `SELECT id, name, display_name, first_name, last_name FROM users
     WHERE (first_name IS NULL OR TRIM(first_name) = '')
       AND (last_name IS NULL OR TRIM(last_name) = '')
       AND (COALESCE(NULLIF(TRIM(display_name), ''), NULLIF(TRIM(name), '')) IS NOT NULL)`,
  );
  for (const row of legacyNames.rows) {
    const legacy = String(row.display_name || row.name || "").trim();
    if (!legacy) continue;
    const { firstName, lastName } = splitNameParts(legacy);
    await pool.query(
      `UPDATE users SET first_name = $2, last_name = $3, updated_at = NOW() WHERE id = $1`,
      [row.id, firstName, lastName],
    );
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workouts (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name           VARCHAR(200) NOT NULL,
      type           VARCHAR(50),
      subtype        VARCHAR(50),
      duration       INTEGER NOT NULL DEFAULT 0,
      calories_burned INTEGER NOT NULL DEFAULT 0,
      date           DATE NOT NULL DEFAULT CURRENT_DATE,
      exercises      JSONB NOT NULL DEFAULT '[]'::jsonb,
      notes          TEXT,
      shared         BOOLEAN NOT NULL DEFAULT FALSE,
      session_rpe    SMALLINT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE workouts ADD COLUMN IF NOT EXISTS session_rpe SMALLINT`);
  await pool.query(`ALTER TABLE workouts ADD COLUMN IF NOT EXISTS coach_session_meta JSONB`);
  await pool.query(`ALTER TABLE workouts ADD COLUMN IF NOT EXISTS coach_session_feedback VARCHAR(12)`);
  await pool.query(`ALTER TABLE workouts ADD COLUMN IF NOT EXISTS cardio_session_feedback JSONB`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workout_templates (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name           VARCHAR(200) NOT NULL,
      type           VARCHAR(50),
      template_mode  VARCHAR(20) NOT NULL DEFAULT 'workout',
      exercises      JSONB NOT NULL DEFAULT '[]'::jsonb,
      week_plan      JSONB,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE workout_templates ADD COLUMN IF NOT EXISTS template_mode VARCHAR(20) NOT NULL DEFAULT 'workout'`);
  await pool.query(`ALTER TABLE workout_templates ADD COLUMN IF NOT EXISTS week_plan JSONB`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS nutrition (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      meal       VARCHAR(200) NOT NULL,
      category   VARCHAR(30),
      calories   NUMERIC NOT NULL DEFAULT 0,
      protein    NUMERIC NOT NULL DEFAULT 0,
      carbs      NUMERIC NOT NULL DEFAULT 0,
      fat        NUMERIC NOT NULL DEFAULT 0,
      date       DATE NOT NULL DEFAULT CURRENT_DATE,
      ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE nutrition ADD COLUMN IF NOT EXISTS quantity NUMERIC`);
  await pool.query(`ALTER TABLE nutrition ADD COLUMN IF NOT EXISTS unit VARCHAR(20)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS meal_templates (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name          VARCHAR(200) NOT NULL,
      category      VARCHAR(30),
      ingredients   JSONB NOT NULL DEFAULT '[]'::jsonb,
      total_calories NUMERIC NOT NULL DEFAULT 0,
      total_protein  NUMERIC NOT NULL DEFAULT 0,
      total_carbs    NUMERIC NOT NULL DEFAULT 0,
      total_fat      NUMERIC NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE meal_templates ADD COLUMN IF NOT EXISTS yields_portions INTEGER NOT NULL DEFAULT 1`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_custom_foods (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(320) NOT NULL,
      category VARCHAR(40) NOT NULL DEFAULT 'readymeal',
      nutrients JSONB NOT NULL,
      servings JSONB NOT NULL DEFAULT '[{"name":"100g","grams":100}]'::jsonb,
      source VARCHAR(40) NOT NULL DEFAULT 'user_confirmed_ai',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_user_custom_foods_user ON user_custom_foods (user_id)`
  );
  await pool.query(`ALTER TABLE user_custom_foods ADD COLUMN IF NOT EXISTS composite_ingredients JSONB`);

  // App-weite Lebensmittel: user_id optional (NULL = für alle Nutzer sichtbar)
  await pool.query(`ALTER TABLE user_custom_foods DROP CONSTRAINT IF EXISTS user_custom_foods_user_id_fkey`);
  await pool.query(`ALTER TABLE user_custom_foods ALTER COLUMN user_id DROP NOT NULL`);
  await pool.query(`
    ALTER TABLE user_custom_foods
    ADD CONSTRAINT user_custom_foods_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  `);
  await pool.query(`UPDATE user_custom_foods SET user_id = NULL WHERE user_id IS NOT NULL`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_user_custom_foods_name_lower ON user_custom_foods (LOWER(name))`,
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS posts (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content    TEXT NOT NULL,
      image_url  TEXT,
      likes      INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
      type       VARCHAR(20) NOT NULL DEFAULT 'manual',
      workout_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS post_comments (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id    UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content    TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_follows (
      follower_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (follower_id, following_id),
      CHECK (follower_id <> following_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at    TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens (token_hash)`,
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_blocks (
      blocker_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      blocked_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (blocker_id, blocked_id),
      CHECK (blocker_id <> blocked_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS post_reports (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id     UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reason      TEXT NOT NULL DEFAULT '',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS direct_messages (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sender_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body          TEXT NOT NULL,
      read_at       TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_direct_messages_pair ON direct_messages (sender_id, recipient_id, created_at DESC)`
  );

  // ── Coach tables ──────────────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coach_plans (
      id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type           VARCHAR(20) NOT NULL,           -- 'workout' | 'nutrition'
      status         VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active'|'paused'|'cancelled'|'completed'
      discipline     VARCHAR(60),                    -- workout discipline
      plan_mode      VARCHAR(20) NOT NULL,           -- 'ongoing' | 'event'
      event_name     VARCHAR(200),
      event_date     DATE,
      event_distance VARCHAR(100),
      current_week   INTEGER NOT NULL DEFAULT 1,
      onboarding_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    `ALTER TABLE coach_plans ADD COLUMN IF NOT EXISTS generation_status VARCHAR(24) NOT NULL DEFAULT 'ready'`,
  );
  await pool.query(`ALTER TABLE coach_plans ADD COLUMN IF NOT EXISTS generation_error TEXT`);
  await pool.query(`ALTER TABLE coach_plans ADD COLUMN IF NOT EXISTS generation_phase VARCHAR(40)`);
  await pool.query(`ALTER TABLE coach_plans ADD COLUMN IF NOT EXISTS coach_plan_state JSONB`);
  // Anzeigename des Plans (statt roher UUID im Chat und in Listen)
  await pool.query(`ALTER TABLE coach_plans ADD COLUMN IF NOT EXISTS name TEXT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS coach_weekly_schedules (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_id      UUID NOT NULL REFERENCES coach_plans(id) ON DELETE CASCADE,
      week_number  INTEGER NOT NULL,
      start_date   DATE,
      schedule     JSONB NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (plan_id, week_number)
    )
  `);


  /*
   * Manuelle Trainingsplaene.
   *
   * Tims Vorgabe: Auch ohne Coach soll man einen Plan bauen koennen — Workouts
   * anlegen (Gym, Laufen, Rad, hybrid, Triathlon, EMOM, HIIT, Zirkel, frei) und
   * per Drag & Drop auf Wochentage legen, auch mehrfach.
   *
   * `workouts` haelt die Vorlagen (die Bausteine), `plan_slots` die Zuordnung
   * Vorlage -> Datum. So kann dasselbe Workout an mehreren Tagen haengen, und ein
   * Tag kann mehrere Workouts haben.
   */
  await pool.query(`
    CREATE TABLE IF NOT EXISTS trainings (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       INTEGER NOT NULL,
      name          TEXT NOT NULL,
      art           VARCHAR(24) NOT NULL DEFAULT 'gym',
      notiz         TEXT,
      /* Struktur: Uebungen mit Saetzen, Supersaetzen und Intervall-Vorgaben. */
      inhalt        JSONB NOT NULL DEFAULT '{}'::jsonb,
      dauer_min     INTEGER,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS trainings_plan (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id       INTEGER NOT NULL,
      trainings_id  UUID NOT NULL REFERENCES trainings(id) ON DELETE CASCADE,
      datum         DATE NOT NULL,
      reihenfolge   INTEGER NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      /* Dasselbe Workout nur einmal je Tag — mehrfach ueber mehrere Tage ist ok. */
      UNIQUE (user_id, trainings_id, datum)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS trainings_plan_user_datum_idx
      ON trainings_plan (user_id, datum)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS coach_weekly_reports (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      plan_id      UUID NOT NULL REFERENCES coach_plans(id) ON DELETE CASCADE,
      week_number  INTEGER NOT NULL,
      report       JSONB NOT NULL,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (plan_id, week_number)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_weekly_reports (
      id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      week_key     VARCHAR(16) NOT NULL,
      week_start   DATE NOT NULL,
      week_end     DATE NOT NULL,
      report       JSONB NOT NULL,
      facts        JSONB,
      source       VARCHAR(16) NOT NULL DEFAULT 'ai',
      generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, week_key)
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_user_weekly_reports_user ON user_weekly_reports (user_id, generated_at DESC)`,
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS exercise_name_localizations (
      exercise_key VARCHAR(128) PRIMARY KEY,
      name_en      TEXT NOT NULL,
      name_de      TEXT NOT NULL,
      source       VARCHAR(16) NOT NULL DEFAULT 'ai',
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS coach_chat_messages (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(16) NOT NULL,
      content TEXT NOT NULL,
      actions JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS coach_chat_messages_user_idx
      ON coach_chat_messages (user_id, created_at DESC)
  `);
  // Eigene Zeitplaene des Coaches ("nach jedem Training eine Analyse").
  await pool.query(`
    CREATE TABLE IF NOT EXISTS coach_schedules (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      trigger VARCHAR(20) NOT NULL,           -- nach_training | taeglich | waechentlich | monatlich
      weekday SMALLINT,                        -- 1-7 (Mo-So), nur waechentlich
      day_of_month SMALLINT,                   -- 1-28, nur monatlich
      time_of_day VARCHAR(5),                  -- HH:MM, nur bei Zeit-Ausloesern
      title VARCHAR(120) NOT NULL,
      task TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      last_run_at TIMESTAMPTZ,
      last_seen_activity TEXT,                 -- bei nach_training: zuletzt gesehene Aktivitaet
      last_result TEXT,
      run_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS coach_schedules_user_idx
      ON coach_schedules (user_id, active)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS coach_ai_runs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_id UUID REFERENCES coach_plans(id) ON DELETE SET NULL,
      week_number INTEGER,
      endpoint VARCHAR(160) NOT NULL,
      prompt_version VARCHAR(64) NOT NULL,
      model_id VARCHAR(120) NOT NULL,
      input_hash VARCHAR(64) NOT NULL,
      raw_response TEXT,
      zod_ok BOOLEAN NOT NULL DEFAULT FALSE,
      constraints_ok BOOLEAN NOT NULL DEFAULT FALSE,
      retries INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      final_schedule_hash VARCHAR(64),
      refinement_round INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_coach_ai_runs_user ON coach_ai_runs (user_id, created_at DESC)`);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_coach_ai_runs_endpoint_time ON coach_ai_runs (endpoint, created_at DESC)`,
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS meal_ai_runs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint VARCHAR(160) NOT NULL,
      prompt_version VARCHAR(64) NOT NULL,
      model_id VARCHAR(120) NOT NULL,
      input_hash VARCHAR(64) NOT NULL,
      raw_response TEXT,
      zod_ok BOOLEAN NOT NULL DEFAULT FALSE,
      retries INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      refinement_round INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_meal_ai_runs_user ON meal_ai_runs (user_id, created_at DESC)`);

  await pool.query(`ALTER TABLE meal_templates ADD COLUMN IF NOT EXISTS prep_steps JSONB NOT NULL DEFAULT '[]'::jsonb`);
  await pool.query(`ALTER TABLE meal_templates ADD COLUMN IF NOT EXISTS llm_estimate_nutrients JSONB`);
  await pool.query(
    `ALTER TABLE meal_templates ADD COLUMN IF NOT EXISTS nutrients_computed_coverage NUMERIC NOT NULL DEFAULT 0`,
  );
  await pool.query(`ALTER TABLE meal_templates ADD COLUMN IF NOT EXISTS source VARCHAR(40) NOT NULL DEFAULT 'manual'`);

  await ensureNutritionSchema(pool);

  console.log("✅ Database schema ready");
}

/** OFF (`off_*`) oder App-DB (`ucf_*`). */
async function resolveCatalogFoodById(id: string | undefined | null): Promise<Food | null> {
  const raw = id?.trim() ?? "";
  if (raw.startsWith("off_")) {
    const code = raw.slice(4).replace(/\D/g, "");
    if (!code) return null;
    try {
      return await fetchOpenFoodFactsByBarcode(code);
    } catch {
      return null;
    }
  }
  if (raw.startsWith("ucf_")) {
    try {
      return await getAppCustomFoodById(pool, raw);
    } catch {
      return null;
    }
  }
  if (raw.startsWith("generic_")) {
    const { getGenericBaselineById } = await import("./src/lib/nutrition/catalog/genericBaselineResolver");
    return getGenericBaselineById(raw);
  }
  return null;
}

async function buildOffFoodResolverForIngredients(
  ingredients: Array<{ foodId?: string }>,
): Promise<(foodId: string) => Food | null> {
  const cache = new Map<string, Food>();
  for (const ing of ingredients) {
    const id = ing.foodId?.trim();
    if (!id || cache.has(id)) continue;
    if (!id.startsWith("off_") && !id.startsWith("ucf_")) continue;
    const hit = await resolveCatalogFoodById(id);
    if (hit) cache.set(id, hit);
  }
  return (foodId: string) => cache.get(foodId) ?? null;
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function navigationFocusFrom(raw: unknown): "workout" | "nutrition" | "hybrid" {
  if (raw === "workout" || raw === "nutrition" || raw === "hybrid") return raw;
  return "hybrid";
}

function mapUser(row: any) {
  const pe =
    typeof row.profile_extras === "string"
      ? JSON.parse(row.profile_extras || "{}")
      : row.profile_extras || {};
  const pref = row.theme_preference === "light" || row.theme_preference === "dark" ? row.theme_preference : "dark";
  const names = resolveUserNameFields(row);
  return {
    uid: row.id.toString(),
    firstName: names.firstName,
    lastName: names.lastName,
    displayName: names.displayName,
    email: row.email,
    photoURL: row.photo_url || "",
    bio: row.bio || "",
    onboarded: row.onboarded ?? false,
    accountCreatedAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    themePreference: pref,
    goals: row.goals || { type: "maintain", dailySteps: 10000, dailyCalories: 2500 },
    measurements: row.measurements || null,
    workoutPlan: row.workout_plan || null,
    coachPreferences: row.coach_preferences || null,
    weightHistory: row.weight_history || [],
    coachingActive: row.coaching_active || false,
    freeWorkoutSchedule: pe.freeWorkoutSchedule ?? undefined,
    manualPlanWeekOverrides:
      pe.manualPlanWeekOverrides && typeof pe.manualPlanWeekOverrides === "object"
        ? pe.manualPlanWeekOverrides
        : undefined,
    dailyWaterLog: pe.dailyWaterLog ?? undefined,
    dailyActivityLog: pe.dailyActivityLog ?? undefined,
    checkIns: pe.checkIns ?? undefined,
    favoriteMealTemplateIds: pe.favoriteMealTemplateIds ?? undefined,
    bodyMeasurements: pe.bodyMeasurements ?? undefined,
    navigationFocus: navigationFocusFrom(pe.navigationFocus),
    uiLocale: pe.uiLocale === "de" || pe.uiLocale === "en" ? pe.uiLocale : undefined,
    /** Opt-out über profile_extras — Standard: true (erweiterte Coach-Pipeline / Refine). */
    exerciseRestSeconds:
      pe.exerciseRestSeconds && typeof pe.exerciseRestSeconds === "object"
        ? pe.exerciseRestSeconds
        : undefined,
    dataMigrationVersion:
      typeof pe.dataMigrationVersion === "number" ? pe.dataMigrationVersion : undefined,
    migrationRequired: pe.migrationRequired === true || pe.migrationV2Required === true,
  };
}

async function getUserUiLocale(userId: number): Promise<"de" | "en"> {
  try {
    const r = await pool.query("SELECT profile_extras FROM users WHERE id=$1", [userId]);
    if (!r.rows.length) return "de";
    const raw = r.rows[0].profile_extras;
    const pe = typeof raw === "string" ? JSON.parse(raw || "{}") : raw || {};
    return pe.uiLocale === "en" ? "en" : "de";
  } catch {
    return "de";
  }
}

function coachOutputLanguageForLocale(locale: "de" | "en"): string {
  return locale === "de" ? "German" : "English";
}

function mapWorkout(row: any) {
  const metaRaw = row.coach_session_meta;
  const coachSessionMeta =
    metaRaw && typeof metaRaw === "object"
      ? metaRaw
      : typeof metaRaw === "string"
        ? (() => {
            try {
              return JSON.parse(metaRaw);
            } catch {
              return null;
            }
          })()
        : null;
  return {
    id: row.id,
    userId: row.user_id.toString(),
    name: row.name,
    type: row.type || "Other",
    subtype: row.subtype,
    duration: row.duration || 0,
    caloriesBurned: row.calories_burned || 0,
    date: row.date instanceof Date ? row.date.toISOString().split("T")[0] : String(row.date),
    exercises: row.exercises || [],
    notes: row.notes || "",
    shared: row.shared || false,
    sessionRpe:
      typeof row.session_rpe === "number" && Number.isFinite(row.session_rpe)
        ? row.session_rpe
        : undefined,
    coachSessionMeta: coachSessionMeta || undefined,
    feedback: row.coach_session_feedback || undefined,
    cardioSessionFeedback: parseJsonColumn(row.cardio_session_feedback) || undefined,
  };
}

function parseJsonColumn(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

function mapTemplate(row: any) {
  return {
    id: row.id,
    userId: row.user_id.toString(),
    name: row.name,
    type: row.type || "Strength",
    templateMode: row.template_mode || "workout",
    exercises: row.exercises || [],
    weekPlan: row.week_plan || null,
  };
}

function mapNutrition(row: any) {
  return {
    id: row.id,
    userId: row.user_id.toString(),
    meal: row.meal,
    category: row.category || "snack",
    calories: Number(row.calories),
    protein: Number(row.protein),
    carbs: Number(row.carbs),
    fat: Number(row.fat),
    date: row.date instanceof Date ? row.date.toISOString().split("T")[0] : String(row.date),
    ingredients: row.ingredients || [],
    quantity: row.quantity != null ? Number(row.quantity) : undefined,
    unit: row.unit || undefined,
    inputType: row.input_type || undefined,
    originalInput: row.original_input || undefined,
    mealCategory: row.meal_category || undefined,
    cuisine: row.cuisine || undefined,
    totalFiber: row.total_fiber != null ? Number(row.total_fiber) : undefined,
    aiModelUsed: row.ai_model_used || undefined,
    pipelineVersion: row.pipeline_version || undefined,
    userReviewed: row.user_reviewed === true,
  };
}

function mapMealTemplate(row: any) {
  return {
    id: row.id,
    userId: row.user_id.toString(),
    name: row.name,
    category: row.category || "snack",
    ingredients: row.ingredients || [],
    totalCalories: Number(row.total_calories),
    totalProtein: Number(row.total_protein),
    totalCarbs: Number(row.total_carbs),
    totalFat: Number(row.total_fat),
    yieldsPortions: Math.max(1, parseInt(String(row.yields_portions ?? 1), 10) || 1),
    prepSteps: row.prep_steps || [],
    llmEstimateNutrients: row.llm_estimate_nutrients ?? undefined,
    nutrientsComputedCoverage:
      row.nutrients_computed_coverage != null ? Number(row.nutrients_computed_coverage) : undefined,
    source: row.source || "manual",
  };
}

function mapPost(row: any) {
  return {
    id: row.id,
    userId: row.user_id.toString(),
    userName: row.user_name || "",
    userPhoto: row.user_photo || "",
    content: row.content,
    imageUrl: row.image_url,
    likes: (row.likes || []).map(String),
    type: row.type || "manual",
    workoutId: row.workout_id,
    createdAt: row.created_at,
  };
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET || "vrtx-dev-secret-change-me";
const ADMIN_USER = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASS = process.env.ADMIN_PASSWORD || "admin";

interface AuthRequest extends Request {
  userId?: number;
}

function maskSecret(secret?: string | null): string | null {
  const s = String(secret ?? "").trim();
  if (!s) return null;
  if (s.length <= 8) return `${s.slice(0, 2)}******`;
  return `${s.slice(0, 6)}${"*".repeat(Math.max(6, s.length - 10))}${s.slice(-4)}`;
}

function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  void (async () => {
    try {
      const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { userId: number; iat?: number };
      const row = await pool.query(`SELECT profile_extras, is_active FROM users WHERE id=$1`, [payload.userId]);
      if (!row.rows.length) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      if (row.rows[0].is_active !== true) {
        res.status(401).json({ error: "account-inactive", code: "REAUTH_REQUIRED" });
        return;
      }
      const extras =
        typeof row.rows[0].profile_extras === "string"
          ? JSON.parse(row.rows[0].profile_extras || "{}")
          : row.rows[0].profile_extras || {};
      const inv = Number(extras.authInvalidBefore);
      if (Number.isFinite(inv) && inv > 0 && typeof payload.iat === "number" && payload.iat < inv) {
        res.status(401).json({ error: "session-expired", code: "REAUTH_REQUIRED" });
        return;
      }
      req.userId = payload.userId;
      next();
    } catch {
      res.status(401).json({ error: "Invalid token" });
    }
  })();
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Basic ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [user, ...rest] = Buffer.from(auth.slice(6), "base64").toString().split(":");
  if (user === ADMIN_USER && rest.join(":") === ADMIN_PASS) { next(); return; }
  res.status(401).json({ error: "Invalid credentials" });
}

type AdminMigrationJobLog = {
  ts: string;
  userId: number;
  status: "started" | "skipped" | "success" | "failed";
  message: string;
};

type AdminMigrationJob = {
  jobId: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "completed" | "failed";
  totalUsers: number;
  processedUsers: number;
  logs: AdminMigrationJobLog[];
  result: BatchMigrationResult | null;
  force: boolean;
};

let adminMigrationJob: AdminMigrationJob | null = null;

function createAdminMigrationJob(force: boolean): AdminMigrationJob {
  return {
    jobId: `mig-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "running",
    totalUsers: 0,
    processedUsers: 0,
    logs: [],
    result: null,
    force,
  };
}

// ─── Server ───────────────────────────────────────────────────────────────────

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  /*
   * Pushover: Zugang hinterlegen, testen, trennen.
   * Die Werte bleiben serverseitig — GET liefert nur „verbunden".
   */
  app.use(
    "/api/integrations/pushover",
    requireAuth,
    pushoverRouter(pool as never, (req: Request) => (req as AuthRequest).userId ?? null, {
      titel: "Fitness-Tracker",
      text: "Wenn du das siehst, funktionieren deine Benachrichtigungen.",
    }),
  );

  /*
   * Web Push: Gerät anmelden, abmelden, testen.
   * Läuft parallel zu Pushover — beides kann gleichzeitig aktiv sein.
   */
  app.use(
    "/api/push",
    requireAuth,
    pushRouter(pool as never, (req: Request) => (req as AuthRequest).userId ?? null, "Fitness-Tracker"),
  );

  /* Kategorien, Ruhezeit und Verlauf — Einstellungen → Benachrichtigungen. */
  app.use(
    "/api/benachrichtigungen",
    requireAuth,
    benachrichtigungsRouter(pool as never, (req: Request) => (req as AuthRequest).userId ?? null),
  );

  // ── Health ────────────────────────────────────────────────────────────────
  app.get("/api/health", async (_req, res) => {
    try {
      const coachWindowHours = Math.max(
        1,
        Math.min(168, parseInt(process.env.COACH_OPS_WINDOW_HOURS || "24", 10) || 24),
      );
      const coach = await queryCoachOpsMetrics(pool, coachWindowHours);
      const ai = resolveAiCapabilities();
      const nutritionV3 = getNutritionV3StatsSnapshot();
      const nutritionAlerts: string[] = [];
      if ((nutritionV3.successRate ?? 100) < 95) nutritionAlerts.push("nutrition-v3-success-rate-below-95");
      if ((nutritionV3.avgDurationMs ?? 0) > 3000) nutritionAlerts.push("nutrition-v3-latency-above-3000ms");
      if ((nutritionV3.fallbackRate ?? 0) > 35) nutritionAlerts.push("nutrition-v3-fallback-rate-above-35");
      let nutritionPersisted: Awaited<ReturnType<typeof getNutritionV3DbStats>> | null = null;
      let openIncidents: Awaited<ReturnType<typeof listNutritionV3Incidents>> = [];
      try {
        nutritionPersisted = await getNutritionV3DbStats(pool, 24);
        if ((nutritionPersisted.successRate ?? 100) < 95) {
          nutritionAlerts.push("nutrition-v3-db-success-rate-below-95");
        }
        if ((nutritionPersisted.avgDurationMs ?? 0) > 3000) {
          nutritionAlerts.push("nutrition-v3-db-latency-above-3000ms");
        }
        if ((nutritionPersisted.fallbackRate ?? 0) > 35) {
          nutritionAlerts.push("nutrition-v3-db-fallback-rate-above-35");
        }
        openIncidents = await listNutritionV3Incidents(pool, { status: "open", limit: 10 });
        if (openIncidents.length > 0) {
          nutritionAlerts.push(`nutrition-v3-open-incidents-${openIncidents.length}`);
        }
      } catch {
        /* persisted metrics optional */
      }
      const nutritionDegraded = nutritionAlerts.length > 0;
      const overallDegraded = coach.status === "critical" || nutritionDegraded;
      res.json({
        status: overallDegraded ? "degraded" : "ok",
        coach,
        nutritionV3: {
          ...nutritionV3,
          persisted: nutritionPersisted,
          openIncidents,
          alerts: nutritionAlerts,
          status: nutritionDegraded ? "degraded" : "ok",
        },
        ai: {
          enabled: ai.enabled,
          provider: ai.provider,
        },
      });
    } catch (err: unknown) {
      console.error("health error:", err);
      res.status(503).json({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get("/api/admin/coach-ops", requireAdmin, async (req, res) => {
    try {
      const hours = Math.max(
        1,
        Math.min(168, parseInt(String(req.query.hours ?? process.env.COACH_OPS_WINDOW_HOURS ?? "24"), 10) || 24),
      );
      const metrics = await queryCoachOpsMetrics(pool, hours);
      res.json(metrics);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get("/api/ai/status", (_req, res) => {
    const caps = resolveAiCapabilities();
    res.json({
      enabled: caps.enabled,
      provider: caps.provider,
      ollamaConfigured: caps.ollamaConfigured,
      deepseekConfigured: caps.deepseekConfigured,
      mistralConfigured: caps.mistralConfigured,
      geminiConfigured: caps.geminiConfigured,
      activeOverride: getActiveProviderOverride(),
      localModel: getLocalLlmModel(),
      e2eMock: process.env.COACH_E2E_MOCK === "1",
    });
  });

  app.get("/api/foods/barcode/:code", requireAuth, async (req, res) => {
    const code = String(req.params.code ?? "").replace(/\D/g, "");
    if (code.length < 8 || code.length > 14) {
      res.status(400).json({ error: "invalid-barcode" });
      return;
    }
    try {
      const hit = await resolveBarcodeForApi(pool, code);
      if (hit) {
        res.json({ food: hit.food, source: hit.source });
        return;
      }
      res.status(404).json({ error: "product-not-found", barcode: code });
    } catch (err) {
      console.error("OFF barcode:", err);
      const code =
        err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "rate_limited"
          ? "off-rate-limited"
          : "off-fetch-failed";
      res.status(502).json({ error: code });
    }
  });

  app.get("/api/exercises/status", requireAuth, (_req, res) => {
    const d = getExerciseDbEnvDiagnostics();
    res.json({
      configured: d.configured,
      source: d.source,
      host: d.host,
    });
  });

  app.get("/api/exercises/filters", requireAuth, async (_req, res) => {
    try {
      const lists = await fetchExerciseDbFilterLists();
      res.json(lists);
    } catch (err) {
      console.error("ExerciseDB filters:", err);
      res.status(502).json({ error: "exercisedb-fetch-failed" });
    }
  });

  app.get("/api/exercises/search", requireAuth, async (req, res) => {
    if (!isExerciseDbConfigured()) {
      res.status(503).json({ error: "exercisedb-not-configured", exercises: [] });
      return;
    }
    const q = String(req.query.q ?? "").trim();
    const muscle = String(req.query.muscle ?? "all");
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? "24"), 10) || 24));
    try {
      const exercises = await searchExerciseDbCatalog({
        query: q,
        muscle: muscle as import("./src/lib/exerciseLibrary").LibraryMuscleFilterId,
        limit,
      });
      res.json({ exercises });
    } catch (err) {
      console.error("ExerciseDB search:", err);
      const code =
        err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "rate_limited"
          ? "exercisedb-rate-limited"
          : "exercisedb-fetch-failed";
      res.status(502).json({ error: code });
    }
  });

  app.get("/api/exercises/similar", requireAuth, async (req, res) => {
    if (!isExerciseDbConfigured()) {
      res.status(503).json({ error: "exercisedb-not-configured", exercises: [] });
      return;
    }
    const key = String(req.query.key ?? req.query.exerciseKey ?? "").trim();
    const limit = Math.min(20, Math.max(1, parseInt(String(req.query.limit ?? "12"), 10) || 12));
    if (!key) {
      res.status(400).json({ error: "missing-key" });
      return;
    }
    try {
      const exercises = await findSimilarExercises(key, limit);
      res.json({ exercises });
    } catch (err) {
      console.error("ExerciseDB similar:", err);
      res.status(502).json({ error: "exercisedb-fetch-failed" });
    }
  });

  app.get("/api/exercises/media", requireAuth, async (req, res) => {
    const raw = String(req.query.url ?? "").trim();
    if (!raw) {
      res.status(400).json({ error: "missing-url" });
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      res.status(400).json({ error: "invalid-url" });
      return;
    }
    const hostOk =
      parsed.hostname === "cdn.exercisedb.dev" ||
      parsed.hostname.endsWith(".cdn.exercisedb.dev") ||
      parsed.hostname === "static.exercisedb.dev" ||
      parsed.hostname.endsWith(".static.exercisedb.dev");
    if (!hostOk || parsed.protocol !== "https:") {
      res.status(400).json({ error: "host-not-allowed" });
      return;
    }
    try {
      const upstream = await fetch(parsed.toString(), {
        headers: { Accept: "image/*,video/*,*/*" },
      });
      if (!upstream.ok) {
        res.status(upstream.status).end();
        return;
      }
      const ct = upstream.headers.get("content-type");
      if (ct) res.setHeader("Content-Type", ct);
      res.setHeader("Cache-Control", "public, max-age=86400");
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.send(buf);
    } catch (err) {
      console.error("Exercise media proxy:", err);
      res.status(502).json({ error: "media-proxy-failed" });
    }
  });

  /**
   * Übungs-Historie: frühere Sätze zu einer Übung.
   *
   * Grundlage ist das JSONB-Feld `workouts.exercises` — dort liegt je Übung
   * `exerciseKey` und ein `sets`-Array mit `reps`, `weight`, `completed`.
   * Damit lässt sich zeigen, mit wie viel Gewicht man zuletzt trainiert hat,
   * ohne eine eigene Tabelle zu brauchen.
   */
  app.get("/api/exercises/history", requireAuth, async (req: AuthRequest, res) => {
    try {
      const key = String(req.query.key ?? "").trim();
      const name = String(req.query.name ?? "").trim().toLowerCase();
      const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 12));
      if (!key && !name) {
        res.status(400).json({ error: "key oder name angeben." });
        return;
      }

      const r = await pool.query(
        `SELECT id, name AS workout_name, date, exercises
           FROM workouts
          WHERE user_id = $1
          ORDER BY date DESC, created_at DESC
          LIMIT 300`,
        [req.userId],
      );

      type Satz = { reps?: number | string; weight?: number | string; completed?: boolean };
      type Eintrag = {
        date: string;
        workout: string;
        workoutId: string;
        saetze: Array<{ reps: number | null; weight: number | null }>;
        bestesGewicht: number | null;
        volumen: number;
        estimiertesMax: number | null;
      };

      const verlauf: Eintrag[] = [];

      for (const row of r.rows as Array<{
        id: string;
        workout_name: string;
        date: string;
        exercises: unknown;
      }>) {
        const liste = Array.isArray(row.exercises) ? row.exercises : [];
        for (const roh of liste as Array<Record<string, unknown>>) {
          const eKey = String(roh.exerciseKey ?? "").trim();
          const eName = String(roh.name ?? "").trim().toLowerCase();
          const passt = key ? eKey === key : eName === name;
          if (!passt) continue;

          const sets = Array.isArray(roh.sets) ? (roh.sets as Satz[]) : [];
          const saetze = sets
            .map((s) => ({
              reps: s.reps != null ? Number(s.reps) : null,
              weight: s.weight != null ? Number(s.weight) : null,
            }))
            .filter((s) => Number.isFinite(s.reps) && (s.reps ?? 0) > 0);

          if (!saetze.length) continue;

          const gewichte = saetze.map((s) => s.weight ?? 0);
          const volumen = saetze.reduce((a, s) => a + (s.weight ?? 0) * (s.reps ?? 0), 0);
          // Epley-Formel als Vergleichswert: geschätztes Ein-Wiederholungs-Maximum.
          const bestes = saetze
            .map((s) => ((s.weight ?? 0) * (1 + (s.reps ?? 0) / 30)))
            .reduce((a, b) => Math.max(a, b), 0);

          // date kommt als JS-Date-String ("Fri Nov 20 2026…") — auf ISO kuerzen.
          const alsDatum = new Date(row.date);
          const isoDatum = Number.isNaN(alsDatum.getTime())
            ? String(row.date).slice(0, 10)
            : alsDatum.toISOString().slice(0, 10);

          verlauf.push({
            date: isoDatum,
            workout: row.workout_name,
            workoutId: row.id,
            saetze,
            bestesGewicht: Math.max(...gewichte) || null,
            volumen: Math.round(volumen * 10) / 10,
            estimiertesMax: bestes > 0 ? Math.round(bestes * 10) / 10 : null,
          });
          break; // pro Workout nur ein Eintrag je Übung
        }
        if (verlauf.length >= limit) break;
      }

      res.json({
        key: key || null,
        name: name || null,
        anzahl: verlauf.length,
        verlauf,
        /** Höchstes Gewicht über den ganzen Verlauf. */
        rekord: verlauf.reduce<number | null>(
          (a, e) => (e.bestesGewicht != null && (a == null || e.bestesGewicht > a) ? e.bestesGewicht : a),
          null,
        ),
        /** Bestes geschätztes Maximum. */
        rekordMax: verlauf.reduce<number | null>(
          (a, e) => (e.estimiertesMax != null && (a == null || e.estimiertesMax > a) ? e.estimiertesMax : a),
          null,
        ),
      });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "history failed" });
    }
  });

  app.get("/api/exercises/:id", requireAuth, async (req, res) => {
    if (!isExerciseDbConfigured()) {
      res.status(503).json({ error: "exercisedb-not-configured" });
      return;
    }
    const id = String(req.params.id ?? "").replace(/^edb_/, "").trim();
    if (!id) {
      res.status(400).json({ error: "invalid-id" });
      return;
    }
    try {
      const exercise = await fetchExerciseDbById(id);
      if (!exercise) {
        res.status(404).json({ error: "exercise-not-found" });
        return;
      }
      res.json({ exercise });
    } catch (err) {
      console.error("ExerciseDB detail:", err);
      res.status(502).json({ error: "exercisedb-fetch-failed" });
    }
  });

  app.get("/api/foods/openfoodfacts/search", requireAuth, async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) {
      res.json({ foods: [] });
      return;
    }
    try {
      const pageSize = Math.min(50, Math.max(1, parseInt(String(req.query.page_size ?? "16"), 10) || 16));
      const { foods } = await fetchOffCatalogFoods(q, pageSize);
      res.json({ foods });
    } catch (err) {
      console.error("OFF search:", err, { query: q });
      const code =
        err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "rate_limited"
          ? "off-rate-limited"
          : "off-fetch-failed";
      res.status(502).json({ error: code });
    }
  });

  /** App-Lebensmittel speichern (KI/Manuell) — erscheint in der Suche für alle Nutzer. */
  app.get("/api/foods/catalog/:foodId", requireAuth, async (req, res) => {
    const foodId = String(req.params.foodId ?? "").trim();
    if (!foodId) {
      res.status(400).json({ error: "invalid-id" });
      return;
    }
    try {
      const food = await resolveCatalogFoodById(foodId);
      if (!food) {
        res.status(404).json({ error: "food-not-found" });
        return;
      }
      res.json({ food });
    } catch (err) {
      console.error("catalog food by id:", err);
      res.status(502).json({ error: "food-fetch-failed" });
    }
  });

  app.post("/api/foods/app-custom", requireAuth, async (req: AuthRequest, res) => {
    const body = req.body as { draft?: CustomFoodDraft; barcode?: string };
    const draft = body.draft;
    if (!draft?.name?.trim() || !draft.nutrientsPer100g) {
      res.status(400).json({ error: "invalid-draft" });
      return;
    }
    try {
      const food = await insertAppCustomFoodFromDraft(pool, draft, "user_confirmed");
      const barcode = String(body.barcode ?? "").replace(/\D/g, "");
      if (barcode.length >= 8) {
        await pool.query(`UPDATE user_custom_foods SET barcode = $1 WHERE id = $2::uuid`, [
          barcode,
          food.id.replace(/^ucf_/, ""),
        ]);
      }
      res.json({ food });
    } catch (err) {
      console.error("app-custom food insert:", err);
      res.status(500).json({ error: "app-custom-save-failed" });
    }
  });

  /** Gestufte Lebensmittel-Suche (OFF + App-DB + Ranking) — eine Quelle für App und KI. */
  registerNutritionRoutes(app, pool, requireAuth);

  app.get("/api/foods/catalog-search", requireAuth, async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) {
      res.json({ strong: [], similar: [] });
      return;
    }
    try {
      const maxStrong = Math.min(40, Math.max(1, parseInt(String(req.query.max_strong ?? "20"), 10) || 20));
      const maxSimilar = Math.min(48, Math.max(0, parseInt(String(req.query.max_similar ?? "32"), 10) || 32));
      const pageSize = Math.min(52, Math.max(maxStrong + maxSimilar, 24));
      const { searchGenericBaselines } = await import("./src/lib/nutrition/catalog/genericBaselineResolver");
      const [{ foods: offFoods, rawHitCount }, appFoods, genericFoods] = await Promise.all([
        fetchOffCatalogFoods(q, pageSize),
        searchAppCustomFoods(pool, q, 20),
        Promise.resolve(searchGenericBaselines(q, 12)),
      ]);
      const mergedPool = [...offFoods, ...appFoods, ...genericFoods];
      const tiered = tierFoodsFromOffPool(q, mergedPool, maxStrong, maxSimilar);
      res.json({
        ...tiered,
        offMappingDroppedAll: rawHitCount > 0 && offFoods.length === 0 && appFoods.length === 0,
      });
    } catch (err) {
      console.error("catalog-search:", err, { query: q });
      const code =
        err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "rate_limited"
          ? "off-rate-limited"
          : "off-fetch-failed";
      res.status(502).json({ error: code });
    }
  });


  app.post("/api/ai/suggest-custom-food-draft", requireAuth, async (req: AuthRequest, res) => {
    const caps = resolveAiCapabilities();
    if (!caps.enabled) {
      res.status(503).json({ error: "KI ist nicht konfiguriert (kein gültiger API-Key)." });
      return;
    }
    const { query } = req.body as { query?: string };
    const q = (query ?? "").trim();
    if (!q || q.length > 240) {
      res.status(400).json({ error: "Produktname erforderlich (max. 240 Zeichen)." });
      return;
    }
    try {
      const prompt = buildSuggestCustomFoodDraftPrompt(q);
      const raw = await completeMealAnalysis(prompt, undefined, {
        temperature: 0.25,
        responseMode: "json_object",
      });
      const draft = parseCustomFoodDraftFromAi(raw, q);
      res.json({ draft });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "custom food draft failed";
      console.error("suggest-custom-food-draft:", err);
      res.status(500).json({ error: msg });
    }
  });

  /** Tagesüberblick Ernährung — Freitext, keine Patient:innen-Diagnostik */
  app.post("/api/ai/daily-nutrition-review", requireAuth, async (req: AuthRequest, res) => {
    const caps = resolveAiCapabilities();
    if (!caps.enabled) {
      res.status(503).json({ error: "KI ist nicht konfiguriert (kein gültiger API-Key)." });
      return;
    }

    const fin = (x: unknown, fb = 0): number => {
      const n = typeof x === "number" ? x : parseFloat(String(x ?? ""));
      return Number.isFinite(n) ? n : fb;
    };

    const body = req.body as Record<string, unknown>;
    const locale = body.locale === "en" ? "en" : "de";
    const dateRaw = typeof body.date === "string" ? body.date.trim() : "";
    const date =
      /^\d{4}-\d{2}-\d{2}$/.test(dateRaw) ? dateRaw : new Date().toISOString().slice(0, 10);

    const adjustedCalorieTarget = Math.max(0, Math.round(fin(body.adjustedCalorieTarget, 0)));
    const baseCalorieTarget = Math.max(0, Math.round(fin(body.baseCalorieTarget, 0)));
    const activeBurnToday = Math.max(0, Math.round(fin(body.activeBurnToday, 0)));

    const tm = body.targetMacros as Record<string, unknown> | undefined;
    const targetMacros = {
      protein: Math.max(0, fin(tm?.protein, 0)),
      carbs: Math.max(0, fin(tm?.carbs, 0)),
      fat: Math.max(0, fin(tm?.fat, 0)),
    };

    const cons = body.consumed as Record<string, unknown> | undefined;
    const consumed = {
      calories: Math.max(0, Math.round(fin(cons?.calories, 0))),
      protein: Math.max(0, fin(cons?.protein, 0)),
      carbs: Math.max(0, fin(cons?.carbs, 0)),
      fat: Math.max(0, fin(cons?.fat, 0)),
    };

    const gt = body.goalType;
    const goalType =
      gt === "lose" || gt === "maintain" || gt === "gain" ? gt : "maintain";

    const mealsRaw = body.meals;
    type MealLine = {
      meal: string;
      category: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
    };
    const meals: MealLine[] = [];
    if (Array.isArray(mealsRaw)) {
      for (const row of mealsRaw.slice(0, 48)) {
        const o = row as Record<string, unknown>;
        const meal = String(o.meal ?? "").trim().slice(0, 220);
        if (!meal) continue;
        const cat = String(o.category ?? "snack").trim().slice(0, 24);
        meals.push({
          meal,
          category: cat,
          calories: Math.max(0, Math.round(fin(o.calories, 0))),
          protein: Math.round(fin(o.protein, 0) * 10) / 10,
          carbs: Math.round(fin(o.carbs, 0) * 10) / 10,
          fat: Math.round(fin(o.fat, 0) * 10) / 10,
        });
      }
    }

    if (meals.length === 0 && consumed.calories <= 0) {
      res.status(400).json({
        error: locale === "de" ? "Keine Einträge für diesen Tag." : "No entries for this day.",
      });
      return;
    }

    const macroKcal =
      4 * consumed.protein + 4 * consumed.carbs + 9 * consumed.fat;
    const pctP = macroKcal > 0 ? (4 * consumed.protein * 100) / macroKcal : 0;
    const pctC = macroKcal > 0 ? (4 * consumed.carbs * 100) / macroKcal : 0;
    const pctF = macroKcal > 0 ? (9 * consumed.fat * 100) / macroKcal : 0;

    const catDe: Record<string, string> = {
      breakfast: "Frühstück",
      lunch: "Mittagessen",
      dinner: "Abendessen",
      snack: "Snack",
    };
    const catEn: Record<string, string> = {
      breakfast: "Breakfast",
      lunch: "Lunch",
      dinner: "Dinner",
      snack: "Snack",
    };
    type CatAgg = {
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      count: number;
    };
    const byCategory = new Map<string, CatAgg>();
    for (const m of meals) {
      const key = String(m.category ?? "snack").toLowerCase().slice(0, 24) || "snack";
      const row = byCategory.get(key) ?? {
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        count: 0,
      };
      row.calories += m.calories;
      row.protein += m.protein;
      row.carbs += m.carbs;
      row.fat += m.fat;
      row.count += 1;
      byCategory.set(key, row);
    }
    const catOrder = ["breakfast", "lunch", "dinner", "snack"] as const;
    const restCats = [...byCategory.keys()].filter((c) => !catOrder.includes(c as (typeof catOrder)[number])).sort();
    const orderedCats = [
      ...catOrder.filter((c) => byCategory.has(c)),
      ...restCats,
    ];
    const fmtCatLines = (labels: Record<string, string>) =>
      orderedCats
        .map((c) => {
          const a = byCategory.get(c)!;
          const label = labels[c] ?? c;
          const p = Math.round(a.protein * 10) / 10;
          const cb = Math.round(a.carbs * 10) / 10;
          const f = Math.round(a.fat * 10) / 10;
          const n = a.count;
          return locale === "de"
            ? `- ${label}: ${a.calories} kcal; P ${p} g, KH ${cb} g, Fett ${f} g (${n} ${n === 1 ? "Eintrag" : "Einträge"})`
            : `- ${label}: ${a.calories} kcal; P ${p} g, C ${cb} g, F ${f} g (${n} ${n === 1 ? "entry" : "entries"})`;
        })
        .join("\n");
    const mealCategorySummary = fmtCatLines(locale === "de" ? catDe : catEn);

    const goalExplainDe =
      goalType === "lose"
        ? "Gewicht reduzieren / Defizit"
        : goalType === "gain"
          ? "Gewicht zunehmen / Aufbau"
          : "Gewicht halten / Erhalt";

    const goalExplainEn =
      goalType === "lose"
        ? "weight loss / caloric deficit"
        : goalType === "gain"
          ? "muscle gain / surplus"
          : "maintenance";

    const reviewVars = {
      goalExplain: locale === "de" ? goalExplainDe : goalExplainEn,
      date,
      adjustedCalorieTarget: String(adjustedCalorieTarget),
      baseCalorieTarget: String(baseCalorieTarget),
      activeBurnToday: String(activeBurnToday),
      targetProtein: String(targetMacros.protein),
      targetCarbs: String(targetMacros.carbs),
      targetFat: String(targetMacros.fat),
      consumedCalories: String(consumed.calories),
      consumedProtein: String(Math.round(consumed.protein * 10) / 10),
      consumedCarbs: String(Math.round(consumed.carbs * 10) / 10),
      consumedFat: String(Math.round(consumed.fat * 10) / 10),
      pctProtein: pctP.toFixed(0),
      pctCarbs: pctC.toFixed(0),
      pctFat: pctF.toFixed(0),
      mealCategorySummary:
        mealCategorySummary ||
        (locale === "de"
          ? "(noch keine Kategorie-Summen — nur Gesamtwerte oben)"
          : "(no per-category totals yet — use the day totals above)"),
    };
    const prompt = buildDailyNutritionReviewPrompt(locale, reviewVars);

    /** Entfernt Markdown-Reste (*, **, __, `, #), die Modelle oft einstreuen. */
    function stripMdNutAiText(t: string): string {
      return t
        .replace(/\r\n/g, "\n")
        .split("\n")
        .map((line) => {
          let s = line.trim();
          if (/^(Note|Hinweis|Disclaimer)\s*:/i.test(s)) return "";
          if (/^general information only/i.test(s)) return "";
          s = s.replace(/\*\*+/g, "");
          s = s.replace(/\*+/g, "");
          s = s.replace(/_+/g, "");
          s = s.replace(/`+/g, "");
          s = s.replace(/^#+\s*/, "");
          return s.trim();
        })
        .filter((l) => l.length > 0)
        .join("\n");
    }

    /** Tages-Feedback: Gut/Watch/Tipp + Stichpunkte; Disclaimer/Note entfernen; Länge begrenzen. */
    function normalizeDailyNutritionReviewText(raw: string, loc: "de" | "en"): string {
      let s = stripMdNutAiText(String(raw ?? "").trim());
      const linesIn = s.split("\n").map((l) => l.trim());
      const lines: string[] = [];
      let skipRest = false;
      for (const line of linesIn) {
        if (!line) continue;
        if (/^(Note|Hinweis|Disclaimer)\s*:/i.test(line)) {
          skipRest = true;
          continue;
        }
        if (/^general information only/i.test(line)) {
          skipRest = true;
          continue;
        }
        if (skipRest) continue;
        lines.push(line);
      }
      s = lines.join("\n").trim();
      const marker = loc === "de" ? "Gut:" : "Good:";
      const idx = s.indexOf(marker);
      if (idx > 0) s = s.slice(idx).trim();
      const maxChars = 900;
      if (s.length <= maxChars) return s;
      const cut = s.slice(0, maxChars);
      const lastNl = cut.lastIndexOf("\n");
      if (lastNl > maxChars * 0.35) return cut.slice(0, lastNl).trim();
      return `${cut.replace(/\s+\S*$/, "").trim()}…`;
    }

    try {
      const raw = await completeMealAnalysis(prompt, undefined, {
        temperature: 0.35,
        responseMode: "text",
      });
      const text = normalizeDailyNutritionReviewText(raw, locale);
      if (!text) {
        res.status(500).json({ error: "Leere KI-Antwort." });
        return;
      }
      res.json({ text });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "daily nutrition review failed";
      console.error("daily-nutrition-review:", err);
      const resourceExhausted =
        /resource_exhausted|spending cap|quota|429/i.test(msg);
      if (resourceExhausted) {
        res.status(503).json({
          error:
            locale === "de"
              ? "KI-Limit erreicht. Bitte später erneut versuchen oder in Admin auf Mistral umstellen."
              : "AI quota reached. Please try again later or switch to Mistral in admin.",
        });
        return;
      }
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/ai/generate-workout-template", requireAuth, async (req: AuthRequest, res) => {
    const caps = resolveAiCapabilities();
    if (!caps.enabled) {
      res.status(503).json({ error: "KI ist nicht konfiguriert (kein gültiger API-Key)." });
      return;
    }
    const body = req.body as {
      equipment?: string[];
      duration?: number;
      type?: string;
      specialRequests?: string;
    };
    const equipment = Array.isArray(body.equipment) ? body.equipment : [];
    const duration = typeof body.duration === "number" ? body.duration : 60;
    const type = body.type === "Cardio" || body.type === "Hybrid" ? body.type : "Strength";
    const equipmentList = equipment.length > 0 ? equipment.join(", ") : "bodyweight only";
    const exerciseCatalog = await formatExerciseDbForCoachPromptAsync();
    const exerciseKeyBlock = exerciseCatalog.trim()
      ? `

ALLOWED exerciseKey values (prefer exact keys from this catalog; format edb_<id>):
${exerciseCatalog}
`
      : "";

    const prompt = buildWorkoutTemplateGeneratePrompt({
      workoutType: type,
      equipmentList,
      duration: String(duration),
      specialRequestsBlock: body.specialRequests
        ? `- Special requests: ${body.specialRequests}`
        : "",
      exerciseKeyBlock,
    });

    try {
      let rawLast = "";
      let parsed: import("./src/lib/coach/workoutTemplateZod").WorkoutTemplateAiPayload | null = null;
      let repair = "";
      for (let attempt = 0; attempt < 3; attempt++) {
        const p = repair ? `${prompt}\n\nJSON repair: ${repair}` : prompt;
        rawLast = await completeWorkoutTemplateJson(p);
        try {
          const j = parseJsonLoose(rawLast);
          const z = workoutTemplateAiSchema.safeParse(j);
          if (!z.success) {
            repair = z.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
            continue;
          }
          parsed = z.data;
          break;
        } catch (e: unknown) {
          repair = e instanceof Error ? e.message : String(e);
        }
      }
      if (!parsed) {
        res.status(500).json({ error: repair || "Could not parse AI workout response" });
        return;
      }
      res.json({
        name: parsed.name,
        type: parsed.type,
        description: parsed.description,
        exercises: parsed.exercises,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Workout generation failed";
      console.error("generate-workout-template:", err);
      res.status(500).json({ error: msg });
    }
  });

  // ── Auth ──────────────────────────────────────────────────────────────────
  app.post("/api/auth/register", async (req, res) => {
    try {
      const { name, firstName, lastName, email, password, age, gender, themePreference } = req.body as {
        name?: string;
        firstName?: string;
        lastName?: string;
        email: string;
        password: string;
        age?: number;
        gender?: string;
        themePreference?: string;
      };
      const themePref =
        themePreference === "light" || themePreference === "dark" ? themePreference : "dark";
      const first = String(firstName ?? "").trim();
      const last = String(lastName ?? "").trim();
      const displayName = (name?.trim() || `${first} ${last}`.trim()).trim();
      if (!displayName || displayName.length < 3 || !email || !password) {
        res.status(400).json({ error: "All fields required" });
        return;
      }
      if (firstName != null && first.length < 2) {
        res.status(400).json({ error: "Invalid first name" });
        return;
      }
      if (lastName != null && last.length < 2) {
        res.status(400).json({ error: "Invalid last name" });
        return;
      }
      const regFirst = first || splitNameParts(displayName).firstName;
      const regLast = last || splitNameParts(displayName).lastName;

      const existing = await pool.query("SELECT id FROM users WHERE email=$1", [email]);
      if (existing.rows.length) { res.status(409).json({ error: "auth/email-already-in-use" }); return; }

      const hash = await bcrypt.hash(password, 12);
      const result = await pool.query(
        `INSERT INTO users (name, email, password_hash, display_name, first_name, last_name, theme_preference)
         VALUES ($1,$2,$3,$1,$4,$5,$6) RETURNING *`,
        [displayName, email, hash, regFirst, regLast, themePref]
      );
      const user = result.rows[0];

      // Store age + gender in measurements if provided at registration
      if (age || gender) {
        const initialMeasurements = { age: age || null, gender: gender || null };
        await pool.query(
          "UPDATE users SET measurements=$2, updated_at=NOW() WHERE id=$1",
          [user.id, JSON.stringify(initialMeasurements)]
        );
        user.measurements = initialMeasurements;
      }

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
      res.json({ token, profile: mapUser(user) });
    } catch (err) {
      console.error("register error:", err);
      res.status(500).json({ error: "Registration failed" });
    }
  });

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const { email } = req.body as { email?: string };
      const normalized = String(email ?? "").trim().toLowerCase();
      if (!normalized) {
        res.status(400).json({ error: "email-required" });
        return;
      }
      const result = await pool.query("SELECT id FROM users WHERE email=$1 AND is_active=true", [normalized]);
      let devResetUrl: string | undefined;
      if (result.rows.length) {
        const userId = result.rows[0].id as number;
        const token = randomBytes(32).toString("hex");
        const tokenHash = createHash("sha256").update(token).digest("hex");
        await pool.query(
          `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,NOW() + INTERVAL '1 hour')`,
          [userId, tokenHash],
        );
        /*
         * Basis-URL für den Reset-Link.
         *
         * `process.env.APP_PUBLIC_URL` kommt aus der docker-compose.yaml und
         * zeigt auf die interne NAS-Adresse (http://192.168.178.23:22222) — der
         * Link wäre damit nur im Heimnetz erreichbar. Die .env-Datei enthält die
         * öffentliche Domain, wird aber beim Start nicht angewandt, weil sie nur
         * leere Variablen füllt.
         *
         * Deshalb: Datei gewinnt, Prozess-Umgebung ist Rückfall.
         */
        const ausDatei = (() => {
          try {
            const p = String(process.env.ENV_FILE_PATH ?? "/app/.env");
            const txt = readFileSync(p, "utf8");
            for (const zeile of txt.split("\n")) {
              const m = zeile.match(/^APP_PUBLIC_URL\s*=\s*(.+)$/);
              if (m) return m[1].trim().replace(/^["']|["']$/g, "");
            }
          } catch {
            /* Datei fehlt oder nicht lesbar — dann gilt die Umgebung. */
          }
          return "";
        })();
        const base = String(ausDatei || process.env.APP_PUBLIC_URL || "").replace(/\/$/, "");
        if (base) {
          const resetUrl = `${base}/reset-password?token=${token}`;
          const emailed = await sendPasswordResetEmail(normalized, resetUrl);
          if (!emailed && process.env.ALLOW_DEV_RESET_LINK === "1") {
            devResetUrl = resetUrl;
          }
        }
      }
      res.json({ ok: true, ...(devResetUrl ? { devResetUrl } : {}) });
    } catch (err) {
      console.error("forgot-password error:", err);
      res.json({ ok: true });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const { token, password } = req.body as { token?: string; password?: string };
      if (!token || typeof password !== "string" || password.length < 8) {
        res.status(400).json({ error: "password-too-weak" });
        return;
      }
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const row = await pool.query(
        `SELECT user_id FROM password_reset_tokens
         WHERE token_hash=$1 AND used_at IS NULL AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [tokenHash],
      );
      if (!row.rows.length) {
        res.status(400).json({ error: "invalid-or-expired-token" });
        return;
      }
      const userId = row.rows[0].user_id as number;
      const hash = await bcrypt.hash(password, 12);
      await pool.query("UPDATE users SET password_hash=$2, updated_at=NOW() WHERE id=$1", [userId, hash]);
      await pool.query(
        "UPDATE password_reset_tokens SET used_at=NOW() WHERE token_hash=$1 AND used_at IS NULL",
        [tokenHash],
      );
      res.json({ ok: true });
    } catch (err) {
      console.error("reset-password error:", err);
      res.status(500).json({ error: "reset-failed" });
    }
  });

  app.post("/api/auth/change-password", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { currentPassword, newPassword } = req.body as {
        currentPassword?: string;
        newPassword?: string;
      };
      if (!currentPassword || typeof newPassword !== "string" || newPassword.length < 8) {
        res.status(400).json({ error: "password-too-weak" });
        return;
      }
      const result = await pool.query("SELECT password_hash FROM users WHERE id=$1", [req.userId]);
      if (!result.rows.length) {
        res.status(404).json({ error: "not-found" });
        return;
      }
      const ph = result.rows[0].password_hash;
      if (!ph) {
        res.status(400).json({ error: "oauth-account-no-password" });
        return;
      }
      const valid = await bcrypt.compare(currentPassword, ph);
      if (!valid) {
        res.status(401).json({ error: "password-wrong" });
        return;
      }
      const hash = await bcrypt.hash(newPassword, 12);
      await pool.query("UPDATE users SET password_hash=$2, updated_at=NOW() WHERE id=$1", [req.userId, hash]);
      res.json({ ok: true });
    } catch (err) {
      console.error("change-password error:", err);
      res.status(500).json({ error: "change-failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body as { email: string; password: string };
      const result = await pool.query("SELECT * FROM users WHERE email=$1 AND is_active=true", [email]);
      if (!result.rows.length) { res.status(401).json({ error: "Invalid credentials" }); return; }
      const user = result.rows[0];
      if (!user.password_hash) { res.status(401).json({ error: "Use Google sign-in" }); return; }
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) { res.status(401).json({ error: "Invalid credentials" }); return; }
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
      res.json({ token, profile: mapUser(user) });
    } catch (err) {
      console.error("login error:", err);
      res.status(500).json({ error: "Login failed" });
    }
  });

  /** Demo-Zugang für die Portfolio-Vorschau: nur über demo-*-Domains oder DEMO_LOGIN=1. */
  app.post("/api/auth/demo", async (req, res) => {
    try {
      const host = String(req.headers.host ?? "").toLowerCase();
      if (!host.startsWith("demo-") && !host.startsWith("demo.") && process.env.DEMO_LOGIN !== "1") {
        res.status(404).json({ error: "Demo ist nicht verfügbar" });
        return;
      }
      const result = await pool.query(
        "SELECT * FROM users WHERE lower(email)='demo@example.com' AND is_active=true LIMIT 1"
      );
      if (!result.rows.length) { res.status(404).json({ error: "Demo ist nicht eingerichtet" }); return; }
      const user = result.rows[0];
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "30d" });
      res.json({ token, profile: mapUser(user) });
    } catch (err) {
      console.error("demo login error:", err);
      res.status(500).json({ error: "Demo konnte nicht geladen werden" });
    }
  });

  /** Registrierung abbrechen: nur solange Onboarding nicht abgeschlossen (kein Passwort nötig). */
  app.post("/api/auth/cancel-registration", requireAuth, async (req: AuthRequest, res) => {
    try {
      const row = await pool.query("SELECT onboarded FROM users WHERE id=$1", [req.userId]);
      if (!row.rows.length) {
        res.status(404).json({ error: "not-found" });
        return;
      }
      if (row.rows[0].onboarded === true) {
        res.status(403).json({ error: "onboarding-already-complete" });
        return;
      }
      await pool.query("DELETE FROM users WHERE id=$1", [req.userId]);
      res.json({ ok: true });
    } catch (err) {
      console.error("cancel-registration:", err);
      res.status(500).json({ error: "cancel-failed" });
    }
  });

  app.post("/api/auth/delete-account", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { password } = req.body as { password?: string };
      if (!password || typeof password !== "string") {
        res.status(400).json({ error: "password-required" });
        return;
      }
      const result = await pool.query("SELECT password_hash FROM users WHERE id=$1", [req.userId]);
      if (!result.rows.length) {
        res.status(404).json({ error: "not-found" });
        return;
      }
      const ph = result.rows[0].password_hash;
      if (!ph) {
        res.status(400).json({ error: "oauth-account-no-password" });
        return;
      }
      const valid = await bcrypt.compare(password, ph);
      if (!valid) {
        res.status(401).json({ error: "invalid-password" });
        return;
      }
      await pool.query("DELETE FROM users WHERE id=$1", [req.userId]);
      res.json({ ok: true });
    } catch (err) {
      console.error("delete-account:", err);
      res.status(500).json({ error: "delete-failed" });
    }
  });

  app.post("/api/migration/run", requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await runUserDataMigration(pool, req.userId!);
      const profileRow = await pool.query("SELECT * FROM users WHERE id=$1", [req.userId]);
      res.json({ ...result, profile: mapUser(profileRow.rows[0]) });
    } catch (err: unknown) {
      console.error("migration/run:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "migration-failed" });
    }
  });

  app.get("/api/admin/migration/status", requireAdmin, async (_req, res) => {
    try {
      const status = await getDataMigrationStatus(pool);
      res.json(status);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "migration-status-failed" });
    }
  });

  app.post("/api/admin/migration/run-all", requireAdmin, async (req, res) => {
    try {
      const force = !!(req.body as { force?: boolean })?.force;
      const result = await runBatchDataMigrationForAllUsers(pool, { force });
      res.json({ ok: result.ok, ...result });
    } catch (err: unknown) {
      console.error("admin/migration/run-all:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "migration-batch-failed" });
    }
  });

  app.post("/api/admin/migration/run-all-async", requireAdmin, async (req, res) => {
    try {
      if (adminMigrationJob && adminMigrationJob.status === "running") {
        res.status(409).json({
          error: "migration-already-running",
          jobId: adminMigrationJob.jobId,
        });
        return;
      }
      const force = !!(req.body as { force?: boolean })?.force;
      const countRow = await pool.query<{ n: string }>(`SELECT COUNT(*)::bigint AS n FROM users WHERE is_active=true`);
      const totalUsers = Number(countRow.rows[0]?.n || 0);
      const job = createAdminMigrationJob(force);
      job.totalUsers = totalUsers;
      adminMigrationJob = job;

      void (async () => {
        try {
          const result = await runBatchDataMigrationForAllUsers(pool, {
            force,
            onProgress: (event) => {
              if (!adminMigrationJob || adminMigrationJob.jobId !== job.jobId) return;
              adminMigrationJob.logs.push({
                ts: new Date().toISOString(),
                userId: event.userId,
                status: event.status,
                message: event.message.slice(0, 240),
              });
              if (event.status !== "started") {
                adminMigrationJob.processedUsers += 1;
              }
              if (adminMigrationJob.logs.length > 300) {
                adminMigrationJob.logs = adminMigrationJob.logs.slice(-300);
              }
            },
          });
          if (!adminMigrationJob || adminMigrationJob.jobId !== job.jobId) return;
          adminMigrationJob.result = result;
          adminMigrationJob.status = result.ok ? "completed" : "failed";
          adminMigrationJob.finishedAt = new Date().toISOString();
        } catch (err: unknown) {
          if (!adminMigrationJob || adminMigrationJob.jobId !== job.jobId) return;
          adminMigrationJob.status = "failed";
          adminMigrationJob.finishedAt = new Date().toISOString();
          adminMigrationJob.logs.push({
            ts: new Date().toISOString(),
            userId: -1,
            status: "failed",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      })();

      res.json({
        ok: true,
        jobId: job.jobId,
        status: job.status,
        totalUsers: job.totalUsers,
      });
    } catch (err: unknown) {
      console.error("admin/migration/run-all-async:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "migration-batch-async-failed" });
    }
  });

  app.get("/api/admin/migration/job/:jobId", requireAdmin, async (req, res) => {
    const jobId = String(req.params.jobId ?? "");
    if (!adminMigrationJob || adminMigrationJob.jobId !== jobId) {
      res.status(404).json({ error: "migration-job-not-found" });
      return;
    }
    res.json(adminMigrationJob);
  });

  /** Legacy-Alias – nutze lieber POST /api/admin/migration/run-all im Dashboard */
  app.post("/api/admin/flag-migration-v2", requireAdmin, async (_req, res) => {
    try {
      const count = await flagAllUsersForMigration(pool);
      res.json({ ok: true, usersFlagged: count });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "flag-failed" });
    }
  });

  // ── Profile ───────────────────────────────────────────────────────────────
  app.get("/api/profile", requireAuth, async (req: AuthRequest, res) => {
    const result = await pool.query("SELECT * FROM users WHERE id=$1", [req.userId]);
    if (!result.rows.length) { res.status(404).json({ error: "Not found" }); return; }
    res.json(mapUser(result.rows[0]));
  });

  app.patch("/api/profile", requireAuth, async (req: AuthRequest, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const extrasKeys = [
        "freeWorkoutSchedule",
        "manualPlanWeekOverrides",
        "dailyWaterLog",
        "checkIns",
        "favoriteMealTemplateIds",
        "bodyMeasurements",
        "dailyActivityLog",
        "navigationFocus",
        "uiLocale",
        "exerciseRestSeconds",
        "dataMigrationVersion",
        "migrationRequired",
      ] as const;
      const pePatch: Record<string, unknown> = {};
      for (const k of extrasKeys) {
        if (k in req.body) pePatch[k] = (req.body as any)[k];
      }
      if (Object.keys(pePatch).length > 0 || "themePreference" in req.body) {
        const cur = await client.query("SELECT profile_extras FROM users WHERE id=$1", [req.userId]);
        const prev =
          typeof cur.rows[0]?.profile_extras === "string"
            ? JSON.parse(cur.rows[0].profile_extras || "{}")
            : cur.rows[0]?.profile_extras || {};
        const merged = { ...prev, ...pePatch } as Record<string, unknown>;
        delete merged.themeVariant;
        await client.query("UPDATE users SET profile_extras=$2::jsonb,updated_at=NOW() WHERE id=$1", [
          req.userId,
          JSON.stringify(merged),
        ]);
      }

      const allowed: Record<string, string> = {
        displayName: "display_name", photoURL: "photo_url", bio: "bio",
        onboarded: "onboarded", themePreference: "theme_preference",
        goals: "goals", measurements: "measurements", workoutPlan: "workout_plan",
        coachPreferences: "coach_preferences", weightHistory: "weight_history",
        coachingActive: "coaching_active",
      };
      const sets: string[] = [];
      const vals: unknown[] = [req.userId];
      for (const [key, col] of Object.entries(allowed)) {
        if (key in req.body) {
          const v = (req.body as any)[key];
          vals.push(typeof v === "object" && v !== null ? JSON.stringify(v) : v);
          sets.push(`${col}=$${vals.length}`);
        }
      }
      if (sets.length) {
        await client.query(`UPDATE users SET ${sets.join(",")},updated_at=NOW() WHERE id=$1`, vals);
      }

      const body = req.body as Record<string, unknown>;
      if ("firstName" in body || "lastName" in body) {
        const cur = await client.query("SELECT first_name, last_name, display_name, name FROM users WHERE id=$1", [
          req.userId,
        ]);
        const row = cur.rows[0] ?? {};
        const resolved = resolveUserNameFields(row);
        const nextFirst = "firstName" in body ? String(body.firstName ?? "").trim() : resolved.firstName;
        const nextLast = "lastName" in body ? String(body.lastName ?? "").trim() : resolved.lastName;
        if (!validateNameParts(nextFirst, nextLast)) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Invalid name" });
          return;
        }
        const displayName = buildDisplayName(nextFirst, nextLast);
        await client.query(
          `UPDATE users SET first_name=$2, last_name=$3, name=$4, display_name=$4, updated_at=NOW() WHERE id=$1`,
          [req.userId, nextFirst, nextLast, displayName],
        );
      } else if ("displayName" in body) {
        const displayName = String(body.displayName ?? "").trim();
        if (displayName.length < 3) {
          await client.query("ROLLBACK");
          res.status(400).json({ error: "Invalid name" });
          return;
        }
        const { firstName, lastName } = splitNameParts(displayName);
        await client.query(
          `UPDATE users SET first_name=$2, last_name=$3, name=$4, display_name=$4, updated_at=NOW() WHERE id=$1`,
          [req.userId, firstName, lastName, displayName],
        );
      }

      await client.query("COMMIT");
      const result = await pool.query("SELECT * FROM users WHERE id=$1", [req.userId]);
      res.json(mapUser(result.rows[0]));
    } catch (err: unknown) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      res.status(500).json({ error: err instanceof Error ? err.message : "profile-update-failed" });
    } finally {
      client.release();
    }
  });

  // ── User lookup (for social) ───────────────────────────────────────────────
  app.get("/api/users/:id", requireAuth, async (req, res) => {
    const result = await pool.query(
      "SELECT id, display_name, name, photo_url FROM users WHERE id=$1",
      [req.params.id]
    );
    if (!result.rows.length) { res.status(404).json({ error: "Not found" }); return; }
    const u = result.rows[0];
    res.json({ uid: u.id.toString(), displayName: u.display_name || u.name, photoURL: u.photo_url || "" });
  });

  app.get("/api/users/:id/social", requireAuth, async (req: AuthRequest, res) => {
    const uid = parseInt(req.params.id, 10);
    if (Number.isNaN(uid)) { res.status(400).json({ error: "invalid id" }); return; }
    const [followers, following, rel] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM user_follows WHERE following_id=$1`, [uid]),
      pool.query(`SELECT COUNT(*)::int AS c FROM user_follows WHERE follower_id=$1`, [uid]),
      pool.query(`SELECT 1 FROM user_follows WHERE follower_id=$1 AND following_id=$2`, [req.userId, uid]),
    ]);
    res.json({
      followers: followers.rows[0]?.c ?? 0,
      following: following.rows[0]?.c ?? 0,
      youFollow: rel.rows.length > 0,
    });
  });

  app.post("/api/users/:id/follow", requireAuth, async (req: AuthRequest, res) => {
    const target = parseInt(req.params.id, 10);
    if (Number.isNaN(target) || target === req.userId) { res.status(400).json({ error: "invalid" }); return; }
    await pool.query(
      `INSERT INTO user_follows (follower_id, following_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [req.userId, target]
    );
    res.json({ ok: true });
  });

  app.delete("/api/users/:id/follow", requireAuth, async (req: AuthRequest, res) => {
    const target = parseInt(req.params.id, 10);
    await pool.query(`DELETE FROM user_follows WHERE follower_id=$1 AND following_id=$2`, [req.userId, target]);
    res.json({ ok: true });
  });

  app.post("/api/users/:id/block", requireAuth, async (req: AuthRequest, res) => {
    const target = parseInt(req.params.id, 10);
    if (Number.isNaN(target) || target === req.userId) {
      res.status(400).json({ error: "invalid" });
      return;
    }
    await pool.query(
      `INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [req.userId, target],
    );
    await pool.query(`DELETE FROM user_follows WHERE follower_id=$1 AND following_id=$2`, [req.userId, target]);
    await pool.query(`DELETE FROM user_follows WHERE follower_id=$1 AND following_id=$2`, [target, req.userId]);
    res.json({ ok: true });
  });

  app.delete("/api/users/:id/block", requireAuth, async (req: AuthRequest, res) => {
    const target = parseInt(req.params.id, 10);
    await pool.query(`DELETE FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2`, [req.userId, target]);
    res.json({ ok: true });
  });

  app.get("/api/users/:id/block", requireAuth, async (req: AuthRequest, res) => {
    const target = parseInt(req.params.id, 10);
    const row = await pool.query(
      `SELECT 1 FROM user_blocks WHERE blocker_id=$1 AND blocked_id=$2`,
      [req.userId, target],
    );
    res.json({ youBlocked: row.rows.length > 0 });
  });

  app.get("/api/users/:id/posts", requireAuth, async (req, res) => {
    const uid = parseInt(req.params.id, 10);
    const result = await pool.query(
      `SELECT p.*, u.display_name AS user_name, u.name AS user_name_fallback, u.photo_url AS user_photo
       FROM posts p JOIN users u ON u.id=p.user_id
       WHERE p.user_id=$1 ORDER BY p.created_at DESC LIMIT 80`,
      [uid]
    );
    res.json(result.rows.map((r) => ({ ...mapPost(r), userName: r.user_name || r.user_name_fallback || "" })));
  });

  app.get("/api/posts/liked", requireAuth, async (req: AuthRequest, res) => {
    const result = await pool.query(
      `SELECT p.*, u.display_name AS user_name, u.name AS user_name_fallback, u.photo_url AS user_photo
       FROM posts p JOIN users u ON u.id=p.user_id
       WHERE $1 = ANY(p.likes) ORDER BY p.created_at DESC LIMIT 80`,
      [req.userId]
    );
    res.json(result.rows.map((r) => ({ ...mapPost(r), userName: r.user_name || r.user_name_fallback || "" })));
  });

  app.get("/api/messages/inbox", requireAuth, async (req: AuthRequest, res) => {
    const result = await pool.query(
      `WITH partners AS (
         SELECT DISTINCT CASE WHEN sender_id=$1 THEN recipient_id ELSE sender_id END AS oid
         FROM direct_messages WHERE sender_id=$1 OR recipient_id=$1
       )
       SELECT u.id, u.display_name, u.name, u.photo_url,
         (SELECT body FROM direct_messages
          WHERE (sender_id=$1 AND recipient_id=u.id) OR (sender_id=u.id AND recipient_id=$1)
          ORDER BY created_at DESC LIMIT 1) AS last_body,
         (SELECT created_at FROM direct_messages
          WHERE (sender_id=$1 AND recipient_id=u.id) OR (sender_id=u.id AND recipient_id=$1)
          ORDER BY created_at DESC LIMIT 1) AS last_at
       FROM partners p JOIN users u ON u.id=p.oid
       ORDER BY last_at DESC NULLS LAST`,
      [req.userId]
    );
    res.json(
      result.rows.map((r) => ({
        userId: r.id.toString(),
        displayName: r.display_name || r.name || "",
        photoURL: r.photo_url || "",
        lastMessage: r.last_body || "",
        lastAt: r.last_at,
      }))
    );
  });

  app.get("/api/messages/thread/:userId", requireAuth, async (req: AuthRequest, res) => {
    const other = parseInt(req.params.userId, 10);
    const result = await pool.query(
      `SELECT id, sender_id, recipient_id, body, created_at FROM direct_messages
       WHERE (sender_id=$1 AND recipient_id=$2) OR (sender_id=$2 AND recipient_id=$1)
       ORDER BY created_at ASC LIMIT 300`,
      [req.userId, other]
    );
    res.json(
      result.rows.map((r) => ({
        id: r.id,
        senderId: r.sender_id.toString(),
        recipientId: r.recipient_id.toString(),
        body: r.body,
        createdAt: r.created_at,
      }))
    );
  });

  app.post("/api/messages", requireAuth, async (req: AuthRequest, res) => {
    const { recipientId, body } = req.body as { recipientId?: string; body?: string };
    const rid = parseInt(String(recipientId || ""), 10);
    const text = (body || "").trim().slice(0, 4000);
    if (!text || Number.isNaN(rid) || rid === req.userId) {
      res.status(400).json({ error: "invalid" });
      return;
    }
    const ins = await pool.query(
      `INSERT INTO direct_messages (sender_id, recipient_id, body) VALUES ($1,$2,$3) RETURNING id, created_at`,
      [req.userId, rid, text]
    );
    res.json({ id: ins.rows[0].id, createdAt: ins.rows[0].created_at });
  });

  // ── Workouts ──────────────────────────────────────────────────────────────
  app.get("/api/workouts", requireAuth, async (req: AuthRequest, res) => {
    const result = await pool.query(
      "SELECT * FROM workouts WHERE user_id=$1 ORDER BY date DESC, created_at DESC",
      [req.userId]
    );
    const eigene = result.rows.map(mapWorkout);

    /*
     * Garmin-Aktivitäten mitgeben.
     *
     * Läufe und Fahrten, die von der Uhr kommen, stehen nicht in `workouts` —
     * sie liegen in `garmin_activities`. Ohne diesen Zusatz fehlten sie in der
     * Trainingsserie: Ein Lauf am Sonntag hätte die Serie nicht fortgeführt,
     * weil die Serie nur `workouts` kennt.
     *
     * Sie werden als Einträge mit `source: 'garmin'` geliefert. `id` ist die
     * Garmin-Activity-ID, damit sie sich von eigenen Einheiten unterscheiden
     * und nicht doppelt gezählt werden.
     */
    let garmin: Array<Record<string, unknown>> = [];
    try {
      const g = await pool.query(
        `SELECT activity_id, date, name, type, distance_m, duration_s, calories, avg_hr, max_hr
           FROM garmin_activities
          WHERE user_id = $1
          ORDER BY date DESC
          LIMIT 400`,
        [req.userId],
      );
      garmin = g.rows.map((r) => ({
        id: `garmin-${r.activity_id}`,
        date: r.date,
        name: String(r.name ?? '') || String(r.type ?? 'Aktivität'),
        type: String(r.type ?? 'other'),
        duration_min: r.duration_s ? Math.round(Number(r.duration_s) / 60) : null,
        distance_km: r.distance_m ? Math.round((Number(r.distance_m) / 1000) * 100) / 100 : null,
        calories: r.calories ?? null,
        avg_hr: r.avg_hr ?? null,
        max_hr: r.max_hr ?? null,
        /** Kennzeichnet die Herkunft — die Oberfläche kann das anzeigen. */
        source: 'garmin',
      }));
    } catch {
      /* Tabelle fehlt (Garmin nie verbunden) — dann bleibt es bei den eigenen. */
    }

    res.json([...eigene, ...garmin]);
  });

  /**
   * Prüft, ob eine Übung in der ExerciseDB existiert.
   *
   * Tims Vorgabe: In ein Training dürfen nur Übungen, die auch in ExerciseDB zu
   * finden sind — sonst entstehen Einheiten mit Übungen, die es in der Datenbank
   * nicht gibt und für die es keine Erklärung, kein Video und keinen Verlauf gibt.
   *
   * Ist ExerciseDB nicht konfiguriert (kein Abo), wird NICHT blockiert: dann ist
   * der lokale Katalog die Quelle und die Prüfung würde jede Eingabe abweisen.
   */
  const exerciseExistiertInDb = async (
    name: string,
    key?: string,
  ): Promise<{ ok: boolean; treffer?: { id: string; name: string }; grund?: string }> => {
    if (!isExerciseDbConfigured()) return { ok: true };

    const suchbegriff = String(name ?? '').trim();
    if (!suchbegriff) return { ok: false, grund: 'Übung ohne Namen' };

    // Catalog-Key (edb_…) zuerst direkt auflösen — das ist der sichere Weg.
    if (key && isExerciseDbCatalogKey(key)) {
      try {
        const direkt = await fetchExerciseDbById(key.replace(/^edb_/, ''));
        if (direkt) return { ok: true, treffer: { id: direkt.exerciseId ?? '', name: direkt.name } };
      } catch {
        /* unten weiter mit der Namenssuche */
      }
    }

    try {
      const treffer = await searchExerciseDbByName(suchbegriff, 5);
      if (treffer.length > 0) {
        return {
          ok: true,
          treffer: { id: treffer[0].exerciseId ?? '', name: treffer[0].name },
        };
      }
      return {
        ok: false,
        grund: `„${suchbegriff}" ist in der ExerciseDB nicht zu finden.`,
      };
    } catch (e) {
      // Bei einem API-Fehler nicht blockieren — sonst kann Tim nichts speichern,
      // nur weil RapidAPI gerade nicht antwortet.
      console.warn('[exercises] DB-Pruefung fehlgeschlagen:', e);
      return { ok: true };
    }
  };

/**
 * Sucht eine Übung mit abnehmender Strenge, bis ein Treffer kommt.
 *
 * Reihenfolge (bewusst von genau nach grob):
 *   1. Exakter Name.
 *   2. Einzelne Wörter des Namens (das längste zuerst) — findet „Bankdrücken"
 *      über „drücken" oder „Bench Press" über „bench".
 *   3. Muskelgruppe aus dem Namen ableiten („Kniebeuge" → Beine) und dort suchen.
 *   4. Erster Buchstabe des Namens als letzter Ausweg.
 *
 * Ohne diese Kette würde ein vom Coach erfundener Name den ganzen Plan
 * blockieren, obwohl es fachlich eine passende Übung gibt.
 */
/**
 * Sucht eine Übung mit abnehmender Strenge — aber prüft jeden Treffer auf Relevanz.
 *
 * Der Fehler im ersten Anlauf: ohne Relevanzprüfung liefert die Namenssuche bei
 * einem unbekannten Begriff irgendetwas zurück. „Bankdrücken schräg" wurde so zu
 * „Step-up on Chair" — formal ein Treffer, fachlich Unsinn.
 *
 * Jetzt muss der Treffer mindestens ein bedeutungstragendes Wort mit der Suche
 * teilen (oder über die deutsche Übersetzungstabelle zustande kommen). Findet sich
 * nichts Passendes, kommt `null` zurück und die Übung wird ausgelassen.
 */
async function findeUebungMitFallback(
  name: string,
  koerperteil?: string,
): Promise<{ key: string; name: string } | null> {
  const roh = String(name ?? '').trim();
  if (!roh) return null;

  /** Wörter, die nichts unterscheiden. */
  const STOPP = new Set([
    'mit', 'und', 'oder', 'der', 'die', 'das', 'dem', 'den', 'ein', 'eine', 'einer',
    'auf', 'im', 'in', 'am', 'an', 'zu', 'von', 'fuer', 'für', 'the', 'with', 'and',
    'machine', 'maschine', 'gerät', 'geraet', 'übung', 'uebung', 'exercise',
  ]);
  const woerter = (t: string) =>
    t
      .toLowerCase()
      .split(/[^a-zäöüß0-9]+/)
      .filter((w) => w.length >= 4 && !STOPP.has(w));

  const suchWoerter = woerter(roh);
  const uebersetztFrueh = uebersetzeDeutschenNamen(roh);
  const uebersetzteWoerter = uebersetztFrueh ? woerter(uebersetztFrueh) : [];

  /**
   * Teilt der Kandidat ein bedeutungstragendes Wort mit der Suche?
   *
   * Verglichen wird gegen BEIDE Wortlisten — die deutsche und, falls vorhanden,
   * die englische Übersetzung. Sonst findet „Bankdrücken schräg" den Treffer
   * „Dumbbell Incline Bench Press" nicht: die eine Seite ist deutsch, die andere
   * englisch, und es gibt keine gemeinsame Zeichenkette.
   */
  const passt = (kandidat: string): boolean => {
    const kandidatWoerter = new Set(woerter(kandidat));
    return (
      suchWoerter.some((w) => kandidatWoerter.has(w)) ||
      uebersetzteWoerter.some((w) => kandidatWoerter.has(w))
    );
  };

  /*
   * Reihenfolge von genau nach grob. Wichtig: die deutsche Übersetzung kommt
   * VOR den Einzelwörtern, sonst gewinnt „schräg" gegen „Bankdrücken".
   */
  const versuche: Array<{ suche: string }> = [];
  versuche.push({ suche: roh });
  if (uebersetztFrueh) versuche.push({ suche: uebersetztFrueh });

  // Einzelne Wörter, längste zuerst.
  for (const wort of [...suchWoerter].sort((a, b) => b.length - a.length)) {
    versuche.push({ suche: wort });
  }

  for (const v of versuche) {
    try {
      const treffer = await searchExerciseDbByName(v.suche, 10);
      // Ersten Kandidaten nehmen, der die Relevanzprüfung besteht.
      for (const k of treffer) {
        if (passt(k.name)) return { key: k.key, name: k.name };
      }
    } catch {
      /* nächster Versuch */
    }
  }

  // Letzte Stufe: über den Körperteil, aber nur mit Relevanzprüfung.
  if (koerperteil) {
    try {
      const liste = await fetchExerciseDbByBodyPart(koerperteil, 20);
      for (const k of liste) {
        if (passt(k.name)) return { key: k.key, name: k.name };
      }
    } catch {
      /* aufgeben */
    }
  }

  return null;
}

/**
 * Deutsche Übungsnamen auf englische Katalogbegriffe abbilden.
 * Der Coach schreibt deutsch, die ExerciseDB ist englisch.
 */
const DEUTSCH_ENGLISCH: Array<[RegExp, string]> = [
  [/bankdr(ü|ue)cken/i, 'bench press'],
  [/schr(ä|ae)gbank/i, 'incline bench press'],
  [/kniebeuge|kniebeugen/i, 'squat'],
  [/kreuzheben/i, 'deadlift'],
  [/schulterdr(ü|ue)cken|(ü|ue)berkopfdr(ü|ue)cken/i, 'shoulder press'],
  [/rudern/i, 'row'],
  [/klimmzug|klimmz(ü|ue)ge/i, 'chin up'],
  [/liegest(ü|ue)tz/i, 'push up'],
  [/dips?$/i, 'dip'],
  [/latzug/i, 'pulldown'],
  [/seitheben/i, 'lateral raise'],
  [/beinpresse/i, 'leg press'],
  [/beinstrecker/i, 'leg extension'],
  [/beinbeuger|beincurl/i, 'leg curl'],
  [/wadenheben/i, 'calf raise'],
  [/bizeps/i, 'biceps curl'],
  [/trizeps/i, 'triceps'],
  [/ausfallschritt/i, 'lunge'],
  [/plank|unterarmst(ü|ue)tz/i, 'plank'],
  [/crunches?/i, 'crunch'],
  [/h(ü|ue)ftheben/i, 'hip thrust'],
  [/good ?morning/i, 'good morning'],
  [/shrug|schulterheben/i, 'shrug'],
  [/goblet/i, 'goblet squat'],
  [/bulgarian|bulgarisch/i, 'bulgarian split squat'],
];

function uebersetzeDeutschenNamen(name: string): string | null {
  for (const [muster, englisch] of DEUTSCH_ENGLISCH) {
    if (muster.test(name)) return englisch;
  }
  return null;
}

  app.post("/api/workouts", requireAuth, async (req: AuthRequest, res) => {
    const {
      name,
      type,
      subtype,
      duration,
      caloriesBurned,
      date,
      exercises,
      notes,
      shared,
      sessionRpe,
      coachSessionMeta,
      coachSessionFeedback,
      cardioSessionFeedback,
    } = req.body;

    // Muss veraenderbar sein: unbekannte Uebungen werden ersetzt bzw. entfernt.
    let uebungsEingabe = exercises;

    /*
     * Uebungen gegen die ExerciseDB pruefen — und unbekannte AUTOMATISCH ersetzen.
     *
     * Tims Vorgabe: nicht blockieren, sondern aehnliche Uebungen suchen, bis ein
     * Treffer da ist. Ein vom Coach erfundener Name soll den Plan nicht kippen:
     * die Uebung wird auf den naechstbesten echten Eintrag umgeschrieben und der
     * Austausch in der Antwort gemeldet, damit man sieht, was geaendert wurde.
     */
    const uebungsListe = Array.isArray(exercises) ? (exercises as Array<Record<string, unknown>>) : [];
    const ersetzt: Array<{ von: string; auf: string; key: string }> = [];
    if (uebungsListe.length > 0 && isExerciseDbConfigured()) {
      for (const ue of uebungsListe) {
        const ueName = String(ue.name ?? '');
        const ueKey = typeof ue.exerciseKey === 'string' ? ue.exerciseKey : undefined;
        const geprueft = await exerciseExistiertInDb(ueName, ueKey);
        if (geprueft.ok) {
          // Key nachziehen, falls nur der Name bekannt war — sonst kein Video/Verlauf.
          if (!ueKey && geprueft.treffer?.id) {
            ue.exerciseKey = geprueft.treffer.id.startsWith('edb_')
              ? geprueft.treffer.id
              : `edb_${geprueft.treffer.id}`;
          }
          continue;
        }

        // Kein Treffer: aehnliche Uebung suchen, bis eine existiert.
        const ersatz = await findeUebungMitFallback(
          ueName,
          typeof ue.bodyPart === 'string' ? ue.bodyPart : undefined,
        );
        if (ersatz) {
          ue.name = ersatz.name;
          ue.exerciseKey = ersatz.key;
          ersetzt.push({ von: ueName, auf: ersatz.name, key: ersatz.key });
          console.log(`[exercises] "${ueName}" ersetzt durch "${ersatz.name}"`);
        } else {
          // Wirklich nichts gefunden: Uebung entfernen statt den Plan zu blockieren.
          ue.__entfernen = true;
          ersetzt.push({ von: ueName, auf: '', key: '' });
          console.warn(`[exercises] "${ueName}" hat keinen Treffer — Uebung wird entfernt`);
        }
      }

      // Uebungen ohne Treffer aus der Liste nehmen (sonst steht eine leere Uebung drin).
      const bereinigt = uebungsListe.filter((ue) => !ue.__entfernen);
      for (const ue of bereinigt) delete ue.__entfernen;
      uebungsEingabe = bereinigt;
    }

    const result = await pool.query(
      `INSERT INTO workouts (user_id,name,type,subtype,duration,calories_burned,date,exercises,notes,shared,session_rpe,coach_session_meta,coach_session_feedback,cardio_session_feedback)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14::jsonb) RETURNING id`,
      [
        req.userId,
        name,
        type,
        subtype,
        duration || 0,
        caloriesBurned || 0,
        date || new Date().toISOString().split("T")[0],
        JSON.stringify(uebungsEingabe || []),
        notes,
        shared || false,
        typeof sessionRpe === "number" ? Math.min(10, Math.max(1, Math.round(sessionRpe))) : null,
        coachSessionMeta ? JSON.stringify(coachSessionMeta) : null,
        coachSessionFeedback || null,
        cardioSessionFeedback ? JSON.stringify(cardioSessionFeedback) : null,
      ],
    );
    const newId = result.rows[0].id;
    // Direkt nach Intervals (Garmin) übertragen — Fehler dürfen das Speichern nicht kippen.
    let intervals: unknown = null;
    try {
      intervals = await pushWorkoutToIntervals(req.userId!, String(newId));
    } catch (e) {
      intervals = { error: e instanceof Error ? e.message : String(e) };
      console.warn("[intervals] Workout-Upload:", e);
    }
    res.json({ id: newId, intervals });
  });

  app.put("/api/workouts/:id", requireAuth, async (req: AuthRequest, res) => {
    const { name, duration, caloriesBurned, exercises, notes, shared, sessionRpe } = req.body;
    await pool.query(
      `UPDATE workouts SET name=$2,duration=$3,calories_burned=$4,exercises=$5,notes=$6,shared=$7,session_rpe=$8,updated_at=NOW()
       WHERE id=$1 AND user_id=$9`,
      [
        req.params.id,
        name,
        duration,
        caloriesBurned,
        JSON.stringify(exercises || []),
        notes,
        shared,
        typeof sessionRpe === "number" ? Math.min(10, Math.max(1, Math.round(sessionRpe))) : null,
        req.userId,
      ]
    );
    // Geänderte Einheit: gleichen Termin bei Intervals überschreiben (kein Duplikat).
    let intervals: unknown = null;
    try {
      intervals = await pushWorkoutToIntervals(req.userId!, String(req.params.id));
    } catch (e) {
      intervals = { error: e instanceof Error ? e.message : String(e) };
      console.warn("[intervals] Workout-Update:", e);
    }
    res.json({ ok: true, intervals });
  });

  app.delete("/api/workouts/:id", requireAuth, async (req: AuthRequest, res) => {
    // Vor dem Löschen den Intervals-Termin entfernen, sonst bleibt er auf der Uhr stehen.
    let intervals: unknown = null;
    try {
      const row = await pool.query(
        "SELECT intervals_event_id FROM workouts WHERE id=$1 AND user_id=$2",
        [req.params.id, req.userId],
      );
      await removeWorkoutFromIntervals(req.userId!, row.rows[0]?.intervals_event_id);
      intervals = { removed: Boolean(row.rows[0]?.intervals_event_id) };
    } catch (e) {
      intervals = { error: e instanceof Error ? e.message : String(e) };
      console.warn("[intervals] Workout-Delete:", e);
    }
    await pool.query("DELETE FROM workouts WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    res.json({ ok: true, intervals });
  });

  app.get("/api/workout-session-draft", requireAuth, async (req: AuthRequest, res) => {
    const cur = await pool.query("SELECT profile_extras FROM users WHERE id=$1", [req.userId]);
    const extras =
      typeof cur.rows[0]?.profile_extras === "string"
        ? JSON.parse(cur.rows[0].profile_extras || "{}")
        : cur.rows[0]?.profile_extras || {};
    res.json(extras.workoutSessionDraft ?? null);
  });

  app.put("/api/workout-session-draft", requireAuth, async (req: AuthRequest, res) => {
    const cur = await pool.query("SELECT profile_extras FROM users WHERE id=$1", [req.userId]);
    const prev =
      typeof cur.rows[0]?.profile_extras === "string"
        ? JSON.parse(cur.rows[0].profile_extras || "{}")
        : cur.rows[0]?.profile_extras || {};
    const merged = { ...prev, workoutSessionDraft: req.body };
    await pool.query("UPDATE users SET profile_extras=$2::jsonb,updated_at=NOW() WHERE id=$1", [
      req.userId,
      JSON.stringify(merged),
    ]);
    res.json({ ok: true });
  });

  app.delete("/api/workout-session-draft", requireAuth, async (req: AuthRequest, res) => {
    const cur = await pool.query("SELECT profile_extras FROM users WHERE id=$1", [req.userId]);
    const prev =
      typeof cur.rows[0]?.profile_extras === "string"
        ? JSON.parse(cur.rows[0].profile_extras || "{}")
        : cur.rows[0]?.profile_extras || {};
    const { workoutSessionDraft: _d, ...rest } = prev as Record<string, unknown>;
    await pool.query("UPDATE users SET profile_extras=$2::jsonb,updated_at=NOW() WHERE id=$1", [
      req.userId,
      JSON.stringify(rest),
    ]);
    res.json({ ok: true });
  });

  app.get("/api/workout-session-draft/recoverable", requireAuth, async (req: AuthRequest, res) => {
    const cur = await pool.query("SELECT profile_extras FROM users WHERE id=$1", [req.userId]);
    const extras =
      typeof cur.rows[0]?.profile_extras === "string"
        ? JSON.parse(cur.rows[0].profile_extras || "{}")
        : cur.rows[0]?.profile_extras || {};
    const draft = extras.workoutSessionDraft ?? null;
    const workoutsResult = await pool.query(
      "SELECT * FROM workouts WHERE user_id=$1 ORDER BY date DESC, created_at DESC",
      [req.userId],
    );
    const workouts = workoutsResult.rows.map(mapWorkout);
    const recovery = assessRecoverableSessionDraft(draft, workouts);
    if (!recovery) {
      res.json({ recoverable: false });
      return;
    }
    res.json({
      recoverable: true,
      label: recovery.label,
      dayKey: recovery.dayKey,
      durationMinutes: recovery.durationMinutes,
      completedSetCount: recovery.completedSetCount,
      isCoachSource: recovery.isCoachSource,
    });
  });

  app.post("/api/workouts/recover-session-draft", requireAuth, async (req: AuthRequest, res) => {
    const cur = await pool.query("SELECT profile_extras FROM users WHERE id=$1", [req.userId]);
    const prev =
      typeof cur.rows[0]?.profile_extras === "string"
        ? JSON.parse(cur.rows[0].profile_extras || "{}")
        : cur.rows[0]?.profile_extras || {};
    const draft = prev.workoutSessionDraft ?? null;
    const workoutsResult = await pool.query(
      "SELECT * FROM workouts WHERE user_id=$1 ORDER BY date DESC, created_at DESC",
      [req.userId],
    );
    const workouts = workoutsResult.rows.map(mapWorkout);
    const recovery = assessRecoverableSessionDraft(draft, workouts);
    if (!recovery) {
      res.status(404).json({ error: "not_recoverable" });
      return;
    }
    const coachPlanId =
      typeof req.body?.coachPlanId === "string" ? req.body.coachPlanId : undefined;
    const weekNumber =
      typeof req.body?.weekNumber === "number" ? req.body.weekNumber : undefined;
    const payload = buildWorkoutFromRecoverableDraft(recovery, String(req.userId), {
      coachPlanId,
      weekNumber,
    });
    const result = await pool.query(
      `INSERT INTO workouts (user_id,name,type,subtype,duration,calories_burned,date,exercises,notes,shared,session_rpe,coach_session_meta,coach_session_feedback,cardio_session_feedback)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14::jsonb) RETURNING id`,
      [
        req.userId,
        payload.name,
        payload.type,
        payload.subtype ?? null,
        payload.duration || 0,
        payload.caloriesBurned || 0,
        payload.date || new Date().toISOString().split("T")[0],
        JSON.stringify(payload.exercises || []),
        payload.notes ?? null,
        false,
        typeof payload.sessionRpe === "number" ? Math.min(10, Math.max(1, Math.round(payload.sessionRpe))) : null,
        payload.coachSessionMeta ? JSON.stringify(payload.coachSessionMeta) : null,
        null,
        payload.cardioSessionFeedback ? JSON.stringify(payload.cardioSessionFeedback) : null,
      ],
    );
    const { workoutSessionDraft: _d, ...rest } = prev as Record<string, unknown>;
    await pool.query("UPDATE users SET profile_extras=$2::jsonb,updated_at=NOW() WHERE id=$1", [
      req.userId,
      JSON.stringify(rest),
    ]);
    res.json({ id: result.rows[0].id, recovered: true });
  });

  // ── Workout Templates ─────────────────────────────────────────────────────
  app.get("/api/workout-templates", requireAuth, async (req: AuthRequest, res) => {
    const result = await pool.query(
      "SELECT * FROM workout_templates WHERE user_id=$1 ORDER BY created_at DESC",
      [req.userId]
    );
    res.json(result.rows.map(mapTemplate));
  });

  app.post("/api/workout-templates", requireAuth, async (req: AuthRequest, res) => {
    const { name, type, templateMode, exercises, weekPlan } = req.body;
    const result = await pool.query(
      "INSERT INTO workout_templates (user_id,name,type,template_mode,exercises,week_plan) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
      [req.userId, name, type, templateMode || 'workout', JSON.stringify(exercises || []), weekPlan ? JSON.stringify(weekPlan) : null]
    );
    res.json({ id: result.rows[0].id });
  });

  app.put("/api/workout-templates/:id", requireAuth, async (req: AuthRequest, res) => {
    const { name, type, templateMode, exercises, weekPlan } = req.body;
    await pool.query(
      "UPDATE workout_templates SET name=$2,type=$3,template_mode=$4,exercises=$5,week_plan=$6 WHERE id=$1 AND user_id=$7",
      [req.params.id, name, type, templateMode || 'workout', JSON.stringify(exercises || []), weekPlan ? JSON.stringify(weekPlan) : null, req.userId]
    );
    res.json({ ok: true });
  });

  app.delete("/api/workout-templates/:id", requireAuth, async (req: AuthRequest, res) => {
    await pool.query("DELETE FROM workout_templates WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    res.json({ ok: true });
  });

  // ── Nutrition ─────────────────────────────────────────────────────────────
  app.get("/api/nutrition", requireAuth, async (req: AuthRequest, res) => {
    // Returns last 30 days by default; pass ?date=YYYY-MM-DD for a specific day
    const { date } = req.query as { date?: string };
    let query = "SELECT * FROM nutrition WHERE user_id=$1";
    const vals: unknown[] = [req.userId];
    if (date) {
      vals.push(date);
      query += ` AND date=$${vals.length}`;
    } else {
      query += " AND date >= CURRENT_DATE - INTERVAL '30 days'";
    }
    query += " ORDER BY created_at DESC";
    const result = await pool.query(query, vals);
    res.json(result.rows.map(mapNutrition));
  });

  app.get("/api/nutrition/:id/components", requireAuth, async (req: AuthRequest, res) => {
    const nutritionId = String(req.params.id || "").trim();
    if (!nutritionId) {
      res.status(400).json({ error: "invalid-id" });
      return;
    }
    const own = await pool.query(
      "SELECT id FROM nutrition WHERE id=$1 AND user_id=$2",
      [nutritionId, req.userId],
    );
    if (own.rowCount === 0) {
      res.status(404).json({ error: "not-found" });
      return;
    }
    const rows = await pool.query(
      `SELECT
         component_id, food_name, openfoodfacts_id, product_name, brand, grams, kcal,
         protein_g, carbs_g, fat_g, fiber_g, data_source, confidence_score, user_modified, created_at
       FROM nutrition_log_components
       WHERE nutrition_id=$1
       ORDER BY created_at ASC`,
      [nutritionId],
    );
    res.json({ components: rows.rows });
  });

  app.post("/api/nutrition", requireAuth, async (req: AuthRequest, res) => {
    const {
      meal,
      category,
      calories,
      protein,
      carbs,
      fat,
      date,
      ingredients,
      quantity,
      unit,
      inputType,
      originalInput,
      mealCategory,
      cuisine,
      totalFiber,
      aiModelUsed,
      pipelineVersion,
      userReviewed,
      nutritionLogComponents,
    } = req.body;
    const result = await pool.query(
      `INSERT INTO nutrition (
        user_id,meal,category,calories,protein,carbs,fat,date,ingredients,quantity,unit,
        input_type,original_input,meal_category,cuisine,total_fiber,ai_model_used,pipeline_version,user_reviewed
      )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
      [req.userId, meal, category, calories || 0, protein || 0, carbs || 0, fat || 0,
       date || new Date().toISOString().split("T")[0], JSON.stringify(ingredients || []),
       quantity != null && quantity !== "" ? Number(quantity) : null, unit || null,
       inputType || null,
       originalInput || null,
       mealCategory || null,
       cuisine || null,
       Number(totalFiber) || 0,
       aiModelUsed || null,
       pipelineVersion || null,
       userReviewed === true]
    );
    const nutritionId = result.rows[0].id;
    if (Array.isArray(nutritionLogComponents) && nutritionLogComponents.length > 0) {
      for (const row of nutritionLogComponents) {
        await pool.query(
          `INSERT INTO nutrition_log_components (
            nutrition_id, component_id, food_name, openfoodfacts_id, product_name, brand,
            grams, kcal, protein_g, carbs_g, fat_g, fiber_g, data_source, confidence_score, user_modified
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            nutritionId,
            row.component_id ?? null,
            row.food_name ?? row.product_name ?? meal,
            row.openfoodfacts_id ?? null,
            row.product_name ?? row.food_name ?? meal,
            row.brand ?? null,
            Number(row.grams) || 0,
            Number(row.kcal) || 0,
            Number(row.protein_g) || 0,
            Number(row.carbs_g) || 0,
            Number(row.fat_g) || 0,
            row.fiber_g != null ? Number(row.fiber_g) : null,
            row.data_source ?? 'openfoodfacts',
            Number(row.confidence_score) || 0,
            row.user_modified === true,
          ],
        );
      }
    }
    res.json({ id: nutritionId });
  });

  app.patch("/api/nutrition/:id", requireAuth, async (req: AuthRequest, res) => {
    const { meal, category, calories, protein, carbs, fat, date, ingredients, quantity, unit } = req.body;
    const dateVal =
      typeof date === "string" ? (date.includes("T") ? date.split("T")[0] : date) : new Date().toISOString().split("T")[0];
    const qNum = quantity != null && quantity !== "" ? Number(quantity) : null;
    const result = await pool.query(
      `UPDATE nutrition SET
         meal=$1, category=$2, calories=$3, protein=$4, carbs=$5, fat=$6, date=$7,
         ingredients=$8::jsonb, quantity=$9, unit=$10
       WHERE id=$11 AND user_id=$12`,
      [
        String(meal || ""),
        category || "snack",
        Number(calories) || 0,
        Number(protein) || 0,
        Number(carbs) || 0,
        Number(fat) || 0,
        dateVal,
        JSON.stringify(ingredients ?? []),
        qNum,
        unit ? String(unit) : null,
        req.params.id,
        req.userId,
      ],
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  });

  app.delete("/api/nutrition/:id", requireAuth, async (req: AuthRequest, res) => {
    await pool.query("DELETE FROM nutrition WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    res.json({ ok: true });
  });

  // ── Meal Templates ────────────────────────────────────────────────────────
  app.get("/api/meal-templates", requireAuth, async (req: AuthRequest, res) => {
    const result = await pool.query(
      "SELECT * FROM meal_templates WHERE user_id=$1 ORDER BY created_at DESC",
      [req.userId]
    );
    res.json(result.rows.map(mapMealTemplate));
  });

  app.post("/api/meal-templates", requireAuth, async (req: AuthRequest, res) => {
    const {
      name,
      category,
      ingredients,
      totalCalories,
      totalProtein,
      totalCarbs,
      totalFat,
      yieldsPortions,
      prepSteps,
      source,
      llmEstimateNutrients,
      nutrientsComputedCoverage,
    } = req.body as Record<string, any>;
    const yp = Math.max(1, Math.min(999, parseInt(String(yieldsPortions || 1), 10) || 1));
    const prepJson = JSON.stringify(Array.isArray(prepSteps) ? prepSteps : []);
    const llmEst =
      llmEstimateNutrients && typeof llmEstimateNutrients === "object"
        ? JSON.stringify(llmEstimateNutrients)
        : null;
    const cov =
      nutrientsComputedCoverage != null && nutrientsComputedCoverage !== ""
        ? Number(nutrientsComputedCoverage)
        : 0;
    const src = typeof source === "string" && source.trim() ? String(source).slice(0, 40) : "manual";
    await pool.query(
      `INSERT INTO meal_templates (
        user_id,name,category,ingredients,total_calories,total_protein,total_carbs,total_fat,yields_portions,
        prep_steps,llm_estimate_nutrients,nutrients_computed_coverage,source
      ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13)`,
      [
        req.userId,
        name,
        category,
        JSON.stringify(ingredients || []),
        totalCalories || 0,
        totalProtein || 0,
        totalCarbs || 0,
        totalFat || 0,
        yp,
        prepJson,
        llmEst,
        cov,
        src,
      ],
    );
    res.json({ ok: true });
  });

  app.patch("/api/meal-templates/:id", requireAuth, async (req: AuthRequest, res) => {
    const body = req.body as Record<string, any>;
    const {
      name,
      category,
      ingredients,
      totalCalories,
      totalProtein,
      totalCarbs,
      totalFat,
      yieldsPortions,
      prepSteps,
      source,
      llmEstimateNutrients,
      nutrientsComputedCoverage,
    } = body;
    const yp = Math.max(1, Math.min(999, parseInt(String(yieldsPortions ?? 1), 10) || 1));
    const existing = await pool.query(
      "SELECT prep_steps, llm_estimate_nutrients, nutrients_computed_coverage, source FROM meal_templates WHERE id=$1 AND user_id=$2",
      [req.params.id, req.userId],
    );
    if (!existing.rows.length) return res.status(404).json({ error: "Template not found" });
    const row0 = existing.rows[0];
    const prepFinal = prepSteps != null ? JSON.stringify(prepSteps) : JSON.stringify(row0.prep_steps || []);
    const llmFinal =
      llmEstimateNutrients != null && typeof llmEstimateNutrients === "object"
        ? JSON.stringify(llmEstimateNutrients)
        : row0.llm_estimate_nutrients != null
          ? JSON.stringify(row0.llm_estimate_nutrients)
          : null;
    const covFinal =
      nutrientsComputedCoverage != null && nutrientsComputedCoverage !== ""
        ? Number(nutrientsComputedCoverage)
        : Number(row0.nutrients_computed_coverage ?? 0);
    const srcFinal =
      typeof source === "string" && source.trim()
        ? String(source).slice(0, 40)
        : String(row0.source || "manual");
    await pool.query(
      `UPDATE meal_templates SET
         name=$1, category=$2, ingredients=$3::jsonb,
         total_calories=$4, total_protein=$5, total_carbs=$6, total_fat=$7, yields_portions=$8,
         prep_steps=$9::jsonb, llm_estimate_nutrients=$10::jsonb, nutrients_computed_coverage=$11, source=$12
       WHERE id=$13 AND user_id=$14`,
      [
        name,
        category,
        JSON.stringify(ingredients || []),
        Number(totalCalories) || 0,
        Number(totalProtein) || 0,
        Number(totalCarbs) || 0,
        Number(totalFat) || 0,
        yp,
        prepFinal,
        llmFinal,
        covFinal,
        srcFinal,
        req.params.id,
        req.userId,
      ],
    );
    res.json({ ok: true });
  });

  app.post("/api/meal-templates/ai-draft", requireAuth, async (req: AuthRequest, res) => {
    const t0 = Date.now();
    let attempts = 0;
    let rawLast = "";
    try {
      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein gültiger API-Key)." });
        return;
      }
      const { idea, allergies, yieldsPortions } = req.body as {
        idea?: string;
        allergies?: string;
        yieldsPortions?: number;
      };
      const ideaStr = String(idea || "").trim();
      if (!ideaStr) {
        res.status(400).json({ error: "idea required" });
        return;
      }
      const ypHint = yieldsPortions != null ? Number(yieldsPortions) : undefined;
      const ypHintNum = ypHint != null && Number.isFinite(ypHint) && ypHint > 0 ? ypHint : 4;
      const basePrompt = buildMealRecipeDraftPrompt(ideaStr, String(allergies || ""), ypHintNum);
      let repair = "";
      let parsed: import("./src/lib/mealRecipeZod").MealRecipeAiPayload | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        attempts = attempt;
        const prompt = repair ? `${basePrompt}\n\nVALIDATOR REPAIR:\n${repair}` : basePrompt;
        rawLast = await completeMealAnalysis(prompt, undefined, { responseMode: "json_object", temperature: 0.35 });
        try {
          const j = parseJsonLoose(rawLast);
          const z = mealRecipeAiSchema.safeParse(j);
          if (!z.success) {
            repair = z.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
            continue;
          }
          parsed = z.data;
          repair = "";
          break;
        } catch (e: any) {
          repair = e?.message || String(e);
        }
      }
      if (!parsed) {
        await logMealAiRun(pool, {
          userId: req.userId!,
          endpoint: "POST /api/meal-templates/ai-draft",
          inputSummary: { idea: ideaStr },
          rawResponse: rawLast.slice(0, 120_000),
          zodOk: false,
          retries: attempts,
          latencyMs: Date.now() - t0,
          errorMessage: repair || "validation failed",
          refinementRound: 0,
        });
        res.status(500).json({ error: repair || "Meal AI validation failed" });
        return;
      }
      const yp = Math.max(1, Math.min(999, parsed.yields_portions ?? ypHint ?? 4));
      const ings = parsed.ingredients.map((i) => ({
        ...i,
        unresolved: i.unresolved ?? !i.foodId,
      }));
      const offResolver = await buildOffFoodResolverForIngredients(ings);
      const compute = computeMealTemplateNutritionForRecipe(ings, offResolver);
      const ins = await pool.query(
        `INSERT INTO meal_templates (
          user_id,name,category,ingredients,total_calories,total_protein,total_carbs,total_fat,yields_portions,
          prep_steps,llm_estimate_nutrients,nutrients_computed_coverage,source
        ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,'ai_recipe') RETURNING *`,
        [
          req.userId,
          parsed.name,
          parsed.category || "meal",
          JSON.stringify(ings),
          compute.computed.calories,
          compute.computed.protein,
          compute.computed.carbs,
          compute.computed.fat,
          yp,
          JSON.stringify(parsed.prep_steps),
          parsed.llm_estimate_nutrients ? JSON.stringify(parsed.llm_estimate_nutrients) : null,
          compute.rowCoverage,
        ],
      );
      await logMealAiRun(pool, {
        userId: req.userId!,
        endpoint: "POST /api/meal-templates/ai-draft",
        inputSummary: { idea: ideaStr },
        rawResponse: rawLast.slice(0, 120_000),
        zodOk: true,
        retries: attempts,
        latencyMs: Date.now() - t0,
        errorMessage: null,
        refinementRound: 0,
      });
      res.json(mapMealTemplate(ins.rows[0]));
    } catch (e: any) {
      await logMealAiRun(pool, {
        userId: req.userId!,
        endpoint: "POST /api/meal-templates/ai-draft",
        inputSummary: { err: true },
        rawResponse: rawLast ? rawLast.slice(0, 120_000) : null,
        zodOk: false,
        retries: attempts,
        latencyMs: Date.now() - t0,
        errorMessage: e?.message ?? String(e),
        refinementRound: 0,
      });
      console.error("meal-templates ai-draft:", e);
      res.status(500).json({ error: e?.message || "AI draft failed" });
    }
  });

  app.post("/api/meal-templates/ai-refine", requireAuth, async (req: AuthRequest, res) => {
    const t0 = Date.now();
    let attempts = 0;
    let rawLast = "";
    try {
      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein gültiger API-Key)." });
        return;
      }
      const { previousValid, userRefinement } = req.body as { previousValid?: unknown; userRefinement?: string };
      if (!previousValid || typeof userRefinement !== "string" || !userRefinement.trim()) {
        res.status(400).json({ error: "previousValid and userRefinement required" });
        return;
      }
      const base = buildMealRecipeRefinePrompt(
        userRefinement.trim(),
        JSON.stringify(previousValid, null, 2),
      );
      let repair = "";
      let parsed: import("./src/lib/mealRecipeZod").MealRecipeAiPayload | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        attempts = attempt;
        const prompt = repair ? `${base}\nREPAIR: ${repair}` : base;
        rawLast = await completeMealAnalysis(prompt, undefined, { responseMode: "json_object", temperature: 0.35 });
        try {
          const j = parseJsonLoose(rawLast);
          const z = mealRecipeAiSchema.safeParse(j);
          if (!z.success) {
            repair = z.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
            continue;
          }
          parsed = z.data;
          repair = "";
          break;
        } catch (e: any) {
          repair = e?.message || String(e);
        }
      }
      if (!parsed) {
        await logMealAiRun(pool, {
          userId: req.userId!,
          endpoint: "POST /api/meal-templates/ai-refine",
          inputSummary: { userRefinement },
          rawResponse: rawLast.slice(0, 120_000),
          zodOk: false,
          retries: attempts,
          latencyMs: Date.now() - t0,
          errorMessage: repair || "validation failed",
          refinementRound: 1,
        });
        res.status(500).json({ error: repair || "Refine validation failed" });
        return;
      }
      const yp = Math.max(1, Math.min(999, parsed.yields_portions ?? 4));
      const ings = parsed.ingredients.map((i) => ({
        ...i,
        unresolved: i.unresolved ?? !i.foodId,
      }));
      const offResolver = await buildOffFoodResolverForIngredients(ings);
      const compute = computeMealTemplateNutritionForRecipe(ings, offResolver);
      const ins = await pool.query(
        `INSERT INTO meal_templates (
          user_id,name,category,ingredients,total_calories,total_protein,total_carbs,total_fat,yields_portions,
          prep_steps,llm_estimate_nutrients,nutrients_computed_coverage,source
        ) VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,'ai_recipe') RETURNING *`,
        [
          req.userId,
          parsed.name,
          parsed.category || "meal",
          JSON.stringify(ings),
          compute.computed.calories,
          compute.computed.protein,
          compute.computed.carbs,
          compute.computed.fat,
          yp,
          JSON.stringify(parsed.prep_steps),
          parsed.llm_estimate_nutrients ? JSON.stringify(parsed.llm_estimate_nutrients) : null,
          compute.rowCoverage,
        ],
      );
      await logMealAiRun(pool, {
        userId: req.userId!,
        endpoint: "POST /api/meal-templates/ai-refine",
        inputSummary: { userRefinement },
        rawResponse: rawLast.slice(0, 120_000),
        zodOk: true,
        retries: attempts,
        latencyMs: Date.now() - t0,
        errorMessage: null,
        refinementRound: 1,
      });
      res.json(mapMealTemplate(ins.rows[0]));
    } catch (e: any) {
      await logMealAiRun(pool, {
        userId: req.userId!,
        endpoint: "POST /api/meal-templates/ai-refine",
        inputSummary: { err: true },
        rawResponse: rawLast ? rawLast.slice(0, 120_000) : null,
        zodOk: false,
        retries: attempts,
        latencyMs: Date.now() - t0,
        errorMessage: e?.message ?? String(e),
        refinementRound: 1,
      });
      console.error("meal-templates ai-refine:", e);
      res.status(500).json({ error: e?.message || "AI refine failed" });
    }
  });

  app.delete("/api/meal-templates/:id", requireAuth, async (req: AuthRequest, res) => {
    await pool.query("DELETE FROM meal_templates WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    res.json({ ok: true });
  });

  const POST_BLOCK_FILTER = `
    AND p.user_id NOT IN (
      SELECT blocked_id FROM user_blocks WHERE blocker_id = $viewer
      UNION
      SELECT blocker_id FROM user_blocks WHERE blocked_id = $viewer
    )`;

  // ── Posts ─────────────────────────────────────────────────────────────────
  app.get("/api/posts", requireAuth, async (req: AuthRequest, res) => {
    const scope = String(req.query.scope ?? "global");
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10) || 50));
    const viewer = req.userId!;
    let result;
    if (scope === "following") {
      result = await pool.query(
        `SELECT p.*, u.display_name AS user_name, u.name AS user_name_fallback, u.photo_url AS user_photo
         FROM posts p
         JOIN users u ON u.id = p.user_id
         WHERE (p.user_id = $1
            OR p.user_id IN (SELECT following_id FROM user_follows WHERE follower_id = $1))
         ${POST_BLOCK_FILTER.replace(/\$viewer/g, "$1")}
         ORDER BY p.created_at DESC
         LIMIT $2`,
        [viewer, limit],
      );
    } else {
      result = await pool.query(
        `SELECT p.*, u.display_name AS user_name, u.name AS user_name_fallback, u.photo_url AS user_photo
         FROM posts p JOIN users u ON u.id=p.user_id
         WHERE 1=1 ${POST_BLOCK_FILTER.replace(/\$viewer/g, "$1")}
         ORDER BY p.created_at DESC LIMIT $2`,
        [viewer, limit],
      );
    }
    res.json(result.rows.map(r => ({ ...mapPost(r), userName: r.user_name || r.user_name_fallback || "" })));
  });

  app.post("/api/posts/:id/report", requireAuth, async (req: AuthRequest, res) => {
    const { reason } = req.body as { reason?: string };
    const postId = req.params.id;
    const exists = await pool.query(`SELECT 1 FROM posts WHERE id=$1`, [postId]);
    if (!exists.rows.length) {
      res.status(404).json({ error: "not-found" });
      return;
    }
    await pool.query(
      `INSERT INTO post_reports (post_id, reporter_id, reason) VALUES ($1,$2,$3)`,
      [postId, req.userId, String(reason ?? "").slice(0, 2000)],
    );
    res.json({ ok: true });
  });

  app.post("/api/posts", requireAuth, async (req: AuthRequest, res) => {
    const { content, imageUrl, type, workoutId } = req.body;
    const result = await pool.query(
      "INSERT INTO posts (user_id,content,image_url,type,workout_id) VALUES ($1,$2,$3,$4,$5) RETURNING id",
      [req.userId, content, imageUrl, type || "manual", workoutId]
    );
    res.json({ id: result.rows[0].id });
  });

  app.delete("/api/posts/:id", requireAuth, async (req: AuthRequest, res) => {
    const result = await pool.query("DELETE FROM posts WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    if (!result.rowCount) {
      res.status(404).json({ error: "Beitrag nicht gefunden oder keine Berechtigung" });
      return;
    }
    res.json({ ok: true });
  });

  app.post("/api/posts/:id/like", requireAuth, async (req: AuthRequest, res) => {
    await pool.query(
      "UPDATE posts SET likes=array_append(likes,$2) WHERE id=$1 AND NOT ($2=ANY(likes))",
      [req.params.id, req.userId]
    );
    res.json({ ok: true });
  });

  app.delete("/api/posts/:id/like", requireAuth, async (req: AuthRequest, res) => {
    await pool.query(
      "UPDATE posts SET likes=array_remove(likes,$2) WHERE id=$1",
      [req.params.id, req.userId]
    );
    res.json({ ok: true });
  });

  // ── Comments ──────────────────────────────────────────────────────────────
  app.get("/api/posts/:id/comments", requireAuth, async (req, res) => {
    const result = await pool.query(
      `SELECT c.*, u.display_name AS user_name, u.name AS user_name_fallback, u.photo_url AS user_photo
       FROM post_comments c JOIN users u ON u.id=c.user_id
       WHERE c.post_id=$1 ORDER BY c.created_at ASC`,
      [req.params.id]
    );
    res.json(result.rows.map(r => ({
      id: r.id, postId: r.post_id, userId: r.user_id.toString(),
      userName: r.user_name || r.user_name_fallback || "",
      userPhoto: r.user_photo || "",
      content: r.content, createdAt: r.created_at,
    })));
  });

  app.post("/api/posts/:id/comments", requireAuth, async (req: AuthRequest, res) => {
    const { content } = req.body;
    await pool.query(
      "INSERT INTO post_comments (post_id,user_id,content) VALUES ($1,$2,$3)",
      [req.params.id, req.userId, content]
    );
    res.json({ ok: true });
  });

  app.delete("/api/posts/:postId/comments/:commentId", requireAuth, async (req: AuthRequest, res) => {
    await pool.query(
      "DELETE FROM post_comments WHERE id=$1 AND user_id=$2",
      [req.params.commentId, req.userId]
    );
    res.json({ ok: true });
  });

  // ── Coach: Mistral helper ─────────────────────────────────────────────────

  function callCoachAi(
    messages: Array<{ role: string; content: string }>,
    area: "coach_workout" | "coach_nutrition",
  ): Promise<string> {
    return completeCoachJson(messages, area);
  }

  function callCoachAiForPlan(
    plan: { type?: string },
    messages: Array<{ role: string; content: string }>,
  ): Promise<string> {
    return callCoachAi(messages, coachAreaForPlanType(plan.type));
  }

  function coachPayloadHash(obj: unknown): string | null {
    try {
      return createHash("sha256").update(JSON.stringify(obj ?? null)).digest("hex").slice(0, 32);
    } catch {
      return null;
    }
  }

  /** Stellt sicher, dass Cardio/Interval-Sessions nie mit leerem Hauptteil ausgeliefert werden. */
  function normalizeCoachWorkoutDay(d: any): any {
    if (!d || typeof d !== "object") return d;
    if (d.isRest) return d;
    const sessionType = String(d.sessionType || "");
    const title = String(d.title || "");
    const lower = `${sessionType} ${title}`.toLowerCase();
    const noLift = !Array.isArray(d.exercises) || d.exercises.length === 0;
    const looksCardio =
      /cardio|interval|\brun\b|\bride\b|bike|swim|row|aerobic|tempo|endurance|jog|\b5k\b|\b10k\b|track|hiit|time trial|lauf/.test(lower) ||
      (noLift && /assessment|trial|evaluation/.test(lower));

    let cardio = d.cardio;
    if (looksCardio || (cardio && typeof cardio === "object")) {
      const base = cardio && typeof cardio === "object" ? { ...cardio } : {};
      if (!base.type || !String(base.type).trim()) {
        if (/swim/.test(lower)) base.type = "swim";
        else if (/bike|cycl|ride|erg/.test(lower)) base.type = "bike";
        else if (/row/.test(lower)) base.type = "row";
        else base.type = "run";
      }
      const hasGrid =
        !!(base.duration && String(base.duration).trim()) ||
        !!(base.distance && String(base.distance).trim()) ||
        !!(base.pace && String(base.pace).trim()) ||
        !!(base.zones && String(base.zones).trim());
      const detail = typeof base.details === "string" ? base.details.trim() : "";
      if (!hasGrid && !detail) {
        const fromDesc = String(d.description || "").trim();
        const fromNotes = String(d.notes || "").trim();
        const warmup = String(d.warmup || "").trim();
        const cooldown = String(d.cooldown || "").trim();
        let fallback = [fromDesc, fromNotes].filter(Boolean).join("\n\n").trim();
        if (!fallback && warmup && cooldown) {
          fallback =
            `Ausführung: Hauptteil gemäß Session-Titel und Wochenfokus — Warm-up und Cool-down sind unten bereits detailliert; der **Block zwischen Warm-up und Cool-down** muss mit konkreten Intervallen/Zeiten/(Zonen) beschrieben sein.\n\nSession: ${title || sessionType || "Cardio"}.`.trim();
        }
        if (fallback) base.details = fallback;
        else if (looksCardio) {
          base.details =
            `Hauptteil (Cardio/Intervals): Konkrete Arbeit zwischen Warm-up und Cool-down — z. B. Zeitfahren, Intervall-Stufen, Wiederholungen, Erholung, Ziel-Zonen/RPE. Titel: ${title || sessionType || "Cardio"}.`.trim();
        }
      }
      cardio = base;
    }
    return { ...d, cardio };
  }

  function normalizeCoachWorkoutEnvelope(parsed: any): any {
    if (!parsed || typeof parsed !== "object") return parsed;
    const inner = parsed.schedule;
    if (!Array.isArray(inner)) return { ...parsed, schedule: inner };
    return { ...parsed, schedule: inner.map(normalizeCoachWorkoutDay) };
  }

  const coachExerciseKeyCache = new Map<string, { key: string; name: string } | null>();
  const COACH_EXERCISE_NAME_ALIASES: Record<string, string[]> = {
    kniebeugen: ["back squat", "barbell squat", "squat"],
    kniebeuge: ["back squat", "barbell squat", "squat"],
    ausfallschritte: ["lunge", "walking lunge"],
    rudern: ["row", "seated row"],
    bankdrucken: ["bench press", "barbell bench press", "dumbbell bench press"],
    schulterdrucken: ["shoulder press", "overhead press"],
    kreuzheben: ["deadlift", "romanian deadlift"],
    klimmzuge: ["pull up", "chin up"],
    liegestutze: ["push up"],
  };

  function normalizeCoachExerciseSearchText(v: string): string {
    return String(v || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/["'`]/g, "")
      .replace(/\([^)]*\)/g, " ")
      .replace(/[^a-z0-9\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isCoachMainExercise(row: Record<string, unknown>): boolean {
    const setType = String(row.setType || "").toLowerCase();
    if (setType === "warmup" || setType === "cooldown") return false;
    const text = normalizeCoachExerciseSearchText(`${row.name || ""} ${row.notes || ""}`);
    return !/(warm ?up|aufwarm|cool ?down|abwarm|mobility|stretch|activation)/.test(text);
  }

  function coachExerciseSearchCandidates(name: string): string[] {
    const clean = normalizeCoachExerciseSearchText(name);
    if (!clean) return [];
    const out: string[] = [];
    out.push(clean);
    const noSuffix = clean
      .replace(/\b(mit|with)\b.*$/, "")
      .replace(/\b(barbell|dumbbell|kettlebell)\b/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (noSuffix && noSuffix !== clean) out.push(noSuffix);
    const alias = COACH_EXERCISE_NAME_ALIASES[noSuffix] || COACH_EXERCISE_NAME_ALIASES[clean];
    if (alias?.length) out.push(...alias);
    return [...new Set(out)].filter(Boolean);
  }

  async function resolveCoachExerciseKey(name: string): Promise<{ key: string; name: string } | null> {
    const base = normalizeCoachExerciseSearchText(name);
    if (!base) return null;
    if (coachExerciseKeyCache.has(base)) return coachExerciseKeyCache.get(base) || null;
    const candidates = coachExerciseSearchCandidates(name);
    for (const q of candidates) {
      const hits = await searchExerciseDbCatalog({ query: q, limit: 8 });
      if (!hits.length) continue;
      const best =
        hits.find((h) => normalizeCoachExerciseSearchText(h.name) === normalizeCoachExerciseSearchText(q)) ||
        hits.find((h) => normalizeCoachExerciseSearchText(h.name).includes(normalizeCoachExerciseSearchText(q))) ||
        hits[0];
      const resolved = best ? { key: best.key, name: best.name } : null;
      if (resolved) {
        coachExerciseKeyCache.set(base, resolved);
        return resolved;
      }
    }
    coachExerciseKeyCache.set(base, null);
    return null;
  }

  async function fallbackCoachMainExercise(
    day: Record<string, unknown>,
    row: Record<string, unknown>,
  ): Promise<{ key: string; name: string } | null> {
    const sessionType = normalizeCoachExerciseSearchText(String(day.sessionType || ""));
    const title = normalizeCoachExerciseSearchText(String(day.title || ""));
    const rowName = normalizeCoachExerciseSearchText(String(row.name || ""));
    const hints = `${sessionType} ${title} ${rowName}`.trim();
    const queries = /(cardio|interval|run|bike|row|endurance)/.test(hints)
      ? ["treadmill run", "stationary bike", "rowing machine"]
      : ["back squat", "bench press", "lat pulldown", "dumbbell row", "plank"];
    for (const q of queries) {
      const hits = await searchExerciseDbCatalog({ query: q, limit: 5 });
      if (!hits.length) continue;
      return { key: hits[0].key, name: hits[0].name };
    }
    return null;
  }

  function mergeCoachTextSection(base: unknown, details: string[]): string {
    const parts: string[] = [];
    const baseText = String(base || "").trim();
    if (baseText) parts.push(baseText);
    for (const d of details) {
      const t = String(d || "").trim();
      if (t) parts.push(t);
    }
    return parts.join("\n\n").trim();
  }

  async function ensureCoachMainExercisesUseExerciseDb(week: CoachWorkoutWeek): Promise<CoachWorkoutWeek> {
    const next: CoachWorkoutWeek = { ...week, schedule: [] as any };
    let resolvedCount = 0;
    let fallbackCount = 0;
    let removedWarmupCooldownRows = 0;
    for (const day of week.schedule || []) {
      if (!Array.isArray(day.exercises) || day.isRest) {
        (next.schedule as any).push({ ...(day as any) });
        continue;
      }
      const nextDay: any = { ...day };
      // Strukturierte Warmups/Cooldowns behalten (Prompt + resolveCoachPhaseExerciseRows).
      // Nur Übungen ohne Katalog-Key, die fälschlich in exercises[] landeten, als Text-Hinweis mergen.
      const warmupText: string[] = [];
      const cooldownText: string[] = [];
      const mainExercises: Record<string, unknown>[] = [];
      for (const rowAny of day.exercises as any[]) {
        const row = { ...(rowAny as Record<string, unknown>) };
        const key = typeof row.exerciseKey === "string" ? row.exerciseKey.trim() : "";
        if (!isCoachMainExercise(row)) {
          const setType = String(row.setType || "").toLowerCase();
          const line = `- ${String(row.name || "Drill")} ${String(row.notes || "").trim()}`.trim();
          if (setType === "cooldown" || /cool ?down|abwarm|stretch/.test(normalizeCoachExerciseSearchText(line))) {
            cooldownText.push(line);
          } else {
            warmupText.push(line);
          }
          removedWarmupCooldownRows += 1;
          continue;
        }
        if (!key) {
          const aiName = String(row.name || "");
          const resolved = await resolveCoachExerciseKey(aiName);
          if (resolved) {
            row.exerciseKey = resolved.key;
            row.name = pickCoachExerciseNameAfterResolve(aiName, resolved.name);
            resolvedCount += 1;
          } else {
            const fb = await fallbackCoachMainExercise(day as Record<string, unknown>, row);
            if (fb) {
              row.exerciseKey = fb.key;
              row.name = pickCoachExerciseNameAfterResolve(aiName, fb.name);
              fallbackCount += 1;
            }
          }
        }
        // Übung immer behalten. Ohne Katalog-Key bleibt sie als reine Namenszeile stehen:
        // fehlt der ExerciseDB-Zugang (oder ist der Name nicht im Katalog), darf das
        // nicht die ganze Einheit leeren — sonst bekommt der Nutzer einen Plan ohne Inhalt.
        mainExercises.push(row);
      }
      nextDay.exercises = mainExercises;

      // Bestehende warmupExercises/cooldownExercises behalten; optional Keys resolven
      if (Array.isArray(nextDay.warmupExercises) && nextDay.warmupExercises.length) {
        nextDay.warmupExercises = nextDay.warmupExercises.map((ex: Record<string, unknown>) => ({
          ...ex,
          setType: ex.setType || "warmup",
        }));
      } else if (warmupText.length) {
        nextDay.warmup = mergeCoachTextSection(
          nextDay.warmup,
          [
            "Coach Warm-up Hinweise:",
            ...warmupText,
            "Fokus: kontrolliertes Tempo, saubere Technik, Atmung ruhig halten.",
          ],
        );
      }
      if (Array.isArray(nextDay.cooldownExercises) && nextDay.cooldownExercises.length) {
        nextDay.cooldownExercises = nextDay.cooldownExercises.map((ex: Record<string, unknown>) => ({
          ...ex,
          setType: ex.setType || "normal",
        }));
      } else if (cooldownText.length) {
        nextDay.cooldown = mergeCoachTextSection(
          nextDay.cooldown,
          [
            "Coach Cool-down Hinweise:",
            ...cooldownText,
            "Fokus: Puls langsam senken, entspannt atmen, Bewegungen ohne Schmerz.",
          ],
        );
      }
      (next.schedule as any).push(nextDay);
    }
    if (resolvedCount > 0 || fallbackCount > 0 || removedWarmupCooldownRows > 0) {
      next.applied_constraints = [
        ...(Array.isArray(next.applied_constraints) ? next.applied_constraints : []),
        `repaired:exercise_db_key_resolved_count=${resolvedCount}`,
        `repaired:exercise_db_fallback_count=${fallbackCount}`,
        `repaired:warmup_cooldown_text_only_rows=${removedWarmupCooldownRows}`,
      ].slice(0, 8);
    }
    return next;
  }

  async function finalizeCoachWeekWithExerciseDb(
    week: CoachWorkoutWeek,
    uiLocale: "de" | "en",
  ): Promise<CoachWorkoutWeek> {
    const keyed = await ensureCoachMainExercisesUseExerciseDb(week);
    return applyGermanNamesToCoachWorkoutWeek(
      keyed,
      uiLocale,
      (prompt) => callCoachAi([{ role: "user", content: prompt }], "coach_workout"),
      exerciseNameLocalizationStore,
    );
  }

  function coachWeekNeedsGermanLocalization(week: CoachWorkoutWeek): boolean {
    for (const day of week.schedule || []) {
      if (day.isRest || !Array.isArray(day.exercises)) continue;
      for (const ex of day.exercises) {
        if (!ex || typeof ex !== "object") continue;
        const row = ex as { exerciseKey?: string; name?: string };
        const key = typeof row.exerciseKey === "string" ? row.exerciseKey.trim() : "";
        const name = String(row.name || "").trim();
        if (key && name && !looksGermanExerciseName(name)) return true;
      }
    }
    return false;
  }

  async function hydrateCoachScheduleJsonForLocale(
    scheduleJson: unknown,
    uiLocale: "de" | "en",
    opts?: { planId?: string; weekNumber?: number; allowAiBackfill?: boolean },
  ): Promise<unknown> {
    if (uiLocale !== "de" || !scheduleJson || typeof scheduleJson !== "object") return scheduleJson;
    const week = scheduleJson as CoachWorkoutWeek;
    if (!Array.isArray(week.schedule)) return scheduleJson;

    const before = JSON.stringify(week.schedule);
    let out = await applyDbGermanNamesToCoachWorkoutWeek(week, exerciseNameLocalizationStore);

    if (opts?.allowAiBackfill && coachWeekNeedsGermanLocalization(out)) {
      out = await applyGermanNamesToCoachWorkoutWeek(
        out,
        "de",
        (prompt) => callCoachAi([{ role: "user", content: prompt }], "coach_workout"),
        exerciseNameLocalizationStore,
      );
    }

    const after = JSON.stringify(out.schedule);
    if (opts?.planId && opts.weekNumber != null && after !== before) {
      await pool.query(
        "UPDATE coach_weekly_schedules SET schedule=$3 WHERE plan_id=$1 AND week_number=$2",
        [opts.planId, opts.weekNumber, JSON.stringify(out)],
      );
    }
    return out;
  }

  function buildWorkoutPrompt(
    plan: any,
    weekNumber: number,
    lastReport?: any,
    startDayName?: string,
    userContext?: unknown,
    repairHint?: string,
    exerciseCatalogText?: string,
    uiLocale: "de" | "en" = "de",
  ): string {
    const ob = parseCoachOnboarding(plan.onboarding_data);
    const weeksUntilEvent = plan.event_date
      ? Math.round((new Date(plan.event_date).getTime() - Date.now()) / (7 * 24 * 3600 * 1000))
      : null;
    const isTaper = weeksUntilEvent !== null && weeksUntilEvent <= 2;

    const adaptationBlock = buildAdaptationBlockFromReport(lastReport, weekNumber);

    const avail = Array.isArray(ob.availableTrainingDays) && ob.availableTrainingDays.length
      ? ob.availableTrainingDays.join(", ")
      : "Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday (no restriction — athlete did not specify)";
    const allowDoubles = ob.allowDoubleSessions !== false;
    const slotPlan = resolveTrainingSlotPlanFromOnboarding(ob, startDayName);
    const volumeText = formatSessionVolumeForPrompt(ob, slotPlan, {
      partialWeekStartDay: startDayName,
    });
    const slotBlock = slotPlan
      ? `\n- **Session distribution (MANDATORY):** ${formatExtendedSlotPlanForPrompt(slotPlan)}`
      : "";

    const volumeBlock = `\n${volumeText}${slotBlock}`;

    const ctxBlock =
      userContext != null
        ? `

USER_CONTEXT_JSON (machine-readable — honor constraints_input.available_weekdays_en / injuries_plain / rolling stats):
${JSON.stringify(userContext, null, 2)}
`
        : "";

    const repairBlock = repairHint
      ? `

VALIDATOR / SCHEMA REPAIR — address this precisely; output ONLY valid JSON:
${repairHint}
`
      : "";

    const exerciseDbBlock = `

ALLOWED EXERCISE KEYS (set exercises[].exerciseKey when possible — ONLY keys from this list, format edb_<id>):
${exerciseCatalogText ?? formatExerciseDbForCoachPrompt()}

STRICT FORMAT RULES:
- Main workout block (schedule[].exercises) MUST contain only ExerciseDB-backed exercises with valid exerciseKey.
- Prefer structured "warmupExercises" / "cooldownExercises" arrays (name, sets, reps, notes; exerciseKey when in catalog).
- Legacy plain-text warmup/cooldown strings are allowed only as short cues — do not dump mobility circuits as free prose only.
`;

    const equipmentList = Array.isArray(ob.equipment) ? (ob.equipment as string[]) : [];
    const benchmarkBlock = formatBenchmarksForCoachPrompt({
      benchmarks: (ob.benchmarks || {}) as Record<string, string>,
      equipment: equipmentList,
      trainingStyle: String(ob.trainingStyle || "hybrid"),
      fitnessLevel: String(ob.fitnessLevel || "intermediate"),
      weekNumber,
      locale: uiLocale,
    });

    const athleteProfile = `- Age: ${ob.age}, Gender: ${ob.gender}
- Fitness Level: ${ob.fitnessLevel || "intermediate"} (honor for exercise selection; loads must follow benchmarks when provided)
- Training style: ${ob.trainingStyle || "strength"}, Vibe: ${ob.workoutVibe || "classic_lifting"}
- Sports: ${joinCoachList(ob.sports, "n/a")}
${volumeBlock}
- **Available training weekdays** (sessions may ONLY fall on these days; all other calendar weekdays MUST be isRest=true): ${avail}
- **Two-a-days:** ${allowDoubles ? "ALLOWED — if the athlete needs slightly more weekly load but has few available days, you MAY output TWO separate sessions on the SAME weekday (two objects with the same \"day\"), e.g. \"Morning easy\" + \"Evening quality\". Keep recovery realistic." : "NOT allowed — at most ONE non-rest session per weekday."}
- Equipment (STRICT — never prescribe exercises needing gear not listed): ${formatCoachEquipmentForPrompt(equipmentList)}
- Injuries/limitations: ${ob.injuries || "none"}
- Benchmarks / performance data:
${benchmarkBlock}
- Extra wishes: ${ob.extraWishes || "none"}`;

    const planConfiguration = `- Discipline: ${plan.discipline}
- Mode: ${plan.plan_mode === "event" ? "Event-based" : "Ongoing"}
${plan.plan_mode === "event" ? `- Event: ${plan.event_name} | ${plan.event_distance || ""} | Date: ${plan.event_date} | Weeks remaining: ${weeksUntilEvent}` : ""}
${isTaper ? "⚠️ TAPER WEEK: Reduce volume by 40-50%, maintain intensity. Focus on recovery. Short, sharp sessions only." : ""}`;

    const stateBlock =
      userContext != null && typeof userContext === "object" && (userContext as any).coach_plan_state
        ? `\nPERIODIZATION STATE: ${JSON.stringify((userContext as any).coach_plan_state)}`
        : "";

    const weekBlock =
      weekNumber === 1
        ? `THIS IS WEEK 1 — BASELINE / DISCOVERY WEEK:
Primary goal: collect safe baseline data to calibrate week 2+, NOT to push maximal performance.
- Strength without benchmarks: RPE 6–8, conservative estimated loads (%BW or light DB/KB), clear logging fields — NO %1RM prescriptions.
- Cardio without run benchmarks: easy conversational runs (20–40 min), athlete logs time/distance/RPE — NO fixed race paces like 5:30/km.
- When benchmarks ARE provided above: use them directly for loads/paces (respect fitness level + bodyweight).
- Keep overall volume ~60–70% of a normal week; technique and repeatability over intensity.
- Title discovery sessions clearly (e.g. "Ausdauer-Check", "Kraft-Baseline").
${startDayName ? `TODAY IS ${startDayName.toUpperCase()}. This is a PARTIAL first week. Only schedule sessions from ${startDayName} onwards (do NOT create sessions for days before today in the calendar sense). Days before ${startDayName} in the same Mon–Sun list should be Rest. Still output the usual Mon–Sun ordering in the JSON array (or additional same-day sessions where allowed).` : ""}`
        : `This is Week ${weekNumber}. Apply progression and the adaptations above.${stateBlock}${
            userContext != null &&
            typeof userContext === "object" &&
            Array.isArray((userContext as any).prior_week_exercise_keys) &&
            (userContext as any).prior_week_exercise_keys.length
              ? `\nEXERCISE CONTINUITY (MANDATORY): Reuse these exerciseKeys from last week for primary lifts when equipment/injury still allow: ${((userContext as any).prior_week_exercise_keys as string[]).slice(0, 16).join(", ")}. Rotate accessories only.`
              : ""
          }`;

    return buildCoachWorkoutWeekPrompt({
      discipline: String(ob.discipline || plan.discipline),
      weekNumber: String(weekNumber),
      athleteProfile,
      adaptationBlock,
      planConfiguration,
      weekBlock,
      userContextBlock: ctxBlock,
      exerciseDbBlock,
      repairBlock,
      outputLanguage: coachOutputLanguageForLocale(uiLocale === "en" ? "en" : "de"),
    });
  }

  function buildNutritionPrompt(
    plan: any,
    weekNumber: number,
    lastReport?: any,
    userContext?: unknown,
    repairHint?: string,
  ): string {
    const ob = parseCoachOnboarding(plan.onboarding_data);
    const mealSchedule = resolveNutritionMealSchedule(ob);
    const mealScheduleBlock = formatMealScheduleForCoachPrompt(mealSchedule);
    const scheduledDays = new Set(mealSchedule.map((d) => d.day));

    const ctxBlock =
      userContext != null
        ? `

USER_CONTEXT_JSON:
${JSON.stringify(userContext, null, 2)}
`
        : "";

    const repairBlock = repairHint
      ? `

VALIDATOR / SCHEMA REPAIR — address precisely; output ONLY valid JSON:
${repairHint}
`
      : "";

    const adaptationBlock = lastReport
      ? `${buildAdaptationBlockFromReport(lastReport, weekNumber)}

→ ADJUST dailyTargets and meal portions using nutritionMacroMultiplier from USER_CONTEXT_JSON coach_plan_state if present.`
      : "";

    const athleteProfile = `- Age: ${ob.age}, Gender: ${ob.gender}, Weight: ${ob.weight}kg, Height: ${ob.height}cm
- Goal: ${ob.nutritionGoal}
- Activity level: ${ob.activityLevel}
- Dietary restrictions: ${joinCoachList(ob.restrictions)}
- Allergies: ${ob.allergies || "none"}
- Cooking time: ${ob.cookingTime}
- Food preferences: ${ob.foodPreferences || "varied"}
- Budget: ${ob.budget || "medium"}`;

    const weekIntro = `This is Week ${weekNumber}. ${weekNumber === 1 ? "Establish baseline targets." : "Adjust macros and meal structure based on feedback above."}`;

    return buildCoachNutritionWeekPrompt({
      weekNumber: String(weekNumber),
      athleteProfile,
      mealScheduleBlock,
      adaptationBlock,
      weekIntro,
      userContextBlock: ctxBlock,
      repairBlock,
      scheduledWeekdays: [...scheduledDays].join(", ") || "see schedule above",
    });
  }

  function buildReportPrompt(
    plan: any,
    schedule: any,
    completedWorkouts: any[],
    nutritionEntries: any[],
    prevReport?: any,
    uiLocale: "de" | "en" = "de",
  ): string {
    const ob = parseCoachOnboarding(plan.onboarding_data);
    const workoutSummary = completedWorkouts.length > 0
      ? completedWorkouts.map(w => `- ${w.date}: ${w.name} (${w.duration}min, ${w.calories_burned}kcal)`).join("\n")
      : "No workouts logged this week.";
    const nutritionSummary = nutritionEntries.length > 0
      ? `Total entries: ${nutritionEntries.length}, Avg calories: ${Math.round(nutritionEntries.reduce((s: number, e: any) => s + Number(e.calories), 0) / Math.max(1, nutritionEntries.length))}kcal`
      : "No nutrition logged this week.";

    const prevWeekComparison = prevReport ? `
COMPARISON WITH WEEK ${plan.current_week - 1}:
- Last week's rating: ${prevReport.overallRating}/10
- Last week's completion: ${prevReport.completionRate}%
- Last week's coach message: "${prevReport.coachMessage?.substring(0, 200)}..."
- What was planned to change: ${(prevReport.nextWeekChanges || []).join("; ")}
- Did those changes happen? Evaluate honestly in your report.` : "";

    return buildCoachWeeklyReportPrompt({
      athleteSummary: `${ob.age}y ${ob.gender}, Level: ${ob.fitnessLevel || ob.activityLevel}, Discipline: ${plan.discipline || ob.nutritionGoal}`,
      currentWeek: String(plan.current_week),
      planMode: String(plan.plan_mode),
      prevWeekComparison,
      plannedScheduleJson: JSON.stringify(
        schedule?.schedule?.map((d: any) => ({
          day: d.day,
          type: d.sessionType || d.meals?.length,
          title: d.title,
          duration: d.estimatedDuration,
        })),
        null,
        2,
      ),
      workoutSummary,
      nutritionSummary,
      outputLanguage: coachOutputLanguageForLocale(uiLocale === "en" ? "en" : "de"),
    });
  }

  // ── Coach: Plans ──────────────────────────────────────────────────────────

  app.get("/api/exercise-name-localizations", requireAuth, async (_req: AuthRequest, res) => {
    try {
      const r = await pool.query(
        "SELECT exercise_key, name_de FROM exercise_name_localizations ORDER BY updated_at DESC LIMIT 5000",
      );
      const names: Record<string, string> = {};
      for (const row of r.rows) {
        const key = String(row.exercise_key || "").trim();
        const de = String(row.name_de || "").trim();
        if (key && de) names[key] = de;
      }
      res.json({ names });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load localizations";
      res.status(500).json({ error: msg });
    }
  });

  app.get("/api/coach/plans", requireAuth, async (req: AuthRequest, res) => {
    const uiLocale = await getUserUiLocale(req.userId!);
    const plans = await pool.query(
      `SELECT p.*,
              (SELECT row_to_json(s) FROM coach_weekly_schedules s WHERE s.plan_id=p.id AND s.week_number=p.current_week LIMIT 1) AS current_schedule,
              (SELECT row_to_json(r) FROM coach_weekly_reports r WHERE r.plan_id=p.id ORDER BY r.week_number DESC LIMIT 1) AS latest_report
       FROM coach_plans p WHERE p.user_id=$1 ORDER BY p.created_at DESC`,
      [req.userId]
    );
    const rows = await Promise.all(
      plans.rows.map(async (p) => {
        if (p.type !== "workout" || !p.current_schedule?.schedule) return p;
        const wn = Number(p.current_schedule.week_number ?? p.current_week ?? 1);
        const hydrated = await hydrateCoachScheduleJsonForLocale(p.current_schedule.schedule, uiLocale, {
          planId: p.id,
          weekNumber: wn,
          allowAiBackfill: p.status === "active",
        });
        return {
          ...p,
          current_schedule: {
            ...p.current_schedule,
            schedule: hydrated,
          },
        };
      }),
    );
    res.json(rows);
  });

  app.get("/api/coach/plans/:id", requireAuth, async (req: AuthRequest, res) => {
    const uiLocale = await getUserUiLocale(req.userId!);
    const plan = await pool.query("SELECT * FROM coach_plans WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
    if (!plan.rows.length) { res.status(404).json({ error: "Not found" }); return; }
    const schedules = await pool.query("SELECT * FROM coach_weekly_schedules WHERE plan_id=$1 ORDER BY week_number", [req.params.id]);
    const reports = await pool.query("SELECT * FROM coach_weekly_reports WHERE plan_id=$1 ORDER BY week_number DESC", [req.params.id]);
    const hydratedSchedules =
      plan.rows[0].type === "workout"
        ? await Promise.all(
            schedules.rows.map(async (s) => ({
              ...s,
              schedule: await hydrateCoachScheduleJsonForLocale(s.schedule, uiLocale, {
                planId: req.params.id,
                weekNumber: Number(s.week_number),
                allowAiBackfill: true,
              }),
            })),
          )
        : schedules.rows;
    res.json({ ...plan.rows[0], schedules: hydratedSchedules, reports: reports.rows });
  });

  const setCoachGenerationPhase = async (planId: string, phase: string) => {
    await pool.query(
      "UPDATE coach_plans SET generation_phase=$2, updated_at=NOW() WHERE id=$1",
      [planId, phase],
    );
  };

  app.get("/api/coach/plans/:id/generation", requireAuth, async (req: AuthRequest, res) => {
    const plan = await pool.query(
      "SELECT generation_status, generation_error, generation_phase FROM coach_plans WHERE id=$1 AND user_id=$2",
      [req.params.id, req.userId],
    );
    if (!plan.rows.length) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const sched = await pool.query(
      "SELECT 1 FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=1 LIMIT 1",
      [req.params.id],
    );
    let status = String(plan.rows[0].generation_status || "ready");
    let phase = String(plan.rows[0].generation_phase || "queued");
    if (status === "generating" && sched.rows.length > 0) {
      status = "ready";
      phase = "ready";
      await pool.query(
        "UPDATE coach_plans SET generation_status='ready', generation_error=NULL, generation_phase='ready', updated_at=NOW() WHERE id=$1",
        [req.params.id],
      );
      // Nur ein aktiver Plan pro Typ: fruehere Plaene desselben Typs pausieren.
      await pool.query(
        `UPDATE coach_plans SET status='paused', updated_at=NOW()
          WHERE user_id=$1 AND type=(SELECT type FROM coach_plans WHERE id=$2)
            AND id<>$2 AND status='active'`,
        [req.userId, req.params.id],
      );
    }
    res.json({ status, phase, error: plan.rows[0].generation_error ?? null });
  });

  app.post("/api/coach/plans/:id/cancel-generation", requireAuth, async (req: AuthRequest, res) => {
    try {
      const plan = await pool.query(
        "SELECT id, generation_status FROM coach_plans WHERE id=$1 AND user_id=$2",
        [req.params.id, req.userId],
      );
      if (!plan.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const genStatus = String(plan.rows[0].generation_status || "");
      if (genStatus !== "generating" && genStatus !== "failed") {
        res.status(400).json({ error: "Plan is not being generated" });
        return;
      }
      await pool.query("DELETE FROM coach_weekly_schedules WHERE plan_id=$1", [req.params.id]);
      await pool.query("DELETE FROM coach_weekly_reports WHERE plan_id=$1", [req.params.id]);
      await pool.query("DELETE FROM coach_ai_runs WHERE plan_id=$1", [req.params.id]);
      await pool.query("DELETE FROM coach_plans WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  function extractPriorExerciseKeysFromScheduleJson(scheduleJson: unknown): string[] {
    const week = scheduleJson as { schedule?: Array<{ exercises?: Array<{ exerciseKey?: string }> }> } | null;
    if (!week || !Array.isArray(week.schedule)) return [];
    const keys: string[] = [];
    for (const day of week.schedule) {
      if (!Array.isArray(day.exercises)) continue;
      for (const ex of day.exercises) {
        const k = typeof ex?.exerciseKey === "string" ? ex.exerciseKey.trim() : "";
        if (k) keys.push(k);
      }
    }
    return [...new Set(keys)].slice(0, 24);
  }

  function coachPipelinePostArgs(
    userCtx: Record<string, unknown>,
    ob: Record<string, unknown>,
    priorExerciseKeys?: string[],
  ) {
    const rolling = (userCtx.rolling || {}) as Record<string, unknown>;
    const recentWorkouts = Array.isArray(rolling.strength_load_workouts)
      ? (rolling.strength_load_workouts as any[])
      : [];
    const directive = userCtx.latest_week_directive as { volumeMultiplier?: number } | null | undefined;
    const planState = userCtx.coach_plan_state as { volumeMultiplier?: number } | null | undefined;
    const volumeMultiplier =
      Number(directive?.volumeMultiplier) ||
      Number(planState?.volumeMultiplier) ||
      1;
    const sports = Array.isArray(ob.sports) ? (ob.sports as string[]) : [];
    return {
      recentWorkouts,
      volumeMultiplier,
      sports,
      priorExerciseKeys: priorExerciseKeys?.length ? priorExerciseKeys : undefined,
    };
  }

  const runCoachFirstWeekGeneration = async (args: {
    userId: number;
    plan: { id: string; onboarding_data: unknown };
    type: string;
    discipline: string;
    startDateStr: string;
    isPartialWeek: boolean;
    targetDayName: string;
  }) => {
    const t0 = Date.now();
    const { plan, type, userId, discipline, startDateStr, isPartialWeek, targetDayName } = args;
    const maxCoachWorkoutRetries = Math.min(
      5,
      Math.max(1, Number(process.env.COACH_WORKOUT_MAX_RETRIES) || 3),
    );
    try {
      await setCoachGenerationPhase(plan.id, "context");
      const tContext = Date.now();
      const uiLocale = await getUserUiLocale(userId);
      const [userCtx, exerciseCatalog] = await Promise.all([
        buildUserContextForCoach({
          pool,
          userId,
          plan: {
            id: plan.id,
            onboarding_data: parseCoachOnboarding(plan.onboarding_data) as Record<string, unknown>,
          },
          scheduleWindow: { startYmd: startDateStr },
          partialWeekStartDay: isPartialWeek ? targetDayName : undefined,
        }),
        type === "nutrition" ? Promise.resolve("") : formatExerciseDbForCoachPromptAsync(),
      ]);
      console.log(
        `[coach-gen] plan=${plan.id} context+catalog ms=${Date.now() - tContext} catalogChars=${exerciseCatalog.length}`,
      );

      const planOb = { ...plan, onboarding_data: parseCoachOnboarding(plan.onboarding_data) };
      const ob = planOb.onboarding_data as Record<string, unknown>;
      const constraints = workoutConstraintsFromOnboarding(ob, {
        partialWeekStartDay: isPartialWeek ? targetDayName : undefined,
        weekNumber: 1,
      });

      let schedule: unknown;
      let rawLast = "";
      let retries = 0;

      await setCoachGenerationPhase(plan.id, "ai");

      if (type === "nutrition") {
        const gen = await generateCoachNutritionWeekWithPipeline({
          buildPrompt: (hint) => buildNutritionPrompt(planOb, 1, undefined, userCtx, hint),
          callAi: (msgs) => callCoachAi(msgs, "coach_nutrition"),
        });
        schedule = gen.week;
        rawLast = gen.rawLast;
        retries = gen.retries;
      } else {
        let aiAttempt = 0;
        const gen = await generateCoachWorkoutWeekWithPipeline({
          buildPrompt: (hint) =>
            buildWorkoutPrompt(
              planOb,
              1,
              undefined,
              isPartialWeek ? targetDayName : undefined,
              userCtx,
              hint,
              exerciseCatalog,
              uiLocale,
            ),
          callAi: async (msgs) => {
            aiAttempt += 1;
            await setCoachGenerationPhase(
              plan.id,
              aiAttempt > 1 ? `ai:${aiAttempt}` : "ai",
            );
            const aiT = Date.now();
            const raw = await callCoachAi(msgs, "coach_workout");
            console.log(
              `[coach-gen] plan=${plan.id} ai attempt=${aiAttempt}/${maxCoachWorkoutRetries} ms=${Date.now() - aiT} rawChars=${raw.length}`,
            );
            return raw;
          },
          constraints,
          normalizeEnvelope: normalizeCoachWorkoutEnvelope,
          maxRetries: maxCoachWorkoutRetries,
          ...coachPipelinePostArgs(userCtx as Record<string, unknown>, ob),
        });
        const keyedWeek = await finalizeCoachWeekWithExerciseDb(gen.week as CoachWorkoutWeek, uiLocale);
        schedule = {
          ...finalizeCoachWorkoutWeek(keyedWeek, {
            partialFirstActiveDay: isPartialWeek ? targetDayName : undefined,
          }),
          contentLocale: uiLocale,
        };
        rawLast = gen.rawLast;
        retries = gen.retries;
      }

      await setCoachGenerationPhase(plan.id, "validation");
      await setCoachGenerationPhase(plan.id, "saving");

      await pool.query(
        "INSERT INTO coach_weekly_schedules (plan_id,week_number,start_date,schedule) VALUES ($1,1,$2,$3) ON CONFLICT (plan_id,week_number) DO UPDATE SET start_date=$2, schedule=$3",
        [plan.id, startDateStr, JSON.stringify(schedule)],
      );

      await logCoachAiRun(pool, {
        userId,
        planId: plan.id,
        weekNumber: 1,
        endpoint: "POST /api/coach/plans (async)",
        inputSummary: { type, discipline },
        rawResponse: rawLast.slice(0, 120_000),
        zodOk: true,
        constraintsOk: true,
        retries,
        latencyMs: Date.now() - t0,
        finalScheduleHash: coachPayloadHash(schedule),
        errorMessage: null,
      });

      await pool.query(
        "UPDATE coach_plans SET generation_status='ready', generation_error=NULL, generation_phase='ready', updated_at=NOW() WHERE id=$1",
        [plan.id],
      );
      console.log(
        `[coach-gen] plan=${plan.id} ready totalMs=${Date.now() - t0} aiRetries=${retries}`,
      );
    } catch (e: unknown) {
      const latencyMs = Date.now() - t0;
      const cErr = e instanceof CoachGenerationError ? e : null;
      const errMsg =
        cErr != null
          ? formatCoachGenerationErrorMessage(cErr)
          : e instanceof Error
            ? e.message
            : String(e);
      await logCoachAiRun(pool, {
        userId,
        planId: plan.id,
        weekNumber: 1,
        endpoint: "POST /api/coach/plans (async)",
        inputSummary: { type, discipline },
        rawResponse: cErr?.detail.lastRaw?.slice(0, 120_000) ?? null,
        zodOk: false,
        constraintsOk: cErr ? cErr.detail.constraintViolations.length === 0 : false,
        retries: 5,
        latencyMs,
        finalScheduleHash: null,
        errorMessage: errMsg,
      });
      await pool.query(
        "UPDATE coach_plans SET generation_status='failed', generation_error=$2, generation_phase='failed', updated_at=NOW() WHERE id=$1",
        [plan.id, errMsg.slice(0, 2000)],
      );
      console.error("coach/plans async generation failed:", e);
    }
  };

  app.post("/api/coach/plans", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein gültiger API-Key)." });
        return;
      }
      const { type, discipline, eventName, eventDate, eventDistance, onboardingData } = req.body;
      // planMode ist Pflicht in der DB: aus dem Onboarding uebernehmen, sonst "ongoing".
      const planMode = String(req.body?.planMode ?? onboardingData?.planMode ?? "ongoing");

      const planResult = await pool.query(
        `INSERT INTO coach_plans (user_id,type,discipline,plan_mode,event_name,event_date,event_distance,onboarding_data,generation_status,coach_plan_state,name,current_week)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'generating',$9,$10,1) RETURNING *`,
        [req.userId, type, discipline, planMode, eventName, eventDate || null, eventDistance, JSON.stringify(onboardingData),
         JSON.stringify(DEFAULT_COACH_PLAN_STATE), sinnvollerPlanName(type, discipline, { weeks: Number(onboardingData?.weeks) || undefined })],
      );
      const plan = planResult.rows[0];

      const today = new Date();
      let targetDate = new Date(today);
      if (onboardingData?.startDate === 'tomorrow') {
        targetDate.setDate(targetDate.getDate() + 1);
      } else if (onboardingData?.startDate === 'next_monday') {
        const daysUntilMonday = (8 - targetDate.getDay()) % 7;
        targetDate.setDate(targetDate.getDate() + (daysUntilMonday === 0 ? 7 : daysUntilMonday));
      }

      const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const targetDayName = DAY_NAMES[targetDate.getDay()];
      const actualWeekMonday = calendarWeekMonday(targetDate);
      const isPartialWeek = targetDayName !== "Monday";
      const startDateStr = toLocalYmd(actualWeekMonday);

      await pool.query(
        "UPDATE coach_plans SET generation_phase='queued', updated_at=NOW() WHERE id=$1",
        [plan.id],
      );

      void runCoachFirstWeekGeneration({
        userId: req.userId!,
        plan,
        type,
        discipline,
        startDateStr,
        isPartialWeek,
        targetDayName,
      });

      res.status(202).json({ planId: plan.id, status: "generating", phase: "queued" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create plan";
      console.error("coach/plans POST error:", err);
      res.status(500).json({ error: msg });
    }
  });

  app.patch("/api/coach/plans/:id", requireAuth, async (req: AuthRequest, res) => {
    const { status } = req.body as { status: string };
    await pool.query(
      "UPDATE coach_plans SET status=$2, updated_at=NOW() WHERE id=$1 AND user_id=$3",
      [req.params.id, status, req.userId]
    );
    res.json({ ok: true });
  });

  app.delete("/api/coach/plans/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      // Löschbar sind Pläne, die nicht mehr laufen: pausiert oder abgebrochen.
      // Ein aktiver Plan muss vorher pausiert/beendet werden, damit niemand
      // versehentlich seinen laufenden Plan verliert.
      const check = await pool.query(
        "SELECT status FROM coach_plans WHERE id=$1 AND user_id=$2",
        [req.params.id, req.userId]
      );
      if (!check.rows.length) { res.status(404).json({ error: "Not found" }); return; }
      if (check.rows[0].status === 'active') {
        res.status(400).json({ error: "Aktive Pläne lassen sich nicht löschen. Pausiere den Plan zuerst." });
        return;
      }
      await pool.query("DELETE FROM coach_weekly_schedules WHERE plan_id=$1", [req.params.id]);
      await pool.query("DELETE FROM coach_weekly_reports WHERE plan_id=$1", [req.params.id]);
      await pool.query("DELETE FROM coach_plans WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/coach/plans/:id/regenerate", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein gültiger API-Key)." });
        return;
      }
      const planResult = await pool.query(
        "SELECT * FROM coach_plans WHERE id=$1 AND user_id=$2",
        [req.params.id, req.userId],
      );
      if (!planResult.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      const plan = planResult.rows[0];
      const onboardingData = parseCoachOnboarding(plan.onboarding_data) as Record<string, unknown>;
      const type = String(plan.type || "workout");
      const discipline = String(plan.discipline || "strength");
      const requestedStartDate = req.body?.startDate;
      if (requestedStartDate === "today" || requestedStartDate === "tomorrow" || requestedStartDate === "next_monday") {
        onboardingData.startDate = requestedStartDate;
      }

      const today = new Date();
      const targetDate = new Date(today);
      if (onboardingData?.startDate === "tomorrow") {
        targetDate.setDate(targetDate.getDate() + 1);
      } else if (onboardingData?.startDate === "next_monday") {
        const daysUntilMonday = (8 - targetDate.getDay()) % 7;
        targetDate.setDate(targetDate.getDate() + (daysUntilMonday === 0 ? 7 : daysUntilMonday));
      }

      const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const targetDayName = DAY_NAMES[targetDate.getDay()];
      const actualWeekMonday = calendarWeekMonday(targetDate);
      const isPartialWeek = targetDayName !== "Monday";
      const startDateStr = toLocalYmd(actualWeekMonday);

      await pool.query("DELETE FROM coach_weekly_schedules WHERE plan_id=$1", [plan.id]);
      await pool.query("DELETE FROM coach_weekly_reports WHERE plan_id=$1", [plan.id]);

      await pool.query(
        "UPDATE coach_plans SET current_week=1, generation_status='generating', generation_error=NULL, generation_phase='queued', onboarding_data=$2, updated_at=NOW() WHERE id=$1",
        [plan.id, JSON.stringify(onboardingData)],
      );

      void runCoachFirstWeekGeneration({
        userId: req.userId!,
        plan: { ...plan, onboarding_data: onboardingData },
        type,
        discipline,
        startDateStr,
        isPartialWeek,
        targetDayName,
      });

      res.status(202).json({ planId: plan.id, status: "generating", phase: "queued" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to regenerate plan";
      console.error("coach/plans regenerate error:", err);
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/coach/plans/:id/next-week", requireAuth, async (req: AuthRequest, res) => {
    const t0 = Date.now();
    try {
      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein gültiger API-Key)." });
        return;
      }
      const planResult = await pool.query("SELECT * FROM coach_plans WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
      if (!planResult.rows.length) { res.status(404).json({ error: "Not found" }); return; }
      const plan = planResult.rows[0];

      const nextWeek = plan.current_week + 1;
      const uiLocale = await getUserUiLocale(req.userId!);

      const prevSchedResult = await pool.query(
        "SELECT * FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2",
        [plan.id, plan.current_week],
      );
      const prevRow = prevSchedResult.rows[0];
      const prevStart =
        prevRow?.start_date != null
          ? String(
              prevRow.start_date instanceof Date
                ? prevRow.start_date.toISOString().split("T")[0]
                : prevRow.start_date,
            ).split("T")[0]
          : null;
      const nextStartYmd = prevStart ? addDaysYmd(prevStart, 7) : new Date().toISOString().split("T")[0];

      let lastReport: any = undefined;
      const rep = await pool.query(
        "SELECT report FROM coach_weekly_reports WHERE plan_id=$1 AND week_number=$2",
        [plan.id, plan.current_week],
      );
      if (rep.rows.length) lastReport = rep.rows[0].report;

      const userCtx = await buildUserContextForCoach({
        pool,
        userId: req.userId!,
        plan,
        scheduleWindow: { startYmd: nextStartYmd },
      });

      plan.onboarding_data = parseCoachOnboarding(plan.onboarding_data);
      const ob = plan.onboarding_data as Record<string, unknown>;
      const constraints = workoutConstraintsFromOnboarding(ob, { weekNumber: nextWeek });

      let schedule: any;
      let rawLast = "";
      let retries = 0;
      try {
        if (plan.type === "nutrition") {
          const gen = await generateCoachNutritionWeekWithPipeline({
            buildPrompt: (hint) => buildNutritionPrompt(plan, nextWeek, lastReport, userCtx, hint),
            callAi: (msgs) => callCoachAi(msgs, "coach_nutrition"),
          });
          schedule = gen.week;
          rawLast = gen.rawLast;
          retries = gen.retries;
        } else {
          const exerciseCatalog = await formatExerciseDbForCoachPromptAsync();
          const priorSched = await pool.query(
            `SELECT schedule FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2`,
            [plan.id, nextWeek - 1],
          );
          const priorKeys = extractPriorExerciseKeysFromScheduleJson(priorSched.rows[0]?.schedule);
          (userCtx as Record<string, unknown>).prior_week_exercise_keys = priorKeys;
          const gen = await generateCoachWorkoutWeekWithPipeline({
            buildPrompt: (hint) =>
              buildWorkoutPrompt(plan, nextWeek, lastReport, undefined, userCtx, hint, exerciseCatalog, uiLocale),
            callAi: (msgs) => callCoachAi(msgs, "coach_workout"),
            constraints,
            normalizeEnvelope: normalizeCoachWorkoutEnvelope,
            ...coachPipelinePostArgs(userCtx as Record<string, unknown>, ob, priorKeys),
          });
          const keyedWeek = await finalizeCoachWeekWithExerciseDb(gen.week as CoachWorkoutWeek, uiLocale);
          schedule = { ...finalizeCoachWorkoutWeek(keyedWeek), contentLocale: uiLocale };
          rawLast = gen.rawLast;
          retries = gen.retries;
        }
      } catch (e: any) {
        const cErr = e instanceof CoachGenerationError ? e : null;
        await logCoachAiRun(pool, {
          userId: req.userId!,
          planId: plan.id,
          weekNumber: nextWeek,
          endpoint: "POST /api/coach/plans/:id/next-week",
          inputSummary: { nextWeek, nextStartYmd },
          rawResponse: cErr?.detail.lastRaw?.slice(0, 120_000) ?? null,
          zodOk: false,
          constraintsOk: cErr ? cErr.detail.constraintViolations.length === 0 : false,
          retries: 3,
          latencyMs: Date.now() - t0,
          finalScheduleHash: null,
          errorMessage: e?.message ?? String(e),
        });
        console.error("next-week error:", e);
        res.status(500).json({ error: e.message || "Failed to generate next week" });
        return;
      }

      await pool.query(
        "INSERT INTO coach_weekly_schedules (plan_id,week_number,start_date,schedule) VALUES ($1,$2,$3,$4) ON CONFLICT (plan_id,week_number) DO UPDATE SET schedule=$4",
        [plan.id, nextWeek, nextStartYmd, JSON.stringify(schedule)],
      );
      await pool.query("UPDATE coach_plans SET current_week=$2, updated_at=NOW() WHERE id=$1", [plan.id, nextWeek]);

      await logCoachAiRun(pool, {
        userId: req.userId!,
        planId: plan.id,
        weekNumber: nextWeek,
        endpoint: "POST /api/coach/plans/:id/next-week",
        inputSummary: { nextWeek, nextStartYmd },
        rawResponse: rawLast.slice(0, 120_000),
        zodOk: true,
        constraintsOk: true,
        retries,
        latencyMs: Date.now() - t0,
        finalScheduleHash: coachPayloadHash(schedule),
        errorMessage: null,
      });

      res.json({ weekNumber: nextWeek, schedule });
    } catch (err: any) {
      console.error("next-week error:", err);
      res.status(500).json({ error: err.message || "Failed to generate next week" });
    }
  });

  app.get("/api/coach/plans/:id/week-facts", requireAuth, async (req: AuthRequest, res) => {
    try {
      const planResult = await pool.query("SELECT * FROM coach_plans WHERE id=$1 AND user_id=$2", [
        req.params.id,
        req.userId,
      ]);
      if (!planResult.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const plan = planResult.rows[0];
      const wk = Math.max(
        1,
        parseInt(String(req.query.weekNumber ?? plan.current_week), 10) || plan.current_week,
      );
      const userRow = await pool.query(
        "SELECT measurements, goals, profile_extras FROM users WHERE id=$1",
        [req.userId],
      );
      const u = userRow.rows[0] || {};
      const pe =
        typeof u.profile_extras === "string"
          ? JSON.parse(u.profile_extras || "{}")
          : u.profile_extras || {};
      const profile = {
        goals: u.goals || { dailyCalories: 2400 },
        measurements: u.measurements,
        dailyActivityLog: pe.dailyActivityLog,
      };
      const result = await loadWeekFactsSnapshot({
        pool,
        plan,
        weekNumber: wk,
        userId: req.userId!,
        profile: profile as any,
        onboarding: parseCoachOnboarding(plan.onboarding_data),
      });
      if (!result) {
        res.status(404).json({ error: "No schedule for week" });
        return;
      }
      res.json({ weekNumber: wk, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to load week facts" });
    }
  });

  app.post("/api/coach/plans/:id/weekly-report", requireAuth, async (req: AuthRequest, res) => {
    const t0 = Date.now();
    try {
      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein gültiger API-Key)." });
        return;
      }
      const planResult = await pool.query("SELECT * FROM coach_plans WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
      if (!planResult.rows.length) { res.status(404).json({ error: "Not found" }); return; }
      const plan = planResult.rows[0];
      const uiLocale = await getUserUiLocale(req.userId!);
      const reportWeek = Math.max(
        1,
        parseInt(String((req.body as { weekNumber?: number })?.weekNumber ?? plan.current_week), 10) ||
          plan.current_week,
      );

      const schedResult = await pool.query(
        "SELECT * FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2",
        [plan.id, reportWeek]
      );
      const schedule = schedResult.rows[0];
      if (!schedule) {
        res.status(400).json({ error: "No schedule for current week" });
        return;
      }

      const prevReportResult = await pool.query(
        "SELECT report FROM coach_weekly_reports WHERE plan_id=$1 AND week_number=$2",
        [plan.id, reportWeek - 1]
      );
      const prevReport = prevReportResult.rows[0]?.report ?? null;

      const userRow = await pool.query(
        "SELECT measurements, goals, profile_extras FROM users WHERE id=$1",
        [req.userId],
      );
      const u = userRow.rows[0] || {};
      const pe =
        typeof u.profile_extras === "string"
          ? JSON.parse(u.profile_extras || "{}")
          : u.profile_extras || {};
      const profile = {
        goals: u.goals || { dailyCalories: 2400 },
        measurements: u.measurements,
        dailyActivityLog: pe.dailyActivityLog,
      };

      const { report, rawLast, retries } = await generateCoachWeeklyReport({
        pool,
        plan,
        weekNumber: reportWeek,
        scheduleRow: {
          schedule: schedule.schedule as Record<string, unknown>,
          start_date: schedule.start_date,
        },
        userId: req.userId!,
        profile: profile as any,
        onboarding: parseCoachOnboarding(plan.onboarding_data),
        prevReport,
        uiLocale,
        callAi: (msgs) => callCoachAiForPlan(plan, msgs),
        outputLanguage: coachOutputLanguageForLocale(uiLocale === "en" ? "en" : "de"),
      });

      const z = weeklyReportSchema.safeParse(report);
      if (!z.success) {
        res.status(500).json({ error: "Report validation failed" });
        return;
      }

      await pool.query(
        "INSERT INTO coach_weekly_reports (plan_id,week_number,report) VALUES ($1,$2,$3) ON CONFLICT (plan_id,week_number) DO UPDATE SET report=$3, generated_at=NOW()",
        [plan.id, reportWeek, JSON.stringify(report)]
      );

      await logCoachAiRun(pool, {
        userId: req.userId!,
        planId: plan.id,
        weekNumber: reportWeek,
        endpoint: "POST /api/coach/plans/:id/weekly-report",
        inputSummary: { coachV2: true },
        rawResponse: rawLast.slice(0, 120_000),
        zodOk: true,
        constraintsOk: true,
        retries,
        latencyMs: Date.now() - t0,
        finalScheduleHash: coachPayloadHash(report),
        errorMessage: null,
      });

      res.json(report);
    } catch (err: any) {
      console.error("weekly-report error:", err);
      res.status(500).json({ error: err.message || "Failed to generate report" });
    }
  });

  const coachE2eMockEnabled = () => process.env.COACH_E2E_MOCK === "1";

  app.post("/api/coach/plans/:id/refine-schedule", requireAuth, async (req: AuthRequest, res) => {
    const t0 = Date.now();
    try {
      const { previousValid, userRefinement, weekNumber, refineScope, day } = req.body as {
        previousValid?: unknown;
        userRefinement?: string;
        weekNumber?: number;
        refineScope?: string;
        day?: string;
      };
      if (!previousValid || typeof userRefinement !== "string" || !userRefinement.trim()) {
        res.status(400).json({ error: "previousValid and userRefinement required" });
        return;
      }
      const planResult = await pool.query("SELECT * FROM coach_plans WHERE id=$1 AND user_id=$2", [
        req.params.id,
        req.userId,
      ]);
      if (!planResult.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const plan = planResult.rows[0];
      const wk = Math.max(1, parseInt(String(weekNumber ?? plan.current_week), 10) || plan.current_week);

      const schedResult = await pool.query(
        "SELECT * FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2",
        [plan.id, wk],
      );
      const schedRow = schedResult.rows[0];
      const startYmd =
        schedRow?.start_date != null
          ? String(
              schedRow.start_date instanceof Date
                ? schedRow.start_date.toISOString().split("T")[0]
                : schedRow.start_date,
            ).split("T")[0]
          : new Date().toISOString().split("T")[0];

      if (coachE2eMockEnabled()) {
        const schedule: Record<string, unknown> =
          typeof previousValid === "object" && previousValid != null
            ? { ...(previousValid as Record<string, unknown>) }
            : { schedule: [] };
        const note = `[E2E refine] ${userRefinement.trim()}`;
        schedule.coachNotes = schedule.coachNotes
          ? `${String(schedule.coachNotes)}\n${note}`
          : note;
        await pool.query("UPDATE coach_weekly_schedules SET schedule=$3 WHERE plan_id=$1 AND week_number=$2", [
          req.params.id,
          wk,
          JSON.stringify(schedule),
        ]);
        await logCoachAiRun(pool, {
          userId: req.userId!,
          planId: plan.id,
          weekNumber: wk,
          endpoint: "POST /api/coach/plans/:id/refine-schedule",
          inputSummary: { userRefinement, e2eMock: true },
          rawResponse: null,
          zodOk: true,
          constraintsOk: true,
          retries: 0,
          latencyMs: Date.now() - t0,
          finalScheduleHash: coachPayloadHash(schedule),
          errorMessage: null,
          refinementRound: 1,
        });
        res.json({ weekNumber: wk, schedule, e2eMock: true });
        return;
      }

      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein gültiger API-Key)." });
        return;
      }

      const userCtx = await buildUserContextForCoach({
        pool,
        userId: req.userId!,
        plan,
        scheduleWindow: { startYmd },
      });

      const uiLocale = await getUserUiLocale(req.userId!);
      const baseJson = JSON.stringify(previousValid, null, 2);
      const refinementIntro = `You are editing an ALREADY VALID ${plan.type} week JSON. Make the MINIMAL changes required to satisfy the athlete request. Keep the same top-level schema keys. Output ONLY valid JSON.

OUTPUT LANGUAGE (MANDATORY): ${coachOutputLanguageForLocale(uiLocale)}. Write all user-facing string values in this language. Keep structural enum tokens (day names, sessionType, setType, recommendation codes) in English as in the schema.

ATHLETE REQUEST:
${userRefinement.trim()}
${refineScope === "single_day" && day ? `\nSCOPE: Change ONLY the day "${day}" unless the request explicitly needs other days.` : ""}

CURRENT VALID JSON:
${baseJson}

USER_CONTEXT_JSON:
${JSON.stringify(userCtx, null, 2)}
`;

      plan.onboarding_data = parseCoachOnboarding(plan.onboarding_data);
      const ob = plan.onboarding_data as Record<string, unknown>;
      const constraints = workoutConstraintsFromOnboarding(ob, { weekNumber: wk });

      let schedule: any;
      let rawLast = "";
      let retries = 0;
      try {
        if (plan.type === "nutrition") {
          const gen = await generateCoachNutritionWeekWithPipeline({
            buildPrompt: (hint) => `${refinementIntro}\n${hint ? `REPAIR:\n${hint}` : ""}`,
            callAi: (msgs) => callCoachAi(msgs, "coach_nutrition"),
          });
          schedule = gen.week;
          rawLast = gen.rawLast;
          retries = gen.retries;
        } else {
          const gen = await generateCoachWorkoutWeekWithPipeline({
            buildPrompt: (hint) => `${refinementIntro}\n${hint ? `REPAIR:\n${hint}` : ""}`,
            callAi: (msgs) => callCoachAi(msgs, "coach_workout"),
            constraints,
            normalizeEnvelope: normalizeCoachWorkoutEnvelope,
            ...coachPipelinePostArgs(userCtx as Record<string, unknown>, ob),
          });
          schedule = await finalizeCoachWeekWithExerciseDb(gen.week as CoachWorkoutWeek, uiLocale);
          rawLast = gen.rawLast;
          retries = gen.retries;
        }
      } catch (e: any) {
        const cErr = e instanceof CoachGenerationError ? e : null;
        await logCoachAiRun(pool, {
          userId: req.userId!,
          planId: plan.id,
          weekNumber: wk,
          endpoint: "POST /api/coach/plans/:id/refine-schedule",
          inputSummary: { userRefinement },
          rawResponse: cErr?.detail.lastRaw?.slice(0, 120_000) ?? null,
          zodOk: false,
          constraintsOk: cErr ? cErr.detail.constraintViolations.length === 0 : false,
          retries: 3,
          latencyMs: Date.now() - t0,
          finalScheduleHash: null,
          errorMessage: e?.message ?? String(e),
          refinementRound: 1,
        });
        res.status(500).json({ error: e?.message || "Refine failed" });
        return;
      }

      await pool.query("UPDATE coach_weekly_schedules SET schedule=$3 WHERE plan_id=$1 AND week_number=$2", [
        req.params.id,
        wk,
        JSON.stringify(schedule),
      ]);

      await logCoachAiRun(pool, {
        userId: req.userId!,
        planId: plan.id,
        weekNumber: wk,
        endpoint: "POST /api/coach/plans/:id/refine-schedule",
        inputSummary: { userRefinement },
        rawResponse: rawLast.slice(0, 120_000),
        zodOk: true,
        constraintsOk: true,
        retries,
        latencyMs: Date.now() - t0,
        finalScheduleHash: coachPayloadHash(schedule),
        errorMessage: null,
        refinementRound: 1,
      });

      res.json({ weekNumber: wk, schedule });
    } catch (err: any) {
      console.error("refine-schedule error:", err);
      res.status(500).json({ error: err.message || "Failed to refine" });
    }
  });

  app.patch("/api/coach/plans/:id/session-links", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { links } = req.body as { links?: Array<{ sessionKey?: string; workoutId?: string }> };
      if (!Array.isArray(links) || links.length === 0) {
        res.status(400).json({ error: "links array required" });
        return;
      }
      const planResult = await pool.query("SELECT id FROM coach_plans WHERE id=$1 AND user_id=$2", [
        req.params.id,
        req.userId,
      ]);
      if (!planResult.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const state = await loadCoachPlanState(pool, req.params.id);
      const overrides = { ...(state.sessionMatchOverrides ?? {}) };
      for (const link of links) {
        const sk = String(link.sessionKey ?? "").trim();
        const wid = String(link.workoutId ?? "").trim();
        if (!sk || !wid) continue;
        const owned = await pool.query(
          "SELECT id FROM workouts WHERE id=$1 AND user_id=$2",
          [wid, req.userId],
        );
        if (!owned.rows.length) continue;
        overrides[sk] = wid;
      }
      await saveCoachPlanState(pool, req.params.id, { ...state, sessionMatchOverrides: overrides });

      const planRow = await pool.query("SELECT * FROM coach_plans WHERE id=$1", [req.params.id]);
      const plan = planRow.rows[0];
      const wk = Math.max(1, parseInt(String((req.body as { weekNumber?: number })?.weekNumber ?? plan?.current_week ?? 1), 10) || 1);
      let snapshot = null;
      if (plan) {
        const userRow = await pool.query(
          "SELECT measurements, goals, profile_extras FROM users WHERE id=$1",
          [req.userId],
        );
        const u = userRow.rows[0] || {};
        const pe =
          typeof u.profile_extras === "string"
            ? JSON.parse(u.profile_extras || "{}")
            : u.profile_extras || {};
        const factsResult = await loadWeekFactsSnapshot({
          pool,
          plan,
          weekNumber: wk,
          userId: req.userId!,
          profile: { goals: u.goals || { dailyCalories: 2400 }, measurements: u.measurements, dailyActivityLog: pe.dailyActivityLog } as any,
          onboarding: parseCoachOnboarding(plan.onboarding_data),
        });
        snapshot = factsResult?.snapshot ?? null;
      }

      res.json({ ok: true, sessionMatchOverrides: overrides, factsSnapshot: snapshot, weekNumber: wk });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to save session links" });
    }
  });

  app.post("/api/coach/plans/:id/session-feedback", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { sessionKey, rating } = req.body as { sessionKey?: string; rating?: string };
      const sk = String(sessionKey ?? "").trim();
      const r = String(rating ?? "").toLowerCase();
      if (!sk || !["easy", "ok", "hard"].includes(r)) {
        res.status(400).json({ error: "sessionKey and rating (easy|ok|hard) required" });
        return;
      }
      const planResult = await pool.query("SELECT id FROM coach_plans WHERE id=$1 AND user_id=$2", [
        req.params.id,
        req.userId,
      ]);
      if (!planResult.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const state = await loadCoachPlanState(pool, req.params.id);
      const entry = { sessionKey: sk, rating: r as "easy" | "ok" | "hard", at: new Date().toISOString() };
      const sessionFeedback = [...(state.sessionFeedback ?? []).slice(-24), entry];
      await saveCoachPlanState(pool, req.params.id, { ...state, sessionFeedback });

      const planRow = await pool.query("SELECT * FROM coach_plans WHERE id=$1", [req.params.id]);
      const plan = planRow.rows[0];
      const wk = plan?.current_week ?? 1;
      let factsSnapshot = null;
      if (plan) {
        const userRow = await pool.query(
          "SELECT measurements, goals, profile_extras FROM users WHERE id=$1",
          [req.userId],
        );
        const u = userRow.rows[0] || {};
        const pe =
          typeof u.profile_extras === "string"
            ? JSON.parse(u.profile_extras || "{}")
            : u.profile_extras || {};
        const factsResult = await loadWeekFactsSnapshot({
          pool,
          plan,
          weekNumber: wk,
          userId: req.userId!,
          profile: { goals: u.goals || { dailyCalories: 2400 }, measurements: u.measurements, dailyActivityLog: pe.dailyActivityLog } as any,
          onboarding: parseCoachOnboarding(plan.onboarding_data),
        });
        factsSnapshot = factsResult?.snapshot ?? null;
      }

      res.json({ ok: true, factsSnapshot, weekNumber: wk });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to save feedback" });
    }
  });

  // ── Coach: Eine Übung in einem Trainingstag ersetzen ───────────────────────
  app.patch("/api/coach/plans/:id/schedules/:weekNum/swap-exercise", requireAuth, async (req: AuthRequest, res) => {
    try {
      const planCheck = await pool.query("SELECT id FROM coach_plans WHERE id=$1 AND user_id=$2", [
        req.params.id,
        req.userId,
      ]);
      if (!planCheck.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }

      const weekNum = parseInt(req.params.weekNum, 10);
      const { day, exerciseIndex, exerciseKey, name } = req.body as {
        day?: string;
        exerciseIndex?: number;
        exerciseKey?: string;
        name?: string;
      };
      if (!day?.trim() || typeof exerciseIndex !== "number" || exerciseIndex < 0) {
        res.status(400).json({ error: "day and exerciseIndex required" });
        return;
      }
      if (!exerciseKey?.trim() || !name?.trim()) {
        res.status(400).json({ error: "exerciseKey and name required" });
        return;
      }

      const schedResult = await pool.query(
        "SELECT schedule FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2",
        [req.params.id, weekNum],
      );
      if (!schedResult.rows.length) {
        res.status(404).json({ error: "Schedule not found" });
        return;
      }

      const existing = schedResult.rows[0].schedule as {
        schedule?: Array<{ day?: string; exercises?: Array<Record<string, unknown>> }>;
      };
      const days = Array.isArray(existing?.schedule) ? existing.schedule : [];
      const dayRow = days.find((d) => String(d.day || "") === day);
      if (!dayRow?.exercises?.length || exerciseIndex >= dayRow.exercises.length) {
        res.status(400).json({ error: "Exercise not found" });
        return;
      }

      const ex = dayRow.exercises[exerciseIndex] as Record<string, unknown>;
      dayRow.exercises[exerciseIndex] = {
        ...ex,
        exerciseKey: exerciseKey.trim(),
        name: name.trim(),
      };

      await pool.query(
        "UPDATE coach_weekly_schedules SET schedule=$3 WHERE plan_id=$1 AND week_number=$2",
        [req.params.id, weekNum, JSON.stringify(existing)],
      );
      res.json({ ok: true, schedule: existing });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to swap exercise";
      res.status(500).json({ error: msg });
    }
  });

  // ── Coach: Reorder days in a schedule ────────────────────────────────────
  app.patch("/api/coach/plans/:id/schedules/:weekNum/reorder", requireAuth, async (req: AuthRequest, res) => {
    try {
      const planCheck = await pool.query("SELECT id FROM coach_plans WHERE id=$1 AND user_id=$2", [req.params.id, req.userId]);
      if (!planCheck.rows.length) { res.status(404).json({ error: "Not found" }); return; }

      const schedResult = await pool.query(
        "SELECT schedule FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2",
        [req.params.id, parseInt(req.params.weekNum)]
      );
      if (!schedResult.rows.length) { res.status(404).json({ error: "Schedule not found" }); return; }

      const { days } = req.body as { days: any[] };
      const existing = schedResult.rows[0].schedule;
      const updated = { ...existing, schedule: days };

      await pool.query(
        "UPDATE coach_weekly_schedules SET schedule=$3 WHERE plan_id=$1 AND week_number=$2",
        [req.params.id, parseInt(req.params.weekNum), JSON.stringify(updated)]
      );
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Coach: Auto-advance (Wochenwechsel + Wochenbericht, ggf. mehrere Wochen Catch-up) ──
  app.post("/api/coach/plans/:id/auto-advance", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein gültiger API-Key)." });
        return;
      }
      const planId = String(req.params.id ?? "");
      const userId = req.userId!;
      const uiLocale = await getUserUiLocale(userId);

      let weeksAdvanced = 0;
      let weeklyReportGenerated = false;
      let lastReport: any = null;
      let finalNewWeek = 0;
      let stopReason: string | undefined;

      for (let guard = 0; guard < 12; guard++) {
        const planResult = await pool.query("SELECT * FROM coach_plans WHERE id=$1 AND user_id=$2", [planId, userId]);
        if (!planResult.rows.length) {
          if (weeksAdvanced === 0) res.status(404).json({ error: "Not found" });
          break;
        }
        const plan = planResult.rows[0];
        finalNewWeek = Number(plan.current_week) || 1;

        if (plan.status !== "active") {
          stopReason = "Plan not active";
          if (weeksAdvanced === 0) {
            res.json({ advanced: false, reason: stopReason });
            return;
          }
          break;
        }

        const schedResult = await pool.query(
          "SELECT * FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2",
          [planId, plan.current_week],
        );
        if (!schedResult.rows.length) {
          stopReason = "No current schedule";
          if (weeksAdvanced === 0) {
            res.json({ advanced: false, reason: stopReason });
            return;
          }
          break;
        }

        const currentSched = schedResult.rows[0];
        const startYmd =
          currentSched.start_date != null
            ? String(
                currentSched.start_date instanceof Date
                  ? currentSched.start_date.toISOString().split("T")[0]
                  : currentSched.start_date,
              ).split("T")[0]
            : toLocalYmd(new Date());
        const lastDayYmd = coachWeekInclusiveEnd(startYmd);
        const todayYmd = toLocalYmd(new Date());

        if (todayYmd <= lastDayYmd) {
          stopReason = "Current week still active";
          if (weeksAdvanced === 0) {
            const ms = parseLocalYmd(lastDayYmd).getTime() - parseLocalYmd(todayYmd).getTime();
            const daysLeft = Math.max(1, Math.ceil(ms / 86400000) + 1);
            res.json({ advanced: false, reason: stopReason, daysLeft });
            return;
          }
          break;
        }

        let report: any;
        const existingReport = await pool.query(
          "SELECT report FROM coach_weekly_reports WHERE plan_id=$1 AND week_number=$2",
          [planId, plan.current_week],
        );
        if (existingReport.rows.length) {
          report = existingReport.rows[0].report;
        } else {
          const endYmd = coachWeekInclusiveEnd(startYmd);

          const prevReportResult = await pool.query(
            "SELECT report FROM coach_weekly_reports WHERE plan_id=$1 AND week_number=$2",
            [planId, plan.current_week - 1],
          );
          const prevReport = prevReportResult.rows[0]?.report ?? null;

          const userRow = await pool.query(
            "SELECT measurements, goals, profile_extras FROM users WHERE id=$1",
            [userId],
          );
          const u = userRow.rows[0] || {};
          const pe =
            typeof u.profile_extras === "string"
              ? JSON.parse(u.profile_extras || "{}")
              : u.profile_extras || {};
          const profile = {
            goals: u.goals || { dailyCalories: 2400 },
            measurements: u.measurements,
            dailyActivityLog: pe.dailyActivityLog,
          };

          const gen = await generateCoachWeeklyReport({
            pool,
            plan,
            scheduleRow: {
              schedule: currentSched.schedule as Record<string, unknown>,
              start_date: currentSched.start_date,
            },
            userId,
            profile: profile as any,
            onboarding: parseCoachOnboarding(plan.onboarding_data),
            prevReport,
            uiLocale,
            callAi: (msgs) => callCoachAiForPlan(plan, msgs),
            outputLanguage: coachOutputLanguageForLocale(uiLocale === "en" ? "en" : "de"),
          });
          report = gen.report;

          await pool.query(
            "INSERT INTO coach_weekly_reports (plan_id,week_number,report) VALUES ($1,$2,$3) ON CONFLICT (plan_id,week_number) DO UPDATE SET report=$3, generated_at=NOW()",
            [planId, plan.current_week, JSON.stringify(report)],
          );
          weeklyReportGenerated = true;
        }

        const nextWeek = plan.current_week + 1;
        const existingNext = await pool.query(
          "SELECT week_number FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2",
          [planId, nextWeek],
        );

        if (!existingNext.rows.length) {
          const nextStartYmd = addDaysYmd(startYmd, 7);
          const userCtx = await buildUserContextForCoach({
            pool,
            userId,
            plan,
            scheduleWindow: { startYmd: nextStartYmd },
          });
          plan.onboarding_data = parseCoachOnboarding(plan.onboarding_data);
          const ob = plan.onboarding_data as Record<string, unknown>;
          const constraints = workoutConstraintsFromOnboarding(ob, { weekNumber: nextWeek });
          let nextSchedule: any;
          if (plan.type === "nutrition") {
            const gen = await generateCoachNutritionWeekWithPipeline({
              buildPrompt: (hint) => buildNutritionPrompt(plan, nextWeek, report, userCtx, hint),
              callAi: (msgs) => callCoachAi(msgs, "coach_nutrition"),
            });
            nextSchedule = gen.week;
          } else {
            const exerciseCatalog = await formatExerciseDbForCoachPromptAsync();
            const priorSched = await pool.query(
              `SELECT schedule FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2`,
              [planId, nextWeek - 1],
            );
            const priorKeys = extractPriorExerciseKeysFromScheduleJson(priorSched.rows[0]?.schedule);
            (userCtx as Record<string, unknown>).prior_week_exercise_keys = priorKeys;
            const gen = await generateCoachWorkoutWeekWithPipeline({
              buildPrompt: (hint) =>
                buildWorkoutPrompt(plan, nextWeek, report, undefined, userCtx, hint, exerciseCatalog, uiLocale),
              callAi: (msgs) => callCoachAi(msgs, "coach_workout"),
              constraints,
              normalizeEnvelope: normalizeCoachWorkoutEnvelope,
              ...coachPipelinePostArgs(userCtx as Record<string, unknown>, ob, priorKeys),
            });
            nextSchedule = await finalizeCoachWeekWithExerciseDb(gen.week as CoachWorkoutWeek, uiLocale);
          }

          await pool.query(
            "INSERT INTO coach_weekly_schedules (plan_id,week_number,start_date,schedule) VALUES ($1,$2,$3,$4) ON CONFLICT (plan_id,week_number) DO UPDATE SET start_date=$3, schedule=$4",
            [planId, nextWeek, nextStartYmd, JSON.stringify(nextSchedule)],
          );
        }

        await pool.query("UPDATE coach_plans SET current_week=$2, updated_at=NOW() WHERE id=$1", [planId, nextWeek]);

        weeksAdvanced += 1;
        lastReport = report;
        finalNewWeek = nextWeek;
      }

      if (weeksAdvanced === 0) {
        if (!stopReason) stopReason = "Current week still active";
        res.json({ advanced: false, reason: stopReason });
        return;
      }

      res.json({
        advanced: true,
        newWeek: finalNewWeek,
        report: lastReport,
        weeklyReportGenerated,
        weeksAdvanced,
      });
    } catch (err: any) {
      console.error("auto-advance error:", err);
      res.status(500).json({ error: err.message || "Failed to auto-advance" });
    }
  });

  // ── Coach: Latest report for dashboard ────────────────────────────────────
  app.get("/api/coach/latest-report", requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT r.*, p.discipline, p.type AS plan_type, p.id AS plan_id, p.current_week
         FROM coach_weekly_reports r
         JOIN coach_plans p ON p.id = r.plan_id
         WHERE p.user_id=$1 AND p.status='active'
         ORDER BY r.generated_at DESC LIMIT 1`,
        [req.userId]
      );
      if (!result.rows.length) { res.json(null); return; }
      res.json(result.rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/coach/dashboard-summary", requireAuth, async (req: AuthRequest, res) => {
    try {
      const planResult = await pool.query(
        `SELECT * FROM coach_plans WHERE user_id=$1 AND status='active' ORDER BY updated_at DESC LIMIT 1`,
        [req.userId],
      );
      if (!planResult.rows.length) {
        res.json(null);
        return;
      }
      const plan = planResult.rows[0];
      const weekNumber = plan.current_week;

      const reportResult = await pool.query(
        `SELECT report FROM coach_weekly_reports WHERE plan_id=$1 AND week_number=$2`,
        [plan.id, weekNumber],
      );
      const report = (reportResult.rows[0]?.report as Record<string, unknown>) ?? null;

      const userRow = await pool.query(
        "SELECT measurements, goals, profile_extras FROM users WHERE id=$1",
        [req.userId],
      );
      const u = userRow.rows[0] || {};
      const pe =
        typeof u.profile_extras === "string"
          ? JSON.parse(u.profile_extras || "{}")
          : u.profile_extras || {};
      const profile = {
        goals: u.goals || { dailyCalories: 2400 },
        measurements: u.measurements,
        dailyActivityLog: pe.dailyActivityLog,
      };

      const factsResult = await loadWeekFactsSnapshot({
        pool,
        plan,
        weekNumber,
        userId: req.userId!,
        profile: profile as any,
        onboarding: parseCoachOnboarding(plan.onboarding_data),
      });

      const summary = buildCoachDashboardSummary({
        planId: plan.id,
        planType: plan.type,
        weekNumber,
        report,
        liveSnapshot: factsResult?.snapshot ?? null,
      });

      res.json(summary);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to load dashboard summary" });
    }
  });

  // ── User weekly reports (alle Nutzer, unabhängig vom Coach-Plan) ───────────
  async function loadUserWeeklyReportRow(userId: number, weekKey: string) {
    const r = await pool.query(
      `SELECT * FROM user_weekly_reports WHERE user_id=$1 AND week_key=$2`,
      [userId, weekKey],
    );
    return r.rows[0] ?? null;
  }

  const USER_WEEKLY_REPORT_CATCHUP_WEEKS = 12;
  const USER_WEEKLY_REPORT_MAX_PER_ENSURE = 3;

  async function generateUserWeeklyReportForWeek(
    userId: number,
    weekStartYmd: string,
    weekEndYmd: string,
    weekKey: string,
    profile: ReturnType<typeof mapUser>,
    allWorkouts: ReturnType<typeof mapWorkout>[],
    allNutrition: ReturnType<typeof mapNutrition>[],
    coachPlans: { id: string; status: string; discipline: string; type: string }[],
    uiLocale: string,
  ) {
    const facts = buildUserWeekFacts({
      weekStartYmd,
      weekEndYmd,
      locale: uiLocale as "de" | "en",
      profile,
      allWorkouts,
      allNutrition,
      coachPlans,
    });
    const aiEnabled = resolveAiCapabilities().enabled;
    const gen = await generateUserWeeklyReport({
      facts,
      outputLanguage: coachOutputLanguageForLocale(uiLocale === "en" ? "en" : "de"),
      callAi: aiEnabled ? (msgs) => callCoachAi(msgs, "coach_workout") : undefined,
    });
    const z = userWeeklyReportSchema.safeParse(gen.report);
    if (!z.success) throw new Error("Report validation failed");
    const ins = await pool.query(
      `INSERT INTO user_weekly_reports (user_id, week_key, week_start, week_end, report, facts, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        userId,
        weekKey,
        weekStartYmd,
        weekEndYmd,
        JSON.stringify(z.data),
        JSON.stringify(facts),
        gen.source,
      ],
    );
    return ins.rows[0];
  }

  app.post("/api/user-weekly-reports/ensure", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!canGenerateLastWeekReport()) {
        res.json({ ok: true, generated: false, generatedCount: 0, reason: "current_week_not_finished" });
        return;
      }

      const uiLocale = await getUserUiLocale(req.userId!);
      const [userRes, workoutsRes, nutritionRes, plansRes] = await Promise.all([
        pool.query("SELECT * FROM users WHERE id=$1", [req.userId]),
        pool.query("SELECT * FROM workouts WHERE user_id=$1", [req.userId]),
        pool.query("SELECT * FROM nutrition WHERE user_id=$1", [req.userId]),
        pool.query("SELECT id, status, discipline, type FROM coach_plans WHERE user_id=$1", [req.userId]),
      ]);
      if (!userRes.rows.length) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      const profile = mapUser(userRes.rows[0]);
      const allWorkouts = workoutsRes.rows.map(mapWorkout);
      const allNutrition = nutritionRes.rows.map(mapNutrition);
      const coachPlans = plansRes.rows;

      let generatedCount = 0;
      let latestRow: Awaited<ReturnType<typeof loadUserWeeklyReportRow>> = null;

      for (let weeksAgo = 0; weeksAgo < USER_WEEKLY_REPORT_CATCHUP_WEEKS; weeksAgo++) {
        if (generatedCount >= USER_WEEKLY_REPORT_MAX_PER_ENSURE) break;
        const { weekStartYmd, weekEndYmd, weekKey } = getCompletedWeekRangeAtOffset(weeksAgo);
        const existing = await loadUserWeeklyReportRow(req.userId!, weekKey);
        if (existing) {
          if (weeksAgo === 0) latestRow = existing;
          continue;
        }
        const row = await generateUserWeeklyReportForWeek(
          req.userId!,
          weekStartYmd,
          weekEndYmd,
          weekKey,
          profile,
          allWorkouts,
          allNutrition,
          coachPlans,
          uiLocale,
        );
        generatedCount++;
        if (weeksAgo === 0) latestRow = row;
      }

      if (!latestRow) {
        const { weekKey } = getLastCompletedWeekRange();
        latestRow = await loadUserWeeklyReportRow(req.userId!, weekKey);
      }

      res.json({
        ok: true,
        generated: generatedCount > 0,
        generatedCount,
        report: latestRow ?? undefined,
      });
    } catch (err: unknown) {
      console.error("user-weekly-reports/ensure:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "ensure failed" });
    }
  });

  app.get("/api/user-weekly-reports/latest", requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT * FROM user_weekly_reports WHERE user_id=$1 ORDER BY week_start DESC LIMIT 1`,
        [req.userId],
      );
      if (!result.rows.length) {
        res.json(null);
        return;
      }
      res.json(result.rows[0]);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "load failed" });
    }
  });

  app.get("/api/user-weekly-reports", requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT * FROM user_weekly_reports WHERE user_id=$1 ORDER BY week_start DESC LIMIT 24`,
        [req.userId],
      );
      res.json(result.rows);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "load failed" });
    }
  });

  app.get("/api/user-weekly-reports/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT * FROM user_weekly_reports WHERE id=$1 AND user_id=$2`,
        [req.params.id, req.userId],
      );
      if (!result.rows.length) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json(result.rows[0]);
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "load failed" });
    }
  });

  // ── Intervals.icu: Garmin-Daten fuer den Coach ────────────────────────────
  /**
   * Mealplanner-Verbindung.
   *
   * Beide Apps haben getrennte Nutzerkonten. Statt fremder Zugangsdaten wird im
   * Mealplanner ein Kopplungscode erzeugt und hier eingetragen; der Server holt damit
   * Wochenplan und Rezepte über die Mealplanner-API. Der Code liegt in
   * `profile_extras.mealplanner` und geht nie an den Browser zurück.
   */
  app.get("/api/integrations/mealplanner", requireAuth, async (req: AuthRequest, res) => {
    try {
      const r = await pool.query("SELECT profile_extras FROM users WHERE id=$1", [req.userId]);
      const extras = (r.rows[0]?.profile_extras || {}) as Record<string, unknown>;
      const mp = (extras.mealplanner || {}) as {
        baseUrl?: string;
        code?: string;
        connectedAt?: string;
        householdName?: string;
        lastError?: string;
        lastSync?: string;
      };
      res.json({
        connected: Boolean(mp.code && mp.baseUrl),
        baseUrl: mp.baseUrl ?? "https://meal-planner.nas-timgreen.com",
        householdName: mp.householdName ?? null,
        connectedAt: mp.connectedAt ?? null,
        lastSync: mp.lastSync ?? null,
        lastError: mp.lastError ?? null,
        // Der Code selbst wird nie ausgeliefert — nur ob einer gesetzt ist.
        hasCode: Boolean(mp.code),
      });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "load failed" });
    }
  });

  app.post("/api/integrations/mealplanner/connect", requireAuth, async (req: AuthRequest, res) => {
    try {
      const code = String(req.body?.code ?? "").trim();
      const baseUrl = String(req.body?.baseUrl ?? "https://meal-planner.nas-timgreen.com")
        .trim()
        .replace(/\/$/, "");
      if (!code) {
        res.status(400).json({ error: "Kopplungscode fehlt." });
        return;
      }
      if (!/^https?:\/\//.test(baseUrl)) {
        res.status(400).json({ error: "Adresse muss mit http:// oder https:// beginnen." });
        return;
      }

      // Erst prüfen, dann speichern — ein falscher Code landet nicht in der DB.
      // Die eigene Adresse geht mit: der Mealplanner meldet Planänderungen dorthin.
      const callbackUrl = String(req.body?.callbackUrl ?? "").trim();
      const pruefUrl = new URL(`${baseUrl}/api/connect/${encodeURIComponent(code)}`);
      if (callbackUrl && /^https?:\/\//.test(callbackUrl)) {
        pruefUrl.searchParams.set("callback", callbackUrl);
        pruefUrl.searchParams.set("app", "Fitness-Tracker");
      }
      const pruefung = await fetch(pruefUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!pruefung.ok) {
        const text = await pruefung.text().catch(() => "");
        let meldung = `Mealplanner antwortete mit ${pruefung.status}.`;
        try {
          const j = JSON.parse(text) as { message?: string };
          if (j.message) meldung = j.message;
        } catch {
          /* Klartext-Antwort */
        }
        res.status(400).json({ error: meldung });
        return;
      }
      const daten = (await pruefung.json()) as { householdName?: string; code?: string };

      await pool.query(
        `UPDATE users
            SET profile_extras = COALESCE(profile_extras,'{}'::jsonb)
                || jsonb_build_object('mealplanner', $2::jsonb),
                updated_at = NOW()
          WHERE id=$1`,
        [
          req.userId,
          JSON.stringify({
            baseUrl,
            code,
            connectedAt: new Date().toISOString(),
            householdName: daten.householdName ?? null,
          }),
        ],
      );
      res.json({ ok: true, householdName: daten.householdName ?? null });
    } catch (err: unknown) {
      res.status(500).json({
        error:
          err instanceof Error && err.name === "TimeoutError"
            ? "Der Mealplanner hat nicht rechtzeitig geantwortet."
            : err instanceof Error
              ? err.message
              : "Verbindung fehlgeschlagen.",
      });
    }
  });

  app.delete("/api/integrations/mealplanner", requireAuth, async (req: AuthRequest, res) => {
    try {
      await pool.query(
        `UPDATE users SET profile_extras = profile_extras - 'mealplanner', updated_at=NOW() WHERE id=$1`,
        [req.userId],
      );
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "disconnect failed" });
    }
  });

  /** Wochenplan aus dem Mealplanner für die Coach-Ansicht. */
  app.get("/api/integrations/mealplanner/week", requireAuth, async (req: AuthRequest, res) => {
    try {
      const r = await pool.query("SELECT profile_extras FROM users WHERE id=$1", [req.userId]);
      const extras = (r.rows[0]?.profile_extras || {}) as Record<string, unknown>;
      const mp = (extras.mealplanner || {}) as { baseUrl?: string; code?: string };
      if (!mp.code || !mp.baseUrl) {
        res.status(400).json({ error: "Mealplanner ist nicht verbunden." });
        return;
      }
      /*
       * Der Mealplanner stellt fuer Kopplungen den Endpunkt
       * /api/connect/<code>/week bereit — der Code ist der Schluessel,
       * kein JWT. `w` ist der Wochenstart (Montag), ohne Angabe nimmt der
       * Mealplanner die laufende Woche.
       */
      const code = encodeURIComponent(mp.code);
      const antwort = await fetch(`${mp.baseUrl}/api/connect/${code}/week`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!antwort.ok) {
        res.status(antwort.status).json({ error: "Mealplanner lieferte keine Wochendaten." });
        return;
      }
      res.json(await antwort.json());
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "week failed" });
    }
  });

  /**
   * Rezeptdetails aus dem Mealplanner (Zutaten, Zubereitung) für die Detailkarte
   * in der Schnellerfassung.
   */
  app.get("/api/integrations/mealplanner/recipe/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const r = await pool.query("SELECT profile_extras FROM users WHERE id=$1", [req.userId]);
      const extras = (r.rows[0]?.profile_extras || {}) as Record<string, unknown>;
      const mp = (extras.mealplanner || {}) as { baseUrl?: string; code?: string };
      if (!mp.code || !mp.baseUrl) {
        res.status(400).json({ error: "Mealplanner ist nicht verbunden." });
        return;
      }
      const antwort = await fetch(
        `${mp.baseUrl}/api/connect/${encodeURIComponent(mp.code)}/recipe/${encodeURIComponent(String(req.params.id))}`,
        { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) },
      );
      if (!antwort.ok) {
        res.status(antwort.status).json({ error: "Rezept konnte nicht geladen werden." });
        return;
      }
      res.json(await antwort.json());
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "recipe failed" });
    }
  });

  /**
   * Sofort-Abgleich: der Mealplanner ruft diesen Endpunkt bei jeder Planänderung.
   *
   * Öffentlich erreichbar, weil der Mealplanner kein Fitness-Tracker-Token hat.
   * Missbrauch ist begrenzt: die Antwort enthält keine Daten, es wird nur der
   * Wochenplan des betroffenen Codes neu geholt und zwischengespeichert.
   */
  app.post("/api/integrations/mealplanner/webhook", async (req, res) => {
    try {
      const code = String((req.body as { code?: string })?.code ?? "").trim();
      if (!code) {
        res.status(400).json({ error: "Code fehlt." });
        return;
      }
      const r = await pool.query(
        `SELECT id, profile_extras FROM users
          WHERE profile_extras->'mealplanner'->>'code' = $1 LIMIT 1`,
        [code],
      );
      if (!r.rows.length) {
        res.json({ ok: true, matched: false });
        return;
      }
      const userId = Number(r.rows[0].id);
      const mp = ((r.rows[0].profile_extras || {}) as Record<string, unknown>).mealplanner as {
        baseUrl?: string;
        code?: string;
      };
      if (mp?.baseUrl && mp?.code) {
        // Wochenplan vorwärmen: der nächste Aufruf in der App ist damit sofort da.
        try {
          const antwort = await fetch(
            `${mp.baseUrl}/api/connect/${encodeURIComponent(mp.code)}/week`,
            { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15_000) },
          );
          if (antwort.ok) {
            const daten = (await antwort.json()) as unknown;
            await pool.query(
              `UPDATE users SET profile_extras = jsonb_set(
                 COALESCE(profile_extras,'{}'::jsonb), '{mealplanner,cache}', $2::jsonb, true
               ), updated_at = NOW() WHERE id = $1`,
              [userId, JSON.stringify({ at: new Date().toISOString(), daten })],
            );
          }
        } catch {
          /* Vorwärmen ist optional. */
        }
      }
      res.json({ ok: true, matched: true });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "webhook failed" });
    }
  });

  /**
   * Echter Sync: prüft die Verbindung nach und liefert den aktuellen Wochenplan.
   * Wird vom „Synchronisieren"-Knopf im Profil aufgerufen.
   */
  app.post("/api/integrations/mealplanner/sync", requireAuth, async (req: AuthRequest, res) => {
    try {
      const r = await pool.query("SELECT profile_extras FROM users WHERE id=$1", [req.userId]);
      const extras = (r.rows[0]?.profile_extras || {}) as Record<string, unknown>;
      const mp = (extras.mealplanner || {}) as { baseUrl?: string; code?: string };
      if (!mp.code || !mp.baseUrl) {
        res.status(400).json({ error: "Mealplanner ist nicht verbunden." });
        return;
      }
      const t0 = Date.now();
      /*
       * Der Mealplanner stellt fuer Kopplungen den Endpunkt
       * /api/connect/<code>/week bereit — der Code ist der Schluessel,
       * kein JWT. `w` ist der Wochenstart (Montag), ohne Angabe nimmt der
       * Mealplanner die laufende Woche.
       */
      const code = encodeURIComponent(mp.code);
      const antwort = await fetch(`${mp.baseUrl}/api/connect/${code}/week`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!antwort.ok) {
        const meldung =
          antwort.status === 404
            ? "Der Kopplungscode ist ungültig oder wurde im Mealplanner widerrufen."
            : `Mealplanner antwortete mit ${antwort.status}.`;
        // Fehler am Profil festhalten, damit die Karte ihn zeigen kann.
        await pool.query(
          `UPDATE users SET profile_extras = jsonb_set(
             COALESCE(profile_extras,'{}'::jsonb), '{mealplanner,lastError}', to_jsonb($2::text), true
           ) WHERE id=$1`,
          [req.userId, meldung],
        );
        res.status(400).json({ error: meldung });
        return;
      }
      const daten = (await antwort.json()) as {
        woche?: string;
        anzahl?: number;
        kcalSumme?: number;
      };
      await pool.query(
        `UPDATE users
            SET profile_extras = jsonb_set(
                  jsonb_set(
                    COALESCE(profile_extras,'{}'::jsonb),
                    '{mealplanner,lastSync}', to_jsonb($2::text), true
                  ),
                  '{mealplanner,lastError}', 'null'::jsonb, true
                ),
                updated_at = NOW()
          WHERE id=$1`,
        [req.userId, new Date().toISOString()],
      );
      res.json({
        ok: true,
        ms: Date.now() - t0,
        woche: daten.woche ?? null,
        anzahl: daten.anzahl ?? 0,
        kcalSumme: daten.kcalSumme ?? 0,
      });
    } catch (err: unknown) {
      const meldung =
        err instanceof Error && err.name === "TimeoutError"
          ? "Der Mealplanner hat nicht rechtzeitig geantwortet."
          : err instanceof Error
            ? err.message
            : "Sync fehlgeschlagen.";
      res.status(500).json({ error: meldung });
    }
  });

  const readIntervalsSettings = async (userId: number): Promise<IntervalsSettings> => {
    const r = await pool.query("SELECT profile_extras FROM users WHERE id=$1", [userId]);
    const extras = (r.rows[0]?.profile_extras || {}) as Record<string, unknown>;
    return (extras.intervals as IntervalsSettings) || {};
  };

  /**
   * Call-Wrapper für den Workout-Sync: nutzt denselben Basis-URL und dieselbe
   * Basic-Auth wie der Coach-Sync, wirft bei Fehlern aber den HTTP-Code im Text.
   */
  const intervalsCallFor = (apiKey: string): SyncCall => {
    return async (method, path, body) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);
      try {
        const res = await fetch(`https://intervals.icu/api/v1${path}`, {
          method,
          headers: {
            Authorization: `Basic ${Buffer.from(`API_KEY:${apiKey}`).toString("base64")}`,
            Accept: "application/json",
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Intervals.icu antwortete mit HTTP ${res.status}.`);
        if (res.status === 204) return null;
        const text = await res.text();
        return text ? JSON.parse(text) : null;
      } finally {
        clearTimeout(timer);
      }
    };
  };

  /** Ein Workout nach Intervals übertragen (anlegen oder aktualisieren) und ID merken. */
  const pushWorkoutToIntervals = async (
    userId: number,
    workoutId: string,
    opts: { force?: boolean } = {},
  ): Promise<{ skipped: true; reason: string } | { action: "create" | "update"; eventId: string }> => {
    const settings = await readIntervalsSettings(userId);
    const apiKey = settings.apiKey?.trim();
    if (!apiKey) return { skipped: true, reason: "intervals-nicht-verbunden" };
    if (settings.syncWorkouts === false) return { skipped: true, reason: "sync-aus" };

    const row = await pool.query(
      `SELECT id, name, type, duration, calories_burned, date, notes, exercises,
              intervals_event_id, intervals_hash
         FROM workouts WHERE id=$1 AND user_id=$2`,
      [workoutId, userId],
    );
    if (!row.rows.length) return { skipped: true, reason: "workout-weg" };
    const w = row.rows[0];

    const workout = {
      id: w.id,
      name: w.name,
      type: w.type,
      duration: w.duration,
      caloriesBurned: w.calories_burned,
      date: w.date,
      notes: w.notes,
      exercises: w.exercises,
    };
    const result = await intervalsSyncWorkout(
      intervalsCallFor(apiKey),
      workout,
      settings.athleteId || "0",
      opts.force
        ? null
        : { intervalsEventId: w.intervals_event_id, intervalsHash: w.intervals_hash },
    );

    if (result.action === "skip") return { skipped: true, reason: result.reason ?? "unveraendert" };
    await pool.query(
      `UPDATE workouts SET intervals_event_id=$2, intervals_hash=$3, intervals_synced_at=NOW() WHERE id=$1`,
      [workoutId, result.eventId, result.hash],
    );
    return { action: result.action, eventId: result.eventId! };
  };

  /** Workout bei Intervals entfernen (der App-Eintrag bleibt unberührt). */
  const removeWorkoutFromIntervals = async (userId: number, eventId: string | null | undefined) => {
    if (!eventId) return;
    const settings = await readIntervalsSettings(userId);
    const apiKey = settings.apiKey?.trim();
    if (!apiKey) return;
    await intervalsDeleteEvent(intervalsCallFor(apiKey), settings.athleteId || "0", eventId);
  };

  const writeIntervalsSettings = async (userId: number, next: IntervalsSettings) => {
    await pool.query(
      `UPDATE users
          SET profile_extras = COALESCE(profile_extras,'{}'::jsonb)
              || jsonb_build_object('intervals', $2::jsonb),
              updated_at = NOW()
        WHERE id=$1`,
      [userId, JSON.stringify(next)],
    );
  };

  /** Status ohne den Key selbst - der bleibt im Server. */
  // ── Garmin Connect Personal API (nur lesend) ──────────────────────────────
  /**
   * Garmin-Direktanbindung.
   *
   * Tim erzeugt den Key selbst in Garmin Connect Web; er liegt in
   * `profile_extras.garmin.apiKey` und geht nie an den Browser. Abgerufen werden
   * Schlaf, HRV, Schritte, Stress, Body Battery, SpO₂ und Herzfrequenz — genau die
   * Werte, die Intervals.icu teils gar nicht oder verzögert liefert.
   *
   * Nicht möglich: Trainings auf die Uhr schreiben. Die Personal API hat
   * ausschließlich GET-Endpunkte; der Rückweg läuft über Intervals.icu.
   */
  /**
   * Laeuft gerade ein Abgleich? Dann zeigt das Profil „laeuft" statt
   * „abgeschlossen" — Tim will sehen, dass im Hintergrund noch Daten kommen.
   */
  const garminSyncLaufend = new Map<number, { schritt: number; gesamt: number; seit: number }>();

  /**
   * Letzter Abgleich je Nutzer — der Zustand überlebt den Bereichswechsel.
   *
   * Tims Vorgabe: Wer im Profil auf „Aktualisieren" tippt, kurz woanders
   * hinsieht und zurückkommt, soll weiter den laufenden Fortschritt sehen
   * (z. B. „12 / 27 Felder"). Vorher war der Stand weg, sobald die Komponente
   * neu aufgebaut wurde, weil der Zähler nur im Browser-Speicher lag.
   *
   * Aufbewahrung bewusst kurz (10 Minuten): danach ist ein Lauf entweder
   * fertig oder abgebrochen — ein alter Stand würde nur verwirren.
   */
  type SyncLauf = {
    schritt: number;
    gesamt: number;
    seit: number;
    fertigAm?: number;
    ergebnis?: string;
    fehler?: string;
  };
  const letzteLaeufe = new Map<number, SyncLauf>();
  const LAUF_ERINNERUNG_MS = 10 * 60_000;

  const merkeLauf = (userId: number, lauf: SyncLauf): void => {
    letzteLaeufe.set(userId, lauf);
  };

  const letzterLaufVon = (userId: number): SyncLauf | null => {
    const l = letzteLaeufe.get(userId);
    if (!l) return null;
    const bezug = l.fertigAm ?? l.seit;
    if (Date.now() - bezug > LAUF_ERINNERUNG_MS) {
      letzteLaeufe.delete(userId);
      return null;
    }
    return l;
  };

  /** Fortschritt setzen — auch während eines laufenden Abgleichs. */
  const setzeLaufSchritt = (userId: number, schritt: number, gesamt: number): void => {
    const bisher = letzteLaeufe.get(userId);
    merkeLauf(userId, { schritt, gesamt, seit: bisher?.seit ?? Date.now() });
  };

  type GarminSettings = {
    apiKey?: string;
    connectedAt?: string;
    displayName?: string;
    lastError?: string;
    cache?: GarminCache;
    lastAutoSyncAt?: string;
    /** Zeitpunkt des letzten VOLLEN Abgleichs (Historie, Schlaf, Aktivitaeten). */
    lastVollSyncAt?: string;
    /** Zugang ueber Garmin-Login (inoffiziell, kein Tageslimit). */
    login?: {
      email?: string;
      passwort?: string;
      tokens?: string;
      verbundenAm?: string;
      fehler?: string;
    };
    /**
     * Welche Datenquellen benutzt werden. Der Login ist immer aktiv, sobald
     * Tokens da sind; Personal API und Intervals lassen sich getrennt
     * abschalten, um eine Quelle isoliert zu beurteilen.
     */
    quellen?: {
      personalApi?: boolean;
      intervals?: boolean;
      /** Werte aus der App nach Garmin schreiben (Gewicht, Wasser). */
      schreiben?: boolean;
    };
  };

  const readGarminSettings = async (userId: number): Promise<GarminSettings> => {
    const r = await pool.query("SELECT profile_extras FROM users WHERE id=$1", [userId]);
    const extras = (r.rows[0]?.profile_extras || {}) as Record<string, unknown>;
    return (extras.garmin as GarminSettings) || {};
  };

  const writeGarminSettings = async (userId: number, next: GarminSettings): Promise<void> => {
    await pool.query(
      `UPDATE users
          SET profile_extras = COALESCE(profile_extras,'{}'::jsonb)
              || jsonb_build_object('garmin', $2::jsonb),
              updated_at = NOW()
        WHERE id=$1`,
      [userId, JSON.stringify(next)],
    );
  };

  /**
   * Datenquellen-Schalter.
   *
   * Tim wollte Personal API und Intervals.icu VORÜBERGEHEND stilllegen, um zu
   * sehen, was der Garmin-Login allein liefert. Beide Wege sind deshalb
   * abschaltbar; Standard ist "an", damit sich nichts unbemerkt ändert.
   *
   * Ablage in `profile_extras.garmin.quellen`, nicht in den jeweiligen
   * Zugangsdaten — so bleibt der Schalter erhalten, wenn ein Key neu gesetzt
   * oder getrennt wird.
   */
  type QuellenSettings = {
    personalApi?: boolean;
    intervals?: boolean;
    schreiben?: boolean;
  };

  const leseQuellen = async (
    userId: number,
  ): Promise<{ personalApi: boolean; intervals: boolean; schreiben: boolean }> => {
    const r = await pool.query("SELECT profile_extras FROM users WHERE id=$1", [userId]);
    const extras = (r.rows[0]?.profile_extras || {}) as Record<string, unknown>;
    const garmin = (extras.garmin || {}) as { quellen?: QuellenSettings };
    const q = garmin.quellen ?? {};
    return {
      // Nur ein ausdrückliches `false` schaltet ab — fehlende Werte bleiben an.
      personalApi: q.personalApi !== false,
      intervals: q.intervals !== false,
      schreiben: q.schreiben !== false,
    };
  };

  const setzeQuellen = async (userId: number, naechste: QuellenSettings): Promise<void> => {
    const g = await readGarminSettings(userId);
    await writeGarminSettings(userId, { ...g, quellen: { ...(g.quellen ?? {}), ...naechste } });
  };

  /**
   * Rückschreiben nach Garmin (Gewicht, Wasser).
   *
   * Tims Vorgabe: was in der App eingetragen wird, soll auch auf der Uhr
   * landen — aber ohne Kreislauf. Die Gefahr: App schreibt zu Garmin, der
   * nächste Abgleich liest denselben Wert zurück und schreibt ihn erneut,
   * endlos.
   *
   * Lösung: `garmin_schreibstand` merkt sich je Nutzer, Art und Tag den
   * zuletzt geschriebenen Wert. Geschrieben wird nur, wenn sich der Wert
   * wirklich unterscheidet. Ein erneuter Lauf mit gleichem Wert ist ein
   * Nichts-Tun — deshalb „idempotent".
   *
   * Abschaltbar über `quellen.schreiben` (Standard: an).
   */
  const schreibeNachGarmin = async (
    userId: number,
  ): Promise<{ gewicht: boolean; wasser: boolean; fehler?: string }> => {
    const ergebnis = { gewicht: false, wasser: false } as {
      gewicht: boolean;
      wasser: boolean;
      fehler?: string;
    };
    const g = await readGarminSettings(userId);
    if (!g.login?.tokens) return ergebnis;
    if (g.quellen?.schreiben === false) return ergebnis;

    const heute = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

    /** Merker lesen: welcher Wert wurde zuletzt geschrieben? */
    const letzterStand = async (art: string, schluessel: string): Promise<string | null> => {
      const r = await pool.query(
        `SELECT wert FROM garmin_schreibstand WHERE user_id=$1 AND art=$2 AND schluessel=$3`,
        [userId, art, schluessel],
      );
      return r.rows[0]?.wert ?? null;
    };

    const merken = async (art: string, schluessel: string, wert: string): Promise<void> => {
      await pool.query(
        `INSERT INTO garmin_schreibstand (user_id, art, schluessel, wert, geschrieben_am)
         VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT (user_id, art, schluessel)
         DO UPDATE SET wert=$4, geschrieben_am=NOW()`,
        [userId, art, schluessel, wert],
      );
    };

    let tokens: string;
    try {
      tokens = entschluesseln(g.login.tokens);
    } catch (e) {
      ergebnis.fehler = e instanceof Error ? e.message : 'Tokens nicht lesbar.';
      return ergebnis;
    }

    /* ---------- Gewicht ---------- */
    try {
      const r = await pool.query(
        `SELECT measurements, profile_extras->'dailyWaterLog' AS wasser FROM users WHERE id=$1`,
        [userId],
      );
      const m = (r.rows[0]?.measurements || {}) as { weight?: number };
      const kg = Number(m.weight);
      if (Number.isFinite(kg) && kg > 20 && kg < 400) {
        const wert = String(Math.round(kg * 10) / 10);
        if ((await letzterStand('gewicht', heute)) !== wert) {
          const ok = await schreibeGewicht(tokens, heute, kg);
          if (ok) {
            await merken('gewicht', heute, wert);
            ergebnis.gewicht = true;
          }
        }
      }
    } catch (e) {
      console.warn('[garmin-schreiben] Gewicht:', e);
    }

    /* ---------- Wasser ---------- */
    try {
      const r = await pool.query(
        `SELECT profile_extras->'dailyWaterLog' AS wasser FROM users WHERE id=$1`,
        [userId],
      );
      const tage = (r.rows[0]?.wasser || {}) as Record<string, number>;
      const ml = Number(tage[heute]);
      if (Number.isFinite(ml) && ml > 0) {
        const wert = String(Math.round(ml));
        if ((await letzterStand('wasser', heute)) !== wert) {
          const ok = await schreibeWasser(tokens, heute, ml);
          if (ok) {
            await merken('wasser', heute, wert);
            ergebnis.wasser = true;
          }
        }
      } else {
        /*
         * In der App kein Wasser (mehr) eingetragen: Merker loeschen.
         * Sonst bliebe nach einem geloeschten Eintrag der alte Stand stehen,
         * und ein spaeter wieder eingegebener gleicher Wert wuerde nie
         * geschrieben, weil der Merker ihn fuer erledigt haelt.
         */
        await pool.query(
          `DELETE FROM garmin_schreibstand WHERE user_id=$1 AND art='wasser' AND schluessel=$2`,
          [userId, heute],
        );
      }
    } catch (e) {
      console.warn('[garmin-schreiben] Wasser:', e);
    }

    return ergebnis;
  };

  /**
   * Tageswerte dauerhaft ablegen.
   *
   * Der Cache in `profile_extras` ist nur der schnelle Zugriff; die Historie liegt in
   * `garmin_days`, damit Statistiken über Monate möglich sind, ohne jedes Mal die
   * ganze API abzufragen.
   */

  /**
   * Tage aus dem Login-Zugang speichern.
   *
   * Eigene Funktion statt `speichereGarminTage`, weil hier Felder dazukommen,
   * die es in der Personal API nicht gibt (Schlafphasen, Readiness).
   * Vorhandene Werte werden nie ueberschrieben, wenn der neue Wert fehlt —
   * sonst wuerde ein Tag ohne Uhr die Historie loeschen.
   */
  /** Garmins Textqualifier auf die Zahlenskala (Spalte sleep_quality ist INTEGER). */
  const SCHLAF_QUALITAET: Record<string, number> = {
    EXCELLENT: 5,
    VERY_GOOD: 4,
    GOOD: 4,
    FAIR: 3,
    POOR: 2,
    VERY_POOR: 1,
  };

  const speichereLoginTage = async (userId: number, tage: LoginTag[]): Promise<void> => {
    if (!tage.length) return;
    for (const t of tage) {
      await pool.query(
        `INSERT INTO garmin_days (
           user_id, date, sleep_secs, sleep_score, sleep_quality, hrv, hrv_status,
           resting_hr, min_hr, max_hr, steps, floors, distance_m, active_kcal, total_kcal,
           stress_avg, stress_max, bb_min, bb_max, spo2_avg, respiration, vo2max, fitness_age,
           weight_kg, body_fat,
           deep_secs, light_secs, rem_secs, awake_secs, sleep_stress, sleep_hr,
           spo2_night, respiration_night, readiness, readiness_level, training_status,
           daten_bis
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
                   $20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37)
         ON CONFLICT (user_id, date) DO UPDATE SET
           daten_bis         = COALESCE(EXCLUDED.daten_bis, garmin_days.daten_bis),
           sleep_secs        = COALESCE(EXCLUDED.sleep_secs, garmin_days.sleep_secs),
           sleep_score       = COALESCE(EXCLUDED.sleep_score, garmin_days.sleep_score),
           sleep_quality     = COALESCE(EXCLUDED.sleep_quality, garmin_days.sleep_quality),
           hrv               = COALESCE(EXCLUDED.hrv, garmin_days.hrv),
           hrv_status        = COALESCE(EXCLUDED.hrv_status, garmin_days.hrv_status),
           resting_hr        = COALESCE(EXCLUDED.resting_hr, garmin_days.resting_hr),
           min_hr            = COALESCE(EXCLUDED.min_hr, garmin_days.min_hr),
           max_hr            = COALESCE(EXCLUDED.max_hr, garmin_days.max_hr),
           steps             = COALESCE(EXCLUDED.steps, garmin_days.steps),
           floors            = COALESCE(EXCLUDED.floors, garmin_days.floors),
           distance_m        = COALESCE(EXCLUDED.distance_m, garmin_days.distance_m),
           active_kcal       = COALESCE(EXCLUDED.active_kcal, garmin_days.active_kcal),
           total_kcal        = COALESCE(EXCLUDED.total_kcal, garmin_days.total_kcal),
           stress_avg        = COALESCE(EXCLUDED.stress_avg, garmin_days.stress_avg),
           stress_max        = COALESCE(EXCLUDED.stress_max, garmin_days.stress_max),
           bb_min            = COALESCE(EXCLUDED.bb_min, garmin_days.bb_min),
           bb_max            = COALESCE(EXCLUDED.bb_max, garmin_days.bb_max),
           spo2_avg          = COALESCE(EXCLUDED.spo2_avg, garmin_days.spo2_avg),
           respiration       = COALESCE(EXCLUDED.respiration, garmin_days.respiration),
           vo2max            = COALESCE(EXCLUDED.vo2max, garmin_days.vo2max),
           fitness_age       = COALESCE(EXCLUDED.fitness_age, garmin_days.fitness_age),
           weight_kg         = COALESCE(EXCLUDED.weight_kg, garmin_days.weight_kg),
           body_fat          = COALESCE(EXCLUDED.body_fat, garmin_days.body_fat),
           deep_secs         = COALESCE(EXCLUDED.deep_secs, garmin_days.deep_secs),
           light_secs        = COALESCE(EXCLUDED.light_secs, garmin_days.light_secs),
           rem_secs          = COALESCE(EXCLUDED.rem_secs, garmin_days.rem_secs),
           awake_secs        = COALESCE(EXCLUDED.awake_secs, garmin_days.awake_secs),
           sleep_stress      = COALESCE(EXCLUDED.sleep_stress, garmin_days.sleep_stress),
           sleep_hr          = COALESCE(EXCLUDED.sleep_hr, garmin_days.sleep_hr),
           spo2_night        = COALESCE(EXCLUDED.spo2_night, garmin_days.spo2_night),
           respiration_night = COALESCE(EXCLUDED.respiration_night, garmin_days.respiration_night),
           readiness         = COALESCE(EXCLUDED.readiness, garmin_days.readiness),
           readiness_level   = COALESCE(EXCLUDED.readiness_level, garmin_days.readiness_level),
           training_status   = COALESCE(EXCLUDED.training_status, garmin_days.training_status),
           updated_at        = NOW()`,
        [
          userId, t.date,
          t.sleepSecs ?? null, t.sleepScore ?? null,
          // Text-Qualitaet auf die Zahlenskala 1-5 abbilden (Spalte ist INTEGER).
          t.sleepQuality != null ? (SCHLAF_QUALITAET[t.sleepQuality] ?? null) : null,
          t.hrv ?? null, t.hrvStatus ?? null,
          t.restingHr ?? null, t.minHr ?? null, t.maxHr ?? null,
          t.steps ?? null, t.floors ?? null, t.distanceMeters ?? null,
          t.activeCalories ?? null, t.totalCalories ?? null,
          t.stressAvg ?? null, t.stressMax ?? null,
          t.bodyBatteryMin ?? null, t.bodyBatteryMax ?? null,
          // Tagwerte bevorzugen, sonst auf den Nachtwert zurueckfallen.
          t.spo2Avg ?? t.spo2Night ?? null,
          t.respiration ?? t.respirationNight ?? null,
          t.vo2max ?? null,
          t.fitnessAge != null ? Math.round(t.fitnessAge) : null,
          t.weightKg ?? null, t.bodyFat ?? null,
          t.deepSecs ?? null, t.lightSecs ?? null, t.remSecs ?? null, t.awakeSecs ?? null,
          t.sleepStress ?? null, t.sleepHr ?? null,
          t.spo2Night ?? null, t.respirationNight ?? null,
          t.readiness ?? null, t.readinessLevel ?? null, t.trainingStatus ?? null,
          /* Bis wann Garmin Daten hat — nicht der Abrufzeitpunkt. */
          t.datenBis ?? null,
        ],
      );
    }
  };

  const speichereGarminTage = async (userId: number, tage: GarminCache["tage"]): Promise<void> => {
    if (!tage.length) return;
    const werte: unknown[] = [];
    const platzhalter: string[] = [];
    let i = 0;
    for (const t of tage) {
      i += 1;
      const b = (i - 1) * 25;
      platzhalter.push(
        `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},` +
          `$${b + 11},$${b + 12},$${b + 13},$${b + 14},$${b + 15},$${b + 16},$${b + 17},$${b + 18},$${b + 19},` +
          `$${b + 20},$${b + 21},$${b + 22},$${b + 23},$${b + 24},$${b + 25})`,
      );
      werte.push(
        userId, t.date,
        t.sleepSecs ?? null, t.sleepScore ?? null, t.sleepQuality ?? null,
        t.hrv ?? null, t.hrvStatus ?? null,
        t.restingHr ?? null, t.minHr ?? null, t.maxHr ?? null,
        t.steps ?? null, t.floorsClimbed ?? null, t.distanceMeters ?? null,
        t.activeCalories ?? null, t.totalCalories ?? null,
        t.stressAvg ?? null, t.stressMax ?? null,
        t.bodyBatteryMin ?? null, t.bodyBatteryMax ?? null,
        t.spo2Avg ?? null, t.respiration ?? null,
        t.vo2max ?? null,
        // Fitnessalter kommt als Kommazahl, die Spalte ist INTEGER — runden.
        t.fitnessAge != null ? Math.round(t.fitnessAge) : null,
        t.weightKg ?? null, t.bodyFat ?? null,
      );
    }
    await pool.query(
      `INSERT INTO garmin_days (
         user_id, date, sleep_secs, sleep_score, sleep_quality, hrv, hrv_status,
         resting_hr, min_hr, max_hr, steps, floors, distance_m, active_kcal, total_kcal,
         stress_avg, stress_max, bb_min, bb_max, spo2_avg, respiration, vo2max, fitness_age,
         weight_kg, body_fat
       ) VALUES ${platzhalter.join(",")}
       ON CONFLICT (user_id, date) DO UPDATE SET
         sleep_secs = COALESCE(EXCLUDED.sleep_secs, garmin_days.sleep_secs),
         sleep_score = COALESCE(EXCLUDED.sleep_score, garmin_days.sleep_score),
         sleep_quality = COALESCE(EXCLUDED.sleep_quality, garmin_days.sleep_quality),
         hrv = COALESCE(EXCLUDED.hrv, garmin_days.hrv),
         hrv_status = COALESCE(EXCLUDED.hrv_status, garmin_days.hrv_status),
         resting_hr = COALESCE(EXCLUDED.resting_hr, garmin_days.resting_hr),
         min_hr = COALESCE(EXCLUDED.min_hr, garmin_days.min_hr),
         max_hr = COALESCE(EXCLUDED.max_hr, garmin_days.max_hr),
         steps = COALESCE(EXCLUDED.steps, garmin_days.steps),
         floors = COALESCE(EXCLUDED.floors, garmin_days.floors),
         distance_m = COALESCE(EXCLUDED.distance_m, garmin_days.distance_m),
         active_kcal = COALESCE(EXCLUDED.active_kcal, garmin_days.active_kcal),
         total_kcal = COALESCE(EXCLUDED.total_kcal, garmin_days.total_kcal),
         stress_avg = COALESCE(EXCLUDED.stress_avg, garmin_days.stress_avg),
         stress_max = COALESCE(EXCLUDED.stress_max, garmin_days.stress_max),
         bb_min = COALESCE(EXCLUDED.bb_min, garmin_days.bb_min),
         bb_max = COALESCE(EXCLUDED.bb_max, garmin_days.bb_max),
         spo2_avg = COALESCE(EXCLUDED.spo2_avg, garmin_days.spo2_avg),
         respiration = COALESCE(EXCLUDED.respiration, garmin_days.respiration),
         vo2max = COALESCE(EXCLUDED.vo2max, garmin_days.vo2max),
         fitness_age = COALESCE(EXCLUDED.fitness_age, garmin_days.fitness_age),
         weight_kg = COALESCE(EXCLUDED.weight_kg, garmin_days.weight_kg),
         body_fat = COALESCE(EXCLUDED.body_fat, garmin_days.body_fat),
         updated_at = NOW()`,
      werte,
    );
  };

  /**
   * Aktivitaeten dauerhaft ablegen.
   *
   * Trainings, die Tim mit der Uhr aufzeichnet, kommen NICHT ueber die
   * Tageswerte — sie brauchen einen eigenen Abruf und eine eigene Tabelle.
   * Sonst fehlen sie in der App komplett.
   */
  const speichereGarminAktivitaeten = async (
    userId: number,
    liste: GarminAktivitaet[],
  ): Promise<void> => {
    if (!liste.length) return;
    const werte: unknown[] = [];
    const platzhalter: string[] = [];
    let i = 0;
    for (const a of liste) {
      i += 1;
      const b = (i - 1) * 12;
      platzhalter.push(
        `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12})`,
      );
      werte.push(
        userId, a.activityId, a.date, a.name, a.type,
        a.distanceM ?? null, a.durationSecs ?? null, a.movingSecs ?? null,
        a.avgHr ?? null, a.maxHr ?? null, a.calories ?? null, a.elevationM ?? null,
      );
    }
    await pool.query(
      `INSERT INTO garmin_activities (
         user_id, activity_id, date, name, type, distance_m, duration_s, moving_s,
         avg_hr, max_hr, calories, elevation_m
       ) VALUES ${platzhalter.join(",")}
       ON CONFLICT (user_id, activity_id) DO UPDATE SET
         name = EXCLUDED.name,
         type = EXCLUDED.type,
         distance_m = COALESCE(EXCLUDED.distance_m, garmin_activities.distance_m),
         duration_s = COALESCE(EXCLUDED.duration_s, garmin_activities.duration_s),
         avg_hr = COALESCE(EXCLUDED.avg_hr, garmin_activities.avg_hr),
         max_hr = COALESCE(EXCLUDED.max_hr, garmin_activities.max_hr),
         calories = COALESCE(EXCLUDED.calories, garmin_activities.calories),
         updated_at = NOW()`,
      werte,
    );
  };

  /** Alle Aktivitaeten des Nutzers, neueste zuerst. */
  const ladeGarminAktivitaeten = async (userId: number, limit = 60) => {
    const r = await pool.query(
      `SELECT activity_id, date, name, type, distance_m, duration_s, moving_s,
              avg_hr, max_hr, calories, elevation_m
         FROM garmin_activities
        WHERE user_id = $1
        ORDER BY date DESC, activity_id DESC
        LIMIT $2`,
      [userId, limit],
    );
    return r.rows.map((x) => {
      // date kommt als JS-Date-String — auf ISO kuerzen.
      const d = new Date(x.date);
      const iso = Number.isNaN(d.getTime()) ? String(x.date).slice(0, 10) : d.toISOString().slice(0, 10);
      /*
       * Feldnamen an Intervals angleichen (start_date_local, moving_time, avg_hr),
       * damit die Aktivitaeten-Ansicht beide Quellen ohne Sonderfall darstellt.
       */
      const distanz = x.distance_m != null ? Number(x.distance_m) : null;
      const bewegung = x.moving_s != null ? Number(x.moving_s) : x.duration_s != null ? Number(x.duration_s) : null;
      return {
        id: `garmin_${x.activity_id}`,
        name: x.name,
        type: x.type,
        start_date_local: `${iso}T12:00:00`,
        date: iso,
        distance: distanz,
        moving_time: bewegung,
        elapsed_time: x.duration_s != null ? Number(x.duration_s) : null,
        avg_hr: x.avg_hr != null ? Number(x.avg_hr) : null,
        average_hr: x.avg_hr != null ? Number(x.avg_hr) : null,
        max_hr: x.max_hr != null ? Number(x.max_hr) : null,
        calories: x.calories != null ? Number(x.calories) : null,
        total_elevation_gain: x.elevation_m != null ? Number(x.elevation_m) : null,
        average_speed: distanz && bewegung ? distanz / bewegung : null,
        source: 'garmin',
      };
    });
  };


  /*
   * Manuelle Trainings und Wochenplan.
   *
   * Ein `training` ist eine Vorlage (Gym, Laufen, EMOM, HIIT …). `trainings_plan`
   * ordnet Vorlagen Datumsangaben zu — dasselbe Workout an mehreren Tagen, mehrere
   * Workouts an einem Tag. Drag & Drop im Frontend ruft PUT /api/trainings/plan.
   */

  app.get("/api/trainings", requireAuth, async (req: AuthRequest, res) => {
    try {
      const r = await pool.query(
        `SELECT id, name, art, notiz, inhalt, dauer_min, created_at, updated_at
           FROM trainings WHERE user_id = $1 ORDER BY created_at DESC`,
        [req.userId!],
      );
      res.json({ trainings: r.rows });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "load failed" });
    }
  });

  app.post("/api/trainings", requireAuth, async (req: AuthRequest, res) => {
    try {
      const name = String(req.body?.name ?? "").trim();
      if (!name) {
        res.status(400).json({ error: "Name fehlt." });
        return;
      }
      const art = String(req.body?.art ?? "gym").slice(0, 24);
      const inhalt = req.body?.inhalt ?? {};
      const dauer = req.body?.dauerMin != null ? Number(req.body.dauerMin) : null;
      const r = await pool.query(
        `INSERT INTO trainings (user_id, name, art, notiz, inhalt, dauer_min)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id, name, art, notiz, inhalt, dauer_min, created_at, updated_at`,
        [req.userId!, name, art, req.body?.notiz ?? null, inhalt, dauer],
      );
      res.status(201).json({ training: r.rows[0] });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "save failed" });
    }
  });

  app.put("/api/trainings/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const r = await pool.query(
        `UPDATE trainings
            SET name = COALESCE($3, name),
                art = COALESCE($4, art),
                notiz = COALESCE($5, notiz),
                inhalt = COALESCE($6, inhalt),
                dauer_min = COALESCE($7, dauer_min),
                updated_at = NOW()
          WHERE id = $1 AND user_id = $2
          RETURNING id, name, art, notiz, inhalt, dauer_min, created_at, updated_at`,
        [
          req.params.id,
          req.userId!,
          req.body?.name ?? null,
          req.body?.art ?? null,
          req.body?.notiz ?? null,
          req.body?.inhalt ?? null,
          req.body?.dauerMin ?? null,
        ],
      );
      if (!r.rowCount) {
        res.status(404).json({ error: "Training nicht gefunden." });
        return;
      }
      res.json({ training: r.rows[0] });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "save failed" });
    }
  });

  app.delete("/api/trainings/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      await pool.query(`DELETE FROM trainings WHERE id = $1 AND user_id = $2`, [
        req.params.id,
        req.userId!,
      ]);
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "delete failed" });
    }
  });

  /**
   * Wochenplan wiederholen.
   *
   * Der Plan ist ein Muster Montag–Sonntag: Sobald eine Woche leer ist, wird das
   * Muster der letzten gefüllten Woche auf denselben Wochentag der aktuellen
   * Woche kopiert. Damit muss niemand Wochen durchklicken oder kopieren — der
   * Plan läuft weiter, bis er geändert wird.
   */
  async function wiederholeWochenplan(userId: number, von: string, bis: string): Promise<void> {
    if (!von) return;
    const vorhanden = await pool.query(
      `SELECT 1 FROM trainings_plan WHERE user_id = $1 AND datum BETWEEN $2::date AND COALESCE($3::date, $2::date) LIMIT 1`,
      [userId, von, bis || von],
    );
    if (vorhanden.rowCount) return;

    /* Letzte gefüllte Woche vor dem Zeitraum — daraus wird das Muster geholt. */
    const quelle = await pool.query(
      `WITH letzte AS (
         SELECT date_trunc('week', max(datum))::date AS montag
           FROM trainings_plan
          WHERE user_id = $1 AND datum < $2::date
       )
       SELECT p.trainings_id, p.reihenfolge,
              (p.datum - letzte.montag) AS tag_offset
         FROM trainings_plan p, letzte
        WHERE p.user_id = $1
          AND letzte.montag IS NOT NULL
          AND p.datum >= letzte.montag
          AND p.datum < letzte.montag + 7`,
      [userId, von],
    );
    if (!quelle.rowCount) return;

    for (const z of quelle.rows as Array<{ trainings_id: string; reihenfolge: number; tag_offset: number }>) {
      await pool.query(
        `INSERT INTO trainings_plan (user_id, trainings_id, datum, reihenfolge)
         VALUES ($1, $2, date_trunc('week', $3::date)::date + $4::int, $5)
         ON CONFLICT (user_id, trainings_id, datum) DO NOTHING`,
        [userId, z.trainings_id, von, z.tag_offset, z.reihenfolge],
      );
    }
  }

  /** Plan-Eintraege eines Zeitraums (Standard: aktuelle Woche ab Montag). */
  app.get("/api/trainings/plan", requireAuth, async (req: AuthRequest, res) => {
    try {
      const von = String(req.query.von ?? "");
      const bis = String(req.query.bis ?? "");
      /* Woche leer? Dann das Wochenmuster übernehmen, damit der Plan weiterläuft. */
      await wiederholeWochenplan(req.userId!, von, bis);
      const r = await pool.query(
        `SELECT p.id, p.datum::text AS datum, p.reihenfolge,
                t.id AS trainings_id, t.name, t.art, t.inhalt, t.dauer_min
           FROM trainings_plan p
           JOIN trainings t ON t.id = p.trainings_id
          WHERE p.user_id = $1
            AND ($2::date IS NULL OR p.datum >= $2::date)
            AND ($3::date IS NULL OR p.datum <= $3::date)
          ORDER BY p.datum, p.reihenfolge`,
        [req.userId!, von || null, bis || null],
      );
      res.json({ eintraege: r.rows });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "load failed" });
    }
  });

  /** Workout auf einen Tag legen — auch mehrere. */
  app.post("/api/trainings/plan", requireAuth, async (req: AuthRequest, res) => {
    try {
      const trainingsId = String(req.body?.trainingsId ?? "");
      const datum = String(req.body?.datum ?? "");
      if (!trainingsId || !datum) {
        res.status(400).json({ error: "Training und Datum noetig." });
        return;
      }
      // Eigentuemer pruefen — fremde Vorlagen darf man nicht einplanen.
      const eigner = await pool.query(
        `SELECT 1 FROM trainings WHERE id = $1 AND user_id = $2`,
        [trainingsId, req.userId!],
      );
      if (!eigner.rowCount) {
        res.status(404).json({ error: "Training nicht gefunden." });
        return;
      }
      const r = await pool.query(
        `INSERT INTO trainings_plan (user_id, trainings_id, datum, reihenfolge)
         VALUES ($1,$2,$3::date,
                 COALESCE((SELECT MAX(reihenfolge)+1 FROM trainings_plan
                            WHERE user_id = $1 AND datum = $3::date), 0))
         ON CONFLICT (user_id, trainings_id, datum) DO NOTHING
         RETURNING id, datum::text AS datum, reihenfolge`,
        [req.userId!, trainingsId, datum],
      );
      res.status(201).json({ eintrag: r.rows[0] ?? null });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "save failed" });
    }
  });

  app.delete("/api/trainings/plan/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      await pool.query(`DELETE FROM trainings_plan WHERE id = $1 AND user_id = $2`, [
        req.params.id,
        req.userId!,
      ]);
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "delete failed" });
    }
  });

  /**
   * Aktivitäten — ausschließlich aus der Datenbank.
   *
   * Tims Vorgabe: „über die garmin api soll quasi nur zusätzliche werte in die
   * Datenbank kommen aber alles in der app soll direkt auf die datenbankwerte
   * zugreifen … damit alle daten instant überall zu sehen sind und ich keine
   * lade screens habe."
   *
   * Vorher holte dieser Endpunkt bei veraltetem Stand selbst bei Garmin — das
   * dauerte Sekunden und die Liste war leer, solange es lief. Zusätzlich stand
   * in der Prüfung nur `apiKey`, im Login-Betrieb also immer „nicht verbunden":
   * Die Uhr-Einheiten fehlten auf der Trainingsseite komplett.
   *
   * Jetzt: nur `garmin_activities` lesen. Gefüllt wird die Tabelle vom
   * Hintergrund-Takt und vom Abgleich.
   */
  app.get("/api/integrations/garmin/activities", requireAuth, async (req: AuthRequest, res) => {
    try {
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
      const aktivitaeten = await ladeGarminAktivitaeten(req.userId!, limit);
      res.json({ aktivitaeten });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "activities failed" });
    }
  });

  /**
   * Zeitreihen einer Einheit — aus der Datenbank.
   *
   * Tims Vorgabe: Alles, was die App zeigt, kommt aus der Datenbank. Die
   * Detailseite lädt damit sofort; fehlen die Werte noch, werden sie im
   * Hintergrund geholt und beim nächsten Öffnen angezeigt. Kein Warten.
   */
  app.get(
    "/api/integrations/garmin/activities/:id/timeseries",
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        // Nur Einheiten des angemeldeten Nutzers — keine fremden IDs abrufen.
        const id = String(req.params.id).replace(/^garmin_/, "");
        const gehoert = await pool.query(
          "SELECT 1 FROM garmin_activities WHERE user_id = $1 AND activity_id = $2 LIMIT 1",
          [req.userId, Number(id)],
        );
        if ((gehoert.rowCount ?? 0) === 0) {
          res.status(404).json({ error: "Einheit nicht gefunden." });
          return;
        }

        const gespeichert = await pool.query(
          "SELECT punkte FROM garmin_activity_timeseries WHERE user_id = $1 AND activity_id = $2",
          [req.userId, Number(id)],
        );

        if (gespeichert.rowCount) {
          res.json({ aktivitaetId: id, punkte: gespeichert.rows[0].punkte, quelle: "datenbank" });
          return;
        }

        /*
         * Noch nicht vorhanden: leere Antwort, dafür im Hintergrund holen.
         * Die Seite zeigt „wird geladen" — beim nächsten Aufruf stehen die
         * Werte bereit. Das ist die einzige Stelle, die noch nachladen muss,
         * weil Garmin die Zeitreihen nur je Einheit herausgibt.
         */
        res.json({ aktivitaetId: id, punkte: [], quelle: "wird_geladen" });

        const g = await readGarminSettings(req.userId!);
        if (!g.login?.tokens) return;

        void (async () => {
          try {
            const tokens = entschluesseln(g.login!.tokens!);
            const punkte = await garminZeitreiheLogin(tokens, Number(id));
            if (punkte.length) {
              await pool.query(
                `INSERT INTO garmin_activity_timeseries (user_id, activity_id, punkte)
                 VALUES ($1,$2,$3::jsonb)
                 ON CONFLICT (user_id, activity_id) DO UPDATE SET punkte = $3::jsonb`,
                [req.userId, Number(id), JSON.stringify(punkte)],
              );
            }
          } catch (e) {
            console.warn("[garmin] Zeitreihe:", e);
          }
        })();
      } catch (err: unknown) {
        res.status(500).json({ error: err instanceof Error ? err.message : "timeseries failed" });
      }
    },
  );

  /**
   * Fortschritt des laufenden Abgleichs — eigenständig abfragbar.
   *
   * Die Statusleiste im Profil fragt diesen Endpunkt im Sekundentakt und zeigt
   * ihn auch dann weiter, wenn der Nutzer zwischendurch woanders war. Bewusst
   * getrennt von `/api/integrations/garmin`, damit ein Takt von 1 s nicht die
   * ganze Garmin-Antwort samt Tagesreihe durch das Netz zieht.
   */
  app.get("/api/integrations/sync-status", requireAuth, async (req: AuthRequest, res) => {
    const laufend = garminSyncLaufend.get(req.userId!);
    const letzter = letzterLaufVon(req.userId!);
    res.json({
      laeuft: Boolean(laufend),
      schritt: laufend?.schritt ?? letzter?.schritt ?? 0,
      gesamt: laufend?.gesamt ?? letzter?.gesamt ?? 0,
      seit: laufend?.seit ?? letzter?.seit ?? null,
      fertigAm: letzter?.fertigAm ?? null,
      ergebnis: letzter?.ergebnis ?? null,
      fehler: letzter?.fehler ?? null,
    });
  });

  app.get("/api/integrations/garmin", requireAuth, async (req: AuthRequest, res) => {
    try {
      const g = await readGarminSettings(req.userId!);
      /*
       * Quelle ist die Tabelle, nicht der JSON-Cache.
       *
       * Der Login-Refresh schreibt nach `garmin_days`, laesst den Cache aber
       * stehen — der zeigte dann „2 Tage", obwohl 8 in der Tabelle liegen.
       * Der Cache bleibt Rueckfallebene fuer den Fall, dass die Tabelle leer ist.
       */
      const ausTabelle = await pool.query(
        `SELECT date::text AS date, sleep_secs, sleep_score, sleep_quality, hrv, hrv_status,
                resting_hr, min_hr, max_hr, steps, floors, distance_m, active_kcal, total_kcal,
                stress_avg, stress_max, bb_min, bb_max, spo2_avg, respiration, vo2max,
                fitness_age, weight_kg, body_fat, deep_secs, light_secs, rem_secs, awake_secs,
                readiness, readiness_level, training_status, daten_bis
           FROM garmin_days
          WHERE user_id = $1
          ORDER BY date ASC`,
        [req.userId],
      );
      const tage: GarminCache["tage"] = ausTabelle.rows.length
        ? (ausTabelle.rows.map((r) => ({
            date: r.date,
            sleepSecs: r.sleep_secs ?? undefined,
            sleepScore: r.sleep_score ?? undefined,
            sleepQuality: r.sleep_quality ?? undefined,
            hrv: r.hrv ?? undefined,
            hrvStatus: r.hrv_status ?? undefined,
            restingHr: r.resting_hr ?? undefined,
            minHr: r.min_hr ?? undefined,
            maxHr: r.max_hr ?? undefined,
            steps: r.steps ?? undefined,
            floors: r.floors ?? undefined,
            distanceMeters: r.distance_m ?? undefined,
            activeCalories: r.active_kcal ?? undefined,
            totalCalories: r.total_kcal ?? undefined,
            stressAvg: r.stress_avg ?? undefined,
            stressMax: r.stress_max ?? undefined,
            bodyBatteryMin: r.bb_min ?? undefined,
            bodyBatteryMax: r.bb_max ?? undefined,
            spo2Avg: r.spo2_avg != null ? Number(r.spo2_avg) : undefined,
            respiration: r.respiration != null ? Number(r.respiration) : undefined,
            vo2max: r.vo2max != null ? Number(r.vo2max) : undefined,
            fitnessAge: r.fitness_age ?? undefined,
            weightKg: r.weight_kg != null ? Number(r.weight_kg) : undefined,
            bodyFat: r.body_fat != null ? Number(r.body_fat) : undefined,
            deepSecs: r.deep_secs ?? undefined,
            lightSecs: r.light_secs ?? undefined,
            remSecs: r.rem_secs ?? undefined,
            awakeSecs: r.awake_secs ?? undefined,
            readiness: r.readiness ?? undefined,
            readinessLevel: r.readiness_level ?? undefined,
            trainingStatus: r.training_status ?? undefined,
            /* Bis wann Garmin Daten hat — für den ehrlichen „Stand". */
            datenBis: r.daten_bis ?? undefined,
          })) as GarminCache["tage"])
        : g.cache?.tage ?? [];
      const stand = felderStand(tage);
      const laufend = garminSyncLaufend.get(req.userId!);
      const quellen = await leseQuellen(req.userId!);
      res.json({
        /*
         * Verbunden ist, wer ENTWEDER einen Login-Zugang ODER einen
         * Personal-API-Key hat. Der Login ist der Hauptweg, deshalb darf
         * er hier nicht fehlen — sonst meldet die Oberflaeche "nicht
         * verbunden", obwohl der Login laeuft.
         */
        connected: Boolean(g.login?.tokens || g.apiKey),
        loginAktiv: Boolean(g.login?.tokens),
        connectedAt: g.connectedAt ?? null,
        displayName: g.displayName ?? null,
        lastSync: g.lastAutoSyncAt ?? g.cache?.fetchedAt ?? null,
        lastVollSync: g.lastVollSyncAt ?? null,
        lastError: g.lastError ?? null,
        /* Aus der Tabelle abgeleitet, damit die Anzeige zum echten Bestand passt. */
        nichtVerfuegbar: (() => {
          const hat = (f: string) => tage.some((t) => typeof (t as Record<string, unknown>)[f] === "number");
          const fehlt: string[] = [];
          if (!hat("stressAvg")) fehlt.push("Stress");
          if (!hat("bodyBatteryMax")) fehlt.push("Body Battery");
          if (!hat("spo2Avg")) fehlt.push("SpO2");
          if (!hat("respiration")) fehlt.push("Atemfrequenz");
          return fehlt;
        })(),
        /** Wie viele der gewuenschten Felder beim juengsten Tag gefuellt sind. */
        felder: stand,
        /** Laufender Abgleich: null wenn fertig, sonst Fortschritt. */
        laufend: laufend
          ? { schritt: laufend.schritt, gesamt: laufend.gesamt }
          : null,
        tage: tage.length,
        quellen,
        letzterLauf: letzterLaufVon(req.userId!) ?? null,
      });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "load failed" });
    }
  });

  /**
   * Statistik aus der Garmin-Historie.
   *
   * Liest aus `garmin_days` (nicht aus der API), damit auch ältere Zeiträume schnell
   * kommen und die Werte nach einem API-Ausfall erhalten bleiben.
   */

  /**
   * Kalorienverbrauch von heute — fuer das mitwachsende Tagesbudget.
   *
   * Garmin trennt in Grundumsatz (passiv) und Aktivkalorien; `total_kcal` ist die
   * Summe beider und waechst ueber den Tag. Tims Vorgabe: Das Kalorienziel soll
   * auf Start- und Essensseite mitwachsen, sobald Garmin verbunden ist — nicht
   * das fixe Profilziel zeigen.
   */
  app.get("/api/integrations/garmin/heute", requireAuth, async (req: AuthRequest, res) => {
    try {
      const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
      const r = await pool.query(
        `SELECT total_kcal, active_kcal, steps, EXTRACT(EPOCH FROM updated_at)::int AS stand
           FROM garmin_days WHERE user_id = $1 AND date = $2 LIMIT 1`,
        [req.userId!, heute],
      );
      const g = await readGarminSettings(req.userId!);

      let zeile = r.rows[0] as
        | { total_kcal?: number; active_kcal?: number; steps?: number; stand?: number }
        | undefined;
      let total = zeile?.total_kcal ?? null;
      let aktiv = zeile?.active_kcal ?? null;
      let schritte = zeile?.steps ?? null;

      /*
       * Antwort sofort — noch bevor Garmin gefragt wird.
       *
       * Tims Beobachtung: „wenn man die app lädt, steht erst 2.300 drin, obwohl
       * Garmin geladen ist". Ursache: Der Endpunkt holte bei altem Stand erst
       * live bei Garmin und antwortete dann — bis dahin zeigte die Seite das
       * Profilziel. Jetzt geht der gespeicherte Wert sofort raus, das
       * Nachholen passiert danach.
       */
      const antwortSenden = (nachgeholt: boolean) => {
        res.json({
          verbunden: Boolean(g.login?.tokens || g.apiKey),
          datum: heute,
          gesamt: total,
          aktiv,
          passiv: total != null && aktiv != null ? Math.max(0, total - aktiv) : null,
          schritte,
          /** Wurde für diese Antwort live bei Garmin nachgefragt? */
          nachgeholt,
          /** Zeitpunkt des gespeicherten Werts (Unix-Sekunden) — für „vor X Min". */
          standSek: zeile?.stand ?? null,
        });
      };

      /*
       * Ist der gespeicherte Stand älter als zwei Minuten? Dann im Hintergrund
       * nachziehen und die Seite beim nächsten Abruf den frischeren Wert zeigen
       * lassen. Bewusst kein Warten: Die Anzeige soll sofort stehen.
       */
      const stand = zeile?.stand ? zeile.stand * 1000 : 0;
      const veraltet = !zeile || Date.now() - stand > 2 * 60_000;

      if (veraltet && g.login?.tokens) {
        /* Antwort zuerst raus — dann in Ruhe nachholen. */
        antwortSenden(false);

        void (async () => {
          try {
            const frisch = await tagVoll(entschluesseln(g.login.tokens!), heute, { leicht: true });
            if (frisch.totalCalories != null || frisch.activeCalories != null) {
              await speichereLoginTage(req.userId!, [frisch]);
            }
          } catch {
            /* Uhr nicht erreichbar — der gespeicherte Stand bleibt gültig. */
          }
        })();
        return;
      }

      /* Frisch genug: Bilanzverlauf und Schnitt mitgeben, dann antworten. */
      const [schnitt, verlauf] = await Promise.all([
        pool.query(
          `SELECT AVG(total_kcal)::int AS total, AVG(active_kcal)::int AS aktiv, COUNT(*)::int AS tage
             FROM garmin_days
            WHERE user_id = $1 AND date < $2 AND total_kcal IS NOT NULL AND total_kcal > 0`,
          [req.userId!, heute],
        ),
        pool.query(
          `SELECT date::text AS date, total_kcal::int AS total
             FROM garmin_days
            WHERE user_id = $1 AND date >= ($2::date - INTERVAL '13 days')
              AND date <= $2::date AND total_kcal IS NOT NULL AND total_kcal > 0
            ORDER BY date`,
          [req.userId!, heute],
        ),
      ]);

      res.json({
        verbunden: Boolean(g.login?.tokens || g.apiKey),
        datum: heute,
        verlauf: verlauf.rows,
        gesamt: total,
        aktiv,
        passiv: total != null && aktiv != null ? Math.max(0, total - aktiv) : null,
        schritte,
        nachgeholt: false,
        standSek: zeile?.stand ?? null,
        schnitt: {
          gesamt: schnitt.rows[0]?.total ?? null,
          aktiv: schnitt.rows[0]?.aktiv ?? null,
          tage: schnitt.rows[0]?.tage ?? 0,
        },
        stand: g.lastAutoSyncAt ?? g.cache?.fetchedAt ?? null,
      });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "load failed" });
    }
  });

  app.get("/api/integrations/garmin/stats", requireAuth, async (req: AuthRequest, res) => {
    try {
      const tage = Math.min(365, Math.max(7, Number(req.query.days) || 30));
      const r = await pool.query(
        `SELECT * FROM garmin_days
          WHERE user_id = $1 AND date >= CURRENT_DATE - ($2 || ' days')::interval
          ORDER BY date ASC`,
        [req.userId, tage],
      );
      const rows = r.rows as Array<Record<string, unknown>>;

      /** Durchschnitt über die vorhandenen Werte einer Spalte. */
      const mittel = (feld: string): number | null => {
        const werte = rows
          .map((x) => Number(x[feld]))
          .filter((v) => Number.isFinite(v) && v !== 0);
        if (!werte.length) return null;
        return Math.round((werte.reduce((a, b) => a + b, 0) / werte.length) * 10) / 10;
      };
      const summe = (feld: string): number =>
        rows.reduce((a, x) => a + (Number(x[feld]) || 0), 0);

      res.json({
        tage: rows.length,
        zeitraum: tage,
        reihe: rows.map((x) => ({
          date: x.date,
          schlafStunden: x.sleep_secs ? Math.round((Number(x.sleep_secs) / 3600) * 10) / 10 : null,
          schlafScore: x.sleep_score,
          hrv: x.hrv,
          ruhepuls: x.resting_hr,
          schritte: x.steps,
          etagen: x.floors,
          stress: x.stress_avg,
          bodyBatteryMin: x.bb_min,
          bodyBatteryMax: x.bb_max,
          spo2: x.spo2_avg,
          atemfrequenz: x.respiration,
          vo2max: x.vo2max,
          fitnessalter: x.fitness_age,
          gewicht: x.weight_kg,
          koerperfett: x.body_fat,
        })),
        schnitt: {
          schlafStunden: mittel("sleep_secs") ? Math.round((Number(mittel("sleep_secs")) / 3600) * 10) / 10 : null,
          schlafScore: mittel("sleep_score"),
          hrv: mittel("hrv"),
          ruhepuls: mittel("resting_hr"),
          schritte: mittel("steps"),
          etagen: mittel("floors"),
          stress: mittel("stress_avg"),
          bodyBatteryMin: mittel("bb_min"),
          bodyBatteryMax: mittel("bb_max"),
          spo2: mittel("spo2_avg"),
          atemfrequenz: mittel("respiration"),
          vo2max: mittel("vo2max"),
          fitnessalter: mittel("fitness_age"),
          gewicht: mittel("weight_kg"),
        },
        gesamt: {
          schritte: summe("steps"),
          etagen: summe("floors"),
          streckeKm: Math.round((summe("distance_m") / 1000) * 10) / 10,
          aktiveKcal: summe("active_kcal"),
        },
      });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "stats failed" });
    }
  });


  /*
   * Garmin-Login (inoffiziell) — zweiter Zugangsweg neben der Personal API.
   *
   * Vorteil: kein 100-Anfragen-Limit und Felder, die die offizielle API
   * vorenthält (Schlafphasen, naechtlicher SpO2, Atemfrequenz, Body Battery).
   *
   * Die Zugangsdaten werden mit AES-256-GCM verschluesselt gespeichert; der
   * Klartext liegt nur waehrend des Anmeldevorgangs im Speicher.
   */


  /**
   * Volle Historie ueber den Login-Zugang nachziehen.
   *
   * Einmalig (oder nach Bedarf) — holt jeden Tag einzeln und schreibt ihn in
   * `garmin_days`. Fortschritt laeuft ueber `garminSyncLaufend`, damit die
   * Oberflaeche einen Balken zeigen kann.
   */
  app.post("/api/integrations/garmin/login/historie", requireAuth, async (req: AuthRequest, res) => {
    try {
      const g = await readGarminSettings(req.userId!);
      if (!g.login?.tokens) {
        res.status(400).json({ error: "Garmin-Login ist nicht verbunden." });
        return;
      }
      const tage = Math.min(730, Math.max(7, Number(req.body?.tage) || 365));

      // Sofort antworten, im Hintergrund weiterlaufen: 365 Tage dauern Minuten.
      res.json({ ok: true, tage, gestartet: true });

      void (async () => {
        try {
          const tokens = entschluesseln(g.login!.tokens!);
          garminSyncLaufend.set(req.userId!, { schritt: 0, gesamt: tage, seit: Date.now() });
          const alle = await historieVoll(tokens, tage, (erledigt, gesamt) =>
            garminSyncLaufend.set(req.userId!, { schritt: erledigt, gesamt, seit: Date.now() }),
          );
          await speichereLoginTage(req.userId!, alle);

          const frisch = await readGarminSettings(req.userId!);
          await writeGarminSettings(req.userId!, {
            ...frisch,
            cache: {
              ...(frisch.cache ?? { fetchedAt: new Date().toISOString(), tage: [], nichtVerfuegbar: [] }),
              fetchedAt: new Date().toISOString(),
              tage: alle as unknown as GarminCache["tage"],
            },
            lastError: undefined,
            lastAutoSyncAt: new Date().toISOString(),
            lastVollSyncAt: new Date().toISOString(),
          });
          garminSyncLaufend.delete(req.userId!);
          console.log(`[garmin-login] Historie: ${alle.length} Tage uebernommen`);
        } catch (e) {
          garminSyncLaufend.delete(req.userId!);
          const frisch = await readGarminSettings(req.userId!).catch(() => ({} as GarminSettings));
          await writeGarminSettings(req.userId!, {
            ...frisch,
            lastError: e instanceof Error ? e.message : "Historie fehlgeschlagen.",
          }).catch(() => {});
          console.warn("[garmin-login] Historie:", e);
        }
      })();
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Historie fehlgeschlagen." });
    }
  });

  /** Status des Login-Zugangs (ohne Zugangsdaten zurueckzugeben). */
  app.get("/api/integrations/garmin/login", requireAuth, async (req: AuthRequest, res) => {
    try {
      const g = await readGarminSettings(req.userId!);
      const l = g.login;
      if (!l?.email) {
        res.json({ verbunden: false });
        return;
      }
      // E-Mail entschluesseln, aber nur maskiert zurueckgeben.
      let mail: string | null = null;
      try {
        const roh = entschluesseln(l.email);
        const [name, domain] = roh.split("@");
        mail = domain ? `${name.slice(0, 2)}***@${domain}` : null;
      } catch {
        mail = null;
      }
      res.json({
        verbunden: Boolean(l.tokens),
        email: mail,
        verbundenAm: l.verbundenAm ?? null,
        fehler: l.fehler ?? null,
      });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Status fehlgeschlagen." });
    }
  });

  /** Schritt 1: E-Mail und Passwort. Antwortet ggf. mit "mfa". */
  app.post("/api/integrations/garmin/login", requireAuth, async (req: AuthRequest, res) => {
    try {
      const email = String(req.body?.email ?? "").trim();
      const passwort = String(req.body?.password ?? "");
      if (!email || !passwort) {
        res.status(400).json({ error: "E-Mail und Passwort sind nötig." });
        return;
      }

      const ergebnis = await anmelden(req.userId!, email, passwort);

      if (ergebnis.status === "fehler") {
        res.status(401).json({ error: ergebnis.meldung });
        return;
      }

      // Offene 2FA: Zugangsdaten trotzdem merken, aber noch keine Tokens.
      const g = await readGarminSettings(req.userId!);
      await writeGarminSettings(req.userId!, {
        ...g,
        login: {
          ...(g.login ?? {}),
          email: verschluesseln(email),
          passwort: verschluesseln(passwort),
          fehler: undefined,
        },
      });

      if (ergebnis.status === "mfa") {
        res.json({ ok: false, mfa: true, hinweis: ergebnis.hinweis });
        return;
      }

      await writeGarminSettings(req.userId!, {
        ...(await readGarminSettings(req.userId!)),
        login: {
          ...((await readGarminSettings(req.userId!)).login ?? {}),
          tokens: verschluesseln(ergebnis.tokens),
          verbundenAm: new Date().toISOString(),
          fehler: undefined,
        },
      });
      res.json({ ok: true, mfa: false });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Anmeldung fehlgeschlagen." });
    }
  });

  /** Schritt 2: 2FA-Code einsenden. */
  app.post("/api/integrations/garmin/login/mfa", requireAuth, async (req: AuthRequest, res) => {
    try {
      const code = String(req.body?.code ?? "").trim();
      if (!/^\d{4,8}$/.test(code)) {
        res.status(400).json({ error: "Bitte den Code aus SMS oder App eingeben." });
        return;
      }

      const ergebnis = await bestaetigeMfa(req.userId!, code);
      if (ergebnis.status !== "ok") {
        res.status(401).json({ error: ergebnis.status === "fehler" ? ergebnis.meldung : "Unbekannt." });
        return;
      }

      const g = await readGarminSettings(req.userId!);
      await writeGarminSettings(req.userId!, {
        ...g,
        login: {
          ...(g.login ?? {}),
          tokens: verschluesseln(ergebnis.tokens),
          verbundenAm: new Date().toISOString(),
          fehler: undefined,
        },
      });
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Bestätigung fehlgeschlagen." });
    }
  });

  /** Login-Zugang trennen (Zugangsdaten und Tokens löschen). */
  app.delete("/api/integrations/garmin/login", requireAuth, async (req: AuthRequest, res) => {
    try {
      const g = await readGarminSettings(req.userId!);
      await writeGarminSettings(req.userId!, { ...g, login: undefined });
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Trennen fehlgeschlagen." });
    }
  });

  app.post("/api/integrations/garmin/connect", requireAuth, async (req: AuthRequest, res) => {
    try {
      // Eingabe säubern: Anführungszeichen, "ApiKey "-Vorsatz und Zeilenumbrüche
      // passieren beim Kopieren leicht — Garmin lehnt den Key dann mit 401 ab.
      const roh = String(req.body?.apiKey ?? "").trim();
      const apiKey = roh
        .replace(/^["']|["']$/g, "")
        .replace(/^ApiKey\s+/i, "")
        .replace(/\s+/g, "");
      if (!apiKey) {
        res.status(400).json({ error: "Garmin-API-Key fehlt." });
        return;
      }
      /*
       * Key zuerst auf Gültigkeit pruefen — dann speichern.
       *
       * Vorher wurde erst der volle Abgleich gefahren und der Key erst danach
       * gespeichert. Scheiterte irgendein Endpunkt, war der Key weg und man
       * musste ihn erneut erzeugen. Jetzt: gueltiger Key wird gespeichert, auch
       * wenn einzelne Endpunkte keine Daten liefern.
       */
      await garminToken(apiKey);
      await writeGarminSettings(req.userId!, {
        apiKey,
        connectedAt: new Date().toISOString(),
        lastError: undefined,
      });

      garminSyncLaufend.set(req.userId!, { schritt: 0, gesamt: 0, seit: Date.now() });
      const cache = await syncGarmin(apiKey, 30, (f) =>
        garminSyncLaufend.set(req.userId!, { ...f, seit: Date.now() }),
      );
      garminSyncLaufend.delete(req.userId!);
      await writeGarminSettings(req.userId!, {
        apiKey,
        connectedAt: new Date().toISOString(),
        displayName: cache.displayName,
        cache,
        lastAutoSyncAt: new Date().toISOString(),
      });
      await speichereGarminTage(req.userId!, cache.tage).catch((e) =>
        console.warn("[garmin] Historie:", e),
      );
      const ersteAktivitaeten = await syncGarminAktivitaeten(apiKey, 40).catch(() => []);
      await speichereGarminAktivitaeten(req.userId!, ersteAktivitaeten).catch(() => {});
      res.json({
        ok: true,
        aktivitaeten: ersteAktivitaeten.length,
        displayName: cache.displayName ?? null,
        tage: cache.tage.length,
        nichtVerfuegbar: cache.nichtVerfuegbar,
      });
    } catch (err: unknown) {
      res.status(400).json({
        error:
          err instanceof Error && err.name === "TimeoutError"
            ? "Garmin hat nicht rechtzeitig geantwortet."
            : err instanceof Error
              ? err.message
              : "Verbindung fehlgeschlagen.",
      });
    }
  });

  app.post("/api/integrations/garmin/sync", requireAuth, async (req: AuthRequest, res) => {
    try {
      const g = await readGarminSettings(req.userId!);
      if (!g.apiKey) {
        res.status(400).json({ error: "Garmin ist nicht verbunden." });
        return;
      }
      /*
       * Vorab pruefen, ob der Key noch gilt. Ein abgelaufener Key fuehrte
       * frueher zu einem "erfolgreichen" Abgleich mit alten Cache-Werten -
       * die App zeigte dann ewig denselben Stand, ohne Fehlermeldung.
       */
      try {
        await garminToken(g.apiKey);
      } catch (e) {
        const meldung =
          e instanceof Error
            ? e.message
            : "Der Garmin-Zugang ist abgelaufen. Bitte einen neuen API-Key eintragen.";
        await writeGarminSettings(req.userId!, { ...g, lastError: meldung }).catch(() => {});
        res.status(401).json({ error: meldung, keyAbgelaufen: true });
        return;
      }
      const t0 = Date.now();
      garminSyncLaufend.set(req.userId!, { schritt: 0, gesamt: 0, seit: Date.now() });
      const cache = await syncGarmin(g.apiKey, 30, (f) =>
        garminSyncLaufend.set(req.userId!, { ...f, seit: Date.now() }),
      );
      await writeGarminSettings(req.userId!, {
        ...g,
        cache,
        displayName: cache.displayName ?? g.displayName,
        lastError: undefined,
        lastAutoSyncAt: new Date().toISOString(),
        // Manueller Sync ist immer ein VOLLER Lauf - sonst denkt der Takt,
        // es sei nur der leichte gewesen und holt die Historie nie.
        lastVollSyncAt: new Date().toISOString(),
      });
      await speichereGarminTage(req.userId!, cache.tage).catch((e) =>
        console.warn("[garmin] Historie:", e),
      );
      garminSyncLaufend.delete(req.userId!);
      res.json({
        ok: true,
        ms: Date.now() - t0,
        tage: cache.tage.length,
        felder: felderStand(cache.tage),
        nichtVerfuegbar: cache.nichtVerfuegbar,
      });
    } catch (err: unknown) {
      garminSyncLaufend.delete(req.userId!);
      const meldung = err instanceof Error ? err.message : "Sync fehlgeschlagen.";
      const g = await readGarminSettings(req.userId!).catch(() => ({} as GarminSettings));
      await writeGarminSettings(req.userId!, { ...g, lastError: meldung }).catch(() => {});
      res.status(500).json({ error: meldung });
    }
  });

  /**
   * Personal API trennen.
   *
   * Wichtig: nur die Felder der Personal API entfernen (Key, Cache, Zähler).
   * Der Login-Zugang ist ein eigener Weg und bleibt bestehen — vorher wurde der
   * ganze `garmin`-Block gelöscht, womit auch die Anmeldedaten weg waren.
   */
  app.delete("/api/integrations/garmin", requireAuth, async (req: AuthRequest, res) => {
    try {
      await pool.query(
        `UPDATE users
            SET profile_extras = jsonb_set(
                  COALESCE(profile_extras,'{}'::jsonb),
                  '{garmin}',
                  COALESCE(profile_extras->'garmin','{}'::jsonb)
                    - 'apiKey' - 'cache' - 'connectedAt' - 'displayName'
                    - 'lastError' - 'lastAutoSyncAt' - 'lastVollSyncAt'
                ),
                updated_at = NOW()
          WHERE id = $1`,
        [req.userId],
      );
      res.json({ ok: true });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "disconnect failed" });
    }
  });

  /**
   * Datenquellen umschalten.
   *
   * Tim wollte Personal API und Intervals.icu VORÜBERGEHEND aus, um den
   * Garmin-Login allein zu beurteilen. Der Login selbst lässt sich hier nicht
   * abschalten — er ist die Quelle, die geprüft werden soll.
   */
  app.put("/api/integrations/quellen", requireAuth, async (req: AuthRequest, res) => {
    try {
      const personalApi =
        typeof req.body?.personalApi === "boolean" ? req.body.personalApi : undefined;
      const intervals = typeof req.body?.intervals === "boolean" ? req.body.intervals : undefined;
      if (personalApi === undefined && intervals === undefined) {
        res.status(400).json({ error: "Keine Quelle angegeben." });
        return;
      }
      const schreiben =
        typeof req.body?.schreiben === "boolean" ? req.body.schreiben : undefined;
      await setzeQuellen(req.userId!, { personalApi, intervals, schreiben });
      res.json({ ok: true, quellen: await leseQuellen(req.userId!) });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Speichern fehlgeschlagen." });
    }
  });

  /**
   * Werte aus der App sofort nach Garmin schreiben.
   *
   * Getrennt vom Abgleich, damit ein frisch eingetragenes Gewicht nicht erst
   * auf den naechsten 5-Minuten-Takt warten muss.
   */
  app.post("/api/integrations/garmin/schreiben", requireAuth, async (req: AuthRequest, res) => {
    try {
      const ergebnis = await schreibeNachGarmin(req.userId!);
      res.json({ ok: !ergebnis.fehler, ...ergebnis });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Schreiben fehlgeschlagen." });
    }
  });

  app.get("/api/integrations/intervals", requireAuth, async (req: AuthRequest, res) => {
    try {
      const s = await readIntervalsSettings(req.userId!);
      const cache = s.cache;
      res.json({
        connected: Boolean(s.apiKey),
        athleteId: s.athleteId ?? "0",
        athleteName: s.athleteName ?? cache?.athlete?.name ?? null,
        connectedAt: s.connectedAt ?? null,
        lastError: s.lastError ?? null,
        lastSync: cache?.fetchedAt ?? null,
        syncIntervalHours: normalisiereIntervall(s.syncIntervalHours),
        syncIntervalOptions: SYNC_INTERVAL_OPTIONS,
        syncWorkouts: s.syncWorkouts !== false,
        activityCount: cache?.activities?.length ?? 0,
        latestActivity: cache?.activities?.[0]
          ? {
              date: String(cache.activities[0].start_date_local ?? "").slice(0, 10),
              type: cache.activities[0].type ?? null,
              name: cache.activities[0].name ?? null,
            }
          : null,
        fitness: cache?.wellness?.length
          ? {
              ctl: cache.wellness[cache.wellness.length - 1].ctl ?? null,
              atl: cache.wellness[cache.wellness.length - 1].atl ?? null,
              tsb: cache.wellness[cache.wellness.length - 1].tsb ?? null,
            }
          : null,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Status konnte nicht geladen werden." });
    }
  });

  /** Verbinden: Key pruefen, Stammdaten holen, sofort einmal synchronisieren. */
  app.post("/api/integrations/intervals/connect", requireAuth, async (req: AuthRequest, res) => {
    try {
      const apiKey = String(req.body?.apiKey ?? "").trim();
      const athleteIdRaw = String(req.body?.athleteId ?? "0").trim();
      if (!apiKey) {
        res.status(400).json({ error: "API-Key fehlt." });
        return;
      }
      const athleteId = athleteIdRaw || "0";

      // Erst pruefen, dann speichern - so landet kein ungueltiger Key in der DB.
      const athlete = await fetchAthlete(apiKey, athleteId);
      const cache = await syncIntervals(apiKey, athleteId, 30);

      const settings: IntervalsSettings = {
        apiKey,
        athleteId,
        connectedAt: new Date().toISOString(),
        athleteName: typeof athlete.name === "string" ? athlete.name : undefined,
        lastError: undefined,
        cache,
      };
      await writeIntervalsSettings(req.userId!, settings);

      res.json({
        ok: true,
        athleteName: settings.athleteName ?? null,
        activityCount: cache.activities.length,
        lastSync: cache.fetchedAt,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Verbindung fehlgeschlagen.";
      const prev = await readIntervalsSettings(req.userId!).catch(() => ({} as IntervalsSettings));
      await writeIntervalsSettings(req.userId!, { ...prev, lastError: msg }).catch(() => {});
      res.status(400).json({ error: msg });
    }
  });

  /** Erneut synchronisieren (Coach sieht frische Daten). */
  /**
   * Alles neu ziehen — Garmin komplett plus die Trainingslast aus Intervals.
   *
   * Der Aktualisieren-Button in der Wellness-Ansicht rief bisher nur den
   * Intervals-Sync auf. Bei Garmin als Quelle passierte damit nichts: kein
   * Tageswert, keine Aktivität, keine Historie wurde neu geholt.
   *
   * Hier läuft stattdessen der vollständige Abgleich aller Kanäle:
   * Tageswerte (27 Felder), Aktivitäten, Historientabelle.
   */
  app.post("/api/integrations/refresh", requireAuth, async (req: AuthRequest, res) => {
    const t0 = Date.now();
    const tage = Math.min(120, Math.max(7, Number(req.body?.days) || 30));
    const bericht: Record<string, unknown> = {};

    try {
      const g = await readGarminSettings(req.userId!);
      const quellen = await leseQuellen(req.userId!);

      /* ---------- Weg 1: Login (bevorzugt, alle Felder) ---------- */
      if (g.login?.tokens) {
        garminSyncLaufend.set(req.userId!, { schritt: 0, gesamt: tage, seit: Date.now() });
        merkeLauf(req.userId!, { schritt: 0, gesamt: tage, seit: Date.now() });
        try {
          const tokens = entschluesseln(g.login.tokens);
          const heuteYmd = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
          const sammlung: LoginTag[] = [];

          /*
           * Voller Lauf: jeder Tag einzeln mit allen Feldern. Bewusst nicht
           * `historieVoll`, weil der Refresh nur die letzten `tage` anfassen
           * soll — die Historie hat ihren eigenen Endpunkt.
           */
          let fertig = 0;
          for (let i = 0; i < tage; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const ymd = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
            try {
              /* Heute braucht alle Felder, aeltere Tage nur die Tageswerte. */
              sammlung.push(await tagVoll(tokens, ymd, { leicht: ymd !== heuteYmd }));
            } catch (e) {
              console.warn('[garmin-refresh] Tag', ymd, e);
            }
            fertig++;
            garminSyncLaufend.set(req.userId!, { schritt: fertig, gesamt: tage, seit: Date.now() });
            setzeLaufSchritt(req.userId!, fertig, tage);
          }

          await speichereLoginTage(req.userId!, sammlung);

          const anzahlAktivitaeten = await (async () => {
            try {
              const ak = await garminAktivitaetenLogin(tokens, 40);
              await speichereGarminAktivitaeten(req.userId!, ak as never).catch(() => {});
              return ak.length;
            } catch {
              return 0;
            }
          })();

          await writeGarminSettings(req.userId!, {
            ...g,
            lastAutoSyncAt: new Date().toISOString(),
            lastVollSyncAt: new Date().toISOString(),
            lastError: undefined,
          });

          bericht.garmin = {
            tage: sammlung.length,
            aktivitaeten: anzahlAktivitaeten,
            quelle: 'login',
          };
          merkeLauf(req.userId!, {
            schritt: sammlung.length,
            gesamt: tage,
            seit: letzterLaufVon(req.userId!)?.seit ?? Date.now(),
            fertigAm: Date.now(),
            ergebnis: `${sammlung.length} Tage · ${anzahlAktivitaeten} Einheiten`,
          });
        } catch (e) {
          bericht.garmin = { fehler: e instanceof Error ? e.message : 'Garmin-Abgleich fehlgeschlagen.' };
          merkeLauf(req.userId!, {
            schritt: letzterLaufVon(req.userId!)?.schritt ?? 0,
            gesamt: tage,
            seit: letzterLaufVon(req.userId!)?.seit ?? Date.now(),
            fertigAm: Date.now(),
            fehler: e instanceof Error ? e.message : 'Garmin-Abgleich fehlgeschlagen.',
          });
        } finally {
          garminSyncLaufend.delete(req.userId!);
        }
      } else if (g.apiKey && quellen.personalApi) {
        // Startwert 0/0 — syncGarmin meldet gleich danach die echte Gesamtzahl.
        garminSyncLaufend.set(req.userId!, { schritt: 0, gesamt: 0, seit: Date.now() });
        try {
          // Ein einziger vollständiger Durchlauf: alle 27 Felder, alle Aktivitäten.
          const cache = await syncGarmin(g.apiKey, tage, (f) =>
            garminSyncLaufend.set(req.userId!, { ...f, seit: Date.now() }),
          );
          await writeGarminSettings(req.userId!, {
            ...g,
            cache,
            displayName: cache.displayName ?? g.displayName,
            lastError: undefined,
            lastAutoSyncAt: new Date().toISOString(),
          });
          await speichereGarminTage(req.userId!, cache.tage).catch((e) =>
            console.warn("[garmin] Historie:", e),
          );
          const aktivitaeten = await syncGarminAktivitaeten(g.apiKey, 40).catch(() => []);
          await speichereGarminAktivitaeten(req.userId!, aktivitaeten).catch((e) =>
            console.warn("[garmin] Aktivitaeten:", e),
          );

          bericht.garmin = {
            tage: cache.tage.length,
            felder: felderStand(cache.tage),
            aktivitaeten: aktivitaeten.length,
            nichtVerfuegbar: cache.nichtVerfuegbar,
          };
        } catch (e) {
          bericht.garmin = { fehler: e instanceof Error ? e.message : "Garmin-Abgleich fehlgeschlagen." };
        } finally {
          // Immer aufraeumen, auch im Fehlerfall — sonst steht die App ewig auf "laeuft".
          garminSyncLaufend.delete(req.userId!);
        }
      } else {
        bericht.garmin = { nichtVerbunden: true };
      }

      /*
       * Werte aus der App zurueck auf die Uhr. Laeuft nach dem Lesen, damit
       * ein gerade eingetragenes Gewicht sofort bei Garmin steht. Der Merker
       * in `garmin_schreibstand` verhindert Wiederholungen.
       */
      if (quellen.schreiben && g.login?.tokens) {
        try {
          bericht.geschrieben = await schreibeNachGarmin(req.userId!);
        } catch (e) {
          bericht.geschrieben = { fehler: e instanceof Error ? e.message : 'Schreiben fehlgeschlagen.' };
        }
      }

      // Intervals zusaetzlich, falls verbunden und nicht abgeschaltet.
      const s = quellen.intervals ? await readIntervalsSettings(req.userId!) : ({} as IntervalsSettings);
      if (s.apiKey) {
        try {
          const cache = await syncIntervals(s.apiKey, s.athleteId ?? "0", tage);
          await writeIntervalsSettings(req.userId!, {
            ...s,
            cache,
            lastError: undefined,
            lastAutoSyncAt: new Date().toISOString(),
          });
          bericht.intervals = { tage: cache.wellness?.length ?? 0 };
        } catch (e) {
          bericht.intervals = { fehler: e instanceof Error ? e.message : "Intervals-Abgleich fehlgeschlagen." };
        }
      }

      res.json({ ok: true, ms: Date.now() - t0, ...bericht });
    } catch (err: unknown) {
      garminSyncLaufend.delete(req.userId!);
      res.status(500).json({ error: err instanceof Error ? err.message : "Aktualisieren fehlgeschlagen." });
    }
  });

  app.post("/api/integrations/intervals/sync", requireAuth, async (req: AuthRequest, res) => {
    try {
      const s = await readIntervalsSettings(req.userId!);
      if (!s.apiKey) {
        res.status(400).json({ error: "Intervals.icu ist nicht verbunden." });
        return;
      }
      const days = Math.min(120, Math.max(7, Number(req.body?.days) || 30));

      // Vorher/nachher vergleichen: so sieht man, ob wirklich Neues kam.
      const vorher = s.cache?.activities?.[0]?.start_date_local
        ? String(s.cache.activities[0].start_date_local).slice(0, 10)
        : null;

      const altHeute = s.cache?.wellness?.[s.cache.wellness.length - 1];

      const cache = await syncIntervals(s.apiKey, s.athleteId ?? "0", days);
      await writeIntervalsSettings(req.userId!, { ...s, cache, lastError: undefined, lastAutoSyncAt: new Date().toISOString() });

      // Wellness-Fortschritt des laufenden Tages mitmelden (Schritte, Puls, Schlaf).
      const neuHeute = cache.wellness?.[cache.wellness.length - 1];
      const wellnessNeu = (() => {
        if (!neuHeute) return null;
        if (!altHeute || altHeute.date !== neuHeute.date) return neuHeute.date;
        const gleich =
          altHeute.steps === neuHeute.steps &&
          altHeute.restingHr === neuHeute.restingHr &&
          altHeute.hrv === neuHeute.hrv &&
          altHeute.sleepSecs === neuHeute.sleepSecs;
        return gleich ? null : neuHeute.date;
      })();

      const nachher = cache.activities?.[0]?.start_date_local
        ? String(cache.activities[0].start_date_local).slice(0, 10)
        : null;
      const neu = Boolean(nachher && nachher !== vorher);

      res.json({
        ok: true,
        activityCount: cache.activities.length,
        lastSync: cache.fetchedAt,
        neuesteAktivitaet: nachher,
        neuSeitLetztemSync: neu,
        wellnessAktualisiert: wellnessNeu,
        todayWellness: neuHeute
          ? {
              date: neuHeute.date,
              schritte: neuHeute.steps ?? null,
              ruhepuls: neuHeute.restingHr ?? null,
              hrv: neuHeute.hrv ?? null,
              schlafStunden: neuHeute.sleepSecs ? Math.round((neuHeute.sleepSecs / 3600) * 10) / 10 : null,
            }
          : null,
        // Der Abgleich mit der Uhr laeuft bei Intervals automatisch. Keine neuen
        // Aktivitaeten heisst in der Regel: es wurde nicht trainiert, kein Fehler.
        hinweis: neu ? null : "Seit dem letzten Training ist keine neue Aktivität dazugekommen.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync fehlgeschlagen.";
      const s = await readIntervalsSettings(req.userId!).catch(() => ({} as IntervalsSettings));
      await writeIntervalsSettings(req.userId!, { ...s, lastError: msg }).catch(() => {});
      res.status(502).json({ error: msg });
    }
  });

  /** Wellness-/Garmin-Daten fuer die eigene Ansicht (Schlaf, Schritte, HRV, Form). */
  app.get("/api/integrations/intervals/wellness", requireAuth, async (req: AuthRequest, res) => {
    try {
      const tage = Math.min(180, Math.max(7, Number(req.query.days) || 60));

      /*
       * Datenquelle ist Garmin (direkt), nicht Intervals.
       *
       * Tims Vorgabe: „lesen nur aus der Garmin API, über Intervals nur schreiben".
       * Garmin liefert Schlaf, HRV, Stress, Body Battery, SpO₂ tagesaktuell;
       * Intervals trägt nur noch die Trainingslast (CTL/ATL/TSB) und die Einheiten
       * bei, weil die Personal API die nicht in dieser Form hergibt.
       */
      const g = await readGarminSettings(req.userId!);

      /*
       * Datenquelle ist die Tabelle `garmin_days`, nicht der JSON-Cache.
       *
       * Der Cache wird beim leichten 5-Minuten-Lauf nur mit den Feldern
       * gefuellt, die dieser Lauf holt — HRV, Stress, Body Battery und SpO2
       * fehlen dort also. Die Tabelle wird bei jedem Lauf vollstaendig
       * geschrieben und haelt die ganze Historie. Deshalb hier aus der
       * Tabelle lesen und den Cache nur als Rueckfallebene nehmen.
       */
      const tabellenTage = await pool.query(
        `SELECT date::text AS date, sleep_secs, sleep_score, sleep_quality, deep_secs, light_secs,
                rem_secs, awake_secs, sleep_stress, sleep_hr, spo2_night, respiration_night,
                hrv, hrv_status, resting_hr, min_hr, max_hr, steps, floors, distance_m,
                active_kcal, total_kcal, stress_avg, stress_max, bb_min, bb_max,
                spo2_avg, respiration, vo2max, fitness_age, weight_kg, body_fat,
                readiness, readiness_level, training_status, daten_bis
           FROM garmin_days
          WHERE user_id = $1 AND date >= CURRENT_DATE - ($2 || ' days')::interval
          ORDER BY date ASC`,
        [req.userId, tage],
      );

      const garminTage: GarminCache["tage"] = tabellenTage.rows.length
        ? (tabellenTage.rows.map((r) => ({
            date: r.date,
            sleepSecs: r.sleep_secs ?? undefined,
            sleepScore: r.sleep_score ?? undefined,
            sleepQuality: r.sleep_quality ?? undefined,
            deepSecs: r.deep_secs ?? undefined,
            lightSecs: r.light_secs ?? undefined,
            remSecs: r.rem_secs ?? undefined,
            awakeSecs: r.awake_secs ?? undefined,
            sleepStress: r.sleep_stress ?? undefined,
            sleepHr: r.sleep_hr ?? undefined,
            spo2Night: r.spo2_night != null ? Number(r.spo2_night) : undefined,
            respirationNight: r.respiration_night != null ? Number(r.respiration_night) : undefined,
            hrv: r.hrv ?? undefined,
            hrvStatus: r.hrv_status ?? undefined,
            restingHr: r.resting_hr ?? undefined,
            minHr: r.min_hr ?? undefined,
            maxHr: r.max_hr ?? undefined,
            steps: r.steps ?? undefined,
            floors: r.floors ?? undefined,
            distanceMeters: r.distance_m ?? undefined,
            activeCalories: r.active_kcal ?? undefined,
            totalCalories: r.total_kcal ?? undefined,
            stressAvg: r.stress_avg ?? undefined,
            stressMax: r.stress_max ?? undefined,
            bodyBatteryMin: r.bb_min ?? undefined,
            bodyBatteryMax: r.bb_max ?? undefined,
            spo2Avg: r.spo2_avg != null ? Number(r.spo2_avg) : undefined,
            respiration: r.respiration != null ? Number(r.respiration) : undefined,
            vo2max: r.vo2max != null ? Number(r.vo2max) : undefined,
            fitnessAge: r.fitness_age ?? undefined,
            weightKg: r.weight_kg != null ? Number(r.weight_kg) : undefined,
            bodyFat: r.body_fat != null ? Number(r.body_fat) : undefined,
            readiness: r.readiness ?? undefined,
            readinessLevel: r.readiness_level ?? undefined,
            trainingStatus: r.training_status ?? undefined,
            /* Bis wann Garmin Daten hat — für den ehrlichen „Stand". */
            datenBis: r.daten_bis ?? undefined,
          })) as GarminCache["tage"])
        : g.cache?.tage ?? [];

      let garminNichtVerfuegbar = g.cache?.nichtVerfuegbar ?? [];
      let garminFehler: string | null = g.lastError ?? null;

      /*
       * Kein eigener Sync mehr an dieser Stelle.
       *
       * Der Hintergrund-Takt (5 Min leicht / 30 Min voll) schreibt laufend in
       * `garmin_days`. Ein zweiter Sync hier brachte nur die Personal-API-Werte
       * (ohne Schlafphasen, Readiness, SpO2) und ueberschrieb den Cache mit
       * einem aelteren Stand. Die Tabelle oben ist immer die frischeste Quelle.
       */

      // Trainingslast aus Intervals — nur lesen, wenn verbunden und nicht abgeschaltet.
      const quellenWellness = await leseQuellen(req.userId!);
      let intervals = quellenWellness.intervals
        ? await readIntervalsSettings(req.userId!)
        : ({} as IntervalsSettings);
      if (intervals.apiKey && syncFaellig(intervals)) {
        try {
          const cache = await syncIntervals(intervals.apiKey, intervals.athleteId ?? "0", tage);
          intervals = { ...intervals, cache, lastAutoSyncAt: new Date().toISOString(), lastError: undefined };
          await writeIntervalsSettings(req.userId!, intervals);
        } catch (e) {
          intervals = {
            ...intervals,
            lastAutoSyncAt: new Date().toISOString(),
            lastError: e instanceof Error ? e.message : "Sync fehlgeschlagen.",
          };
          await writeIntervalsSettings(req.userId!, intervals).catch(() => {});
        }
      }

      /** Trainingslast je Datum (Intervals). Wird auf die Garmin-Tage gelegt. */
      const lastProTag = new Map<string, { ctl?: number; atl?: number; tsb?: number }>();
      for (const w of intervals.cache?.wellness ?? []) {
        lastProTag.set(String(w.date), { ctl: w.ctl, atl: w.atl, tsb: w.tsb });
      }

      // Beide Quellen zu einer Tagesreihe verbinden: Garmin führt, Intervals ergänzt.
      const proTag = new Map<string, Record<string, unknown>>();
      const eintrag = (datum: string): Record<string, unknown> => {
        const k = String(datum ?? "").slice(0, 10);
        if (!proTag.has(k)) {
          const last = lastProTag.get(k) ?? {};
          proTag.set(k, {
            date: k,
            ctl: last.ctl ?? null,
            atl: last.atl ?? null,
            tsb: last.tsb ?? null,
          });
        }
        return proTag.get(k)!;
      };

      // Auch reine Intervals-Tage anlegen (Trainingslast ohne Garmin-Werte).
      for (const datum of lastProTag.keys()) eintrag(datum);

      for (const t of garminTage) {
        const e = eintrag(t.date);
        if (t.sleepSecs != null) e.sleepSecs = t.sleepSecs;
        if (t.sleepScore != null) e.sleepScore = t.sleepScore;
        if (t.sleepQuality != null) e.sleepQuality = t.sleepQuality;
        if (t.hrv != null) e.hrv = t.hrv;
        if (t.hrvStatus != null) e.hrvStatus = t.hrvStatus;
        if (t.restingHr != null) e.restingHr = t.restingHr;
        if (t.minHr != null) e.minHr = t.minHr;
        if (t.maxHr != null) e.maxHr = t.maxHr;
        if (t.steps != null) e.steps = t.steps;
        if (t.floors != null) e.floors = t.floors;
        if (t.distanceMeters != null) e.distanceMeters = t.distanceMeters;
        if (t.vo2max != null) e.vo2max = t.vo2max;
        if (t.fitnessAge != null) e.fitnessAge = t.fitnessAge;
        if (t.weightKg != null) e.weight = t.weightKg;
        if (t.bodyFat != null) e.bodyFat = t.bodyFat;
        if (t.deepSecs != null) e.deepSecs = t.deepSecs;
        if (t.remSecs != null) e.remSecs = t.remSecs;
        if (t.lightSecs != null) e.lightSecs = t.lightSecs;
        if (t.awakeSecs != null) e.awakeSecs = t.awakeSecs;
        if (t.activeCalories != null) e.activeCalories = t.activeCalories;
        if (t.totalCalories != null) e.totalCalories = t.totalCalories;
        if (t.stressAvg != null) e.stress = t.stressAvg;
        if (t.stressMax != null) e.stressMax = t.stressMax;
        if (t.bodyBatteryMin != null) e.bodyBatteryMin = t.bodyBatteryMin;
        if (t.bodyBatteryMax != null) e.bodyBatteryMax = t.bodyBatteryMax;
        if (t.spo2Avg != null) e.spo2 = t.spo2Avg;
        if (t.respiration != null) e.respiration = t.respiration;
        /* Readiness und Trainingsstatus fehlten hier — deshalb kamen sie nie an. */
        if (t.readiness != null) e.readiness = t.readiness;
        if (t.readinessLevel != null) e.readinessLevel = t.readinessLevel;
        if (t.trainingStatus != null) e.trainingStatus = t.trainingStatus;
        /*
         * Bis wann Garmin Daten hat. Wird durchgereicht, damit die Anzeige den
         * echten Datenstand zeigen kann statt des Abrufzeitpunkts.
         */
        if (t.datenBis != null) e.datenBis = t.datenBis;
      }

      const alle = [...proTag.values()]
        .sort((a, b) => String(a.date).localeCompare(String(b.date)))
        .slice(-tage);

      const hat = (feld: string) => alle.some((w) => typeof w[feld] === "number");

      // Was fehlt, offen benennen — getrennt nach Quelle.
      const nichtVerfuegbar: string[] = [];
      if (!hat("stress")) nichtVerfuegbar.push("Stress");
      if (!hat("bodyBatteryMax")) nichtVerfuegbar.push("Body Battery");
      if (!hat("spo2")) nichtVerfuegbar.push("SpO2");
      if (!hat("respiration")) nichtVerfuegbar.push("Atemfrequenz");

      res.json({
        fetchedAt: g.cache?.fetchedAt ?? intervals.cache?.fetchedAt ?? null,
        tage: alle,
        // Garmin-Aktivitaeten zuerst — dort landen auch die spontanen Einheiten,
        // die Tim ohne geplantes Workout mit der Uhr aufzeichnet.
        aktivitaeten: [...(await ladeGarminAktivitaeten(req.userId!, 50)), ...(intervals.cache?.activities ?? [])]
          .slice(0, 50),
        verfuegbar: {
          schlaf: hat("sleepSecs"),
          schritte: hat("steps"),
          etagen: hat("floors"),
          hrv: hat("hrv"),
          ruhepuls: hat("restingHr"),
          fitness: hat("ctl"),
        },
        nichtVerfuegbar,
        garminNichtVerfuegbar,
        quelle: g.login?.tokens || g.apiKey ? "garmin" : "intervals",
        lastError: garminFehler ?? intervals.lastError ?? null,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Wellness-Daten konnten nicht geladen werden." });
    }
  });

  /** Sync-Intervall einstellen (0 = nur manuell). */
  app.patch("/api/integrations/intervals/settings", requireAuth, async (req: AuthRequest, res) => {
    try {
      const s = await readIntervalsSettings(req.userId!);
      if (!s.apiKey) {
        res.status(400).json({ error: "Intervals.icu ist nicht verbunden." });
        return;
      }
      const stunden = normalisiereIntervall(req.body?.syncIntervalHours);
      const naechste = { ...s, syncIntervalHours: stunden } as IntervalsSettings;
      // Schalter "Trainings nach Intervals übertragen" mitschreiben (Standard: an)
      if (typeof req.body?.syncWorkouts === "boolean") naechste.syncWorkouts = req.body.syncWorkouts;
      await writeIntervalsSettings(req.userId!, naechste);
      res.json({ ok: true, syncIntervalHours: stunden, syncWorkouts: naechste.syncWorkouts !== false });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Speichern fehlgeschlagen." });
    }
  });

  /**
   * Hintergrund-Abgleich: haelt die Wellness-Daten aktuell, auch wenn die App
   * geschlossen ist. Laeuft im Server-Takt, nicht pro Nutzer-Anfrage.
   *
   * Warum hier und nicht per Cron: Der Server laeuft ohnehin, kennt bereits alle
   * Nutzer-Schluessel und muss nichts von aussen angestossen werden. Intervall
   * kommt aus den Nutzer-Einstellungen (5 Minuten bis 24 Stunden).
   */
  let hintergrundLaeuft = false;
  const hintergrundTick = async () => {
    if (hintergrundLaeuft) return;
    hintergrundLaeuft = true;
    try {
      const rows = await pool.query(
        `SELECT id, profile_extras->'intervals' AS iv,
                COALESCE((profile_extras->'garmin'->'quellen'->>'intervals')::boolean, true) AS intervals_an
           FROM users
          WHERE profile_extras ? 'intervals'
            AND profile_extras->'intervals'->>'apiKey' IS NOT NULL`,
      );
      for (const row of rows.rows) {
        /* Abgeschaltete Quelle: gar nicht erst abfragen. */
        if (row.intervals_an === false) continue;
        const s = (row.iv || {}) as IntervalsSettings;
        if (!s.apiKey) continue;
        if (!syncFaellig(s)) continue;
        try {
          const cache = await syncIntervals(s.apiKey, s.athleteId ?? "0", 30);
          await writeIntervalsSettings(row.id, {
            ...s,
            cache,
            lastAutoSyncAt: new Date().toISOString(),
            lastError: undefined,
          });
        } catch (e) {
          await writeIntervalsSettings(row.id, {
            ...s,
            lastAutoSyncAt: new Date().toISOString(),
            lastError: e instanceof Error ? e.message : "Hintergrund-Abgleich fehlgeschlagen.",
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.warn("[intervals] Hintergrund-Abgleich:", e);
    } finally {
      hintergrundLaeuft = false;
    }
  };

  /**
   * Garmin-Hintergrundabgleich: alle 5 Minuten.
   *
   * Tim wollte „fast instant" — die Uhr synct selbst alle 15 Minuten in die
   * Garmin-Cloud, deshalb ist 5 Minuten der sinnvolle Takt: neue Daten sind
   * spätestens fünf Minuten nach dem Uhr-Sync in der App.
   */
  let garminLaeuft = false;

  /*
   * Taktung gegen Garmins Limit von 100 Anfragen pro Tag und Nutzer.
   *
   *  - leicht (nur heute): 1 Anfrage, Token aus dem Cache -> alle 20 min = 72
   *  - voll (Historie, Schlaf, HRV, Koerper): 37 Anfragen -> alle 48 h = 18
   *  Summe 90 von 100, Luft fuer manuelle Syncs.
   */
  /*
   * Takte.
   *
   * Der Login-Zugang hat kein Tageslimit wie die Personal API, deshalb sind
   * 5 Minuten für den Tagesstand vertretbar. Was häufiger abgefragt wird, sind
   * Schritte und Kalorien — die ändern sich laufend.
   *
   * Alle 30 Minuten kommt der volle Lauf dazu (Readiness, Trainingsstatus,
   * Koerperwerte, Aktivitaeten). Diese Werte ändern sich höchstens stündlich.
   */
  const GARMIN_LEICHT_MS = 5 * 60_000;
  const GARMIN_VOLL_MS = 30 * 60_000;
  /**
   * Garmin-Abgleich.
   *
   * Reihenfolge:
   *  1. Login-Zugang, wenn verbunden — kein Tageslimit, alle Schlafwerte.
   *  2. Personal API als Rueckfallebene, falls der Login fehlt oder die Tokens
   *     abgelaufen sind.
   *
   * Der Login holt bei jedem Takt:
   *  - den heutigen Tag (Schritte, Kalorien, Puls, Stress, Body Battery)
   *  - den Schlaf der letzten Nacht (Phasen, Schlaf-Stress, SpO2)
   * Alle 30 Minuten zusaetzlich Readiness und Trainingsstatus.
   *
   * Fehler werden gespeichert (`lastError`) und in der Oberflaeche angezeigt —
   * ein stiller Ausfall soll nicht wieder monatelang unbemerkt bleiben.
   */
  const garminTick = async () => {
    if (garminLaeuft) return;
    garminLaeuft = true;
    try {
      const rows = await pool.query(
        `SELECT id, profile_extras->'garmin' AS g FROM users
          WHERE profile_extras->'garmin'->>'apiKey' IS NOT NULL
             OR profile_extras->'garmin'->'login'->>'tokens' IS NOT NULL`,
      );

      for (const row of rows.rows) {
        const userId = Number(row.id);
        const g = (row.g || {}) as GarminSettings;

        /* ---------- Weg 1: Login (bevorzugt) ---------- */
        if (g.login?.tokens) {
          const letzterLeicht = Date.parse(g.lastAutoSyncAt ?? '');
          const letzterVoll = Date.parse(g.lastVollSyncAt ?? '');
          const leichtFaellig =
            !Number.isFinite(letzterLeicht) || Date.now() - letzterLeicht > GARMIN_LEICHT_MS;
          const vollFaellig =
            !Number.isFinite(letzterVoll) || Date.now() - letzterVoll > GARMIN_VOLL_MS;
          if (!leichtFaellig && !vollFaellig) continue;

          try {
            const tokens = entschluesseln(g.login.tokens);
            const heute = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

            /* Heute und gestern — gestern, damit die Nacht vollstaendig ist. */
            const tage: LoginTag[] = [];
            const gestern = new Date();
            gestern.setDate(gestern.getDate() - 1);
            const gesternYmd = gestern.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

            tage.push(await tagVoll(tokens, heute, { leicht: !vollFaellig }));
            const gesternTag = await tagVoll(tokens, gesternYmd, { leicht: true });
            if (Object.keys(gesternTag).some((k) => k !== 'date')) tage.push(gesternTag);

            /* Koerperwerte nur im vollen Lauf — Wiegungen sind selten. */
            if (vollFaellig) {
              for (const d of [heute, gesternYmd]) {
                const koerper = await koerperWerte(tokens, d).catch(() => null);
                if (koerper) {
                  const ziel = tage.find((t) => t.date === d);
                  if (ziel) Object.assign(ziel, koerper);
                }
              }
            }

            await speichereLoginTage(userId, tage);

            /* Cache fuer die Ansichten mitschreiben. */
            const cacheTage = [...(g.cache?.tage ?? [])];
            for (const t of tage) {
              const i = cacheTage.findIndex((x) => x.date === t.date);
              if (i >= 0) cacheTage[i] = { ...cacheTage[i], ...t } as GarminCache['tage'][number];
              else cacheTage.push(t as unknown as GarminCache['tage'][number]);
            }
            cacheTage.sort((a, b) => String(a.date).localeCompare(String(b.date)));

            await writeGarminSettings(userId, {
              ...g,
              cache: {
                ...(g.cache ?? { fetchedAt: new Date().toISOString(), tage: [], nichtVerfuegbar: [] }),
                fetchedAt: new Date().toISOString(),
                tage: cacheTage,
              },
              lastError: undefined,
              lastAutoSyncAt: new Date().toISOString(),
              ...(vollFaellig ? { lastVollSyncAt: new Date().toISOString() } : {}),
            });

            /* Aktivitaeten im vollen Lauf nachziehen. */
            if (vollFaellig) {
              const liste = await garminAktivitaetenLogin(tokens, 40).catch(() => []);
              if (liste.length) {
                await speichereGarminAktivitaeten(
                  userId,
                  liste.map((a) => ({
                    activityId: Number(a.activityId ?? 0),
                    date: String(a.startTimeLocal ?? a.startTimeGMT ?? '').slice(0, 10),
                    name: String(a.activityName ?? a.name ?? 'Aktivität'),
                    type: String((a.activityType as { typeKey?: string } | undefined)?.typeKey ?? 'other'),
                    distanceM: Number(a.distance ?? 0) || undefined,
                    durationSecs: Number(a.duration ?? a.movingDuration ?? 0) || undefined,
                    movingSecs: Number(a.movingDuration ?? 0) || undefined,
                    avgHr: Number(a.averageHR ?? 0) || undefined,
                    maxHr: Number(a.maxHR ?? 0) || undefined,
                    calories: Number(a.calories ?? 0) || undefined,
                    elevationM: Number(a.elevationGain ?? 0) || undefined,
                  })),
                ).catch(() => {});
              }
            }

            continue; // Login hat geliefert — Personal API nicht mehr nötig.
          } catch (e) {
            /*
             * Login fehlgeschlagen: Zustand merken und auf die Personal API
             * ausweichen, sofern ein Key da ist. Kein automatischer Neu-Login —
             * sonst sperrt Garmin die IP.
             */
            const meldung = e instanceof Error ? e.message : 'Login-Abgleich fehlgeschlagen.';
            await writeGarminSettings(userId, { ...g, lastError: meldung }).catch(() => {});
            console.warn('[garmin-login]', userId, meldung);
            /* Personal API nur als Rueckfallebene, wenn sie nicht abgeschaltet ist. */
            const q = await leseQuellen(userId).catch(() => ({ personalApi: true, intervals: true }));
            if (!g.apiKey || !q.personalApi) continue;
          }
        }

        /* ---------- Weg 2: Personal API (Rueckfallebene) ---------- */
        if (!g.apiKey) continue;
        /* Abgeschaltet: kein einziger Aufruf an die Personal API. */
        if (!(await leseQuellen(userId).catch(() => ({ personalApi: true, intervals: true }))).personalApi) {
          continue;
        }
        const letzter = Date.parse(g.cache?.fetchedAt ?? g.lastAutoSyncAt ?? '');
        if (Number.isFinite(letzter) && Date.now() - letzter < GARMIN_LEICHT_MS) continue;
        try {
          const cache = await syncGarmin(g.apiKey, 30, (f) =>
            garminSyncLaufend.set(userId, { ...f, seit: Date.now() }),
          );
          garminSyncLaufend.delete(userId);
          await writeGarminSettings(userId, {
            ...g,
            cache,
            displayName: cache.displayName ?? g.displayName,
            lastError: undefined,
            lastAutoSyncAt: new Date().toISOString(),
            lastVollSyncAt: new Date().toISOString(),
          });
          await speichereGarminTage(userId, cache.tage).catch(() => {});
          const aktivitaetenBg = await syncGarminAktivitaeten(g.apiKey, 40).catch(() => []);
          await speichereGarminAktivitaeten(userId, aktivitaetenBg).catch(() => {});
        } catch (e) {
          garminSyncLaufend.delete(userId);
          await writeGarminSettings(userId, {
            ...g,
            lastError: e instanceof Error ? e.message : 'Garmin-Abgleich fehlgeschlagen.',
            lastAutoSyncAt: new Date().toISOString(),
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('[garmin] Hintergrund-Abgleich:', e);
    } finally {
      garminLaeuft = false;
    }
  };

  /*
   * Zwei Takte, gerechnet gegen Garmins Limit von 100 Anfragen pro Tag.
   *
   * Anfragen je Lauf:
   *  - leicht (nur heute): 1 — der Token kommt aus dem Cache (gilt 24 h)
   *  - voll (Historie, Schlaf, HRV, Koerper): 9 Sammel + 14 Tagesdetails
   *    + 7x2 Koerperwerte = 37
   *
   * Rechnung:
   *  - leicht alle 20 Minuten = 72 Anfragen
   *  - voll alle 48 Stunden   = 18 Anfragen (37 / 2)
   *  Summe: 90 von 100 — bleibt Luft fuer manuelle Syncs.
   *
   * Die Koerperwerte im vollen Lauf wurden von 30 auf 7 Tage reduziert: VO2max
   * und Fitnessalter aendern sich nicht taeglich, und der Tageswert kommt
   * ohnehin ueber den leichten Lauf.
   */
  const garminTimer = setInterval(() => void garminTick(), GARMIN_LEICHT_MS);
  garminTimer.unref?.();
  setTimeout(() => void garminTick(), 30_000).unref?.();

  // Takt: jede Minute pruefen, ob ein Nutzer faellig ist. Die teuren API-Aufrufe
  // passieren nur, wenn das eingestellte Intervall wirklich abgelaufen ist.
  const hintergrundTimer = setInterval(() => void hintergrundTick(), 60_000);
  hintergrundTimer.unref?.();
  // Einmal kurz nach dem Start, damit nach einem Neustart nichts alt bleibt.
  setTimeout(() => void hintergrundTick(), 20_000).unref?.();

  /**
   * Tägliche Erinnerung an eine offene Trainingseinheit.
   *
   * Läuft einmal pro Tag gegen 18 Uhr: Wer eine geplante Einheit heute noch
   * nicht absolviert hat, bekommt einen Hinweis. Kein Spam — pro Nutzer und Tag
   * höchstens eine Nachricht, gemerkt in `push_erinnert`.
   *
   * Der Hinweis kommt nur, wenn heute laut Plan überhaupt etwas vorgesehen ist
   * und weder eine eigene Einheit noch eine Garmin-Aktivität vorliegt.
   */

/*
 * Stunde und Uhrzeit in Europe/Berlin.
 *
 * `Intl.DateTimeFormat("de-DE", { hour: "numeric" })` liefert "09 Uhr" — nicht
 * "9". `Number("09 Uhr")` ist NaN, damit war jede Stundenpruefung falsch und
 * der Morgenbericht konnte nie ausloesen. Diese Helfer lesen die Teile direkt
 * aus den formatToParts() und liefern echte Zahlen.
 */
function berlinTeile(d: Date = new Date()): { stunde: number; minute: number; hhmm: string } {
  const teile = new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Berlin",
  }).formatToParts(d);
  const wert = (typ: string) => Number(teile.find((t) => t.type === typ)?.value ?? "0");
  const stunde = wert("hour");
  const minute = wert("minute");
  return {
    stunde,
    minute,
    hhmm: `${String(stunde).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

  let erinnerungLaeuft = false;

  /** Versand an einen Nutzer in der Form, die `benachrichtige` erwartet. */
  const sendeAn =
    (nutzerId: number | string | null) =>
    (n: { titel: string; text: string; url?: string; tag?: string; dringend?: boolean }) =>
      sendePushAnNutzer(pool, nutzerId, n);
  const erinnerungTick = async () => {
    if (erinnerungLaeuft) return;
    const jetzt = new Date();
    // Nur in der 18-Uhr-Stunde (deutsche Zeit)
    const { stunde } = berlinTeile(jetzt);
    if (stunde !== 18) return;

    erinnerungLaeuft = true;
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS push_erinnert (
          user_id INTEGER NOT NULL,
          tag DATE NOT NULL,
          art TEXT NOT NULL,
          PRIMARY KEY (user_id, tag, art)
        )
      `);

      const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
      const wochentag = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Europe/Berlin" }).format(jetzt);

      /*
       * Kandidaten: Nutzer mit aktivem Plan, deren heutiger Plantag keine Ruhetag
       * ist, und die heute noch nichts absolviert haben.
       */
      const kandidaten = await pool.query<{ user_id: number; plan_id: string }>(
        `SELECT DISTINCT p.user_id, p.id AS plan_id
           FROM coach_plans p
          WHERE p.status = 'active'`,
      );

      for (const k of kandidaten.rows) {
        try {
          // Heute schon trainiert?
          const eigene = await pool.query(
            "SELECT 1 FROM workouts WHERE user_id = $1 AND date = $2 LIMIT 1",
            [k.user_id, heute],
          );
          const garmin = await pool.query(
            "SELECT 1 FROM garmin_activities WHERE user_id = $1 AND date = $2 LIMIT 1",
            [k.user_id, heute],
          );
          if (eigene.rowCount || garmin.rowCount) continue;

          // Ist heute etwas geplant?
          /* Tabelle heisst coach_weekly_schedules (siehe Morgenbericht). */
          let woche: { rowCount: number | null; rows: Array<{ schedule: unknown }> };
          try {
            woche = await pool.query<{ schedule: unknown }>(
              `SELECT schedule FROM coach_weekly_schedules
                WHERE plan_id = $1 AND start_date <= $2::date
                  AND start_date + INTERVAL '6 days' >= $2::date
                ORDER BY start_date DESC
                LIMIT 1`,
              [k.plan_id, heute],
            );
          } catch (e) {
            console.error("[push] Trainingserinnerung: Abfrage fehlgeschlagen:", (e as Error).message);
            continue;
          }
          if (!woche.rowCount) continue;
          const schedule = (woche.rows[0].schedule as { schedule?: Array<{ day: string; isRest?: boolean }> })?.schedule ?? [];
          const tagPlan = schedule.find((d) => d.day === wochentag);
          if (!tagPlan || tagPlan.isRest) continue;

          // Heute schon erinnert?
          const schon = await pool.query(
            "SELECT 1 FROM push_erinnert WHERE user_id = $1 AND tag = $2 AND art = 'training'",
            [k.user_id, heute],
          );
          if (schon.rowCount) continue;

          await benachrichtige(pool as never, sendeAn(k.user_id), k.user_id, {
            kategorie: "training",
            ereignis: "training-ausstehend",
            schluessel: heute,
            titel: "Training steht noch aus",
            text: "Für heute ist eine Einheit geplant. Noch ist Zeit.",
            url: "https://fitness.nas-timgreen.com/",
            tag: "training-erinnerung",
            rhythmus: "abend",
          });

          await pool.query(
            "INSERT INTO push_erinnert (user_id, tag, art) VALUES ($1,$2,'training') ON CONFLICT DO NOTHING",
            [k.user_id, heute],
          );
        } catch (e) {
          // Bisher still verschluckt — dadurch war nicht zu sehen, warum eine
          // Meldung ausblieb.
          console.error("[push] Erinnerung fehlgeschlagen:", (e as Error).message);
        }
      }
    } catch {
      /* Tabelle fehlt oder Query-Fehler — beim nächsten Takt erneut */
    } finally {
      erinnerungLaeuft = false;
    }
  };

  /**
   * Morgenbericht, Fasten-Begleitung und Trainingsvorschau.
   *
   * Läuft alle 15 Minuten und prüft je Nutzer, welche Meldung faellig ist.
   * Doppelte werden über `push_ereignisse` verhindert (Ereignis + Datum).
   */
  let beobachtungLaeuft = false;
  const beobachtungTick = async () => {
    if (beobachtungLaeuft) return;
    beobachtungLaeuft = true;
    try {
      const jet = new Date();
      const { stunde, hhmm: uhr } = berlinTeile(jet);
      const heute = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
      const wochentag = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Europe/Berlin" }).format(jet);

      const nutzer = await pool.query<{ id: number; goals: unknown }>(
        "SELECT id, goals FROM users WHERE is_active IS NOT FALSE",
      );

      for (const u of nutzer.rows) {
        try {
          const goals = (u.goals ?? {}) as {
            fasting?: { fastHours?: number; eatHours?: number; startTime?: string; label?: string };
            dailyCalories?: number;
            dailySteps?: number;
          };

          /* ---- 1. Morgenbericht: Schlaf der letzten Nacht ---- */
          if (stunde >= 6 && stunde <= 9) {
            const g = await pool.query(
              `SELECT sleep_secs, sleep_score, hrv, resting_hr, hrv_status
                 FROM garmin_days WHERE user_id = $1 AND date = $2 LIMIT 1`,
              [u.id, heute],
            );
            if (g.rowCount) {
              const r = g.rows[0] as Record<string, unknown>;
              const std = r.sleep_secs ? Math.round((Number(r.sleep_secs) / 3600) * 10) / 10 : null;
              const score = r.sleep_score ? Number(r.sleep_score) : null;
              const hrv = r.hrv ? Math.round(Number(r.hrv)) : null;
              const ruhe = r.resting_hr ? Number(r.resting_hr) : null;

              if (std != null) {
                // Was steht heute an?
                /*
                 * Die Tabelle heisst coach_weekly_schedules, nicht coach_plan_weeks.
                 * Die alte Abfrage warf einen Fehler, der die ganze Meldung
                 * verschluckte - der Morgenbericht kam deshalb nie an.
                 */
                let woche: { rowCount: number | null; rows: Array<{ schedule: unknown }> };
                try {
                  woche = await pool.query<{ schedule: unknown }>(
                    `SELECT w.schedule FROM coach_weekly_schedules w
                       JOIN coach_plans p ON p.id = w.plan_id
                      WHERE p.user_id = $1 AND p.status = 'active'
                        AND w.start_date <= $2::date
                        AND w.start_date + INTERVAL '6 days' >= $2::date
                      ORDER BY w.start_date DESC
                      LIMIT 1`,
                    [u.id, heute],
                  );
                } catch (e) {
                  // Fehlt der Plan, darf der Schlafbericht trotzdem rausgehen.
                  console.error("[push] Plan-Abfrage fehlgeschlagen:", (e as Error).message);
                  woche = { rowCount: 0, rows: [] };
                }
                let planText = "";
                if (woche.rowCount) {
                  const plan = (woche.rows[0].schedule as { schedule?: Array<{ day: string; isRest?: boolean; label?: string; title?: string }> })?.schedule ?? [];
                  const tag = plan.find((d) => d.day === wochentag);
                  planText = tag && !tag.isRest
                    ? `Heute steht ${tag.title ?? tag.label ?? "eine Einheit"} an.`
                    : "Heute ist Ruhetag.";
                }

                // Einordnung des Schlafs
                const urteil =
                  score == null ? "" :
                  score >= 80 ? "Sehr gut geschlafen." :
                  score >= 60 ? "Ordentlich geschlafen." :
                  score >= 40 ? "Mässig geschlafen — heute lieber etwas ruhiger." :
                  "Schlecht geschlafen — heute kein hartes Training.";

                const teile = [`${std} Stunden Schlaf`];
                if (score != null) teile.push(`Score ${score}`);
                if (hrv != null) teile.push(`HRV ${hrv} ms`);
                if (ruhe != null) teile.push(`Ruhepuls ${ruhe}`);

                await benachrichtige(pool as never, sendeAn(u.id), u.id, {
                  kategorie: "tagesstart",
                  ereignis: "morgenbericht",
                  schluessel: heute,
                  titel: "Deine Nacht",
                  text: [teile.join(" · ") + ".", urteil, planText].filter(Boolean).join(" "),
                  url: "https://fitness.nas-timgreen.com/",
                  tag: "morgenbericht",
                  rhythmus: "morgen",
                });
              }
            }
          }

          /* ---- 2. Fasten: Start, Halbzeit, Ende ---- */
          const f = goals.fasting;
          if (f?.startTime && f.fastHours) {
            const [sh, sm] = f.startTime.split(":").map(Number);
            const startMin = sh * 60 + (sm || 0);
            const jetztMin = (() => {
              const [hh, mm] = uhr.split(":").map(Number);
              return hh * 60 + mm;
            })();
            const fastMin = f.fastHours * 60;
            const vergangen = (jetztMin - startMin + 1440) % 1440;

            // Start des Fastens
            if (vergangen >= 0 && vergangen <= 15) {
              await benachrichtige(pool as never, sendeAn(u.id), u.id, {
                kategorie: "ernaehrung",
                ereignis: "fasten-start",
                schluessel: heute,
                titel: "Fasten beginnt",
                text: `${f.label ?? `${f.fastHours}:${f.eatHours}`} läuft — nächste Mahlzeit ab ${endeZeit(startMin + fastMin)}.`,
                url: "https://fitness.nas-timgreen.com/",
                tag: "fasten",
              });
            }
            // Halbzeit
            const halb = Math.floor(fastMin / 2);
            if (vergangen >= halb && vergangen <= halb + 15) {
              await benachrichtige(pool as never, sendeAn(u.id), u.id, {
                kategorie: "ernaehrung",
                ereignis: "fasten-halbzeit",
                schluessel: heute,
                titel: "Halbzeit beim Fasten",
                text: `Die Hälfte ist geschafft — noch ${Math.round((fastMin - vergangen) / 60)} Stunden bis zum Essen.`,
                url: "https://fitness.nas-timgreen.com/",
                tag: "fasten",
              });
            }
            // Eine Stunde vor Ende
            if (vergangen >= fastMin - 60 && vergangen <= fastMin - 45) {
              await benachrichtige(pool as never, sendeAn(u.id), u.id, {
                kategorie: "ernaehrung",
                ereignis: "fasten-bald",
                schluessel: heute,
                titel: "Eine Stunde noch",
                text: `Dein Essensfenster öffnet um ${endeZeit(startMin + fastMin)}.`,
                url: "https://fitness.nas-timgreen.com/",
                tag: "fasten",
              });
            }
          }

          /* ---- 3. Training heute: Vorschau am Morgen ---- */
          if (stunde >= 6 && stunde <= 9) {
            let woche: { rowCount: number | null; rows: Array<{ schedule: unknown }> };
            try {
              woche = await pool.query<{ schedule: unknown }>(
                `SELECT w.schedule FROM coach_weekly_schedules w
                   JOIN coach_plans p ON p.id = w.plan_id
                  WHERE p.user_id = $1 AND p.status = 'active'
                    AND w.start_date <= $2::date
                    AND w.start_date + INTERVAL '6 days' >= $2::date
                  ORDER BY w.start_date DESC
                  LIMIT 1`,
                [u.id, heute],
              );
            } catch (e) {
              console.error("[push] Trainingsvorschau: Plan-Abfrage fehlgeschlagen:", (e as Error).message);
              woche = { rowCount: 0, rows: [] };
            }
            if (woche.rowCount) {
              const plan = (woche.rows[0].schedule as { schedule?: Array<{ day: string; isRest?: boolean; title?: string; label?: string; exercises?: unknown[] }> })?.schedule ?? [];
              const tag = plan.find((d) => d.day === wochentag);
              if (tag && !tag.isRest) {
                const anzahl = Array.isArray(tag.exercises) ? tag.exercises.length : null;
                await benachrichtige(pool as never, sendeAn(u.id), u.id, {
                  kategorie: "training",
                  ereignis: "training-heute",
                  schluessel: heute,
                  titel: "Dein Training heute",
                  text: `${tag.title ?? tag.label ?? "Einheit"}${anzahl ? ` · ${anzahl} Übungen` : ""}. Du schaffst das.`,
                  url: "https://fitness.nas-timgreen.com/",
                  tag: "training",
                  rhythmus: "morgen",
                });
              }
            }
          }
          /* ---- 4. Ernährungsstand am Nachmittag -------------------------- */
          /*
           * Bisher erfuhr Tim nur etwas, wenn eine Mahlzeit erfasst wurde —
           * nie, wie weit er am Tag steht. Diese Meldung schließt das Fenster
           * um 15 Uhr und nennt Kalorien, Eiweiß und was noch übrig ist.
           */
          if (stunde === 15) {
            const g = goals as { dailyCalories?: number; protein?: number };
            const heuteWerte = await pool.query<{ kcal: string; protein: string; mahlzeiten: string }>(
              `SELECT COALESCE(SUM(calories),0)::text AS kcal,
                      COALESCE(SUM(protein),0)::text AS protein,
                      COUNT(*)::text AS mahlzeiten
                 FROM nutrition WHERE user_id = $1 AND date = $2`,
              [u.id, heute],
            );
            const w = heuteWerte.rows[0];
            const kcal = Math.round(Number(w?.kcal ?? 0));
            const prot = Math.round(Number(w?.protein ?? 0));
            const zielKcal = g.dailyCalories ?? null;
            const zielProt = g.protein ?? null;
            if (kcal > 0 || prot > 0) {
              const teile: string[] = [`${kcal} kcal`];
              if (zielKcal) teile.push(`noch ${Math.max(zielKcal - kcal, 0)} von ${zielKcal}`);
              teile.push(`${prot} g Eiweiß`);
              if (zielProt) teile.push(`noch ${Math.max(zielProt - prot, 0)} g`);
              await benachrichtige(pool as never, sendeAn(u.id), u.id, {
                kategorie: "ernaehrung",
                ereignis: "ernaehrung-nachmittag",
                schluessel: heute,
                titel: "Dein Stand heute",
                text: `${teile.join(" · ")}. ${Number(w?.mahlzeiten ?? 0)} Mahlzeiten erfasst.`,
                url: "https://fitness.nas-timgreen.com/#/nutrition",
                tag: "ernaehrung-stand",
                rhythmus: "mittag",
              });
            }
          }

          /* ---- 5. Auffälliger Schlaf und Erholung ----------------------- */
          /*
           * Der Morgenbericht sagt, wie es war. Diese Meldung kommt nur, wenn
           * zwei Werte zugleich aus dem eigenen Rahmen fallen — sonst wäre sie
           * Rauschen. Eigene Kategorie, damit sie getrennt schaltbar ist.
           */
          if (stunde >= 6 && stunde <= 10) {
            const g = await pool.query(
              `SELECT sleep_secs, sleep_score, hrv, resting_hr FROM garmin_days
                WHERE user_id = $1 AND date = $2 LIMIT 1`,
              [u.id, heute],
            );
            const r = g.rows[0] as Record<string, unknown> | undefined;
            const score = r?.sleep_score ? Number(r.sleep_score) : null;
            const std = r?.sleep_secs ? Math.round((Number(r.sleep_secs) / 3600) * 10) / 10 : null;
            const hrv = r?.hrv ? Math.round(Number(r.hrv)) : null;
            const ruhe = r?.resting_hr ? Number(r.resting_hr) : null;

            const schnitt = await pool.query<{ hrv: string | null; ruhe: string | null }>(
              `SELECT AVG(hrv)::text AS hrv, AVG(resting_hr)::text AS ruhe
                 FROM garmin_days
                WHERE user_id = $1 AND date < $2 AND date >= $2::date - INTERVAL '14 days'
                  AND (hrv IS NOT NULL OR resting_hr IS NOT NULL)`,
              [u.id, heute],
            );
            const hrvSchnitt = schnitt.rows[0]?.hrv ? Number(schnitt.rows[0].hrv) : null;
            const ruheSchnitt = schnitt.rows[0]?.ruhe ? Number(schnitt.rows[0].ruhe) : null;

            const gruende: string[] = [];
            if (std != null && std < 6) gruende.push(`nur ${String(std).replace(".", ",")} Stunden Schlaf`);
            if (score != null && score < 50) gruende.push(`Schlafscore ${score}`);
            if (hrv != null && hrvSchnitt != null && hrv < hrvSchnitt * 0.85) {
              gruende.push(`HRV ${hrv} ms (Schnitt ${Math.round(hrvSchnitt)})`);
            }
            if (ruhe != null && ruheSchnitt != null && ruhe > ruheSchnitt + 5) {
              gruende.push(`Ruhepuls ${ruhe} (Schnitt ${Math.round(ruheSchnitt)})`);
            }

            if (gruende.length >= 2) {
              await benachrichtige(pool as never, sendeAn(u.id), u.id, {
                kategorie: "gesundheit",
                ereignis: "gesundheit-auffaellig",
                schluessel: heute,
                titel: "Heute lieber ruhiger",
                text: `${gruende.join(", ")}. Ein lockerer Tag bringt mehr als ein harter.`,
                url: "https://fitness.nas-timgreen.com/#/wellness",
                tag: "gesundheit",
                rhythmus: "morgen",
              });
            }
          }

          /* ---- 6. Abendrückblick ---------------------------------------- */
          /*
           * Tagesbilanz um 20 Uhr: was gegessen, was verbraucht, was trainiert.
           * Genau das, was Tim abends wissen will, ohne die App zu öffnen.
           */
          if (stunde === 20) {
            const [ess, verbrannt, einheiten] = await Promise.all([
              pool.query<{ kcal: string; protein: string }>(
                `SELECT COALESCE(SUM(calories),0)::text AS kcal, COALESCE(SUM(protein),0)::text AS protein
                   FROM nutrition WHERE user_id = $1 AND date = $2`,
                [u.id, heute],
              ),
              pool.query<{ kcal: string; n: string }>(
                `SELECT COALESCE(SUM(calories_burned),0)::text AS kcal, COUNT(*)::text AS n
                   FROM workouts WHERE user_id = $1 AND date = $2`,
                [u.id, heute],
              ),
              pool.query<{ n: string }>(
                `SELECT COUNT(*)::text AS n FROM garmin_activities WHERE user_id = $1 AND date = $2`,
                [u.id, heute],
              ),
            ]);
            const gegessen = Math.round(Number(ess.rows[0]?.kcal ?? 0));
            const prot = Math.round(Number(ess.rows[0]?.protein ?? 0));
            const verbraucht = Math.round(Number(verbrannt.rows[0]?.kcal ?? 0));
            const anzahlEinheiten = Number(verbrannt.rows[0]?.n ?? 0) + Number(einheiten.rows[0]?.n ?? 0);
            const zielKcal = (goals as { dailyCalories?: number }).dailyCalories ?? null;

            if (gegessen > 0 || anzahlEinheiten > 0) {
              const teile: string[] = [`${gegessen} kcal gegessen`];
              if (verbraucht > 0) teile.push(`${verbraucht} kcal verbrannt`);
              if (prot > 0) teile.push(`${prot} g Eiweiß`);
              if (zielKcal) {
                const rest = zielKcal - gegessen;
                teile.push(rest >= 0 ? `${rest} kcal übrig` : `${Math.abs(rest)} kcal drüber`);
              }
              const bilanz = zielKcal ? gegessen - zielKcal : null;
              const urteil =
                bilanz == null ? "" :
                bilanz > 300 ? "Damit liegst du deutlich über dem Ziel." :
                bilanz > 0 ? "Knapp über dem Ziel — morgen wieder ausgleichen." :
                "Im Ziel — gut gelaufen.";

              await benachrichtige(pool as never, sendeAn(u.id), u.id, {
                kategorie: "rueckblick",
                ereignis: "abendrueckblick",
                schluessel: heute,
                titel: anzahlEinheiten > 0 ? "Dein Tag — mit Training" : "Dein Tag",
                text: [teile.join(" · ") + ".", anzahlEinheiten > 0 ? `${anzahlEinheiten} Einheit${anzahlEinheiten > 1 ? "en" : ""} absolviert.` : "Kein Training heute.", urteil]
                  .filter(Boolean)
                  .join(" "),
                url: "https://fitness.nas-timgreen.com/",
                tag: "abendrueckblick",
                rhythmus: "abend",
              });
            }
          }

          /* ---- 7. Wochenrückblick am Sonntag ---------------------------- */
          /*
           * Sonntags 18 Uhr: die Woche in Zahlen. Genau der Punkt, an dem Tim
           * sonst selbst zusammenzählt, wie oft er trainiert hat.
           */
          if (wochentag === "Sunday" && stunde === 18) {
            const woche = await pool.query<{
              einheiten: string;
              kcal_schnitt: string;
              schlaf_schnitt: string;
            }>(
              `SELECT (SELECT COUNT(*)::text FROM workouts w
                        WHERE w.user_id = $1 AND w.date >= $2::date - INTERVAL '6 days') AS einheiten,
                      (SELECT COALESCE(ROUND(AVG(t.kcal)),0)::text FROM (
                         SELECT SUM(calories) AS kcal FROM nutrition
                          WHERE user_id = $1 AND date >= $2::date - INTERVAL '6 days'
                          GROUP BY date) t) AS kcal_schnitt,
                      (SELECT COALESCE(ROUND(AVG(sleep_secs/3600.0)*10)/10,0)::text FROM garmin_days
                        WHERE user_id = $1 AND date >= $2::date - INTERVAL '6 days'
                          AND sleep_secs IS NOT NULL) AS schlaf_schnitt`,
              [u.id, heute],
            );
            const w = woche.rows[0];
            const einheiten = Number(w?.einheiten ?? 0);
            const kcalSchnitt = Number(w?.kcal_schnitt ?? 0);
            const schlaf = Number(w?.schlaf_schnitt ?? 0);

            if (einheiten > 0 || kcalSchnitt > 0) {
              const teile: string[] = [];
              if (einheiten > 0) teile.push(`${einheiten} Einheit${einheiten > 1 ? "en" : ""}`);
              if (kcalSchnitt > 0) teile.push(`Ø ${kcalSchnitt} kcal`);
              if (schlaf > 0) teile.push(`Ø ${String(schlaf).replace(".", ",")} h Schlaf`);
              const ziel = (goals as { trainingDaysPerWeek?: number }).trainingDaysPerWeek ?? null;
              const urteil =
                ziel == null ? "" :
                einheiten >= ziel ? `${einheiten} von ${ziel} geplanten Tagen — Woche erfüllt.` :
                `${einheiten} von ${ziel} geplanten Tagen.`;

              await benachrichtige(pool as never, sendeAn(u.id), u.id, {
                kategorie: "rueckblick",
                ereignis: "wochenrueckblick",
                schluessel: heute,
                titel: "Deine Woche",
                text: [teile.join(" · ") + ".", urteil].filter(Boolean).join(" "),
                url: "https://fitness.nas-timgreen.com/#/stats",
                tag: "wochenrueckblick",
                rhythmus: "abend",
              });
            }
          }
        } catch (e) {
          // Bisher still verschluckt — dadurch war nicht zu sehen, warum eine
          // Meldung ausblieb.
          console.error("[push] Erinnerung fehlgeschlagen:", (e as Error).message);
        }
      }
    } catch {
      /* Tabelle fehlt oder Query-Fehler — beim nächsten Takt erneut */
    } finally {
      beobachtungLaeuft = false;
    }
  };

  /** "HH:MM" aus Minuten seit Mitternacht. */
  function endeZeit(minuten: number): string {
    const m = ((minuten % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  }

  const beobachtungTimer = setInterval(() => void beobachtungTick(), 15 * 60_000);
  beobachtungTimer.unref?.();
  setTimeout(() => void beobachtungTick(), 45_000).unref?.();

  const erinnerungTimer = setInterval(() => void erinnerungTick(), 15 * 60_000);
  erinnerungTimer.unref?.();

  /**
   * Fuehrt die eigenen Zeitplaene des Coaches aus.
   *
   * Ein Zeitplan ist ein Auftrag in einem Satz ("Analysiere die letzte Einheit"),
   * den der Coach selbst angelegt hat. Der Nutzer sieht das Ergebnis im Chat.
   *
   * Ausloeser:
   *  - nach_training: sobald eine neue Aktivitaet importiert wurde. Erkannt an der
   *    neuesten Aktivitaets-ID - so feuert es genau einmal pro Training, nicht bei
   *    jedem Sync erneut.
   *  - taeglich/waechentlich/monatlich: Uhrzeit; laeuft nur, wenn seit dem letzten
   *    Lauf mindestens ein Tag vergangen ist (Schutz gegen Doppel-Ausfuehrung).
   */
  let zeitplanLaeuft = false;
  const coachZeitplanTick = async () => {
    if (zeitplanLaeuft) return;
    zeitplanLaeuft = true;
    try {
      const faellige = await pool.query(
        `SELECT s.*, u.profile_extras->'intervals' AS iv
           FROM coach_schedules s
           JOIN users u ON u.id = s.user_id
          WHERE s.active = TRUE`,
      );

      for (const row of faellige.rows) {
        const plan = row as Record<string, unknown> & {
          id: number;
          user_id: number;
          trigger: string;
          time_of_day: string | null;
          last_run_at: string | null;
          last_seen_activity: string | null;
          task: string;
          title: string;
          iv?: IntervalsSettings | null;
        };

        let ausloesen = false;
        let marke: string | null = null;

        if (plan.trigger === 'nach_training') {
          const neueste = plan.iv?.cache?.activities?.[0];
          const neuesteId = neueste ? String(neueste.id) : null;
          if (neuesteId && neuesteId !== plan.last_seen_activity) {
            ausloesen = true;
            marke = neuesteId;
          }
        } else {
          ausloesen = zeitpunktFaellig(plan);
        }

        if (!ausloesen) continue;

        try {
          const profil = await pool.query('SELECT * FROM users WHERE id=$1', [plan.user_id]);
          const user = profil.rows[0];
          if (!user) continue;

          const pl = await pool.query(
            'SELECT * FROM coach_plans WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',
            [plan.user_id],
          );
          const letzte = await pool.query(
            'SELECT * FROM coach_chat_messages WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10',
            [plan.user_id],
          );

          const systemPrompt =
            buildCoachChatSystemPrompt({
              profile: user,
              plans: pl.rows,
              workouts: [],
              nutrition: [],
              latestPlan: pl.rows[0],
            }) +
            (plan.iv ? `\n\n${buildIntervalsContext(plan.iv)}` : '') +
            `\n\n=== EIGENER AUFTRAG ===\nDieser Auftrag wurde von dir selbst frueher eingerichtet.\n` +
            `Fuehre ihn jetzt aus und antworte in normalem Text. Kein actions-Block noetig.`;

          const raw = await completeCoachChat([
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: `Zeitplan "${plan.title}": ${plan.task}`,
            },
          ]);

          const { text: antwort } = parseCoachChatReply(raw);

          await pool.query(
            `INSERT INTO coach_chat_messages (user_id, role, content, actions)
             VALUES ($1,'assistant',$2,'[{"type":"zeitplan","ok":true}]'::jsonb)`,
            [plan.user_id, `**${plan.title}**\n\n${antwort}`],
          );

          await pool.query(
            `UPDATE coach_schedules
                SET last_run_at = NOW(),
                    last_seen_activity = COALESCE($2, last_seen_activity),
                    last_result = $3,
                    run_count = run_count + 1
              WHERE id = $1`,
            [plan.id, marke, antwort.slice(0, 2000)],
          );
        } catch (e) {
          await pool.query('UPDATE coach_schedules SET last_run_at = NOW() WHERE id=$1', [plan.id]).catch(
            () => {},
          );
          console.warn(`[coach] Zeitplan ${plan.id}:`, e);
        }
      }
    } catch (e) {
      console.warn('[coach] Zeitplaene:', e);
    } finally {
      zeitplanLaeuft = false;
    }
  };

  // Jede Minute pruefen - die Ausfuehrung selbst ist durch last_run_at gesperrt.
  const zeiplanTimer = setInterval(() => void coachZeitplanTick(), 60_000);
  zeiplanTimer.unref?.();

  /** Prueft, ob ein Zeit-Ausloeser jetzt faellig ist. */
  function zeitpunktFaellig(plan: {
    trigger: string;
    time_of_day: string | null;
    last_run_at: string | null;
  }): boolean {
    const jetzt = new Date();
    const [hh, mm] = String(plan.time_of_day ?? '08:00')
      .split(':')
      .map((n) => Number(n) || 0);

    // Erst ab der eingestellten Uhrzeit (lokale Zeit des Servers).
    if (jetzt.getHours() < hh || (jetzt.getHours() === hh && jetzt.getMinutes() < mm)) return false;

    if (!plan.last_run_at) return true;
    const letzter = new Date(plan.last_run_at);
    const stunden = (jetzt.getTime() - letzter.getTime()) / 3_600_000;

    if (plan.trigger === 'taeglich') return stunden >= 20;
    if (plan.trigger === 'waechentlich') return stunden >= 24 * 6;
    return stunden >= 24 * 27;
  }

  /** Zeitplaene des Nutzers auflisten. */
  app.get('/api/coach/schedules', requireAuth, async (req: AuthRequest, res) => {
    const rows = await pool.query(
      'SELECT * FROM coach_schedules WHERE user_id=$1 ORDER BY created_at DESC',
      [req.userId],
    );
    res.json(rows.rows);
  });

  /** Zeitplan pausieren/fortsetzen oder loeschen. */
  app.patch('/api/coach/schedules/:id', requireAuth, async (req: AuthRequest, res) => {
    const aktiv = req.body?.active;
    if (typeof aktiv !== 'boolean') {
      res.status(400).json({ error: 'Feld "active" (true/false) fehlt.' });
      return;
    }
    await pool.query('UPDATE coach_schedules SET active=$2 WHERE id=$1 AND user_id=$3', [
      Number(req.params.id),
      aktiv,
      req.userId,
    ]);
    res.json({ ok: true });
  });

  app.delete('/api/coach/schedules/:id', requireAuth, async (req: AuthRequest, res) => {
    await pool.query('DELETE FROM coach_schedules WHERE id=$1 AND user_id=$2', [
      Number(req.params.id),
      req.userId,
    ]);
    res.json({ ok: true });
  });

  /** Trennen: Key und Cache loeschen. */
  app.delete("/api/integrations/intervals", requireAuth, async (req: AuthRequest, res) => {
    await pool.query(
      `UPDATE users
          SET profile_extras = profile_extras - 'intervals',
              updated_at = NOW()
        WHERE id=$1`,
      [req.userId],
    );
    res.json({ ok: true });
  });

  // ── Coach-Chat: Freitext-Beratung + Aktionen ──────────────────────────────
  app.get("/api/coach/chat", requireAuth, async (req: AuthRequest, res) => {
    try {
      const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 60));
      const result = await pool.query(
        `SELECT id, role, content, actions, created_at
           FROM coach_chat_messages
          WHERE user_id=$1
          ORDER BY id DESC
          LIMIT $2`,
        [req.userId, limit],
      );
      res.json(result.rows.reverse());
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "load failed" });
    }
  });

  app.delete("/api/coach/chat", requireAuth, async (req: AuthRequest, res) => {
    await pool.query("DELETE FROM coach_chat_messages WHERE user_id=$1", [req.userId]);
    res.json({ ok: true });
  });

  app.post("/api/coach/chat", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!resolveAiCapabilities().enabled) {
        res.status(503).json({ error: "KI ist nicht konfiguriert (kein gültiger API-Key)." });
        return;
      }
      const message = String(req.body?.message ?? "").trim();
      if (!message) {
        res.status(400).json({ error: "Nachricht fehlt." });
        return;
      }
      if (message.length > 4000) {
        res.status(400).json({ error: "Nachricht ist zu lang (max. 4000 Zeichen)." });
        return;
      }

      const [profileRes, plansRes, workoutsRes, nutritionRes, historyRes] = await Promise.all([
        pool.query(
          `SELECT name, goals, measurements, coach_preferences, profile_extras,
                  weight_history, coaching_active, first_name
             FROM users WHERE id=$1`,
          [req.userId],
        ),
        pool.query(
          `SELECT id, type, discipline, status, current_week, plan_mode,
                  event_name, event_date, event_distance, onboarding_data
             FROM coach_plans
            WHERE user_id=$1
            ORDER BY created_at DESC
            LIMIT 5`,
          [req.userId],
        ),
        pool.query(
          `SELECT name, type, duration, date
             FROM workouts
            WHERE user_id=$1
            ORDER BY date DESC
            LIMIT 20`,
          [req.userId],
        ),
        pool.query(
          `SELECT date, SUM(calories)::int AS kcal, SUM(protein)::int AS protein,
                  SUM(carbs)::int AS carbs, SUM(fat)::int AS fat
             FROM nutrition
            WHERE user_id=$1 AND date >= CURRENT_DATE - INTERVAL '14 days'
            GROUP BY date
            ORDER BY date DESC`,
          [req.userId],
        ),
        pool.query(
          `SELECT role, content FROM coach_chat_messages
            WHERE user_id=$1
            ORDER BY id DESC
            LIMIT 20`,
          [req.userId],
        ),
      ]);

      const profile = profileRes.rows[0] ?? {};
      const latestPlan = plansRes.rows[0] ?? null;

      // Faelliger Auto-Sync: blockiert den Chat nicht, wenn er scheitert.
      const chatQuellen = await leseQuellen(req.userId!);
      let intervalsSettings = chatQuellen.intervals
        ? await readIntervalsSettings(req.userId!)
        : ({} as IntervalsSettings);
      if (intervalsSettings.apiKey && syncFaellig(intervalsSettings)) {
        try {
          const cache = await syncIntervals(
            intervalsSettings.apiKey!,
            intervalsSettings.athleteId ?? "0",
            30,
          );
          intervalsSettings = {
            ...intervalsSettings,
            cache,
            lastAutoSyncAt: new Date().toISOString(),
            lastError: undefined,
          };
          await writeIntervalsSettings(req.userId!, intervalsSettings);
        } catch (e) {
          intervalsSettings = {
            ...intervalsSettings,
            lastAutoSyncAt: new Date().toISOString(),
            lastError: e instanceof Error ? e.message : "Auto-Sync fehlgeschlagen.",
          };
          await writeIntervalsSettings(req.userId!, intervalsSettings).catch(() => {});
        }
      }
      const intervalsContext = buildIntervalsContext(intervalsSettings);
      const schedulesRes = await pool.query(
        "SELECT id, title, task, trigger, time_of_day FROM coach_schedules WHERE user_id=$1 AND active=true ORDER BY created_at DESC",
        [req.userId],
      );
      const systemPrompt =
        buildCoachChatSystemPrompt({
          profile,
          plans: plansRes.rows,
          workouts: workoutsRes.rows,
          nutrition: nutritionRes.rows,
          latestPlan,
          schedules: schedulesRes.rows,
        }) + (intervalsContext ? `\n\n${intervalsContext}` : "");

      const history = historyRes.rows.reverse().map((row) => ({
        role: row.role === "assistant" ? "assistant" : "user",
        content: String(row.content),
      }));

      const raw = await completeCoachChat([
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: message },
      ]);

      const { text, actions } = parseCoachChatReply(raw);

      await pool.query(
        "INSERT INTO coach_chat_messages (user_id, role, content, actions) VALUES ($1,'user',$2,'[]'::jsonb)",
        [req.userId, message],
      );

      const applied = await applyCoachChatActions(pool, req.userId!, actions);

      const insert = await pool.query(
        `INSERT INTO coach_chat_messages (user_id, role, content, actions)
         VALUES ($1,'assistant',$2,$3::jsonb)
         RETURNING id, role, content, actions, created_at`,
        [req.userId, text, JSON.stringify(applied)],
      );

      res.json({ message: insert.rows[0], applied });
    } catch (err) {
      console.error("coach/chat POST error:", err);
      res.status(502).json({ error: err instanceof Error ? err.message : "Chat fehlgeschlagen" });
    }
  });

  // ── Coach: All Historical Reports ─────────────────────────────────────────
  app.get("/api/coach/reports", requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await pool.query(
        `SELECT r.*, p.discipline, p.type AS plan_type, p.id AS plan_id
         FROM coach_weekly_reports r
         JOIN coach_plans p ON p.id = r.plan_id
         WHERE p.user_id=$1
         ORDER BY r.generated_at DESC`,
        [req.userId]
      );
      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Admin ─────────────────────────────────────────────────────────────────
  
  app.get("/api/admin/ai-config", requireAdmin, (_req, res) => {
    const caps = resolveAiCapabilities();
    const mistralMasked = maskSecret(process.env.MISTRAL_API_KEY);
    const geminiMasked = maskSecret(process.env.GEMINI_API_KEY);
    const deepseekMasked = maskSecret(process.env.DEEPSEEK_API_KEY);
    const models = getAllAiModels();
    res.json({
      active: caps.provider,
      ollamaConfigured: caps.ollamaConfigured,
      geminiConfigured: caps.geminiConfigured,
      mistralConfigured: caps.mistralConfigured,
      deepseekConfigured: caps.deepseekConfigured,
      ollama: {
        baseUrl: getOllamaBaseUrl(),
        model: getLocalLlmModel(),
        configured: caps.ollamaConfigured,
      },
      keys: {
        deepseek: { configured: caps.deepseekConfigured, masked: deepseekMasked },
        mistral: { configured: caps.mistralConfigured, masked: mistralMasked },
        gemini: { configured: caps.geminiConfigured, masked: geminiMasked },
      },
      models,
      recommendations: AI_MODEL_RECOMMENDATIONS,
      areas: AI_MODEL_AREAS.map((id) => {
        return {
          id,
          label: AI_MODEL_AREA_LABELS[id],
          recommended: {
            ollama: AI_MODEL_RECOMMENDATIONS.ollama[id],
            deepseek: AI_MODEL_RECOMMENDATIONS.deepseek[id],
            mistral: AI_MODEL_RECOMMENDATIONS.mistral[id],
            gemini: AI_MODEL_RECOMMENDATIONS.gemini[id],
          },
          options: {
            ollama: getModelSelectOptions("ollama", id, models.ollama[id]),
            deepseek: getModelSelectOptions("deepseek", id, models.deepseek[id]),
            mistral: getModelSelectOptions("mistral", id, models.mistral[id]),
            gemini: getModelSelectOptions("gemini", id, models.gemini[id]),
          },
        };
      }),
    });
  });

  app.get("/api/admin/ollama/test", requireAdmin, async (_req, res) => {
    const result = await testOllamaConnection();
    if (result.ok) res.json(result);
    else res.status(400).json(result);
  });

  app.post("/api/admin/ollama/pull", requireAdmin, async (req, res) => {
    const { model } = req.body as { model?: string };
    const targetModel = model?.trim() || getLocalLlmModel();
    const result = await pullOllamaModel(targetModel);
    if (result.ok) res.json({ ok: true, model: targetModel });
    else res.status(400).json({ ok: false, error: result.error || "Pull fehlgeschlagen" });
  });

  app.post("/api/admin/ai-config", requireAdmin, async (req, res) => {
    const { provider } = req.body as { provider?: string };
    if (provider !== "ollama" && provider !== "deepseek" && provider !== "gemini" && provider !== "mistral") {
      res.status(400).json({ ok: false, error: "Ungültiger Provider (ollama|deepseek|mistral|gemini)" });
      return;
    }
    const capsBefore = resolveAiCapabilities();
    const previousOverride = getActiveProviderOverride();
    const previousActive: AiProviderName | null =
      previousOverride ?? (capsBefore.provider !== "none" ? capsBefore.provider : null);

    setActiveProviderOverride(provider);

    const test =
      provider === "ollama"
        ? await testOllamaConnection()
        : provider === "deepseek"
          ? await testDeepSeekApiKey(process.env.DEEPSEEK_API_KEY ?? "")
          : provider === "mistral"
            ? await testMistralApiKey(process.env.MISTRAL_API_KEY ?? "")
            : await testGeminiApiKey(process.env.GEMINI_API_KEY ?? "");

    if (!test.ok) {
      setActiveProviderOverride(previousOverride);
      const capsAfter = resolveAiCapabilities();
      res.status(400).json({
        ok: false,
        error: "error" in test ? test.error : "KI-Test fehlgeschlagen",
        active: capsAfter.provider !== "none" ? capsAfter.provider : previousActive,
        reverted: true,
      });
      return;
    }

    try {
      upsertEnvVar("AI_ACTIVE_PROVIDER", provider);
      reloadEnvFromFile();
      syncActiveProviderFromEnv();
    } catch (e) {
      setActiveProviderOverride(previousOverride);
      res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        reverted: true,
      });
      return;
    }

    res.json({ ok: true, active: provider, tested: true });
  });

  app.post("/api/admin/ai-keys/test", requireAdmin, async (req, res) => {
    const { provider, apiKey } = req.body as { provider?: string; apiKey?: string };
    if (!apiKey?.trim() || (provider !== "deepseek" && provider !== "mistral" && provider !== "gemini")) {
      res.status(400).json({ ok: false, error: "provider (deepseek|mistral|gemini) und apiKey erforderlich" });
      return;
    }
    const result =
      provider === "deepseek"
        ? await testDeepSeekApiKey(apiKey)
        : provider === "mistral"
          ? await testMistralApiKey(apiKey)
          : await testGeminiApiKey(apiKey);
    if (result.ok) res.json({ ok: true, provider });
    else res.status(400).json({ ok: false, error: "error" in result ? result.error : "Unbekannter Fehler" });
  });

  app.post("/api/admin/ai-keys", requireAdmin, async (req, res) => {
    const { provider, apiKey } = req.body as { provider?: string; apiKey?: string };
    if (!apiKey?.trim() || (provider !== "deepseek" && provider !== "mistral" && provider !== "gemini")) {
      res.status(400).json({ ok: false, error: "provider (deepseek|mistral|gemini) und apiKey erforderlich" });
      return;
    }
    const test =
      provider === "deepseek"
        ? await testDeepSeekApiKey(apiKey)
        : provider === "mistral"
          ? await testMistralApiKey(apiKey)
          : await testGeminiApiKey(apiKey);
    if (!test.ok) {
      res.status(400).json({ ok: false, error: "error" in test ? test.error : "Unbekannter Fehler" });
      return;
    }
    const envKey =
      provider === "deepseek" ? "DEEPSEEK_API_KEY" : provider === "mistral" ? "MISTRAL_API_KEY" : "GEMINI_API_KEY";
    try {
      upsertEnvVar(envKey, apiKey.trim());
      reloadEnvFromFile();
      const caps = resolveAiCapabilities();
      res.json({
        ok: true,
        provider,
        deepseekConfigured: caps.deepseekConfigured,
        geminiConfigured: caps.geminiConfigured,
        mistralConfigured: caps.mistralConfigured,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.get("/api/admin/exercisedb-key/status", requireAdmin, (_req, res) => {
    res.json(getExerciseDbEnvDiagnostics());
  });

  app.post("/api/admin/exercisedb-key/test", requireAdmin, async (req, res) => {
    const { apiKey } = req.body as { apiKey?: string };
    if (!apiKey?.trim()) {
      res.status(400).json({ ok: false, error: "apiKey erforderlich" });
      return;
    }
    const result = await testExerciseDbApiKey(apiKey);
    if (result.ok) res.json({ ok: true });
    else res.status(400).json({ ok: false, error: result.error ?? "Test fehlgeschlagen" });
  });

  app.post("/api/admin/exercisedb-key", requireAdmin, async (req, res) => {
    const { apiKey } = req.body as { apiKey?: string };
    if (!apiKey?.trim()) {
      res.status(400).json({ ok: false, error: "apiKey erforderlich" });
      return;
    }
    const test = await testExerciseDbApiKey(apiKey);
    if (!test.ok) {
      res.status(400).json({ ok: false, error: test.error ?? "Test fehlgeschlagen" });
      return;
    }
    try {
      upsertEnvVar("EXERCISEDB_RAPIDAPI_KEY", apiKey.trim());
      res.json({ ok: true, ...getExerciseDbEnvDiagnostics() });
    } catch (e) {
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.put("/api/admin/ai-models", requireAdmin, (req, res) => {
    const { models } = req.body as {
      models?: Partial<Record<AiProviderName, Partial<Record<AiModelArea, string>>>>;
    };
    if (!models || typeof models !== "object") {
      res.status(400).json({ ok: false, error: "models object required" });
      return;
    }
    try {
      for (const provider of ["ollama", "deepseek", "mistral", "gemini"] as const) {
        const areaMap = models[provider];
        if (!areaMap) continue;
        for (const area of AI_MODEL_AREAS) {
          const value = areaMap[area]?.trim();
          if (value) upsertEnvVar(`AI_${provider.toUpperCase()}_MODEL_${area.toUpperCase()}`, value);
        }
      }
      res.json({ ok: true, models: getAllAiModels() });
    } catch (e) {
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.post("/api/admin/login", (req, res) => {
    const { username, password } = req.body as { username: string; password: string };
    if (username === ADMIN_USER && password === ADMIN_PASS) res.json({ ok: true });
    else res.status(401).json({ error: "Invalid credentials" });
  });

  app.get("/api/admin/users", requireAdmin, async (_req, res) => {
    const result = await pool.query(
      `SELECT id, name, first_name, last_name, email,
              CASE WHEN password_hash IS NOT NULL THEN TRUE ELSE FALSE END AS has_password,
              is_active, created_at, updated_at
       FROM users ORDER BY created_at DESC`
    );
    res.json(result.rows);
  });

  app.put("/api/admin/users/:id", requireAdmin, async (req, res) => {
    const { firstName, lastName, email, password } = req.body as {
      firstName: string;
      lastName: string;
      email: string;
      password?: string;
    };
    const resolvedFirst = String(firstName ?? "").trim();
    const resolvedLast = String(lastName ?? "").trim();
    if (!validateNameParts(resolvedFirst, resolvedLast)) {
      res.status(400).json({ error: "Invalid name" });
      return;
    }
    const displayName = buildDisplayName(resolvedFirst, resolvedLast);
    if (password?.length) {
      const hash = await bcrypt.hash(password, 12);
      await pool.query(
        `UPDATE users SET name=$2, display_name=$2, first_name=$3, last_name=$4, email=$5,
         password_hash=$6, updated_at=NOW() WHERE id=$1`,
        [req.params.id, displayName, resolvedFirst, resolvedLast, email, hash],
      );
    } else {
      await pool.query(
        `UPDATE users SET name=$2, display_name=$2, first_name=$3, last_name=$4, email=$5, updated_at=NOW() WHERE id=$1`,
        [req.params.id, displayName, resolvedFirst, resolvedLast, email],
      );
    }
    res.json({ ok: true });
  });

  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    await pool.query("DELETE FROM users WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  });

  app.post("/api/admin/users/:id/suspend", requireAdmin, async (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isFinite(userId) || userId <= 0) {
      res.status(400).json({ ok: false, error: "invalid-user-id" });
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    const row = await pool.query(
      `UPDATE users
       SET is_active=false,
           profile_extras=COALESCE(profile_extras, '{}'::jsonb) || jsonb_build_object('authInvalidBefore', $2),
           updated_at=NOW()
       WHERE id=$1
       RETURNING id, is_active`,
      [userId, now],
    );
    if (!row.rows.length) {
      res.status(404).json({ ok: false, error: "not-found" });
      return;
    }
    res.json({ ok: true, id: row.rows[0].id, isActive: row.rows[0].is_active });
  });

  // ── Frontend ──────────────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");

    /*
     * Cache-Regeln.
     *
     * `express.static` schickte alle Dateien mit `max-age=14400` (4 Stunden) —
     * damit kamen Aenderungen erst Stunden spaeter an, auch nach einem Deploy.
     *
     * Jetzt:
     *  - `/assets/*` (gehashte Dateien): ein Jahr, sie aendern sich nie unter
     *    demselben Namen.
     *  - `index.html` und Service Worker: immer neu pruefen, damit ein Deploy
     *    sofort greift.
     */
    app.use(
      express.static(distPath, {
        setHeaders: (res, dateiPfad) => {
          const name = path.basename(dateiPfad);
          if (name === "index.html" || name === "sw.js") {
            res.setHeader("Cache-Control", "no-cache, must-revalidate");
            return;
          }
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        },
      }),
    );
    app.get("*", (_req, res) => {
      // HTML nie cachen - sonst zeigt der Browser nach einem Deploy alte Bundles.
      res.setHeader("Cache-Control", "no-cache, must-revalidate");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const PORT = parseInt(process.env.PORT || "3000");
  await initDb();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 VRTX server → http://localhost:${PORT}`);
    console.log(`🔐 Admin panel → http://localhost:${PORT}/admin`);
  });
}

startServer().catch(err => { console.error("Fatal:", err); process.exit(1); });
