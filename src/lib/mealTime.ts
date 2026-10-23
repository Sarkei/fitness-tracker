import type { MealCategory } from '@/src/types';

/** Mahlzeit-Slot passend zur aktuellen Uhrzeit (lokale Zeit). */
export function getMealTypeForCurrentTime(at: Date = new Date()): MealCategory {
  const hour = at.getHours();
  if (hour >= 5 && hour < 10) return 'breakfast';
  if (hour >= 10 && hour < 14) return 'lunch';
  if (hour >= 14 && hour < 18) return 'snack';
  return 'dinner';
}
