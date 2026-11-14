import { test, expect } from '@playwright/test';
import { format } from 'date-fns';

async function apiWithToken<T>(page: any, path: string): Promise<T> {
  return page.evaluate(async (p) => {
    const token = localStorage.getItem('vrtx_jwt');
    const res = await fetch(p, {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, path);
}

async function apiWithTokenRequest<T>(
  page: any,
  path: string,
  method: 'GET' | 'POST' | 'PATCH',
  body?: unknown,
): Promise<T> {
  return page.evaluate(
    async ({ p, m, b }) => {
      const token = localStorage.getItem('vrtx_jwt');
      const res = await fetch(p, {
        method: m,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: b != null ? JSON.stringify(b) : undefined,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    { p: path, m: method, b: body ?? null },
  );
}

test.describe('Nutrition V3 critical flow', () => {
  test('quick log persists as V3 reviewed entry', async ({ page }) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    await page.goto('/');

    await page.getByTestId('dashboard-open-quick-log').click();
    await expect(page.getByTestId('quicklog-textarea')).toBeVisible();
    await page.getByTestId('quicklog-textarea').fill('200g griechischer joghurt mit banane');
    await page.getByTestId('quicklog-submit').click();

    await expect(page.getByTestId('quicklog-textarea')).toBeHidden({ timeout: 45_000 });

    const entries = await apiWithToken<Array<{ id: string; pipelineVersion?: string; userReviewed?: boolean }>>(
      page,
      `/api/nutrition?date=${today}`,
    );
    const v3 = entries.find((e) => e.pipelineVersion === 'nutrition-v3');
    expect(v3, 'expected at least one V3 nutrition entry').toBeTruthy();
    expect(v3?.userReviewed).toBeTruthy();
  });

  test('components endpoint returns rows for V3 entry', async ({ page }) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    await page.goto('/');

    const entries = await apiWithToken<Array<{ id: string; pipelineVersion?: string }>>(
      page,
      `/api/nutrition?date=${today}`,
    );
    const v3 = entries.find((e) => e.pipelineVersion === 'nutrition-v3');
    expect(v3, 'expected V3 entry from quick log').toBeTruthy();

    const details = await apiWithToken<{ components: Array<{ product_name: string; grams: number }> }>(
      page,
      `/api/nutrition/${v3!.id}/components`,
    );
    expect(details.components.length).toBeGreaterThan(0);
    expect(details.components[0]?.product_name).toBeTruthy();
    expect(Number(details.components[0]?.grams || 0)).toBeGreaterThan(0);
  });

  test('v3 edit patch updates component grams', async ({ page }) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    await page.goto('/');

    const entries = await apiWithToken<Array<{ id: string; pipelineVersion?: string; meal?: string }>>(
      page,
      `/api/nutrition?date=${today}`,
    );
    const v3 = entries.find((e) => e.pipelineVersion === 'nutrition-v3');
    expect(v3, 'expected existing V3 entry').toBeTruthy();

    const process = await apiWithTokenRequest<any>(page, '/api/nutrition/v3/process', 'POST', {
      text: v3?.meal || 'e2e quick meal',
    });
    const reviewed = (process.matches as Array<any>).map((m) => ({
      component_id: m.component_id,
      grams: Math.max(1, Math.round((m.estimated_grams ?? 100) + 20)),
      selectedRank: m.auto_selected_rank ?? 1,
      user_modified: true,
    }));

    await apiWithTokenRequest(page, `/api/nutrition/v3/${v3!.id}`, 'PATCH', {
      nutritionId: v3!.id,
      result: process,
      reviewedComponents: reviewed,
      originalInput: v3?.meal || '',
      category: 'snack',
    });

    const details = await apiWithToken<{ components: Array<{ grams: number }> }>(
      page,
      `/api/nutrition/${v3!.id}/components`,
    );
    expect(details.components.length).toBeGreaterThan(0);
    expect(Number(details.components[0]?.grams || 0)).toBeGreaterThan(0);
  });
});

