/** Phasen des AI-Nutrition-Logs (Text-Pfad). */
export type MealAnalyzePhase =
  | 'interpret'
  | 'off_search'
  | 'match'
  | 'alternatives'
  | 'finalize';

export const MEAL_ANALYZE_PHASES_TEXT: MealAnalyzePhase[] = [
  'interpret',
  'off_search',
  'match',
  'alternatives',
  'finalize',
];

export const MEAL_ANALYZE_PHASE_PROGRESS: Record<MealAnalyzePhase, number> = {
  interpret: 20,
  off_search: 45,
  match: 72,
  alternatives: 88,
  finalize: 100,
};

export type MealAnalyzeStreamEvent =
  | { type: 'progress'; phase: MealAnalyzePhase; progress: number }
  | { type: 'result'; payload: Record<string, unknown> }
  | { type: 'error'; message: string };
