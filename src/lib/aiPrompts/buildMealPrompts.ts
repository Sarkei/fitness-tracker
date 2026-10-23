/**
 * Ernährungs-KI-Prompts — je Szenario eine Markdown-Datei in prompts/nutrition/.
 * Mahlzeit-Parse/Resolve: prompts/nutrition/meal-parse-*.md via buildMealParsePrompts.ts
 */

import { FOOD_CATEGORY_LIST } from '../mealAiShared';
import { loadPrompt } from './loadPrompt';

function normalizeUserText(raw: string): string {
  return raw.trim().replace(/\r?\n+/g, ' ');
}

export function buildSuggestCustomFoodDraftPrompt(userQuery: string): string {
  return loadPrompt('nutrition', 'suggest-custom-food-draft', {
    userQuery: normalizeUserText(userQuery),
    foodCategories: FOOD_CATEGORY_LIST.join(', '),
  });
}

export function buildDailyNutritionReviewPrompt(locale: 'de' | 'en', vars: Record<string, string>): string {
  const name = locale === 'en' ? 'daily-nutrition-review-en' : 'daily-nutrition-review-de';
  return loadPrompt('nutrition', name, vars);
}

export function buildMealRecipeDraftPrompt(idea: string, allergies: string, yieldsPortions: number): string {
  return loadPrompt('nutrition', 'meal-recipe-draft', {
    idea: idea.trim(),
    allergies: allergies.trim() || 'none',
    yieldsPortions: String(yieldsPortions > 0 ? yieldsPortions : 4),
  });
}

export function buildMealRecipeRefinePrompt(userRefinement: string, currentJson: string): string {
  return loadPrompt('nutrition', 'meal-recipe-refine', {
    userRefinement: userRefinement.trim(),
    currentJson,
  });
}
