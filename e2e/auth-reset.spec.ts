import { test, expect } from '@playwright/test';

test.describe('Password reset (public)', () => {
  test('reset page rejects missing token submit', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page.getByRole('heading')).toBeVisible();
    const submit = page.locator('button[type="submit"]');
    await expect(submit).toBeDisabled();
  });

  test('forgot-password returns ok for unknown email', async ({ request }) => {
    const res = await request.post('/api/auth/forgot-password', {
      data: { email: 'nobody-reset-e2e@vrtx.test' },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
