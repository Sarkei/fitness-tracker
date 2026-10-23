/**
 * Anzeige-Helfer: Coach-Woche immer Montag → Sonntag, lokale Datumsstrings.
 */

import { addDaysYmd, coachWeekInclusiveEnd, dateInCoachWeek, parseLocalYmd, toLocalYmd } from './coachWeekWindow';

export const COACH_WEEKDAY_ORDER = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export function indexCoachWeekday(day: string): number {
  return (COACH_WEEKDAY_ORDER as readonly string[]).indexOf(day);
}

const DAY_SORT_INDEX: Record<string, number> = Object.fromEntries(
  COACH_WEEKDAY_ORDER.map((d, i) => [d, i]),
);

export function sortCoachDaysMonSun<T extends { day?: string }>(days: T[]): T[] {
  return [...days].sort(
    (a, b) => (DAY_SORT_INDEX[String(a.day || '')] ?? 99) - (DAY_SORT_INDEX[String(b.day || '')] ?? 99),
  );
}

export function todayLocalYmd(ref: Date = new Date()): string {
  return toLocalYmd(ref);
}

/** Map Englischer Wochentag → ISO-Datum (start_date = Montag der Coach-Woche). */
export function buildCoachWeekDateMap(startYmd: string | undefined | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!startYmd?.trim()) return out;
  try {
    for (let i = 0; i < COACH_WEEKDAY_ORDER.length; i++) {
      out[COACH_WEEKDAY_ORDER[i]] = addDaysYmd(startYmd, i);
    }
  } catch {
    /* ignore */
  }
  return out;
}

export function formatCoachDayDateShort(ymd: string, locale = 'de-DE'): string {
  try {
    const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
  } catch {
    return ymd;
  }
}

export function formatCoachWeekRange(
  startYmd: string | undefined | null,
  locale = 'de-DE',
): string | null {
  if (!startYmd?.trim()) return null;
  try {
    const end = coachWeekInclusiveEnd(startYmd);
    const s = formatCoachDayDateShort(startYmd, locale);
    const e = formatCoachDayDateShort(end, locale);
    return `${s} – ${e}`;
  } catch {
    return null;
  }
}

export function isCoachWeekActiveToday(startYmd: string | undefined | null, ref: Date = new Date()): boolean {
  if (!startYmd?.trim()) return false;
  return dateInCoachWeek(startYmd, ref);
}

export function parseCoachStartYmd(startDate: unknown): string | null {
  if (startDate == null || startDate === '') return null;
  const s = String(startDate).split('T')[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Kalenderdatum eines Coach-Wochentags (start_date = Montag der Coach-Woche). */
export function coachDateForScheduleDay(startYmd: string, dayName: string): Date | null {
  const ymd = buildCoachWeekDateMap(startYmd)[dayName];
  if (!ymd) return null;
  try {
    return parseLocalYmd(ymd);
  } catch {
    return null;
  }
}

/** Coach-Zeilen nur wenn Kalendertag in [start_date … start_date+6] liegt. */
export function coachScheduleRowsForCalendarDate<T extends { day?: string }>(
  startYmd: string | null | undefined,
  date: Date,
  schedule: T[] | undefined | null,
): T[] {
  if (!startYmd?.trim() || !schedule?.length) return [];
  if (!dateInCoachWeek(startYmd, date)) return [];
  const ymd = toLocalYmd(date);
  const dateMap = buildCoachWeekDateMap(startYmd);
  return schedule.filter((row) => dateMap[String(row.day || '')] === ymd);
}

export type CoachScheduleRowLike = {
  isRest?: boolean;
  sessionType?: string;
  title?: string;
  exercises?: unknown[];
};

const REST_DAY_TITLE = /^rest\s*day?$/i;

/** Zählt eine echte Trainingseinheit (kein Ruhe-/Recovery-Tag ohne Übungen). */
export function isCoachTrainingSessionRow(row: CoachScheduleRowLike): boolean {
  if (row.isRest === true) return false;
  const sessionType = String(row.sessionType || '').trim().toLowerCase();
  if (sessionType === 'recovery') {
    const hasExercises = Array.isArray(row.exercises) && row.exercises.length > 0;
    if (!hasExercises) return false;
  }
  const title = String(row.title || '').trim();
  if (REST_DAY_TITLE.test(title)) return false;
  if (/\bruhetag\b|freier tag/i.test(title)) {
    const hasExercises = Array.isArray(row.exercises) && row.exercises.length > 0;
    if (!hasExercises) return false;
  }
  return true;
}

export function countCoachWeekTrainingSessions(
  schedule: CoachScheduleRowLike[] | undefined | null,
): number {
  if (!Array.isArray(schedule)) return 0;
  return schedule.filter(isCoachTrainingSessionRow).length;
}

export function configuredCoachSessionsPerWeek(onboardingData: unknown): number | null {
  if (onboardingData == null || typeof onboardingData !== 'object') return null;
  const td = (onboardingData as Record<string, unknown>).trainingDays;
  const n =
    typeof td === 'number' && Number.isFinite(td) ? Math.floor(td) : parseInt(String(td ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Anzeige „X Einheiten diese Woche“: Ziel aus Onboarding (trainingDays),
 * sonst gezählte Sessions im Schedule.
 */
export function coachWeeklySessionCountForDisplay(
  schedule: CoachScheduleRowLike[] | undefined | null,
  onboardingData: unknown,
): number {
  const counted = countCoachWeekTrainingSessions(schedule);
  if (counted > 0) return counted;
  const configured = configuredCoachSessionsPerWeek(onboardingData);
  if (configured != null) return configured;
  return 0;
}

/** Kalenderwochen seit Plan-Start (1-basiert), anhand der ersten gespeicherten Woche. */
export function coachCalendarWeeksSinceStart(
  firstWeekStartYmd: string | undefined | null,
  ref: Date = new Date(),
): number {
  if (!firstWeekStartYmd?.trim()) return 1;
  try {
    const start = parseLocalYmd(firstWeekStartYmd);
    const r = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    const diffMs = r.getTime() - start.getTime();
    if (diffMs < 0) return 1;
    return Math.max(1, Math.floor(diffMs / (7 * 86400000)) + 1);
  } catch {
    return 1;
  }
}
