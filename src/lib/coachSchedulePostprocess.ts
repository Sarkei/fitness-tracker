/**
 * Nachbearbeitung generierter Coach-Workout-Wochen (Sortierung, partielle erste Woche).
 */

import type { CoachWorkoutWeek } from './coachScheduleZod';
import { COACH_WEEKDAY_ORDER } from './coachWeekDisplay';

const DAY_ORDER_INDEX: Record<string, number> = Object.fromEntries(
  COACH_WEEKDAY_ORDER.map((d, i) => [d, i]),
);

function restDayTemplate(day: string): CoachWorkoutWeek['schedule'][number] {
  return {
    day,
    isRest: true,
    sessionType: 'Recovery',
    title: 'Rest day',
    exercises: [],
  };
}

const SESSION_SLOT_ORDER: Record<string, number> = { Morning: 0, Evening: 1 };

function sortSessionsForDay(rows: CoachWorkoutWeek['schedule'][number][]): CoachWorkoutWeek['schedule'][number][] {
  return [...rows].sort((a, b) => {
    const sa = SESSION_SLOT_ORDER[String(a.sessionSlot || 'Morning')] ?? 0;
    const sb = SESSION_SLOT_ORDER[String(b.sessionSlot || 'Morning')] ?? 0;
    return sa - sb;
  });
}

/** Montag→Sonntag; fehlende Tage als Ruhetag; mehrere Einheiten pro Tag bleiben erhalten. */
export function normalizeCoachWorkoutWeekDays(week: CoachWorkoutWeek): CoachWorkoutWeek {
  const byDay = new Map<string, CoachWorkoutWeek['schedule'][number][]>();
  for (const row of week.schedule) {
    const day = String(row.day || '').trim();
    if (!day || !(day in DAY_ORDER_INDEX)) continue;
    const list = byDay.get(day) ?? [];
    list.push(row);
    byDay.set(day, list);
  }
  const schedule: CoachWorkoutWeek['schedule'][number][] = [];
  for (const day of COACH_WEEKDAY_ORDER) {
    const rows = byDay.get(day);
    if (!rows?.length) {
      schedule.push(restDayTemplate(day));
      continue;
    }
    const active = rows.filter(r => r.isRest !== true);
    if (active.length === 0) {
      schedule.push(restDayTemplate(day));
      continue;
    }
    schedule.push(...sortSessionsForDay(active));
  }
  return { ...week, schedule };
}

/**
 * Erste Woche mit Start z. B. nächsten Montag: alle Kalendertage vor dem Starttag = Ruhe.
 */
export function applyPartialWeekRestBefore(
  week: CoachWorkoutWeek,
  firstActiveDayName: string | undefined,
): CoachWorkoutWeek {
  if (!firstActiveDayName?.trim()) return week;
  const startIdx = DAY_ORDER_INDEX[firstActiveDayName];
  if (startIdx == null || startIdx <= 0) return week;

  const schedule = week.schedule.map((row) => {
    const idx = DAY_ORDER_INDEX[String(row.day || '')];
    if (idx == null || idx >= startIdx) return row;
    if (row.isRest === true) return row;
    return {
      ...row,
      day: row.day,
      isRest: true,
      sessionType: 'Recovery',
      title: 'Rest day',
      exercises: [],
      cardio: undefined,
    };
  });

  const ac = [...(week.applied_constraints || [])];
  ac.push(`repaired:rest_before_${firstActiveDayName}`);
  return {
    ...week,
    schedule,
    applied_constraints: ac.slice(0, 8),
  };
}

export function finalizeCoachWorkoutWeek(
  week: CoachWorkoutWeek,
  opts?: { partialFirstActiveDay?: string },
): CoachWorkoutWeek {
  let out = normalizeCoachWorkoutWeekDays(week);
  if (opts?.partialFirstActiveDay) {
    out = applyPartialWeekRestBefore(out, opts.partialFirstActiveDay);
  }
  return out;
}
