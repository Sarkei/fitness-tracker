import { api } from '@/src/lib/api';
import type { CoachPlanSummary } from '@/src/lib/AppDataContext';

export type CoachAutoAdvanceResult = {
  advanced: boolean;
  newWeek?: number;
  weeklyReportGenerated?: boolean;
  weeksAdvanced?: number;
  reason?: string;
};

/**
 * Nach Wochenende: Report erzeugen + Plan-Woche vorrücken.
 * Server führt bei Bedarf mehrere Wochen nach (Catch-up), wenn die App länger nicht offen war.
 */
export async function tryCoachAutoAdvancePlan(planId: string): Promise<CoachAutoAdvanceResult> {
  try {
    return await api<CoachAutoAdvanceResult>(`/api/coach/plans/${encodeURIComponent(planId)}/auto-advance`, {
      method: 'POST',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/503|KI ist nicht konfiguriert/i.test(msg)) {
      return { advanced: false, reason: 'ai-disabled' };
    }
    return { advanced: false, reason: msg };
  }
}

export async function tryCoachAutoAdvanceForActivePlans(
  plans: CoachPlanSummary[],
): Promise<CoachAutoAdvanceResult | null> {
  const active = plans.filter((p) => p.status === 'active');
  let last: CoachAutoAdvanceResult | null = null;
  for (const plan of active) {
    const result = await tryCoachAutoAdvancePlan(plan.id);
    last = result;
    if (result.advanced) return result;
  }
  return last;
}
