/**
 * Kraft- vs. Cardio-Volumen (Anzahl/Woche + Dauer) — getrennt konfigurierbar.
 */

import { filterAssignmentsFromStartDay } from './coachCustomScheduleAlign';
import type { CustomWeekPlan, SessionAssignment } from './coachCustomWeekPlan';
import { computeTrainingSlotPlanFromCustom } from './coachCustomWeekPlan';
import {
  computeTrainingSlotPlan,
  normalizeCoachDayName,
  type TrainingSlotPlan,
} from './coachSessionDistribution';
import { COACH_WEEKDAY_ORDER, indexCoachWeekday } from './coachWeekDisplay';

export interface VolumePromptOptions {
  partialWeekStartDay?: string;
}

export interface CoachSessionVolumeConfig {
  strengthSessionsPerWeek: number | null;
  cardioSessionsPerWeek: number | null;
  strengthDurationMin: number | null;
  cardioDurationMin: number | null;
  coachDecidesStrengthSessions: boolean;
  coachDecidesCardioSessions: boolean;
  coachDecidesStrengthDuration: boolean;
  coachDecidesCardioDuration: boolean;
}

const STRENGTH_DURATIONS = [45, 60, 75, 90, 120] as const;
const CARDIO_DURATIONS = [30, 45, 60, 75, 90] as const;
const SESSION_COUNTS = [0, 1, 2, 3, 4, 5, 6] as const;

export { STRENGTH_DURATIONS, CARDIO_DURATIONS, SESSION_COUNTS };

function numOrNull(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.floor(v);
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : null;
}

export function parseCoachSessionVolume(
  ob: Record<string, unknown>,
  trainingStyle?: string,
): CoachSessionVolumeConfig {
  const style = trainingStyle || String(ob.trainingStyle || 'strength');
  const legacyDays = numOrNull(ob.trainingDays);
  const legacyDur = numOrNull(ob.sessionDuration);
  const legacyCoachDays = ob.coachDecidesTrainingDays === true || ob.coachAdaptiveVolume === true;
  const legacyCoachDur =
    ob.coachDecidesSessionDuration === true || ob.coachAdaptiveVolume === true;

  let strengthSessions = numOrNull(ob.strengthSessionsPerWeek);
  let cardioSessions = numOrNull(ob.cardioSessionsPerWeek);
  let strengthDur = numOrNull(ob.strengthSessionDurationMin);
  let cardioDur = numOrNull(ob.cardioSessionDurationMin);

  let coachStrSess = ob.coachDecidesStrengthSessions === true;
  let coachCarSess = ob.coachDecidesCardioSessions === true;
  let coachStrDur = ob.coachDecidesStrengthDuration === true;
  let coachCarDur = ob.coachDecidesCardioDuration === true;

  if (strengthSessions == null && cardioSessions == null && legacyDays != null) {
    if (style === 'endurance') {
      cardioSessions = legacyDays;
      strengthSessions = 0;
    } else if (style === 'hybrid') {
      strengthSessions = Math.max(1, Math.ceil(legacyDays * 0.6));
      cardioSessions = Math.max(0, legacyDays - strengthSessions);
    } else {
      strengthSessions = legacyDays;
      cardioSessions = 0;
    }
  }
  if (strengthDur == null && legacyDur != null) strengthDur = legacyDur;
  if (cardioDur == null && legacyDur != null) cardioDur = Math.min(legacyDur, 60);

  if (legacyCoachDays && !coachStrSess && !coachCarSess) {
    coachStrSess = true;
    coachCarSess = style === 'hybrid' || style === 'endurance';
  }
  if (legacyCoachDur && !coachStrDur && !coachCarDur) {
    coachStrDur = true;
    coachCarDur = style === 'hybrid' || style === 'endurance';
  }

  return {
    strengthSessionsPerWeek: coachStrSess ? null : strengthSessions,
    cardioSessionsPerWeek: coachCarSess ? null : cardioSessions,
    strengthDurationMin: coachStrDur ? null : strengthDur,
    cardioDurationMin: coachCarDur ? null : cardioDur,
    coachDecidesStrengthSessions: coachStrSess,
    coachDecidesCardioSessions: coachCarSess,
    coachDecidesStrengthDuration: coachStrDur,
    coachDecidesCardioDuration: coachCarDur,
  };
}

export function totalWeeklySessions(vol: CoachSessionVolumeConfig): number | null {
  if (vol.coachDecidesStrengthSessions || vol.coachDecidesCardioSessions) return null;
  return (vol.strengthSessionsPerWeek ?? 0) + (vol.cardioSessionsPerWeek ?? 0);
}

/** Legacy-Felder für ältere Code-Pfade. */
export function syncLegacyVolumeFields(
  ob: Record<string, unknown>,
  vol: CoachSessionVolumeConfig,
): Record<string, unknown> {
  const total = totalWeeklySessions(vol);
  return {
    ...ob,
    strengthSessionsPerWeek: vol.strengthSessionsPerWeek,
    cardioSessionsPerWeek: vol.cardioSessionsPerWeek,
    strengthSessionDurationMin: vol.strengthDurationMin,
    cardioSessionDurationMin: vol.cardioDurationMin,
    coachDecidesStrengthSessions: vol.coachDecidesStrengthSessions,
    coachDecidesCardioSessions: vol.coachDecidesCardioSessions,
    coachDecidesStrengthDuration: vol.coachDecidesStrengthDuration,
    coachDecidesCardioDuration: vol.coachDecidesCardioDuration,
    trainingDays: total ?? ob.trainingDays,
    sessionDuration: vol.strengthDurationMin ?? ob.sessionDuration,
    coachDecidesTrainingDays:
      vol.coachDecidesStrengthSessions && vol.coachDecidesCardioSessions,
    coachDecidesSessionDuration:
      vol.coachDecidesStrengthDuration && vol.coachDecidesCardioDuration,
  };
}

export function strengthExerciseRangeForDuration(min: number): string {
  if (min <= 45) return '4–5';
  if (min <= 60) return '5–7';
  if (min <= 75) return '6–8';
  if (min <= 90) return '7–8';
  return '8–10';
}

/** Verfügbare Tage ab Starttag (Teilwoche) — Reihenfolge Mo→So. */
export function filterAvailableDaysFromStart(
  availableTrainingDays: string[],
  partialWeekStartDay?: string,
): string[] {
  const sorted = COACH_WEEKDAY_ORDER.filter((d) =>
    availableTrainingDays.some((raw) => normalizeCoachDayName(raw) === d),
  );
  if (!partialWeekStartDay) return sorted;
  const start = normalizeCoachDayName(partialWeekStartDay);
  if (!start) return sorted;
  const idx = indexCoachWeekday(start);
  if (idx < 0) return sorted;
  const allowed = new Set(COACH_WEEKDAY_ORDER.slice(idx));
  return sorted.filter((d) => allowed.has(d));
}

function maxSessionsInDayWindow(dayCount: number, allowDoubles: boolean): number {
  if (dayCount <= 0) return 0;
  return allowDoubles ? dayCount * 2 : dayCount;
}

/** Teilwoche: Ziele auf realistische Slot-Kapazität begrenzen (Verhältnis Kraft/Cardio bleibt). */
export function capVolumeForPartialWeek(
  strengthN: number,
  cardioN: number,
  days: string[],
  allowDoubles: boolean,
): { strength: number; cardio: number } {
  const maxSlots = maxSessionsInDayWindow(days.length, allowDoubles);
  const total = strengthN + cardioN;
  if (total <= maxSlots) return { strength: strengthN, cardio: cardioN };
  let ns = Math.floor((strengthN * maxSlots) / total);
  let nc = maxSlots - ns;
  if (strengthN > 0 && cardioN > 0) {
    if (ns === 0) {
      ns = 1;
      nc = maxSlots - 1;
    }
    if (nc === 0) {
      nc = 1;
      ns = maxSlots - 1;
    }
  }
  return { strength: Math.min(ns, strengthN), cardio: Math.min(nc, cardioN) };
}

function interleaveSessionTypes(strengthN: number, cardioN: number): Array<'strength' | 'cardio'> {
  const queue: Array<'strength' | 'cardio'> = [];
  let s = strengthN;
  let c = cardioN;
  while (s > 0 || c > 0) {
    if (s >= c && s > 0) {
      queue.push('strength');
      s -= 1;
    } else if (c > 0) {
      queue.push('cardio');
      c -= 1;
    } else break;
  }
  return queue;
}

function distributeVolumeAssignments(
  days: string[],
  strengthN: number,
  cardioN: number,
  allowDoubles: boolean,
  vol: CoachSessionVolumeConfig,
  ob: Record<string, unknown>,
): SessionAssignment[] {
  const total = strengthN + cardioN;
  if (total <= 0 || !days.length) return [];
  const slotPlan = computeTrainingSlotPlan(days, total, allowDoubles);
  if (!slotPlan) return [];

  const queue = interleaveSessionTypes(strengthN, cardioN);
  const doubleSet = new Set(slotPlan.doubleSessionDays);
  const orderedWorkoutDays = COACH_WEEKDAY_ORDER.filter((d) => slotPlan.workoutDays.includes(d));
  const assignments: SessionAssignment[] = [];
  let qi = 0;

  for (const day of orderedWorkoutDays) {
    const slotsOnDay = doubleSet.has(day) ? 2 : 1;
    for (let i = 0; i < slotsOnDay && qi < queue.length; i += 1) {
      const hint = queue[qi];
      qi += 1;
      let durationMin: number | undefined;
      if (hint === 'cardio' && !vol.coachDecidesCardioDuration && vol.cardioDurationMin) {
        durationMin = vol.cardioDurationMin;
      } else if (hint === 'strength' && !vol.coachDecidesStrengthDuration && vol.strengthDurationMin) {
        durationMin = vol.strengthDurationMin;
      }
      assignments.push({
        day,
        sessionSlot: i === 0 ? 'Morning' : 'Evening',
        sessionTypeHint: hint,
        durationMin,
      });
    }
  }

  return enrichAssignmentsWithDuration(assignments, ob);
}

/**
 * Custom- oder Auto-Plan: typisierte Slots (Kraft vs. Cardio) inkl. Teilwoche.
 * null = Coach entscheidet Anzahl (freie Verteilung).
 */
export function buildVolumeAssignmentsFromOnboarding(
  ob: Record<string, unknown>,
  opts?: { partialWeekStartDay?: string },
): SessionAssignment[] | null {
  const vol = parseCoachSessionVolume(ob);
  const allowDoubles = ob.allowDoubleSessions !== false;

  if (ob.scheduleMode === 'custom' && ob.customWeekPlan && typeof ob.customWeekPlan === 'object') {
    const plan = computeTrainingSlotPlanFromCustom(ob.customWeekPlan as CustomWeekPlan);
    if (!plan) return null;
    let assignments = enrichAssignmentsWithDuration(
      plan.assignments,
      ob,
      ob.customWeekPlan as CustomWeekPlan,
    );
    if (opts?.partialWeekStartDay) {
      assignments = filterAssignmentsFromStartDay(assignments, opts.partialWeekStartDay);
    }
    return assignments.length ? assignments : null;
  }

  if (vol.coachDecidesStrengthSessions && vol.coachDecidesCardioSessions) return null;

  const availRaw = Array.isArray(ob.availableTrainingDays)
    ? (ob.availableTrainingDays as string[])
    : [];
  const days = filterAvailableDaysFromStart(availRaw, opts?.partialWeekStartDay);
  if (!days.length) return null;

  const style = String(ob.trainingStyle || 'strength');
  let strengthN = vol.coachDecidesStrengthSessions ? 0 : (vol.strengthSessionsPerWeek ?? 0);
  let cardioN = vol.coachDecidesCardioSessions ? 0 : (vol.cardioSessionsPerWeek ?? 0);
  if (style === 'strength') cardioN = 0;
  if (style === 'endurance') strengthN = 0;

  if (opts?.partialWeekStartDay && strengthN + cardioN > 0) {
    const capped = capVolumeForPartialWeek(strengthN, cardioN, days, allowDoubles);
    strengthN = capped.strength;
    cardioN = capped.cardio;
  }

  if (strengthN + cardioN === 0) return null;
  return distributeVolumeAssignments(days, strengthN, cardioN, allowDoubles, vol, ob);
}

export function resolveDurationForAssignment(
  a: SessionAssignment,
  ob: Record<string, unknown>,
): number | null {
  if (a.durationMin != null && Number.isFinite(a.durationMin)) return a.durationMin;
  const vol = parseCoachSessionVolume(ob);
  if (a.sessionTypeHint === 'cardio') {
    return vol.coachDecidesCardioDuration ? null : vol.cardioDurationMin;
  }
  return vol.coachDecidesStrengthDuration ? null : vol.strengthDurationMin;
}

export function formatSessionVolumeForPrompt(
  ob: Record<string, unknown>,
  slotPlan: TrainingSlotPlan | null,
  opts?: VolumePromptOptions,
): string {
  const vol = parseCoachSessionVolume(ob);
  const lines: string[] = [];
  const partial = !!opts?.partialWeekStartDay;
  const weekScope = partial
    ? `THIS partial first week (only from ${opts!.partialWeekStartDay} through Sunday — days before must be Rest)`
    : 'this calendar week';

  const ext = slotPlan as { assignments?: SessionAssignment[] } | null;
  const assignStrength = ext?.assignments?.filter((a) => a.sessionTypeHint === 'strength').length;
  const assignCardio = ext?.assignments?.filter((a) => a.sessionTypeHint === 'cardio').length;
  const strengthTarget =
    assignStrength != null && assignStrength > 0
      ? assignStrength
      : vol.strengthSessionsPerWeek;
  const cardioTarget =
    assignCardio != null && assignCardio > 0 ? assignCardio : vol.cardioSessionsPerWeek;

  if (partial && (assignStrength != null || assignCardio != null)) {
    lines.push(
      `**Partial-week note:** Athlete's full-week targets may be higher; for ${weekScope} use ONLY the counts below (do NOT schedule Mon–Tue or other days before the start day).`,
    );
  }

  if (vol.coachDecidesStrengthSessions && vol.coachDecidesCardioSessions) {
    lines.push(
      `**Session count (${weekScope}, COACH-DECIDED):** Choose strength and cardio counts on remaining available weekdays (typical 2–6 total).`,
    );
  } else {
    if (vol.coachDecidesStrengthSessions) {
      lines.push(`**Strength sessions (${weekScope}):** COACH-DECIDED.`);
    } else if (strengthTarget != null && strengthTarget > 0) {
      lines.push(
        `**Strength sessions (${weekScope}):** EXACTLY ${strengthTarget} non-rest Strength sessions — NOT Cardio.`,
      );
    }
    if (vol.coachDecidesCardioSessions) {
      lines.push(`**Cardio sessions (${weekScope}):** COACH-DECIDED.`);
    } else if (cardioTarget != null && cardioTarget > 0) {
      lines.push(
        `**Cardio sessions (${weekScope}):** EXACTLY ${cardioTarget} non-rest Cardio/Intervals sessions — NOT Strength.`,
      );
    }
  }

  if (vol.coachDecidesStrengthDuration && vol.coachDecidesCardioDuration) {
    lines.push('**Session duration:** COACH-DECIDED per session type.');
  } else {
    if (!vol.coachDecidesStrengthDuration && vol.strengthDurationMin) {
      const n = vol.strengthDurationMin;
      const ex = strengthExerciseRangeForDuration(n);
      lines.push(
        `**Strength duration:** Each Strength session MUST have estimatedDuration=${n} (minutes) and ${ex} main exercises (3–4 working sets each, plus warmupExercises/cooldownExercises). NEVER a ${n}min strength session with only 1–2 main exercises.`,
      );
    }
    if (!vol.coachDecidesCardioDuration && vol.cardioDurationMin) {
      lines.push(
        `**Cardio duration:** Each Cardio/Intervals session MUST have estimatedDuration=${vol.cardioDurationMin} and a complete cardio object (duration/distance + pace/zones).`,
      );
    }
  }

  if (ext?.assignments?.length) {
    lines.push(
      `**Do NOT swap types:** Each listed slot is fixed as strength OR cardio — match sessionType and content to the slot hint.`,
    );
    return lines.join('\n');
  }

  const total =
    strengthTarget != null && cardioTarget != null && !vol.coachDecidesStrengthSessions && !vol.coachDecidesCardioSessions
      ? (strengthTarget ?? 0) + (cardioTarget ?? 0)
      : totalWeeklySessions(vol);
  if (total != null && total > 0 && slotPlan) {
    lines.push(`**Total non-rest sessions (${weekScope}):** EXACTLY ${total}.`);
  }

  return lines.join('\n');
}

export function enrichAssignmentsWithDuration(
  assignments: SessionAssignment[],
  ob: Record<string, unknown>,
  customPlan?: CustomWeekPlan,
): SessionAssignment[] {
  const vol = parseCoachSessionVolume(ob);
  return assignments.map((a) => {
    let durationMin = a.durationMin;
    if (durationMin == null && customPlan) {
      const daySlots = customPlan[a.day] || [];
      const match = daySlots.find(
        (s) =>
          (s.sessionSlot || 'Morning') === a.sessionSlot &&
          (s.type === 'cardio' ? 'cardio' : 'strength') === a.sessionTypeHint,
      );
      if (match?.durationMin != null) durationMin = match.durationMin;
    }
    if (durationMin == null) {
      if (a.sessionTypeHint === 'cardio' && !vol.coachDecidesCardioDuration) {
        durationMin = vol.cardioDurationMin ?? undefined;
      } else if (a.sessionTypeHint === 'strength' && !vol.coachDecidesStrengthDuration) {
        durationMin = vol.strengthDurationMin ?? undefined;
      }
    }
    return durationMin != null ? { ...a, durationMin } : a;
  });
}

export function resolveTrainingSlotPlanWithVolume(
  ob: Record<string, unknown>,
  partialWeekStartDay?: string,
): (TrainingSlotPlan & { assignments?: SessionAssignment[] }) | null {
  const assignments = buildVolumeAssignmentsFromOnboarding(ob, { partialWeekStartDay });
  if (assignments?.length) {
    const days = [...new Set(assignments.map((a) => a.day))];
    const doubleDays = days.filter((d) => assignments.filter((a) => a.day === d).length >= 2);
    const avail = filterAvailableDaysFromStart(
      Array.isArray(ob.availableTrainingDays) ? (ob.availableTrainingDays as string[]) : days,
      partialWeekStartDay,
    );
    return {
      workoutDays: COACH_WEEKDAY_ORDER.filter((d) => days.includes(d)),
      doubleSessionDays: doubleDays,
      targetSessions: assignments.length,
      availableDayCount: avail.length || days.length,
      assignments,
    };
  }

  const vol = parseCoachSessionVolume(ob);
  const total = totalWeeklySessions(vol);
  if (total == null || total <= 0) return null;
  const days = filterAvailableDaysFromStart(
    Array.isArray(ob.availableTrainingDays) ? (ob.availableTrainingDays as string[]) : [],
    partialWeekStartDay,
  );
  if (!days.length) return null;
  return computeTrainingSlotPlan(days, total, ob.allowDoubleSessions !== false);
}

export function scheduleVolumeConfigValid(
  ob: Record<string, unknown>,
  trainingStyle: string,
  opts?: { durationOnly?: boolean },
): boolean {
  const vol = parseCoachSessionVolume(ob, trainingStyle);
  const needsStrength = trainingStyle === 'strength' || trainingStyle === 'hybrid';
  const needsCardio = trainingStyle === 'endurance' || trainingStyle === 'hybrid';
  const durationOnly = opts?.durationOnly === true || ob.scheduleMode === 'custom';

  if (needsStrength) {
    const okSess = vol.coachDecidesStrengthSessions || (vol.strengthSessionsPerWeek ?? 0) > 0;
    const okDur = vol.coachDecidesStrengthDuration || (vol.strengthDurationMin ?? 0) > 0;
    if (!durationOnly && !okSess) return false;
    if (!okDur) return false;
  }
  if (needsCardio) {
    const okSess = vol.coachDecidesCardioSessions || (vol.cardioSessionsPerWeek ?? 0) > 0;
    const okDur = vol.coachDecidesCardioDuration || (vol.cardioDurationMin ?? 0) > 0;
    if (!durationOnly && !okSess) return false;
    if (!okDur) return false;
  }
  return true;
}

export function customSlotDurationRequired(
  slotType: 'strength' | 'cardio',
  ob: Record<string, unknown>,
): boolean {
  const vol = parseCoachSessionVolume(ob);
  return slotType === 'strength'
    ? !vol.coachDecidesStrengthDuration
    : !vol.coachDecidesCardioDuration;
}
