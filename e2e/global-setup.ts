import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

export default async function globalSetup() {
  const pgEnv =
    process.env.POSTGRES_PORT === '5433'
      ? {
          POSTGRES_HOST: 'localhost',
          POSTGRES_PORT: '5433',
          POSTGRES_DB: 'fitness_tracker',
          POSTGRES_USER: 'vrtx',
          POSTGRES_PASSWORD: 'vrtx_secret',
        }
      : {};
  execSync('npx tsx scripts/seed-coach-e2e.ts', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...pgEnv },
  });
}
