/**
 * Verteilung der wöchentlichen Trainingseinheiten auf verfügbare Wochentage.
 * Beispiel: 4 Einheiten/Woche, 5 verfügbare Tage → 4 Trainingstage + 1 Ruhetag (gleichmäßig verteilt).
 */

import { COACH_WEEKDAY_ORDER } from './coachWeekDisplay';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const ALLOWED_DAY_SET = new Set<string>(DAY_NAMES);

export function normalizeCoachDayName(raw: string): string | null {
  const t = String(raw || '').trim();
  if (!t) return null;
  const cap = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  if (ALLOWED_DAY_SET.has(cap)) return cap;
  const lower = t.toLowerCase();
  const map: Record<string, string> = {
    sun: 'Sunday',
    sunday: 'Sunday',
    sonntag: 'Sunday',
    mon: 'Monday',
    monday: 'Monday',
    montag: 'Monday',
    tue: 'Tuesday',
    tuesday: 'Tuesday',
    dienstag: 'Tuesday',
    wed: 'Wednesday',
    wednesday: 'Wednesday',
    mittwoch: 'Wednesday',
    thu: 'Thursday',
    thursday: 'Thursday',
    donnerstag: 'Thursday',
    fri: 'Friday',
    friday: 'Friday',
    freitag: 'Friday',
    sat: 'Saturday',
    saturday: 'Saturday',
    samstag: 'Saturday',
  };
  return map[lower] ?? (ALLOWED_DAY_SET.has(cap) ? cap : null);
}

export interface TrainingSlotPlan {
  /** Tage mit mindestens einer Trainingseinheit (gleichmäßig verteilt). */
  workoutDays: string[];
  /** Bei sessions > available: Tage mit zwei Einheiten (nur wenn erlaubt). */
  doubleSessionDays: string[];
  targetSessions: number;
  availableDayCount: number;
}

/** N Indizes gleichmäßig über M Tage (0 … M-1). */
export function pickEvenlySpacedIndices(m: number, n: number): number[] {
  if (n <= 0 || m <= 0) return [];
  if (n >= m) return Array.from({ length: m }, (_, i) => i);
  if (n === 1) return [Math.floor((m - 1) / 2)];

  const indices: number[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < n; i++) {
    const idx = Math.round((i * (m - 1)) / (n - 1));
    if (!seen.has(idx)) {
      seen.add(idx);
      indices.push(idx);
    }
  }
  for (let j = 0; indices.length < n && j < m; j++) {
    if (!seen.has(j)) {
      seen.add(j);
      indices.push(j);
    }
  }
  return indices.sort((a, b) => a - b);
}

export function computeTrainingSlotPlan(
  availableTrainingDays: string[],
  targetSessions: number,
  allowDoubleSessions: boolean,
): TrainingSlotPlan | null {
  const sorted = COACH_WEEKDAY_ORDER.filter((d) =>
    availableTrainingDays.some((raw) => normalizeCoachDayName(raw) === d),
  );
  const m = sorted.length;
  const n = Math.max(0, Math.floor(targetSessions));
  if (m === 0 || n === 0) return null;

  if (n <= m) {
    const idx = pickEvenlySpacedIndices(m, n);
    return {
      workoutDays: idx.map((i) => sorted[i]),
      doubleSessionDays: [],
      targetSessions: n,
      availableDayCount: m,
    };
  }

  if (!allowDoubleSessions) {
    return {
      workoutDays: sorted,
      doubleSessionDays: [],
      targetSessions: n,
      availableDayCount: m,
    };
  }

  const extras = n - m;
  const doubleIdx = pickEvenlySpacedIndices(m, extras);
  return {
    workoutDays: sorted,
    doubleSessionDays: doubleIdx.map((i) => sorted[i]),
    targetSessions: n,
    availableDayCount: m,
  };
}

/** Kurzer Hinweis für KI-Prompt. */
export function formatTrainingSlotPlanForPrompt(plan: TrainingSlotPlan): string {
  const restOnAvailable =
    plan.availableDayCount > plan.workoutDays.length
      ? ` Mark other *available* weekdays as rest (isRest=true).`
      : '';
  if (plan.doubleSessionDays.length > 0) {
    return (
      `EXACTLY ${plan.targetSessions} sessions/week: one session on each of ${plan.workoutDays.join(', ')}; ` +
      `SECOND session on ${plan.doubleSessionDays.join(', ')} (use sessionSlot Morning/Evening).${restOnAvailable}`
    );
  }
  return (
    `EXACTLY ${plan.targetSessions} non-rest sessions this week — ONLY on: ${plan.workoutDays.join(', ')}.` +
    restOnAvailable +
    ` All other weekdays (including unused available days) MUST be isRest=true.`
  );
}
