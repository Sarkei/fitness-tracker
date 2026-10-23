import type { Workout } from '@/src/types';
import { buildCoachWeekDateMap } from '../coachWeekDisplay';
import { buildPlannedSessionKey } from './coachSessionMeta';
import { pickBestWorkoutMatch, scoreWorkoutForPlannedDay } from './sessionMatchScorer';

export type PlannedCoachDay = {
  day?: string;
  isRest?: boolean;
  sessionType?: string;
  title?: string;
  sessionSlot?: string;
  estimatedDuration?: number;
  exercises?: Array<{ exerciseKey?: string; name?: string }>;
};

type PlannedSlot = {
  day: PlannedCoachDay;
  dayName: string;
  plannedDate: string;
  title: string;
  sessionType: string;
  sessionKey: string;
};

export function matchWorkoutsToPlannedSessions(
  scheduleDays: PlannedCoachDay[],
  startYmd: string,
  workouts: Workout[],
  options?: { matchOverrides?: Record<string, string> },
): import('./coachTypes').SessionAdherenceRow[] {
  const dateMap = buildCoachWeekDateMap(startYmd);
  const byDate = new Map<string, Workout[]>();
  for (const w of workouts) {
    const d = String(w.date).slice(0, 10);
    const list = byDate.get(d) ?? [];
    list.push(w);
    byDate.set(d, list);
  }

  const usedWorkoutIds = new Set<string>();
  const rows: import('./coachTypes').SessionAdherenceRow[] = [];
  const overrides = options?.matchOverrides;

  const slots: PlannedSlot[] = [];
  for (const day of scheduleDays) {
    if (day.isRest === true) continue;
    const dayName = String(day.day ?? '');
    slots.push({
      day,
      dayName,
      plannedDate: dateMap[dayName] ?? '',
      title: String(day.title ?? day.sessionType ?? 'Session'),
      sessionType: String(day.sessionType ?? 'Strength'),
      sessionKey: buildPlannedSessionKey(dayName, String(day.title ?? day.sessionType ?? 'Session'), day.sessionSlot),
    });
  }

  const slotsByDate = new Map<string, PlannedSlot[]>();
  for (const slot of slots) {
    const list = slotsByDate.get(slot.plannedDate) ?? [];
    list.push(slot);
    slotsByDate.set(slot.plannedDate, list);
  }

  type Assignment = { slot: PlannedSlot; workout: Workout; score: number; uncertain: boolean; method: 'id' | 'scored' | 'override' };
  const assignments: Assignment[] = [];

  for (const [plannedDate, daySlots] of slotsByDate) {
    const candidates = (byDate.get(plannedDate) ?? []).filter((w) => !usedWorkoutIds.has(w.id));
    if (daySlots.length <= 1) {
      const slot = daySlots[0];
      if (!slot) continue;
      const { best, uncertain } = pickBestWorkoutMatch(slot.day, candidates, slot.sessionKey, overrides);
      if (best) {
        assignments.push({
          slot,
          workout: best.workout,
          score: best.score,
          uncertain,
          method: best.reasons.includes('override') ? 'override' : best.method,
        });
      } else {
        rows.push({
          plannedDay: slot.dayName,
          plannedDate: slot.plannedDate,
          title: slot.title,
          sessionType: slot.sessionType,
          sessionKey: slot.sessionKey,
          status: 'missed',
        });
      }
      continue;
    }

    const pairs: Array<{ slot: PlannedSlot; workout: Workout; score: number; uncertain: boolean; method: 'id' | 'scored' | 'override' }> = [];
    for (const slot of daySlots) {
      for (const w of candidates) {
        const scored = scoreWorkoutForPlannedDay(slot.day, w, slot.sessionKey, overrides);
        if (!scored) continue;
        const { best: _b, uncertain } = pickBestWorkoutMatch(slot.day, [w], slot.sessionKey, overrides);
        pairs.push({
          slot,
          workout: w,
          score: scored.score,
          uncertain: uncertain && scored.method === 'scored',
          method: scored.reasons.includes('override') ? 'override' : scored.method,
        });
      }
    }
    pairs.sort((a, b) => b.score - a.score);
    const assignedSlots = new Set<string>();
    const assignedWorkouts = new Set<string>();
    for (const p of pairs) {
      if (assignedSlots.has(p.slot.sessionKey) || assignedWorkouts.has(p.workout.id)) continue;
      assignments.push(p);
      assignedSlots.add(p.slot.sessionKey);
      assignedWorkouts.add(p.workout.id);
    }
    for (const slot of daySlots) {
      if (!assignedSlots.has(slot.sessionKey)) {
        rows.push({
          plannedDay: slot.dayName,
          plannedDate: slot.plannedDate,
          title: slot.title,
          sessionType: slot.sessionType,
          sessionKey: slot.sessionKey,
          status: 'missed',
        });
      }
    }
  }

  for (const a of assignments) {
    usedWorkoutIds.add(a.workout.id);
    const plannedMin = Number(a.slot.day.estimatedDuration) || 0;
    const actualMin = Number(a.workout.duration) || 0;
    const partial = plannedMin > 0 && actualMin > 0 && actualMin < plannedMin * 0.55;
    rows.push({
      plannedDay: a.slot.dayName,
      plannedDate: a.slot.plannedDate,
      title: a.slot.title,
      sessionType: a.slot.sessionType,
      sessionKey: a.slot.sessionKey,
      status: partial ? 'partial' : 'completed',
      matchedWorkoutId: a.workout.id,
      matchedWorkoutName: a.workout.name,
      matchedDurationMin: actualMin,
      matchScore: Math.round(a.score * 100) / 100,
      matchMethod: a.method,
      matchUncertain: a.uncertain,
    });
  }

  for (const w of workouts) {
    if (usedWorkoutIds.has(w.id)) continue;
    rows.push({
      plannedDay: '',
      plannedDate: String(w.date).slice(0, 10),
      title: w.name,
      sessionType: w.type,
      sessionKey: '',
      status: 'extra',
      matchedWorkoutId: w.id,
      matchedWorkoutName: w.name,
      matchedDurationMin: w.duration,
    });
  }

  return rows;
}
