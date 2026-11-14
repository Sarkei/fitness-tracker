import { test, expect } from '@playwright/test';

test('App lädt die Startseite', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/VRTX/i);
});

test('Health-API antwortet', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.status).toBe('ok');
});
