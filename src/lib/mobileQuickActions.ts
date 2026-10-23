import type { MealCategory } from '@/src/types';
import { getMealTypeForCurrentTime } from '@/src/lib/mealTime';

export type NutritionQuickMode = 'manual' | 'barcode' | 'ai-camera' | 'ai-upload' | 'ai-text';

export type QuickAction =
  | { type: 'nutrition'; mode: NutritionQuickMode; category: MealCategory }
  | { type: 'weight' }
  | { type: 'water'; deltaMl: number }
  | { type: 'steps' }
  | { type: 'sleep' }
  | { type: 'workout-log' };

type Listener = (action: QuickAction) => void;
const listeners = new Set<Listener>();

export function emitQuickAction(action: QuickAction): void {
  for (const fn of listeners) fn(action);
}

export function onQuickAction(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Nutrition-Aktion mit Mahlzeit-Slot zum Klickzeitpunkt. */
export function emitNutritionQuick(mode: NutritionQuickMode): void {
  emitQuickAction({ type: 'nutrition', mode, category: getMealTypeForCurrentTime() });
}
