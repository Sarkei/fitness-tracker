import { execSync } from 'node:child_process';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function run(command, env = {}) {
  execSync(command, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
}

async function detectPostgresEnv() {
  const { Pool } = pg;
  const candidates = [
    {
      POSTGRES_HOST: process.env.POSTGRES_HOST ?? 'localhost',
      POSTGRES_PORT: process.env.POSTGRES_PORT ?? '5432',
      POSTGRES_DB: process.env.POSTGRES_DB ?? 'fitness_tracker',
      POSTGRES_USER: process.env.POSTGRES_USER ?? 'vrtx',
      POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD ?? 'vrtx_secret',
    },
    {
      POSTGRES_HOST: 'localhost',
      POSTGRES_PORT: '5433',
      POSTGRES_DB: 'fitness_tracker',
      POSTGRES_USER: 'vrtx',
      POSTGRES_PASSWORD: 'vrtx_secret',
    },
  ];
  for (const env of candidates) {
    const pool = new Pool({
      host: env.POSTGRES_HOST,
      port: Number(env.POSTGRES_PORT),
      database: env.POSTGRES_DB,
      user: env.POSTGRES_USER,
      password: env.POSTGRES_PASSWORD,
      max: 1,
      connectionTimeoutMillis: 2000,
    });
    try {
      await pool.query('SELECT 1');
      await pool.end().catch(() => {});
      return env;
    } catch {
      await pool.end().catch(() => {});
    }
  }
  return null;
}

const pgEnv = await detectPostgresEnv();
if (!pgEnv) {
  console.error('[ci:nutrition:strict] Keine erreichbare Postgres-Instanz gefunden.');
  process.exit(1);
}

const strictEnv = { ...pgEnv, NUTRITION_CI_REQUIRE_DB: '1' };
run('npm run test:nutrition-v3-contract:int', strictEnv);
run('npm run test:nutrition-v3-incidents', strictEnv);
run('npm run test:nutrition-v3-ux', strictEnv);
run('npm run test:nutrition-v3-load', strictEnv);
run('npm run ci:nutrition', strictEnv);
