/** Bei inhaltlicher Prompt-Änderung hochzählen (Golden-Tests / coach_ai_runs). */
export const COACH_PROMPT_VERSION = 'coach-v1.0.0';
export const MEAL_RECIPE_PROMPT_VERSION = 'meal-recipe-v1.0.0';

export function modelIdForAiLogging(provider: 'mistral' | 'gemini'): string {
  return provider === 'mistral' ? 'mistral-large-latest' : 'gemini-2.0-flash';
}
