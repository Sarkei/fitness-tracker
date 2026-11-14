/**
 * Coach-Plan: asynchrone Woche-1-Generierung (vermeidet Cloudflare-HTTP-524).
 */

import { api } from '@/src/lib/api';

export type CoachPlanGenerationStatus = 'generating' | 'ready' | 'failed';

export type CoachPlanGenerationPhase =
  | 'queued'
  | 'context'
  | 'ai'
  | `ai:${number}`
  | 'validation'
  | 'saving'
  | 'ready'
  | 'failed';

export interface CoachPlanGenerationState {
  status: CoachPlanGenerationStatus;
  phase?: CoachPlanGenerationPhase | null;
  error?: string | null;
}

export interface CreateCoachPlanResponse {
  planId: string;
  status: CoachPlanGenerationStatus;
  schedule?: unknown;
}

export async function fetchCoachPlanGeneration(planId: string): Promise<CoachPlanGenerationState> {
  return api<CoachPlanGenerationState>(`/api/coach/plans/${encodeURIComponent(planId)}/generation`);
}

/** Wartet bis Woche 1 fertig ist (Polling, Standard 12 Min.). */
export async function waitForCoachPlanGeneration(
  planId: string,
  opts?: {
    intervalMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
    onTick?: (state: CoachPlanGenerationState) => void;
  },
): Promise<void> {
  const intervalMs = opts?.intervalMs ?? 2500;
  const timeoutMs = opts?.timeoutMs ?? 12 * 60 * 1000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (opts?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const state = await fetchCoachPlanGeneration(planId);
    opts?.onTick?.(state);
    if (state.status === 'ready') return;
    if (state.status === 'failed') {
      throw new Error(state.error?.trim() || 'Coach plan generation failed');
    }
    await new Promise<void>((resolve, reject) => {
      const t = window.setTimeout(resolve, intervalMs);
      opts?.signal?.addEventListener(
        'abort',
        () => {
          window.clearTimeout(t);
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
  }

  throw new Error('COACH_GEN_TIMEOUT');
}

/** Bricht laufende Plan-Erstellung ab und löscht den Plan (kein fertiger Wochenplan). */
export async function cancelCoachPlanGeneration(planId: string): Promise<void> {
  await api(`/api/coach/plans/${encodeURIComponent(planId)}/cancel-generation`, { method: 'POST' });
}
