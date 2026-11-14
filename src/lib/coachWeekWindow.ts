/**
 * COACH-LEVEL: Eine Coach-Woche ist immer [start_date .. start_date+6] inkl. (lokales Kalenderdatum).
 * Report- und Log-Auswertung müssen sich an coach_weekly_schedules.start_date orientieren.
 */

export function toLocalYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseLocalYmd(ymd: string): Date {
  const base = (ymd || '').split('T')[0];
  const [y, m, d] = base.split('-').map((x) => parseInt(x, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    throw new Error(`Invalid date: ${ymd}`);
  }
  return new Date(y, m - 1, d);
}

/** Inklusives Ende der 7-Tage-Woche (6 Tage nach Start). */
export function coachWeekInclusiveEnd(startYmd: string): string {
  const start = parseLocalYmd(startYmd);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return toLocalYmd(end);
}

export function addDaysYmd(startYmd: string, days: number): string {
  const d = parseLocalYmd(startYmd);
  d.setDate(d.getDate() + days);
  return toLocalYmd(d);
}

/** Montag 00:00 der Kalenderwoche, die `ref` enthält (Woche beginnt Montag). */
export function calendarWeekMonday(ref: Date = new Date()): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Liegt `ref` (Kalendertag) in der Coach-Woche [start_date .. start_date+6]? */
export function dateInCoachWeek(startYmd: string, ref: Date = new Date()): boolean {
  try {
    const start = parseLocalYmd(startYmd);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const r = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
    return r >= start && r <= end;
  } catch {
    return false;
  }
}

/**
 * Montag der anzuzeigenden Woche: Kalenderwoche von heute, außer heute liegt noch
 * in der aktuellen Coach-Woche – dann deren start_date (Montag).
 */
export function weekMondayForWorkoutView(
  coachStartYmd: string | undefined | null,
  ref: Date = new Date(),
): Date {
  if (coachStartYmd && dateInCoachWeek(coachStartYmd, ref)) {
    return calendarWeekMonday(parseLocalYmd(coachStartYmd));
  }
  return calendarWeekMonday(ref);
}
