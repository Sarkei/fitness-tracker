import { addDays, format, startOfWeek, subWeeks } from 'date-fns';
import { de as dfDe, enUS as dfEnUS } from 'date-fns/locale';

/** Abgeschlossene Kalenderwoche `weeksAgo` Wochen vor der letzten abgeschlossenen (0 = letzte). */
export function getCompletedWeekRangeAtOffset(
  weeksAgo = 0,
  refDate = new Date(),
): {
  weekStart: Date;
  weekEnd: Date;
  weekStartYmd: string;
  weekEndYmd: string;
  weekKey: string;
} {
  const currentWeekStart = startOfWeek(refDate, { weekStartsOn: 1 });
  const weekStart = subWeeks(currentWeekStart, 1 + weeksAgo);
  const weekEnd = addDays(weekStart, 6);
  const weekStartYmd = format(weekStart, 'yyyy-MM-dd');
  const weekEndYmd = format(weekEnd, 'yyyy-MM-dd');
  return {
    weekStart,
    weekEnd,
    weekStartYmd,
    weekEndYmd,
    weekKey: weekStartYmd,
  };
}

/** Abgeschlossene Kalenderwoche (Mo–So) direkt vor der aktuellen Woche. */
export function getLastCompletedWeekRange(refDate = new Date()): {
  weekStart: Date;
  weekEnd: Date;
  weekStartYmd: string;
  weekEndYmd: string;
  weekKey: string;
} {
  return getCompletedWeekRangeAtOffset(0, refDate);
}

export function formatWeekLabel(
  weekStartYmd: string,
  weekEndYmd: string,
  locale: 'de' | 'en' = 'de',
): string {
  const loc = locale === 'de' ? dfDe : dfEnUS;
  const start = new Date(`${weekStartYmd}T12:00:00`);
  const end = new Date(`${weekEndYmd}T12:00:00`);
  return `${format(start, 'd. MMM', { locale: loc })} – ${format(end, 'd. MMM yyyy', { locale: loc })}`;
}

/** Bericht erst erzeugen, wenn die abgeschlossene Woche vorbei ist (wir sind in einer neuen KW). */
export function canGenerateLastWeekReport(refDate = new Date()): boolean {
  const { weekEnd } = getLastCompletedWeekRange(refDate);
  const endOfLastWeek = new Date(`${format(weekEnd, 'yyyy-MM-dd')}T23:59:59`);
  return refDate.getTime() > endOfLastWeek.getTime();
}
