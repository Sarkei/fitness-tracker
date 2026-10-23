import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import type { PipelineResult } from './schemas';

/** Cache-Schema-Version — bei Matching-/Segment-Fixes erhöhen, damit alte Treffer invalidiert werden. */
export const NUTRITION_PIPELINE_CACHE_VERSION = 'v3-strict-compound-2026-07';

export function normalizeMealInputForCache(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+und\s+/g, ' und ')
    .replace(/\s+mit\s+/g, ' mit ');
}

export function mealInputCacheHash(text: string): string {
  return createHash('sha256')
    .update(`${NUTRITION_PIPELINE_CACHE_VERSION}|${normalizeMealInputForCache(text)}`)
    .digest('hex');
}

export async function getCachedPipelineResult(
  pool: Pool,
  userId: number,
  text: string,
): Promise<PipelineResult | null> {
  const hash = mealInputCacheHash(text);
  try {
    const q = await pool.query<{ pipeline_result: PipelineResult }>(
      `SELECT pipeline_result FROM nutrition_v3_input_cache
       WHERE user_id = $1 AND input_hash = $2
         AND updated_at > NOW() - INTERVAL '90 days'
       LIMIT 1`,
      [userId, hash],
    );
    const row = q.rows[0]?.pipeline_result;
    if (!row) return null;
    const ctx = row.analysis?.portion_context ?? '';
    if (
      typeof ctx === 'string' &&
      (ctx.includes('deterministic-template') ||
        !ctx.includes('segment-then-off') ||
        !ctx.includes('strict'))
    ) {
      return null;
    }
    return row;
  } catch {
    return null;
  }
}

export async function setCachedPipelineResult(
  pool: Pool,
  userId: number,
  text: string,
  result: PipelineResult,
): Promise<void> {
  const hash = mealInputCacheHash(text);
  const normalized = normalizeMealInputForCache(text);
  try {
    await pool.query(
      `INSERT INTO nutrition_v3_input_cache (user_id, input_hash, input_normalized, pipeline_result, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW())
       ON CONFLICT (user_id, input_hash) DO UPDATE SET
         input_normalized = EXCLUDED.input_normalized,
         pipeline_result = EXCLUDED.pipeline_result,
         updated_at = NOW()`,
      [userId, hash, normalized, JSON.stringify(result)],
    );
  } catch {
    /* cache optional */
  }
}
