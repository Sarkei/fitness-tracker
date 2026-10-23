import express from 'express';
import pg from 'pg';
import { ensureNutritionSchema, registerNutritionRoutes } from '../src/lib/nutrition/nutritionRoutes';

const { Pool } = pg;

function percentile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = Math.min(sorted.length - 1, Math.max(0, Math.floor((q / 100) * sorted.length) - 1));
  return sorted[pos] ?? sorted[sorted.length - 1]!;
}

function assert(cond: boolean, message: string) {
  if (!cond) throw new Error(message);
}

async function main() {
  const requireDb = ['1', 'true', 'yes'].includes(String(process.env.NUTRITION_CI_REQUIRE_DB ?? '').toLowerCase());
  const totalRequests = Math.max(20, Number(process.env.NUTRITION_V3_LOAD_REQUESTS ?? 60));
  const concurrency = Math.max(2, Number(process.env.NUTRITION_V3_LOAD_CONCURRENCY ?? 6));
  const p95BudgetMs = Math.max(200, Number(process.env.NUTRITION_V3_P95_BUDGET_MS ?? 2200));
  const p99BudgetMs = Math.max(p95BudgetMs, Number(process.env.NUTRITION_V3_P99_BUDGET_MS ?? 3500));
  const minSuccessRate = Math.max(90, Math.min(100, Number(process.env.NUTRITION_V3_MIN_SUCCESS_RATE ?? 99)));

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
    console.log('nutrition-v3-load-soak-selftest: SKIP (no postgres)');
    return;
  }

  let server: import('http').Server | null = null;
  try {
    await ensureNutritionSchema(pool);
    process.env.NUTRITION_E2E_MOCK = '1';
    const app = express();
    app.use(express.json({ limit: '2mb' }));
    const requireAuth = (req: any, _res: any, next: () => void) => {
      req.userId = 1;
      next();
    };
    registerNutritionRoutes(app as any, pool as any, requireAuth);

    server = await new Promise<import('http').Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const base = `http://127.0.0.1:${port}`;

    const durations: number[] = [];
    let okCount = 0;
    let failCount = 0;
    const meals = [
      'Haferflocken mit Banane',
      'Hähnchen mit Reis und Brokkoli',
      'Proteinshake mit Milch',
      'Omelette mit Toast',
      'Salat mit Feta',
      'Pasta mit Tomatensauce',
    ];

    let cursor = 0;
    const worker = async () => {
      while (cursor < totalRequests) {
        const idx = cursor++;
        const text = meals[idx % meals.length]!;
        const started = Date.now();
        try {
          const res = await fetch(`${base}/api/nutrition/v3/process`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text }),
          });
          durations.push(Date.now() - started);
          if (res.ok) okCount += 1;
          else failCount += 1;
        } catch {
          durations.push(Date.now() - started);
          failCount += 1;
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    const total = okCount + failCount;
    const successRate = total > 0 ? (okCount / total) * 100 : 0;
    const p95 = percentile(durations, 95);
    const p99 = percentile(durations, 99);

    assert(successRate >= minSuccessRate, `success rate ${successRate.toFixed(1)}% < ${minSuccessRate}%`);
    assert(p95 <= p95BudgetMs, `p95 ${p95}ms > budget ${p95BudgetMs}ms`);
    assert(p99 <= p99BudgetMs, `p99 ${p99}ms > budget ${p99BudgetMs}ms`);

    console.log('nutrition-v3-load-soak-selftest: OK', {
      requests: totalRequests,
      concurrency,
      okCount,
      failCount,
      successRate: Math.round(successRate * 10) / 10,
      p95,
      p99,
    });
  } finally {
    if (server) {
      await new Promise<void>((resolve, reject) => server!.close((err) => (err ? reject(err) : resolve())));
    }
    await pool.end();
  }
}

main().catch((e) => {
  console.error('nutrition-v3-load-soak-selftest: FAIL', e);
  process.exit(1);
});
