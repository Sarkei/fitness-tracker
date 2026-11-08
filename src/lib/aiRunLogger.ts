import { createHash } from 'node:crypto';
import type pg from 'pg';
import { COACH_PROMPT_VERSION, MEAL_RECIPE_PROMPT_VERSION } from './coachPromptVersions';
import { resolveAiCapabilities } from '../../aiProviders';
import { getAiModel } from './aiModelConfig';

function hashJson(obj: unknown): string {
  return createHash('sha256').update(JSON.stringify(obj ?? null)).digest('hex').slice(0, 32);
}

export async function logCoachAiRun(
  pool: pg.Pool,
  row: {
    userId: number;
    planId: string | null;
    weekNumber: number | null;
    endpoint: string;
    inputSummary: unknown;
    rawResponse: string | null;
    zodOk: boolean;
    constraintsOk: boolean;
    retries: number;
    latencyMs: number;
    finalScheduleHash: string | null;
    refinementRound?: number;
    errorMessage?: string | null;
  },
): Promise<void> {
  const caps = resolveAiCapabilities();
  // Tatsächlich konfiguriertes Modell protokollieren (nicht hartkodiert).
  const modelId = caps.provider === 'none' ? 'none' : getAiModel(caps.provider, 'coach_workout');
  try {
    await pool.query(
      `INSERT INTO coach_ai_runs (
        user_id, plan_id, week_number, endpoint, prompt_version, model_id, input_hash,
        raw_response, zod_ok, constraints_ok, retries, latency_ms, final_schedule_hash,
        refinement_round, error_message
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        row.userId,
        row.planId,
        row.weekNumber,
        row.endpoint,
        COACH_PROMPT_VERSION,
        modelId,
        hashJson(row.inputSummary),
        row.rawResponse,
        row.zodOk,
        row.constraintsOk,
        row.retries,
        row.latencyMs,
        row.finalScheduleHash,
        row.refinementRound ?? 0,
        row.errorMessage ?? null,
      ],
    );
  } catch (e) {
    console.warn('[coach_ai_runs] log failed', e);
  }
}

export async function logMealAiRun(
  pool: pg.Pool,
  row: {
    userId: number;
    endpoint: string;
    inputSummary: unknown;
    rawResponse: string | null;
    zodOk: boolean;
    retries: number;
    latencyMs: number;
    errorMessage?: string | null;
    refinementRound?: number;
  },
): Promise<void> {
  const caps = resolveAiCapabilities();
  const modelId = caps.provider === 'none' ? 'none' : getAiModel(caps.provider, 'meal');
  try {
    await pool.query(
      `INSERT INTO meal_ai_runs (
        user_id, endpoint, prompt_version, model_id, input_hash,
        raw_response, zod_ok, retries, latency_ms, error_message, refinement_round
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        row.userId,
        row.endpoint,
        MEAL_RECIPE_PROMPT_VERSION,
        modelId,
        hashJson(row.inputSummary),
        row.rawResponse,
        row.zodOk,
        row.retries,
        row.latencyMs,
        row.errorMessage ?? null,
        row.refinementRound ?? 0,
      ],
    );
  } catch (e) {
    console.warn('[meal_ai_runs] log failed', e);
  }
}
