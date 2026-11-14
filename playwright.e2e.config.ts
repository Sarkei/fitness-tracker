import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, 'e2e', '.auth', 'user.json');

export default defineConfig({
  testDir: './e2e',
  globalSetup: path.join(__dirname, 'e2e', 'global-setup.ts'),
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: authFile,
      },
      dependencies: ['setup'],
      testIgnore: [/auth\.setup\.ts/, /auth-reset\.spec\.ts/, /\.live\.spec\.ts/],
    },
  ],
  webServer: {
    command: 'node scripts/e2e-webserver.mjs',
    url: 'http://localhost:3000',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      ...process.env,
      COACH_E2E_MOCK: '1',
      NUTRITION_E2E_MOCK: '1',
    },
  },
});
