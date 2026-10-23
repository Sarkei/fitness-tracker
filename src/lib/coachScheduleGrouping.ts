import { COACH_WEEKDAY_ORDER } from './coachWeekDisplay';
import { coachRowHasExercises } from './coachTemplateMappers';

export type CoachSessionKind = 'strength' | 'cardio' | 'hybrid' | 'other';

/** Nur zwei Farben in der Wochenübersicht: Kraft oder Cardio. */
export type CoachDisplayKind = 'strength' | 'cardio';

export function coachSessionDisplayKind(row: Record<string, unknown>): CoachDisplayKind {
  const kind = coachSessionKind(row);
  if (kind === 'cardio') return 'cardio';
  const hasStrengthWork = coachRowHasExercises(row);
  if (hasStrengthWork) return 'strength';
  if (row.cardio && typeof row.cardio === 'object') return 'cardio';
  const st = String(row.sessionType || '').toLowerCase();
  if (/cardio|interval|run|ride|bike|swim|row|aerobic|tempo|endurance|hiit/.test(st)) return 'cardio';
  return 'strength';
}

export function coachDisplayCardClasses(kind: CoachDisplayKind): string {
  if (kind === 'cardio') return 'border-cyan-500/50 bg-cyan-500/10';
  return 'border-violet-500/50 bg-violet-500/10';
}

export function coachSessionKind(row: { sessionType?: string; title?: string }): CoachSessionKind {
  const st = String(row.sessionType || '').toLowerCase();
  const title = String(row.title || '').toLowerCase();
  const hay = `${st} ${title}`;
  const cardio = /\b(cardio|interval|run|ride|bike|swim|row|aerobic|tempo|endurance|hiit|z2|zone)\b/.test(hay);
  const strength = /\b(strength|lift|gym|hypertrophy|technique|cross)\b/.test(hay);
  if (st.includes('hybrid') || (cardio && strength)) return 'hybrid';
  if (cardio || st.includes('interval')) return 'cardio';
  if (strength) return 'strength';
  return 'other';
}

export function coachSessionCardClasses(kind: CoachSessionKind): string {
  if (kind === 'cardio') return 'border-cyan-500/45 bg-cyan-500/10';
  if (kind === 'strength') return 'border-violet-500/45 bg-violet-500/10';
  if (kind === 'hybrid') return 'border-teal-500/45 bg-teal-500/10';
  return 'border-[var(--border-muted)] bg-[var(--background)]';
}

export function coachSessionExpandKey(
  day: string,
  session: Record<string, unknown>,
  index: number,
): string {
  return `${day}::${String(session.sessionSlot || 'slot')}::${index}`;
}

const SLOT_ORDER: Record<string, number> = { Morning: 0, Evening: 1, Afternoon: 2 };

/** Morgens vor Abends; Ruhe zuletzt. */
export function sortCoachSessionsBySlot<T extends { sessionSlot?: string; isRest?: boolean }>(
  sessions: T[],
): T[] {
  return [...sessions].sort((a, b) => {
    const ra = a.isRest ? 9 : SLOT_ORDER[String(a.sessionSlot || 'Morning')] ?? 1;
    const rb = b.isRest ? 9 : SLOT_ORDER[String(b.sessionSlot || 'Morning')] ?? 1;
    return ra - rb;
  });
}

export type CoachDayScheduleGroup<T extends { day?: string; isRest?: boolean }> = {
  day: string;
  sessions: T[];
};

/** Mehrere Einheiten pro Wochentag → eine Tages-Gruppe. */
export function groupCoachScheduleByWeekday<T extends { day?: string; isRest?: boolean }>(
  rows: T[],
): CoachDayScheduleGroup<T>[] {
  const byDay = new Map<string, T[]>();
  for (const row of rows) {
    const day = String(row.day || '').trim();
    if (!day) continue;
    const list = byDay.get(day) ?? [];
    list.push(row);
    byDay.set(day, list);
  }
  return COACH_WEEKDAY_ORDER.filter((d) => byDay.has(d)).map((day) => ({
    day,
    sessions: sortCoachSessionsBySlot(byDay.get(day)!),
  }));
}

export function coachDayGroupIsRest(sessions: { isRest?: boolean }[]): boolean {
  const active = sessions.filter((s) => s.isRest !== true);
  return active.length === 0;
}

export function coachDayGroupTrainingSessions<T extends { isRest?: boolean }>(sessions: T[]): T[] {
  return sessions.filter((s) => s.isRest !== true);
}
