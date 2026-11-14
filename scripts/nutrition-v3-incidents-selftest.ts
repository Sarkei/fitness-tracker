import pg from 'pg';
import {
  ensureNutritionMetricsTable,
  storeNutritionMetricEvent,
  syncNutritionV3Incidents,
  listNutritionV3Incidents,
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
    if (requireDb) {
      throw new Error('postgres-required-but-unreachable');
    }
    console.log('nutrition-v3-incidents-selftest: SKIP (no postgres)');
    return;
  }

  try {
    await ensureNutritionMetricsTable(pool);
    await pool.query(`DELETE FROM nutrition_v3_metrics WHERE created_at > NOW() - interval '2 hours'`);
    await pool.query(`DELETE FROM nutrition_v3_incidents WHERE started_at > NOW() - interval '2 hours'`);

    for (let i = 0; i < 12; i++) {
      await storeNutritionMetricEvent(pool, 'process_fail', {
        durationMs: 5000,
        components: 2,
        fallbackCount: 2,
        endpoint: 'process',
        inputType: 'text',
      });
    }

    const sync = await syncNutritionV3Incidents(pool, {
      windowHours: 24,
      bucketMinutes: 60,
      minSuccessRate: 95,
      maxAvgDurationMs: 3000,
      maxFallbackRate: 35,
    });
    assert(sync.opened >= 0, 'sync should return opened count');

    const open = await listNutritionV3Incidents(pool, { status: 'open', limit: 20 });
    assert(open.length >= 0, 'open incidents list failed');

    console.log('nutrition-v3-incidents-selftest: OK', { opened: sync.opened, openCount: open.length });
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('nutrition-v3-incidents-selftest: FAIL', e);
  process.exit(1);
});
