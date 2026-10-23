import { spawn, execSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const pgEnv = {
  POSTGRES_HOST: 'localhost',
  POSTGRES_PORT: '5433',
  POSTGRES_DB: 'fitness_tracker',
  POSTGRES_USER: 'vrtx',
  POSTGRES_PASSWORD: 'vrtx_secret',
};

function run(cmd) {
  execSync(cmd, { cwd: root, stdio: 'inherit' });
}

function canUseDockerDaemon() {
  try {
    execSync('docker info', { cwd: root, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

async function waitForPostgres(maxMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    try {
      execSync(
        'docker compose -f docker-compose.e2e.yaml exec -T postgres pg_isready -U vrtx -d fitness_tracker',
        { cwd: root, stdio: 'pipe' },
      );
      return;
    } catch {
      await sleep(1500);
    }
  }
  throw new Error('postgres-e2e-not-ready');
}

function canConnectPostgres(env) {
  try {
    execSync('npx tsx scripts/seed-coach-e2e.ts', {
      cwd: root,
      stdio: 'pipe',
      env: { ...process.env, ...env },
    });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const dockerAvailable = canUseDockerDaemon();
  const runtimePgEnv = dockerAvailable
    ? pgEnv
    : {
        POSTGRES_HOST: process.env.POSTGRES_HOST ?? 'localhost',
        POSTGRES_PORT: process.env.POSTGRES_PORT ?? '5432',
        POSTGRES_DB: process.env.POSTGRES_DB ?? 'fitness_tracker',
        POSTGRES_USER: process.env.POSTGRES_USER ?? 'vrtx',
        POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD ?? 'vrtx_secret',
      };

  if (dockerAvailable) {
    console.log('[e2e] Starting Postgres on :5433…');
    run('docker compose -f docker-compose.e2e.yaml up -d --wait');
    await waitForPostgres();
  } else {
    console.warn(
      `[e2e] Docker daemon nicht erreichbar. Nutze bestehende DB ${runtimePgEnv.POSTGRES_HOST}:${runtimePgEnv.POSTGRES_PORT}.`,
    );
  }

  if (!canConnectPostgres(runtimePgEnv)) {
    throw new Error(
      `[e2e] Keine erreichbare Postgres-DB unter ${runtimePgEnv.POSTGRES_HOST}:${runtimePgEnv.POSTGRES_PORT}. ` +
        'Starte Docker Desktop oder setze POSTGRES_HOST/POSTGRES_PORT auf eine laufende DB.',
    );
  }

  console.log('[e2e] Seeding test user…');
  execSync('npx tsx scripts/seed-coach-e2e.ts', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...runtimePgEnv },
  });

  const devEnv = {
    ...process.env,
    ...runtimePgEnv,
    COACH_E2E_MOCK: process.env.COACH_E2E_MOCK ?? '1',
    NUTRITION_E2E_MOCK: process.env.NUTRITION_E2E_MOCK ?? '1',
  };

  console.log('[e2e] Starting dev server…');
  const child = spawn('npm', ['run', 'dev'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: devEnv,
  });

  const shutdown = () => {
    child.kill('SIGTERM');
    if (dockerAvailable) {
      try {
        run('docker compose -f docker-compose.e2e.yaml down');
      } catch {
        /* ignore */
      }
    }
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  child.on('exit', (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
