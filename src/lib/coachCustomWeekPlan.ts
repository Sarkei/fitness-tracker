/**
 * Eigenständiger Wochenplan: pro Tag Kraft/Cardio/Ruhe, optional 2 Einheiten (Morning/Evening).
 */

import { COACH_WEEKDAY_ORDER } from './coachWeekDisplay';
import {
  enrichAssignmentsWithDuration,
  resolveTrainingSlotPlanWithVolume,
  strengthExerciseRangeForDuration,
} from './coachSessionVolume';
import {
  computeTrainingSlotPlan,
  formatTrainingSlotPlanForPrompt,
  normalizeCoachDayName,
  type TrainingSlotPlan,
} from './coachSessionDistribution';

export type WeekdaySessionType = 'rest' | 'strength' | 'cardio';
export type CoachSessionSlot = 'Morning' | 'Evening';

export interface CustomDaySession {
  type: WeekdaySessionType;
  sessionSlot?: CoachSessionSlot;
  /** Minuten — nur wenn nicht „Coach entscheidet“ für diesen Typ. */
  durationMin?: number;
}

export type CustomWeekPlan = Partial<Record<string, CustomDaySession[]>>;

export interface SessionAssignment {
  day: string;
  sessionSlot: CoachSessionSlot;
  sessionTypeHint: 'strength' | 'cardio';
  durationMin?: number;
}

export interface ExtendedTrainingSlotPlan extends TrainingSlotPlan {
  scheduleMode: 'auto' | 'custom';
  assignments: SessionAssignment[];
}

export function emptyCustomWeekPlan(): CustomWeekPlan {
  const plan: CustomWeekPlan = {};
  for (const day of COACH_WEEKDAY_ORDER) {
    plan[day] = [{ type: 'rest' }];
  }
  return plan;
}

export function countCustomWeekSessions(plan: CustomWeekPlan): number {
  let n = 0;
  for (const day of COACH_WEEKDAY_ORDER) {
    for (const slot of plan[day] || []) {
      if (slot.type === 'strength' || slot.type === 'cardio') n += 1;
    }
  }
  return n;
}

export function countCustomWeekSessionsByType(plan: CustomWeekPlan): {
  strength: number;
  cardio: number;
} {
  let strength = 0;
  let cardio = 0;
  for (const day of COACH_WEEKDAY_ORDER) {
    for (const slot of plan[day] || []) {
      if (slot.type === 'strength') strength += 1;
      if (slot.type === 'cardio') cardio += 1;
    }
  }
  return { strength, cardio };
}

export function customWeekAvailableDays(plan: CustomWeekPlan): string[] {
  return COACH_WEEKDAY_ORDER.filter(day =>
    (plan[day] || []).some(s => s.type === 'strength' || s.type === 'cardio'),
  );
}

export function computeTrainingSlotPlanFromCustom(plan: CustomWeekPlan): ExtendedTrainingSlotPlan | null {
  const assignments: SessionAssignment[] = [];
  const workoutDays: string[] = [];
  const doubleSessionDays: string[] = [];

  for (const day of COACH_WEEKDAY_ORDER) {
    const raw = plan[day] || [];
    const active = raw.filter(s => s.type === 'strength' || s.type === 'cardio');
    if (active.length === 0) continue;
    workoutDays.push(day);
    if (active.length >= 2) doubleSessionDays.push(day);
    active.forEach((slot, i) => {
      const sessionSlot: CoachSessionSlot =
        slot.sessionSlot || (i === 0 ? 'Morning' : 'Evening');
      assignments.push({
        day,
        sessionSlot,
        sessionTypeHint: slot.type === 'cardio' ? 'cardio' : 'strength',
        durationMin:
          typeof slot.durationMin === 'number' && Number.isFinite(slot.durationMin)
            ? Math.floor(slot.durationMin)
            : undefined,
      });
    });
  }

  const targetSessions = assignments.length;
  if (targetSessions === 0) return null;

  return {
    scheduleMode: 'custom',
    workoutDays,
    doubleSessionDays,
    targetSessions,
    availableDayCount: workoutDays.length,
    assignments,
  };
}

/** Legacy: früher ein gemeinsamer Toggle für Häufigkeit + Dauer */
export function isCoachAdaptiveVolumeOnboarding(ob: Record<string, unknown>): boolean {
  return ob.coachAdaptiveVolume === true;
}

export function isCoachDecidesTrainingDays(ob: Record<string, unknown>): boolean {
  return ob.coachDecidesTrainingDays === true || ob.coachAdaptiveVolume === true;
}

export function isCoachDecidesSessionDuration(ob: Record<string, unknown>): boolean {
  return ob.coachDecidesSessionDuration === true || ob.coachAdaptiveVolume === true;
}

export function resolveTrainingSlotPlanFromOnboarding(
  ob: Record<string, unknown>,
  partialWeekStartDay?: string,
): TrainingSlotPlan | null {
  return resolveTrainingSlotPlanWithVolume(ob, partialWeekStartDay);
}

export function formatExtendedSlotPlanForPrompt(plan: TrainingSlotPlan): string {
  const ext = plan as ExtendedTrainingSlotPlan;
  if (ext.assignments?.length) {
    const lines = ext.assignments.map(a => {
      const dur =
        a.durationMin != null && a.durationMin > 0
          ? `estimatedDuration MUST be ${a.durationMin}`
          : 'estimatedDuration: coach decides';
      const typeRule =
        a.sessionTypeHint === 'cardio'
          ? `sessionType MUST be Cardio or Intervals; populate cardio object; exercises=[] or short accessory only; ${dur}`
          : `sessionType MUST be Strength; ${dur}; include ${a.durationMin ? strengthExerciseRangeForDuration(a.durationMin) : '5–7'} main exercises (3–4 working sets each) — NOT 1–2 exercises for 60min`;
      return `- ${a.day} (${a.sessionSlot}): ${typeRule}`;
    });
    return (
      `EXACTLY ${ext.targetSessions} non-rest sessions — custom athlete week plan (do NOT move sessions to other days):\n` +
      lines.join('\n') +
      '\nDays without a listed session MUST be isRest=true. Same weekday may have two rows (Morning + Evening).'
    );
  }
  return formatTrainingSlotPlanForPrompt(plan);
}

export function syncOnboardingFromCustomPlan(plan: CustomWeekPlan): {
  scheduleMode: 'custom';
  customWeekPlan: CustomWeekPlan;
  trainingDays: number;
  strengthSessionsPerWeek: number;
  cardioSessionsPerWeek: number;
  availableTrainingDays: string[];
  allowDoubleSessions: boolean;
} {
  const sessions = countCustomWeekSessions(plan);
  const byType = countCustomWeekSessionsByType(plan);
  const days = customWeekAvailableDays(plan);
  return {
    scheduleMode: 'custom',
    customWeekPlan: plan,
    trainingDays: Math.max(1, sessions),
    strengthSessionsPerWeek: byType.strength,
    cardioSessionsPerWeek: byType.cardio,
    availableTrainingDays: days.length ? days : [...COACH_WEEKDAY_ORDER],
    allowDoubleSessions: days.some(d => (plan[d] || []).filter(s => s.type !== 'rest').length >= 2),
  };
}

export function normalizeCustomDaySlots(slots: CustomDaySession[]): CustomDaySession[] {
  const active = slots.filter(s => s.type === 'strength' || s.type === 'cardio');
  if (active.length === 0) return [{ type: 'rest' }];
  return active.slice(0, 2).map((s, i) => ({
    type: s.type,
    sessionSlot: s.sessionSlot || (i === 0 ? 'Morning' : 'Evening'),
    durationMin:
      typeof s.durationMin === 'number' && Number.isFinite(s.durationMin)
        ? Math.floor(s.durationMin)
        : undefined,
  }));
}

export function coachDayNameValid(raw: string): string | null {
  return normalizeCoachDayName(raw);
}
