import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, 'e2e', '.auth', 'user.json');

export default defineConfig({
  testDir: './e2e',
  globalSetup: path.join(__dirname, 'e2e', 'global-setup.ts'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
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
    {
      name: 'public',
      use: { ...devices['Desktop Chrome'] },
      testMatch: [/auth-reset\.spec\.ts/],
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      COACH_E2E_MOCK: process.env.COACH_E2E_MOCK ?? (process.env.CI ? '1' : '0'),
    },
  },
});
