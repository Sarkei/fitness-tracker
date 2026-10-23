import pg from 'pg';
import {
  ensureNutritionMetricsTable,
  getNutritionV3UxSummary,
  storeNutritionV3UxEvent,
} from '../src/lib/nutrition/pipeline/nutritionMetricsStore';

const { Pool } = pg;

function assert(cond: boolean, message: string) {
  if (!cond) throw new Error(message);
}

async function main() {
  const requireDb = ['1', 'true', 'yes'].includes(String(process.env.NUTRITION_CI_REQUIRE_DB ?? '').toLowerCase());
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'fitness_tracker',
    user: process.env.POSTGRES_USER || 'vrtx',
    password: process.env.POSTGRES_PASSWORD || 'vrtx_secret',
  });
  try {
    await pool.query('SELECT 1');
  } catch {
    if (requireDb) throw new Error('postgres-required-but-unreachable');
    console.log('nutrition-v3-ux-selftest: SKIP (no postgres)');
    return;
  }

  try {
    await ensureNutritionMetricsTable(pool);
    await storeNutritionV3UxEvent(pool, {
      eventName: 'session_start',
      source: 'selftest',
      userIdHash: 'selftest',
    });
    await storeNutritionV3UxEvent(pool, {
      eventName: 'save_attempt',
      source: 'selftest',
      success: true,
      durationMs: 1400,
      componentsCount: 3,
      correctionsCount: 1,
      userIdHash: 'selftest',
    });
    const summary = await getNutritionV3UxSummary(pool, 24);
    assert(summary.events > 0, 'ux events should be counted');
    assert(summary.avgTimeToLogMs !== null, 'avgTimeToLog should exist');
    console.log('nutrition-v3-ux-selftest: OK');
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('nutrition-v3-ux-selftest: FAIL', e);
  process.exit(1);
});
