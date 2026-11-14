import { execSync } from 'node:child_process';
import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function run(cmd) {
  execSync(cmd, { cwd: root, stdio: 'inherit' });
}

async function canConnectPostgres(env) {
  const { Pool } = pg;
  const pool = new Pool({
    host: env.POSTGRES_HOST,
    port: Number(env.POSTGRES_PORT),
    database: env.POSTGRES_DB,
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    max: 1,
    connectionTimeoutMillis: 1500,
  });
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => {});
  }
}

function dockerOk() {
  try {
    execSync('docker info', { cwd: root, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

if (!dockerOk()) {
  const envCandidate = {
    POSTGRES_HOST: process.env.POSTGRES_HOST ?? 'localhost',
    POSTGRES_PORT: process.env.POSTGRES_PORT ?? '5432',
    POSTGRES_DB: process.env.POSTGRES_DB ?? 'fitness_tracker',
    POSTGRES_USER: process.env.POSTGRES_USER ?? 'vrtx',
    POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD ?? 'vrtx_secret',
  };
  const e2eCandidate = {
    POSTGRES_HOST: 'localhost',
    POSTGRES_PORT: '5433',
    POSTGRES_DB: 'fitness_tracker',
    POSTGRES_USER: 'vrtx',
    POSTGRES_PASSWORD: 'vrtx_secret',
  };
  const envOk = await canConnectPostgres(envCandidate);
  const e2eOk = await canConnectPostgres(e2eCandidate);
  if (envOk || e2eOk) {
    console.log(
      `[test-db] Docker nicht erreichbar, aber Postgres läuft bereits auf ${
        envOk ? `${envCandidate.POSTGRES_HOST}:${envCandidate.POSTGRES_PORT}` : 'localhost:5433'
      }.`,
    );
    process.exit(0);
  }
  console.error('[test-db] Docker nicht erreichbar und keine laufende Postgres-Instanz gefunden.');
  process.exit(1);
}

console.log('[test-db] Starte E2E-Postgres auf :5433…');
run('docker compose -f docker-compose.e2e.yaml up -d --wait');
console.log('[test-db] Postgres bereit.');
