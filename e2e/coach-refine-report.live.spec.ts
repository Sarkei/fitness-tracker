import { test, expect } from '@playwright/test';

/**
 * Staging / manuell: echter KI-Refine (kein COACH_E2E_MOCK).
 * Voraussetzung: MISTRAL_API_KEY oder GEMINI_API_KEY in .env / CI-Variablen.
 *
 *   COACH_E2E_LIVE=1 COACH_E2E_MOCK=0 npm run test:e2e:coach:live
 */
const liveEnabled = process.env.COACH_E2E_LIVE === '1';

test.describe('Coach refine and report (live AI)', () => {
  test.skip(!liveEnabled, 'Set COACH_E2E_LIVE=1 for real AI refine');

  test('refine calls AI and marks report stale', async ({ page }) => {
    test.setTimeout(300_000);

    let refineBody: { e2eMock?: boolean; schedule?: { coachNotes?: string } } | null = null;

    page.on('response', async (res) => {
      if (res.request().method() !== 'POST') return;
      if (!res.url().includes('/refine-schedule')) return;
      if (!res.ok()) return;
      try {
        refineBody = await res.json();
      } catch {
        /* ignore */
      }
    });

    await page.goto('/workouts');

    const planCard = page.locator('[data-testid="coach-plan-card"]').first();
    await expect(planCard).toBeVisible({ timeout: 30_000 });
    await planCard.click();

    const refineBtn = page.getByTestId('coach-refine-open');
    await expect(refineBtn).toBeVisible({ timeout: 15_000 });
    await expect(refineBtn).toBeEnabled({ timeout: 15_000 });
    await refineBtn.click();

    await expect(page.getByTestId('coach-refine-sheet')).toBeVisible();
    await page.getByTestId('coach-refine-chip-less-volume').click();
    await page.getByTestId('coach-refine-apply').click();

    await expect(page.getByTestId('coach-refine-sheet')).toBeHidden({ timeout: 240_000 });

    expect(refineBody, 'refine-schedule response missing').not.toBeNull();
    expect(refineBody?.e2eMock, 'expected real AI, got E2E mock').not.toBe(true);

    const notes = String(refineBody?.schedule?.coachNotes ?? '');
    expect(notes.length).toBeGreaterThan(0);
    expect(notes).not.toContain('[E2E refine]');

    await page.getByTestId('coach-tab-reports').click();
    await expect(page.getByTestId('coach-stale-banner')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('coach-regenerate-report')).toBeVisible();
  });
});
