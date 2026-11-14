import { test, expect } from '@playwright/test';

test.describe('Community feed', () => {
  test('following tab loads without error banner', async ({ page }) => {
    await page.goto('/social');
    await expect(page.getByText(/Folge ich|Following/i)).toBeVisible({ timeout: 15_000 });
    const err = page.getByText(/konnte nicht geladen|Could not load/i);
    await expect(err).toHaveCount(0);
  });

  test('global feed tab switch', async ({ page }) => {
    await page.goto('/social');
    const globalTab = page.getByRole('button', { name: /Alle|Everyone/i });
    await globalTab.click();
    await expect(globalTab).toHaveClass(/bg-brand/);
  });
});
