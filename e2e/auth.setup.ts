import { test as setup, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const authFile = path.join(__dirname, '.auth', 'user.json');
const TOKEN_KEY = 'vrtx_jwt';

const EMAIL = process.env.E2E_USER_EMAIL || 'e2e-coach@vrtx.test';
const PASSWORD = process.env.E2E_USER_PASSWORD || 'E2eCoachPass123!';

setup('authenticate e2e user', async ({ request, page }) => {
  let token: string | undefined;

  const loginRes = await request.post('/api/auth/login', {
    data: { email: EMAIL, password: PASSWORD },
  });

  if (loginRes.ok()) {
    const body = await loginRes.json();
    token = body.token;
  } else {
    const regRes = await request.post('/api/auth/register', {
      data: {
        name: 'E2E Coach',
        firstName: 'E2E',
        lastName: 'Coach',
        email: EMAIL,
        password: PASSWORD,
        age: 30,
        gender: 'male',
      },
    });
    expect(regRes.ok(), 'register failed — run npm run seed:e2e').toBeTruthy();
    const body = await regRes.json();
    token = body.token;
  }

  expect(token, 'JWT missing after auth').toBeTruthy();

  await page.goto('/');
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: TOKEN_KEY, value: token! },
  );

  fs.mkdirSync(path.dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
