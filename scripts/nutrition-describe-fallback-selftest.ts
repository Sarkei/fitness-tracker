import express from 'express';
import pg from 'pg';
import { ensureNutritionSchema, registerNutritionRoutes } from '../src/lib/nutrition/nutritionRoutes';

const { Pool } = pg;

type ApiErrorBody = {
  error?: string;
  code?: string;
  message?: string;
  traceId?: string;
};

async function main() {
  const requireDb = ['1', 'true', 'yes'].includes(
    String(process.env.NUTRITION_CI_REQUIRE_DB ?? '').toLowerCase(),
  );
  const realPool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'fitness_tracker',
    user: process.env.POSTGRES_USER || 'vrtx',
    password: process.env.POSTGRES_PASSWORD || 'vrtx_secret',
  });
  let useFakePool = false;
  let userId = 1;

  try {
    await realPool.query('SELECT 1');
  } catch {
    if (requireDb) {
      throw new Error('postgres-required-but-unreachable');
    }
    useFakePool = true;
    console.log('nutrition-describe-fallback-selftest: INFO using fake in-memory pool (postgres unreachable)');
  }

  const prevGemini = process.env.GEMINI_API_KEY;
  const prevMistral = process.env.MISTRAL_API_KEY;
  try {
    const pool: any = useFakePool
      ? {
          query: async (sql: string) => {
            if (/insert\s+into\s+meal_ai_runs_v2/i.test(sql)) {
              return { rows: [{ id: '00000000-0000-0000-0000-000000000001' }] };
            }
            return { rows: [] };
          },
        }
      : realPool;

    if (!useFakePool) {
      await ensureNutritionSchema(pool);
      const userResult = await (pool as pg.Pool).query(
        `INSERT INTO users (name, email, is_active)
         VALUES ('Describe Fallback Test', $1, true)
         ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
         RETURNING id`,
        ['nutrition-describe-fallback-test@vrtx.local'],
      );
      userId = (userResult.rows[0] as { id: number } | undefined)?.id ?? 1;
    }

    process.env.GEMINI_API_KEY = '';
    process.env.MISTRAL_API_KEY = '';

    const app = express();
    app.use(express.json({ limit: '2mb' }));
    const requireAuth = (req: any, _res: any, next: () => void) => {
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

    const inputText = '2 Eier, 1 Banane und 250ml Milch';
    const v3Res = await fetch(`${base}/api/nutrition/v3/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: inputText }),
    });
    const v3Body = (await v3Res.json()) as ApiErrorBody;
    if (v3Res.status !== 500 || v3Body.code !== 'pipeline-failed') {
      throw new Error(`expected v3 pipeline-failed 500, got ${v3Res.status} ${JSON.stringify(v3Body)}`);
    }
    console.log(
      `v3/process failed as expected: status=${v3Res.status} code=${v3Body.code} message=${v3Body.message} traceId=${v3Body.traceId}`,
    );

    const parseRes = await fetch(`${base}/api/nutrition/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: inputText }),
    });
    if (!parseRes.ok) {
      const failedBody = await parseRes.text();
      throw new Error(`/api/nutrition/parse failed: status=${parseRes.status} body=${failedBody}`);
    }
    const parseBody = (await parseRes.json()) as { intent?: { items?: unknown[] } };
    if (!parseBody.intent?.items?.length) {
      throw new Error('parse did not return intent.items');
    }

    const resolveRes = await fetch(`${base}/api/nutrition/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent: parseBody.intent, expertMode: false }),
    });
    if (!resolveRes.ok) {
      const failedBody = await resolveRes.text();
      throw new Error(`/api/nutrition/resolve failed: status=${resolveRes.status} body=${failedBody}`);
    }
    const resolveBody = (await resolveRes.json()) as { lines?: unknown[] };
    if (!Array.isArray(resolveBody.lines) || resolveBody.lines.length === 0) {
      throw new Error('resolve did not return lines');
    }
    console.log(`legacy fallback ok: lines=${resolveBody.lines.length} for input="${inputText}"`);

    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    console.log('nutrition-describe-fallback-selftest: OK');
    process.exit(0);
  } finally {
    process.env.GEMINI_API_KEY = prevGemini;
    process.env.MISTRAL_API_KEY = prevMistral;
    await realPool.end();
  }
}

main().catch((error) => {
  console.error('nutrition-describe-fallback-selftest: FAIL', error);
  process.exit(1);
});
