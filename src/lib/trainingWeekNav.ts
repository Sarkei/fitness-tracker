/**
 * Wochen-Navigation für die Trainingsseite: erlaubt das Vor- und Zurückblättern
 * über Kalenderwochen (Mo–So), damit man auch sieht, was nächste Woche ansteht.
 *
 * Reine Funktionen, unabhängig von React — mit Selbsttest in
 * `scripts/training-week-nav-selftest.ts`.
 */

/** Montag der Kalenderwoche, in der `date` liegt (lokale Zeit, 00:00). */
export function mondayOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = (d.getDay() + 6) % 7; // Montag = 0, Sonntag = 6
  d.setDate(d.getDate() - weekday);
  return d;
}

/** Wochen um `offset` verschieben (0 = diese Woche, 1 = nächste Woche, -1 = letzte). */
export function shiftWeek(weekStart: Date, offset: number): Date {
  const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
  d.setDate(d.getDate() + offset * 7);
  return d;
}

/** Sonntag der Woche (Montag + 6 Tage). */
export function sundayOfWeek(weekStart: Date): Date {
  return new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
}

/** ISO-Kalenderwoche (1–53) für ein Datum. */
export function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Sonntag = 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/** "16.11. – 22.11." für die Kopfzeile des Wochenstreifens. */
export function weekRangeLabel(weekStart: Date, locale: 'de' | 'en' = 'de'): string {
  const end = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
  const fmt = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
  return `${fmt(weekStart)} – ${fmt(end)}`;
}

/** Beschriftung relativ zur aktuellen Woche. */
export function weekRelationLabel(weekStart: Date, now: Date = new Date(), locale: 'de' | 'en' = 'de'): string {
  const current = mondayOfWeek(now);
  const diffDays = Math.round((weekStart.getTime() - current.getTime()) / 86400000);
  const weeks = Math.round(diffDays / 7);
  if (weeks === 0) return locale === 'de' ? 'Diese Woche' : 'This week';
  if (weeks === 1) return locale === 'de' ? 'Nächste Woche' : 'Next week';
  if (weeks === -1) return locale === 'de' ? 'Letzte Woche' : 'Last week';
  return weeks > 0
    ? locale === 'de'
      ? `In ${weeks} Wochen`
      : `In ${weeks} weeks`
    : locale === 'de'
      ? `Vor ${Math.abs(weeks)} Wochen`
      : `${Math.abs(weeks)} weeks ago`;
}

/** Die sieben Tage der Woche als Datum, Montag zuerst. */
export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
    d.setDate(d.getDate() + i);
    return d;
  });
}

/**
 * Erlaubte Blätterweite: nicht beliebig weit in die Vergangenheit (Standard 8 Wochen
 * zurück), vorausschauen bis zu `maxFuture` Wochen (Standard 8).
 */
export function clampWeekOffset(
  offset: number,
  { maxPast = 8, maxFuture = 8 }: { maxPast?: number; maxFuture?: number } = {},
): number {
  if (!Number.isFinite(offset)) return 0;
  const rounded = Math.trunc(offset);
  return Math.max(-maxPast, Math.min(maxFuture, rounded));
}
