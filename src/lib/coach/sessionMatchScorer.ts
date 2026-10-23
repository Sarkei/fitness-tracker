import type { Workout } from '@/src/types';
import { parseCoachSessionMeta } from './coachSessionMeta';
import type { PlannedCoachDay } from './plannedSessionMatcher';

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9äöüß\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function titlesSimilar(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(na.split(' ').filter((t) => t.length > 2));
  const tb = new Set(nb.split(' ').filter((t) => t.length > 2));
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit >= Math.min(2, Math.min(ta.size, tb.size));
}

function exerciseKeysFromWorkout(w: Workout): Set<string> {
  const keys = new Set<string>();
  for (const ex of w.exercises ?? []) {
    const k = String(ex.exerciseKey ?? ex.name ?? '')
      .toLowerCase()
      .trim();
    if (k) keys.add(k);
  }
  return keys;
}

function exerciseKeysFromPlanned(day: PlannedCoachDay): Set<string> {
  const keys = new Set<string>();
  const exs = (day as { exercises?: Array<{ exerciseKey?: string; name?: string }> }).exercises;
  if (!Array.isArray(exs)) return keys;
  for (const ex of exs) {
    const k = String(ex.exerciseKey ?? ex.name ?? '')
      .toLowerCase()
      .trim();
    if (k) keys.add(k);
  }
  return keys;
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let hit = 0;
  for (const k of a) if (b.has(k)) hit++;
  return hit / Math.max(a.size, b.size);
}

function inferSlotFromWorkout(w: Workout): string | null {
  const meta = parseCoachSessionMeta((w as { coachSessionMeta?: unknown }).coachSessionMeta);
  if (meta?.sessionSlot) return meta.sessionSlot.toLowerCase();
  const notes = String(w.notes ?? '').toLowerCase();
  if (notes.includes('morning') || notes.includes('morgen')) return 'morning';
  if (notes.includes('evening') || notes.includes('abend')) return 'evening';
  const hour = w.completedAt ? new Date(w.completedAt).getHours() : null;
  if (hour != null) {
    if (hour < 12) return 'morning';
    if (hour >= 17) return 'evening';
  }
  return null;
}

export type SessionMatchScore = {
  workout: Workout;
  score: number;
  method: 'id' | 'scored';
  reasons: string[];
};

const SCORE_THRESHOLD_MATCH = 0.5;
const SCORE_THRESHOLD_UNCERTAIN = 0.75;

export function scoreWorkoutForPlannedDay(
  day: PlannedCoachDay,
  workout: Workout,
  sessionKey: string,
  matchOverrides?: Record<string, string>,
): SessionMatchScore | null {
  if (matchOverrides?.[sessionKey] === workout.id) {
    return { workout, score: 1, method: 'id' as const, reasons: ['override'] };
  }

  const meta = parseCoachSessionMeta((workout as { coachSessionMeta?: unknown }).coachSessionMeta);
  if (meta?.sessionKey === sessionKey) {
    return { workout, score: 1, method: 'id', reasons: ['coach_session_meta'] };
  }

  const title = String(day.title ?? day.sessionType ?? 'Session');
  const plannedType = String(day.sessionType ?? 'Strength').toLowerCase();
  const wType = String(workout.type ?? '').toLowerCase();
  let score = 0;
  const reasons: string[] = [];

  if (titlesSimilar(workout.name, title)) {
    score = Math.max(score, 0.62);
    reasons.push('title');
  }

  const plannedSlot = String(day.sessionSlot ?? '').toLowerCase();
  const wSlot = inferSlotFromWorkout(workout);
  if (plannedSlot && wSlot && plannedSlot === wSlot) {
    score += 0.22;
    reasons.push('slot');
  }

  if (plannedType && wType && (plannedType === wType || plannedType.includes(wType) || wType.includes(plannedType))) {
    score += plannedType === wType ? 0.22 : 0.12;
    reasons.push('type');
  }

  const plannedMin = Number(day.estimatedDuration) || 0;
  const actualMin = Number(workout.duration) || 0;
  if (plannedMin > 0 && actualMin > 0) {
    const ratio = actualMin / plannedMin;
    if (ratio >= 0.7 && ratio <= 1.35) {
      score += 0.1;
      reasons.push('duration');
    }
  }

  const exOverlap = overlapRatio(exerciseKeysFromPlanned(day), exerciseKeysFromWorkout(workout));
  if (exOverlap > 0) {
    score += Math.min(0.28, exOverlap * 0.35);
    reasons.push('exercises');
  }

  if (score < SCORE_THRESHOLD_MATCH) return null;
  return { workout, score, method: 'scored', reasons };
}

export function pickBestWorkoutMatch(
  day: PlannedCoachDay,
  candidates: Workout[],
  sessionKey: string,
  matchOverrides?: Record<string, string>,
): { best: SessionMatchScore | null; uncertain: boolean } {
  let best: SessionMatchScore | null = null;
  let secondScore = 0;

  for (const w of candidates) {
    const scored = scoreWorkoutForPlannedDay(day, w, sessionKey, matchOverrides);
    if (!scored) continue;
    if (!best || scored.score > best.score) {
      secondScore = best?.score ?? 0;
      best = scored;
    } else if (scored.score > secondScore) {
      secondScore = scored.score;
    }
  }

  if (!best) return { best: null, uncertain: false };
  const uncertain =
    best.method === 'scored' &&
    best.score < SCORE_THRESHOLD_UNCERTAIN &&
    secondScore > 0 &&
    best.score - secondScore < 0.12;
  return { best, uncertain };
}

export { SCORE_THRESHOLD_MATCH, SCORE_THRESHOLD_UNCERTAIN };
