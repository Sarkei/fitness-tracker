import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, 'e2e', '.auth', 'user.json');

/** Staging: echter KI-Refine — COACH_E2E_MOCK aus, COACH_E2E_LIVE an. */
export default defineConfig({
  testDir: './e2e',
  globalSetup: path.join(__dirname, 'e2e', 'global-setup.ts'),
  testMatch: /coach-refine-report\.live\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-staging' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium-live',
      use: { ...devices['Desktop Chrome'], storageState: authFile },
      dependencies: ['setup'],
      testMatch: /coach-refine-report\.live\.spec\.ts/,
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          ...process.env,
          COACH_E2E_MOCK: '0',
          COACH_E2E_LIVE: '1',
        },
      },
});
