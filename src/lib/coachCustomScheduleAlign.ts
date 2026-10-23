import type { CoachWorkoutWeek } from './coachScheduleZod';
import { COACH_WEEKDAY_ORDER, indexCoachWeekday } from './coachWeekDisplay';
import { normalizeCoachDayName } from './coachSessionDistribution';
import type { SessionAssignment } from './coachCustomWeekPlan';

function normalizeSlot(raw: unknown): 'Morning' | 'Evening' | null {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (s === 'morning' || s === 'morgens' || s === 'am') return 'Morning';
  if (s === 'evening' || s === 'abends' || s === 'pm') return 'Evening';
  return null;
}

/** Custom-Plan: nur Einheiten ab Starttag (partielle erste Woche). */
export function filterAssignmentsFromStartDay(
  assignments: SessionAssignment[],
  startDay: string,
): SessionAssignment[] {
  const start = normalizeCoachDayName(startDay);
  if (!start) return assignments;
  const idx = indexCoachWeekday(start);
  if (idx < 0) return assignments;
  const allowed = new Set<string>(COACH_WEEKDAY_ORDER.slice(idx));
  return assignments.filter((a) => {
    const d = normalizeCoachDayName(a.day);
    return d && allowed.has(d);
  });
}

function stubForAssignment(a: SessionAssignment): CoachWorkoutWeek['schedule'][number] {
  const isCardio = a.sessionTypeHint === 'cardio';
  const dur = a.durationMin && a.durationMin > 0 ? a.durationMin : isCardio ? 45 : 60;
  return {
    day: a.day,
    sessionSlot: a.sessionSlot,
    isRest: false,
    sessionType: isCardio ? 'Cardio' : 'Strength',
    title: isCardio ? 'Cardio session' : 'Strength session',
    estimatedDuration: dur,
    exercises: isCardio ? [] : [{ name: 'Main lift', sets: 3, reps: '8-10' }, { name: 'Accessory', sets: 3, reps: '10-12' }, { name: 'Core', sets: 2, reps: '12-15' }],
    ...(isCardio ? { cardio: { duration: String(dur), details: 'Easy aerobic' } } : {}),
  };
}

function sessionTypeForHint(
  row: CoachWorkoutWeek['schedule'][number],
  hint: 'strength' | 'cardio',
): string {
  if (hint === 'cardio') {
    const st = String(row.sessionType || '').toLowerCase();
    return st.includes('interval') ? 'Intervals' : 'Cardio';
  }
  return 'Strength';
}

function pickTemplate(
  schedule: CoachWorkoutWeek['schedule'],
  day: string,
  hint: 'strength' | 'cardio',
  used: Set<number>,
): CoachWorkoutWeek['schedule'][number] | null {
  for (let i = 0; i < schedule.length; i++) {
    if (used.has(i)) continue;
    const row = schedule[i];
    if (row.isRest === true) continue;
    if (normalizeCoachDayName(String(row.day)) !== day) continue;
    used.add(i);
    return row;
  }
  for (let i = 0; i < schedule.length; i++) {
    if (used.has(i)) continue;
    const row = schedule[i];
    if (row.isRest === true) continue;
    const st = String(row.sessionType || '').toLowerCase();
    const matchCardio = hint === 'cardio' && (st.includes('cardio') || st.includes('interval'));
    const matchStr =
      hint === 'strength' &&
      (st.includes('strength') || st.includes('technique') || st.includes('cross'));
    if (matchCardio || matchStr) {
      used.add(i);
      return row;
    }
  }
  return null;
}

/**
 * Erzwingt exakt die Custom-Zuweisungen (Tag + Morning/Evening + Kraft/Cardio).
 * Behebt typisches KI-Problem: 5 statt 10 Einheiten bei Mo–Fr Doppel-Sessions.
 */
export function alignScheduleToCustomAssignments(
  week: CoachWorkoutWeek,
  assignments: SessionAssignment[],
): CoachWorkoutWeek {
  if (!assignments.length) return week;

  const used = new Set<number>();
  const aligned: CoachWorkoutWeek['schedule'] = [];

  for (const a of assignments) {
    const day = normalizeCoachDayName(a.day) || a.day;
    const slot = a.sessionSlot;
    let idx = -1;

    for (let i = 0; i < week.schedule.length; i++) {
      if (used.has(i)) continue;
      const row = week.schedule[i];
      if (row.isRest === true) continue;
      if (normalizeCoachDayName(String(row.day)) !== day) continue;
      if (normalizeSlot(row.sessionSlot) === slot) {
        idx = i;
        break;
      }
    }
    if (idx < 0) {
      for (let i = 0; i < week.schedule.length; i++) {
        if (used.has(i)) continue;
        const row = week.schedule[i];
        if (row.isRest === true) continue;
        if (normalizeCoachDayName(String(row.day)) !== day) continue;
        if (normalizeSlot(row.sessionSlot) == null) {
          idx = i;
          break;
        }
      }
    }

    if (idx >= 0) {
      used.add(idx);
      const row = week.schedule[idx];
      aligned.push({
        ...row,
        day,
        sessionSlot: slot,
        isRest: false,
        sessionType: sessionTypeForHint(row, a.sessionTypeHint),
      });
      continue;
    }

    const tpl = pickTemplate(week.schedule, day, a.sessionTypeHint, used);
    const base = tpl || stubForAssignment(a);
    aligned.push({
      ...base,
      day,
      sessionSlot: slot,
      isRest: false,
      sessionType: sessionTypeForHint(base, a.sessionTypeHint),
      exercises:
        a.sessionTypeHint === 'cardio'
          ? []
          : Array.isArray(base.exercises) && base.exercises.length
            ? base.exercises
            : [{ name: 'Main lift', sets: 3, reps: '8-10' }],
      cardio: a.sessionTypeHint === 'cardio' ? base.cardio ?? { duration: '30', details: 'Easy aerobic' } : undefined,
    });
  }

  const ac = [...(week.applied_constraints || [])];
  const before = week.schedule.filter((d) => d.isRest !== true).length;
  if (before !== aligned.length) {
    ac.push(`repaired:aligned_custom_assignments=${before}->${aligned.length}`);
  }

  return { ...week, schedule: aligned, applied_constraints: ac.slice(0, 8) };
}
