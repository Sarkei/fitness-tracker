import { test, expect } from '@playwright/test';

test.describe('Coach refine and report flow', () => {
  test('refine opens sheet, shows stale banner, regenerate visible', async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto('/workouts');

    const planCard = page.locator('[data-testid="coach-plan-card"]').first();
    await expect(planCard).toBeVisible({ timeout: 30_000 });
    await planCard.click();

    const refineBtn = page.getByTestId('coach-refine-open');
    await expect(refineBtn).toBeVisible({ timeout: 15_000 });
    await refineBtn.click();

    await expect(page.getByTestId('coach-refine-sheet')).toBeVisible();
    await page.getByTestId('coach-refine-chip-less-volume').click();
    await page.getByTestId('coach-refine-apply').click();

    await expect(page.getByTestId('coach-refine-sheet')).toBeHidden({ timeout: 120_000 });

    await page.getByTestId('coach-tab-reports').click();
    await expect(page.getByTestId('coach-stale-banner')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('coach-regenerate-report')).toBeVisible();
  });
});
