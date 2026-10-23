import express from 'express';
import pg from 'pg';
import { z } from 'zod';
import { ensureNutritionSchema, registerNutritionRoutes } from '../src/lib/nutrition/nutritionRoutes';

const { Pool } = pg;

const StatsSchema = z.object({
  memory: z.object({
    successRate: z.number().nullable(),
    avgDurationMs: z.number().nullable(),
  }),
  persisted: z
    .object({
      totalEvents: z.number(),
      failEvents: z.number(),
      successRate: z.number().nullable(),
    })
    .nullable(),
});

const AlertsSchema = z.object({
  degradedCount: z.number(),
  degradedWindows: z.array(
    z.object({
      status: z.enum(['ok', 'degraded']),
      alerts: z.array(z.string()),
    }),
  ),
});

const ApiErrorSchema = z.object({
  error: z.string(),
  code: z.string(),
  message: z.string(),
  traceId: z.string(),
});

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
    console.log('nutrition-v3-contract-integration-selftest: SKIP (no postgres reachable)');
    await pool.end();
    return;
  }

  try {
    await ensureNutritionSchema(pool);
    const ins = await pool.query<{ id: number }>(
      `INSERT INTO users (name, email, is_active)
       VALUES ('Contract Test', $1, true)
       ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      ['nutrition-contract-test@vrtx.local'],
    );
    const userId = ins.rows[0]?.id ?? 1;

    const app = express();
    app.use(express.json({ limit: '2mb' }));
    const requireAuth = (req: any, res: any, next: () => void) => {
      req.userId = userId;
      next();
    };
    registerNutritionRoutes(app as any, pool as any, requireAuth);

    const server = await new Promise<import('http').Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    const base = `http://127.0.0.1:${port}`;

    const statsRes = await fetch(`${base}/api/nutrition/v3/stats`);
    if (!statsRes.ok) throw new Error(`stats status ${statsRes.status}`);
    StatsSchema.parse(await statsRes.json());

    const alertsRes = await fetch(`${base}/api/nutrition/v3/alerts?sync=true`);
    if (!alertsRes.ok) throw new Error(`alerts status ${alertsRes.status}`);
    AlertsSchema.parse(await alertsRes.json());

    const incidentsRes = await fetch(`${base}/api/nutrition/v3/incidents?sync=true`);
    if (!incidentsRes.ok) throw new Error(`incidents status ${incidentsRes.status}`);
    const incidentsBody = (await incidentsRes.json()) as { incidents?: unknown[] };
    if (!Array.isArray(incidentsBody.incidents)) throw new Error('incidents array missing');

    const metricsRes = await fetch(`${base}/api/nutrition/v3/metrics`);
    if (!metricsRes.ok) throw new Error(`metrics status ${metricsRes.status}`);
    const metrics = await metricsRes.text();
    if (!metrics.includes('# TYPE nutrition_v3_process_ok_total counter')) {
      throw new Error('metrics format invalid');
    }

    const uxEventRes = await fetch(`${base}/api/nutrition/v3/ux-events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventName: 'save_attempt',
        source: 'test',
        success: true,
        durationMs: 1234,
        componentsCount: 2,
      }),
    });
    if (!uxEventRes.ok) throw new Error(`ux event status ${uxEventRes.status}`);

    const processMissing = await fetch(`${base}/api/nutrition/v3/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (processMissing.status !== 400) {
      throw new Error(`expected process missing-input 400, got ${processMissing.status}`);
    }
    ApiErrorSchema.parse(await processMissing.json());

    const processLong = await fetch(`${base}/api/nutrition/v3/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'x'.repeat(9000) }),
    });
    if (processLong.status !== 400) {
      throw new Error(`expected process text-too-long 400, got ${processLong.status}`);
    }
    ApiErrorSchema.parse(await processLong.json());

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    console.log('nutrition-v3-contract-integration-selftest: OK');
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('nutrition-v3-contract-integration-selftest: FAIL', e);
  process.exit(1);
});
