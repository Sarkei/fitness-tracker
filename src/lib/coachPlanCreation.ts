import { api } from '@/src/lib/api';
import {
  cancelCoachPlanGeneration,
  waitForCoachPlanGeneration,
  type CoachPlanGenerationState,
} from '@/src/services/coachPlanService';

export type CreateCoachPlanPayload = {
  type: 'workout' | 'nutrition';
  discipline: string;
  planMode?: string;
  eventName?: string;
  eventDate?: string;
  eventDistance?: string;
  onboardingData: unknown;
};

export async function createCoachPlanAndWait(
  payload: CreateCoachPlanPayload,
  opts?: {
    onTick?: (state: CoachPlanGenerationState) => void;
    onPlanCreated?: (planId: string) => void;
    signal?: AbortSignal;
  },
): Promise<string> {
  const res = await api<{ planId: string; status?: string }>('/api/coach/plans', {
    method: 'POST',
    body: JSON.stringify(payload),
    signal: opts?.signal,
  });

  const planId = res.planId;
  if (!planId) throw new Error('Coach plan id missing');
  opts?.onPlanCreated?.(planId);

  if (res.status === 'generating' || res.status !== 'ready') {
    await waitForCoachPlanGeneration(planId, {
      timeoutMs: 12 * 60 * 1000,
      onTick: opts?.onTick,
      signal: opts?.signal,
    });
  }

  return planId;
}

export async function abortCoachPlanCreation(planId: string | null): Promise<void> {
  if (!planId) return;
  try {
    await cancelCoachPlanGeneration(planId);
  } catch {
    /* plan may already be gone */
  }
}
